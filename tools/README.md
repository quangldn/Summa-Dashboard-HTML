# tools/

## `extract-gx-rules.py` — GX BOM Configurator → JSON

Turns a Nokia **GX BOM Configurator** workbook into `assets/gx-rules.json`, the
rule set the Summa BOM configurator runs on.

```bash
pip install openpyxl --break-system-packages          # once
python3 tools/extract-gx-rules.py "GX BOM Configurator V3.0.xlsm" -o assets/gx-rules.json
```

### Why it exists

The configurator keeps its rules in **181 named Excel tables**, not in VBA:
which sleds are legal in which slot, what a chassis kit drags in, PEM counts per
power option, licence PNs per release and controller redundancy, client
pluggable lists, IBW licences, and the PN master.

So the rules can be *re-extracted* from each quarterly release rather than
maintained by hand. That is the whole reason a Summa-side configurator is
viable: when Nokia ships V3.1, the update is one command, not a week of
re-checking tables.

### Quarterly refresh

1. Drop the new `.xlsm` into `Summa/GX/<quarter>/`.
2. Re-run the command above.
3. Read the run summary — it prints the tool version, its own known
   limitations, and any **source conflicts** found.
4. Commit the regenerated `assets/gx-rules.json`.

Nothing else is hand-edited. If a table is renamed or a chassis added, the
extractor finds it by pattern; if a table it does not recognise appears, the
rows land under `raw` rather than being dropped.

### What comes out

| Key | Contents |
|---|---|
| `meta` | source file, tool version and date, version history, **the tool's own known-limitations list** |
| `conflicts` | places where two sheets in the same workbook disagree |
| `chassis` | geometry (UI grid vs service slots, rows, RU, slot size), `slotGroups` — the legality group for each slot position — encryption PN, NMS-licence flag, and each kit variant with pointers to its adder tables |
| `slotLegality` | per chassis, per slot group: which sleds are legal and how wide |
| `items` | **PON-keyed** weight, power at 25/40/55 °C and category. This is what a BOM roll-up reads: the workbook looks every BOM line's PN up here, so chassis kits and PEMs sit in it alongside cards |
| `sleds` | 105 cards: required PNs, slot cost, class, weight, power, client cage counts, and the names of their option tables |
| `sledOptions` | per sled: line modules, client optics, trib ports, OSC SFPs, IBW licences |
| `optionLists` | the same option lists keyed by **table** name. Option tables are per family, not per part — CHM7X-C6 and CHM7X-C14 share `CHM7X_CLIENTS` — so this is the key to follow from a sled's own pointers |
| `adders` | power options with PEM count and per-PEM watts, controller options, mount kits, cables |
| `licences` | NMS PN per chassis and config type; 94 NE-software rows keyed by release, SW level and controller redundancy |
| `releases` | GX, G40, NE and NMS release lists |
| `pons` | 657-entry PN master: description, type, product family and category, lifecycle phase, sales status, material number |
| `raw` | any table the typed extractors did not claim |

### Prices

**Off by default.** `PON_LIST` and `PON_VAULT` carry list prices; the extractor
strips them unless you pass `--prices`. Keep the priced JSON out of any repo
that might be shared.

```bash
python3 tools/extract-gx-rules.py "…V3.0.xlsm" -o gx-rules-priced.json --prices
```

### Known source conflicts it reports

As of V3.0 there is one, and it matters for card placement:

> **G32 slot count** — `CHASSIS_TYPES_LIST` says 2 × 5 = 10, the AUX sled block
> says 2 × 4 = 8. The first counts UI grid columns including non-sled
> positions; the second is the service-slot count. **Use `sledSlots`.**

The extractor does not resolve conflicts — it surfaces them. Deciding is a
product question, not a parsing one.

---

## `extract-fixtures.py` + `regress.js` — proving the engine

Every configurator workbook ships with whatever configuration was last saved in
it, and each CONFIG sheet holds **both** the inputs and the BOM its macros
produced. That is a free, authoritative test: same inputs in, same BOM out, or
the Summa engine is wrong.

```bash
python3 tools/extract-fixtures.py "GX BOM Configurator V3.0.xlsm" -o tools/fixtures
node tools/regress.js
```

```
PASS  CONFIG #1  G40  (GX BOM Configurator V3.0.xlsm)
      4/4 slots · 37.15 kg · 1284 / 1842 / 1987 W @ 25/40/55 °C
1/1 fixtures match
```

