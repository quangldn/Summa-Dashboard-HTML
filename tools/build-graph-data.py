#!/usr/bin/env python3
"""
Build assets/graph-data.json — the node/edge set behind graph.html.

Two datasets that already exist separately are joined here:

  assets/pss-266.json   the Release 26.6 feature taxonomy (chapters, topics,
                        feature sections, the 24 manuals, the 26.6 delta)
  assets/xpdr-data.json the hardware (transponders, the shelves that host
                        them, the cascade paths between them)

The join is the whole point. A feature list tells you OpenZR+ exists; a card
list tells you S2AD800R exists; neither tells you that S2AD800R is how you buy
OpenZR+ and that it needs a PSS-8x to sit in. That is an edge, and edges are
what this file is for.

    python3 tools/build-graph-data.py

Density is the design constraint. Every extra edge costs legibility, so a
card-to-feature link is only drawn where the feature actually distinguishes
the card — a rule that matches most of the catalogue tells you nothing and is
left out. Each rule below states what it matches and roughly how many cards it
catches; anything that caught more than about a quarter of the fleet was cut
rather than kept and dimmed.
"""

import json
import os
import re
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, "assets", *p)


# ---------------------------------------------------------------------------
# Card -> feature section rules
#
# 'sec' is the printed section number in the TQ feature guide. 'test' runs
# against one card record and says whether the edge exists. The comment on
# each says what it catches and why that is worth an edge.
# ---------------------------------------------------------------------------

def _enc(c):
    e = c.get("encryption")
    return bool(e) and str(e).strip() not in ("N/A", "-", "No plans")


CARD_FEATURE_RULES = [
    # 2 cards. The only OpenZR+ line interfaces in the catalogue, so the edge
    # answers "what do I quote for OpenZR+" in one hop.
    ("2.38", "OpenZR+ line interface",
     lambda c: bool(c.get("zr"))),

    # 9 cards. L1 encryption is a bid-winning differentiator and is stated per
    # card in the roadmap, so this is sourced rather than inferred.
    ("3.4", "carries L1 encryption", _enc),
    ("6.6", "carries L1 encryption", _enc),

    # 13 cards. Flexible spacing is what gridless operation needs; the cards
    # that state a spacing figure are the ones with a tunable grid.
    ("2.45", "states a channel spacing, so it can run off the fixed grid",
     lambda c: bool(c.get("spacingGHz"))),

    # 3 cards. Aggregators are the cascade answer for sub-100G services, and
    # the DCC chapter is where that design is written up.
    ("3.3", "aggregates sub-100G services for a DCI design",
     lambda c: c.get("kind") == "aggregator"),
]

# Rules deliberately NOT drawn, and why. Kept here because the next person to
# look at this file will propose them:
#
#   5.4 SyncE cards        — ~80 of 87 cards have an Ethernet client. An edge
#                            from nearly every node is a background colour,
#                            not information.
#   2.34 Y-cable / 2.35 OPS— neither source says which cards support them.
#                            Guessing from "it has two line ports" would be
#                            inventing data.
#   3.2 DCC                — every transponder in here is a DCI transponder.
#   2.19 Alien wavelengths — "has pluggable line optics" catches 34 of 87, and
#                            34 edges into one section made it the third-
#                            largest hub in the graph while saying only that
#                            most modern sleds take pluggables. That belongs
#                            on the card's own panel, not on an edge.


# Which manuals answer which chapter. The feature guide (TQ) carries the
# taxonomy itself; the rest are routed by what they are for, so the graph can
# answer "I am reading about protection, which book has the procedure".
DOC_CHAPTER = {
    "features": None,              # handled specially: links to every chapter
    "hardware": ["7"],             # system planning
    "install": ["7"],
    "provisioning": ["2", "3", "4", "5"],
    "operations": ["6"],
    "reference": ["1"],
    "safety": ["7"],
}


# Cards name their shelf with the variant they were qualified against —
# "PSS-16II DC 8RU", "PSS-16 main" — while the shelf list carries the family.
# Without this the whole PSS-16 family floats unconnected.
HOST_ALIAS = [
    (re.compile(r"^PSS-16II\b"), "PSS-16II"),
    (re.compile(r"^PSS-16\b(?!I)"), "PSS-16"),
]


