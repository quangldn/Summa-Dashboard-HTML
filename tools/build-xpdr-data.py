#!/usr/bin/env python3
"""
Build assets/xpdr-data.json — the unified transponder knowledge base behind
the DCI picker (dci.html).

Two sources, two very different shapes:

  GX   assets/gx-rules.json   Structured. Decompiled out of the GX BOM
                              Configurator V3.0 workbook, so the cage counts,
                              slot widths, chassis legality and rate licences
                              are the numbers the configurator itself uses.

  PSS  assets/pss-cards.json  Prose. The Aug-2026 roadmap deck writes the line
                              side as one long "/"-separated sentence per card.
                              Everything structured here is parsed out of that
                              sentence and the original string is kept in
                              .raw so a wrong parse is always visible.

Three things are NOT in either source and are marked `curated` in the output:
depth class, the sub-100G cascade table, and the WSON/L0 rule. They come from
Quang's own field knowledge. They are listed in CURATED below, in one place,
so they can be corrected without touching the parsers.
"""

import json
import os
import re
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GX = os.path.join(ROOT, "assets", "gx-rules.json")
PSS = os.path.join(ROOT, "assets", "pss-cards.json")
OUT = os.path.join(ROOT, "assets", "xpdr-data.json")

# --------------------------------------------------------------------------
# Curated domain rules — not derivable from either source file.
# --------------------------------------------------------------------------

# Depth classes.
#   "std"   fits a normal 600 mm cabinet, front access
#   "deep"  needs more than 600 mm — open rack, or 700 mm+ closed cabinet
#   "shallow" fits a 300 mm-class shallow rack
# Quang's rule, verbatim from the brief: "G31, G32 really need a more depth
# than 600mm rack (couldn't be in the closed cabinet, will need the open rack
# or at least 700mm depth)".
DEPTH = {
    "G31":        ("deep", "Needs more than 600 mm. Open rack, or 700 mm+ depth — not a closed 600 mm cabinet."),
    "G32":        ("deep", "Needs more than 600 mm. Open rack, or 700 mm+ depth — not a closed 600 mm cabinet."),
    "G34c/G34Xc": ("std",  "Fits a standard 600 mm cabinet."),
    "G40":        ("std",  "Fits a standard 600 mm cabinet."),
    "PSS-4II":    ("std",  "Fits a standard 600 mm cabinet."),
    "PSS-8":      ("std",  "Fits a standard 600 mm cabinet."),
    "PSS-16II DC 8RU":    ("std", "Fits a standard 600 mm cabinet."),
    "PSS-16II AC/DC 9RU": ("std", "Fits a standard 600 mm cabinet."),
    "PSS-32":     ("std",  "Fits a standard 600 mm cabinet."),
}

# Sub-100G aggregation. The middle-rate muxponders take sub-100G directly;
# the high-rate cards (600G and up) generally do not, so a handful of 10G or
# 1G services has to arrive over a cascaded aggregator.
# Quang's rule: "we can cascade with 16P200 in PSS, UCM4 in G42 (only to match
# with CHM6 or CHM7 or new card in G42) or UTM2 in G31 G32".
CASCADE = [
    {
        "id": "16P200",
        "platform": "PSS",
        "label": "16P200",
        "hosts": ["PSS-4II", "PSS-8", "PSS-16II DC 8RU", "PSS-16II AC/DC 9RU", "PSS-32"],
        "pairsWith": None,   # None = any PSS transponder in the same shelf
        "slots": 1,
        "takes": ["10GE", "OTU2", "OTU2e", "OC-192", "STM64", "FC8G", "FC16G", "FC32G", "1GE"],
        "handsOff": "OTU4 / 100GE",
        "note": "12x SFP+/SFP28 plus 2x QSFP28 client, 2x QSFP28 line at OTU4. "
                "The standard way to land a handful of 10G services next to a "
                "coherent card in the same PSS shelf.",
    },
    {
        "id": "UCM4",
        "platform": "GX",
        "label": "UCM4",
        "hosts": ["G40"],
        "pairsWith": ["CHM6", "CHM7"],
        "slots": 1,
        "takes": ["40GE", "10GE", "OTU2", "OTU2e", "OC-192", "STM64", "100GE"],
        "handsOff": "OTU4 / 100GE",
        "note": "G42 only, and only to feed a CHM6 / CHM7 (or a later G42 card). "
                "10x client cages, 4x 100G line pluggables.",
    },
    {
        "id": "UTM2",
        "platform": "GX",
        "label": "UTM2",
        "hosts": ["G31", "G32"],
        "pairsWith": None,
        "slots": 2,
        "takes": ["10GE", "1GE", "FE", "OC-3", "OC-12", "OC-48", "STM-1", "STM-4",
                  "STM-16", "FC", "OTU2", "OTU2e", "100GE"],
        "handsOff": "100G CFP2 (grey LR4 or DWDM DCO)",
        "note": "The G31/G32 answer. 2x QSFP28 + 12x SFP+ client, 2x CFP2 line. "
                "Two slots wide — on a 4-slot G31 that is half the chassis.",
    },
]

