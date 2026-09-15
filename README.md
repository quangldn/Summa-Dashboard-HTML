# SUMMA — HTML Workbench

Static HTML companion to **SUMMA** (Quang's Nokia ON Sales Engineering
automation). Lives in a private GitHub repo, opens directly from a local
clone — no build step, no server.

Version history lives in [`CHANGELOG.md`](CHANGELOG.md). This file describes
what the workbench *is*; the changelog describes how it got here.

## Pages

**Picking and configuring**

- `dci.html` — **DCI Picker**: describe a DCI requirement (client mix, how hard
  the link is, what constrains the site) and it ranks the GX and PSS
  transponders that can carry it, scoring for right-sizing rather than
  capability. Engine in `assets/dci-engine.js`, data in `assets/xpdr-data.json`,
  regression suite in `tools/dci-cases.js`.
- `mofn.html` — **HS OLS Configurator**: BoM generator for hyperscaler MOFN
  deployments. Band, FP, distance, amp strategy and rack constraints in;
  chassis, cards, power and rack rollup out.
- `gx-bom.html` — **GX BOM Configurator**: config → node → network → BoM,
  driven by `assets/gx-rules.json` extracted from the V3.0 workbook.

**Knowing the portfolio**

- `gx-portfolio.html` — the whole 1830 GX line with release status, shelf
  support, slot cost and optical specs. Data in `assets/gx-data.js`.
- `pss-portfolio.html` — the same for 1830 PSS / PSI.
- `portfolio-insight.html` — infographic views across GX, PSS and both
  combined: shelf reference sheets, transponder insight, optical-layer insight,
  each with a table view and Copy-as-TSV.
- `graph.html` — **Knowledge Graph** *(prototype)*: the PSS 26.6 feature set and
  the transponder catalogue as one force-directed graph — 301 nodes, 547 edges.
  Answers the questions a list cannot, like which card buys you a given feature
  and which shelf it then needs. Not linked from the nav yet.

**Knowing the product**

- `gx-wiki.html` — live GX part-number decoder plus naming grammar, chassis
  geometry, slot costs, acronyms, and a standing list of corrections and source
  conflicts. Data in `assets/gx-wiki-data.js`.
- `pss-wiki.html` — the PSS equivalent.
- `pss-features.html` — **PSS Feature Map**: the Release 26.6 document set
  catalogued and routed — 24 manuals, 38,766 pages. Feature map, what is new in
  26.6, and where to look for everything else.

**Intel**

- `index.html` — landing portal.
- `dashboard.html` — hyperscaler intel, APAC datacenter map, and the full Nokia
  hyperscaler portfolio.
- `subsea-silicon.html` — **Subsea & Silicon**: every submarine cable on record
  (707 systems, 1,925 landing points) mapped against the data-centre power it
  has to feed. Seven interactive views over one canvas map. Lives under
  Hyperscaler rather than in `reports/` — it is a tool you work in, not a
  briefing you read once.
- `market-insight.html`, `hyperscaler.html`, `product.html` — section landings.
- `reports/` — standalone insight reports, read once and filed. See
  [`HOW-TO-ADD-A-REPORT.md`](HOW-TO-ADD-A-REPORT.md).

## Reference data

- `HS Configurator v3.1.xlsx` — the canonical catalog (55 PNs × 21 columns).
  Source of truth for everything in `mofn.html`. Maintained by Quang; the JS
  `PARTS` array in `mofn.html` is derived from this file. Add a new card →
  ask Claude to regenerate the JS catalog.
- `mofn-configurator-archive.md` — engine logic doc. Filter taxonomy, band
  hierarchy, BIDI/uni-dir rules, chassis-family rule, PowerDraw integration,
  PLM questions, change log.

## How to open

Double-click `index.html`. Everything is static. The only network calls:

1. `unpkg.com` for Leaflet CSS + JS bundle (datacenter map).
2. `basemaps.cartocdn.com` for map tiles.
3. `api.rss2json.com` for the Hyperscaler News block — proxies Google News
   RSS through CORS.

If offline, the dashboard still renders; the news block just shows "Feed
unavailable" per company. The MOFN configurator has zero network deps.

## What the dashboard shows

**Top row** (two columns):
- Left: definition of "Hyperscaler" with the top 5 globally.
- Right: top-3 latest news per hyperscaler (AWS, Microsoft, Google, Meta,
  Oracle, Starlink), filtered to data-center / DCI / MOFN / fiber / subsea
  / backbone topics so corporate-news noise is dropped.

**Middle**: APAC datacenter map — major hyperscaler cloud regions across
APAC. Click a marker to see vendor, city, and region code. Cities with
multiple vendors arrange their markers in a tight ring.

**Bottom**: **Nokia Hyperscaler Portfolio** — full 55-PN catalog grouped
into 11 sections (Term chassis · OMD · OCC · ROADM · CAD-CDC · Term amps ·
ILA compact chassis · ILA full chassis · ILA EDFA · ILA Raman · ILA Hybrid).
Color-coded badges for family (full/compact), HS applicability, BIDI vs
uni-directional, and power source (exact/variant/estimate/passive).

## What the MOFN configurator does

Capability-rule BoM engine. Inputs:

- **Band**: C / C++ (Super C) / C+L / Super C+L / L (with hierarchy:
  C++ covers C, L++ covers L, Y covers all)
- **Fiber pairs**: slider 1–8
- **Term type**: ROADM (integrated EDFA, future-proof) or MUX (OMD,
  fixed grid, no tech-gen upgrade)
- **Channels** (MUX only): 32 / 40 / 42 / 48 / 64
- **Amp strategy**: EDFA only · EDFA + Raman · Hybrid only (with
  hybrid → EDFA+Raman fallback when hybrid card not GA)
