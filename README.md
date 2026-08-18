# SUMMA — HTML Workbench (v1)

Static HTML companion to **SUMMA** (Quang's Nokia ON Sales Engineering
automation). Lives in a private GitHub repo, opens directly from a local
clone — no build step, no server.

> **v1 status** (May 2026): Dashboard portfolio populated with 55-PN catalog.
> MOFN page is now a full interactive HS OLS Configurator with capability-rule
> engine, slot-based chassis math, and PowerDraw integration. Earlier v0.1
> was a draft.

## Pages

- `index.html` — landing portal with two cards.
- `dashboard.html` — **Summa Dashboard**: Hyperscaler intel + APAC datacenter
  map + **full Nokia hyperscaler portfolio (55 PNs across 11 sections)**.
- `mofn.html` — **HS OLS Configurator**: interactive BoM generator for
  hyperscaler MOFN deployments. Pick band, FP, distance, amp strategy,
  rack constraints → get the recommended chassis + cards + power + rack
  space rollup.

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

## Pushing to GitHub

```bash
cd "OUTPUTS/Summa Dashboard HTML"
git init
git add .
git commit -m "v1: full MOFN HS OLS Configurator + populated portfolio"
git branch -M main
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

If you later want a public preview, enable GitHub Pages on the repo
(Settings → Pages → Branch: `main` → root). Note: this would make the
private content public, so only do that if you've decoupled anything
sensitive (no internal Nokia PN data exposure concerns — all PNs are
publicly catalogued).

## Folder layout

```
Summa Dashboard HTML/
├── index.html                          ← landing portal
├── dashboard.html                      ← Summa Dashboard + Portfolio
├── mofn.html                           ← HS OLS Configurator (v3.x engine)
├── HS Configurator v3.1.xlsx           ← catalog source of truth
├── mofn-configurator-archive.md        ← engine logic doc
├── README.md                           ← this file
├── .gitignore
└── assets/
    ├── styles.css                      ← shared visual styles
    ├── news.js                         ← Hyperscaler news (Google News RSS)
    └── map.js                          ← APAC datacenter map (Leaflet)
```

## Changelog

- **v1 (May 2026)** — Dashboard portfolio populated (55 PNs × 11 sections).
  MOFN page replaced with full interactive HS OLS Configurator. Engine
  refactored across v2 (capability rules) → v3 (distance-driven topology,
  BIDI/uni-dir, ROADM degree, slot-based chassis, family rules) →
  v3.1 (RD32TH-L0 R10.0, Super C+L X+L combo, hybrid→EDFA+Raman fallback,
  mixed-ILA split, RPBL exclusion, OTDR toggle). PowerDraw R9.0 integrated.
  HS Configurator v3.1.xlsx and archive .md included in repo.

- **v0.1 (May 2026, draft)** — Static dashboard with hyperscaler news,
  APAC datacenter map, empty portfolio table. MOFN page was a placeholder.
