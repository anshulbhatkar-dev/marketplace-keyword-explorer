/**
 * buildAZSnapshot.gs
 *
 * Bind this script to any Google Sheet you own that Apps Script can run as
 * you (the reco workbook below is a natural home for it). It reads the
 * Amazon source workbook directly — Apps Script runs as your account, and
 * your *view* access on the Amazon workbook is enough — trims to the last
 * WEEKS weeks, aggregates to one row per keyword x brand, and writes a
 * clean static tab that the dashboard reads via gviz CSV.
 *
 * Why this exists instead of IMPORTRANGE: the Amazon workbook is
 * view-only / not link-shared for export, so the dashboard cannot read it
 * client-side at all. IMPORTRANGE was also tried and rejected — heavy on
 * ~33k-row tabs, throws #REF!/"Loading…" mid-refresh, and the dashboard
 * would read broken cells. A daily snapshot of static values is the robust
 * pattern for any private/heavy source like this.
 *
 * Setup:
 *   1. Extensions -> Apps Script on the destination (reco) workbook.
 *   2. Paste this file in as a new script file.
 *   3. Update SOURCE_ID / DEST_ID / TABS below if your sheet IDs differ.
 *   4. Run buildAZSnapshot once manually (grants the auth prompts).
 *   5. Triggers -> Add Trigger -> buildAZSnapshot -> Time-driven -> Day
 *      timer, a couple hours after the Amazon sheet usually refreshes.
 *   6. Confirm the "AZ Search snapshot" tab appears in DEST_ID with a
 *      gid, and put that gid into index.html's CONFIG.AZ_SNAPSHOT_GID.
 */
function buildAZSnapshot() {
  var SOURCE_ID = '1yRTZ-NhUQyImwX_eCa9VmLBFMp1FDJoN2B6ZctwinHc'; // Amazon source (view-only)
  var DEST_ID   = '1UkeDfFaziuZZtA6jVixDAu1dsgbWbW6DX1MQcwYtYug'; // reco workbook (write here)
  var TABS = { 'BB - Overall': 'Be Bodywise', 'MM - Overall': 'Man Matters', 'LJ - Overall': 'Little Joys' };
  var WEEKS = 4;

  var src = SpreadsheetApp.openById(SOURCE_ID);
  var out = [['Brand', 'Type', 'Search Query', 'Search Volume (wk avg)', 'Units Sold (wk avg)', 'Weeks']];
  var report = [];

  Object.keys(TABS).forEach(function (tabName) {
    var sh = src.getSheetByName(tabName);
    if (!sh) { report.push(tabName + ': NOT FOUND'); return; }
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) { report.push(tabName + ': empty'); return; }
    var head = vals[0].map(function (c) { return String(c).toLowerCase().trim(); });
    var col = function (test) { for (var c = 0; c < head.length; c++) if (test(head[c])) return c; return -1; };
    var ci = {
      type:  col(function (h) { return h === 'type'; }),
      kw:    col(function (h) { return h === 'search query'; }),
      vol:   col(function (h) { return h.indexOf('search query volume') >= 0; }),
      units: col(function (h) { return h.indexOf('purchases') >= 0 && h.indexOf('brand count') >= 0; }),
      date:  col(function (h) { return h.indexOf('reporting date') >= 0; })
    };
    report.push(tabName + ' -> type:' + ci.type + ' kw:' + ci.kw + ' vol:' + ci.vol + ' units:' + ci.units + ' date:' + ci.date);
    if (ci.kw < 0 || ci.vol < 0 || ci.units < 0) { report.push(tabName + ': MISSING COLS'); return; }

    var toDate = function (v) { if (v instanceof Date) return isNaN(v.getTime()) ? null : v; if (!v) return null; var d = new Date(v); return isNaN(d.getTime()) ? null : d; };
    var maxD = null;
    for (var r = 1; r < vals.length; r++) { var d = toDate(vals[r][ci.date]); if (d && (!maxD || d > maxD)) maxD = d; }
    var cutoff = maxD ? new Date(maxD.getTime() - (WEEKS * 7 - 1) * 86400000) : null;   // last 4 weeks

    var agg = {};
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      var kw = String(row[ci.kw] || '').trim(); if (!kw) continue;
      var d = toDate(row[ci.date]);
      if (cutoff && d && d < cutoff) continue;
      var k = kw.toLowerCase();
      if (!agg[k]) agg[k] = { type: String(row[ci.type] || '').trim(), kw: kw, vol: 0, units: 0, wk: {} };
      agg[k].vol   += Number(row[ci.vol])   || 0;
      agg[k].units += Number(row[ci.units]) || 0;
      agg[k].wk[d ? d.getTime() : '_'] = 1;
    }
    Object.keys(agg).forEach(function (k) {
      var a = agg[k], w = Math.max(1, Object.keys(a.wk).length);
      out.push([TABS[tabName], a.type, a.kw, a.vol / w, a.units / w, w]);   // weekly average
    });
  });

  Logger.log('Column map: ' + report.join('  ||  '));
  if (out.length <= 1) { Logger.log('SKIP — no rows, keeping last good snapshot.'); return; }  // self-heal

  var dest = SpreadsheetApp.openById(DEST_ID);
  var dst  = dest.getSheetByName('AZ Search snapshot') || dest.insertSheet('AZ Search snapshot');
  dst.clearContents();
  dst.getRange(1, 1, out.length, out[0].length).setValues(out);
  Logger.log('Wrote ' + (out.length - 1) + ' rows to reco workbook.');
}
