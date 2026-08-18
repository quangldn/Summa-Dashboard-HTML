# MOFN HS OLS Configurator — Logic & Config Archive (v3)

> **Purpose**: archive the logic, data, and identified portfolio gaps of the
> Hyperscaler OLS Configurator (page `mofn.html`). Self-contained — readable
> without the HTML page or the source xlsx.
>
> **Source of truth**: `Summa/Input/HS Configurator.xlsx` (built by Quang)
> + capability rules added in v2 (band hierarchy, FP scaling, ILA strategy
> split, P2P ROADM/MUX choice).
>
> **Snapshot date**: 2026-05-25 · **Engine**: v2
> **Part catalog size**: 63 parts (37 Termination · 19 ILA · 7 dual-listed)

---

## 1. What changed between v1 / v2 / v3

| Aspect | v1 (xlsx-direct) | v2 (capability-rule) | v3 (network-aware) |
|---|---|---|---|
| Engine | 18 fixed scenario codes | Capability-based per-role picker | Same + topology-driven qty |
| Band filter | 4 options | 5 (adds L-only) | 5 |
| Band hierarchy | None | C++ covers C, L++ covers L | (same) |
| FP | dropdown (1, 4) | slider 1–8 | (same) |
| ILA strategy | rack-mixed dropdown | Raman / EDFA / P2P dropdown | **Derived from total km / span km + Raman checkbox** |
| ILA count | implicit (1 per scenario) | implicit | **Computed: spans − 1** |
| Term type | (none) | P2P sub-option only | **Universal ROADM/MUX toggle + channel count** |
| Card direction | not modeled | ×2 applied to ALL ILA cards | **bidi flag** — ILA*/IRB*/IL* = BIDI (×1); RPB*/PBAL* = unidirectional (×2) |
| Term node count | 1 (implicit) | 1 (implicit) | **2 endpoints (×2)** |

**Why v3**: real OLS BoMs scale with distance (1800 km → 29 ILAs) and the
direction-count of each card type (Raman uni-dir → ×2 per site; ILA EDFA
BIDI → ×1). v2 didn't model this — qty was always 1 per part. v3 produces
a real shippable BoM.

---

## 2. Filter taxonomy (v2)

### 2.1 Band requirement (5 options)

| Code | Band | Spectrum | Suffix examples |
|------|------|----------|------------------|
| `C`         | Std C only (non-upg to L) | 4.85 THz | `-N`, `-C` |
| `C++`       | Super C only (non-upg to L++) | 6.1 THz | `-W`, `-X` |
| `C+L`       | Std C + Std L | ~9.6 THz | `-Z` |
| `Super C+L` | Super C + Super L (C++ &amp; L++) | 12.5 THz | `-Y` |
| `L`         | L only | 4.7 THz | `-L` |

### 2.2 Fiber pairs — slider 1 → 8

Each card has `fpCap` (1 for single-FP cards, 4 for multi-fiber cards like
`G4ILA4SM`, `G2RPB4M`, `H4IRB4SG`).

**Qty formula**: `Math.ceil(FP / fpCap)` for all cards. **ILA cards are
BIDI** — one card serves 1 FP across both directions (2-deg) in a single
unit, so no ×2 multiplier is needed.

| FP value | Effect |
|----------|--------|
| 1 | 1× single-FP card OR 1× multi-fiber card |
| 2–3 | 2–3× single-FP card OR 1× multi-fiber card (4-fp underutilised) |
| 4 | 4× single-FP card OR 1× multi-fiber card |
| 5–7 | 5–7× single-FP card OR 2× multi-fiber card |
| 8 | 8× single-FP card OR 2× multi-fiber card |

Engine prefers multi-fiber (`fpCap=4`) cards when `FP ≥ 4`, single-FP otherwise.

### 2.3 ILA strategy (v3 — derived from inputs)

ILA strategy is no longer a dropdown — it's derived from three inputs:

| Input | Effect |
|-------|--------|
| **Total distance (km)** | total length of the OLS link |
| **Avg span between ILAs (km)** | engineering rule, typically 60–100 km |
| **Raman required (checkbox)** | drives ILA card mix |

Computed:
```
spans     = ceil(total / span)
termNodes = 2          (always: one at each endpoint)
ilaSites  = spans - 1  (mid-line amplification points)
mode      = 'p2p'      if total ≤ span  →  no ILA
          | 'raman'    if checkbox checked
          | 'edfa'     otherwise
```