# Line-system rule. WSON / L0 GMPLS restoration is a PSS photonic-layer
# capability; the GX photonic line is a fixed/point-to-point line system.
# Quang's rule: "if L0 GMPLS (WSON) are required it must be PSS for the optics
# line side, transponder can be a bit flexible".
WSON = {
    "lineSystem": "PSS",
    "note": "L0 GMPLS / WSON restoration requires a PSS photonic line system. "
            "The transponder itself stays flexible — a GX sled can ride a PSS "
            "line system as an alien wavelength — but the ROADM/OLS layer has "
            "to be PSS.",
}

# --------------------------------------------------------------------------
# Line-side prose parser (PSS)
# --------------------------------------------------------------------------

# The trailing guard is load-bearing: without it the token matches the '130G'
# inside '130GBd' and a baud figure is picked up as a line rate.
RATE_TOKEN = r"\d+(?:\.\d+)?\s*(?:G|T)(?![A-Za-z])"


def _to_g(tok):
    """'400G' -> 400 ; '1.2T' -> 1200 ; '1T' -> 1000.

    Returns None when the unit letter is the head of a longer word, so that
    '130GBd' and '150GHz' are never mistaken for 130G and 150G. Without this
    the greedy slash-list pattern reads '400G/500G/.../800G / 130GBd' and
    hands 130 back as a line rate.
    """
    m = re.match(r"(\d+(?:\.\d+)?)\s*([GT])(?![A-Za-z])", tok.strip(), re.I)
    if not m:
        return None
    v = float(m.group(1))
    if m.group(2).upper() == "T":
        v *= 1000
    return int(round(v))


# Line rates implied by an OTN/Ethernet line-port name rather than written as
# a number: "2 x QSFP28 line ports (L1, L2) / OTU4 line rate".
LINE_SERVICE_RATE = [
    (r"\bOTUC4\b", 400), (r"\bOTU4\b", 100),
    (r"\bOTU-?2e?\b", 10), (r"\bOTU1\b", 3),
    (r"\b400\s*ZR\+?\b", 400), (r"\b100\s*ZR\b", 100),
]


def parse_line_rates(text):
    """Pull the discrete carrier rates out of a roadmap line-side sentence.

    Handles the three shapes the deck actually uses:
        '2 x 400G - 1.2T'                  -> range, 100G steps
        '2 x 400G/500G/600G/700G/800G'     -> explicit list
        '1 x 100G-400G, 33GBd'             -> range
    A range is expanded on 100G boundaries, which is how the flexible-baud
    profiles are actually sold. Rates found anywhere else in the sentence
    (e.g. '800G / 1T / 1T2 TC @ 140GBd') are unioned in.
    """
    rates = set()

    # "N x <rate> - <rate>" or "N x <rate>-<rate>"
    for m in re.finditer(
            r"\d+\s*x\s*(" + RATE_TOKEN + r")\s*[-–]\s*(" + RATE_TOKEN + r")", text, re.I):
        lo, hi = _to_g(m.group(1)), _to_g(m.group(2))
        if lo and hi and hi >= lo:
            r = lo
            while r <= hi:
                rates.add(r)
                r += 100

    # "N x <rate>/<rate>/<rate>"
    for m in re.finditer(
            r"\d+\s*x\s*((?:" + RATE_TOKEN + r")(?:\s*/\s*" + RATE_TOKEN + r")+)", text, re.I):
        for tok in re.split(r"\s*/\s*", m.group(1)):
            g = _to_g(tok)
            if g:
                rates.add(g)

    # "N x <rate>" on its own
    for m in re.finditer(r"\d+\s*x\s*(" + RATE_TOKEN + r")(?![\s/-]*" + RATE_TOKEN + r")",
                         text, re.I):
        g = _to_g(m.group(1))
        if g:
            rates.add(g)

    # Bare rates elsewhere in the sentence, but only ones that look like a
    # line rate — never a baud figure, a spacing, or a client count.
    for m in re.finditer(r"(?<![\w.])(" + RATE_TOKEN + r")(?![\w])", text, re.I):
        g = _to_g(m.group(1))
        if g and g >= 100 and g % 100 == 0 and g <= 1600:
            rates.add(g)

    # "1xICE-X 800", "1xICE-X 1600" — the module family carries the rate with
    # no G suffix at all.
    for m in re.finditer(r"ICE-X\s*(\d{3,4})", text, re.I):
        rates.add(int(m.group(1)))

    # A line port named by its OTN rate rather than a number. Only trusted
    # when nothing numeric was found, so it can never dilute a real rate list.
    if not rates:
        for pat, g in LINE_SERVICE_RATE:
            if re.search(pat, text, re.I):
                rates.add(g)

    return sorted(rates)