def host_id(name):
    for pat, canon in HOST_ALIAS:
        if pat.match(name):
            return canon
    return name


def enc_note(c):
    e = str(c.get("encryption") or "")
    return e.split(":")[-1].strip() if ":" in e else e


def main():
    pss = json.load(open(A("pss-266.json"), encoding="utf-8"))
    xp = json.load(open(A("xpdr-data.json"), encoding="utf-8"))

    nodes, edges = [], []
    seen = set()

    def node(nid, kind, label, **kw):
        if nid in seen:
            return nid
        seen.add(nid)
        n = OrderedDict([("id", nid), ("kind", kind), ("label", label)])
        n.update({k: v for k, v in kw.items() if v not in (None, [], "")})
        nodes.append(n)
        return nid

    # A card that lists "PSS-16II DC 8RU" and "PSS-16II AC/DC 9RU" is one card
    # in one shelf family, and drawing that twice puts the same shelf twice in
    # the node's neighbour list. Same pair, same relationship, one edge.
    drawn = set()

    def edge(a, b, rel, note=None):
        key = (a, b, rel)
        if key in drawn:
            return
        drawn.add(key)
        e = OrderedDict([("s", a), ("t", b), ("rel", rel)])
        if note:
            e["note"] = note
        edges.append(e)

    # ---- feature taxonomy ------------------------------------------------
    sec_by_num = {}
    for ch in pss["chapters"]:
        cid = node("ch:" + ch["num"], "chapter", ch["num"] + ". " + ch["name"],
                   blurb=ch["blurb"], count=ch["count"])
        for s in ch["sections"]:
            sid = node("sec:" + s["sec"], "section", s["title"],
                       sec=s["sec"], page=s["page"], chapter=ch["name"])
            sec_by_num[s["sec"]] = sid
            edge(cid, sid, "contains")

            tid = node("topic:" + s["topic"], "topic", s["topic"])
            edge(sid, tid, "about")

    # ---- the 26.6 delta ---------------------------------------------------
    for g in pss["whatsNew"]:
        gid = node("new:" + g["sec"], "newgroup", g["title"], kind26=g["kind"],
                   count=len(g["items"]))
        edge("ch:1", gid, "contains")
        for i, it in enumerate(g["items"]):
            iid = node("newitem:%s.%d" % (g["sec"], i), "new", it["name"],
                       detail=it.get("detail"), bullets=it.get("bullets"))
            edge(gid, iid, "contains")

    # ---- manuals ----------------------------------------------------------
    for d in pss["documents"]:
        # The two-letter code is NOT unique: it is the tail of the Nokia doc
        # number, and TC covers both the User Provisioning Guide and the
        # NETCONF/gRPC Interface Guide. Keying on it collapsed two pairs of
        # manuals into two nodes and quietly lost two books. The file name
        # carries the full doc number, so key on that.
        dkey = re.sub(r"\.pdf$", "", d["file"], flags=re.I)
        did = node("doc:" + dkey, "doc", d["code"] + " — " + d["title"],
                   code=d["code"], issue=d.get("issue"),
                   pages=d["pages"], use=d["use"], docKind=d["kind"],
                   file=d["file"], appliesTo=d.get("appliesTo"))
        if d["kind"] == "features":
            for ch in pss["chapters"]:
                edge(did, "ch:" + ch["num"], "documents")
        else:
            for num in DOC_CHAPTER.get(d["kind"]) or []:
                if ("ch:" + num) in seen:
                    edge(did, "ch:" + num, "documents")

    # ---- hardware ---------------------------------------------------------
    for h in xp["hosts"]:
        node("shelf:" + h["id"], "shelf", h["name"], platform=h["platform"],
             ru=h.get("ru"), slots=h.get("slots"), depthClass=h.get("depthClass"))

    for c in xp["xpdr"]:
        cid = node("card:" + c["name"], "card", c["name"],
                   platform=c["platform"], family=c.get("family"),
                   cardKind=c.get("kind"),
                   lineMaxG=c.get("lineMaxG"), lineRatesG=c.get("lineRatesG"),
                   slots=c.get("slots"), shipping=c.get("shipping"),
                   clientServices=c.get("clientServices"),
                   clientsUnknown=c.get("clientsUnknown"),
                   encryption=enc_note(c) if _enc(c) else None,
                   source=c.get("source"))

        for h in (c.get("hosts") or []):
            hid = "shelf:" + host_id(h)
            if hid in seen:
                edge(cid, hid, "seats")

        for sec, why, test in CARD_FEATURE_RULES:
            if sec_by_num.get(sec) and test(c):
                edge(cid, sec_by_num[sec], "implements", why)

    # ---- cascade paths ----------------------------------------------------
    # An aggregator and the card it feeds are a design pair; drawing it makes
    # "this card cannot take 10GE on its own" visible instead of buried.
    for cas in xp["cascade"]:
        aid = "card:" + cas["id"]
        if aid not in seen:
            continue
        for h in cas["hosts"]:
            if ("shelf:" + host_id(h)) in seen:
                edge(aid, "shelf:" + host_id(h), "seats")
        for c in xp["xpdr"]:
            if c["platform"] != cas["platform"] or c["name"] == cas["id"]:
                continue
            if cas.get("pairsWith") and not any(
                    (c.get("family") or "").startswith(f) or c["name"].startswith(f)
                    for f in cas["pairsWith"]):
                continue
            # Only worth an edge where the partner actually needs it: the card
            # cannot land the sub-100G services itself.
            svc = c.get("clientServices")
            if svc is None or any(s in svc for s in cas["takes"]):
                continue
            if not set(c.get("hosts") or []) & set(cas["hosts"]):
                continue
            edge("card:" + c["name"], aid, "cascades",
                 "sub-100G lands on " + cas["label"] + ", handed back as " +
                 cas["handsOff"])

    # Shelves with nothing seated in them are the PSS-x and PSS-HC families,
    # whose line cards xpdr-data declares out of scope. An unconnected node
    # drifts to the edge of a force layout and reads as a bug, so drop them
    # and say how many went.
    linked = set()
    for e in edges:
        linked.add(e["s"]); linked.add(e["t"])
    dropped = [n["label"] for n in nodes if n["id"] not in linked]
    nodes = [n for n in nodes if n["id"] in linked]

    # ---- degree, for sizing ----------------------------------------------
    deg = {}
    for e in edges:
        deg[e["s"]] = deg.get(e["s"], 0) + 1
        deg[e["t"]] = deg.get(e["t"], 0) + 1
    for n in nodes:
        n["deg"] = deg.get(n["id"], 0)

    kinds = {}
    for n in nodes:
        kinds[n["kind"]] = kinds.get(n["kind"], 0) + 1
    rels = {}
    for e in edges:
        rels[e["rel"]] = rels.get(e["rel"], 0) + 1

    out = OrderedDict([
        ("meta", {
            "generated": "tools/build-graph-data.py",
            "sources": ["assets/pss-266.json", "assets/xpdr-data.json"],
            "note": "Card-to-feature edges are curated rules, listed in "
                    "tools/build-graph-data.py. They are drawn only where the "
                    "feature distinguishes the card; rules that matched most "
                    "of the catalogue were left out on purpose.",
            "counts": {"nodes": len(nodes), "edges": len(edges),
                       "byKind": kinds, "byRel": rels},
        }),
        ("nodes", nodes),
        ("edges", edges),
    ])

    with open(A("graph-data.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)

    print("wrote assets/graph-data.json")
    print("  %d nodes, %d edges" % (len(nodes), len(edges)))
    print("  nodes: %s" % ", ".join("%s %d" % kv for kv in
                                    sorted(kinds.items(), key=lambda k: -k[1])))
    print("  edges: %s" % ", ".join("%s %d" % kv for kv in
                                    sorted(rels.items(), key=lambda k: -k[1])))
    top = sorted(nodes, key=lambda n: -n["deg"])[:8]
    print("  hubs: %s" % ", ".join("%s(%d)" % (n["label"][:22], n["deg"]) for n in top))
    if dropped:
        print("  dropped %d unconnected: %s" % (len(dropped), ", ".join(dropped)))


if __name__ == "__main__":
    main()
