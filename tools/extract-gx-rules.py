#!/usr/bin/env python3
"""
extract-gx-rules.py — turn a Nokia GX BOM Configurator workbook into JSON.

    python3 tools/extract-gx-rules.py "GX BOM Configurator V3.0.xlsm" \
            -o assets/gx-rules.json

Why this exists
---------------
The configurator keeps its entire rule set in ~180 *named Excel tables* rather
than in VBA: which sleds are legal in which slot, what a chassis kit drags in,
PEM counts per power option, licence PNs per release, client pluggable lists,
IBW licences, and the PN master with prices and lifecycle.

That means the rules can be re-extracted from each quarterly release instead of
being maintained by hand — which is the only way a downstream tool stays correct
as Nokia ships V3.1, V4.0 and so on.

Design rules
------------
* Discovery-driven. Chassis families, sled names and table names are found by
  pattern, never hard-coded, so a new chassis appears on its own.
* Lossless where it is cheap. Unknown tables are still captured under `raw` so
  nothing is silently dropped.
* No interpretation. This reads; it does not decide. Conflicts between sources
  are the consumer's problem, not the extractor's.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl is required:  pip install openpyxl --break-system-packages")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
NA = {"", "NA", "N/A", "NONE", "-"}


def clean(v):
    """Excel cell -> python scalar, with Nokia's placeholder spellings removed."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    if s.upper() in NA:
        return None
    return s


def num(v):
    if isinstance(v, (int, float)):
        return v
    if v is None:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m and "." in m.group() else (int(m.group()) if m else None)


def pons(v):
    """'GS-BP-G31-9.1.0;GS-BASIC-PKG-G30' -> ['GS-BP-G31-9.1.0', 'GS-BASIC-PKG-G30']"""
    if not v:
        return []
    return [p.strip() for p in str(v).replace(",", ";").split(";") if p.strip() and p.strip().upper() not in NA]


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "_", str(s)).strip("_")


class Book:
    """Reads the workbook's named tables by name, regardless of which sheet holds them."""

    def __init__(self, path: Path):
        self.path = path
        self.wb = openpyxl.load_workbook(path, data_only=True)
        self.tables: dict[str, tuple[str, str]] = {}
        for ws in self.wb.worksheets:
            for name, t in getattr(ws, "tables", {}).items():
                self.tables[name] = (ws.title, t.ref if hasattr(t, "ref") else t)

    def grid(self, name):
        if name not in self.tables:
            return None
        title, ref = self.tables[name]
        ws = self.wb[title]
        return [[c.value for c in row] for row in ws[ref]]

    def rows(self, name, drop_empty=True):
        """[{header: value}] with Nokia placeholders normalised to None."""
        g = self.grid(name)
        if not g:
            return []
        hdr = [clean(h) or f"col{i}" for i, h in enumerate(g[0])]
        out = []
        for r in g[1:]:
            rec = {hdr[i]: clean(v) for i, v in enumerate(r) if i < len(hdr)}
            if drop_empty and not any(v is not None for v in rec.values()):
                continue
            out.append(rec)
        return out

    def find(self, pattern):
        rx = re.compile(pattern)
        return sorted(n for n in self.tables if rx.search(n))

    def col(self, name, *candidates):
        """First matching column name in a table, tolerant of Nokia's renames."""
        g = self.grid(name)
        if not g:
            return None
        hdr = [clean(h) or "" for h in g[0]]
        for cand in candidates:
            for h in hdr:
                if h and cand.lower() in h.lower():
                    return h
        return None


