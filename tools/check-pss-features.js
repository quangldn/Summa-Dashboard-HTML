/* Headless check of pss-features.html: console errors, rendering, contrast in both
   themes, and mobile width. node tools/check-dci-page.js */

const { chromium } = require('playwright');

const URL = 'http://localhost:8899/pss-features.html';

// Relative luminance / contrast, per WCAG.
const CONTRAST_FN = `(() => {
  const lum = (r,g,b) => {
    const f = c => { c/=255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
  };
  const parse = s => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const bgOf = node => {
    let el = node;
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      const c = parse(cs.backgroundColor);
      // A gradient or an image sits behind the text and cannot be sampled
      // from computed style, so skip the element rather than guess.
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      if (c && c.a > 0.5) return c;
      el = el.parentElement;
    }
    const c = parse(getComputedStyle(document.body).backgroundColor);
    return c && c.a > 0.5 ? c : { r:255, g:255, b:255, a:1 };
  };
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    if (!el.childNodes.length) return;
    const text = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!text) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.4) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const fg = parse(cs.color); const bg = bgOf(el);
    if (!fg || !bg) return;
    const L1 = lum(fg.r,fg.g,fg.b), L2 = lum(bg.r,bg.g,bg.b);
    const ratio = (Math.max(L1,L2)+0.05) / (Math.min(L1,L2)+0.05);
    const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const min = large ? 3 : 4.5;
    if (ratio < min) {
      out.push({ tag: el.tagName.toLowerCase(), cls: el.className,
                 text: text.slice(0, 52), ratio: +ratio.toFixed(2),
                 min, size, fg: cs.color, bg: 'rgb('+bg.r+','+bg.g+','+bg.b+')' });
    }
  });
  return out;
})()`;

(async () => {
  // The bundled Playwright version and the preinstalled browser build do not
  // always agree on a revision number, so point at the binary that is there.
  const fs = require('fs');
  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ];
  const exe = candidates.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  let fail = 0;

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    // Google Fonts is unreachable from this sandbox, and favicon is never
    // served by python -m http.server. Neither is a page defect, so they are
    // filtered rather than allowed to mask a real error.
    const IGNORE = /fonts\.(googleapis|gstatic)\.com|favicon\.ico|ERR_TUNNEL_CONNECTION_FAILED/;
    const errors = [];
    page.on('console', m => {
      if (m.type() === 'error' && !IGNORE.test(m.text() + m.location().url)) {
        errors.push(m.text() + '  @ ' + m.location().url);
      }
    });
    page.on('requestfailed', r => {
      if (!IGNORE.test(r.url())) errors.push('request failed: ' + r.url());
    });
    page.on('response', r => {
      if (r.status() >= 400 && !IGNORE.test(r.url())) {
        errors.push(r.status() + ' ' + r.url());
      }
    });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForSelector('.panel', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(250);

    const cards = await page.$$eval('.panel', n => n.length);
    const tally = await page.$$eval('.sec', n => n.length);
    const rates = await page.$$eval('.topics button', n => n.length);

    console.log('\n== %s ==', theme);
    console.log('  panels: %d   sections: %d   topics: %d',
      cards, tally, rates);
    if (!cards) { console.log('  FAIL no result cards rendered'); fail++; }
    if (errors.length) {
      console.log('  FAIL console errors:');
      errors.forEach(e => console.log('    ' + e));
      fail++;
    } else {
      console.log('  ok   no console errors');
    }

    const CF = CONTRAST_FN;
    const bad = await page.evaluate(CF);
    if (bad.length) {
      console.log('  FAIL %d contrast failures:', bad.length);
      bad.slice(0, 12).forEach(b => console.log(
        '    %s.%s  %s:1 (needs %s)  %spx  "%s"  fg %s on %s',
        b.tag, String(b.cls).split(' ')[0], b.ratio, b.min, b.size, b.text, b.fg, b.bg));
      fail++;
    } else {
      console.log('  ok   contrast clean');
    }

    const before = errors.length;
    if (cards) {
      const tabs = await page.$$eval('#tabs button', n => n.length);
      console.log('  tabs: ' + tabs);
      if (tabs !== 3) { console.log('  FAIL expected 3 tabs'); fail++; }
      for (const t of [2, 3, 1]) {
        await page.click('#tabs button:nth-child(' + t + ')');
        await page.waitForTimeout(250);
        const panels = await page.$$eval('.panel', n => n.length);
        const cnt = await page.$eval('#count', n => n.textContent);
        console.log('  tab ' + t + ' -> ' + panels + ' panels, count "' + cnt + '"');
        if (!panels) { console.log('  FAIL tab rendered nothing'); fail++; }
        const b2 = await page.evaluate(CF);
        if (b2.length) {
          console.log('  FAIL ' + b2.length + ' contrast failures on tab ' + t + ':');
          b2.slice(0, 8).forEach(x => console.log('    ' + x.tag + '.' +
            String(x.cls).split(' ')[0] + ' ' + x.ratio + ':1 needs ' + x.min +
            ' ' + x.size + 'px "' + x.text + '"'));
          fail++;
        }
      }
      // search narrows, and the topic filter narrows further
      await page.fill('#q', 'protection');
      await page.waitForTimeout(320);
      const afterQ = await page.$eval('#count', n => n.textContent);
      const marks = await page.$$eval('mark', n => n.length);
      console.log('  search "protection" -> ' + afterQ + ', ' + marks + ' highlights');
      if (!marks) { console.log('  FAIL search did not highlight'); fail++; }
      await page.fill('#q', '');
      await page.waitForTimeout(320);
      const tbtn = await page.$$('.topics button');
      if (tbtn.length > 1) {
        await tbtn[1].click();
        await page.waitForTimeout(250);
        const filtered = await page.$eval('#count', n => n.textContent);
        console.log('  topic filter -> ' + filtered);
      } else { console.log('  FAIL no topic filters'); fail++; }
      if (errors.length > before) {
        console.log('  FAIL new errors after interaction:');
        errors.slice(before).forEach(e => console.log('    ' + e));
        fail++;
      } else { console.log('  ok   interaction clean'); }
    }

    await page.close();
  }

  // Mobile
  const page = await browser.newPage({ viewport: { width: 402, height: 860 } });
  const merr = [];
  page.on('pageerror', e => merr.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.panel', { timeout: 6000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    wide: Array.from(document.querySelectorAll('body *'))
      .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 6)
      .map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]),
  }));
  console.log('\n== mobile 402px ==');
  console.log('  scrollWidth %d vs viewport %d', overflow.doc, overflow.win);
  if (overflow.doc > overflow.win + 1) {
    console.log('  FAIL horizontal overflow: %s', overflow.wide.join(', '));
    fail++;
  } else {
    console.log('  ok   no horizontal overflow');
  }
  if (merr.length) { console.log('  FAIL ' + merr.join('; ')); fail++; }
  await page.close();

  await browser.close();
  console.log('\n%s\n', fail ? fail + ' check(s) failed' : 'all checks passed');
  process.exit(fail ? 1 : 0);
})();