`regress.js` prints a PON-by-PON diff for anything that does not match and exits
with the number of failing fixtures, so it drops into CI unchanged.

**More fixtures are worth more than more code.** Any real configuration — a
workbook saved off a live deal, with its BOM already generated — dropped into
`GX/<quarter>/` and run through `extract-fixtures.py` becomes a permanent
regression test. Save a few, from different chassis, before trusting the engine
on a quote.

## `../assets/gx-bom-engine.js` — the engine itself

Pure functions over `gx-rules.json`, no DOM, so the browser and `regress.js` run
the same code. It follows `Update_BOM`'s order line for line, including the
quirks that change a BOM: the cable guide is dropped when a dust filter is
fitted, the G34c sled filler counts half a part per empty slot, and every BOM
line's weight and power are looked up by PN rather than by card.

One deliberate divergence: where a row's PN cell holds two parts (`A;B`), this
extractor indexes the weight and power under *each* PN. The workbook's own
VLookup matches the joined string and silently finds nothing, so it drops that
row's weight. Summa counts it.

---

## PSS / PSI — three tools, two sources

The PSS knowledge base is built the same way as the GX one: read the sources,
never retype them.

```bash
pip install pdfplumber python-pptx --break-system-packages       # once

python3 tools/extract-pss-guide.py   "3KC-71311-TAAA-HQZZA_Issue_2.pdf"      -o assets/pss-data.json
python3 tools/extract-pss-roadmap.py "ON Consolidated Roadmap ... PSS .pptx" -o assets/pss-roadmap.json
python3 tools/build-pss-cards.py     -g assets/pss-data.json -r assets/pss-roadmap.json -o assets/pss-cards.json
```

`pss-cards.json` is what `pss-portfolio.html` and `pss-wiki.html` read. The two
intermediate files are kept because they are each faithful to one source; the
merge is where judgement enters, and keeping it separate makes that judgement
reviewable.

### `extract-pss-guide.py`

Reads the 1,644-page Product Information and Planning Guide. Four tables carry
everything a design turns on:

| Table | What |
|---|---|
| 5-1, 5-2 | orderable items — abbreviation, description, part number |
| 5-3, 5-4 | slot ranges per card per shelf — the legality matrix |
| 7-147, 7-148 | weight and power per component, and per gray pluggable |
| Glossary | 715 terms, the only place the faceplate mnemonics are spelled out |

Two things in that PDF defeat ordinary text extraction, and `pss_layout.py`
handles both:

* **Footnote markers are glued to the values.** Flattened, 4KIT's static power
  reads `342` and its maximum `2503` — that is 34 with footnote 2 and 250 with
  footnote 3. The markers are set at 5 pt against 8 pt body text, so filtering
  by character size removes them exactly. No regex could tell 250³ from 2503.
* **Rows are not separated by blank lines.** Cells are vertically centred and a
  two-line description is spaced like two one-line rows. CDoc draws a rule
  under every row, so rows are split on those rules instead.

The same size filter is then used in reverse: notes 7 and 8 of Table 7-147 are
the only statement anywhere in the guide that a card is two or three slots
wide, so the marker digits are read back and turned into a `slots` field.

### `extract-pss-roadmap.py`

Every product slide in the roadmap deck is one table: first row the product
names, remaining rows the attributes. Release wording is kept verbatim — "GA",
"GA (NG R27.Q1)", "R28.1H" — because the difference between shipping and
planned is the whole point of the deck, and normalising it would quietly invent
certainty.

### `build-pss-cards.py`

Merges the two. The guide knows what ships; the deck knows what is coming and
carries the optical numbers. Each card records which source it came from, so a
card the deck names and the guide does not is visibly **not yet shipping**
rather than a suspected extraction failure.

Two judgement calls worth knowing about:

* **Variant names.** The deck writes a family and its variants as one name.
  `IR9/LP` means IR9 and IR9LP — the suffix appends. `S6AD600H/L/E` means
  S6AD600H, S6AD600L, S6AD600E — the letter replaces. Where the guide knows one
  reading, that settles it. Where it knows neither, only the appended form
  becomes a card and the other is kept as a searchable alias, because guessing
  would invent part names.