# --------------------------------------------------------------------------- #
# section extractors
# --------------------------------------------------------------------------- #
def meta(bk: Book):
    out = {
        "source_file": bk.path.name,
        "extracted_utc": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "extractor_version": "1.0",
        "tables_seen": len(bk.tables),
    }
    # RELEASE NOTES sheet: last version row and the known-limitations block
    for sheet in ("RELEASE NOTES", "RELEASE_NOTES"):
        if sheet in bk.wb.sheetnames:
            ws = bk.wb[sheet]
            vers, limits = [], []
            for r in ws.iter_rows(values_only=True):
                cells = [clean(c) for c in r]
                cells = [c for c in cells if c is not None]
                if not cells:
                    continue
                if not re.fullmatch(r"[Vv]?\d+(\.\d+)*", str(cells[0])):
                    continue
                second = cells[1] if len(cells) > 1 else None
                # Both blocks open with a version string. The release-history rows
                # carry a date in column 2; the known-limitations rows carry an
                # integer id. That is what separates them.
                if isinstance(second, int) and len(cells) > 2:
                    limits.append({"version": str(cells[0]), "id": second, "text": str(cells[2])})
                elif hasattr(second, "isoformat") or second is None:
                    vers.append({
                        "version": str(cells[0]),
                        "date": second.isoformat()[:10] if hasattr(second, "isoformat") else None,
                        "notes": clean(cells[2]) if len(cells) > 2 else None,
                    })
            if vers:
                out["tool_version"] = vers[-1]["version"]
                out["tool_release_date"] = vers[-1]["date"]
                out["version_history"] = vers
            if limits:
                out["known_limitations"] = limits
            break
    return out


def sled_grid(bk: Book):
    """Sled-slot geometry from the AUX blocks, which are plain ranges not tables.

    Two blocks describe chassis geometry and they do not always agree:
      * CHASSIS_TYPES_LIST — the UI grid, whose column count can include
        non-sled positions (G32 reads 5 there).
      * the AUX 'CHASSIS TYPE / SLED POSITION' block — the *service* slot count
        used for card placement (G32 reads 4 per row, 8 total).
    Both are captured; `conflicts` flags the gaps and the consumer decides.
    """
    out = {}
    if "AUX" not in bk.wb.sheetnames:
        return out
    ws = bk.wb["AUX"]
    rows = [[clean(c) for c in r] for r in ws.iter_rows(max_col=16, values_only=True)]

    def read_block(i, hdr_row, wanted):
        """Read a header-keyed block downward until the name column goes blank."""
        idx = {str(c).upper(): j for j, c in enumerate(hdr_row) if c is not None}
        name_col = min(j for j, c in enumerate(hdr_row) if c is not None)
        for rr in rows[i + 1:]:
            name = clean(rr[name_col]) if name_col < len(rr) else None
            if not name:
                break
            rec = out.setdefault(name, {})
            for header, key in wanted.items():
                j = idx.get(header)
                if j is not None and j < len(rr):
                    v = num(rr[j])
                    if v is not None:
                        rec[key] = v

    for i, r in enumerate(rows):
        heads = [str(c).upper() for c in r if c is not None]
        if not heads:
            continue
        if "NROWS" in heads:
            read_block(i, r, {"NROWS": "sledRows",
                              "SLED SLOTS PER ROW": "sledSlotsPerRow",
                              "CHASSIS HEIGTH": "chassisHeight"})
        if "NSLOTS" in heads:
            read_block(i, r, {"NSLOTS": "sledSlots", "SLOT SIZE": "slotSize"})

    for rec in out.values():
        if rec.get("sledRows") and rec.get("sledSlotsPerRow"):
            rec["sledSlotsDerived"] = rec["sledRows"] * rec["sledSlotsPerRow"]
    return out


