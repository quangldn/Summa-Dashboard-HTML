/* Regression cases for the DCI selection engine.
   node tools/dci-cases.js

   Each case states the requirement and what a sales engineer would expect the
   answer to look like. The assertions are deliberately about *shape* — that a
   cascade appears, that a deep chassis drops out — rather than pinning an exact
   winner, because the winner legitimately changes as the roadmap data moves. */

const path = require('path');
const DCI = require(path.join(__dirname, '..', 'assets', 'dci-engine.js'));
const data = require(path.join(__dirname, '..', 'assets', 'xpdr-data.json'));

let pass = 0, fail = 0;

function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  <' + detail + '>' : '')); }
}

function show(r, n) {
  r.ranked.slice(0, n || 3).forEach((c, i) => {
    console.log('    ' + (i + 1) + '. ' + c.xpdr.name.padEnd(16) +
      c.xpdr.platform.padEnd(5) +
      ('score ' + c.score).padEnd(11) +
      (c.slots + ' slot').padEnd(8) +
      ('line ' + c.lineUtil + '%').padEnd(11) +
      (c.host ? c.host.name : '—'));
    c.fits.slice(0, 2).forEach(f => console.log('         + ' + f));
    c.costs.slice(0, 2).forEach(f => console.log('         - ' + f));
  });
}

// ----------------------------------------------------------------
console.log('\n[1] Plain 400G DCI, 4x 100GE clients, standard 600 mm site');
let r = DCI.recommend(data, {
  challenge: 5, lineRateG: 400,
  clients: [{ service: '100GE', qty: 4 }],
  depth: 'std',
});
show(r);
check('returns viable candidates', r.ranked.length > 0);
check('top pick needs no cascade', r.ranked[0] && !r.ranked[0].cascade);
check('line fill is 100%', r.ranked[0] && r.ranked[0].lineUtil === 100,
  r.ranked[0] && String(r.ranked[0].lineUtil));
check('no deep-rack chassis in a 600 mm site',
  r.ranked.every(c => c.hosts.every(h => h.depthClass !== 'deep')));

// ----------------------------------------------------------------
console.log('\n[2] 800G DCI, 2x 400GE clients');
r = DCI.recommend(data, {
  challenge: 5, lineRateG: 800,
  clients: [{ service: '400GE', qty: 2 }],
  depth: 'any',
});
show(r);
check('returns viable candidates', r.ranked.length > 0);
check('every candidate actually runs 800G',
  r.ranked.every(c => c.xpdr.lineRatesG.indexOf(800) >= 0));
check('line fill is 100%', r.ranked[0] && r.ranked[0].lineUtil === 100);

// ----------------------------------------------------------------
console.log('\n[3] Mixed load: 400G line, 2x 100GE + 4x 10GE  (the cascade case)');
r = DCI.recommend(data, {
  challenge: 5, lineRateG: 400,
  clients: [{ service: '100GE', qty: 2 }, { service: '10GE', qty: 4 }],
  depth: 'any',
});
show(r, 4);
check('returns viable candidates', r.ranked.length > 0);
const native = r.ranked.filter(c => !c.cascade);
const cascaded = r.ranked.filter(c => c.cascade && c.cascade.resolved);
console.log('    native: %d   cascaded: %d',
  r.rankedAll.filter(c => !c.cascade).length,
  r.rankedAll.filter(c => c.cascade && c.cascade.resolved).length);
check('a card that takes 10GE natively is found', native.length > 0);
check('native card outranks a cascaded one',
  !cascaded.length || !native.length || native[0].score >= cascaded[0].score);
check('cascaded candidates name their aggregator',
  cascaded.every(c => c.cascade.via && c.cascade.via.label));