def parse_carriers(text):
    m = re.search(r"(\d+)\s*x\s*(?:" + RATE_TOKEN + r"|[A-Z])", text, re.I)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 8:
            return n
    return 1


def parse_band(text, card_name=None):
    """C / L band for one card.

    A roadmap row covers a whole variant set, so the sentence names both
    bands at once — "S6AD600H/E : Cband, 4.8THz / S6AD600L : Lband, 4.8THz".
    Taking the union would make every S6AD600 dual-band, which is wrong in
    the direction that matters: it would let the picker offer an L-band card
    for a C-band-only line system. So when the sentence assigns a band to
    this card by name, that assignment wins outright.
    """
    t = text.lower()
    if card_name:
        for band, keys in (("C", ("cband", "c band", "c-band")),
                           ("L", ("lband", "l band", "l-band"))):
            for m in re.finditer(re.escape(card_name.lower()) + r"\s*:\s*([a-z\- ]{1,8})", t):
                if any(k in m.group(1) for k in keys):
                    return [band]

    has_c = any(k in t for k in ("cband", "c band", "c-band"))
    has_l = any(k in t for k in ("lband", "l band", "l-band"))

    # The deck writes the variant set as "S6AD600H/E : Cband ... / S6AD600L :
    # Lband", and the card list expands that to S6AD600E and S6AD600L — names
    # that never appear literally in the sentence. When the sentence splits
    # the bands by variant at all, the card's own suffix decides which side of
    # the split it is on.
    if card_name and has_c and has_l:
        return ["L"] if card_name.upper().endswith("L") else ["C"]

    bands = (["C"] if has_c else []) + (["L"] if has_l else [])
    return bands or ["C"]


def parse_baud(text):
    return sorted({float(m.group(1))
                   for m in re.finditer(r"(\d+(?:\.\d+)?)\s*GBd", text, re.I)})


def parse_spacing(text):
    vals = set()
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?)\s*)?GHz", text, re.I):
        vals.add(float(m.group(1)))
        if m.group(2):
            vals.add(float(m.group(2)))
    return sorted(vals)


def parse_dsp(text):
    for pat in ["PSE6s", "PSE-6s", "PSEVs", "PSEVc", "Tahoe DSP", "Garda DSP", "Garda"]:
        if pat.lower() in text.lower():
            return pat.replace("PSE6s", "PSE-6s")
    return None


def parse_line_type(text):
    """embedded optics vs a pluggable coherent module."""
    t = text.lower()
    if "embedded" in t:
        return "embedded"
    if any(k in t for k in ["pluggable", "cfp2", "qsfp-dd", "qsfp28", "sfp+", "ice-x"]):
        return "pluggable"
    return "embedded"


def parse_zr(text):
    t = text.lower()
    tags = []
    if "openzr+" in t or "zr+" in t:
        tags.append("OpenZR+")
    if re.search(r"\b400zr\b", t) or "400gbase-zr" in t:
        tags.append("400ZR")
    if "100zr" in t:
        tags.append("100ZR")
    return tags


# --------------------------------------------------------------------------
# Client-side prose parser (PSS)
# --------------------------------------------------------------------------

CAGE_PAT = re.compile(
    r"(\d+)\s*x\s*(?:dual\s+)?((?:QSFP|SFP|CFP)[0-9A-Za-z+\-/]*)", re.I)


def parse_cages(text):
    """'5xQSFP28 + 1x dual QSFP28/56-DD' -> [{QSFP28:5},{QSFP28/56-DD:1}]"""
    out = []
    for m in CAGE_PAT.finditer(text or ""):
        qty = int(m.group(1))
        kind = m.group(2).upper().rstrip(",.")
        out.append({"type": kind, "qty": qty})
    return out