def chassis(bk: Book):
    """Chassis geometry + the kit variants, each pointing at its own adder tables."""
    out = {}
    for r in bk.rows("CHASSIS_TYPES_LIST"):
        name = r.get("CHASSIS TYPES")
        if not name:
            continue
        rows_, per = num(r.get("NUMBER ROWS")), num(r.get("NUMBER SLOTS ROW"))
        entry = {
            "name": name,
            "rows": rows_,
            "slotsPerRow": per,
            "slots": (rows_ * per) if (rows_ and per) else None,
            "ru": num(r.get("RUs")),
            "startSlot": num(r.get("START SLED SLOT NUMBER")),
            "nmsLicence": (r.get("NMS LICENSE") or "").lower() == "yes",
            "encryptionPon": r.get("ENCRYPTION PON"),
            "variantsTable": r.get("CHASSIS VARIANTS LISTS"),
            "variants": [],
        }
        vt = entry.pop("variantsTable", None)
        if vt and vt in bk.tables:
            kit_col = bk.col(vt, "CHASSIS OPTIONS", "OPTIONS")
            for v in bk.rows(vt):
                kit = v.get(kit_col) if kit_col else None
                if not kit:
                    continue
                entry["variants"].append({
                    "kitPon": kit,
                    "description": v.get("DESCRIPTION"),
                    "powerCablesTable": v.get("POWER CABLES"),
                    "ethernetCables": v.get("ETHERNET CABLES"),
                    "mountingKitsTable": v.get("MOUNTING KITS"),
                    "powerOptionsTable": v.get("POWER OPTIONS"),
                    "controllerOptionsTable": v.get("CONTROLLER OPTIONS"),
                    "sledFillerPon": v.get("SLED FILLER OPTIONS"),
                    "airFilterPon": v.get("AIR_FILTER_OPTIONS"),
                    "airBafflePon": v.get("AIR_BAFFLE_OPTIONS"),
                    "cableGuidePon": v.get("CABLE_GUIDE_OPTIONS"),
                })
        out[name] = entry
    return out


def slot_map(bk: Book):
    """Slot number -> legality group, straight from TEMPLATE_SLED_VLISTS.

    This is the table the workbook's own VBA uses to decide which drop-down a
    slot gets. Without it the group names (ODD, TWO_SIX, ODD_OT ...) are just
    labels; with it they are positions. TEMPLATE_SLED_POSITION and
    TEMPLATE_ROW_POSITION supply the physical geometry alongside, and are the
    *service* slot counts — the ones to trust over CHASSIS_TYPES_LIST.
    """
    out = {}
    vl = bk.rows("TEMPLATE_SLED_VLISTS")
    pos = {r.get("CHASSIS TYPE / SLED POSITION"): r
           for r in bk.rows("TEMPLATE_SLED_POSITION")}
    rowp = {r.get("CHASSIS TYPE / ROW POSITION"): r
            for r in bk.rows("TEMPLATE_ROW_POSITION")}
    gen = {r.get("GENERAL SETTINGS"): r for r in bk.rows("TEMPLATE_SETTINGS")}

    for r in vl:
        name = r.get("CHASSIS TYPE / SLED VLIST")
        if not name:
            continue
        groups, legality_chassis = [], None
        for i in range(1, 9):
            v = r.get(f"SLOT#{i}")
            if not v:
                groups.append(None)
                continue
            # G32_SLED_TYPE_ODD -> chassis 'G32', group 'ODD'
            m = re.match(r"(?P<ch>.+?)_SLED_TYPE_?(?P<grp>.*)$", v)
            if not m:
                groups.append(None)
                continue
            legality_chassis = legality_chassis or m.group("ch")
            groups.append((m.group("grp") or "ALL").upper())
        while groups and groups[-1] is None:
            groups.pop()
        p, rp, g = pos.get(name, {}), rowp.get(name, {}), gen.get(name, {})
        out[name] = {
            "legalityChassis": legality_chassis,
            "slotGroups": groups,
            "slots": num(p.get("NSLOTS")),
            "slotSize": num(p.get("SLOT SIZE")),
            "rows": num(rp.get("NROWS")),
            "slotsPerRow": num(rp.get("SLED SLOTS PER ROW")),
            "lineModuleSize": num(g.get("LINE MODULE SIZE")),
            "sledPicSize": num(g.get("SLED PIC SIZE")),
        }
    return out


def items(bk: Book):
    """PON -> weight / power / category, the way the workbook rolls up a BOM.

    Process_Power_Weigth looks every BOM line's PON up in SLED_DEFINITION by
    its *first* column, so that table is really an item catalogue: sleds,
    chassis kits, PEMs and controllers all sit in it. Rows whose PON cell is a
    ';'-separated pair are indexed under each PON, which the workbook itself
    cannot do (its VLookup matches the joined string) — so a Summa BOM counts
    weight the spreadsheet silently drops.
    """
    out = {}
    for r in bk.rows("SLED_DEFINITION"):
        raw = r.get("REQUIRED PONs") or r.get("REQUIRED PONS")
        if not raw:
            continue
        rec = {
            "sled": r.get("SLED"),
            "category": r.get("SLED CLASSIFICATION"),
            "weightKg": num(r.get("WEIGHT")),
            "w25": num(r.get("25C (W)")),
            "w40": num(r.get("40C (W)")),
            "w55": num(r.get("55C (W)")),
            "ru": num(r.get("RUs")),
        }
        for p in pons(raw):
            out.setdefault(p, dict(rec))
    return out


