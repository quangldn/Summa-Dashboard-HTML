#!/usr/bin/env python3
"""
Build assets/pss-266.json — the data behind pss-features.html.

Input is the output folder of tools/extract-pss-266.py (the Release 26.6
document set, read once and cached), not the PDFs themselves. The PDFs are
660 MB and live outside the repo; this keeps the page's data small enough to
commit and re-buildable whenever a new release lands.

    python3 tools/build-pss-266-data.py <extract-output-folder>

Three things come out:

  docs      the routing table — which of the 24 manuals answers what
  features  the TQ feature taxonomy, 8 chapters and 100 sections, with the
            printed page number of each so a lookup is one jump
  whatsNew  the R26.6 delta, parsed out of the verbatim capture into
            hardware / pluggables / software / control-plane groups
"""

import argparse
import json
import os
import re
import sys
from collections import OrderedDict

CHAPTERS = OrderedDict([
    ("1", ("Features", "Overview, and the Release 26.6 delta itself.")),
    ("2", ("Configurations",
            "The biggest chapter by far — ILA and OADM through every ROADM "
            "flavour, alien wavelengths, Wavelength Tracker, OTDR, all the "
            "protection schemes, OpenZR+, subsea and gridless.")),
    ("3", ("Data Center Connect",
            "DCC features and DCC security — the DCI story in Nokia's own words.")),
    ("4", ("Carrier Ethernet",
            "Provider Bridge and MPLS-TP operational modes, Ethernet OAM, "
            "SMART SFPs.")),
    ("5", ("Synchronization",
            "SyncE, IEEE 1588v2 PTP, and which cards can do which.")),
    ("6", ("OAM&P",
            "Fault and alarm management, loopbacks, performance monitoring, "
            "thresholding, software and database management.")),
    ("7", ("System planning",
            "WaveSuite Planner, power and grounding, operating environment.")),
    ("8", ("Interworking",
            "OCS uplink, DCN interoperability, photonic line interworking.")),
])

# A section's topic, inferred from its title, so the page can filter by the
# thing an SE is actually looking for rather than by chapter number.
# Order matters: the first pattern that matches wins, so the more specific
# subject has to come before the more general one it shares vocabulary with.
# Every acronym is anchored with \b — an unanchored one matches inside an
# unrelated word and files the section under the wrong subject. Three did:
# MPLS inside GMPLS, DGE inside "Provider Bridge", ATP inside no word but
# ahead of nothing useful. Each guard below is there because a real section
# landed in the wrong place without it.
TOPICS = [
    (r"GMPLS|control plane|restoration|\bASON\b", "Control plane"),
    # Before Security *and* Protection: "Anti-theft Protection (ATP)" is a
    # security feature that happens to have Protection in its name.
    (r"anti-?theft|\bATP\b", "Security"),
    # Before Carrier Ethernet: "Synchronous Ethernet (SyncE)" is a
    # synchronization section, and Ethernet would otherwise claim it.
    (r"SyncE|1588|\bPTP\b|synchroni|time of day", "Synchronization"),
    # Before Monitoring: "Spectrum sharing in subsea environment" is subsea,
    # and 'spectrum' would otherwise claim it.
    (r"subsea|\bSLTE\b|repeater", "Subsea"),
    (r"protection|\bOCHP\b|\bOMSP\b|\bOLP\b|Y-cable|\bSNCP\b|\bOPS\b", "Protection"),
    (r"ROADM|OADM|\bWSS\b|\bWR\d|\bCDC\b|colourless|colorless", "ROADM"),
    # \bDGE\b, not DGE: without the boundary "Provider Bridge" matches on the
    # dge in Bridge and two Carrier Ethernet sections become amplifier ones.
    (r"amplif|\bILA\b|\bIPREAMP\b|Raman|\bgain\b|\bDGE\b|\bAPR\b|power",
     "Amplifier / power"),
    (r"\bOTDR\b|monitor|\bOCM\b|Wavelength\s*Tracker|WTOCM|\bOSA\b|spectrum",
     "Monitoring"),
    (r"alien|OpenZR|gridless|single.?fiber|single channel", "Line system"),
    (r"\bDCC\b|Data Center", "Data Center Connect"),
    # \bMPLS\b, not MPLS: without the boundary "GMPLS CP" matches and the
    # control-plane section gets filed under Carrier Ethernet.
    (r"Ethernet|\bMPLS\b|MPLS-TP|Provider Bridge|SMART SFP|\bL2\b",
     "Carrier Ethernet"),
    (r"secur|privacy", "Security"),
    (r"alarm|fault|loopback|diagnostic|performance|threshold|report", "OAM&P"),
    # \bOSC, not \bOSC\b: OSCT and OSCSFP are OSC hardware and a closing
    # boundary drops "LD and OSCT configurations" into General.
    (r"\bOSC|\bEOSCF\b|neighbor|discovery", "OSC / discovery"),
    (r"software|database|provision|inventory|state", "System management"),
]


def topic_of(title):
    for pat, name in TOPICS:
        if re.search(pat, title, re.I):
            return name
    return "General"


def load(folder, name):
    p = os.path.join(folder, name)
    if not os.path.exists(p):
        return None
    return json.load(open(p, encoding="utf-8"))


# --------------------------------------------------------------------------
# What's new — parse the verbatim capture into items
# --------------------------------------------------------------------------

GROUP_HEAD = re.compile(r"^(1\.[23]\.\d)\s+(.+)$")
BULLET = re.compile(r"^[•·]\s*(.+)$")
SUB = re.compile(r"^[−–—-]\s*(.+)$")


