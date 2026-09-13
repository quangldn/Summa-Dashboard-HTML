#!/usr/bin/env python3
"""
Build assets/insight-data.json — the figures behind portfolio-insight.html.

Three views, two platforms, one schema. The page is an at-a-glance surface, so
everything it needs is precomputed here: the page draws, it does not derive.

Sources, all already in the repo:
  assets/gx-data.js      GX chassis / ROADM / amp / Raman / add-drop / xpdr,
                         hand-built from the datasheets. Carries the optical
                         fields nothing else has: degree count, band in THz,
                         span loss, WSS ports.
  assets/gx-rules.json   The GX configurator workbook — slot legality, which
                         gives the real "what fits in which chassis" matrix.
  assets/pss-cards.json  PSS/PSI guide + roadmap merge.
  assets/xpdr-data.json  The normalised transponder set behind the DCI picker.

Nothing is retyped from a datasheet here. Where a figure cannot be derived it
is left null and the page shows a gap rather than a guess.
"""

import json
import os
import re
from collections import OrderedDict, Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, "assets", *p)
OUT = A("insight-data.json")


# --------------------------------------------------------------------------
# gx-data.js is a JS literal, not JSON. Parse the fields we need rather than
# pulling in a JS engine — the file is machine-written and regular.
# --------------------------------------------------------------------------

def parse_gx_data():
    src = open(A("gx-data.js"), encoding="utf-8").read()
    out = []
    # Records start at "{ cat:'…'" and run to the next one (or end of array).
    starts = [m.start() for m in re.finditer(r"\{\s*cat:'", src)]
    starts.append(len(src))
    for i in range(len(starts) - 1):
        blob = src[starts[i]:starts[i + 1]]
        rec = {}

        def s(field):
            m = re.search(field + r":'((?:[^'\\]|\\.)*)'", blob)
            return m.group(1).replace("\\'", "'") if m else None

        def n(field):
            m = re.search(field + r":\s*(\d+)", blob)
            return int(m.group(1)) if m else None

        rec["cat"] = s("cat")
        rec["group"] = s("grp")
        rec["name"] = s("name")
        rec["pn"] = s("pn")
        rec["release"] = s("rel")
        rec["status"] = s("status")
        rec["form"] = s("form")
        rec["band"] = s("band")
        rec["slots"] = n("slots")
        rec["degrees"] = n("deg")

        m = re.search(r"shelf:\s*\[([^\]]*)\]", blob)
        rec["shelves"] = re.findall(r"'([^']+)'", m.group(1)) if m else []

        spec = {}
        m = re.search(r"spec:\s*\{(.*?)\}\s*(?:,\s*note:|\s*\}\s*,?\s*$)", blob, re.S)
        if m:
            for k, v in re.findall(r"'([^']+)'\s*:\s*'((?:[^'\\]|\\.)*)'", m.group(1)):
                spec[k] = v.replace("\\'", "'")
        rec["spec"] = spec
        rec["note"] = s("note")
        if rec["name"]:
            out.append(rec)
    return out


# --------------------------------------------------------------------------
# Normalisers shared by both platforms
# --------------------------------------------------------------------------

# "6.1 THz — Super C" / "4.8THz – Std. C" / "9.6THz-Std C+L"
BAND_ORDER = ["Std C", "Super C", "Std L", "Super L", "Std C+L", "Super C+L"]


def parse_band(text):
    """-> (label, THz). One spelling out of the several both sources use."""
    if not text:
        return None, None
    t = re.sub(r"[–—-]", " ", text)
    t = t.replace("THz", " THz ")
    thz = None
    m = re.search(r"(\d+(?:\.\d+)?)\s*THz", t)
    if m:
        thz = float(m.group(1))
    low = t.lower().replace(".", "")
    sup = "super" in low
    has_c, has_l = re.search(r"\bc\b|c\s*\+", low), re.search(r"\bl\b|\+\s*l", low)
    if has_c and has_l:
        label = "Super C+L" if sup else "Std C+L"
    elif has_l:
        label = "Super L" if sup else "Std L"
    elif has_c:
        label = "Super C" if sup else "Std C"
    else:
        label = None
    return label, thz


def parse_span_loss(text):
    """'0 – 33 dB' / '0-32dB' / '-' -> (lo, hi)."""
    if not text:
        return None, None
    m = re.search(r"(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*dB", text)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r"(\d+(?:\.\d+)?)\s*dB", text)
    return (0.0, float(m.group(1))) if m else (None, None)


