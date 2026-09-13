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
  lineRateG: 400,
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
  lineRateG: 800,
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
  lineRateG: 400,
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
  lineRateG: 800,
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
  lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'any',
}).rankedAll.filter(c => c.hosts.every(h => h.depthClass === 'deep'));
const stdOnly = DCI.recommend(data, {
  lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'std',
}).rankedAll;
console.log('    deep-only cards when depth is unconstrained: %d', deepOnly.length);
console.log('    survivors in a 600 mm site: %d', stdOnly.length);
check('G31/G32-only cards drop out of a 600 mm site',
  stdOnly.every(c => c.hosts.some(h => h.depthClass === 'std')));
check('the depth filter actually removes something', deepOnly.length > 0);

// ----------------------------------------------------------------
console.log('\n[6] WSON / L0 GMPLS required');
r = DCI.recommend(data, {
  lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'any', wson: true,
});
show(r, 3);
const gx = r.rankedAll.filter(c => c.xpdr.platform === 'GX');
check('GX sleds are not disqualified, only flagged', gx.length > 0);
check('every GX candidate carries the PSS line-system note',
  gx.every(c => c.costs.some(t => /WSON|GMPLS/.test(t))));

// ----------------------------------------------------------------
console.log('\n[7] Over-subscription is refused');
r = DCI.recommend(data, {
  lineRateG: 100,
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
  lineRateG: 800, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
});
const withRoadmap = DCI.recommend(data, {
  lineRateG: 800, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
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
  lineRateG: 600, clients: [{ service: '100GE', qty: 4 }], band: 'L', depth: 'any',
});
console.log('    viable L-band candidates: %d', r.counts.viable);
r.ranked.slice(0, 3).forEach(c => console.log('      ' + c.xpdr.name + ' ' + JSON.stringify(c.xpdr.band)));
check('every L-band result really is L-band',
  r.rankedAll.every(c => c.xpdr.band.indexOf('L') >= 0));

// ----------------------------------------------------------------
console.log('\n[11] Line technology: a higher-rate card is a valid lower-rate answer');
const cls = DCI.recommend(data, {
  lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'any',
});
const exact = DCI.recommend(data, {
  lineRateG: 400, clients: [{ service: '100GE', qty: 4 }], depth: 'any',
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
  lineRateG: 500, clients: [{ service: '400GE', qty: 1 }], depth: 'any',
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
  lineRateG: 400, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
  rateMatch: 'exact', multiLambda: true,
});
const single = DCI.recommend(data, {
  lineRateG: 400, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
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
  lineRateG: 400, clients: [{ service: '400GE', qty: 2 }], depth: 'any',
});
console.log('    800G of client at 400G/lambda: top = %s (%d x %s, %d%% fill)',
  eight.ranked[0] ? eight.ranked[0].xpdr.name : '—',
  eight.ranked[0] ? eight.ranked[0].carriersUsed : 0,
  eight.ranked[0] ? DCI.fmtRate(eight.ranked[0].effRateG) : '—',
  eight.ranked[0] ? eight.ranked[0].lineUtil : 0);
check('800G of client finds an answer at 400G per lambda', eight.ranked.length > 0);

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

console.log('\n%d passed, %d failed\n', pass, fail);
process.exit(fail ? 1 : 0);
