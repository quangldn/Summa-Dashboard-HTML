#!/usr/bin/env python3
"""
Extract the reusable knowledge from the Nokia 1830 PSS Release 26.6 document
set — features and hardware, never provisioning.

    pip install pdfplumber --break-system-packages
    python3 extract-pss-266.py <folder-with-the-pdfs> -o <output-folder>

Point it at the folder holding the 3KC-*.pdf release set. It writes:

    doc-map.json        every document: code, pages, title, what it is for
    <CODE>-toc.json     section index with printed page numbers, per document
    features.json       the feature taxonomy from the TQ feature volume
    new-in-26.6.md      the release delta, sections 1.2 and 1.3, verbatim
    glossary.json       terms from the planning guide's glossary appendix
    doc-numbers.json    what each 3KC-… CDoc number is, so the right manual is
                        picked without opening any of them

Two things about these PDFs that defeat ordinary text extraction:

  * CDoc emits no space glyphs. "OpticalChannelProtection(OCHP)" is one run of
    characters; the spaces have to be reconstructed from x-gaps, which is what
    x_tolerance does. Everything here reads words, never raw page text.
  * The printed page number and the PDF page index differ by the front matter,
    and the offset is not constant across documents. Headings are located by
    searching for their text rather than trusting an offset.
"""

import argparse
import json
import os
import re
import sys
from collections import OrderedDict

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber is required:  pip install pdfplumber --break-system-packages")


# --------------------------------------------------------------------------
# The document set. The trailing two letters of the CDoc number identify the
# manual; the middle number separates the PSS product docs (71311) from the
# NETCONF/gRPC interface guides (70118).
#
# `use` is the whole point of this table: it says which document answers which
# kind of question, so a later session routes straight there instead of
# opening 37,000 pages to find out.
# --------------------------------------------------------------------------
DOC_ROLE = {
    ("71311", "HQ"): ("Product Information and Planning Guide",
                      "hardware", "PRIMARY hardware source: shelves, cards, slot "
                      "ranges, weight, power, glossary. PSS-4II/8/16II/32/PSI."),
    ("71311", "TQ"): ("Product Information and Planning Guide (Feature Information)",
                      "features", "PRIMARY feature source: node configurations, "
                      "protection, DCC, Carrier Ethernet, sync, OAM&P, interworking."),
    ("71311", "SQ"): ("Product Information and Planning Guide",
                      "hardware", "Hardware for the packet-optical family: "
                      "PSS-8x/12x/24x. The only source for those shelves."),
    ("71311", "TW"): ("GMPLS Control Plane Guide",
                      "features", "L0 GMPLS / WSON restoration, ASON, path "
                      "computation. Read this for anything control-plane."),
    ("71311", "TP"): ("DCN Planning and Engineering Guide",
                      "features", "Management network design — topology options, "
                      "addressing, scale limits."),
    ("71311", "SD"): ("Security and Data Privacy Guide",
                      "features", "Security posture, data privacy, hardening."),
    ("71311", "TN"): ("Quick Reference Guide",
                      "reference", "Condensed card and faceplate reference — often "
                      "the fastest path to a mnemonic or LED meaning."),
    ("71311", "TC"): ("User Provisioning Guide", "provisioning",
                      "OUT OF SCOPE — provisioning."),
    ("71311", "SC"): ("User Provisioning Guide (PSS-8x/12x/24x)", "provisioning",
                      "OUT OF SCOPE — provisioning."),
    ("71311", "TG"): ("TL1 Commands and Messages Guide", "provisioning",
                      "OUT OF SCOPE — command reference."),
    ("71311", "TH"): ("Command Line Interface Guide", "provisioning",
                      "OUT OF SCOPE — command reference."),
    ("71311", "TM"): ("Maintenance and Trouble-Clearing Guide", "operations",
                      "OUT OF SCOPE — fault clearing."),
    ("71311", "TA"): ("Safety (multilingual)", "safety",
                      "OUT OF SCOPE — regulatory safety text."),
    ("71311", "SF"): ("Installation and System Turn-Up (PSS-24x, 48T fabric)",
                      "install", "Physical install — out of scope unless asked."),
    ("71311", "SH"): ("Installation and System Turn-Up (PSS-4hc/10hc)",
                      "install", "Physical install — out of scope unless asked."),
    ("71311", "SK"): ("Installation and System Turn-Up (PSS-8x)",
                      "install", "Physical install — out of scope unless asked."),
    ("71311", "SL"): ("Installation and System Turn-Up (PSS-8)",
                      "install", "Physical install — out of scope unless asked."),
    ("71311", "SM"): ("Installation and System Turn-Up (PSS-16II)",
                      "install", "Physical install — out of scope unless asked."),
    ("71311", "SN"): ("Installation and System Turn-Up (PSS-12x)",
                      "install", "Physical install — out of scope unless asked."),
    ("71311", "TJ"): ("Installation and System Turn-Up (PSS-32)",
                      "install", "Physical install — out of scope unless asked."),
    ("71311", "TK"): ("Installation and System Turn-Up (PSS-4II)",
                      "install", "Physical install — out of scope unless asked."),
    ("71311", "TL"): ("Installation and System Turn-Up (PSI-4L/8L)",
                      "install", "Physical install — out of scope unless asked."),
    ("70118", "TC"): ("NETCONF/gRPC Interface Guide (PSS-8/16II/32)",
                      "provisioning", "OUT OF SCOPE — northbound interface."),
    ("70118", "SC"): ("NETCONF/gRPC Interface Guide (PSS-8x/12x/24x)",
                      "provisioning", "OUT OF SCOPE — northbound interface."),
}