def parse_wss(text):
    """'1 × 32' / '2x32' -> (banks, ports)."""
    if not text:
        return None, None
    m = re.search(r"(\d+)\s*[x×]\s*(\d+)", text)
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def parse_slots(text):
    """'1-Slot' / '2 slot' / 'Half slot' / '2RU' -> a slot count, or None."""
    if not text:
        return None
    t = text.lower()
    if "half" in t:
        return 0.5
    # Only bail when the string is *nothing but* a rack-unit figure ("2RU"),
    # which means a standalone shelf rather than a slot count. The old guard
    # also swallowed "8 · 1 RU sleds", so G32's slot count fell through to the
    # workbook's 10 — the wrong side of a conflict the extractor already
    # flags (CHASSIS_TYPES_LIST counts UI grid columns; the sled block counts
    # service slots, and the service-slot figure is the one to quote).
    if re.match(r"^\s*\d+\s*ru\s*$", t):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", t)
    return float(m.group(1)) if m else None


def parse_dims(text):
    """'87.5 (2RU) x 442.0 x 243.7mm' -> (ru, width, depth)."""
    if not text:
        return None, None, None
    ru = None
    m = re.search(r"\((\d+)\s*RU\)", text, re.I)
    if m:
        ru = int(m.group(1))
    nums = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)", text.replace(",", ""))]
    # height (ru) width depth — drop the RU figure itself when present
    if ru is not None and len(nums) >= 4:
        nums = [nums[0]] + nums[2:]
    if len(nums) >= 3:
        return ru, nums[1], nums[2]
    return ru, None, None


def parse_watts(spec):
    """'93 W typ · 130 W max' -> (typ, max)."""
    txt = spec.get("Measured power") or ""
    typ = mx = None
    m = re.search(r"(\d+(?:\.\d+)?)\s*W\s*typ", txt)
    if m:
        typ = float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*W\s*max", txt)
    if m:
        mx = float(m.group(1))
    if typ is None and mx is None:
        m = re.search(r"(\d+(?:\.\d+)?)\s*W", spec.get("Max power @55 °C") or "")
        if m:
            mx = float(m.group(1))
    return typ, mx


# --------------------------------------------------------------------------
# Shelves / chassis
# --------------------------------------------------------------------------

# GX chassis depth comes from the `form` string in gx-data.js ("300 mm",
# "600 mm"); PSS shelves carry a real depth in their dimensions line.
def parse_temp(text):
    """'-40°C to +65°C  / (-30°C ...)' -> (lo, hi). The first pair wins;
    the parenthetical is a variant and is kept in the raw string."""
    if not text:
        return None, None
    t = text.replace("–", "-").replace("—", "-")
    m = re.search(r"(-?\d+)\s*°?C\s*(?:to|\u2013|-)\s*\+?(-?\d+)\s*°?C", t)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def parse_controller(text):
    """-> (supportsDual, label). 'Duplex, protected' and 'Single / dual
    (optional)' both mean a second controller is available; 'Simplex' and a
    bare 'Single' mean it is not."""
    if not text:
        return None, None
    t = text.lower()
    if "duplex" in t or "dual" in t:
        return True, text
    if "simplex" in t or "single" in t:
        return False, text
    return None, text


def parse_unit_count(text, word):
    """'3 rear, 1:N' / '2 PSU rear, 1+1' / '1 FAN card (shelf right)'
    -> (count, redundancy). The count is the leading figure; the redundancy
    is the 1+1 / 1:N scheme wherever it appears."""
    if not text:
        return None, None
    m = re.match(r"\s*(\d+)\s*(?:x\s*)?" + word, text, re.I)
    if not m:
        m = re.match(r"\s*(\d+)\s*(?:rear|front|top|bottom)", text, re.I)
    count = int(m.group(1)) if m else None
    r = re.search(r"(\d+\s*[+:]\s*[\dN]+)", text)
    red = r.group(1).replace(" ", "") if r else None
    if red is None and re.search(r"redundant", text, re.I):
        red = "redundant"
    return count, red


def parse_slot_split(text):
    """'8 (half)/4 (full)' -> (half, full); '4' -> (None, 4)."""
    if not text:
        return None, None
    h = re.search(r"(\d+)\s*\(half\)", text)
    f = re.search(r"(\d+)\s*\(full\)", text)
    if h or f:
        return (int(h.group(1)) if h else None, int(f.group(1)) if f else None)
    m = re.search(r"(\d+)", text)
    return (None, int(m.group(1))) if m else (None, None)