# Service normalisation. The decks spell the same service several ways.
SERVICE_ALIASES = [
    (r"\b800\s*GE\b", "800GE"), (r"\b400\s*GE\b", "400GE"),
    (r"\b100\s*GE\b", "100GE"), (r"\b40\s*GE\b", "40GE"),
    (r"\b25\s*GE\b", "25GE"), (r"\b10\s*GE\b", "10GE"),
    (r"\b1\s*GE\b", "1GE"), (r"\bGbE\b", "1GE"), (r"\bFE\b", "FE"),
    (r"\bOTUC4\b", "OTUC4"), (r"\bOTU4\b", "OTU4"),
    (r"\bOTU-?2e\b", "OTU2e"), (r"\bOTU-?2\b", "OTU2"), (r"\bOTU1\b", "OTU1"),
    (r"\b400\s*ZR\+?\b", "400ZR"), (r"\b100\s*ZR\b", "100ZR"),
    (r"\bOC-?192\b", "OC-192"), (r"\bSTM-?64\b", "STM64"),
    (r"\bOC-?48\b", "OC-48"), (r"\bSTM-?16\b", "STM16"),
    (r"\bOC-?12\b", "OC-12"), (r"\bSTM-?4\b", "STM4"),
    (r"\bOC-?3\b", "OC-3"), (r"\bSTM-?1\b", "STM1"),
    (r"\bFC-?32\b|\bFC32\b", "FC32G"), (r"\bFC-?16\b|\bFC16\b", "FC16G"),
    (r"\bFC-?8\b|\bFC8\b", "FC8G"), (r"\bFC-?1200\b", "FC1200"),
    (r"\bFC-?800\b", "FC800"), (r"\bFC-?400\b", "FC400"),
    (r"\bFC-?200\b", "FC200"), (r"\bFC-?100\b", "FC100"),
    (r"\bHD-?SDI\b", "HD-SDI"), (r"\bSD-?SDI\b", "SD-SDI"), (r"\b3GSDI\b", "3G-SDI"),
]

# Service -> bit rate in Gb/s, for the sub-100G test and for port maths.
SERVICE_RATE = {
    "800GE": 800, "400GE": 400, "400ZR": 400, "OTUC4": 400,
    "100GE": 100, "OTU4": 100, "100ZR": 100,
    "40GE": 40, "25GE": 25,
    "10GE": 10, "OTU2": 10, "OTU2e": 10, "OC-192": 10, "STM64": 10,
    "FC32G": 32, "FC16G": 16, "FC8G": 8, "FC1200": 12, "FC800": 8,
    "FC400": 4, "FC200": 2, "FC100": 1,
    "1GE": 1, "FE": 0.1, "OTU1": 2.7,
    "OC-48": 2.5, "STM16": 2.5, "OC-12": 0.6, "STM4": 0.6,
    "OC-3": 0.155, "STM1": 0.155,
    "HD-SDI": 1.5, "SD-SDI": 0.27, "3G-SDI": 3,
}


def parse_services(text):
    if not text:
        return []
    # Drop parenthetical release qualifiers — "(R27.Q1)" etc. — but keep the
    # service that precedes them; the release is captured separately.
    out = []
    for pat, name in SERVICE_ALIASES:
        if re.search(pat, text, re.I) and name not in out:
            out.append(name)
    return out


def parse_future_services(text):
    """Services the deck marks as not yet available."""
    fut = set()
    for m in re.finditer(r"([A-Za-z0-9\-+ ]+?)\s*\((?:Future|R2[0-9][^)]*)\)", text or ""):
        for pat, name in SERVICE_ALIASES:
            if re.search(pat, m.group(1), re.I):
                fut.add(name)
    return sorted(fut)


# --------------------------------------------------------------------------
# asNamed footprint: "(2W, 2H)" / "(Full Height, 1-slot)"
# --------------------------------------------------------------------------

def parse_footprint(as_named):
    slots, height = None, None
    m = re.search(r"\((\d+)\s*W\s*,\s*(\d+)\s*H\)", as_named or "", re.I)
    if m:
        slots = int(m.group(1))
        height = "full" if int(m.group(2)) >= 2 else "half"
        return slots, height
    m = re.search(r"\((Full|Half)\s*Height\s*,\s*(\d+)-slot\)", as_named or "", re.I)
    if m:
        return int(m.group(2)), m.group(1).lower()
    return slots, height


# --------------------------------------------------------------------------
# GX
# --------------------------------------------------------------------------

# Rate ceilings the GX licence tables imply but do not spell out as a number.
# CHM7X is the unlicensed variant, so it has no IBW table at all; its ceiling
# is the family ceiling.
GX_FAMILY_CEILING = {"CHM6": 800, "CHM7": 1200, "CHM7X": 1200, "CHMQ6": 400}

GX_KIND = {
    "UCM4": "aggregator",
    "UTM2": "aggregator",
}