- **OTDR required**: when ticked, adds OCC2T/2E + ZXS-O2OTDR8E-Y0
- **Distance** (km) + **avg span** (km) → derives spans, term nodes (=2),
  ILA sites (= spans − 1)
- **ILA mix**: by default all ILA sites use the chosen strategy; tick off
  "All ILA same config" to split into Raman/Hybrid + EDFA-only groups
- **Rack constraint**: any / 300mm only / 600mm closed cabinet / 700mm
- **Rack budget**: rack count + rack max power + rack U (drives PEM-input
  budget check)
- **Release ceiling** + **STRICT / RELAX** mode (RELAX surfaces roadmap parts)

Outputs:
- Per-term-node BoM + Term-side total (× nodes)
- Per-ILA-site BoM(s) — split when mixed config
- Power & Space rollup: typ@25°C / max@40°C / max@55°C / RU per side and
  link total
- Rack budget check (heaviest ILA site vs racks × max W × 0.9 PEM)
- Reasoning panel explaining every rule the engine applied
- Gap banners when hybrid falls back, Super C+L X+L combo unavailable, etc.

Per-row power values sourced from `1830 GX PowerDraw R9.0_V1.xlsx` (matches
PowerDraw User-Input output to 0% delta for the 1800 km / 60 km baseline
example).

## Key engine rules (the non-obvious ones)

These live in `mofn-configurator-archive.md` in full detail. Highlights:

- **1 RD66 = C+L in 1 card** (no separate C and L ROADMs needed).
  **1 RD66 = 1 FP** — each fiber pair gets its own ROADM card.
- **Term node = 1 degree** (end of chain) — qty/node scales with FP, not
  ROADM degree.
- **Super C+L ROADM combo**: no Y-suffix ROADM exists today — engine pairs
  RD32-X + RD32-L for Super C+L deployments.
- **ROADM has integrated EDFA** → no separate PBA at term. PBA only with MUX.
- **Hybrid ticked = Raman accepted**: with ROADM term, always adds Raman
  (hybrid card itself is redundant with ROADM's EDFA).
- **Chassis family** (Quang's rule): G3S-G/H/R-prefix cards → full chassis
  (G31/G32/G32E/G34L); G3S-C/D-prefix → compact (G34c/G32c/G38c).
- **BIDI vs uni-dir**: ILA EDFA/IRB cards = BIDI (×1 per FP); RPB Raman =
  unidirectional (×2 per FP per site).
- **Slot-based chassis qty**: ROADM=2 slots, D-prefix=2 slots, 4-fiber=2
  slots; everything else=1 slot. Engine consolidates to the smallest
  chassis that fits, or falls back to largest × multiplier (e.g. 1× G34L
  vs 2× G32E, 1× G38c vs 2× G34c).
- **STRICT vs RELAX**: STRICT excludes any part above ceiling; RELAX
  allows roadmap parts as fallback with 🚧 flag.
- **No RPBL family**: engine excludes RPBL — uses RPBM only.

## Customizing

- **News filter** — `assets/news.js`, edit `query` strings on each
  `COMPANIES` entry. Google News Boolean syntax.
- **Map data** — `assets/map.js`, edit the `REGIONS` array.
- **Portfolio table** — auto-generated from `HS Configurator v3.1.xlsx`.
  To update: edit the xlsx Catalog sheet, then ask Claude to regenerate
  the portfolio HTML block in `dashboard.html`.
- **Configurator catalog** — same xlsx drives the `PARTS` array in
  `mofn.html`. When PLM ships new cards, update the xlsx first.
- **Branding** — `assets/styles.css`, `:root` variables for Nokia colors.

## Working on it

The repo is already set up; the loop is edit, commit, push from GitHub Desktop.

Two rules that matter:

- **Never hand-edit generated data.** Anything in `assets/` ending `.json` or
  `-data.js` comes from a builder in `tools/`. Edit the builder, re-run it,
  commit both — otherwise the next run silently discards your change.
- **Run the checks before committing a page you changed.**
  `node tools/dci-cases.js` (59 assertions on the picker engine),
  `node tools/check-dci-page.js`, `tools/check-insight-page.js`,
  `tools/check-pss-features.js` — the page checkers drive the real page
  headless and verify contrast, interaction and both themes.

Line endings are pinned in `.gitattributes` (LF for source, CRLF for
`.bat`/`.cmd`/`.ps1`, explicit `binary` for Office files and images), so
GitHub Desktop's CRLF warning on a source file means the file arrived from
somewhere that did not honour it.

## Folder layout

```
Summa-Dashboard-HTML/
├── *.html                  ← one file per page, no build step
├── assets/
│   ├── theme.css           ← the token system (light + dark)
│   ├── nav-bar.css nav.js  ← shared nav, used by every page
│   ├── cmdk.css cmdk.js    ← Ctrl-K command palette
│   ├── *-engine.js         ← the logic behind a configurator
│   ├── *-charts.js         ← chart forms
│   └── *.json *-data.js    ← generated data, never hand-edited
├── tools/                  ← extractors and builders, see tools/README.md
│   ├── extract-*.py        ← source document → cached JSON
│   ├── build-*.py          ← cached JSON → the data a page loads
│   └── *-cases.js check-*.js ← regression suites and page checkers
├── reports/                ← standalone insight reports
├── CHANGELOG.md            ← version history
└── README.md               ← this file
```

Anything in `assets/` ending `.json` or `-data.js` is **generated**. Change the
builder in `tools/`, re-run it, commit both. `tools/README.md` says which
builder owns which file and what source each reads.

## Changelog

Moved to [`CHANGELOG.md`](CHANGELOG.md), so there is one place to look rather
than two that drift apart.