// ----------------------------------------------------------------
console.log('\n[4] 800G line with a few 10GE — high rate forces a cascade');
r = DCI.recommend(data, {
  challenge: 5, lineRateG: 800,
  clients: [{ service: '400GE', qty: 1 }, { service: '100GE', qty: 2 },
            { service: '10GE', qty: 4 }],
  depth: 'any',
});
show(r, 4);
const withCas = r.rankedAll.filter(c => c.cascade && c.cascade.resolved);
console.log('    candidates needing a cascade: %d of %d', withCas.length, r.rankedAll.length);
check('at least one 800G answer exists', r.ranked.length > 0);
check('10GE is either native or cascaded, never silently dropped',
  r.ranked.every(c =>
    c.xpdr.clientServices.indexOf('10GE') >= 0 ||
    (c.cascade && c.cascade.resolved)));

// ----------------------------------------------------------------
console.log('\n[5] Site constraint: 600 mm cabinet only');
const deepOnly = DCI.recommend(data, {
  challenge: 5, lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'any',
}).rankedAll.filter(c => c.hosts.every(h => h.depthClass === 'deep'));
const stdOnly = DCI.recommend(data, {
  challenge: 5, lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'std',
}).rankedAll;
console.log('    deep-only cards when depth is unconstrained: %d', deepOnly.length);
console.log('    survivors in a 600 mm site: %d', stdOnly.length);
check('G31/G32-only cards drop out of a 600 mm site',
  stdOnly.every(c => c.hosts.some(h => h.depthClass === 'std')));
check('the depth filter actually removes something', deepOnly.length > 0);

// ----------------------------------------------------------------
console.log('\n[6] WSON / L0 GMPLS required');
r = DCI.recommend(data, {
  challenge: 5, lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'any', wson: true,
});
show(r, 3);
const gx = r.rankedAll.filter(c => c.xpdr.platform === 'GX');
check('GX sleds are not disqualified, only flagged', gx.length > 0);
check('every GX candidate carries the PSS line-system note',
  gx.every(c => c.costs.some(t => /WSON|GMPLS/.test(t))));

// ----------------------------------------------------------------
console.log('\n[7] Over-subscription is refused');
r = DCI.recommend(data, {
  challenge: 5, lineRateG: 100,
  clients: [{ service: '400GE', qty: 4 }],
  depth: 'any',
});
console.log('    viable: %d   rejected: %d', r.counts.viable, r.counts.rejected);
check('4x 400GE does not fit a 100G line', r.counts.viable === 0);
check('rejections explain themselves',
  r.rejected.every(c => c.blockers.length > 0));

// ----------------------------------------------------------------
console.log('\n[8] Roadmap cards are hidden unless asked for');
const shipping = DCI.recommend(data, {
  challenge: 5, lineRateG: 800, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
});
const withRoadmap = DCI.recommend(data, {
  challenge: 5, lineRateG: 800, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
  includeRoadmap: true,
});
console.log('    shipping only: %d    including roadmap: %d',
  shipping.counts.viable, withRoadmap.counts.viable);
check('shipping-only is a subset', withRoadmap.counts.viable >= shipping.counts.viable);
check('shipping-only really is all shipping',
  shipping.rankedAll.every(c => c.xpdr.shipping));

// ----------------------------------------------------------------
console.log('\n[9] L-band');
r = DCI.recommend(data, {
  challenge: 5, lineRateG: 600, clients: [{ service: '100GE', qty: 4 }], band: 'L', depth: 'any',
});
console.log('    viable L-band candidates: %d', r.counts.viable);
r.ranked.slice(0, 3).forEach(c => console.log('      ' + c.xpdr.name + ' ' + JSON.stringify(c.xpdr.band)));
check('every L-band result really is L-band',
  r.rankedAll.every(c => c.xpdr.band.indexOf('L') >= 0));

// ----------------------------------------------------------------
console.log('\n[11] Line technology: a higher-rate card is a valid lower-rate answer');
const cls = DCI.recommend(data, {
  challenge: 5, lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'any',
});
const exact = DCI.recommend(data, {
  challenge: 5, lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'any',
  rateMatch: 'exact',
});
console.log('    class mode: %d viable    exact mode: %d viable',
  cls.counts.viable, exact.counts.viable);