def slot_legality(bk: Book):
    """Which sleds may sit in which slot group, and how wide each one is.

    Table names encode the slot group: G32_SLEDS_ODD, G32_SLEDS_TWO_SIX,
    G34c_SLEDS_ODD_OT ... The suffix after '<CHASSIS>_SLEDS' is the group key.
    """
    out = {}
    for t in bk.find(r"_SLEDS"):
        m = re.match(r"(?P<chassis>.+?)_SLEDS_?(?P<group>.*)$", t)
        if not m:
            continue
        ch = m.group("chassis")
        grp = (m.group("group") or "ALL").upper()
        sled_col = bk.col(t, "SLEDS")
        entries = []
        for r in bk.rows(t):
            sled = r.get(sled_col) if sled_col else None
            if sled is None:
                # 'EMPTY' is a legitimate choice and clean() keeps it; a truly
                # blank row is skipped by rows(). Guard anyway.
                continue
            entries.append({"sled": sled, "width": num(r.get("WIDTH")) or 1})
        out.setdefault(ch, {})[grp] = entries
    return out


def sleds(bk: Book):
    """SLED_DEFINITION — the master card table: PN, slot cost, power, weight, class."""
    out = {}
    rowset = bk.rows("SLED_DEFINITION")
    for r in rowset:
        sled = r.get("SLED")
        if not sled:
            continue
        rec = {
            "sled": sled,
            "requiredPons": pons(r.get("REQUIRED PONs") or r.get("REQUIRED PONS")),
            "slots": num(r.get("SLOTS")),
            "classification": r.get("SLED CLASSIFICATION"),
            "weightKg": num(r.get("WEIGHT")),
            "w25": num(r.get("25C (W)")),
            "w40": num(r.get("40C (W)")),
            "w55": num(r.get("55C (W)")),
            "ru": num(r.get("RUs")),
            "lineValidationTable": r.get("LINE VALIDATION"),
            "clientValidationTables": [
                r.get(f"CLIENT VALIDATION S{i}") for i in (1, 2, 3)
            ],
            "clientCages": [num(r.get(f"CLIENT PLUGGABLES SLOT {i}")) for i in (1, 2, 3)],
            "linePluggableSlots": [num(r.get(f"LINE PLUGGABLES SLOT {i}")) for i in (1, 2)],
            "sledSw": r.get("SLED SW"),
            "nmsLes": num(r.get("NMS LEs")),
        }
        rec["clientValidationTables"] = [t for t in rec["clientValidationTables"] if t]
        out[sled] = rec
    return out


def sled_options(bk: Book):
    """Per-sled option lists: line modules, client optics, trib ports, IBW licences."""
    out = {}

    def add(sled, key, table):
        rows = bk.rows(table)
        if not rows:
            return
        first = bk.col(table, sled, "PON", "MODULES", "CLIENT") or list(rows[0])[0]
        items = []
        for r in rows:
            pon = r.get(first)
            desc = r.get("DESCRIPTION")
            if pon is None and desc is None:
                continue
            rec = {"pon": pon, "description": desc}
            for extra in ("SLED TYPE", "REACH", "GRANULARITY (G)", "MIN CAPACITY",
                          "CON TYPE", "TYPE", "CS"):
                if r.get(extra) is not None:
                    rec[slug(extra).lower()] = r[extra]
            items.append(rec)
        if items:
            out.setdefault(sled, {})[key] = items

    for suffix, key in (("_MODULES_LIST", "lineModules"),
                        ("_CLIENTS_LIST", "clients"),
                        ("_S1_CLIENTS_LIST", "clientsS1"),
                        ("_S2_CLIENTS_LIST", "clientsS2"),
                        ("_TRIB_PORTS_LIST", "tribPorts"),
                        ("_OSCSFP_LIST", "oscSfp"),
                        ("_SFP_LIST", "sfp"),
                        ("_IBW", "ibwLicences")):
        for t in bk.find(re.escape(suffix) + r"$"):
            sled = t[: -len(suffix)]
            add(sled, key, t)
    return out


