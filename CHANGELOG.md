# Changelog

What changed in SUMMA, newest first. Versions are the numbers used when
deploying; each one groups the commits that shipped together.

The format is deliberately plain: what changed, and where it matters, why the
old behaviour was wrong. Corrections to the underlying data are called out
separately from features, because a wrong number in a bid is worse than a
missing page.

---

## v16 — 2026-09-15

**Subsea &amp; Silicon — the fifth Market Insight report, and the first interactive
one.** `reports/Subsea_and_Silicon_Insight.html`. The whole TeleGeography public
inventory — 707 submarine systems, 1,925 landing points, 186 countries — drawn on a
canvas map and cross-referenced against data-centre power in 67 markets and 30 metros.

Seven views over one pan/zoom map, each with its own sortable tables: **Routes** (all
707 systems, status-coloured, with a ready-for-service scrubber from 1989 to 2030),
**Fibre &amp; capacity** (line weight by design Tbps, plus the per-fibre-pair plateau
chart), **DC power** (country choropleth with four metrics, top-30 metro bubbles),
**Landing &rarr; DC** (69 landing stations connected to the metro they actually serve,
coloured by distance class, dashed where there is no diverse second path),
**Chokepoints** (16 corridors sized by systems transiting, plus 27 terrestrial bypass
projects), **Vietnam &amp; APAC**, and **Where the money is** (five sales theses and two
ranked call lists).

Three findings worth carrying into a meeting:

| Finding | Number |
|---|---|
| Capacity per fibre pair has been flat since 2018 | 13–26 Tbps across every era since; systems grew 90 &rarr; 350 Tbps by adding pairs, not spectrum |
| Landing stations far from the compute they feed | 42 of 69 over 100 km; 20 with no diverse second path |
| Landed design capacity vs. DC load | 6.7 Pbps lit against 126.5 GW live; 3.5 Pbps and 302 GW in build |

The per-pair plateau is the one that changes a pitch. The shore-end power feed is
capped, so spreading it across 16 or 24 pairs means less pump power on each — Marea
(2018, 8 FP) still holds the highest per-pair figure ever demonstrated transatlantic at
26.2 Tbps. Google's own FCC filings show the same constraint: Taihei at 7,000 km
declares 19 Tbps/FP, Halaihai at 17,483 km declares 14.5. Growth is spatial now, which
makes every fibre pair a separate terminal decision under open-cable architecture.

**Departures from the report convention, deliberately.** This one is interactive rather
than a set of tabbed infographics, and it carries both themes rather than dark only —
it opens dark like its siblings, with a toggle in the masthead. It is still a single
self-contained file (1.6 MB, all data inline), so `reports/` stays a drop-in folder.

