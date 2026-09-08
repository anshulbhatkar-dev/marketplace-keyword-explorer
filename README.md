# Marketplace Keyword Explorer

A common repository for marketplace keyword-opportunity tooling — not a
Blinkit-only tool. It currently ships three tabs, and is meant to grow with
more marketplaces/tabs over time without re-architecting:

- **🔎 Blinkit Suggested Keywords** — Blinkit's own keyword recommendation
  export (search volume, brand, category, keyword type), with multi-select
  filters and clickable column sort.
- **🅰 AZ Running Keywords** — a standalone view of which search terms are
  performing well on Amazon (ranked by search volume/day, with units sold
  and a conversion-vs-benchmark column). No Blinkit tie-in — it doesn't
  check what's running anywhere, it's just the Amazon signal on its own.
- **🅱 BK Running Ads** — keywords actually running as Blinkit ads (from the
  daily per-keyword ad-performance log), ranked by budget consumed/day, with
  Direct Qty Sold/day, New Users/day and Direct RoAS, all as true daily
  run-rates, plus a blended-RoAS benchmark and Qualified-only filter (same
  pattern as AZ Running Keywords).

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
| BK ad-performance log ("This Month- Product Listing" tab) | `CONFIG.BK_ADS_WORKBOOK_ID` + `CONFIG.BK_ADS_TAB_GID` — a different workbook than the two above |
| Category revenue ranking | `CONFIG.SALES_WORKBOOK_ID` / `SALES_TAB_GID` — **not configured yet, see §3** |

All these constants live at the top of the `<script type="application/jsx-source" id="app-source">`
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

## 3. One thing Blinkit Suggested Keywords does NOT have yet (by design)

Categories are currently ranked by search volume, not revenue — a
reasonable proxy, just not revenue-true. The "which category earns the
most revenue" signal comes from a Sales-import feed that wasn't handed
over for this build.

To fix: point `CONFIG.SALES_WORKBOOK_ID` / `SALES_TAB_GID` at a sheet with
columns `Brand | Category | Units` (or similar — column matching is by
header name, looking for anything containing "unit"). Parser is
`parseSalesRows` / `buildCatRevMap`. Single-constant change, no other code
changes needed, once you say which sheet/tab it lives in.

## 4. BK Running Ads — column mapping and DRR logic

Source: the **"This Month- Product Listing"** tab — one row per keyword ×
campaign × day. Column matching is by header name first, falling back to
these exact column letters if header names don't resolve:

| What | Column | Header |
|---|---|---|
| Keyword | E | `Keyword` |
| New Users | N | `New Users` |
| Direct Sales | O | `Direct Sales` |
| Direct Quantities Sold | Q | `Direct Quantities Sold` |
| Estimated Budget Consumed | S | `Estimated Budget Consumed` |
| Type | AA | `Type` (`Comp`/`Generic`/`Brand` — normalized to `Competition`/`Generic`/`Branded` to match the AZ tab's badge styling) |
| Brand | AB | `Brand` |
| Category | AC | `GC category` |
| Comp Brand | AD | `Comp brand Name` |

For each brand × keyword: every row from the last 30 days of data present
(relative to the latest date in the sheet, not today's real date) is summed,
then divided by however many distinct days actually show up in that
30-day window — so a tracker with gaps still gives a true daily run-rate,
not an average diluted by missing days. Direct RoAS = Direct Sales ÷
Estimated Budget Consumed over that same summed window (the ratio is the
same whether you use the daily or the summed totals). Benchmark RoAS is
the blended Direct RoAS (sum of Direct Sales ÷ sum of Estimated Budget
Consumed) for every keyword sharing that brand × type — same shape as AZ
Running Keywords' conversion benchmark, just RoAS instead of conversion.

This feed is heavier than the other two — the source tab accumulates one
row per keyword per campaign per day, so a few months of history can mean
tens of thousands of rows even though it aggregates down to a couple
thousand keywords. If load times become noticeable, trimming the sheet to
a rolling ~60–90 day window is the fix, not code changes.

## 5. Deploy

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

## 6. Sharing / access requirements

- All source workbooks (including the BK ads-tracker workbook, which is
  separate from the other two) must stay **"Anyone with the link"** (viewer
  is enough) — the fetches are unauthenticated and cross-origin. This is a
  UI convenience app, not a security boundary: anyone with the deployed URL
  can see the same data anyone with the sheet link can see. If that's a
  concern, put the Vercel deployment behind Vercel's password/SSO
  protection (Project Settings → Deployment Protection) rather than trying
  to lock down the sheets.
- `docs.google.com/.../export?format=csv` sometimes returns empty on
  link-shared (not "published to web") workbooks. This app always uses the
  **gviz** endpoint (`/gviz/tq?tqx=out:csv&gid=`) instead, which resolves
  reliably by gid regardless of publish state — keep using gid, not sheet
  name, if you add more tabs.

## 7. Data refresh / caching

- Sheet CSVs are cached client-side in IndexedDB (`marketplace_kwexpl_cache`)
  for **4 hours** (`CONFIG.CACHE_TTL_MS`). Users can force a refresh with the
  "↻ Refresh data" button.
- Bump `CONFIG.CACHE_VER` (e.g. `v1` → `v2`) any time you change a sheet's
  columns — that invalidates every user's cache immediately instead of
  waiting out the TTL.

## 8. Adding another marketplace tab later

The pattern to copy: a `CONFIG` block for the new sheet, a `parseX` +
`aggregateX` function pair, a `<XTab>` component, and one more entry in the
`tabs` switcher in `<App>`. Nothing else in the file needs to change —
`fetchSheetCSV` and the IndexedDB cache are already generic. Blinkit
Suggested Keywords uses the `<MultiSelect>` component for its filters;
AZ Running Keywords and BK Running Ads use single-select dropdowns plus
the same Qualified-only/benchmark pattern (`computeXBenchmarks`,
`qualifiedOnly`/floor inputs) and the same click-to-sort `<th>` pattern
(`sortKey`/`sortDir`/`handleSort`) — reuse whichever fits the new tab
rather than building new ones.

## 9. File map

```
index.html                          the whole app (config, data layer, all three tabs)
google-apps-script/buildAZSnapshot.gs   Apps Script that builds the AZ snapshot tab
package.json                         `npm run dev` for local preview
vercel.json                          static-site config for Vercel
```
