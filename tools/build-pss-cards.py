#!/usr/bin/env python3
"""Merge the PSS guide and the PSS roadmap into one card catalogue.

    python3 tools/build-pss-cards.py \
        -g assets/pss-data.json -r assets/pss-roadmap.json -o assets/pss-cards.json

The two sources answer different questions and neither is complete on its own:

  the planning guide  what ships today — part numbers, legal slots, weight,
                      power, card width. Silent about what is coming.
  the roadmap deck    release status and the optical numbers a design turns on
                      — ports, spectrum, span loss, capacity. Silent about
                      part numbers and power.

So each card is tagged with where it came from. A card the roadmap names but
the guide does not is not an extraction failure — it is a card that has not
shipped yet, and that is exactly what a sales engineer needs to see.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

SHELF_ORDER = ["PSS-4II", "PSS-8", "PSS-16 main", "PSS-16 extension",
               "PSS-16II DC 8RU", "PSS-16II AC/DC 9RU", "PSS-32",
               "PSI-4L", "PSI-8L", "PSS-4hc", "PSS-10hc"]

# roadmap product names carry the shelf-facing shorthand in brackets:
# "S6AD600H/L/E (2W,1H)" is 2 slots wide, 1 slot high
SIZE_RX = re.compile(r"\((\d)\s*W\s*,\s*(\d)\s*H\)", re.I)
HEIGHT_RX = re.compile(r"\b(Half|Full)\s*Height\b", re.I)
SLOTS_RX = re.compile(r"\b(\d)\s*-?\s*slot\b", re.I)


def base_name(n):
    return re.sub(r"\s*\(.*?\)\s*", "", n).strip()


# A functional type for every card. The guide's own categories only cover the
# currently orderable list, so two in five cards — every legacy card that still
# appears in the slot and power tables — would otherwise be unfilterable.
# Order matters: the first pattern that matches wins.
TYPES = [
    ("Shelf",          r"\bshelf\b|\bchassis\b|shelf kit"),
    ("Controller",     r"equipment controller|\bcontroller\b|multi-function card|"
                       r"node controller|user panel|shelf panel"),
    ("Power",          r"power filter|power module|\bPDU\b|breaker|power supply|"
                       r"power distribution"),
    ("Cooling",        r"\bfan\b|air filter|air baffle|airflow"),
    ("Timing",         r"\btiming\b|SyncE|\bPTP\b|\bBITS\b|clock"),
    ("ROADM",          r"ROADM|wavelength router|\bWSS\b|wavelength selective"),
    ("Amplifier",      r"amplifier|\bEDFA\b|raman|booster|pre-?amp|\bILA\b|"
                       r"\bgain\b"),
    # add/drop is tested before the traffic cards so that "optical multiplexer/
    # demultiplexer" stays a filter and does not read as a muxponder
    ("Add / drop",     r"add\s*/?\s*drop|multicast switch|\bMCS\b|interleaver|"
                       r"\bfilter\b|splitter|combiner|\bmux\s*/\s*demux\b|"
                       r"multiplexer|de-?multiplexer"),
    ("Line card",      r"line card|I/O card overview|client card overview"),
    ("Transponder",    r"transponder|muxponder|xponder|\bmux\b|\bADM\b|any\s*rate"),
    ("Packet / OTN",   r"packet|ethernet|\bOTN\b|switch fabric|aggregation"),
    ("Protection",     r"protection|\bOPS\b|Y-cable|switch module"),
    ("Monitoring",     r"\bOTDR\b|channel monitor|\bOCM\b|wavelength tracker"),
    ("Attenuator",     r"attenuat"),
    ("Dispersion",     r"dispersion|\bDCM\b"),
    ("Pluggable",      r"\bSFP\+?\b|\bQSFP\b|\bCFP\d?\b|\bXFP\b|\bTOM\b|transceiver"),
    ("Mechanical",     r"\brack\b|jumper|installation|mounting|cover|bracket|"
                       r"cable|tool|blank|\bkit\b|shuffle|patch"),
]
BANDS = [
    ("C+L", r"\bC\s*\+\s*L\b|C and L|CL band"),
    ("Super C", r"super\s*-?\s*C\b"),
    ("Super L", r"super\s*-?\s*L\b"),
    ("L", r"\bL[-\s]?band\b|,\s*L-band"),
    ("C", r"\bC[-\s]?band\b|std\.?\s*C\b"),
]


def classify(card):
    """Functional type and optical band.

    The type is read only from what names the card — its description, the
    guide's category, the roadmap group. Roadmap attribute *values* are
    deliberately excluded: nearly every card carries a "PSS shelf support" row
    listing the shelves it fits, and that one phrase would type half the
    catalogue as shelves. The band is read from everything, because the only
    place it is stated is usually an attribute value.
    """
    # most specific source first: what the card calls itself beats the
    # roadmap's grouping, which beats the guide's broad ordering category —
    # "12x10G Layer 2 Carrier Ethernet I/O Card" is a packet card even though
    # the guide lists it under "100 G Muxponders/Transponders"
    sources = [card.get("description"),
               (card.get("roadmap") or {}).get("group"),
               card.get("category")]
    everything = " ".join(filter(None, sources)) + " " + " ".join(
        str(v) for v in (card.get("roadmap") or {}).get("attributes", {}).values())

    kind = None
    for hay in filter(None, sources):
        for name, rx in TYPES:
            if re.search(rx, hay, re.I):
                kind = name
                break
        if kind:
            break
    band = None
    for name, rx in BANDS:
        if re.search(rx, everything, re.I):
            band = name
            break
    return kind or "Other", band


def expand(name, universe):
    """'IR9/LP' -> IR9, IR9LP.  'S6AD600H/L/E' -> S6AD600H, S6AD600L, S6AD600E.

    The deck writes a family and its variants as one slash-separated name, and
    the variant is sometimes a suffix to append ("IR9/LP" is IR9 and IR9LP) and
    sometimes a letter that replaces the last one ("S6AD600H/L/E"). Where the
    guide knows one of the two readings, that settles it. Where it knows
    neither — every PSS-x and PSS-HC card, which the R26.6 guide does not cover
    — guessing would invent part names, so only the appended form becomes a
    card and the other reading is kept as an alias so a search still finds it.
    """
    n = base_name(name)
    if "/" not in n:
        return [n], []
    head, *rest = n.split("/")
    head = head.strip()
    names, aliases = [head], []
    for alt in rest:
        alt = alt.strip()
        if not alt:
            continue
        appended = head + alt
        replaced = head[: -len(alt)] + alt if len(alt) < len(head) else None
        known = [c for c in (appended, replaced) if c and c in universe]
        if known:
            names.extend(known)
            aliases.extend(c for c in (appended, replaced) if c and c not in known)
        else:
            names.append(appended)
            if replaced:
                aliases.append(replaced)
    seen, uniq = set(), []
    for c in names:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return uniq, [a for a in aliases if a not in seen]


def size_from(name, attrs):
    """Slot width and height, from the deck's own shorthand."""
    w = h = None
    m = SIZE_RX.search(name)
    if m:
        w, h = int(m.group(1)), int(m.group(2))
    m = HEIGHT_RX.search(name)
    if m and h is None:
        h = 1 if m.group(1).lower() == "half" else 2
    m = SLOTS_RX.search(name)
    if m and w is None:
        w = int(m.group(1))
    for k, v in (attrs or {}).items():
        if "slot" in k.lower() and w is None:
            m = SLOTS_RX.search(str(v))
            if m:
                w = int(m.group(1))
    return w, h


