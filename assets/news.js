/* ============================================================
   SUMMA — Hyperscaler News
   Source: Google News RSS, topic-filtered to data-center / DCI /
   MOFN / fiber / subsea — relayed via api.rss2json.com so a
   static page can read RSS without CORS issues.
   ============================================================ */

const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';

const googleNewsUrl = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// Topic filter that matches Quang's work (Data Center, MOFN, DCI,
// subsea, fiber, backbone) — applied per hyperscaler.
const COMPANIES = [
  { id: 'aws',      label: 'AWS',
    query: 'AWS (data center OR DCI OR fiber OR subsea OR submarine OR backbone OR region)' },
  { id: 'msft',     label: 'Microsoft',
    query: 'Microsoft Azure (data center OR DCI OR fiber OR subsea OR submarine OR backbone OR region)' },
  { id: 'google',   label: 'Google',
    query: 'Google Cloud (data center OR DCI OR fiber OR subsea OR submarine OR backbone)' },
  { id: 'meta',     label: 'Meta',
    query: 'Meta (data center OR fiber OR subsea cable OR backbone)' },
  { id: 'oracle',   label: 'Oracle',
    query: 'Oracle Cloud (data center OR DCI OR fiber OR region OR backbone)' },
  { id: 'starlink', label: 'Starlink',
    query: 'Starlink (ground station OR data center OR fiber OR backhaul OR PoP OR landing)' },
];

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  });
  return e;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch { return ''; }
}

function extractSource(item) {
  // Google News RSS embeds source in description as: <font color="#6f6f6f">SourceName</font>
  if (item.author) return item.author;
  const m = (item.description || '').match(/<font[^>]*>([^<]+)<\/font>/);
  return m ? m[1] : '';
}

function buildCompanyBlock(company) {
  const root = el('div', { class: 'news-company', id: `news-${company.id}` });
  const head = el('h4', {}, [
    company.label,
    el('span', { class: 'badge' }, 'top 3'),
  ]);
  const body = el('div', { class: 'news-loading' }, 'Loading…');
  root.append(head, body);
  return { root, body };
}

function renderItems(body, items) {
  body.className = 'news-list';
  body.innerHTML = '';
  if (!items || items.length === 0) {
    body.className = 'news-empty';
    body.textContent = 'No recent items match the filter.';
    return;
  }
  const ul = el('ul', { class: 'news-list' });
  items.slice(0, 3).forEach((it) => {
    const src = extractSource(it);
    const date = formatDate(it.pubDate);
    const meta = [src, date].filter(Boolean).join(' · ');
    const li = el('li', {}, [
      el('a', { href: it.link, target: '_blank', rel: 'noopener noreferrer' }, [
        it.title || '(untitled)',
        meta ? el('span', { class: 'meta' }, meta) : null,
      ]),
    ]);
    ul.appendChild(li);
  });
  body.replaceWith(ul);
}

function renderError(body, message) {
  body.className = 'news-empty';
  body.textContent = message || 'Could not load feed.';
}

async function fetchFeed(company) {
  const url = RSS_PROXY + encodeURIComponent(googleNewsUrl(company.query));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (data.status !== 'ok') throw new Error(data.message || 'proxy error');
  return data.items || [];
}

async function loadAll() {
  const root = document.getElementById('news-root');
  if (!root) return;
  root.innerHTML = '';
  const slots = COMPANIES.map((c) => {
    const { root: r, body } = buildCompanyBlock(c);
    root.appendChild(r);
    return { c, body };
  });
  // Fetch in parallel
  await Promise.all(slots.map(async ({ c, body }) => {
    try {
      const items = await fetchFeed(c);
      renderItems(body, items);
    } catch (e) {
      console.error('feed error for', c.id, e);
      renderError(body, 'Feed unavailable (rate-limited or offline).');
    }
  }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAll);
} else {
  loadAll();
}