IN_SCOPE = ("hardware", "features", "reference")


# --------------------------------------------------------------------------
# Text handling
# --------------------------------------------------------------------------

def words_text(page, x_tol=1.5):
    """Page text with the spaces put back.

    CDoc PDFs carry no space glyphs, so extract_text() returns
    "OpticalChannelProtection(OCHP)". Rebuilding from words with a tight
    x_tolerance restores the gaps; 1.5 is the value that separates words
    without splitting inside them at this font size.
    """
    try:
        ws = page.extract_words(x_tolerance=x_tol, keep_blank_chars=False)
    except Exception:
        return page.extract_text() or ""
    lines, cur, last_top = [], [], None
    for w in ws:
        top = round(w["top"], 1)
        if last_top is None or abs(top - last_top) < 3:
            cur.append(w["text"])
        else:
            lines.append(" ".join(cur))
            cur = [w["text"]]
        last_top = top
    if cur:
        lines.append(" ".join(cur))
    return "\n".join(lines)


def squash(s):
    return re.sub(r"\s+", "", s or "").lower()


# --------------------------------------------------------------------------
# Document map
# --------------------------------------------------------------------------

FNAME = re.compile(r"3KC-(\d+)-TAAA-([A-Z]{2})ZZ[A-Z]_Issue_(\d)", re.I)


def build_doc_map(folder):
    docs = []
    for fn in sorted(os.listdir(folder)):
        m = FNAME.search(fn)
        if not m:
            continue
        series, code, issue = m.group(1), m.group(2).upper(), int(m.group(3))
        path = os.path.join(folder, fn)
        try:
            with pdfplumber.open(path) as pdf:
                pages = len(pdf.pages)
                first = words_text(pdf.pages[0])
        except Exception as e:
            print("  ! %s: %s" % (fn, e))
            continue

        lines = [l.strip() for l in first.split("\n") if l.strip()]
        title = shelves = None
        for i, l in enumerate(lines):
            if re.match(r"Release\s", l) and i + 1 < len(lines):
                title = lines[i + 1]
                shelves = " ".join(lines[1:i]).replace("Photonic Service Switch", "PSS")
                break

        role = DOC_ROLE.get((series, code))
        docs.append(OrderedDict([
            ("code", code), ("series", series), ("issue", issue),
            ("file", fn), ("pages", pages),
            ("title", (role[0] if role else title) or "unidentified"),
            ("titleFromPdf", title),
            ("appliesTo", (shelves or "").strip()),
            ("kind", role[1] if role else "unknown"),
            ("use", role[2] if role else "Not catalogued — open it and find out."),
        ]))
    return docs


# --------------------------------------------------------------------------
# Section index
# --------------------------------------------------------------------------

TOC_LINE = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){0,2})\s+(.+?)\.{3,}\s*(\d{1,5})$")