def shelf_records(guide, roadmap, cards):
    """One record per shelf: geometry from the deck, slots and mass from the guide.

    Neither source alone describes a shelf. The deck gives dimensions, mounting,
    controller redundancy and operating range; the guide gives the legal slot
    range, the shelf and kit weights, and the power the shelf draws empty.
    """
    out = {}

    for sheet in roadmap["tables"]:
        title = sheet.get("title") or ""
        if "Chassis" not in title:
            continue
        for prod in sheet["products"]:
            name = base_name(prod["name"])
            rec = out.setdefault(name, {"name": name})
            rec["family"] = title
            rec["attributes"] = prod["attributes"]
            if prod["attributes"].get("Release"):
                rec["release"] = prod["attributes"]["Release"]

    ranges = dict(guide["shelves"]["slotRange"])
    ranges.update(guide["shelves"]["hcSlotRange"])

    def key_for(col):
        """'PSS-16II DC 8RU' and 'PSS-16II AC/DC 9RU' are one shelf, two builds."""
        return col.split(" ")[0]

    # every shelf column, not only the ones with a shelf-wide range: the guide
    # leaves that cell blank for PSI-4L and PSI-8L even though their per-card
    # rows are filled in
    for col in SHELF_ORDER:
        rec = out.setdefault(key_for(col), {"name": key_for(col)})
        if ranges.get(col):
            rec.setdefault("slotRanges", {})[col] = ranges[col]
        rec["cardCount"] = max(rec.get("cardCount", 0),
                               sum(1 for c in cards.values() if c["shelves"].get(col)))

    for r in guide["power"]:
        comp = (r.get("component") or "").replace("1830 ", "")
        desc = r.get("description") or ""
        for name in sorted(out, key=len, reverse=True):
            if comp == name or re.match(rf"^{re.escape(name)}\b", comp):
                bucket = "kits" if "KIT" in comp.upper() or "Kit" in desc else "shelf"
                out[name].setdefault(bucket, []).append({
                    "component": r.get("component"), "description": desc,
                    "weightKg": r.get("weightKg"), "p100": r.get("p100"),
                    "pMax": r.get("pMax"),
                })
                break

    # PSD is out of scope for this knowledge base; the deck covers it, the
    # planning guide does not, and half a record is worse than none
    return {k: v for k, v in out.items() if not k.startswith("PSD")}


