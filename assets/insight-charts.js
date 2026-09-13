/* ============================================================
   SUMMA — chart primitives for portfolio-insight.html

   Plain SVG, no library. Four forms, because four is what the
   three tabs actually need:

     statTiles   headline numbers — a number IS the chart
     heatGrid    category x shelf coverage, sequential one hue
     rangeBars   a span with a start and an end (rate ladder,
                 span loss, spectrum width)
     groupBars   counts by class, GX against PSS

   Specs are fixed here rather than per call site so every chart
   on the page reads as one system: marks <= 24px, 4px rounded
   data-end square at the baseline, hairline solid grid, a 2px
   surface gap between touching marks, legend whenever two series
   are on screen, and text in ink tokens — never in a series
   colour.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VIZ = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var BAR = 22;        // max mark thickness
  var GAP = 2;         // the surface gap that separates touching marks
  var R = 4;           // rounded data-end

  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in (attrs || {})) {
      if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) {
      if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  /* A bar path with the data-end rounded and the baseline end square.
     Drawn as a path rather than rx on a rect, because rx rounds all four
     corners and the baseline must stay flat. */
  function barPath(x, y, w, h, side) {
    var r = Math.min(R, w / 2, h / 2);
    if (side === 'right') {
      return 'M' + x + ',' + y + 'H' + (x + w - r) +
             'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
             'V' + (y + h - r) +
             'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r +
             'H' + x + 'Z';
    }
    if (side === 'both') {
      return 'M' + (x + r) + ',' + y + 'H' + (x + w - r) +
             'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
             'V' + (y + h - r) +
             'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r +
             'H' + (x + r) +
             'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + (-r) +
             'V' + (y + r) +
             'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) + 'Z';
    }
    // 'up': column growing from a baseline at the bottom
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) +
           'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
           'H' + (x + w - r) +
           'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
           'V' + (y + h) + 'Z';
  }

  // ----------------------------------------------------------
  // Tooltip — one per page, positioned against the viewport
  // ----------------------------------------------------------
  var tip;

  function tooltip() {
    if (!tip) {
      tip = el('div', { class: 'viz-tip', role: 'tooltip' });
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }

  /* rows: [{ key: seriesColorOrNull, label, value }] — value leads, label
     follows, and every name goes in as a text node because card and shelf
     names are data. */
  function showTip(evt, title, rows) {
    var t = tooltip();
    t.textContent = '';
    t.appendChild(el('div', { class: 'viz-tip-h', text: title }));
    (rows || []).forEach(function (r) {
      t.appendChild(el('div', { class: 'viz-tip-r' }, [
        r.key ? el('i', { style: 'background:' + r.key }) : null,
        el('b', { text: String(r.value) }),
        el('span', { text: r.label }),
      ]));
    });
    t.hidden = false;
    var pad = 12, w = t.offsetWidth, h = t.offsetHeight;
    var x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  }

  function hideTip() { if (tip) tip.hidden = true; }

  /* The hit target is the mark plus its gap and then some, never only the
     painted pixels. */
  function hoverable(node, title, rows) {
    node.addEventListener('pointermove', function (e) { showTip(e, title, rows); });
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', function (e) {
      var b = node.getBoundingClientRect();
      showTip({ clientX: b.left + b.width / 2, clientY: b.top }, title, rows);
    });
    node.addEventListener('blur', hideTip);
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', title + ' — ' +
      (rows || []).map(function (r) { return r.value + ' ' + r.label; }).join(', '));
    return node;
  }

  // ----------------------------------------------------------
  // Stat tiles — a handful of headline numbers
  // ----------------------------------------------------------
  function statTiles(items) {
    return el('div', { class: 'viz-kpi' }, items.map(function (s) {
      return el('div', { class: 'viz-kpi-c' }, [
        el('span', { class: 't-label', text: s.label }),
        el('div', { class: 'viz-kpi-v num', text: s.value == null ? '—' : String(s.value) }),
        s.sub ? el('div', { class: 'viz-kpi-s', text: s.sub }) : null,
      ]);
    }));
  }

  // ----------------------------------------------------------
  // Heat grid — magnitude on a grid, one hue light to dark
  // ----------------------------------------------------------

  /* The sequential ramp, one hue, as explicit steps rather than a CSS
     color-mix. Two reasons: the cell's ink has to be chosen against the step
     it actually lands on, which needs the real value; and a computed colour
     can be read back by the contrast checker, where color-mix cannot.

     Light runs light -> dark (the palest step means "few", and is allowed to
     recede toward the surface). Dark is its own selection from the same hue,
     running dark -> light against the dark surface, not an inversion. */
  /* One step is missing from the middle of each ramp on purpose. A single-hue
     ramp has a crossover where the step is too dark for dark ink and too
     light for light ink — light #2a78d6 tops out at 4.42:1 and dark #2f74c4
     at 4.14:1, so a number sitting on either could not clear AA whichever ink
     it wore. Skipping the dead step keeps every cell readable and the ramp
     still reads as evenly spaced. */
  var RAMP_LIGHT = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec',
                    '#5598e7', '#3987e5', '#256abf', '#1c5cab', '#184f95'];
  var RAMP_DARK = ['#17233b', '#1c3357', '#1f4272', '#22528e', '#2a63a8',
                   '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4'];

  function isDark() {
    var stamp = document.documentElement.getAttribute('data-theme');
    if (stamp) return stamp === 'dark';
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function lum(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  /* Pick the ink that actually reads on this step, rather than assuming. */
  function inkOn(bg) {
    var dark = isDark() ? '#EDEFF5' : '#14161C';
    var light = isDark() ? '#0E1014' : '#FFFFFF';
    return contrast(bg, dark) >= contrast(bg, light) ? dark : light;
  }

  function rampStep(t) {
    var r = isDark() ? RAMP_DARK : RAMP_LIGHT;
    var i = Math.round(Math.max(0, Math.min(1, t)) * (r.length - 1));
    return r[i];
  }
  function heatGrid(opts) {
    var rows = opts.rows, cols = opts.cols, at = opts.at;
    var max = 0;
    rows.forEach(function (r) {
      cols.forEach(function (c) { max = Math.max(max, at(r, c) || 0); });
    });

    var wrap = el('div', { class: 'viz-grid-wrap' });
    var tbl = el('table', { class: 'viz-grid' });
    var thead = el('thead', {}, [
      el('tr', {}, [el('th', { class: 'viz-grid-corner', scope: 'col' })].concat(
        cols.map(function (c) {
          return el('th', { scope: 'col' }, [el('span', { text: c })]);
        }))),
    ]);
    tbl.appendChild(thead);

    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr', {}, [el('th', { scope: 'row', text: r })]);
      cols.forEach(function (c) {
        var v = at(r, c) || 0;
        var td = el('td', { class: v ? 'on' : 'off' });
        if (v) {
          // Sequential: one hue, more is darker. The lightest step is
          // allowed to recede toward the surface because it means "few".
          var t = max > 1 ? (v - 1) / (max - 1) : 1;
          var bg = rampStep(t);
          var cell = el('span', { class: 'viz-cell', text: String(v),
            style: 'background:' + bg + ';color:' + inkOn(bg) });
          hoverable(cell, r + ' · ' + c,
            [{ label: v === 1 ? 'card' : 'cards', value: v }]);
          td.appendChild(cell);
        } else {
          td.appendChild(el('span', { class: 'viz-cell-0', text: '·',
                                      'aria-label': 'none' }));
        }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
    return wrap;
  }

  // ----------------------------------------------------------
  // Range bars — a span with a start and an end
  // ----------------------------------------------------------
  /* items: [{ label, lo, hi, series, note, rows }]
     Horizontal, one row per item, a shared linear scale across all of them. */
  function rangeBars(opts) {
    var items = opts.items, fmt = opts.fmt || String;
    if (!items.length) return el('p', { class: 'viz-empty', text: 'Nothing to show.' });

    var lo = Math.min.apply(null, items.map(function (d) { return d.lo; }));
    var hi = Math.max.apply(null, items.map(function (d) { return d.hi; }));
    if (opts.from != null) lo = Math.min(lo, opts.from);
    if (hi === lo) hi = lo + 1;

    var labelW = opts.labelW || 118;
    var valueW = opts.valueW || 96;
    var rowH = Math.min(BAR + 12, 30);
    var padT = 22, padB = 6;
    var w = opts.width || 1100;
    var plotW = w - labelW - valueW - 10;   // 10px of air before the gutter
    var h = padT + items.length * rowH + padB;

    var s = svg('svg', { class: 'viz-svg', viewBox: '0 0 ' + w + ' ' + h,
                         preserveAspectRatio: 'xMinYMin meet',
                         role: 'group', 'aria-label': opts.title || 'range chart' });
    var x = function (v) { return labelW + (v - lo) / (hi - lo) * plotW; };

    // Hairline solid gridlines, recessive, with clean ticks.
    (opts.ticks || [lo, lo + (hi - lo) / 2, hi]).forEach(function (t) {
      s.appendChild(svg('line', { class: 'viz-grid-l', x1: x(t), x2: x(t),
                                  y1: padT - 8, y2: h - padB }));
      var tx = svg('text', { class: 'viz-tick', x: x(t), y: padT - 12,
                             'text-anchor': 'middle' });
      tx.textContent = fmt(t);
      s.appendChild(tx);
    });

    items.forEach(function (d, i) {
      var y = padT + i * rowH + (rowH - BAR) / 2;
      var bw = Math.max(R * 2, x(d.hi) - x(d.lo));

      var lt = svg('text', { class: 'viz-rowlab', x: labelW - 10, y: y + BAR / 2 + 4,
                             'text-anchor': 'end' });
      lt.textContent = d.label;
      s.appendChild(lt);

      // Track, so a short span still reads as a position on the scale.
      s.appendChild(svg('rect', { class: 'viz-track', x: labelW, y: y + BAR / 2 - 1,
                                  width: plotW, height: 2, rx: 1 }));

      var g = svg('g', { class: 'viz-mark' });
      g.appendChild(svg('path', { d: barPath(x(d.lo), y, bw, BAR, 'both'),
                                  fill: d.series || 'var(--series-1)' }));
      hoverable(g, d.label, d.rows ||
        [{ key: d.series, label: fmt(d.lo) + ' to ' + fmt(d.hi), value: '' }]);
      s.appendChild(g);

      var vt = svg('text', { class: 'viz-val num', x: w - 8, y: y + BAR / 2 + 4,
                             'text-anchor': 'end' });
      vt.textContent = d.note != null ? d.note : fmt(d.lo) + '–' + fmt(d.hi);
      s.appendChild(vt);
    });

    return s;
  }

  // ----------------------------------------------------------
  // Grouped bars — counts by class, one group per class
  // ----------------------------------------------------------
  /* groups: [{ label, values: [{series, name, value}] }] */
  function groupBars(opts) {
    var groups = opts.groups;
    if (!groups.length) return el('p', { class: 'viz-empty', text: 'Nothing to show.' });

    var max = 0;
    groups.forEach(function (g) {
      g.values.forEach(function (v) { max = Math.max(max, v.value); });
    });
    if (!max) max = 1;

    var labelW = opts.labelW || 118;
    var valueW = 46;
    var nSeries = Math.max.apply(null, groups.map(function (g) { return g.values.length; }));
    var barH = Math.min(BAR, 18);
    var rowH = nSeries * (barH + GAP) + 14;
    var padT = 22, padB = 6;
    var w = opts.width || 1100;
    var plotW = w - labelW - valueW;
    var h = padT + groups.length * rowH + padB;

    var s = svg('svg', { class: 'viz-svg', viewBox: '0 0 ' + w + ' ' + h,
                         preserveAspectRatio: 'xMinYMin meet',
                         role: 'group', 'aria-label': opts.title || 'bar chart' });
    var x = function (v) { return labelW + v / max * plotW; };

    [0, max / 2, max].forEach(function (t) {
      var tv = Math.round(t);
      s.appendChild(svg('line', { class: 'viz-grid-l', x1: x(tv), x2: x(tv),
                                  y1: padT - 8, y2: h - padB }));
      var tx = svg('text', { class: 'viz-tick', x: x(tv), y: padT - 12,
                             'text-anchor': 'middle' });
      tx.textContent = String(tv);
      s.appendChild(tx);
    });

    groups.forEach(function (grp, i) {
      var top = padT + i * rowH + 6;
      var lt = svg('text', { class: 'viz-rowlab', x: labelW - 10,
                             y: top + (nSeries * (barH + GAP)) / 2 + 3,
                             'text-anchor': 'end' });
      lt.textContent = grp.label;
      s.appendChild(lt);

      grp.values.forEach(function (v, j) {
        var y = top + j * (barH + GAP);
        var bw = v.value ? Math.max(R * 2, x(v.value) - labelW) : 0;
        if (bw) {
          var g = svg('g', { class: 'viz-mark' });
          g.appendChild(svg('path', { d: barPath(labelW, y, bw, barH, 'right'),
                                      fill: v.series }));
          hoverable(g, grp.label, [{ key: v.series, label: v.name, value: v.value }]);
          s.appendChild(g);
        }
        var vt = svg('text', { class: 'viz-val num', x: labelW + bw + 7,
                               y: y + barH / 2 + 4 });
        vt.textContent = v.value ? String(v.value) : '';
        s.appendChild(vt);
      });
    });

    return s;
  }

  // ----------------------------------------------------------
  // Legend — always present when two or more series are on screen
  // ----------------------------------------------------------
  function legend(series, shape) {
    return el('div', { class: 'viz-legend' }, series.map(function (s) {
      return el('span', { class: 'viz-legend-i' }, [
        el('i', { class: shape === 'line' ? 'line' : '', style: 'background:' + s.color }),
        el('span', { text: s.label }),
      ]);
    }));
  }

  return {
    el: el, svg: svg,
    statTiles: statTiles,
    heatGrid: heatGrid,
    rangeBars: rangeBars,
    groupBars: groupBars,
    legend: legend,
    hoverable: hoverable,
    isDark: isDark,
    inkOn: inkOn,
    rampStep: rampStep,
    hideTip: hideTip,
    BAR: BAR, GAP: GAP,
  };
}));
