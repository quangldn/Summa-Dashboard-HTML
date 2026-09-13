/* ==========================================================================
   SUMMA — one site map, rendered into every page's header.
   --------------------------------------------------------------------------
   The workbench outgrew a flat bar of ten links. Two sections carry
   everything: what Nokia sells (Product) and who it is sold to (Hyperscaler).
   Each page declares nothing; this file knows where every page sits, so
   adding a page means one line here rather than editing nine headers.

   Drop <header id="summa-nav"></header> into a page and load this file.
   ========================================================================== */
(function () {
  'use strict';

  /* The site map. `group` gives a page its heading on the section page and
     its neighbours in the sub-bar; a page with no group sits loose in the
     section. Order here is the order everywhere. */
  const SITE = [
    {
      id: 'home', label: 'Home', href: 'index.html',
      blurb: 'The workbench.',
    },
    {
      id: 'product', label: 'Product', href: 'product.html',
      blurb: 'The optical portfolio — what each platform is, what fits where, ' +
             'and what it costs to build.',
      children: [
        { group: 'GX', href: 'gx-portfolio.html', label: 'GX Portfolio',
          icon: 'GX',
          blurb: 'The whole 1830 GX line — chassis, ROADM, amplifiers, Raman, ' +
                 'hybrid, add/drop and transponders. What ships today vs what ' +
                 'is on the roadmap, which shelf each card fits, slot cost and ' +
                 'the optical numbers.' },
        { group: 'GX', href: 'gx-wiki.html', label: 'GX Wiki', icon: 'WK',
          blurb: 'How to read a GX part number — paste one and it comes apart ' +
                 'into form factor, function, ports, variant and band. Plus ' +
                 'chassis geometry, slot costs and the acronym dictionary.' },
        { group: 'GX', href: 'gx-bom.html', label: 'GX BOM', icon: 'BM',
          blurb: 'Config → node → network → BOM, on the rules extracted from ' +
                 'the GX BOM Configurator workbook. Slot legality, power, ' +
                 'weight and part numbers come from that workbook.' },
        { group: 'PSS', href: 'pss-portfolio.html', label: 'PSS Portfolio',
          icon: 'PS',
          blurb: 'Every card in the 1830 PSS and PSI families — which shelf ' +
                 'and which slots it is legal in, what it weighs and draws, ' +
                 'and whether it ships today or sits on the roadmap.' },
        { group: 'PSS', href: 'pss-wiki.html', label: 'PSS Wiki', icon: 'PW',
          blurb: 'Shelf geometry and slot ranges, the release timeline through ' +
                 'R27.Q4, the planning guide’s own 715-term glossary, and an ' +
                 'honest list of what the sources do not cover.' },
        { group: 'Solutions', href: 'dci.html', label: 'DCI Picker', icon: 'DC',
          blurb: 'Give it the line rate, the client mix and the site, and it ' +
                 'ranks the GX and PSS transponders that can carry it — naming ' +
                 'the cascade, the extra slot or the deeper rack each answer ' +
                 'costs you.' },
      ],
    },
    {
      id: 'hyperscaler', label: 'Hyperscaler', href: 'hyperscaler.html',
      blurb: 'The accounts and the deals — who is building what, and the ' +
             'tools for the solutions they buy.',
      children: [
        { group: 'Intel', href: 'dashboard.html', label: 'Dashboard',
          icon: 'SD',
          blurb: 'Hyperscaler intel and the APAC datacenter map, filtered to ' +
                 'Data Center / MOFN / DCI / subsea topics.' },
        { group: 'Intel', href: 'market-insight.html', label: 'Market Insight',
          icon: 'MI',
          blurb: 'Source-audited market-intelligence reports — data center, ' +
                 'DCI, subsea and adjacent markets. Built to brief fast and to ' +
                 'talk to Sales / Executive level.' },
        { group: 'MOFN', href: 'mofn.html', label: 'MOFN Configurator',
          icon: 'MO',
          blurb: 'Managed Optical Fiber Network — site-by-site OLS design with ' +
                 'reach and OSNR gating, protection, power and a complete ' +
                 'bill of materials.' },
        { group: 'MOFN', href: 'portfolio.html', label: 'HS Portfolio',
          icon: 'HP',
          blurb: 'Interactive quadrant view of the 1830 GX OLS parts a ' +
                 'hyperscaler deal draws on — bands, MRA vs single-rail, ' +
                 'compact vs full, R9.1 readiness.' },
        { group: 'Subsea', href: null, label: 'Subsea', icon: 'SB',
          blurb: 'Nothing here yet — the place for subsea line terminal and ' +
                 'landing-station material when it lands.' },
      ],
    },
  ];

  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(c => c != null && n.appendChild(
      typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };


  /* ------------------------------------------------------------- theme
     Stored per browser. The stamp goes on <html> so CSS can win over the OS
     preference in both directions. */
  const THEME_KEY = 'summa.theme';

  function theme() {
    const stamp = document.documentElement.getAttribute('data-theme');
    if (stamp) return stamp;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    paintTheme();
  }
  function paintTheme() {
    const b = document.querySelector('.navtheme');
    if (!b) return;
    b.innerHTML = theme() === 'dark'
      ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="3.1"/><path d="M8 1.2v1.5M8 13.3v1.5M14.8 8h-1.5M2.7 8H1.2M12.8 3.2l-1 1M4.2 11.8l-1 1M12.8 12.8l-1-1M4.2 4.2l-1-1"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.6 9.5A5.9 5.9 0 0 1 6.5 2.4a5.9 5.9 0 1 0 7.1 7.1Z"/></svg>';
  }
  function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform); }

  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {}

  function here() {
    const f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return f || 'index.html';
  }

  /* Which section and which child is the current page. */
  function locate(file) {
    for (const sec of SITE) {
      if ((sec.href || '').toLowerCase() === file) return { section: sec, child: null };
      for (const c of (sec.children || [])) {
        if ((c.href || '').toLowerCase() === file) return { section: sec, child: c };
      }
    }
    return { section: SITE[0], child: null };
  }

  function groupsOf(section) {
    const out = [];
    (section.children || []).forEach(c => {
      let g = out.find(x => x.name === c.group);
      if (!g) { g = { name: c.group, items: [] }; out.push(g); }
      g.items.push(c);
    });
    return out;
  }

  function render() {
    const host = document.getElementById('summa-nav');
    if (!host) return;
    const file = here();
    const { section, child } = locate(file);

    /* ---- top bar: brand and the two sections */
    const bar = el('div', { class: 'topbar' });
    const brand = el('a', { class: 'brand', href: 'index.html' }, [
      el('span', { class: 'dot' }),
      document.createTextNode('SUMMA'),
      el('span', { class: 'sub', text: 'Nokia ON · Sales Engineering Workbench' }),
    ]);
    bar.appendChild(brand);

    const nav = el('nav');
    SITE.forEach(sec => {
      const active = sec.id === section.id;
      nav.appendChild(el('a', {
        href: sec.href, class: active ? 'active' : '',
        'aria-current': active ? 'page' : false,
      }, [sec.label]));
    });
    bar.appendChild(nav);

    /* The theme switch and the palette cue belong to the bar rather than to
       any page — otherwise each page has to remember to grow its own, which
       is how the old header drifted. */
    const right = el('div', { class: 'barend' });
    const cue = el('button', { class: 'navcue', type: 'button',
      title: 'Search everything', 'aria-label': 'Search everything' }, [
      el('span', { class: 'mag' }),
      el('span', { class: 'lbl', text: 'Search' }),
      el('kbd', { text: isMac() ? '\u2318K' : 'Ctrl K' }),
    ]);
    cue.addEventListener('click', () => window.SUMMA_CMDK && window.SUMMA_CMDK.open());
    right.appendChild(cue);

    const toggle = el('button', { class: 'navtheme', type: 'button',
      title: 'Light or dark', 'aria-label': 'Toggle light or dark' });
    toggle.addEventListener('click', () => setTheme(theme() === 'dark' ? 'light' : 'dark'));
    right.appendChild(toggle);
    bar.appendChild(right);
    paintTheme();
    host.appendChild(bar);

    /* ---- sub bar: where you are, and the siblings you can jump to */
    if (section.children && section.children.length) {
      const sub = el('div', { class: 'subbar' });

      const crumbs = el('div', { class: 'crumbs' });
      crumbs.appendChild(el('a', { href: section.href, text: section.label }));
      if (child) {
        crumbs.appendChild(el('span', { class: 'sep', text: '/' }));
        crumbs.appendChild(el('span', { class: 'grp', text: child.group }));
        crumbs.appendChild(el('span', { class: 'sep', text: '/' }));
        crumbs.appendChild(el('span', { class: 'cur', text: child.label }));
      }
      sub.appendChild(crumbs);

      const links = el('div', { class: 'sibs' });
      groupsOf(section).forEach((g, i) => {
        if (i) links.appendChild(el('span', { class: 'div' }));
        links.appendChild(el('span', { class: 'glabel', text: g.name }));
        g.items.forEach(c => {
          if (!c.href) {
            links.appendChild(el('span', { class: 'soon', text: c.label }));
            return;
          }
          const on = child && c.href === child.href;
          links.appendChild(el('a', {
            href: c.href, class: on ? 'on' : '',
            'aria-current': on ? 'page' : false,
          }, [c.label]));
        });
      });
      sub.appendChild(links);
      host.appendChild(sub);
    }
  }

  /* Section landing pages render their own card grid from the same map. */
  function renderSection(id) {
    const host = document.getElementById('summa-section');
    if (!host) return;
    const sec = SITE.find(s => s.id === id);
    if (!sec) return;

    host.appendChild(el('section', { class: 'portal-hero' }, [
      el('h1', { text: sec.label }),
      el('p', { text: sec.blurb }),
    ]));

    groupsOf(sec).forEach(g => {
      const wrap = el('section', { class: 'section' });
      wrap.appendChild(el('h2', { text: g.name }));
      const grid = el('div', { class: 'portal-cards' });
      g.items.forEach(c => {
        const card = el(c.href ? 'a' : 'div', {
          class: 'portal-card' + (c.href ? '' : ' soon'),
          href: c.href || false,
        }, [
          el('div', { class: 'icon', text: c.icon || '' }),
          el('h3', { text: c.label }),
          el('p', { text: c.blurb }),
          el('div', { class: 'arrow',
                      text: c.href ? 'Open →' : 'Nothing here yet' }),
        ]);
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
      host.appendChild(wrap);
    });
  }

  window.SUMMA_NAV = { SITE, render, renderSection, groupsOf };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      render();
      const s = document.getElementById('summa-section');
      if (s) renderSection(s.dataset.section);
    });
  } else {
    render();
    const s = document.getElementById('summa-section');
    if (s) renderSection(s.dataset.section);
  }
}());