# The transponder set names GX hosts the way the workbook does; the datasheet
# file names them the way the datasheets do.
SHELF_ALIASES = {
    "G42": ["G40", "G42"],
    "G34c / G34Xc": ["G34c", "G34c/G34Xc", "G34Xc"],
    "PSS-16II": ["PSS-16II DC 8RU", "PSS-16II AC/DC 9RU"],
}


def shelf_keys(name):
    return [name] + SHELF_ALIASES.get(name, [])


def build_shelves(gx, pss, rules):
    out = []

    for r in gx:
        if r["cat"] != "chassis":
            continue
        depth = None
        m = re.search(r"(\d{3})\s*mm", r.get("form") or "")
        if m:
            depth = float(m.group(1))
        spec = r["spec"]
        slots = parse_slots(spec.get("Service slots"))
        m = re.search(r"(\d+(?:\.\d+)?)\s*kg", spec.get("Weight") or "")
        ru = None
        m2 = re.search(r"(\d+)\s*RU", (r.get("form") or "") + " " + (spec.get("Service slots") or ""))
        if m2:
            ru = int(m2.group(1))
        half, full = parse_slot_split(spec.get("Service slots"))
        out.append(OrderedDict([
            ("id", r["name"]), ("platform", "GX"), ("name", r["name"]),
            ("ru", ru or r.get("ru")), ("depthMm", depth), ("widthMm", None),
            ("heightMm", None), ("dimensions", r.get("form")),
            ("weightKg", float(m.group(1)) if m else None),
            ("slots", slots), ("slotsHalf", half), ("slotsFull", full),
            ("slotsRaw", spec.get("Service slots")),
            ("slotsIncludesCommon", False),
            ("slotsGrid", None), ("slotsCommon", None),
            ("tempLo", None), ("tempHi", None), ("tempRaw", None),
            ("mounting", spec.get("Mounting")),
            ("applications", r.get("apps")),
            ("controller", spec.get("Controller FRU")),
            ("controllerDual", parse_controller(spec.get("Controller FRU"))[0]),
            ("ioFru", spec.get("I/O FRU")),
            ("fans", spec.get("Fans")),
            ("fanCount", parse_unit_count(spec.get("Fans"), "fan")[0]),
            ("fanRedundancy", parse_unit_count(spec.get("Fans"), "fan")[1]),
            ("powerSupply", spec.get("Power supply")),
            ("psuCount", parse_unit_count(spec.get("Power supply"), "psu")[0]),
            ("psuRedundancy", parse_unit_count(spec.get("Power supply"), "psu")[1]),
            ("psuType", spec.get("PSU type")),
            ("pemCapacity", spec.get("PEM capacity")),
            ("powerRaw", spec.get("Measured power")),
            ("release", r.get("release")), ("status", r.get("status")),
            ("note", r.get("note")),
            ("source", "gx-data.js"),
        ]))

    # The workbook is authoritative on GX slot counts, so fill from it where
    # the datasheet string did not give one.
    # Two different counts of the same shelf, and the difference is the point:
    # the datasheet counts SERVICE slots — the positions a sled goes in — and
    # the workbook counts every position in the shelf grid, which includes the
    # common-equipment slots. G32 is 8 sleds in 4 columns x 2 rows plus 2
    # controller positions, so 8 and 10 are both right about different things.
    # Service slots is the number to quote; the grid total and what fills the
    # difference are recorded beside it rather than thrown away.
    for name, ch in rules["chassis"].items():
        if not ch.get("nmsLicence"):
            continue
        short = name.split("/")[0].strip()
        for row in out:
            if row["id"].split("/")[0].strip() != short:
                continue
            grid = ch.get("slots")
            row["ru"] = row["ru"] or ch.get("ru")
            row["gridRows"] = ch.get("rows")
            row["gridCols"] = ch.get("slotsPerRow")
            if row["slots"] is None:
                row["slots"] = grid
                row["slotsIncludesCommon"] = None
                continue
            row["slotsGrid"] = grid
            if grid and grid > row["slots"]:
                row["slotsCommon"] = grid - row["slots"]
                row["slotsIncludesCommon"] = False
            elif grid:
                row["slotsIncludesCommon"] = False

    for name, sh in (pss.get("shelves") or {}).items():
        a = (sh.get("attributes") or {})
        ru, w, d = parse_dims(a.get("Dimensions / (HxWxD)"))
        m = re.search(r"(\d+(?:\.\d+)?)\s*kg", a.get("Weight") or "")
        slots = None
        ms = re.search(r"(\d+)", a.get("Service slots") or "")
        if ms:
            slots = float(ms.group(1))
        dims = a.get("Dimensions / (HxWxD)")
        height = None
        if dims:
            mh = re.match(r"\s*(\d+(?:\.\d+)?)", dims)
            if mh:
                height = float(mh.group(1))
        if d is None and a.get("Footprint/depth"):
            md = re.search(r"(\d{3})\s*mm", a["Footprint/depth"])
            if md:
                d = float(md.group(1))
        if ru is None and a.get("Footprint/depth"):
            mr = re.search(r"(\d+)\s*RU", a["Footprint/depth"], re.I)
            if mr:
                ru = int(mr.group(1))
        tlo, thi = parse_temp(a.get("Operating temperature"))
        half, full = parse_slot_split(a.get("Service slots"))
        out.append(OrderedDict([
            ("id", name), ("platform", "PSS" if name.startswith("PSS") else "PSI"),
            ("name", name), ("ru", ru), ("depthMm", d), ("widthMm", w),
            ("heightMm", height), ("dimensions", dims or a.get("Footprint/depth")),
            ("weightKg", float(m.group(1)) if m else None),
            ("slots", slots), ("slotsHalf", half), ("slotsFull", full),
            ("slotsRaw", a.get("Service slots")),
            ("slotsIncludesCommon", False),
            ("slotsGrid", None), ("slotsCommon", None),
            ("tempLo", tlo), ("tempHi", thi),
            ("tempRaw", a.get("Operating temperature")),
            ("mounting", a.get("Mounting")),
            ("applications", a.get("Applications")),
            ("controller", a.get("Controller") or a.get("Controller FRU")),
            ("controllerDual", parse_controller(
                a.get("Controller") or a.get("Controller FRU"))[0]),
            ("ioFru", a.get("I/O FRU")),
            ("fans", a.get("Fan and airflow") or a.get("Fans") or a.get("Airflow")),
            ("fanCount", parse_unit_count(
                a.get("Fan and airflow") or a.get("Fans"), "fan")[0]),
            ("fanRedundancy", parse_unit_count(
                a.get("Fan and airflow") or a.get("Fans"), "fan")[1]),
            ("powerSupply", a.get("Power supply") or a.get("Power Supply")),
            ("psuCount", parse_unit_count(
                a.get("Power supply config") or a.get("Power modules"), "psu")[0]),
            ("psuRedundancy", parse_unit_count(
                a.get("Power supply config") or a.get("Power modules"), "psu")[1]),
            ("psuType", a.get("Power modules") or a.get("Power supply config")),
            ("pemCapacity", None), ("powerRaw", None),
            ("release", sh.get("release")), ("status", None),
            ("note", None),
            ("cardCount", sh.get("cardCount")),
            ("source", "PSS planning guide + roadmap"),
        ]))
    return out