* **Card type.** The guide's categories only cover the currently orderable
  list, so two in five cards would be unfilterable. Type is inferred from what
  names the card — description first, then roadmap group, then the guide's
  category — and never from roadmap attribute *values*, since nearly every card
  lists the shelves it supports and that one phrase would type half the
  catalogue as shelves.

---

## DCI picker — `build-xpdr-data.py`, `dci-cases.js`, `check-dci-page.js`

`dci.html` answers one question: given a DCI requirement, which transponder?
It runs on `assets/xpdr-data.json`, which unifies the two knowledge bases above
into one schema.

```bash
python3 tools/build-xpdr-data.py     # reads gx-rules.json + pss-cards.json
node    tools/dci-cases.js           # engine regression, 27 assertions
node    tools/check-dci-page.js      # headless page check (needs a local server)
```

### Why a third file rather than querying the two directly

The two sources describe a transponder in incompatible shapes. GX is
structured — cage counts, slot widths and rate licences are table cells the
configurator itself reads. PSS is prose: the roadmap deck writes the whole line
side as one slash-separated sentence per card. A picker that has to compare a
CHM7 against an S13X400H needs them in the same shape, and the reshaping is
where the mistakes live — so it happens once, in a script, with the original
string kept beside the parsed values.

Every card keeps its source sentence under `raw`. The page shows it in the
detail drawer, so a bad parse is visible to whoever is reading the answer rather
than buried in a build step.

### Three rules that are curated, not parsed

Listed together at the top of `build-xpdr-data.py` so they can be corrected in
one place. Neither source states any of them:

| Rule | What it says |
|---|---|
| `DEPTH` | G31 and G32 need more than 600 mm — open rack or 700 mm+, not a closed cabinet. Everything else fits a standard 600 mm cabinet. |
| `CASCADE` | Sub-100G behind a high-rate card: 16P200 in PSS, UCM4 in G42 (only feeding a CHM6/CHM7), UTM2 in G31/G32. |
| `WSON` | L0 GMPLS/WSON restoration requires a PSS photonic line system. The transponder stays flexible — a GX sled can ride it as an alien wavelength. |

### Parser traps worth knowing about

* **`130GBd` is not 130G.** The rate token needs a trailing guard against a
  following letter, or a baud figure parses as a line rate. The greedy
  slash-list pattern reads `400G/500G/…/800G / 130GBd` as one list and would
  otherwise hand back 130.
* **A roadmap row covers a variant set.** `S6AD600H/E : Cband … / S6AD600L :
  Lband` expands to three cards, and taking the union of the bands would make
  every S6AD600 dual-band — wrong in the dangerous direction, since it would
  offer an L-band card for a C-band line system. The card's own suffix decides.
* **`clientCages` is positional, not typed.** The workbook stores
  `[slot1, slot2, slot3]` counts; the form factor has to come from the
  validation table governing the same position, or UTM2's `[2, 12]` labels both
  cages with whatever type happens to sit first in a list.
* **`CHM7P-C8-1.6T+` is 1.6T of aggregate.** Two 800G line pluggables, not a
  1.6T wavelength. Reading the name as a per-carrier ceiling invented 900G–1.6T
  line rates that no ROADM would be asked for.

### What the engine reports, and why

`assets/dci-engine.js` does not just filter — it prices each answer in the terms
a design review uses:

* **Line fill** is measured against the carriers the load actually needs, not
  every line port the card owns. 240G on a card with two 400G ports is 60% on
  one wavelength with a spare port, not 15% across both.
* **A cascade costs cages on the host card.** The aggregator hands its sub-100G
  back as OTU4/100G, and that handoff lands in a client cage on the
  transponder — so the uplinks are seated alongside the direct clients.
* **Nothing is silently dropped.** A client service that cannot land and cannot
  be cascaded is a blocker, and the card appears under "ruled out" with the
  reason, rather than vanishing from the list.

### Two settings that change what "matching" means

* **Line technology.** A transponder cannot always be run at its own
  ceiling — reach, spacing and the OSNR on the day all pull it down — so the
  rate the design asks for is a *floor on the card's technology*, not a label
  to match. In the default `class` mode a card qualifies if it has any profile
  at or above the asked rate, and runs the lowest one that does; picking one
  higher-class card that covers several rate needs is how a network ends up
  carrying fewer transponder types. Rounding up is always stated as a cost
  ("no 500G profile — nearest is 600G"), and an exact native profile earns a
  fit line, so the two cases never look alike. `exact` mode restores the strict
  filter.