def build(guide, roadmap):
    parts, power, slots = guide["parts"], guide["power"], guide["slotRanges"]

    universe = set(slots) | {p["abbrev"] for p in parts if p.get("abbrev")} \
        | {r["component"] for r in power if r.get("component")}

    cards = {}
    # Not every item name is a tidy mnemonic — "DMSMF 010", "4FAN DC" and
    # "Inventory Cable Kit" are all real — so the filter only rejects what
    # cannot be a name at all: stray dashes and footnotes the table reader
    # picked up, and fragments of prose.
    def mnemonic(n):
        return (2 <= len(n) <= 40
                and re.search(r"[A-Za-z0-9]", n)
                and not re.search(r"[;:\"]|\.$", n))

    def card(name):
        return cards.setdefault(name, {
            "name": name, "partNumbers": [], "aliases": [],
            "shelves": {}, "sources": [],
        })

    # ---- the guide: part numbers, category
    for p in parts:
        n = p.get("abbrev")
        if not n:
            continue
        c = card(n)
        c.setdefault("description", p.get("description"))
        if p.get("category"):
            c.setdefault("category", p["category"])
        if p.get("partNumber") and not p["partNumber"].lower().startswith("per region"):
            c["partNumbers"].append({"pn": p["partNumber"],
                                     "description": p.get("description")})
        if "guide" not in c["sources"]:
            c["sources"].append("guide")

    # ---- the guide: legal slots
    for n, shelves in slots.items():
        c = card(n)
        c["shelves"].update(shelves)
        if "guide" not in c["sources"]:
            c["sources"].append("guide")

    # ---- the guide: weight, power, width
    for r in power:
        n = r.get("component")
        if not n:
            continue
        c = card(n)
        c.setdefault("description", r.get("description"))
        for k in ("weightKg", "pStat", "p0", "p50", "p100", "pMax"):
            if r.get(k) is not None and c.get(k) is None:
                c[k] = r[k]
        if r.get("slots") and not c.get("slotsWide"):
            c["slotsWide"] = r["slots"]
        if "guide" not in c["sources"]:
            c["sources"].append("guide")

    # ---- the roadmap: release status and the optical numbers
    for sheet in roadmap["tables"]:
        if not sheet.get("inScope"):
            continue
        for prod in sheet["products"]:
            names, extra_aliases = expand(prod["name"], universe)
            w, h = size_from(prod["name"], prod.get("attributes"))
            for i, n in enumerate(names):
                c = card(n)
                c.setdefault("description", None)
                c["roadmap"] = {
                    "slide": sheet["slide"],
                    "group": sheet.get("title"),
                    "asNamed": prod["name"],
                    "attributes": prod["attributes"],
                }
                rel = prod["attributes"].get("Release")
                if rel:
                    c["release"] = rel
                if w and not c.get("slotsWide"):
                    c["slotsWide"] = w
                if h:
                    c["slotsHigh"] = h
                for other in names + extra_aliases:
                    if other != n and other not in c["aliases"]:
                        c["aliases"].append(other)
                if "roadmap" not in c["sources"]:
                    c["sources"].append("roadmap")

    for name in [n for n in cards if not mnemonic(n)]:
        del cards[name]

    for c in cards.values():
        c["shelfList"] = [s for s in SHELF_ORDER if s in c["shelves"]]
        c["shipping"] = "guide" in c["sources"]
        c["planned"] = c["sources"] == ["roadmap"]
        c["type"], c["band"] = classify(c)

    shelves = shelf_records(guide, roadmap, cards)

    return {
        "shelves": shelves,
        "meta": {
            "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "guide": guide["meta"],
            "roadmap": roadmap["meta"],
            "shelfOrder": SHELF_ORDER,
        },
        "shelfSlotRange": {**guide["shelves"]["slotRange"],
                           **guide["shelves"]["hcSlotRange"]},
        "cards": sorted(cards.values(), key=lambda c: c["name"]),
        "pluggables": guide.get("powerPluggables", []),
        "glossary": guide.get("glossary", []),
        "roadmapGroups": [
            {"slide": s["slide"], "title": s.get("title"),
             "products": [p["name"] for p in s["products"]]}
            for s in roadmap["tables"] if s.get("inScope")
        ],
    }