def option_lists(bk: Book):
    """Every pluggable option list, keyed by TABLE name rather than sled name.

    SLED_DEFINITION points at its option tables by name, and those names are
    per *family*, not per part: CHM7X-C6 and CHM7X-C14 both point at
    CHM7X_CLIENTS. Keying by sled therefore loses the link for every variant
    that is not the family's namesake. Keyed by table, the engine can follow
    the same pointer the workbook's VBA follows.
    """
    out = {}
    pat = (r"(_MODULES_LIST|_CLIENTS_LIST|_TRIB_PORTS_LIST|_OSCSFP_LIST"
           r"|_SFP_LIST|_IBW)$")
    for t in bk.find(pat):
        rows = bk.rows(t)
        if not rows:
            continue
        first = list(rows[0])[0]
        entries = []
        for r in rows:
            pon = r.get(first)
            desc = r.get("DESCRIPTION")
            if pon is None and desc is None:
                continue
            rec = {"pon": pon, "description": desc}
            for extra in ("SLED TYPE", "REACH", "GRANULARITY (G)", "MIN CAPACITY",
                          "CON TYPE", "TYPE", "CS", "CAPACITY"):
                if r.get(extra) is not None:
                    rec[slug(extra).lower()] = r[extra]
            entries.append(rec)
        out[t] = entries
    return out


def adders(bk: Book):
    """Everything a chassis drags in beyond its cards: power, controller, kits, cables."""
    out = {"power": {}, "controller": {}, "mountKits": {}, "cables": {}}

    for t in bk.find(r"_POWER(_HP)?(_\d)?_LIST$"):
        opt_col = bk.col(t, "POWER OPTIONS")
        rows = []
        for r in bk.rows(t):
            label = r.get(opt_col) if opt_col else None
            if not label:
                continue
            pem_pwr = r.get("PEM POWER") or r.get("PEM POWER 220AC")
            rows.append({
                "option": label,
                "requiredPons": pons(r.get("REQUIRED ADDITIONAL PON")),
                "pemCount": num(r.get("PEM COUNT")),
                "pemPowerW": [num(x) for x in str(pem_pwr).split("/")] if pem_pwr else None,
            })
        if rows:
            out["power"][t] = rows

    for t in bk.find(r"_CONTROLLER_LIST$"):
        opt_col = bk.col(t, "CONTROLLER OPTIONS")
        out["controller"][t] = [
            {"option": r.get(opt_col), "requiredPons": pons(r.get("REQUIRED ADDITIONAL PON"))}
            for r in bk.rows(t) if opt_col and r.get(opt_col)
        ]

    for t in bk.find(r"_KITS_LIST$"):
        pon_col = bk.col(t, "MOUNTING KIT", "KIT")
        out["mountKits"][t] = [
            {"pon": r.get(pon_col), "description": r.get("DESCRIPTION")}
            for r in bk.rows(t) if pon_col
        ]

    for t in bk.find(r"_CABLES_LIST$"):
        pon_col = bk.col(t, "CABLES")
        out["cables"][t] = [
            {"pon": r.get(pon_col), "description": r.get("CABLE DESCRIPTION") or r.get("DESCRIPTION")}
            for r in bk.rows(t) if pon_col
        ]
    return out


def licences(bk: Book):
    out = {"nms": {}, "neSoftware": []}
    for t in bk.find(r"_NMS_PONS_MAPPING$"):
        type_col = bk.col(t, "CHASSIS TYPE")
        out["nms"][t] = [
            {
                "chassis": r.get(type_col),
                "configType": r.get("CHASSIS CONFIG"),
                "nmsPon": r.get("NMS PON"),
                "l0Restoration": r.get("L0 RESTORATION"),
                "l0l1Automation": r.get("L0L1 AUTOMATION"),
            }
            for r in bk.rows(t) if type_col
        ]
    for r in bk.rows("GXOS_PONS_MAPPING"):
        out["neSoftware"].append({
            "requiredPons": pons(r.get("REQUIRED PONS")),
            "ne": r.get("NE"),
            "neRelease": r.get("NE RELEASE"),
            "swLevel": r.get("SW LEVEL"),
            "controllerRedundancy": r.get("CONTROLLER REDUNDANCY"),
        })
    return out