* **Multiple wavelengths.** Two 400G ports often beat one 600G port, and that
  is a line-system decision rather than a property of the card — so it is asked
  rather than assumed. With it off, a card may only light one carrier and the
  whole client load has to fit there; cards that would have spanned two
  wavelengths appear under "ruled out" naming that constraint. With it on, the
  wavelength count is reported as a cost, because wavelengths are the expensive
  unit on the line system.

### The three-step method

The page is now shaped around the way the decision is actually made, rather
than around a rate you have to know in advance:

1. **How much traffic?** The client mix gives a total load. This is the only
   number the design really starts with.
2. **How hard is the link?** A level from 1 to 5. Levels 1–4 derate every card
   off *its own* ceiling — 100 / 80 / 60 / 50 % — and snap the result to a
   profile that card really has. Level 5 means you already have a rate from a
   link budget and enter it directly.
3. **Which card?** The engine picks, per card, the fewest wavelengths at the
   lowest profile that carries the load without exceeding what the link allows,
   and ranks on how fully the card is used.

Deriving the rate per card rather than globally is the point. On a level-3 link
an 800G card holds up 500G and a 1.2T card holds up 700G; comparing them at a
single assumed rate would hide exactly the difference the choice turns on.

The snap is nearest-profile, ties rounding up. On a dense 100G ladder that
lands where "one step down / two steps down" lands; on a sparse ladder like
S2AD800R's 400 / 600 / 800 it still lands on a rate the card has rather than
inventing one — level 2 on that card gives 600G, which is the one-step-down
answer as well.

These are planning figures for shaping a bid. The real number comes out of
WaveSuite, and the page says so.

### How a card is ranked

Weighted so that unsold capacity is what loses points:

| Term | Max | Why |
|---|---|---|
| Client coverage, native vs cascade | 40 | A cascade is a second card and a second failure point |
| Wavelength fill | 40 | Capacity lit and not sold |
| Card used (rate × ports) | 22 | Measured across the whole card, because a card is bought whole |
| Client cages right-sized | 14 | Idle cages are the same over-spec in another form |
| Slot economy | 12 | |
| Wavelengths lit | 10 | One 800G carrier costs less than two 400G |
| Shipping now | 9 | |
| Native profile at the asked rate | 8 | Level 5 only |
| Fits a 600 mm cabinet | 5 | |

"Card used" is rate × ports on purpose. For 800G of traffic it puts a
1 × 800G card first, a 2 × 400G card a close second — same capacity, one more
wavelength — and a 2 × 800G card well behind both, because only half of what
the customer is quoted gets lit.

---

## Portfolio insight — `build-insight-data.py`, `check-insight-page.js`

`portfolio-insight.html` is the at-a-glance surface: three tabs (portfolio
overview, transponder insight, optical layer insight) over a GX / PSS /
Combined switch.

```bash
python3 tools/build-insight-data.py    # -> assets/insight-data.json
node    tools/check-insight-page.js    # headless: contrast, tabs, scopes
```

It derives nothing at render time — every figure is computed at build time so
the page only draws. Sources are the four that already exist: `gx-data.js` for
the GX optical fields nothing else carries (degree count, band in THz, span
loss, WSS ports), `gx-rules.json` for slot legality, `pss-cards.json`, and
`xpdr-data.json`.

### Three things the data forced

* **The GX matrix counts slot occupants, and 15 of the 17 OFP2 modules are not
  slot occupants** — they ride in cages inside a ROADM or amplifier sled. Left
  in the matrix they made GX look like it owned two amplifiers; they now sit
  beside it as their own strip, classified by what they do rather than by the
  workbook's "OFP2", which is a form factor.
* **The two sources disagree on Super C+L.** GX datasheets say 12.2 THz, the
  PSS roadmap says 11.6 — a real difference in where each draws the super-L
  edge. Both are kept per platform and the page says so, rather than one being
  silently picked.
* **Degrees and WSS ports are not the same quantity.** GX carries a `deg`
  field, PSS a port count; the headline tile now reads WSS ports on both sides
  so the comparison is like for like.

### Chart rules

Built to the dataviz method, so the three tabs read as one system:

* Headline numbers are stat tiles, not one-bar charts.
* The coverage grid is sequential — one hue, light to dark. **One step is
  missing from the middle of each ramp on purpose**: a single-hue ramp has a
  crossover where the step is too dark for dark ink and too light for light
  ink (light `#2a78d6` tops out at 4.42:1, dark `#2f74c4` at 4.14:1), so a
  number on it could not clear AA whichever ink it wore. Fill and ink are both
  computed per cell against the step it lands on.
* GX and PSS are categorical slots 1 and 2 (blue / orange). The pair passes
  every gate of `validate_palette.js` in both modes — lightness band, chroma
  floor, CVD separation, normal-vision floor and contrast against the surface.
* Marks cap at 22px with a 4px rounded data-end square at the baseline,
  hairline solid grid, a legend whenever both platforms are on screen, and
  every chart carries a table view so no value is gated behind a hover.
* Text wears ink tokens, never a series colour.

### Cards or table

A **View** switch sits beside the platform scope. In table view every panel
drops its chart and shows its full data table instead — open rather than
collapsed, sortable on any column (click or keyboard), and with a **Copy as
TSV** button, because the tables double as a data source worth pulling into a
sheet. TSV rather than CSV: it pastes into Excel and Sheets without a delimiter
dialog, and nothing in this data contains a tab.

Sort state lives on each table rather than in page state, so two tables on one
screen sort independently. Blanks sort last in both directions — a missing
figure is not a small one.

Both views carry the same numbers; the table is never a reduced version. The
shelf comparison runs to 29 columns including the slot composition (service /
half / full / common / grid total and the grid shape), controller redundancy,
fan and PSU counts with their schemes, and the full client-service list.

---

## PSS Release 26.6 — `extract-pss-266.py`, `build-pss-266-data.py`

`pss-features.html` is the feature map and wiki for Release 26.6. Two steps,
because the source is 660 MB of PDF that does not belong in the repo:

```bash
pip install pdfplumber --break-system-packages
python3 tools/extract-pss-266.py "G:\...\Nokia Resource\PSS-26.6" -o /tmp/pss266
python3 tools/build-pss-266-data.py /tmp/pss266        # -> assets/pss-266.json
```

The first reads the PDFs once and caches a document map, a section index per
manual and the release delta. The second turns that cache into the page's data.
Re-run both when a release lands; nothing else changes.

### The document set is the knowledge

24 manuals, 38,766 pages, and the most valuable thing extracted is **which one
to open**. The two letters before `ZZA` in the CDoc number identify the manual:
`TQ` is features, `HQ` is hardware, `SQ` is hardware for the PSS-8x/12x/24x
family, `TW` is GMPLS, `TP` is DCN, `SD` is security, `TN` is the quick
reference. Everything else — `TG` at 6,362 pages of TL1, `TH` at 11,924 of
CLI, the nine per-shelf installation guides — is catalogued precisely so it is
not opened.

**HQ and TQ are one guide in two volumes**, and neither title says so: HQ is
*Product Information and Planning Guide*, TQ is *Product Information and
Planning Guide (Feature Information)*. "What is it" goes to HQ; "what can it
do" goes to TQ.

### Three parsing traps, all silent

* **No space glyphs.** `extract_text()` returns `OpticalChannelProtection(OCHP)`
  as one run. Everything reads `extract_words(x_tolerance=1.5)` instead —
  including the contents pages, which was not obvious: a camel-case regex
  "fixes" the body but still leaves `In-lineamplifier` and
  `IPREAMPconfigurations` in the section titles.
* **Printed page ≠ PDF index**, and the offset differs per document — TQ is
  −1, HQ is +1. It is measured from a few located headings, never assumed.
* **The glossary has no section number**, so the TOC cannot find it. It is
  located by its heading in the last 140 pages, and entries are term-line then
  definition-lines rather than a two-column table.

### A topic filter that reads the title

Sections are tagged by topic so the page filters the way an SE looks rather
than by chapter number. One trap worth keeping: match `\bMPLS\b`, not `MPLS` —
without the boundary, "GMPLS CP" files the control-plane section under Carrier
Ethernet.

### What the page flags

Nokia's own text calls the PSS-4hc a *15RU shelf* in prose and *6RU
(264.7 mm)* in its spec bullets. 264.7 mm is 6RU; 15RU / 664.7 mm is the
PSS-10hc in the paragraph below. The page says so rather than passing the
error on.