def gx_rates(rules, sled_name, sled):
    """Discrete line rates a GX sled can run.

    Two paths, because the workbook models them differently:
      * a pluggable line sled reads its rates off its *_MODULES_LIST
        ('400G IR', '800G LR', ...)
      * an embedded sled reads them off its *_IBW licence table
        ('100G license, IR, Type 8', 'FlexCoherent upto 800G, Type 14')
    """
    ol = rules["optionLists"]
    rates, modes = set(), set()

    lt = sled.get("lineValidationTable")
    if lt:
        for row in ol.get(lt + "_LIST", []) or []:
            desc = row.get("description") or ""
            # The rate is not always at the head of the string: compare
            # "400G IR" with "(100G Grey) CFP2 LR4 DUAL-RATE" and
            # "CFP2 DWDM TUNABLE FREQ AGILE DCO (400G)".
            for m in re.finditer(r"(?<![\w.])(\d+(?:\.\d+)?)\s*([GT])(?![A-Za-z])", desc):
                g = _to_g(m.group(0))
                if g and 100 <= g <= 1600 and g % 100 == 0:
                    rates.add(g)
            for mode in re.findall(r"\b(IR|LR|SR|ER)\b", desc):
                modes.add(mode)

    fam = re.match(r"(CHM7X|CHM7|CHM6|CHMQ6|SPN2C|SPN2|CHM1R|UCM4|UTM2)", sled_name)
    fam = fam.group(1) if fam else None
    ibw = ol.get((fam or "") + "_IBW", []) or []
    for row in ibw:
        desc = row.get("description") or ""
        m = re.search(r"upto\s*(\d+(?:\.\d+)?)\s*T?G?", desc, re.I)
        if m:
            val = m.group(1)
            hi = _to_g(val + ("T" if float(val) < 10 else "G"))
            if hi:
                r = 100
                while r <= hi:
                    rates.add(r)
                    r += 100
        m = re.match(r"(\d+)\s*G\s+license", desc, re.I)
        if m:
            rates.add(int(m.group(1)))
        for mode in re.findall(r"\b(IR|LR|SR|ER)\b", desc):
            modes.add(mode)

    if not rates and fam in GX_FAMILY_CEILING:
        r = 100
        while r <= GX_FAMILY_CEILING[fam]:
            rates.add(r)
            r += 100

    for pat, ceiling in GX_NAME_CEILING:
        if re.search(pat, sled_name, re.I):
            r = 100
            while r <= ceiling:
                rates.add(r)
                r += 100

    if sled_name in GX_LINE_OVERRIDE:
        rates.update(GX_LINE_OVERRIDE[sled_name][0])

    return sorted(rates), sorted(modes)


def gx_services(rules, sled, tables=None):
    """Client services, inferred from the pluggables the client cages accept."""
    ol = rules["optionLists"]
    svc = set()
    for t in (tables if tables is not None else (sled.get("clientValidationTables") or [])):
        for row in ol.get(t + "_LIST", []) or []:
            d = row.get("description") or ""
            for pat, name in SERVICE_ALIASES:
                if re.search(pat, d, re.I):
                    svc.add(name)
            # "QSFP-DD 400G BASE-DR4" style descriptions carry the rate but
            # not the service name, so map the rate to the Ethernet service.
            m = re.search(r"\b(\d+)\s*G(?:BASE)?\b", d, re.I)
            if m and ("BASE" in d.upper() or "GE" in d.upper()):
                g = int(m.group(1))
                if g in (800, 400, 100, 40, 25, 10, 1):
                    svc.add("%dGE" % g)
            if re.search(r"\b4\s*x\s*100G", d, re.I):
                svc.add("100GE")
            if re.search(r"\b4\s*x\s*10GE", d, re.I):
                svc.add("10GE")
    return sorted(svc)


def gx_client_tables(rules, sled_name, sled):
    """The client validation tables that actually govern a sled's cages.

    The workbook's sled record sometimes names only one of a family's client
    tables. UCM4 is the case that matters: its record points at
    UCM4_S2_CLIENTS (the 40G/10G breakout options) while UCM4_S1_CLIENTS (the
    100G options) exists alongside it and is equally legal in the same cages.
    Where a sled names fewer tables than the family defines, fold the missing
    ones in, so the cage is labelled with everything it takes.
    """
    listed = list(sled.get("clientValidationTables") or [])
    fam = re.match(r"[A-Z0-9]+", sled_name)
    fam = fam.group(0) if fam else sled_name
    extra = [t for t in ("%s_S1_CLIENTS" % fam, "%s_S2_CLIENTS" % fam)
             if (t + "_LIST") in rules["optionLists"] and t not in listed]
    return listed, listed + extra