def releases(bk: Book):
    out = {}
    for t in bk.find(r"RELEASE_LIST$"):
        rows = bk.rows(t)
        if not rows:
            continue
        keys = list(rows[0])
        if len(keys) == 1:
            out[t] = [r[keys[0]] for r in rows if r[keys[0]]]
        else:
            out[t] = rows
    return out


def pon_master(bk: Book):
    """PN master: description, availability, lifecycle, price.

    Price and lifecycle are commercially sensitive. `--no-prices` drops the
    price column so the JSON can live somewhere less private.
    """
    out = {}
    for r in bk.rows("PON_LIST"):
        pid = r.get("PON ID")
        if not pid:
            continue
        out[pid] = {
            "description": r.get("Item Description"),
            "availability": r.get("Availability"),
            "type": r.get("Type"),
            "revenueState": r.get("Revenue State"),
            "price": num(r.get("Any Customer Price")),
        }
    for r in bk.rows("PON_VAULT"):
        pid = r.get("P5 SKU Item Number")
        if not pid:
            continue
        rec = out.setdefault(pid, {})
        rec.setdefault("description", r.get("ItemName"))
        rec.update({
            "materialNumber": r.get("MaterialNumber"),
            "productType": r.get("ProductType"),
            "productFamily": r.get("ProductFamily"),
            "productCategory": r.get("ProductCategory"),
            "itemPhase": r.get("ItemPhase"),
            "salesStatus": r.get("Sales Status"),
        })
        if r.get("MSRP Price") is not None:
            rec["price"] = num(r.get("MSRP Price"))
    return out


def misc(bk: Book):
    out = {}
    for t, key in (("FIBER_TYPE_LIST", "fiberTypes"),
                   ("RACK_OPTIONS_LIST", "rackOptions"),
                   ("ETHERNET_CABLES_LIST", "ethernetCables"),
                   ("NMS_RELEASE_LIST", "nmsReleases")):
        rows = bk.rows(t)
        if rows:
            out[key] = rows
    return out


# --------------------------------------------------------------------------- #
def build(path: Path, keep_prices: bool):
    bk = Book(path)
    ch = chassis(bk)
    grid = sled_grid(bk)
    conflicts = []
    for name, rec in ch.items():
        g = grid.get(name) or grid.get(name.split("/")[0])
        if not g:
            continue
        rec["sledRows"] = g.get("sledRows")
        rec["sledSlotsPerRow"] = g.get("sledSlotsPerRow")
        rec["sledSlots"] = g.get("sledSlots") or g.get("sledSlotsDerived")
        rec["slotSize"] = g.get("slotSize")
        if rec.get("slots") and rec.get("sledSlots") and rec["slots"] != rec["sledSlots"]:
            conflicts.append({
                "chassis": name,
                "field": "slot count",
                "uiGrid": rec["slots"],
                "serviceSlots": rec["sledSlots"],
                "note": "CHASSIS_TYPES_LIST counts UI grid columns, which can include "
                        "non-sled positions; the AUX sled block counts service slots. "
                        "Use serviceSlots for card placement.",
            })
    smap = slot_map(bk)
    for name, rec in ch.items():
        m = smap.get(name)
        if m:
            rec["slotGroups"] = m["slotGroups"]
            rec["legalityChassis"] = m["legalityChassis"]
            rec["lineModuleSize"] = m["lineModuleSize"]
            rec["sledPicSize"] = m["sledPicSize"]

    data = {
        "meta": meta(bk),
        "conflicts": conflicts,
        "chassis": ch,
        "slotLegality": slot_legality(bk),
        "items": items(bk),
        "sleds": sleds(bk),
        "sledOptions": sled_options(bk),
        "optionLists": option_lists(bk),
        "adders": adders(bk),
        "licences": licences(bk),
        "releases": releases(bk),
        "pons": pon_master(bk),
        "misc": misc(bk),
    }

    if not keep_prices:
        for rec in data["pons"].values():
            rec.pop("price", None)
        data["meta"]["prices_included"] = False
    else:
        data["meta"]["prices_included"] = True

    # capture anything the typed extractors did not claim, so nothing is lost
    claimed = set()
    for pat in (r"_SLEDS", r"_MODULES_LIST$", r"_CLIENTS_LIST$", r"_TRIB_PORTS_LIST$",
                r"_OSCSFP_LIST$", r"_SFP_LIST$", r"_IBW$", r"_POWER(_HP)?(_\d)?_LIST$",
                r"_CONTROLLER_LIST$", r"_KITS_LIST$", r"_CABLES_LIST$",
                r"_NMS_PONS_MAPPING$", r"RELEASE_LIST$", r"_CHASSIS_OPTIONS$"):
        claimed.update(bk.find(pat))
    claimed.update({"CHASSIS_TYPES_LIST", "SLED_DEFINITION", "GXOS_PONS_MAPPING",
                    "PON_LIST", "PON_VAULT", "FIBER_TYPE_LIST", "RACK_OPTIONS_LIST",
                    "ETHERNET_CABLES_LIST", "NMS_RELEASE_LIST"})
    skip = re.compile(r"CAGE_POSITION|TEMPLATE|_PIC_|SITE_LIST|CONFIG_LIST")
    data["raw"] = {t: bk.rows(t) for t in sorted(bk.tables)
                   if t not in claimed and not skip.search(t)}
    return data


