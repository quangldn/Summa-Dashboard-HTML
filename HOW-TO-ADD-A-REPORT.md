# How to add a new Market Insight report

Repeatable checklist for adding a report to the SUMMA workbench and pushing it to GitHub.
There are **three** steps: drop the file → add the card → commit & push.

---

## Step 1 — Drop the report HTML into `reports/`

Each report is a **single self-contained** `.html` file (dark theme, its own tabs,
inline CSS/JS — no external assets). Put it here:

```
OUTPUTS/Summa Dashboard HTML/reports/<Your_Report_Name>.html
```

Current reports:
- `ASEAN_DC_Insight.html`
- `ASEAN_Subsea_Insight.html`
- `Microsoft_AI_Factory_Insight.html`

## Step 2 — Add one portal-card block in `market-insight.html`

Open `market-insight.html`, find the dashed **"More reports land here"** placeholder
(`<div class="portal-card soon">`), and paste a new card **just before it**. Copy an
existing card and change the href, title, blurb, tags, and icon.

```html
      <a class="portal-card" href="reports/<Your_Report_Name>.html">
        <span class="status-badge">Live</span>
        <div class="icon ms">AI</div>
        <h3>Your Report Title</h3>
        <p>One or two sentences describing what the report covers.</p>
        <div class="card-tags"><span>Tag1</span><span>Tag2</span><span>Tag3</span></div>
        <div class="arrow">Open report →</div>
      </a>
```

Icon options (the little coloured square):
- `dc` — Nokia-blue (data center reports)
- `ss` — teal (subsea reports)
- `ms` — blue→purple (hyperscale / AI reports)
- add your own in the `<style>` block: `.portal-card .icon.<key> { background: linear-gradient(135deg,#hex1,#hex2); }`

Nothing else needs changing — the cards use the shared workbench style.

## Step 3 — Commit & push to GitHub

The workbench lives in a **private GitHub repo, opened from a local clone**.
Do this in a terminal **inside your local clone folder** (the one that has a `.git`):

```bash
cd "<path-to-your-local-clone>/Summa Dashboard HTML"

# 1. copy the new/changed files in from your working copy if the clone is separate:
#    cp "<working-copy>/reports/<Your_Report_Name>.html" reports/
#    cp "<working-copy>/market-insight.html" .

git add reports/<Your_Report_Name>.html market-insight.html
git commit -m "Add <Your Report Title> to Market Insight library"
git push
```

If GitHub Desktop is easier: it will show the two changed files → write a summary →
**Commit to main** → **Push origin**.

---

### Notes
- If your working copy (the "second brain" folder) and your git clone are the **same**
  folder, skip the `cp` lines — just `git add / commit / push` in place.
- If they're **different** folders, the `cp` step moves the two changed files into the
  clone first.
- Only two files change per report: `reports/<name>.html` and `market-insight.html`.
- Reports are also saved as Cowork artifacts, so they persist even outside the repo.