def gx_cage_type(rules, table):
    """Infer a cage's form factor from the pluggables the workbook allows in it.

    clientCages in the workbook is [slot1_qty, slot2_qty, slot3_qty] — a
    position list, not a type list. The form factor has to come from what the
    matching validation table accepts, so UTM2's [2, 12] resolves to
    2x QSFP28 + 12x SFP+ rather than two cages of whatever type happens to sit
    first in a fixed list.
    """
    counts = {}
    rows = []
    for t in (table if isinstance(table, list) else [table]):
        rows += rules["optionLists"].get((t or "") + "_LIST", []) or []
    for row in rows:
        d = (row.get("description") or "") + " " + (row.get("pon") or "")
        for pat, name in (
                (r"QSFP-?DD|QSFP56-DD|QDD|\bQD[A-Z0-9]", "QSFP-DD"),
                # 100G in a quad cage is QSFP28; 40G in a quad cage is QSFP+.
                # The PON spellings differ only by the rate (TOM-100G-Q-SR4
                # vs TOM-40G-Q-SR4), so the rate has to do the deciding.
                (r"QSFP28|\bQ8[A-Z0-9]|100GBASE|100G[A-Z]*-Q-", "QSFP28"),
                (r"QSFP\+|\bQP[A-Z0-9]|QUAD SFP PLUS|40G[A-Z]*-Q-", "QSFP+"),
                (r"CFP2|\bC2[A-Z0-9]", "CFP2"),
                (r"SFP\+|SFP28|\bSP[A-Z0-9]", "SFP+/SFP28"),
                (r"\bSFP\b|\bS1GBE|\bSOC48", "SFP"),
        ):
            if re.search(pat, d, re.I):
                counts[name] = counts.get(name, 0) + 1
                break
    if not counts:
        return "client"
    # A cage often takes two form factors — UCM4's client cages accept both
    # QSFP28 and QSFP+ — so name both rather than hiding the smaller one.
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    keep = [k for k, n in ranked if n >= max(1, ranked[0][1] * 0.25)][:2]
    return "/".join(keep)


# Line rates the workbook does not model, because the sled has no line
# validation table at all. Sourced from assets/gx-data.js, which was built
# from the sled datasheets.
GX_LINE_OVERRIDE = {
    "CHM2TX": ([100, 200, 300, 400, 500], "gx-data.js — 100G to 500G, 27%/15% SDFEC"),
}

# CHM7P-C8-1.6T+ names 1.6T, but the CHM7P carries two 800G line pluggables:
# 1.6T is the card's aggregate capacity, not a wavelength rate. Reading the
# name as a per-carrier ceiling invented 900G–1.6T line rates that no ROADM
# would ever be asked for. lineCarriers already carries the aggregate, so
# there is nothing to add here.
GX_NAME_CEILING = []


def build_gx(rules):
    """Every GX sled the workbook classifies as XPONDER."""
    # chassis legality: chassis -> set of sleds
    legal = {}
    for ch, groups in rules["slotLegality"].items():
        s = set()
        for rows in groups.values():
            for r in rows:
                s.add(r["sled"])
        legal[ch] = s

    # The legality keys use short chassis names; map to the chassis records.
    chassis_key = {"G31": "G31", "G32": "G32", "G34c": "G34c/G34Xc", "G40": "G40"}

    out = []
    for name, sled in rules["sleds"].items():
        if sled.get("classification") != "XPONDER":
            continue

        rates, modes = gx_rates(rules, name, sled)

        # clientCages is positional; the type comes from the validation table
        # that governs the same position.
        listed, all_tables = gx_client_tables(rules, name, sled)
        cages = []
        for i, qty in enumerate(sled.get("clientCages") or []):
            if not qty:
                continue
            # Only trust the positional table when the workbook actually
            # distinguishes positions (UTM2 lists S1 and S2 separately, and
            # they are genuinely different cages). With a single table the
            # position carries no information, so use everything the family
            # allows.
            tbl = listed[i] if (len(listed) > 1 and i < len(listed)) else all_tables
            cages.append({"type": gx_cage_type(rules, tbl), "qty": qty})
        line_plug = sum(sled.get("linePluggableSlots") or [])

        hosts = [full for short, full in chassis_key.items()
                 if name in legal.get(short, set())]

        services = gx_services(rules, sled, all_tables)
        fam = re.match(r"(CHM7X|CHM7|CHM6|CHMQ6|SPN2C|SPN2|CHM1R|CHM2TX|UCM4|UTM2)", name)
        fam = fam.group(1) if fam else name

        band = ["L"] if re.search(r"-L\d", name) else ["C"]

        out.append(OrderedDict([
            ("id", "GX:" + name),
            ("platform", "GX"),
            ("name", name),
            ("family", fam),
            ("kind", GX_KIND.get(fam, "muxponder" if len(cages) and
                                 sum(c["qty"] for c in cages) > 1 else "transponder")),
            ("lineCarriers", max(1, line_plug) if line_plug else 1),
            ("lineRatesG", rates),
            ("lineMinG", rates[0] if rates else None),
            ("lineMaxG", rates[-1] if rates else None),
            ("lineType", "pluggable" if line_plug else "embedded"),
            ("lineModes", modes),
            ("linePluggableSlots", line_plug),
            ("band", band),
            ("baudGBd", []),
            ("spacingGHz", []),
            ("dsp", None),
            ("zr", []),
            ("clientCages", cages),
            ("clientServices", services),
            ("futureServices", []),
            ("slots", sled.get("slots") or 1),
            ("height", "full"),
            ("hosts", hosts),
            ("shipping", True),
            ("release", None),
            ("encryption", None),
            ("weightKg", sled.get("weightKg")),
            ("powerW", sled.get("w40")),
            ("source", "GX BOM Configurator V3.0"),
            ("raw", {"requiredPons": sled.get("requiredPons"),
                     "lineTable": sled.get("lineValidationTable"),
                     "clientTables": sled.get("clientValidationTables")}),
        ]))
    return out


