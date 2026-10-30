/**
 * Cek Mutu Editorial — shared registry in a Google Sheet.
 *
 * Records which steps each manuscript has been through (Preliminary, Peer Review,
 * Pre-Acceptance, Post-Acceptance, Author Proof, Publication), so every browser
 * sees the same history and a step cannot be repeated for the same submission ID.
 * Only who, what and when are stored; answers and signatures stay in the browser.
 *
 * Setup: see apps-script/README.md.
 */

// Optional shared key. If set here, put the same value in the app (Tentang > Spreadsheet).
const SHARED_KEY = '';
const SHEET_NAME = 'Registri';
const COLUMNS = ['id', 'parentId', 'journal', 'msid', 'title', 'step', 'role', 'variant', 'round', 'code',
  'status', 'revision', 'decision', 'docId', 'name', 'updatedAt', 'finishedAt', 'recordedAt'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (SHARED_KEY && p.key !== SHARED_KEY) return json_({ ok: false, reason: 'key', message: 'Kunci spreadsheet salah' });
  if (p.action === 'ping') return json_({ ok: true, sheet: SHEET_NAME, rows: readRows_().length });
  if (p.action === 'list') {
    const journal = norm_(p.journal);
    const msid = String(p.msid || '').trim();
    const rows = readRows_().filter((r) => norm_(r.journal) === journal && String(r.msid).trim() === msid);
    return json_({ ok: true, rows });
  }
  return json_({ ok: false, reason: 'action', message: 'Aksi tidak dikenal' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, reason: 'body', message: 'Data tidak valid' }); }
  if (SHARED_KEY && body.key !== SHARED_KEY) return json_({ ok: false, reason: 'key', message: 'Kunci spreadsheet salah' });
  if (body.action !== 'upsert' || !body.row || !body.row.id) return json_({ ok: false, reason: 'action', message: 'Aksi tidak dikenal' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = sheet_();
    const rows = readRows_();
    const row = clean_(body.row);
    const at = rows.findIndex((r) => r.id === row.id);
    if (at < 0) {
      // A new entry: refuse it if the same step already exists for this
      // submission, unless it is a revision of that entry.
      const key = uniqueKey_(row);
      const same = rows.filter((r) => uniqueKey_(r) === key);
      if (same.length && !same.some((r) => r.id === row.parentId)) {
        const existing = same.reduce((a, r) => (Number(r.revision) > Number(a.revision) ? r : a));
        return json_({ ok: false, reason: 'duplicate', message: 'Tahap ini sudah tercatat untuk ID naskah tersebut', existing });
      }
      row.recordedAt = new Date().toISOString();
      sheet.appendRow(COLUMNS.map((c) => (row[c] == null ? '' : row[c])));
    } else {
      // An update of the same entry (draft -> finished). A finished entry is final.
      if (rows[at].status === 'finished') return json_({ ok: true, unchanged: true, row: rows[at] });
      row.recordedAt = rows[at].recordedAt;
      sheet.getRange(at + 2, 1, 1, COLUMNS.length).setValues([COLUMNS.map((c) => (row[c] == null ? '' : row[c]))]);
    }
    return json_({ ok: true, row });
  } finally {
    lock.releaseLock();
  }
}

function uniqueKey_(r) {
  const base = norm_(r.journal) + '|' + String(r.msid).trim() + '|' + r.step;
  return r.step === 'R' ? base + '|' + (Number(r.round) || 1) + '|' + String(r.code || '').toUpperCase() : base;
}

function clean_(r) {
  const out = {};
  COLUMNS.forEach((c) => { out[c] = r[c] == null ? '' : String(r[c]).slice(0, 500); });
  out.msid = out.msid.replace(/\D/g, '');
  return out;
}

function norm_(s) { return String(s || '').trim().toLowerCase(); }

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(COLUMNS);
    sh.setFrozenRows(1);
    sh.getRange('D:D').setNumberFormat('@'); // keep submission IDs as text
  }
  return sh;
}

function readRows_() {
  const sh = sheet_();
  const values = sh.getDataRange().getValues();
  const head = values.shift() || COLUMNS;
  return values.filter((v) => v[0]).map((v) => {
    const o = {};
    head.forEach((h, i) => { o[h] = v[i] instanceof Date ? v[i].toISOString() : v[i]; });
    o.msid = String(o.msid);
    return o;
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