check('class mode is at least as wide as exact', cls.counts.viable >= exact.counts.viable);
check('every class-mode candidate can reach 400G',
  cls.rankedAll.every(c => c.xpdr.lineMaxG >= 400));
check('exact mode really requires the profile',
  exact.rankedAll.every(c => c.xpdr.lineRatesG.indexOf(400) >= 0));

// A card with a gap in its ladder should run the next profile up and say so.
const gap = DCI.recommend(data, {
  challenge: 5, lineRateG: 500, clients: [{ service: '400GE', qty: 1 }], depth: 'any',
});
const rounded = gap.rankedAll.filter(c => c.effRateG > 500);
console.log('    at 500G, %d candidate(s) round up to their next profile',
  rounded.length);
rounded.slice(0, 3).forEach(c => console.log('      %s: %s -> %s',
  c.xpdr.name, '500G', DCI.fmtRate(c.effRateG)));
check('rounding up is stated as a cost, never silent',
  rounded.every(c => c.costs.some(t => /nearest is/.test(t))));
check('a native profile is credited as a fit',
  gap.rankedAll.filter(c => c.effRateG === 500)
     .every(c => c.fits.some(t => /natively/.test(t))));

// ----------------------------------------------------------------
console.log('\n[12] Multi-wavelength toggle');
// 800G of client on a 400G wavelength: impossible on one lambda, fine on two.
const multi = DCI.recommend(data, {
  challenge: 5, lineRateG: 400, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
  rateMatch: 'exact', multiLambda: true,
});
const single = DCI.recommend(data, {
  challenge: 5, lineRateG: 400, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
  rateMatch: 'exact', multiLambda: false,
});
console.log('    multi-lambda: %d viable    single-lambda: %d viable',
  multi.counts.viable, single.counts.viable);
const twoLambda = multi.rankedAll.filter(c => c.carriersUsed > 1);
console.log('    candidates using 2 wavelengths: %d', twoLambda.length);
twoLambda.slice(0, 3).forEach(c => console.log('      %s  %d x %s',
  c.xpdr.name, c.carriersUsed, DCI.fmtRate(c.effRateG)));
check('multi-wavelength opens up two-carrier cards', twoLambda.length > 0);
check('two-carrier answers say how many wavelengths they cost',
  twoLambda.every(c => c.costs.some(t => /wavelengths on the line system/.test(t))));
check('single-lambda never returns a multi-carrier answer',
  single.rankedAll.every(c => c.carriersUsed === 1));
check('single-lambda is a subset of multi', single.counts.viable <= multi.counts.viable);
check('single-lambda rejections name the constraint',
  single.rejected.filter(c => c.blockers.some(b => /single .* wavelength/.test(b)))
        .length > 0);

// A two-port 400G card vs a one-port 600G card for 800G of client —
// the case Quang raised. Both should be reachable, and the 2x400G one wins
// on fill because 600G cannot carry 800G at all.
const eight = DCI.recommend(data, {
  challenge: 5, lineRateG: 400, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
});
console.log('    800G of client at 400G/lambda: top = %s (%d x %s, %d%% fill)',
  eight.ranked[0] ? eight.ranked[0].xpdr.name : '—',
  eight.ranked[0] ? eight.ranked[0].carriersUsed : 0,
  eight.ranked[0] ? DCI.fmtRate(eight.ranked[0].effRateG) : '—',
  eight.ranked[0] ? eight.ranked[0].lineUtil : 0);
check('800G of client finds an answer at 400G per lambda', eight.ranked.length > 0);

// ----------------------------------------------------------------
console.log('\n[13] Cost discipline: a right-sized card beats an over-specified one');
r = DCI.recommend(data, {
  challenge: 5, lineRateG: 400,
  clients: [{ service: '100GE', qty: 4 }],
  depth: 'any',
});
show(r, 5);
const top = r.ranked[0];
const byName = {};
r.rankedAll.forEach(c => { byName[c.xpdr.name] = c; });