**Example (Quang's spec)**: 1800 km ÷ 60 km/span = **30 spans** → 2 term + **29 ILA sites**.

### 2.4 Direction of each card type

| Card pattern | Direction | Qty per FP per site |
|--------------|-----------|----------------------|
| `*ILA*`, `*ILSGM*`, `*ILASGM*`, `*IRB*` | **BIDI** | 1 (covers both East+West in one unit) |
| `*RPB*` (Raman pre-amp + booster) | **Unidirectional** | 2 (one per direction) |
| `*PBAL*` (Pre-amp booster, ILA-side) | **Unidirectional** | 2 |
| Chassis | structural | 1 |
| Term-side amps | outbound-only | 1 (direction concept N/A on term) |

The engine's `bidi` flag on each part drives the qty multiplier.

Sub-option when ILA=P2P: term-side terminator is either **ROADM-based** (for
future expansion) or **MUX-based** (lowest cost, OMD only).

### 2.4 Rack constraint (3 options)

| Constraint | Effect |
|------------|--------|
| `any` | No constraint on chassis (default) |
| `300 mm only` | ILA chassis must be 300 mm (G34c / G38c / G32c). Term unaffected. |
| `700 mm only` | ILA chassis must fit in 700 mm rack (300 mm also fits). |

Rack constraint **does not** apply to termination chassis — term is always
700 mm at the HS DC (G32 / G32E / G34L).

### 2.5 GA release ceiling (RFS gate)

Same as v1: user picks max acceptable release. Parts past the ceiling are
flagged 🚧 Roadmap but still recommended.

---

## 3. Band hierarchy rule (Quang's item 5)

The core capability rule: **wider-band hardware can serve narrower-band
deployments**.

### 3.1 Suffix → covered bands

| Suffix | Card covers (user-band match) | Footprint |
|--------|-------------------------------|-----------|
| `N` | `C` | exact std C |
| `C` | `C` | exact std C (upg path) |
| `W` | `C`, `C++` | Super C non-upg |
| `X` | `C`, `C++` | Super C upg-to-L++ |
| `L` | `L` | exact std L |
| `Z` | `C`, `L`, `C+L` | std C+L card |
| `Y` | `C`, `C++`, `L`, `C+L`, `Super C+L` | universal C+L cover |
| `0` | all bands | common / band-agnostic |
| `*` | all bands | chassis structure (band-agnostic) |

### 3.2 Selection algorithm

For each role (chassis, ROADM, OMD, amp, ILA EDFA, ILA Raman) the engine
runs `pickBest`:

```
1. Filter parts where bandCoverage[part.suffix] contains userBand.
2. Sort by:
   a. Exact match before over-provision.
   b. Smallest coverage-set size (closer fit) when over-provisioning.
   c. Within release ceiling before above-ceiling.
   d. Highest release within ceiling (newer/refined hardware).
   e. Lowest release above ceiling (earliest roadmap RFS).
3. Return list[0].
```

The "smallest-coverage-set" tiebreaker prevents picking a Y-suffix (universal)
card when an X-suffix (Super C) would do for C-only deployments.

### 3.3 Worked examples

| User band | Eligible suffixes (by preference) |
|-----------|-----------------------------------|
| `C` | N → C → W → X → Z → Y → 0 |
| `C++` | W → X → Y → 0 |
| `C+L` | Z → Y → 0 |
| `Super C+L` | Y → 0 (only) |
| `L` | L → Z → Y → 0 |

---

## 4. Compiled BoMs across the input space

Sampled at `RFS ≤ R9.1`, rack=any, ILA strategy=Raman unless otherwise noted.

### 4.1 Single-FP scenarios

| Filter | Term node | ILA site |
|--------|-----------|----------|
| `C` / FP1 / Raman | G32E + G3S-G3RD32TH-X0 + G2PBALZZ-N0 | G34c + 2× C2ILASGH-X0 + 2× C2RPBMZZ-Y2 |
| `C` / FP1 / EDFA-only | G32E + RD32TH-X0 + PBALZZ-N0 | G34c + 2× C2ILASGH-X0 |
| `C` / FP1 / P2P MUX | G32E + GQS-OMD32EZZ-N0 + PBALZZ-N0 | — |
| `C` / FP1 / P2P ROADM | G32E + RD32TH-X0 + PBALZZ-N0 | — |
| `C++` / FP1 / Raman | G32E + RD32TH-X0 + G1RPBMZZ-W2 | G34c + 2× C2ILASGH-X0 + 2× C2RPBMZZ-Y2 |
| `C+L` / FP1 / Raman | G32E + H3RD66TM-Z0 + G1RPBMZZ-Y2 (⚠ over-prov) | G34c + 2× D2ILASGM-Z0 + 2× C2RPBMZZ-Y2 |
| `Super C+L` / FP1 / Raman | G32E + RPBMZZ-Y2 + OTSCHZ-Y0 🚧 (no ROADM in catalog) | G34c + 2× C2RPBMZZ-Y2 (⚠ no EDFA-Y ILA) |
| `L` / FP1 / Raman (incl roadmap) | G34L 🚧 + RD32TH-L0 🚧 + RPBMZZ-Y2 | G32c 🚧 + 2× C2ILASGH-L0 🚧 + 2× C2RPBMZZ-Y2 |

### 4.2 Multi-FP scenarios (FP slider)

| Filter | Term node | ILA site |
|--------|-----------|----------|
| `C+L` / FP2 / Raman | G32E + 2× H3RD66TM-Z0 + 2× RPBMZZ-Y2 | G32E(I) + 4× D2ILASGM-Z0 + 4× C2RPBMZZ-Y2 |
| `C+L` / FP4 / Raman | G32E + 4× H3RD66TM-Z0 + 1× G4ILA4SM-Z0 | G34c + 2× G4ILA4SM-Z0 + 2× G2RPB4M-Y2 🚧 |
| `C+L` / FP5 / Raman | 2× G32E + 5× H3RD66TM-Z0 + 2× G4ILA4SM-Z0 | G32E(I) + 4× G4ILA4SM-Z0 + 4× G2RPB4M-Y2 🚧 |
| `C+L` / FP8 / Raman | 2× G32E + 8× H3RD66TM-Z0 + 2× G4ILA4SM-Z0 | G32E(I) + 4× G4ILA4SM-Z0 + 4× G2RPB4M-Y2 🚧 |
| `Super C+L` / FP4 / Raman | G32E + G2RPB4M-Y2 🚧 + 4× OTSCHZ-Y0 🚧 | G34c + 2× G2RPB4M-Y2 🚧 (no ROADM/EDFA-Y) |

---

## 5. Items 1 & 2 — Audit (Quang's questions)

### 5.1 Other filter dimensions not yet in the UI

| Dimension | Why it matters | Status |
|-----------|----------------|--------|
| **Span length (km)** | Drives Raman vs EDFA-only choice; long span → Raman needed | **Partially addressed** by ILA strategy filter (v2 item 4). Could add an explicit km input. |
| **Channel count** | Drives OMD selection (32 / 40 / 42 / 48 / 64 ch). Today the engine picks the smallest matching OMD; SE may want explicit choice. | **Not in UI.** OMD selection is "first-matching" only. |
| **Term node degree** | Real deployments are 2/4/8/16/32-deg ROADMs. Catalog has 9, 20, 32, 66 deg ROADMs. | **Not in UI.** Engine picks first matching ROADM regardless of degree. |
| **Protection scheme** | 1+1, OMSP, OCh-P drive extra cards / route diversity | Not represented |
| **Encryption variant** | `D` (encrypted) vs `N` (clear) suffix on some PNs | Not represented |
| **OTSCH need** | Required for Super C+L spectrum splitting | **Auto-added** when band = Super C+L |
| **CDC (colorless/directionless/contentionless)** | Mostly "No need" for HS per xlsx | Engine respects HS=No flag; not surfaced as filter |
| **Power feed** (AC / DC) | Affects PSU SKU selection — not in current catalog | Not in scope today |
| **OAM / management** (in-band OSC / OOB) | Drives OCC + control plane | Engine auto-adds OCC card |

**Recommendation**: add **Channel count** and **Term ROADM degree** as next
filters — both materially change the SKU pick.

### 5.2 Hardware gaps in the current catalog

| Gap | Detail | Impact |
|-----|--------|--------|
| **No Super C+L OMD (Y-suffix)** | Catalog has OMDs in N / C / L / X / 0. No `OMD*-Y*`. | F-group (FP4 Super C+L) and any Super C+L MUX-based P2P has no mux. **Highest-priority gap.** |
| **No FP5–8 native cards** | Only `fpCap=1` (single-FP) and `fpCap=4` (multi-fiber) exist. FP5–7 must use 2× FP4 sets (under-utilized); FP8 = 2× FP4 exactly. | OK for FP ≤ 4 and FP = 8; less efficient at FP 5–7. New 8-fiber card would fix. |
| **L-band ROADM thin** | Only `G3S-G3RD32TH-L0` (R8.2 tbc). No L-band 66-deg ROADM. | L-only deployments at high degree limited until R8.2 GA + future. |
| **G34L (L-band 700mm chassis) not GA** | R9.2 tbc. | Blocks L-only deployments today. |
| **L-band CAD mux not GA** | `G3S-G1CAD10A-L0` TBD. | Only relevant if HS deploys CDC for L (not typical). |
| **No Super C+L EDFA-only ILA** | All Y-suffix ILA cards are Raman (`C2RPBMZZ-Y0/Y1/Y2`) or term-side amps. No Y-suffix pure EDFA ILA. | Super C+L with EDFA-only ILA strategy returns no part. Gap to flag. |
| **No 4-fiber Y-suffix EDFA term amp** | `G3S-G4ILA4SM-Z0` is Z (C+L only). For FP4 Super C+L, only Raman (`G2RPB4M-Y2`) covers — and it's R10.1 roadmap. | F-group has zero GA hardware until R10.1. |
| **4-fiber Raman/Hybrid both R10.1** | `G2RPB4M-Y2` and `H4IRB4SG-Z2` both R10.1. | All FP4 high-density scenarios are roadmap-only today. |

### 5.3 Options Quang may have overlooked in the xlsx

- **L-only deployment** as a primary scenario (now added to v2 band filter)
- **EDFA-only ILA strategy** (now a v2 ILA option — xlsx assumed Raman everywhere)
- **P2P with ROADM termination** (xlsx P2P scenarios only had OMDs; v2 adds the toggle)
- **Mid-range FP counts** (FP=2, 3, 5, 6, 7) — slider now supports them
- **OTSCH** as an auto-required card for Super C+L (xlsx had it listed but not auto-assigned)

---

## 6. Engine algorithm (v2)

### 6.1 High-level flow

```
function recommend(band, fp, ila, p2pType, rack, relCeiling):
  eligible = PARTS.filter(eligibility(band, rack))
  termBom  = []
  ilaBom   = []

  # ---- TERMINATION ----
  termBom += pickBest(term, ['chassis'], …)         × ceil(FP / fpCap)
  termBom += pickBest(term, ['occ'], …)             × 1
  if ila == 'p2p' and p2pType == 'mux':
    termBom += pickBest(term, ['omd'], …)           × ceil(FP / fpCap)
  else:
    termBom += pickBest(term, ['roadm'], …)         × ceil(FP / fpCap)
    # fallback to OMD if no ROADM available
  termBom += pickBest(term, [amp categories], …)    × ceil(FP / fpCap)
  if band == 'Super C+L':
    termBom += pickBest(term, ['otsch'], …)         × ceil(FP / fpCap)

  # ---- ILA (only if non-P2P) ----
  if ila != 'p2p':
    ilaBom += pickBest(ila, ['chassis'], rack-gated)   × ceil(FP / fpCap)
    ilaBom += pickBest(ila, ['ila-edfa'], …)           × ceil(FP / fpCap) × 2
    if ila == 'raman':
      ilaBom += pickBest(ila, ['ila-raman','ila-hybrid'], …) × ceil(FP / fpCap) × 2

  return {termBom, ilaBom}
```

### 6.2 Eligibility filter

```
eligibility(band, rack) = part →
  part.hs not in {'No', 'No - HS no need CDC'} AND
  bandCoverage[part.suffix] contains band AND
  (part.section == 'term' OR rackOk(part, rack))
```

### 6.3 pickBest sort priority

1. **Exact band-match** before over-provision
2. **Smaller coverage footprint** (closer fit) when over-provisioning unavoidable
3. **Within release ceiling** before above-ceiling
4. **Highest release within ceiling** (newer = more refined hardware)
5. **Lowest release above ceiling** (earliest roadmap RFS)

### 6.4 Qty math (v3)

**Per-card qty** = `perFP × dirMult × siteMult`

| Factor | Formula | Example (FP=1, 1800km/60km) |
|--------|---------|------------------------------|
| `perFP`     | `ceil(FP / fpCap)` | 1 |
| `dirMult`   | `1` if BIDI, `2` if unidirectional | 1 (BIDI EDFA) or 2 (uni-dir Raman) |
| `siteMult`  | `2` for term, `ilaSites` (=spans−1) for ILA | term: 2, ILA: 29 |

**Worked example (1800 km / 60 km / FP1 / C+L / Raman / ROADM)**

| Item | Where | perFP | dirMult | siteMult | Total qty |
|------|-------|-------|---------|----------|-----------|
| G32E chassis | term | 1 | 1 | 2 | **2** |
| GLS-G30OCC2T-00 OCC | term | 1 | 1 | 2 | **2** |
| G3S-H3RD66TM-Z0 ROADM | term | 1 | 1 | 2 | **2** |
| G3S-G2PBALZZ-N0 booster | term | 1 | 1 | 2 | **2** |
| G34c chassis | ILA | 1 | 1 | 29 | **29** |
| G3S-D2ILASGM-Z0 (BIDI) | ILA | 1 | 1 | 29 | **29** |
| G3S-C2RPBMZZ-Y2 (uni-dir) | ILA | 1 | 2 | 29 | **58** |

---

## 7. Suffix legend (carried forward from v1)

| Suffix | Code | Meaning |
|--------|------|---------|
| `N` | C/Non | Non-upg std C (4.85 THz) |
| `C` | C/Upg | Std C, upg-to-L |
| `L` | L | Std L-band |
| `W` | C++/Non | Super C (6.1 THz, wide C), non-upg |
| `X` | C++/Upg | Super C, upg-to-L++ |
| `Y` | C++ & L++ | Super C + Super L (12.5 THz) |
| `Z` | C+L | Std C + Std L |
| `S` | S | S-band (not in HS scope) |
| `O` | O | O-band (not in HS scope) |
| `0` | Common | Band-agnostic / common card |
| `*` | Chassis | Internal: chassis structure is band-agnostic |

---

## 8. Actions for PLM review (v2)

### Top priority

1. **F-group (FP4 Super C+L)**: only GA hardware path requires R10.1
   (`G2RPB4M-Y2` + `H4IRB4SG-Z2`) + R9.2 tbc OTSCHZ-Y0. **What is the firm
   R10.1 RFS date?** Any earlier interim solution?

2. **No Y-suffix OMD**: Super C+L MUX-based termination has no path. Is a
   `GQS-OMD-Y*` planned? Or do Super C+L deployments always require ROADM
   instead of OMD?

3. **No Y-suffix EDFA-only ILA**: Super C+L with EDFA-only strategy has no
   ILA EDFA part. Is `D2ILASGM` slated for a Y-suffix variant?

### Medium priority

4. **L-band coverage**: `G34L` (R9.2 tbc), `G3S-G3RD32TH-L0` (R8.2 tbc),
   `G3S-C2ILASGH-L0` (R10.0). Confirm RFS dates and whether L-only
   deployments are a sales priority.

5. **Channel-count filter**: should OMD selection be SE-driven (channel
   count = 32/40/42/48/64) rather than first-match? Confirm SE workflow.

6. **Term ROADM degree**: catalog has 9 / 20 / 32 / 66 deg ROADMs. Should
   the SE be able to filter by degree (driven by node connectivity need)?

### Documentation

7. **Sparse / never-assigned parts**: 11 catalog parts have never been
   assigned to any scenario in v1 (`RD66Tx-Z0`, `H3RD66TH-Z0`, full
   `G3S-G1RPBMZZ-Y0/Y1/Y2/Yx` set, etc.). Confirm intended use or mark for
   retirement.

---

## 9. Change log

- **2026-05-25 (v3)** — Distance-driven topology. Total km + avg span km
  derive spans (`ceil(total/span)`), term node count (always 2), and ILA
  site count (`spans − 1`). Card direction modeled per-PN via `bidi` flag:
  ILA*/IRB*/ILSGM/ILASGM = BIDI (×1); RPB*/PBAL* = unidirectional (×2 per
  direction). Term type promoted to universal ROADM/MUX toggle with
  channel-count selector. Term BoM × 2 endpoints, ILA BoM × ilaSites.
  Matches Quang's example: 1800 km / 60 km → 2 term + 29 ILA.

- **2026-05-25 (v2.1)** — Corrected ILA qty math: ILA cards are BIDI
  (bidirectional), so 1 card serves 1 FP across both directions of a 2-deg
  site. Removed the ×2 multiplier on EDFA / Raman ILA cards. Quantities now
  match real BoM hardware count.

- **2026-05-25 (v2)** — Refactored from xlsx-direct lookup to capability-rule
  engine. Added band hierarchy (C++ covers C, L++ covers L). FP slider 1–8.
  Split ILA strategy into Raman / EDFA-only / P2P. Added P2P ROADM-vs-MUX
  toggle. Rack constraint became a separate filter, applied only to ILA
  chassis. Added L-only band filter. OTSCH auto-added for Super C+L.

- **2026-05-25 (v1)** — Initial archive. Extracted 63 parts × 18 scenarios
  from `HS Configurator.xlsx`. Identified 7 empty scenarios, 4 partial
  scenarios, systemic OMD omission across ILA scenarios.

---

*Maintained by Quang · Nokia ON SE Vietnam · GMT+7*
