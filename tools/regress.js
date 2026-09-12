#!/usr/bin/env node
/* Diff the Summa BOM engine against the BOMs the Excel configurator produced.
 *
 *   node tools/regress.js [fixture.json ...]
 *
 * With no arguments it runs every fixture in tools/fixtures/. Exit code is the
 * number of fixtures that did not match, so this drops straight into CI.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const R = JSON.parse(fs.readFileSync(path.join(root, 'assets/gx-rules.json'), 'utf8'));
const E = require(path.join(root, 'assets/gx-bom-engine.js'));
E.init(R);

let files = process.argv.slice(2);
if (!files.length) {
  const dir = path.join(root, 'tools/fixtures');
  files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f))
    : [];
}
if (!files.length) {
  console.error('no fixtures — run tools/extract-fixtures.py first');
  process.exit(1);
}

const pad = (s, n) => String(s === undefined || s === null ? '' : s).padEnd(n);
let failed = 0;

for (const file of files) {
  const fx = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bom = E.buildBOM(fx.config);

  const got = new Map(bom.lines.map(l => [l.pon, l.qty]));
  const want = new Map(fx.expected.map(l => [l.pon, Number(l.qty)]));
  const pons = [...new Set([...want.keys(), ...got.keys()])].sort();

  const diffs = pons
    .map(p => ({ pon: p, want: want.get(p), got: got.get(p) }))
    .filter(d => (d.want || 0) !== (d.got || 0));

  const ok = diffs.length === 0;
  if (!ok) failed++;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${fx.sheet}  ${fx.config.chassisType}  ` +
              `(${fx.source})`);
  if (!ok) {
    console.log(`      ${pad('PON', 24)}${pad('expected', 10)}got`);
    for (const d of diffs) {
      console.log(`      ${pad(d.pon, 24)}${pad(d.want === undefined ? '—' : d.want, 10)}` +
                  `${d.got === undefined ? '—' : d.got}`);
    }
  }
  if (bom.warnings.length) bom.warnings.forEach(w => console.log('      ! ' + w));
  const s = bom.summary;
  console.log(`      ${s.slotsUsed}/${s.slotsTotal} slots · ${s.weightKg} kg · ` +
              `${s.power.total.map(v => Math.round(v)).join(' / ')} W @ 25/40/55 °C` +
              (s.headroomW ? ` · headroom ${s.headroomW.map(v => Math.round(v)).join(' / ')} W` : ''));
}

console.log(`\n${files.length - failed}/${files.length} fixtures match`);
process.exit(failed);