console.log('    top pick line class: %s for a %s service',
  DCI.fmtRate(top.xpdr.lineMaxG), '400G');
check('the winner is not grossly over-specified',
  top.xpdr.lineMaxG <= 800,
  top.xpdr.name + ' is ' + DCI.fmtRate(top.xpdr.lineMaxG) + '-class');

// A 400G-class card and a 1.2T-class card, same job: the 400G one must win.
const rightSized = r.rankedAll.filter(c => c.xpdr.lineMaxG === 400);
const overSpec = r.rankedAll.filter(c => c.xpdr.lineMaxG >= 1200);
if (rightSized.length && overSpec.length) {
  console.log('    best 400G-class: %s (%d)   best 1.2T-class: %s (%d)',
    rightSized[0].xpdr.name, rightSized[0].score,
    overSpec[0].xpdr.name, overSpec[0].score);
  check('a 400G-class card outranks a 1.2T-class card for a 400G service',
    rightSized[0].score > overSpec[0].score);
} else {
  check('both a right-sized and an over-specified candidate exist to compare',
    false, 'right-sized ' + rightSized.length + ', over-spec ' + overSpec.length);
}
check('over-specified candidates say so in plain terms',
  overSpec.every(c => c.costs.some(t => /card only \d+% used/.test(t))),
  (overSpec.find(c => !c.costs.some(t => /card only \d+% used/.test(t))) || {})
    .xpdr && (overSpec.find(c => !c.costs.some(t => /card only \d+% used/.test(t)))).xpdr.name);
check('headroom is never scored as a fit any more',
  r.rankedAll.every(c => !c.fits.some(t => /headroom above the/.test(t))));

// Fill must dominate: a fuller wavelength wins even against a cheaper slot count.
const fillSorted = r.ranked.slice().sort((a, b) => b.lineUtil - a.lineUtil);
console.log('    top pick fill %d%%, best available fill %d%%',
  top.lineUtil, fillSorted[0].lineUtil);
check('the top pick is at or near the best fill available',
  top.lineUtil >= fillSorted[0].lineUtil - 5);

// ----------------------------------------------------------------
console.log('\n[10] Sanity on the data itself');
check('every card has at least one line rate',
  data.xpdr.every(x => x.lineRatesG.length > 0),
  data.xpdr.filter(x => !x.lineRatesG.length).map(x => x.name).join(','));
check('no line rate is a stray baud figure',
  data.xpdr.every(x => x.lineRatesG.every(r => r % 100 === 0 || r === 10 || r === 3)),
  data.xpdr.filter(x => x.lineRatesG.some(r => r % 100 && r !== 10 && r !== 3))
      .map(x => x.name + ':' + x.lineRatesG).join(' '));
check('every card has client cages',
  data.xpdr.every(x => x.clientCages.length > 0),
  data.xpdr.filter(x => !x.clientCages.length).map(x => x.name).join(','));
check('every card names a host',
  data.xpdr.every(x => x.hosts.length > 0),
  data.xpdr.filter(x => !x.hosts.length).map(x => x.name).join(','));
check('L-band cards are not also C-band',
  data.xpdr.filter(x => /L\d?$/.test(x.name) && x.band.length > 1).length === 0);


