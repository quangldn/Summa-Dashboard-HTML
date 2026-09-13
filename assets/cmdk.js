/* ==========================================================================
   SUMMA — command palette
   --------------------------------------------------------------------------
   Cmd-K (or Ctrl-K, or just "/") from anywhere. Type a part number, a card
   mnemonic, a shelf or a page name and go straight there.

   The point is not that it is fashionable. It is that the answer to "what is
   CHM7X-C14 and where does it fit" should take one keystroke and three
   letters, from whatever page you happen to be on — not a trip back to a hub,
   a tab, a filter and a scroll.

   A page registers its own searchable rows:

       SUMMA_CMDK.register('PSS card', rows);

   where each row is { label, hint, keywords, run } or { ..., href }.
   Pages from the site map are registered automatically.
   ========================================================================== */
(function () {
  'use strict';

  const SOURCES = [];          // [{ kind, rows }]
  let open = false, idx = 0, results = [], root = null, input = null, list = null;

  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(c => c != null && n.appendChild(
      typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };

  function register(kind, rows) {
    if (!rows || !rows.length) return;
    const existing = SOURCES.find(s => s.kind === kind);
    if (existing) existing.rows = rows;
    else SOURCES.push({ kind, rows });
    if (open) search(input.value);
  }

  /* Scoring, in plain terms: an exact mnemonic beats a prefix, a prefix beats
     a word start, a word start beats "the letters appear in order". Without
     that last one, "c7x" would not find CHM7X, which is how people actually
     type a part number they half remember. */
  function score(row, q) {
    const label = row.label.toLowerCase();
    const rest = ((row.hint || '') + ' ' + (row.keywords || '')).toLowerCase();
    if (label === q) return 1000;
    if (label.startsWith(q)) return 800 - label.length;
    if (label.includes(q)) return 700 - label.length;

    // The loose tier is deliberately narrow: letters-in-order is matched
    // against the NAME only. Running it across descriptions too is what makes
    // a palette return eleven confident wrong answers — "chm7" would find
    // every card whose blurb happens to contain c, h, m and 7 in that order.
    let i = 0;
    for (const ch of label) { if (ch === q[i]) i++; if (i === q.length) break; }
    if (i === q.length) return 500 - label.length;

    if (q.length >= 3) {
      const word = new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (word.test(rest)) return 300 - label.length;
      if (rest.includes(q)) return 200 - label.length;
    }
    return -1;
  }

  function search(q) {
    q = (q || '').trim().toLowerCase();
    const all = [];
    SOURCES.forEach(s => s.rows.forEach(r => all.push({ ...r, kind: s.kind })));
    if (!q) {
      results = all.filter(r => r.primary).slice(0, 12);
      if (!results.length) results = all.slice(0, 12);
    } else {
      results = all
        .map(r => ({ r, s: score(r, q) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 40)
        .map(x => x.r);
    }
    idx = 0;
    paint();
  }

  function paint() {
    list.innerHTML = '';
    if (!results.length) {
      list.appendChild(el('div', { class: 'cmdk-empty',
        text: 'Nothing matches that.' }));
      return;
    }
    let lastKind = null;
    results.forEach((r, i) => {
      if (r.kind !== lastKind) {
        lastKind = r.kind;
        list.appendChild(el('div', { class: 'cmdk-kind', text: r.kind }));
      }
      const row = el('div', {
        class: 'cmdk-row' + (i === idx ? ' on' : ''),
        role: 'option', 'aria-selected': i === idx ? 'true' : 'false',
        onmousemove: () => { if (idx !== i) { idx = i; paint(); } },
        onclick: () => go(r),
      }, [
        el('span', { class: 'cmdk-label' + (r.mono ? ' mono' : ''), text: r.label }),
        r.hint ? el('span', { class: 'cmdk-hint', text: r.hint }) : null,
      ]);
      list.appendChild(row);
    });
    const on = list.querySelector('.cmdk-row.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function go(r) {
    close();
    if (r.run) r.run();
    else if (r.href) location.href = r.href;
  }

  function build() {
    root = el('div', { class: 'cmdk', hidden: true });
    const panel = el('div', { class: 'cmdk-panel', role: 'dialog',
                              'aria-modal': 'true', 'aria-label': 'Search' });
    input = el('input', { type: 'text', class: 'cmdk-input', autocomplete: 'off',
                          spellcheck: 'false',
                          placeholder: 'Part number, card, shelf or page…' });
    list = el('div', { class: 'cmdk-list', role: 'listbox' });
    panel.appendChild(el('div', { class: 'cmdk-top' }, [input]));
    panel.appendChild(list);
    panel.appendChild(el('div', { class: 'cmdk-foot' }, [
      el('span', {}, [el('kbd', { text: '↑↓' }), ' move']),
      el('span', {}, [el('kbd', { text: '↵' }), ' open']),
      el('span', {}, [el('kbd', { text: 'esc' }), ' close']),
    ]));
    root.appendChild(panel);
    root.addEventListener('click', e => { if (e.target === root) close(); });
    input.addEventListener('input', () => search(input.value));
    document.body.appendChild(root);
  }

  function show() {
    if (!root) build();
    open = true;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('on'));
    input.value = '';
    search('');
    input.focus();
  }

  function close() {
    if (!root || !open) return;
    open = false;
    root.classList.remove('on');
    setTimeout(() => { if (!open) root.hidden = true; }, 140);
  }

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      open ? close() : show();
      return;
    }
    if (!open && e.key === '/' && !typing) { e.preventDefault(); show(); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, results.length - 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); paint(); }
    else if (e.key === 'Enter' && results[idx]) { e.preventDefault(); go(results[idx]); }
  });

  /* Every page in the site map is reachable from the palette without any page
     having to say so. */
  function registerSite() {
    const NAV = window.SUMMA_NAV;
    if (!NAV) return;
    const rows = [];
    NAV.SITE.forEach(sec => {
      if (sec.href) rows.push({ label: sec.label, hint: 'section',
                                keywords: sec.blurb || '', href: sec.href,
                                primary: true });
      (sec.children || []).forEach(c => {
        if (!c.href) return;
        rows.push({ label: c.label, hint: sec.label + ' · ' + c.group,
                    keywords: (c.blurb || '') + ' ' + c.group, href: c.href,
                    primary: true });
      });
    });
    register('Go to', rows);
  }

  window.SUMMA_CMDK = { register, open: show, close };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerSite);
  } else { registerSite(); }
}());