**Data provenance.** Container egress to submarinecablemap.com is blocked by policy, so
the dataset was pulled through the in-app browser, gzip+base64 compressed in-page and
transferred in SHA-256-verified chunks. Raw JSON is archived beside the report in
`OUTPUTS\Subsea and Silicon\` on the G: drive. Capacity figures cover 82 of the 707
systems — country "landed Tbps" totals are floors, not totals. Design capacity is not
lit capacity, and CLS&rarr;DC distances are road-route estimates.

---

## v15 — 2026-09-14

**The DCI requirement panel now actually gets out of the way.** The v14
version folded it to one line but the fold never fired: the sentinel that
detects "the panel has reached the top" sat *above* the panel, so it fired the
moment the panel's first pixel touched the viewport edge — while the panel was
still the thing you were looking at. Folding there took ~440px out of the
document at a point the reader had not yet scrolled past, and the browser's
scroll anchoring yanked the page back to the top. The net effect was a page
that bounced and a panel that never folded.

The sentinel now marks the panel's *bottom*, so the fold happens only once the
whole panel is above the fold and the shrink lands entirely in content already
passed. On top of that the folded bar now leaves the screen completely when
you keep scrolling down and slides back when you scroll up — a 40px strip
still sits on the card you are reading. Two further fixes fell out of it:
scroll direction is accumulated over 30px rather than read per event (a wheel
notch overshoots and settles, so the last event of a downward flick points up),
and the reflow caused by the fold itself is ignored for 300ms instead of being
read as the reader scrolling up.

**Knowledge Graph (prototype).** `graph.html`, a force-directed graph of the
PSS 26.6 feature set and the transponder catalogue drawn together. 301 nodes,
547 edges: chapters, topics, feature sections, the 24 manuals, the 26.6 delta,
87 transponders and the 9 shelves that host them. Drag, scroll to zoom, click
to focus; 1-hop and 2-hop views to read one neighbourhood at a time; search
dims everything that does not match; the legend filters by node kind.

Card-to-feature edges are curated rules in `tools/build-graph-data.py`, drawn
only where the feature actually distinguishes the card. Rules that matched
most of the catalogue — SyncE, DCC, pluggable line optics — are listed in that
file as deliberately *not* drawn, with the reason. A hub every node connects
to is a background colour, not information.

Standalone for now; not linked from the nav.

**Feature topics: five sections were filed under the wrong subject.** The
topic classifier matched acronyms without word boundaries, so:

| Section | Was | Now |
|---|---|---|
| 4.5 / 4.7 L2 features in Provider Bridge mode | Amplifier / power | Carrier Ethernet |
| 5.2 Synchronous Ethernet (SyncE) | Carrier Ethernet | Synchronization |
| 5.4 Cards with Ethernet interface … SyncE | Carrier Ethernet | Synchronization |
| 6.8 Time of day synchronization | — | Synchronization |
| 2.44 Spectrum sharing in subsea environment | Monitoring | Subsea |
| 6.10 Anti-theft Protection (ATP) | Protection | Security |

`DGE` was matching the *dge* in "Bridge"; `spectrum` was beating `subsea`;
`Ethernet` was beating `SyncE`. Every acronym in the table is now anchored,
and the order puts the specific subject ahead of the general one it shares
vocabulary with.

---

## v14 — 2026-09-14

**39 shipping PSS transponders were missing from the DCI picker.** The builder
kept only cards that had a roadmap slide, and 39 of the 55 shipping
transponders have none — S13X100E/L/R, S2AD200H/R, S4X400H/L, 20P200, 12P120,
8P20 and more. They are now sourced from the planning guide instead, taking
the catalogue from 56 to 87 cards.

The guide carries a line rate, shelf list, slot count and power but not the
cage inventory or the client-service list. Rather than invent them, those
cards are flagged `clientsUnknown`: they rank, score 34 points lower, show
"Client cages: not stated", and carry a callout saying the client side is not
confirmed. Any card with a confirmed client side outranks them.

**UTM2 claimed 40GE it cannot carry.** `ZXS-QPQ10GLW-00` is "QSFP+ 4 x
10GE/LR4 for 40GE ↔ 10GE with breakout fiber" — a 40G-shaped cage delivering
four 10GE services — and the parser read the literal "40GE" out of it.
Breakout descriptions now yield 10GE and never 40GE. UCM4's `TOM-40G-Q-SR4`
is a real 40GE port and keeps it.

Found alongside: the workbook writes genuine 40G ports as `40GBE` ("QUAD SFP
PLUS-40GBE INTERFACE"), which a `40GE` token never matched, so those ports
were invisible. Now matched, with UTM2's field rule recorded as an explicit
override that the output flags as contradicting the workbook.

**The requirement panel folds up once it pins.** It is sticky, so scrolling
into the results left it holding a third of the viewport. It now collapses to
one line — clients and total, link level, and only the constraints moved off
their defaults — and reopens on click until you scroll back up past it.

*Note: S13X100H does not exist in either source. The family is S13X100E
(encryption), S13X100L (L band), S13X100R (regional).*

---

## v13 — 2026-09-14

**PSS Feature Map.** `pss-features.html`, built from the Release 26.6 document
set: 24 manuals, 38,766 pages, catalogued and routed. Three tabs — the feature
map (8 chapters, 100 sections, each with its printed page), what is new in
26.6, and where to look for anything else. Topic filters and search.

The extraction is reproducible: `tools/extract-pss-266.py` reads the PDFs once
and caches, `tools/build-pss-266-data.py` turns that into the page's data. The
PDFs are 660 MB and stay outside the repo.

Worth knowing: **TQ Issue 2 is the Feature Information volume**, paired with HQ
as the hardware volume. Neither title says so.

---

## v12 — 2026-09-13

**Table view.** A Cards / Table switch on the portfolio insight page, with a
29-column sortable table and Copy-as-TSV.

**Shelf specs replaced the statistics tab.** Dimensions, operating
temperature, slot count, max rate, client types — the reference sheet, not
counts of things.

**Slot counts now say what they count.** G32 is 8 sleds (4 columns × 2 rows);
sources quoting 10 are counting the two controller cards. Every shelf now
shows service slots and common-equipment slots separately, whether it takes
dual controllers, and how many fan and power modules it has.

---

## v11 — 2026-09-13

**Portfolio insight.** `portfolio-insight.html` — GX, PSS and a combined view
across four chart forms. The sequential colour ramps have one step removed
from the middle on purpose: at that step no ink colour clears 4.5:1 against
the fill.

---

## v10 — 2026-09-13

**The DCI picker, rebuilt around the real decision order:** how much traffic,
how hard is the link, then which card. Link challenge is a 5-level derate —
100% / 80% / 60% / 50% / a rate you name — applied to each card's own ceiling
and snapped to a profile the card actually has.

**Scoring now rewards right-sizing, not capability.** The old model paid a
bonus for headroom, which is how a bid gets beaten on price: a 1.2T card
asked to carry 400G is silicon the customer pays for and the design never
lights. Wavelength fill is now the heaviest term, and gross over-spec costs a
candidate its place.

---

## v9 — 2026-09-13

**DCI transponder picker.** First version, plus line-technology tiers and the
multi-wavelength switch. LF line endings pinned for source files.

---

## v8 — 2026-09-13

**New design system** rolled across the whole workbench, and the workbench
restructured into two sections with a real hierarchy.

---

## v7 — 2026-09-13

**PSS / PSI knowledge base** — portfolio and wiki pages.

---

## v5–v6 — 2026-09-11

**GX portfolio, wiki and BOM configurator.** The GX rules extractor turns the
BOM Configurator workbook into `assets/gx-rules.json`; the configurator works
through config, node, network and BOM.

**GX BOM Configurator V3.0 reconciled** against the roadmap, PowerDraw and
`mofn.html` — the differences are written up in `gx-v30-reconciliation.md`.

---

## v4 — 2026-09-10

Complete BOM, redundancy and protection, OSNR-gated amplifier strategy,
portfolio search.

---

## v1–v3 — 2026-08-18

Initial workbench and the MRC report.

---

## Open items

- **RD66 slot count is disputed** — GX BOM Configurator V3.0 says 3, the
  Aug-2026 roadmap deck says 6. Not resolved; whichever you use, say which.
- **Q3-26 corrections not yet applied to the MOFN engine** — slot costs on 14
  cards, G34c at 8 slots, 600 mm depth, OMD treated as a shelf.
- **A genuine Nokia doc error**: PSS-4hc is described as "15RU" in prose but
  "6RU (264.7 mm)" in the spec bullets of the same manual.