# --------------------------------------------------------------------------
# Coverage matrix: category x shelf
# --------------------------------------------------------------------------

GX_CAT_LABEL = {
    "XPONDER": "Transponder", "ROADM": "ROADM / Raman", "MUX": "Add / drop",
    "ILA": "Amplifier", "OFP2": "OFP2 module", "OFP2CC": "OFP2 module",
}

# The workbook's "OFP2" is a form factor — a pluggable module — not a function,
# so leaving it as its own row makes GX look like it has two amplifiers when it
# has a dozen. These are classified by what the module does instead. Curated,
# because no source states the mapping; the names are the workbook's own.
GX_OFP2_FUNCTION = {
    "PAOHER": "Amplifier", "PAOHIR": "Amplifier", "PAOHLR": "Amplifier",
    "BAX": "Amplifier", "DGE": "Amplifier",
    "CAD16": "Add / drop", "CDC4D4": "Add / drop", "OMD8": "Add / drop",
    "WS04S": "ROADM / Raman",
    "OTDR8E": "Monitoring", "OCM8 (High Res)": "Monitoring", "OTSC": "Monitoring",
    "O2OPS": "Protection", "O2OPS-PT": "Protection",
    "OCC2T": "Monitoring", "OCC2E": "Monitoring",
}

PSS_CAT_KEEP = ["Transponder", "ROADM", "Amplifier", "Add / drop", "Line card",
                "Packet / OTN", "Dispersion", "Protection", "Monitoring",
                "Controller", "Timing", "Power", "Cooling"]


