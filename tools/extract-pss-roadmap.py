#!/usr/bin/env python3
"""ON Consolidated Roadmap (PSS / PSI-M / PSD / WaveSuite) -> pss-roadmap.json.

The roadmap deck is built the same way on every product slide: one table whose
first row is the product names and whose remaining rows are attributes. That
shape survives a quarterly refresh, so the deck can be re-read rather than
transcribed.

    python3 tools/extract-pss-roadmap.py "ON Consolidated Roadmap ....pptx" \
        -o assets/pss-roadmap.json

Release wording is kept verbatim ("GA", "GA (NG R27.Q1)", "R28.1H"), because
the difference between shipping and planned is the whole point of the deck and
normalising it would quietly invent certainty.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from pptx import Presentation

TOOL_VERSION = "1.0"

# slides whose product families are in scope; anything else is captured as
# narrative so nothing is silently dropped
IN_SCOPE = re.compile(r"\b(PSS|PSI)\b", re.I)
TITLE_RX = re.compile(r"^(1830|WaveSuite|QSN|Main Program|Overall Product)", re.I)


def clean(s):
    if s is None:
        return None
    s = re.sub(r"[ \t]+", " ", str(s)).strip()
    s = re.sub(r"\n{2,}", "\n", s)
    return s or None


def slide_title(slide, tables_text):
    """The deck puts the slide title in a text box, often after the table."""
    best = None
    for sh in slide.shapes:
        if not sh.has_text_frame:
            continue
        t = clean(sh.text_frame.text)
        if not t or "\n" in t or len(t) > 80:
            continue
        if TITLE_RX.match(t):
            return t
        if best is None and len(t) > 6:
            best = t
    return best


def read_table(tbl):
    """[[cell, ...], ...] with merged newlines kept as ' / ' like the deck reads."""
    rows = []
    for r in tbl.rows:
        rows.append([clean(c.text).replace("\n", " / ") if clean(c.text) else None
                     for c in r.cells])
    return rows


def products_from(rows):
    """First row is the product header; the rest are attribute rows."""
    if len(rows) < 2:
        return []
    header = rows[0]
    names = [(i, h) for i, h in enumerate(header) if h and i > 0]
    # de-duplicate the merged cells python-pptx repeats across a span
    seen, cols = set(), []
    for i, h in names:
        if h in seen:
            continue
        seen.add(h)
        cols.append((i, h))
    out = []
    for i, name in cols:
        attrs = {}
        for r in rows[1:]:
            key = r[0]
            if not key or i >= len(r):
                continue
            v = r[i]
            if v and v != key:
                attrs[key] = v
        if attrs:
            out.append({"name": name, "attributes": attrs})
    return out


def build(path: Path):
    prs = Presentation(path)
    slides, narrative = [], []
    for n, s in enumerate(prs.slides, 1):
        tables = [read_table(sh.table) for sh in s.shapes if sh.has_table]
        title = slide_title(s, tables)
        prods = []
        for t in tables:
            prods += products_from(t)
        notes = [clean(sh.text_frame.text) for sh in s.shapes
                 if sh.has_text_frame and clean(sh.text_frame.text)]
        if prods:
            slides.append({
                "slide": n,
                "title": title,
                "inScope": bool(title and IN_SCOPE.search(title)) or
                           any(IN_SCOPE.search(p["name"]) for p in prods),
                "products": prods,
                "captions": [x for x in notes if x != title and len(x) < 200],
            })
        elif notes:
            narrative.append({"slide": n, "title": title, "text": notes})

    return {
        "meta": {
            "source_file": path.name,
            "extractor_version": TOOL_VERSION,
            "extracted_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "slides": len(prs.slides),
        },
        "tables": slides,
        "narrative": narrative,
    }


def summarise(d):
    print(f"  source            {d['meta']['source_file']}")
    print(f"  slides            {d['meta']['slides']}")
    print(f"  product tables    {len(d['tables'])}")
    print(f"  products          {sum(len(s['products']) for s in d['tables'])}")
    print(f"  in scope (PSS/PSI){sum(1 for s in d['tables'] if s['inScope']):>4}")
    print(f"  narrative slides  {len(d['narrative'])}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pptx", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("assets/pss-roadmap.json"))
    a = ap.parse_args()
    d = build(a.pptx)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(d, indent=1), encoding="utf-8")
    print(f"\nwrote {a.out}  ({a.out.stat().st_size // 1024} KB)\n")
    summarise(d)


if __name__ == "__main__":
    main()
