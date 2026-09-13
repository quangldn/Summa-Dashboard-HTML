#!/usr/bin/env python3
"""1830 PSS/PSI Product Information and Planning Guide -> assets/pss-data.json.

Three tables in that guide carry the numbers a sales engineer actually needs,
and they are the same triad the GX BOM configurator holds in its named ranges:

  Table 5-1/5-2   parts list       abbreviation -> description -> part number
  Table 5-3/5-4   slot ranges      card -> which slots of which shelf it is legal in
  Table 7-147/148 weight and power component -> kg, Pstat, P0, P50, P100, Pmax

So the knowledge base is re-extracted from each new issue of the guide rather
than maintained by hand.

    pip install pdfplumber --break-system-packages
    python3 tools/extract-pss-guide.py "3KC-71311-TAAA-HQZZA_Issue_2.pdf" \
        -o assets/pss-data.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pss_layout as L  # noqa: E402

TOOL_VERSION = "1.0"

SHELF_COLUMNS = [
    "PSS-32", "PSS-16 main", "PSS-16 extension",
    "PSS-16II DC 8RU", "PSS-16II AC/DC 9RU",
    "PSS-8", "PSI-8L", "PSI-4L", "PSS-4II",
]
HC_SHELVES = ["PSS-4hc", "PSS-10hc"]

NOTE_RX = re.compile(r"^(Notes?:|\d+\.\s)")
NA_RX = re.compile(r"^(-|N/?A|None)$", re.I)
# rows the reader picks up that are the table's own furniture, not data
JUNK_RX = re.compile(r"^(Abbreviation|Description|Part\s*number|Component|Card|"
                     r"Table\s*\d+-\d+|<slot range>|\(continued\)|Notes?:)", re.I)
# a card mnemonic: no spaces, mostly upper-case and digits
CARD_RX = re.compile(r"^[A-Z0-9][A-Z0-9\-/.]{1,23}$")


def clean(v):
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return None or (s if s and not NA_RX.match(s) else None)


def num(v):
    if v is None:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def find_pages(pdf, title_rx, first_hint=0):
    """Page indices whose text contains this table title, in document order."""
    rx = re.compile(title_rx.replace(" ", r"\s*"), re.I)
    hits = []
    for i in range(max(0, first_hint - 4), len(pdf.pages)):
        t = (pdf.pages[i].extract_text() or "").replace(" ", "")
        if rx.search(t):
            hits.append(i)
        elif hits and i > hits[-1] + 1:
            break                      # the run of continuation pages has ended
    return hits


# --------------------------------------------------------------------------- #
# sections
# --------------------------------------------------------------------------- #
def parts(pdf, pages, cat_from_single=True):
    """Table 5-1 / 5-2: the orderable-items list.

    Single-cell rows are the table's own category headings ("Rack", "Shelf and
    shelf kits", "Optical amplifiers" ...), and rows with no abbreviation are
    further part numbers under the abbreviation above them — a card and its
    regional or generational variants share one mnemonic.
    """
    cols = first_header(pdf, pages, ["Abbreviation", "Description", "Part number"])
    if not cols:
        return []
    out, category, last_abbr = [], None, None
    for r in L.table_rows([pdf.pages[i] for i in pages], cols):
        abbr = clean(r.get("Abbreviation"))
        desc = clean(r.get("Description"))
        pn = clean(r.get("Part number"))
        if abbr and JUNK_RX.match(abbr):
            continue
        if abbr and not desc and not pn:
            # a lone cell is the table's own category heading — unless it is
            # the narrative that precedes the table on its first page
            if cat_from_single and len(abbr) < 60:
                category = abbr
            continue
        if desc and (NOTE_RX.match(desc) or JUNK_RX.match(desc)):
            continue
        if abbr:
            last_abbr = abbr
        if not (desc or pn):
            continue
        out.append({
            "abbrev": abbr or last_abbr,
            "isVariant": abbr is None,
            "description": desc,
            "partNumber": pn,
            "category": category,
        })
    return out


def first_header(pdf, pages, names):
    """Header x positions from the first page of the run that carries them."""
    for i in pages:
        cols = L.header_columns(pdf.pages[i], names)
        if len(cols) >= len(names):
            return cols
    return None


def slot_ranges(pdf, pages, shelves, first_col="Card"):
    """Table 5-3 / 5-4: legal slot ranges per card per shelf.

    The header is stacked three deep ("PSS-16 Shelf" over "Main"/"Extension"),
    so the columns are taken from the all-columns-populated "<slot range>" row
    instead, which is the shelf-wide range and doubles as a sanity check.
    """
    ruler = None
    for i in pages:
        for _, words in L.lines_of(pdf.pages[i]):
            cells = L.to_cells(words)
            if cells and cells[0][1].startswith("<slot range>"):
                ruler = cells
                break
        if ruler:
            break
    if not ruler or len(ruler) < len(shelves) + 1:
        return {}, None
    cols = [(ruler[0][0], first_col)] + [
        (ruler[i + 1][0], shelves[i]) for i in range(len(shelves))
    ]
    shelf_wide = {shelves[i]: clean(ruler[i + 1][1]) for i in range(len(shelves))}

    out = {}
    for r in L.table_rows([pdf.pages[i] for i in pages], cols):
        card = clean(r.get(first_col))
        if not card or JUNK_RX.match(card) or not CARD_RX.match(card):
            continue
        rec = {}
        for s in shelves:
            v = clean(r.get(s))
            if v and v != "-":
                rec[s] = v
        if rec:
            out.setdefault(card, {}).update(rec)
    return out, shelf_wide


def power(pdf, pages):
    """Table 7-147 / 7-148: weight and power.

    Pstat and Pmax carry footnote markers set at 5 pt; the layout reader drops
    them by size, so these numbers need no cleaning afterwards. Pmax is the
    figure to size a feed from; P100 is the figure to size cooling from.
    """
    cols = first_header(pdf, pages, ["Component", "Description", "Weight"])
    if not cols:
        return []
    # the five power columns are unlabelled in the flattened header (P with a
    # subscript), so take their x positions from the first all-numeric row
    numeric = None
    for i in pages:
        for _, words in L.lines_of(pdf.pages[i]):
            cells = L.to_cells(words)
            tail = [c for c in cells if re.fullmatch(r"\d+(?:\.\d+)?", c[1])]
            if len(tail) >= 6:
                numeric = tail
                break
        if numeric:
            break
    if not numeric:
        return []
    names = ["weightKg", "pStat", "p0", "p50", "p100", "pMax"]
    cols = [c for c in cols if c[1] != "Weight"]
    cols += [(numeric[i][0], names[i]) for i in range(min(len(names), len(numeric)))]
    cols.sort()

    out, last_comp, section = [], None, None
    for r in L.table_rows([pdf.pages[i] for i in pages], cols, marks=True):
        comp = clean(r.get("Component"))
        desc = clean(r.get("Description"))
        if comp and JUNK_RX.match(comp):
            continue
        if comp and not desc and not r.get("weightKg"):
            # a lone cell is either a section heading ("Common", "Amplifiers")
            # or a component name spanning the rows of its variants
            if " " not in comp and not comp[0].isupper():
                section = comp
            last_comp = comp
            continue
        if desc and (NOTE_RX.match(desc) or JUNK_RX.match(desc)):
            continue
        if comp:
            last_comp = comp
        marks = r.get("_marks") or {}
        notes = sorted(set(marks.get("Component", []) + marks.get("Description", [])))
        rec = {"component": comp or last_comp, "description": desc, "section": section}
        for n in names:
            rec[n] = num(r.get(n))
        # notes 7 and 8 of Table 7-147 are the only statement of card width
        # anywhere in the guide
        rec["slots"] = 3 if 8 in notes else 2 if 7 in notes else 1
        if notes:
            rec["notes"] = notes
        if rec["component"] and (rec["weightKg"] is not None or rec["pMax"] is not None):
            out.append(rec)
    return out


def glossary(pdf, start_hint=1500):
    """The guide's own glossary — terms are set bold, definitions are not.

    Worth carrying into the knowledge base: it is the only place that spells
    out what the mnemonics on the faceplates actually stand for, and a sales
    engineer reads far more acronyms than part numbers.
    """
    first = None
    for i in range(start_hint, len(pdf.pages)):
        t = (pdf.pages[i].extract_text() or "").strip()
        if t.startswith("Glossary") and "..." not in t[:40]:
            first = i
            break
    if first is None:
        return []

    out, term, buf = [], None, []

    def flush():
        if not (term and buf):
            return
        t, d = term, " ".join(buf).strip()
        # the closing bracket of "... module (XFP)" is set unbold, so the term
        # loses it when the bold run ends
        if t.count("(") > t.count(")"):
            t += ")"
        if len(t) < 2 or "Nokia 1830 PSS" in d or re.fullmatch(r"[A-Z]( [A-Z])+", t):
            return                              # running heads from the back matter
        out.append({"term": t, "definition": d})

    for i in range(first, len(pdf.pages)):
        words = pdf.pages[i].extract_words(extra_attrs=["fontname", "size"],
                                           x_tolerance=1.5)
        lines = {}
        for w in words:
            if w["size"] < 9:                 # page furniture is set smaller
                continue
            lines.setdefault(round(w["top"] / 2.0), []).append(w)
        for key in sorted(lines):
            row = sorted(lines[key], key=lambda w: w["x0"])
            text = " ".join(w["text"] for w in row).strip()
            if not text or text in ("Glossary",) or len(text) == 1:
                continue
            bold = sum(1 for w in row if "Bold" in w["fontname"])
            if bold >= max(1, len(row) - 1):
                flush()
                term, buf = text.rstrip(" )") if text.endswith(" )") else text, []
            elif term:
                buf.append(text)
    flush()
    return out


def pluggables(pdf, pages):
    """Table 7-148: gray pluggables, a flatter table — name, weight, watts."""
    cols = first_header(pdf, pages, ["Pluggable", "Weight", "Power consumption"])
    if not cols:
        return []
    cols = [(x, {"Power consumption": "watts", "Weight": "weightKg"}.get(n, n))
            for x, n in cols]
    out = []
    for r in L.table_rows([pdf.pages[i] for i in pages], cols):
        name = clean(r.get("Pluggable"))
        if not name or JUNK_RX.match(name):
            continue
        rec = {"pluggable": name, "weightKg": num(r.get("weightKg")),
               "watts": num(r.get("watts"))}
        if rec["weightKg"] is not None or rec["watts"] is not None:
            out.append(rec)
    return out


# --------------------------------------------------------------------------- #
def build(path: Path):
    with pdfplumber.open(path) as pdf:
        meta = pdf.metadata or {}
        p51 = find_pages(pdf, "Table 5-1 List of 1830 PSS orderable items", 1100)
        p52 = find_pages(pdf, "Table 5-2 Part list of 1830 PSS-4hc", p51[-1] if p51 else 1180)
        p53 = find_pages(pdf, "Table 5-3 Slot ranges per card/shelf type", 1180)
        p54 = find_pages(pdf, "Table 5-4 Slot ranges per card/shelf type for hc", 1190)
        p7a = find_pages(pdf, "Table 7-147 Weight and power consumption", 1550)
        p7b = find_pages(pdf, "Table 7-148 Weight and power consumption", 1570)

        items = parts(pdf, p51) if p51 else []
        items_hc = parts(pdf, p52, cat_from_single=False) if p52 else []
        slots, wide = slot_ranges(pdf, p53, SHELF_COLUMNS) if p53 else ({}, None)
        slots_hc, wide_hc = slot_ranges(pdf, p54, HC_SHELVES) if p54 else ({}, None)
        pw = power(pdf, p7a) if p7a else []
        pw_plug = pluggables(pdf, p7b) if p7b else []
        gloss = glossary(pdf, 1500)

    for card, rec in slots_hc.items():
        slots.setdefault(card, {}).update(rec)

    return {
        "meta": {
            "source_file": path.name,
            "title": meta.get("Title"),
            "issue": meta.get("Keywords"),
            "extractor_version": TOOL_VERSION,
            "extracted_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "pages": {"parts": p51 + p52, "slots": p53 + p54, "power": p7a + p7b},
        },
        "shelves": {"slotRange": wide or {}, "hcSlotRange": wide_hc or {}},
        "parts": items + items_hc,
        "slotRanges": slots,
        "power": pw,
        "powerPluggables": pw_plug,
        "glossary": gloss,
    }


def summarise(d):
    m = d["meta"]
    print(f"  source            {m['source_file']}")
    print(f"  document          {(m.get('title') or '').strip()[:70]}")
    print(f"  parts             {len(d['parts'])}")
    print(f"  cards with slots  {len(d['slotRanges'])}")
    print(f"  power rows        {len(d['power'])} + {len(d['powerPluggables'])} pluggables")
    print(f"  glossary terms    {len(d.get('glossary', []))}")
    withpn = sum(1 for p in d["parts"] if p.get("partNumber"))
    print(f"  parts with a PN   {withpn}")
    cats = {}
    for p in d["parts"]:
        cats[p.get("category")] = cats.get(p.get("category"), 0) + 1
    print(f"  categories        {len(cats)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("assets/pss-data.json"))
    a = ap.parse_args()
    data = build(a.pdf)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(data, indent=1), encoding="utf-8")
    print(f"\nwrote {a.out}  ({a.out.stat().st_size // 1024} KB)\n")
    summarise(data)


if __name__ == "__main__":
    main()