def summarise(d):
    m = d["meta"]
    print(f"  source            {m['source_file']}")
    if m.get("tool_version"):
        print(f"  tool version      {m['tool_version']}  ({m.get('tool_release_date')})")
    print(f"  tables read       {m['tables_seen']}")
    print(f"  chassis           {len(d['chassis'])}  ({', '.join(list(d['chassis'])[:6])}…)")
    print(f"  slot-legality     {sum(len(g) for g in d['slotLegality'].values())} groups "
          f"across {len(d['slotLegality'])} chassis")
    print(f"  sleds             {len(d['sleds'])}")
    print(f"  PON-keyed items   {len(d['items'])}  (weight / power / category)")
    nomap = [c for c, r in d["chassis"].items() if not r.get("slotGroups")]
    print(f"  slot maps         {len(d['chassis']) - len(nomap)}/{len(d['chassis'])} chassis"
          + (f"  — missing: {', '.join(nomap)}" if nomap else ""))
    print(f"  sleds w/ options  {len(d['sledOptions'])}")
    print(f"  option lists      {len(d['optionLists'])} tables, "
          f"{sum(len(v) for v in d['optionLists'].values())} entries")
    print(f"  power options     {sum(len(v) for v in d['adders']['power'].values())}")
    print(f"  NE software rows  {len(d['licences']['neSoftware'])}")
    print(f"  PONs              {len(d['pons'])}  (prices {'in' if m['prices_included'] else 'stripped'})")
    print(f"  unclaimed tables  {len(d.get('raw', {}))}")
    if d.get("conflicts"):
        print(f"  source conflicts  {len(d['conflicts'])}")
        for c in d["conflicts"]:
            print(f"    {c['chassis']}: {c['field']} — UI grid {c['uiGrid']} vs service slots {c['serviceSlots']}")
    if m.get("known_limitations"):
        print("  tool's own known limitations:")
        for l in m["known_limitations"]:
            print(f"    [{l['version']}#{l['id']}] {l['text'][:96]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("workbook", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("gx-rules.json"))
    ap.add_argument("--prices", action="store_true",
                    help="include list prices (commercially sensitive — off by default)")
    ap.add_argument("--indent", type=int, default=1)
    a = ap.parse_args()

    if not a.workbook.exists():
        sys.exit(f"not found: {a.workbook}")

    data = build(a.workbook, a.prices)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(data, indent=a.indent, ensure_ascii=False, default=str), encoding="utf-8")

    print(f"\nwrote {a.out}  ({a.out.stat().st_size/1024:.0f} KB)\n")
    summarise(data)


if __name__ == "__main__":
    main()