def build_coverage(rules, pss):
    """Which functions each shelf can host, counted."""
    cov = {"GX": {"shelves": [], "categories": [], "cells": {}},
           "PSS": {"shelves": [], "categories": [], "cells": {}}}

    # --- GX: straight out of the workbook's slot legality
    chassis_label = {"G31": "G31", "G32": "G32", "G34c": "G34c", "G40": "G42"}
    per = defaultdict(set)
    for ch, groups in rules["slotLegality"].items():
        if ch not in chassis_label:
            continue
        for rows in groups.values():
            for row in rows:
                sled = rules["sleds"].get(row["sled"]) or {}
                cat = GX_CAT_LABEL.get(sled.get("classification"))
                if cat == "OFP2 module":
                    cat = GX_OFP2_FUNCTION.get(row["sled"], "OFP2 module")
                if cat:
                    per[(cat, chassis_label[ch])].add(row["sled"])
    cov["GX"]["shelves"] = [chassis_label[c] for c in ["G31", "G32", "G34c", "G40"]]
    cov["GX"]["categories"] = [c for c in ["Transponder", "ROADM / Raman",
                                           "Amplifier", "Add / drop", "Protection",
                                           "Monitoring", "OFP2 module"]
                               if any(k[0] == c for k in per)]
    for (cat, ch), sleds in per.items():
        cov["GX"]["cells"]["%s|%s" % (cat, ch)] = len(sleds)

    # --- PSS: from each card's shelf list
    shelves = ["PSS-4II", "PSS-8", "PSS-16II DC 8RU", "PSS-16II AC/DC 9RU",
               "PSS-32", "PSI-4L", "PSI-8L"]
    cnt = Counter()
    for x in pss["cards"]:
        t = x.get("type")
        if t not in PSS_CAT_KEEP:
            continue
        for sh in (x.get("shelfList") or []):
            if sh in shelves:
                cnt[(t, sh)] += 1
    # 15 of the 17 OFP2 modules never occupy a chassis slot — they ride in
    # OFP2 cages inside a ROADM or amplifier sled. The matrix above counts
    # slot occupants, so they belong beside it rather than in it, or GX looks
    # like it owns two amplifiers.
    inleg = set()
    for ch, groups in rules["slotLegality"].items():
        if ch not in chassis_label:
            continue
        for rows in groups.values():
            for row in rows:
                inleg.add(row["sled"])
    ofp2 = Counter()
    for name, sled in rules["sleds"].items():
        if sled.get("classification") not in ("OFP2", "OFP2CC"):
            continue
        if name in inleg or name == "FILLER":
            continue
        ofp2[GX_OFP2_FUNCTION.get(name, "Other")] += 1
    cov["GX"]["ofp2"] = [{"function": k, "count": v}
                         for k, v in sorted(ofp2.items(), key=lambda kv: -kv[1])]

    cov["PSS"]["shelves"] = shelves
    cov["PSS"]["categories"] = [c for c in PSS_CAT_KEEP if any(k[0] == c for k in cnt)]
    for (cat, sh), n in cnt.items():
        cov["PSS"]["cells"]["%s|%s" % (cat, sh)] = n
    return cov


# --------------------------------------------------------------------------
# Optical layer
# --------------------------------------------------------------------------

