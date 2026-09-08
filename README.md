# Marketplace Keyword Explorer

A common repository for marketplace keyword-opportunity tooling — not a
Blinkit-only tool. It currently ships two tabs, and is meant to grow with
more marketplaces/tabs over time without re-architecting:

- **🔎 Kw Explorer** — Blinkit's own keyword recommendation export, cross-checked
  against what you're already running on Blinkit.
- **🅰 AZ Running Keywords** — a standalone view of which search terms are
  performing well on Amazon (ranked by search volume/day, with units sold
  and a conversion-vs-benchmark column). No Blinkit tie-in — it doesn't
  check what's running anywhere, it's just the Amazon signal on its own.

One static `index.html`, React 18 + SheetJS + Babel loaded from CDN, all
data fetched client-side from Google Sheets as CSV. No backend, no build
step, no server-side secrets — so adding a new marketplace tab later is
just another CONFIG block + parser + component in the same file (or split
into its own file once there are enough tabs to warrant it).

## 1. How it's wired

| Piece | Where |
|---|---|
| Reco keywords ("Search reco BK" tab) | `CONFIG.RECO_WORKBOOK_ID` + `CONFIG.RECO_TAB_GID` |
| AZ snapshot ("AZ Search snapshot" tab) | `CONFIG.RECO_WORKBOOK_ID` + `CONFIG.AZ_SNAPSHOT_GID` |
| Live Blinkit ad rows (for "Running on BK") | `CONFIG.LIVE_ADS_WORKBOOK_ID` / `LIVE_ADS_TAB_GID` — **not configured yet, see §3** |
| Category revenue ranking | `CONFIG.SALES_WORKBOOK_ID` / `SALES_TAB_GID` — **not configured yet, see §3** |

All four constants live at the top of the `<script type="application/jsx-source" id="app-source">`
block in `index.html`. That's the only place you should need to edit sheet
IDs/gids.

The AZ snapshot tab isn't fetched directly from Amazon — the source workbook
is view-only and not link-shareable for export, so a small Apps Script
(`google-apps-script/buildAZSnapshot.gs`) reads it server-side (running as
your Google account) and writes a clean, pre-aggregated tab into the reco
workbook once a day. See that file's header comment for setup steps. This is
already running for the existing dashboard — you likely don't need to set it
up again unless you're pointing this at fresh sheets.

## 2. Run it locally

```bash
npm run dev
# open http://localhost:3000
```

It's a static file — any static server works (`npx serve`, `python3 -m http.server`, etc).

## 3. Two things Kw Explorer does NOT have yet (by design)

These apply to the **Kw Explorer** tab only — AZ Running Keywords has no
Blinkit tie-in at all, by design, so neither of these affects it.

The "is this keyword already running on Blinkit" signal and the "which
category earns the most revenue" signal both come from other feeds (the
master ad-performance export and the Sales-import feed) that weren't
handed over for this build.

Until you plug those in:

- **Every keyword shows as "Not running"** — there's a banner in the UI
  reminding you of this. To fix: point `CONFIG.LIVE_ADS_WORKBOOK_ID` /
  `LIVE_ADS_TAB_GID` at a sheet with columns `Brand | Keyword | Type | Spend
  | Impressions | Date` (one row per ad per day; `Type` should say `Search`
  for search campaigns). The app already has the parser/filter written
  (`parseLiveAdsRows` / `buildLiveKwSet` in index.html) — last 14 days,
  `spend > 0 || impressions > 0`, `Type === 'Search'`.
- **Categories are ranked by search volume, not revenue** — a reasonable
  proxy, just not revenue-true. To fix: point `CONFIG.SALES_WORKBOOK_ID` /
  `SALES_TAB_GID` at a sheet with columns `Brand | Category | Units` (or
  similar — column matching is by header name, looking for anything
  containing "unit"). Parser is `parseSalesRows` / `buildCatRevMap`.

Both are single-constant changes, no other code changes needed, once you
say which sheet/tab those live in.

## 4. Deploy

### GitHub

```bash
git init                      # already done if you got this as a zip with a repo
git add -A
git commit -m "Initial commit: Marketplace Keyword Explorer"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Vercel

1. [vercel.com/new](https://vercel.com/new) → Import the GitHub repo.
2. Framework preset: **Other** (it's a static `index.html`, no build command needed).
3. Deploy. That's it — no environment variables required, since every fetch
   is unauthenticated client-side CSV.

Every push to `main` auto-redeploys.

## 5. Sharing / access requirements

- Both source workbooks must stay **"Anyone with the link"** (viewer is
  enough) — the fetches are unauthenticated and cross-origin. This is a UI
  convenience app, not a security boundary: anyone with the deployed URL can
  see the same data anyone with the sheet link can see. If that's a
  concern, put the Vercel deployment behind Vercel's password/SSO
  protection (Project Settings → Deployment Protection) rather than trying
  to lock down the sheets.
- `docs.google.com/.../export?format=csv` sometimes returns empty on
  link-shared (not "published to web") workbooks. This app always uses the
  **gviz** endpoint (`/gviz/tq?tqx=out:csv&gid=`) instead, which resolves
  reliably by gid regardless of publish state — keep using gid, not sheet
  name, if you add more tabs.

## 6. Data refresh / caching

- Sheet CSVs are cached client-side in IndexedDB (`marketplace_kwexpl_cache`)
  for **4 hours** (`CONFIG.CACHE_TTL_MS`). Users can force a refresh with the
  "↻ Refresh data" button.
- Bump `CONFIG.CACHE_VER` (e.g. `v1` → `v2`) any time you change a sheet's
  columns — that invalidates every user's cache immediately instead of
  waiting out the TTL.
- Ignore/snooze state (the "⏸ 2wk" / "🚫 Forever" buttons on **Kw Explorer
  only** — AZ Running Keywords has no ignore feature) is **per-browser**,
  stored in `localStorage` under `kwexpl_ignore` — it does not sync across
  devices or teammates.

## 7. Adding another marketplace tab later

The pattern to copy: a `CONFIG` block for the new sheet, a `parseX` +
`aggregateX` function pair, a `<XTab>` component, and one more entry in the
`tabs` switcher in `<App>`. Nothing else in the file needs to change —
`fetchSheetCSV` and the IndexedDB cache are already generic. If your new
tab needs an ignore/snooze feature, namespace its keys with a prefix (see
`ignoreKey`'s optional `ns` argument) so they don't collide with Kw
Explorer's.

## 8. File map

```
index.html                          the whole app (config, data layer, both tabs)
google-apps-script/buildAZSnapshot.gs   Apps Script that builds the AZ snapshot tab
package.json                         `npm run dev` for local preview
vercel.json                          static-site config for Vercel
```