# --------------------------------------------------------------------------
# PSS
# --------------------------------------------------------------------------

# The guide only lists shelves for a card that has shipped, so a roadmap-only
# card arrives with an empty shelf list. Its release string names them anyway:
# "R28.1H (PSS4II, PSS8NG, PSS16II)". Without this a roadmap card has no host
# and is silently unselectable — which looks identical to "no such card".
SHELF_ALIAS = {
    "PSS4II": "PSS-4II", "PSS-4II": "PSS-4II",
    "PSS8": "PSS-8", "PSS-8": "PSS-8", "PSS8NG": "PSS-8",
    "PSS16II": "PSS-16II DC 8RU", "PSS-16II": "PSS-16II DC 8RU",
    "PSS32": "PSS-32", "PSS-32": "PSS-32",
}


def shelves_from_release(release):
    if not release:
        return []
    m = re.search(r"\(([^)]*)\)", release)
    if not m:
        return []
    out = []
    for tok in re.split(r"[,/]", m.group(1)):
        key = tok.strip().upper().replace(" ", "")
        if key in SHELF_ALIAS and SHELF_ALIAS[key] not in out:
            out.append(SHELF_ALIAS[key])
    return out


PSS_GROUPS = {
    "1830 PSS HSEO Transponders : Compact": "HSEO compact",
    "1830 PSS HSEO Transponders : Super Coherent (High Perf)": "HSEO super-coherent",
    "1830 PSS LSEO OTN Transponder/Muxponder": "LSEO OTN",
}