def build_optical(gx, pss):
    roadm, amp, addrop = [], [], []

    for r in gx:
        spec = r["spec"]
        label, thz = parse_band(r.get("band"))
        lo, hi = parse_span_loss(spec.get("Span loss (no Raman)"))
        typ, mx = parse_watts(spec)
        base = OrderedDict([
            ("name", r["name"]), ("platform", "GX"), ("pn", r.get("pn")),
            ("band", label), ("thz", thz), ("slots", r.get("slots")),
            ("shelves", r.get("shelves")), ("release", r.get("release")),
            ("status", r.get("status")), ("wattsTyp", typ), ("wattsMax", mx),
            ("source", "gx-data.js"),
        ])
        if r["cat"] == "roadm":
            banks, ports = parse_wss(spec.get("WSS ports"))
            base.update([("degrees", r.get("degrees")), ("wssBanks", banks),
                         ("wssPorts", ports), ("wssType", spec.get("WSS type")),
                         ("spanLossLo", lo), ("spanLossHi", hi),
                         ("lBandExtendable", spec.get("L-band extendable")),
                         ("cdcAddDrop", spec.get("CDC A/D")),
                         ("colourlessAddDrop", spec.get("Colourless A/D"))])
            roadm.append(base)
        elif r["cat"] in ("amp", "raman", "hybrid"):
            base.update([("kind", {"amp": "EDFA", "raman": "Raman",
                                   "hybrid": "Hybrid Raman/EDFA"}[r["cat"]]),
                         ("edfaType", spec.get("EDFA type")),
                         ("configurations", spec.get("Configurations")),
                         ("spanLossLo", lo), ("spanLossHi", hi),
                         ("maxOutputDbm", spec.get("Max output power")),
                         ("maxGainDb", spec.get("Max gain (no tilt)")),
                         ("nfDb", spec.get("NF at max gain")),
                         ("midStage", spec.get("Mid-stage access"))])
            amp.append(base)
        elif r["cat"] == "ad":
            base.update([("adType", spec.get("Add/drop type") or spec.get("Type")),
                         ("channels", spec.get("Channels") or spec.get("Add/drop count")),
                         ("degrees", r.get("degrees"))])
            addrop.append(base)

    for x in pss["cards"]:
        rm = x.get("roadmap")
        if not rm:
            continue
        a = rm.get("attributes") or {}
        grp = rm.get("group") or ""
        label, thz = parse_band(a.get("Spectrum support") or a.get("Band"))
        lo, hi = parse_span_loss(a.get("Span Loss support (w/o Raman)"))
        base = OrderedDict([
            ("name", x["name"]), ("platform", "PSS"), ("pn", None),
            ("band", label), ("thz", thz),
            ("slots", parse_slots(a.get("Slots required"))),
            ("shelves", x.get("shelfList") or []),
            ("release", x.get("release")),
            ("status", "ga" if x.get("shipping") else "por"),
            ("wattsTyp", None), ("wattsMax", None),
            ("chassisDepth", a.get("Chassis support")),
            ("source", "1830 PSS roadmap, Aug-2026"),
        ])
        if "ROADM" in grp:
            banks, ports = parse_wss(a.get("WSS ports"))
            base.update([("degrees", a.get("Degree support")),
                         ("wssBanks", banks), ("wssPorts", ports),
                         ("wssType", a.get("Type")),
                         ("spanLossLo", lo), ("spanLossHi", hi),
                         ("lBandExtendable", a.get("L-Band extendable")),
                         ("cdcAddDrop", None), ("colourlessAddDrop", None)])
            roadm.append(base)
        elif "Amplifier" in grp:
            base.update([("kind", "Raman" if re.match(r"RA\d", x["name"]) else "EDFA"),
                         ("edfaType", a.get("Type")),
                         ("configurations", a.get("Configurations")),
                         ("spanLossLo", lo), ("spanLossHi", hi),
                         ("maxOutputDbm", None), ("maxGainDb", None),
                         ("nfDb", None), ("midStage", None)])
            amp.append(base)
        elif "Add / drop" in grp:
            base.update([("adType", a.get("Add/drop type")),
                         ("channels", a.get("Add/Drop count")),
                         ("degrees", a.get("Degree support"))])
            addrop.append(base)

    # Spectrum ladder — every band step either platform reaches, with who
    # reaches it. This is the C+L story in one object.
    # The two sources do not always agree on how wide a band is — GX
    # datasheets call Super C+L 12.2 THz, the PSS roadmap calls it 11.6. That
    # is a real difference in where each draws the super-L edge, so both are
    # kept and the page shows the disagreement instead of picking a winner.
    spectrum = OrderedDict()
    for row in roadm + amp + addrop:
        if not row.get("band"):
            continue
        s = spectrum.setdefault(row["band"], {"band": row["band"],
                                              "thzGX": None, "thzPSS": None,
                                              "GX": [], "PSS": []})
        key = "thz" + row["platform"]
        if row.get("thz") and (not s[key] or row["thz"] > s[key]):
            s[key] = row["thz"]
        s[row["platform"]].append(row["name"])
    ladder = []
    for b in BAND_ORDER:
        if b not in spectrum:
            continue
        s = spectrum[b]
        s["thz"] = s["thzGX"] or s["thzPSS"]
        s["thzDisagrees"] = bool(s["thzGX"] and s["thzPSS"]
                                 and s["thzGX"] != s["thzPSS"])
        ladder.append(s)

    return {"roadm": roadm, "amp": amp, "addDrop": addrop, "spectrum": ladder}


# --------------------------------------------------------------------------
# Scale
# --------------------------------------------------------------------------