// ----------------------------------------------------------------
console.log('\n[14] Link challenge derates each card off its own ceiling');
const traffic = [{ service: '400GE', qty: 2 }];   // 800G
[1, 2, 3, 4].forEach(lvl => {
  const res = DCI.recommend(data, { challenge: lvl, clients: traffic, depth: 'any' }, 3);
  const t = res.ranked[0];
  console.log('    L' + lvl +
    ('  viable ' + res.counts.viable).padEnd(14) +
    (t ? t.xpdr.name : '—').padEnd(13) +
    ('ceiling ' + (t ? DCI.fmtRate(t.xpdr.lineMaxG) : '—')).padEnd(15) +
    ('link ' + (t ? DCI.fmtRate(t.ceilingRateG) : '—')).padEnd(12) +
    ('runs ' + (t ? t.carriersUsed + 'x' + DCI.fmtRate(t.effRateG) : '—')).padEnd(14) +
    'card ' + (t ? t.cardUsePct : 0) + '%');
});

const easy = DCI.recommend(data, { challenge: 1, clients: traffic, depth: 'any' });
const hard = DCI.recommend(data, { challenge: 4, clients: traffic, depth: 'any' });
check('a harder link admits no more cards than an easy one',
  hard.counts.viable <= easy.counts.viable);
check('no card is ever asked to run above its own ceiling',
  easy.rankedAll.concat(hard.rankedAll)
      .every(c => c.effRateG <= c.xpdr.lineMaxG));
check('the derated rate is always a profile the card really has',
  hard.rankedAll.every(c => c.xpdr.lineRatesG.indexOf(c.ceilingRateG) >= 0));
check('derating is stated as a cost',
  hard.rankedAll.filter(c => c.ceilingRateG < c.xpdr.lineMaxG)
      .every(c => c.costs.some(t => /link derates this card/.test(t))));

// The snap rule, checked against the two ladder shapes that exist in the data.
const dense = data.xpdr.find(x => x.name === 'CHM7-C8');      // 100G ladder to 1.2T
const sparse = data.xpdr.find(x => x.name === 'S2AD800R');    // 400 / 600 / 800
[[dense, 1, 1200], [dense, 2, 1000], [dense, 3, 700], [dense, 4, 600],
 [sparse, 1, 800], [sparse, 2, 600], [sparse, 3, 400], [sparse, 4, 400]]
  .forEach(([card, lvl, want]) => {
    const got = DCI.achievableRate(card, lvl);
    check(card.name + ' at level ' + lvl + ' -> ' + DCI.fmtRate(want),
      got === want, 'got ' + DCI.fmtRate(got));
  });

// ----------------------------------------------------------------
console.log('\n[15] Port shape: one fast wavelength beats two slow ones,');
console.log('     but an over-sized dual-port card loses to a right-sized one');
const port = DCI.recommend(data, { challenge: 1, clients: traffic, depth: 'any' }, 99);
const find = n => port.rankedAll.find(c => c.xpdr.name === n);
const one800 = find('S2AD800R');    // 1 port x 800G  -> 800G card, fully used
const two400 = find('CHM1R');       // 2 ports x 400G -> 800G card, fully used
const two800 = find('CHM6P-C6');    // 2 ports x 800G -> 1.6T card, half used
[['1 x 800G', one800], ['2 x 400G', two400], ['2 x 800G', two800]].forEach(([lab, c]) => {
  if (!c) return console.log('    %s: not viable', lab);
  console.log('    ' + lab.padEnd(10) + c.xpdr.name.padEnd(12) +
    ('card ' + c.cardUsePct + '% of ' + DCI.fmtRate(c.cardCapacityG)).padEnd(22) +
    (c.carriersUsed + ' lambda').padEnd(10) + 'score ' + c.score);
});
check('1 x 800G beats 2 x 400G for 800G of traffic',
  one800 && two400 && one800.score > two400.score);
check('2 x 800G loses to 2 x 400G for 800G of traffic',
  two800 && two400 && two400.score > two800.score);
check('the over-sized dual-port card is only half used',
  two800 && two800.cardUsePct <= 55, two800 && String(two800.cardUsePct));
check('both fully-used cards report 100%',
  one800 && two400 && one800.cardUsePct === 100 && two400.cardUsePct === 100);

console.log('\n%d passed, %d failed\n', pass, fail);
process.exit(fail ? 1 : 0);