def parse_whats_new(md):
    """The delta arrives as a verbatim page capture. Structure is carried by
    the bullet glyph: • starts an item, − continues it as a sub-point, and a
    plain line is prose belonging to the item above."""
    groups, cur_group, cur_item = [], None, None
    for raw in (md or "").split("\n"):
        l = raw.strip()
        if not l or l in ("```",):
            continue

        m = GROUP_HEAD.match(l)
        if m:
            title = re.sub(r"\s+", " ", m.group(2)).strip()
            if re.match(r"overview", title, re.I):
                continue
            cur_group = {"sec": m.group(1), "title": title, "items": []}
            groups.append(cur_group)
            cur_item = None
            continue

        if cur_group is None:
            continue

        m = BULLET.match(l)
        if m:
            cur_item = {"name": m.group(1).strip().rstrip(":"),
                        "detail": [], "bullets": []}
            cur_group["items"].append(cur_item)
            continue

        if cur_item is None:
            continue

        m = SUB.match(l)
        if m:
            cur_item["bullets"].append(m.group(1).strip())
        else:
            # Running headers survive the capture; drop the obvious ones.
            if re.match(r"^(Features|New features|Nokia\s*1830|\d+/PSI|"
                        r"Release\s*26\.6|Issue\s*\d)", l, re.I):
                continue
            cur_item["detail"].append(l)

    for g in groups:
        for it in g["items"]:
            it["detail"] = " ".join(it["detail"]).strip()
    return [g for g in groups if g["items"]]


NEW_GROUP_KIND = [
    (r"hardware", "hardware"),
    (r"pluggable", "pluggables"),
    (r"software", "software"),
    (r"GMPLS", "control plane"),
]


def kind_of(title):
    for pat, k in NEW_GROUP_KIND:
        if re.search(pat, title, re.I):
            return k
    return "other"


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("extract", help="output folder from extract-pss-266.py")
    ap.add_argument("-o", "--out", default=None)
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    out = args.out or os.path.join(os.path.dirname(here), "assets", "pss-266.json")

    doc_map = load(args.extract, "doc-map.json")
    tq = load(args.extract, "TQ-toc.json")
    if not doc_map or not tq:
        sys.exit("need doc-map.json and TQ-toc.json in %s" % args.extract)

    # ---- documents: keep the routing value, drop the noise
    docs = []
    for d in doc_map:
        docs.append(OrderedDict([
            ("code", d["code"]), ("series", d["series"]), ("issue", d["issue"]),
            ("pages", d["pages"]), ("title", d["title"]),
            ("appliesTo", d.get("appliesTo") or ""),
            ("kind", d["kind"]), ("use", d["use"]),
            ("file", d["file"]),
        ]))
    docs.sort(key=lambda d: ({"features": 0, "hardware": 1, "reference": 2}
                             .get(d["kind"], 5), -d["pages"]))

    # ---- features: chapter -> sections, each tagged with a topic
    chapters = []
    for num, (name, blurb) in CHAPTERS.items():
        secs = [OrderedDict([("sec", r["sec"]), ("title", r["title"]),
                             ("page", r["page"]), ("topic", topic_of(r["title"]))])
                for r in tq
                if "." in r["sec"] and r["sec"].split(".")[0] == num]
        if not secs:
            continue
        chapters.append(OrderedDict([
            ("num", num), ("name", name), ("blurb", blurb),
            ("count", len(secs)), ("sections", secs),
        ]))

    # ---- what's new
    md_path = os.path.join(args.extract, "new-in-26.6.md")
    md = open(md_path, encoding="utf-8").read() if os.path.exists(md_path) else ""
    groups = parse_whats_new(md)
    for g in groups:
        g["kind"] = kind_of(g["title"])

    tq_doc = next((d for d in docs if d["code"] == "TQ"), None)

    data = OrderedDict([
        ("meta", {
            "release": "26.6",
            "generated": "tools/build-pss-266-data.py",
            "source": "Nokia 1830 PSS Release 26.6 document set, 24 manuals, "
                      "38,766 pages",
            "featureSource": tq_doc["file"] if tq_doc else None,
            "pageNote": "Page numbers are the PRINTED page. The PDF index is "
                        "1 lower in TQ (offset -1).",
            "scope": "Features and hardware. The provisioning, CLI, TL1, "
                     "NETCONF, maintenance and safety manuals are catalogued "
                     "but deliberately not read.",
            "counts": {
                "documents": len(docs),
                "pages": sum(d["pages"] for d in docs),
                "chapters": len(chapters),
                "sections": sum(c["count"] for c in chapters),
                "newItems": sum(len(g["items"]) for g in groups),
            },
        }),
        ("documents", docs),
        ("chapters", chapters),
        ("whatsNew", groups),
    ])

    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(data, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    print("wrote %s" % out)
    c = data["meta"]["counts"]
    print("  %d documents / %s pages" % (c["documents"], f"{c['pages']:,}"))
    print("  %d chapters, %d feature sections" % (c["chapters"], c["sections"]))
    for g in groups:
        print("  new %-14s %2d items  (%s)" % (g["kind"], len(g["items"]),
                                               g["title"][:46]))
    topics = {}
    for ch in chapters:
        for s in ch["sections"]:
            topics[s["topic"]] = topics.get(s["topic"], 0) + 1
    print("  topics: %s" % ", ".join("%s %d" % (k, v) for k, v in
                                     sorted(topics.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