def build_scale(gx, rules, pss, xpdr, shelves, optical):
    def bands_for(plat):
        return sorted({s["band"] for s in optical["spectrum"] if s[plat]},
                      key=lambda b: BAND_ORDER.index(b))

    gx_sleds = rules["sleds"]
    gx_real = {k: v for k, v in gx_sleds.items()
               if v.get("classification") not in ("FILLER", "CHASSIS")}

    return {
        "GX": OrderedDict([
            ("cards", len(gx_real)),
            ("transponders", sum(1 for v in gx_real.values()
                                 if v.get("classification") == "XPONDER")),
            ("shelves", sum(1 for s in shelves if s["platform"] == "GX")),
            ("parts", len(rules["pons"])),
            ("bands", bands_for("GX")),
            ("maxLineG", max((x["lineMaxG"] for x in xpdr["xpdr"]
                              if x["platform"] == "GX" and x["lineMaxG"]), default=None)),
            # WSS ports on both sides, so the two platforms are being
            # measured the same way — GX's own `deg` field and PSS's port
            # count are not the same quantity.
            ("maxDegrees", max((r.get("wssPorts") or r.get("degrees") or 0
                                for r in optical["roadm"]
                                if r["platform"] == "GX"), default=None)),
            ("shipping", sum(1 for r in gx if r.get("status") == "ga")),
            ("roadmap", sum(1 for r in gx if r.get("status") and r["status"] != "ga")),
        ]),
        "PSS": OrderedDict([
            ("cards", len(pss["cards"])),
            ("transponders", sum(1 for x in pss["cards"] if x.get("type") == "Transponder")),
            ("shelves", sum(1 for s in shelves if s["platform"] in ("PSS", "PSI"))),
            ("parts", sum(len(x.get("partNumbers") or []) for x in pss["cards"])),
            ("bands", bands_for("PSS")),
            ("maxLineG", max((x["lineMaxG"] for x in xpdr["xpdr"]
                              if x["platform"] == "PSS" and x["lineMaxG"]), default=None)),
            ("maxDegrees", max((r.get("wssPorts") or 0 for r in optical["roadm"]
                                if r["platform"] == "PSS"), default=None)),
            ("shipping", sum(1 for x in pss["cards"] if x.get("shipping"))),
            ("roadmap", sum(1 for x in pss["cards"] if not x.get("shipping"))),
        ]),
    }


# --------------------------------------------------------------------------

def build_transponders(xpdr):
    """The DCI set plus the two derived figures the insight view needs:
       capacity per slot, and total client cage count."""
    out = []
    for x in xpdr["xpdr"]:
        cages = sum(c["qty"] for c in x["clientCages"])
        cap = (x["lineMaxG"] or 0) * (x["lineCarriers"] or 1)
        slots = x["slots"] or 1
        out.append(OrderedDict([
            ("name", x["name"]), ("platform", x["platform"]), ("family", x["family"]),
            ("lineMinG", x["lineMinG"]), ("lineMaxG", x["lineMaxG"]),
            ("carriers", x["lineCarriers"]), ("capacityG", cap),
            ("perSlotG", round(cap / slots)), ("slots", slots),
            ("cages", cages), ("cageTypes", x["clientCages"]),
            ("services", x["clientServices"]), ("band", x["band"]),
            ("lineType", x["lineType"]), ("dsp", x["dsp"]),
            ("baudGBd", x["baudGBd"]), ("spacingGHz", x["spacingGHz"]),
            ("shipping", x["shipping"]), ("hosts", x["hosts"]),
        ]))
    return out


def enrich_shelves(shelves, xpdr, coverage, optical):
    """What each shelf can actually carry — the half of the answer a
    datasheet never gives you. Max line rate, the client services that can
    land there, and the functions it hosts, rolled up from the cards
    themselves rather than restated."""
    for sh in shelves:
        keys = shelf_keys(sh["name"])
        hosted = [x for x in xpdr
                  if any(k in (x.get("hosts") or []) for k in keys)]
        rates = [x["lineMaxG"] for x in hosted if x.get("lineMaxG")]
        svc = set()
        for x in hosted:
            svc.update(x.get("services") or [])

        # Functions, from whichever coverage matrix this shelf appears in.
        funcs = []
        for plat, cov in coverage.items():
            for col in cov["shelves"]:
                if col not in keys:
                    continue
                for cat in cov["categories"]:
                    n = cov["cells"].get(cat + "|" + col)
                    if n:
                        funcs.append({"function": cat, "count": n})
        # Merge duplicates when a shelf matched more than one alias column.
        merged = OrderedDict()
        for f in funcs:
            merged[f["function"]] = max(merged.get(f["function"], 0), f["count"])

        optic = [o for o in (optical["roadm"] + optical["amp"] + optical["addDrop"])
                 if any(k in (o.get("shelves") or []) for k in keys)]
        bands = sorted({o["band"] for o in optic if o.get("band")},
                       key=lambda b: BAND_ORDER.index(b))

        sh["transponders"] = len(hosted)
        sh["maxLineG"] = max(rates) if rates else None
        sh["clientServices"] = sorted(
            svc, key=lambda v: (-(SERVICE_ORDER.get(v, 0)), v))
        sh["hosts"] = [{"function": k, "count": v} for k, v in merged.items()]
        sh["bands"] = bands