def build_toc(path, scan_pages=44):
    """Section number, title and PRINTED page from the contents pages.

    Read through words_text, not extract_text: the contents pages have the
    same missing-space problem as the body, and a title guessed back into
    shape with a camel-case regex still comes out as "In-lineamplifier" and
    "IPREAMPconfigurations". Reconstructing from x-gaps gets it right.
    """
    rows = []
    with pdfplumber.open(path) as pdf:
        limit = min(scan_pages, len(pdf.pages))
        for i in range(1, limit):
            for l in words_text(pdf.pages[i]).split("\n"):
                l = re.sub(r"\s*\.\s*(?=\.)", ".", l)     # ". . . ." -> "...."
                m = TOC_LINE.match(l.strip())
                if not m:
                    continue
                t = re.sub(r"\s+", " ", m.group(2)).strip()
                rows.append(OrderedDict([("sec", m.group(1)),
                                         ("title", t),
                                         ("page", int(m.group(3)))]))
    # Drop duplicates the contents pages repeat in their own headers.
    seen, out = set(), []
    for r in rows:
        k = (r["sec"], r["page"])
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def page_offset(path, toc, probes=6):
    """PDF index minus printed page number.

    Measured rather than assumed: find a handful of section headings in the
    body and take the modal difference, because the front matter length
    varies between these documents.
    """
    if not toc:
        return 0
    diffs = []
    with pdfplumber.open(path) as pdf:
        n = len(pdf.pages)
        for row in toc[:60]:
            if len(diffs) >= probes:
                break
            target = squash(row["sec"] + row["title"])[:40]
            lo = max(0, row["page"] - 8)
            for i in range(lo, min(row["page"] + 30, n)):
                if target and target in squash(pdf.pages[i].extract_text() or ""):
                    diffs.append(i - row["page"])
                    break
    if not diffs:
        return 0
    return max(set(diffs), key=diffs.count)


def section_text(path, toc, sec, offset, max_pages=30):
    """Every page of one section, with spaces restored."""
    idx = next((i for i, r in enumerate(toc) if r["sec"] == sec), None)
    if idx is None:
        return None
    start = toc[idx]["page"] + offset
    nxt = toc[idx + 1]["page"] + offset if idx + 1 < len(toc) else start + max_pages
    out = []
    with pdfplumber.open(path) as pdf:
        for i in range(max(0, start), min(nxt, len(pdf.pages), start + max_pages)):
            out.append(words_text(pdf.pages[i]))
    return "\n".join(out)


# --------------------------------------------------------------------------
# Cleaning the running headers and footers out of captured body text
# --------------------------------------------------------------------------

NOISE = [
    r"^©\s*\d{4}\s*Nokia", r"^Use subject to agreed restrictions",
    r"^Release\s*26\.6$", r"^July\s*20\d\d$", r"^June\s*20\d\d$",
    r"^Issue\s*\d\s*3KC-", r"^\d+\s*3KC-", r"^3KC-\S+\s*Issue\s*\d$",
    r"^Nokia\s*1830\s*PSS", r"^\d{1,4}$",
]
NOISE_RE = [re.compile(p, re.I) for p in NOISE]


def clean(text):
    keep = []
    for l in (text or "").split("\n"):
        l = l.rstrip()
        if not l.strip():
            continue
        if any(r.search(l.strip()) for r in NOISE_RE):
            continue
        keep.append(l)
    # Collapse the repeated chapter/section banner lines.
    out, prev = [], None
    for l in keep:
        if l == prev:
            continue
        out.append(l)
        prev = l
    return "\n".join(out)


# --------------------------------------------------------------------------
# Glossary and part numbers
# --------------------------------------------------------------------------

# A glossary term: a short run, no trailing full stop, often an acronym or a
# term with its acronym in brackets. The definition is the line or lines that
# follow it — this glossary is one column, not a term/definition table, so the
# split is vertical and not by whitespace.
TERM = re.compile(r"^([A-Z][A-Za-z0-9 \-/+().,]{1,54})$")

# The CDoc document number itself. Decoding it is what lets a later session
# pick the right manual out of two dozen without opening any of them.
DOCNUM = re.compile(r"\b3KC-(\d{5})-TAAA-([A-Z]{2})ZZ([A-Z])\b")