def build_pss(cards):
    out = []
    for c in cards["cards"]:
        rm = c.get("roadmap")
        if not rm or rm.get("group") not in PSS_GROUPS:
            continue
        a = rm.get("attributes", {}) or {}
        line = a.get("Line side interface", "") or ""
        clients = a.get("Client side interface", "") or ""
        ctypes = a.get("Client types") or a.get("Client Types") or ""

        slots, height = parse_footprint(rm.get("asNamed"))
        rates = parse_line_rates(line)
        cages = parse_cages(clients)
        services = parse_services(ctypes)
        band = parse_band(line, c["name"])

        out.append(OrderedDict([
            ("id", "PSS:" + c["name"]),
            ("platform", "PSS"),
            ("name", c["name"]),
            ("family", PSS_GROUPS[rm["group"]]),
            ("kind", "muxponder" if sum(x["qty"] for x in cages) > 1 else "transponder"),
            ("lineCarriers", parse_carriers(line)),
            ("lineRatesG", rates),
            ("lineMinG", rates[0] if rates else None),
            ("lineMaxG", rates[-1] if rates else None),
            ("lineType", parse_line_type(line)),
            ("lineModes", []),
            ("linePluggableSlots", 0 if parse_line_type(line) == "embedded"
             else parse_carriers(line)),
            ("band", band),
            ("baudGBd", parse_baud(line)),
            ("spacingGHz", parse_spacing(line)),
            ("dsp", parse_dsp(line)),
            ("zr", parse_zr(line)),
            ("clientCages", cages),
            ("clientServices", services),
            ("futureServices", parse_future_services(ctypes)),
            ("slots", slots or 1),
            ("height", height or "full"),
            ("hosts", c.get("shelfList") or shelves_from_release(c.get("release"))),
            ("hostsFromRelease", not (c.get("shelfList") or [])),
            ("shipping", bool(c.get("shipping"))),
            ("release", c.get("release")),
            ("encryption", a.get("Encryption capabilities")),
            ("weightKg", None),
            ("powerW", None),
            ("source", "1830 PSS roadmap, Aug-2026 (slide %s)" % rm.get("slide")),
            ("raw", {"asNamed": rm.get("asNamed"),
                     "lineSide": line,
                     "clientSide": clients,
                     "clientTypes": ctypes}),
        ]))

    # "Profiles : parity with S2AD800R. Additional high-performance modes."
    # The deck describes a card's profile set by reference instead of listing
    # it. Resolve the reference rather than shipping a card with no rates.
    by_name = {x["name"]: x for x in out}
    for x in out:
        m = re.search(r"parity with\s+([A-Z0-9]+)", x["raw"]["lineSide"], re.I)
        if not m:
            continue
        ref = by_name.get(m.group(1).upper())
        if not ref:
            continue
        merged = sorted(set(x["lineRatesG"]) | set(ref["lineRatesG"]))
        x["lineRatesG"] = merged
        x["lineMinG"] = merged[0] if merged else None
        x["lineMaxG"] = merged[-1] if merged else None
        for k in ("baudGBd", "spacingGHz", "zr"):
            if not x[k]:
                x[k] = ref[k]
        x["inheritedFrom"] = ref["name"]

    return out


# --------------------------------------------------------------------------
# Hosts
# --------------------------------------------------------------------------

def build_hosts(rules, cards):
    hosts = []
    for name, ch in rules["chassis"].items():
        if not ch.get("nmsLicence"):     # OMDs are passive, not sled hosts
            continue
        d, note = DEPTH.get(name, ("std", None))
        hosts.append(OrderedDict([
            ("id", name), ("platform", "GX"), ("name", name),
            ("ru", ch.get("ru")), ("slots", ch.get("slots")),
            ("depthClass", d), ("depthNote", note),
            ("curated", ["depthClass"]),
        ]))
    for name, sh in (cards.get("shelves") or {}).items():
        if not name.startswith("PSS"):
            continue
        d, note = DEPTH.get(name, ("std", None))
        hosts.append(OrderedDict([
            ("id", name), ("platform", "PSS"), ("name", name),
            ("ru", sh.get("ru") if isinstance(sh, dict) else None),
            ("slots", sh.get("slots") if isinstance(sh, dict) else None),
            ("depthClass", d), ("depthNote", note),
            ("curated", ["depthClass"]),
        ]))
    return hosts


def main():
    rules = json.load(open(GX))
    cards = json.load(open(PSS))

    xpdr = build_gx(rules) + build_pss(cards)
    hosts = build_hosts(rules, cards)

    data = OrderedDict([
        ("meta", {
            "generated": "tools/build-xpdr-data.py",
            "sources": [
                "GX BOM Configurator V3.0 (decompiled workbook tables)",
                "1830 PSS / PSI portfolio roadmap, Aug-2026",
            ],
            "scope": "GX + PSS transponders. PSI-M sleds, PSS-x and PSS-HC "
                     "line cards are out of scope for v1.",
            "curatedRules": ["depthClass", "cascade", "wson"],
            "counts": {
                "xpdr": len(xpdr),
                "gx": sum(1 for x in xpdr if x["platform"] == "GX"),
                "pss": sum(1 for x in xpdr if x["platform"] == "PSS"),
                "hosts": len(hosts),
            },
        }),
        ("serviceRateG", SERVICE_RATE),
        ("hosts", hosts),
        ("cascade", CASCADE),
        ("wson", WSON),
        ("xpdr", xpdr),
    ])

    with open(OUT, "w") as f:
        json.dump(data, f, indent=1)

    print("wrote %s" % OUT)
    print("  %d transponders (%d GX, %d PSS), %d hosts"
          % (len(xpdr), data["meta"]["counts"]["gx"],
             data["meta"]["counts"]["pss"], len(hosts)))
    missing = [x["name"] for x in xpdr if not x["lineRatesG"]]
    if missing:
        print("  no line rates parsed for: %s" % ", ".join(missing))
    nocage = [x["name"] for x in xpdr if not x["clientCages"]]
    if nocage:
        print("  no client cages parsed for: %s" % ", ".join(nocage))


if __name__ == "__main__":
    main()
