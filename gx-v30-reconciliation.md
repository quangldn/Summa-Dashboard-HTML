# GX BOM Configurator V3.0 — what it changes for the Summa tools

Read of `GX/Q3-26/GX BOM Configurator V3.0.xlsm` (Nokia, 2026-08-04, "Added
support for GX R9.1"), reconciled against the Aug-2026 roadmap deck, PowerDraw
R9.0 and the current `mofn.html` engine.

---

## 1. What V3.0 is, and which parts of it are authoritative

| Sheet | Rows | What it holds | Trust it for |
|---|---|---|---|
| `AUX` | 1948 × 43 | the rules engine — chassis geometry, per-sled slot cost, PN ↔ sled mapping, sled classification, SW/NMS licence rules | **slots, chassis geometry, PN mapping** |
| `PON VAULT` | 666 | SKU master: PN, material number, product family, item phase, sales status, MSRP | **lifecycle + list price** |
| `CONFIG #n` / `MC CONFIG #n` | — | per-chassis and multi-chassis build sheets | the intended workflow |
| `NETWORK CONFIGURATOR` / `SUMMARY` | 845 / 4573 | multi-site roll-up, BOM report | output format |
| `CPQ EXPORT` | 77 | quote hand-off format | export shape |
| `ROADMAP` | 63 | the *tool's* own dev backlog, not the product roadmap | nothing for us |

Its own release notes are worth quoting:

> **V3.0, known limitation 1** — "PEM power calculation is still not fully
> tested. PEMs input power assumes **90 % efficiency**. AC input is based on
> 220 V AC."

That is the same 0.90 the Summa configurator uses, taken independently from the
PowerDraw breaker sheet. The two now corroborate each other.

Other limitations Nokia flags in V3.0: fibre BOM for OTDR may double-count
cables; RFL export is beta; **R9.1 configuration rules not fully tested**;
**RD66TM not fully modelled** — which matters below.

---

## 2. Slot counts — the Summa engine is wrong on 14 cards

Chassis quantity is derived from slot cost, so this is the change with the
largest effect on generated BoMs. V3.0's `AUX` sled table and the roadmap deck
agree with each other and both disagree with the engine:

| PN | Card | Summa today | V3.0 AUX | Roadmap deck |
|---|---|---|---|---|
| `G3S-D2ILASGM-Z0` | D2ILA (compact C+L ILA) | 2 | **4** | 4 |
| `G3S-C2ILASGH-X0` | BiDiEDFA | 1 | **2** | 2 |
| `G3S-C2RPBLZZ-W0/W1/W2` | Raman low-span-loss | 1 | **2** | 2 |
| `G3S-C2RPBMZZ-Y0/Y1/Y2` | Raman med-perf C+L | 1 | **2** | 2 |
| `G3S-G2PBALZZ-N0` | PBAL booster | 1 | **2** | 2 |
| `G3S-G3RD32TH-X0` | RD32TH Super C | 2 | **3** | 3 |
| `GLS-G30OCC2T-00` | OCC2T | 1 | **2** | OFP2 host |
| `G3S-C2OCC2EZ-00` | OCC2E | 1 | **2** | OFP2 host |

Cards not yet in V3.0 (R10.x, so absent from an R9.1 tool) where the deck is the
only source: `G3S-G4ILA4SM-Z0` 4 slots, `G3S-D2IRB1SM-Z2` 4, `G3S-H4IRB4SG-Z2`
8, `G3S-G3RD32TH-L0` 3, `G3S-C2ILASGH-L0` 2.

**Worked effect.** A canonical C+L ILA site today: D2ILASGM + 2 × C2RPBM.
Summa scores that 2 + 1 + 1 = 4 slots and fits it in a 4-slot G34c. The correct
figures are 4 + 2 + 2 = **8 slots** — which exactly fills a G34c, because the
G34c has **8** slots, not 4 (§3). Same answer at FP 1, by luck. At FP 2 the
engine says one shelf and the truth is two.

---

## 3. Chassis geometry

`AUX` rows 26–52 and 217–229:

| Chassis | Rows × slots/row | Slots | RU | Summa today |
|---|---|---|---|---|
| G31 | 1 × 4 | 4 | 1 | 4 slots, 1 RU ✓ |
| G32 / G32E | 2 × 4 | 8 | 2 | 8 slots, 2 RU ✓ |
| G34c / G34Xc | 4 × 2 | **8** | **4** | 4 slots, 4 RU ✗ |
| G40 (G42) | 2 × 2 | 4 | 3 | n/a |

G32c, G38c and G34L are absent from V3.0 — it is an R9.1 tool and those are
R9.3/R10.1/R10.2 items. Use the roadmap deck for them: G32c 4 slots / 2 RU,
G38c 16 / 8, G34L 8 / 4.

Depth: the roadmap deck calls the full family **600 mm**, not the 700 mm the
Summa engine and catalog use throughout. The 300 mm figure is unchanged.

---

## 4. One genuine three-way conflict: RD66

| Source | RD66TM / RD66TH slot cost |
|---|---|
| V3.0 `AUX` sled table | **3** |
| Aug-2026 roadmap deck | **6** |
| Summa today | 2 |

Both are Nokia documents of the same month. The plausible reconciliation is that
the deck counts half-height positions across a 2 RU sled (2 rows × 3 columns = 6)
while the tool counts 3 within its own row model — but that is inference, not
fact, and V3.0's own limitation list says *"RD66TM not fully modelled"*, which
is reason to distrust the 3.

This one needs a ruling before it goes into the engine. Everything else in §2
is unambiguous.

---

## 5. V3.0's power and weight table is not trustworthy — keep PowerDraw

`AUX` carries `WEIGHT / 25C / 40C / 55C` per sled, but several rows look like
copy-paste from a neighbouring card:

| PN | V3.0 AUX | PowerDraw R9.0 | Assessment |
|---|---|---|---|
| `G3S-D2ILASGM-Z0` | 62 / 100 / 100 W · 2.4 kg | 110 / 145 / 180 W · 4.4 kg | V3.0 has the **BiDiEDFA** row's values |
| `G3S-C2RPBMZZ-Y1`, `-Y2` | 37 / 60 / 60 W | 54 / 85 / 102 W | V3.0 has the **RPBL** row's values |
| `G3S-C2ILASGH-X0` | 62 / 100 / 100 W | 62 / 90 / 90 W | 40 °C figure differs |
| `G3S-G1RPBMZZ-Y0` | 1.4 kg | 1.18 kg | weight differs |
| `G3S-C2RPBLZZ-W0`, `G1RPBMZZ-W0`, `G3RD32TH-X0`, `C2RD12TI-W0` | — | — | match exactly |

**Rule to adopt: `AUX` is the authority for slots, chassis geometry and PN ↔ sled
mapping; PowerDraw R9.0 stays the authority for power and weight.** The Summa
configurator already sources power from PowerDraw, so nothing changes there.

---

## 6. Structural finding: OMDs are shelves, not cards

In V3.0 every OMD — `OMD32E`, `OMD40E`, `OMD42-L`, `OMD48E`, `OMD48S`,
`OMD64`, `OMD64S` — is modelled as its **own chassis type** with its own RU
(1 RU for OMD40E/48S/32E, 2 RU for OMD48E/64/64S/42-L) and `SLOTS = NA`.

The Summa engine currently treats an OMD as a 1-slot card inside the termination
chassis. That is wrong in both directions: it consumes a slot it should not, and
it contributes no rack space it should. For a MUX-terminated site the correction
removes one slot per fibre pair from the chassis calculation and adds 1–2 RU of
passive shelf per OMD to the rack budget.

---

## 7. What V3.0 adds that Summa has no equivalent for

- **List prices.** `PON VAULT` carries MSRP per PN plus `ItemPhase`
  (`REVENUE` / `EOA-ANNOUNCED`) and `Sales Status` (`Shippable`). A price
  column would make the Summa BoM quotable rather than indicative — but prices
  are commercially sensitive and the workbench is a GitHub repo, so this needs
  a deliberate decision before it goes anywhere near a page.
- **Lifecycle per PN from the SKU master**, which is better evidence than the
  roadmap deck for what is orderable today.
- **CPQ export format** — the shape a quote hand-off has to take.
- **Fibre and cable modelling**, which Summa does not attempt.

---

## 8. Proposed order of work

1. Apply §2 and §3 — slot costs and G34c geometry. Highest impact, unambiguous.
2. Apply §6 — OMD as a passive shelf rather than a slot occupant.
3. Take a ruling on RD66 (§4), then apply.
4. Re-run the PowerDraw regression: the 1800 km / 60 km / FP 1 / C+L baseline
   must still produce 324 W typ and 449 W max@40 per ILA site.
5. Decide separately on prices (§7).