def build_glossary(path, toc, offset):
    """Terms from the guide's glossary appendix.

    The appendix carries no section number, so the TOC cannot find it — it is
    located by its heading instead. Each entry is a term line followed by one
    or more definition lines; a line is read as a new term when it is short,
    has no sentence punctuation, and does not continue the previous sentence.
    """
    start = None
    with pdfplumber.open(path) as pdf:
        n = len(pdf.pages)
        for i in range(max(0, n - 140), n):
            head = (pdf.pages[i].extract_text() or "")[:80]
            if re.match(r"\s*Glossary", head, re.I):
                start = i
                break
        if start is None:
            return []

        terms, cur, buf = [], None, []
        for i in range(start, n):
            for l in words_text(pdf.pages[i], x_tol=1.5).split("\n"):
                l = l.strip()
                if not l or any(r.search(l) for r in NOISE_RE):
                    continue
                if re.match(r"^(Glossary|Nokia\s*1830|\d+/PSI)", l, re.I):
                    continue
                looks_term = (TERM.match(l) and len(l) <= 56
                              and not l.endswith(".")
                              and not l[0].islower())
                if looks_term and (not buf or len(buf) > 0):
                    if cur and buf:
                        terms.append({"term": cur, "means": " ".join(buf).strip()})
                    cur, buf = l, []
                elif cur:
                    buf.append(l)
        if cur and buf:
            terms.append({"term": cur, "means": " ".join(buf).strip()})

    # A definition of one or two words is almost always a wrapped term line.
    return [t for t in terms if len(t["means"].split()) >= 3]


def decode_doc_numbers(folder):
    """Turn the CDoc numbers in the folder into a decoder table."""
    seen = {}
    for fn in sorted(os.listdir(folder)):
        m = FNAME.search(fn)
        if not m:
            continue
        series, code = m.group(1), m.group(2).upper()
        role = DOC_ROLE.get((series, code))
        seen["3KC-%s-TAAA-%sZZA" % (series, code)] = {
            "series": series,
            "seriesMeans": ("PSS product documentation" if series == "71311"
                            else "NETCONF/gRPC interface documentation"),
            "code": code,
            "document": role[0] if role else "unidentified",
            "kind": role[1] if role else "unknown",
        }
    return [dict(docNumber=k, **v) for k, v in sorted(seen.items())]


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", help="folder holding the 3KC-*.pdf release set")
    ap.add_argument("-o", "--out", default="pss266-knowledge")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    W = lambda name, obj: json.dump(obj, open(os.path.join(args.out, name), "w"),
                                    indent=1, ensure_ascii=False)

    print("cataloguing…")
    docs = build_doc_map(args.folder)
    W("doc-map.json", docs)
    print("  %d documents, %d pages total"
          % (len(docs), sum(d["pages"] for d in docs)))
    for d in docs:
        if d["kind"] == "unknown":
            print("  ! not catalogued: %s %s" % (d["code"], d["file"]))

    by_code = {d["code"]: d for d in docs}

    for code in ("TQ", "HQ", "SQ", "TW", "TP", "SD", "TN"):
        d = by_code.get(code)
        if not d:
            continue
        path = os.path.join(args.folder, d["file"])
        toc = build_toc(path)
        off = page_offset(path, toc)
        d["pageOffset"] = off
        W("%s-toc.json" % code, toc)
        print("  %-3s %4d sections, printed-page offset %+d" % (code, len(toc), off))

        if code == "TQ":
            # The release delta, verbatim — it is the one part of a feature
            # guide that goes stale, so it is captured rather than summarised.
            md = ["# New in 1830 PSS Release 26.6",
                  "",
                  "Verbatim from %s Issue %d, sections 1.2 and 1.3." % (d["file"], d["issue"]),
                  ""]
            for sec, head in (("1.2", "New features — WDM"),
                              ("1.3", "New features — GMPLS Control Plane")):
                body = section_text(path, toc, sec, off, max_pages=24)
                if body:
                    md += ["## " + head, "", "```", clean(body), "```", ""]
            open(os.path.join(args.out, "new-in-26.6.md"), "w").write("\n".join(md))
            W("features.json", [r for r in toc if "." in r["sec"]])

        if code == "HQ":
            g = build_glossary(path, toc, off)
            W("glossary.json", g)
            print("      glossary: %d terms" % len(g))

    W("doc-map.json", docs)
    W("doc-numbers.json", decode_doc_numbers(args.folder))
    print("  document-number decoder written")
    print("wrote %s/" % args.out)


if __name__ == "__main__":
    main()