# Fastest first, so the client list reads the way an SE reads it.
SERVICE_ORDER = {
    "800GE": 800, "400GE": 400, "400ZR": 400, "OTUC4": 400,
    "100GE": 100, "OTU4": 100, "100ZR": 100, "40GE": 40, "25GE": 25,
    "FC32G": 32, "FC16G": 16, "10GE": 10, "OTU2": 10, "OTU2e": 10,
    "OC-192": 10, "STM64": 10, "FC8G": 8, "1GE": 1, "FE": 0.1,
}


def tidy_numbers(shelves):
    """A slot count of 8.0 reads as a measurement; 8 reads as a count."""
    for sh in shelves:
        for k in ("slots", "slotsHalf", "slotsFull", "slotsCommon",
                  "slotsGrid"):
            v = sh.get(k)
            if isinstance(v, float) and v == int(v):
                sh[k] = int(v)


def main():
    gx = parse_gx_data()
    rules = json.load(open(A("gx-rules.json")))
    pss = json.load(open(A("pss-cards.json")))
    xpdr = json.load(open(A("xpdr-data.json")))

    shelves = build_shelves(gx, pss, rules)
    optical = build_optical(gx, pss)
    coverage = build_coverage(rules, pss)
    xp = build_transponders(xpdr)
    enrich_shelves(shelves, xp, coverage, optical)
    tidy_numbers(shelves)
    scale = build_scale(gx, rules, pss, xpdr, shelves, optical)

    data = OrderedDict([
        ("meta", {
            "generated": "tools/build-insight-data.py",
            "sources": ["gx-data.js (GX datasheets)",
                        "gx-rules.json (GX BOM Configurator V3.0)",
                        "pss-cards.json (PSS guide + Aug-2026 roadmap)",
                        "xpdr-data.json (DCI transponder set)"],
            "bandOrder": BAND_ORDER,
        }),
        ("scale", scale),
        ("shelves", shelves),
        ("coverage", coverage),
        ("transponders", xp),
        ("optical", optical),
    ])

    with open(OUT, "w") as f:
        json.dump(data, f, indent=1)

    print("wrote %s" % OUT)
    for sh in shelves:
        print("  %-22s %-4s %-5s %-9s %-16s %-7s %s" % (
            sh["name"], sh["platform"],
            (str(sh["ru"]) + "RU") if sh["ru"] else "—",
            (str(int(sh["depthMm"])) + "mm") if sh["depthMm"] else "—",
            sh["tempRaw"] or "temp not stated",
            ("max " + str(sh["maxLineG"]) + "G") if sh["maxLineG"] else "—",
            str(len(sh["clientServices"])) + " client types"))
    print("  shelves      %d  (GX %d, PSS/PSI %d)" % (
        len(shelves), sum(1 for s in shelves if s["platform"] == "GX"),
        sum(1 for s in shelves if s["platform"] != "GX")))
    print("  transponders %d" % len(xp))
    print("  roadm %d   amp %d   add/drop %d   spectrum steps %d" % (
        len(optical["roadm"]), len(optical["amp"]), len(optical["addDrop"]),
        len(optical["spectrum"])))
    for s in optical["spectrum"]:
        print("     %-10s GX %-6s (%2d)   PSS %-6s (%2d)%s" % (
            s["band"], str(s["thzGX"] or "—"), len(s["GX"]),
            str(s["thzPSS"] or "—"), len(s["PSS"]),
            "   <- sources disagree on width" if s["thzDisagrees"] else ""))
    miss = [r["name"] for r in optical["roadm"] + optical["amp"] if not r.get("band")]
    if miss:
        print("  no band parsed for: %s" % ", ".join(miss))


if __name__ == "__main__":
    main()
