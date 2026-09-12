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