def summarise(d):
    cards = d["cards"]
    print(f"  cards             {len(cards)}")
    print(f"    shipping        {sum(1 for c in cards if c['shipping'])}")
    print(f"    roadmap only    {sum(1 for c in cards if c['planned'])}")
    print(f"    with a PN       {sum(1 for c in cards if c['partNumbers'])}")
    print(f"    with slots      {sum(1 for c in cards if c['shelfList'])}")
    print(f"    with power      {sum(1 for c in cards if c.get('pMax') is not None)}")
    print(f"    with roadmap    {sum(1 for c in cards if c.get('roadmap'))}")
    print(f"  pluggables        {len(d['pluggables'])}")
    print(f"  shelves           {len(d['shelves'])}")
    print(f"  glossary terms    {len(d.get('glossary', []))}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-g", "--guide", type=Path, default=Path("assets/pss-data.json"))
    ap.add_argument("-r", "--roadmap", type=Path, default=Path("assets/pss-roadmap.json"))
    ap.add_argument("-o", "--out", type=Path, default=Path("assets/pss-cards.json"))
    a = ap.parse_args()
    d = build(json.loads(a.guide.read_text()), json.loads(a.roadmap.read_text()))
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(d, indent=1), encoding="utf-8")
    print(f"\nwrote {a.out}  ({a.out.stat().st_size // 1024} KB)\n")
    summarise(d)


if __name__ == "__main__":
    main()
