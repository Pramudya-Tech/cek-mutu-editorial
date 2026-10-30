import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getChecklist, sectionsOf, counts, sharedFieldValue, VARIANTS, checklistLabel, stageOrder } from './checklists.js';
import { plain, fmtDate, fmtDateTime } from './format.js';
import { decisionLabel } from './mail.js';

const A4 = [595.28, 841.89];
const M = { l: 42, r: 42, t: 46, b: 60 };
const W = A4[0] - M.l - M.r;
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  ink: hex('#141B34'), muted: hex('#666D84'), royal: hex('#2846C8'), gold: hex('#C9A24E'),
  rule: hex('#CDD3E2'), band: hex('#EEF2FB'), head: hex('#1E37A6'), white: hex('#FFFFFF'),
  ok: hex('#1C7C52'), bad: hex('#B8332A'), goldSoft: hex('#FBF3DF'),
};

const REPLACE = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '☐': '[ ]', '☑': '[x]', '✓': 'v', 'τ': 'tau', '×': 'x', '−': '-', ' ': ' ', '\t': ' ' };

class Writer {
  constructor(doc, fonts) {
    this.doc = doc; this.f = fonts; this.page = null; this.y = 0; this.pages = []; this.footer = null;
    this.cache = new Map();
  }

  clean(str) {
    const s = String(str ?? '');
    let out = '';
    for (const ch of s) {
      if (ch === '\n') { out += '\n'; continue; }
      if (REPLACE[ch] != null) { out += REPLACE[ch]; continue; }
      if (!this.cache.has(ch)) {
        let ok = true;
        try { this.f.reg.encodeText(ch); } catch { ok = false; }
        this.cache.set(ch, ok);
      }
      out += this.cache.get(ch) ? ch : '?';
    }
    return out;
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - M.t;
    this.pages.push({ page: this.page, footer: this.footer });
    if (this.onPage) this.onPage();
  }

  ensure(h) { if (!this.page || this.y - h < M.b) { this.newPage(); return true; } return false; }

  width(text, size, font = this.f.reg) { return font.widthOfTextAtSize(this.clean(text), size); }

  wrap(text, maxW, size, font = this.f.reg) {
    const lines = [];
    for (const para of this.clean(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (let w of words) {
        while (font.widthOfTextAtSize(w, size) > maxW) {
          let i = w.length;
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxW) i--;
          if (line) { lines.push(line); line = ''; }
          lines.push(w.slice(0, i)); w = w.slice(i);
        }
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) <= maxW) line = test;
        else { if (line) lines.push(line); line = w; }
      }
      lines.push(line);
    }
    return lines.length ? lines : [''];
  }

  text(str, x, y, size, font = this.f.reg, color = C.ink) {
    this.page.drawText(this.clean(str), { x, y, size, font, color });
  }

  para(str, { size = 9, font = this.f.reg, color = C.ink, x = M.l, w = W, lh = 1.35, gap = 4 } = {}) {
    const lines = this.wrap(str, w, size, font);
    for (const ln of lines) {
      this.ensure(size * lh);
      this.text(ln, x, this.y - size, size, font, color);
      this.y -= size * lh;
    }
    this.y -= gap;
  }

  rule(color = C.rule, thick = 0.6, x = M.l, w = W) {
    this.page.drawLine({ start: { x, y: this.y }, end: { x: x + w, y: this.y }, thickness: thick, color });
  }

  // cells: [{ text | lines | draw, w, font, size, color, bg, align }]
  row(cells, { pad = 4, minH = 0, border = C.rule, header = null } = {}) {
    const prepared = cells.map((c) => {
      const size = c.size || 8.6;
      const font = c.font || this.f.reg;
      const blocks = c.blocks || [{ text: c.text ?? '', font, size, color: c.color }];
      const lines = blocks.flatMap((b) => this.wrap(b.text, c.w - pad * 2, b.size || size, b.font || font)
        .map((t) => ({ t, size: b.size || size, font: b.font || font, color: b.color || c.color || C.ink })));
      const h = c.drawH ? c.drawH : lines.reduce((s, l) => s + l.size * 1.32, 0);
      return { ...c, lines, h };
    });
    const h = Math.max(minH, ...prepared.map((c) => c.h + pad * 2));
    if (this.ensure(h) && header) header();
    let x = M.l;
    for (const c of prepared) {
      if (c.bg) this.page.drawRectangle({ x, y: this.y - h, width: c.w, height: h, color: c.bg });
      this.page.drawRectangle({ x, y: this.y - h, width: c.w, height: h, borderColor: border, borderWidth: 0.6 });
      if (c.draw) c.draw(x, this.y - h, c.w, h);
      let ty = this.y - pad;
      for (const l of c.lines) {
        ty -= l.size * 1.32;
        const tw = l.font.widthOfTextAtSize(l.t, l.size);
        const tx = c.align === 'center' ? x + (c.w - tw) / 2 : x + pad;
        this.page.drawText(l.t, { x: tx, y: ty + l.size * 0.28, size: l.size, font: l.font, color: l.color });
      }
      x += c.w;
    }
    this.y -= h;
  }
}

async function embedImage(doc, dataUrl) {
  if (!dataUrl) return null;
  try {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    return dataUrl.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch { return null; }
}

function fieldValue(f, check) {
  const shared = sharedFieldValue(f.label, check);
  let v = shared != null ? shared : check.fields?.[f.label];
  if (f.type === 'choice') {
    const c = v || { picked: [], other: '' };
    v = (c.picked || []).map((t) => { const o = f.opts.find((x) => x.t === t); return o?.other && c.other ? `${t}: ${c.other}` : t; }).join(', ');
  }
  const anon = check.sign?.anon && getChecklist(check.checklistId)?.role === 'Reviewer';
  if (!v && /^Nama (editor|pemeriksa)/i.test(f.label)) v = check.sign?.name;
  if (!v && /^Tanggal (pemeriksaan|telaah)/i.test(f.label)) v = check.sign?.date;
  if (anon && /^Nama/i.test(f.label)) v = '';
  if (f.type === 'date' && v) v = fmtDate(v);
  return v || '-';
}

// Document status: the step name (Preliminary, Pre-Acceptance, ...), with the
// review round for peer review.
export function statusOf(check) {
  const cl = getChecklist(check.checklistId);
  return `${checklistLabel(cl)}${cl.role === 'Reviewer' ? ` (putaran ${check.round || 1})` : ''}`;
}

async function drawCheck(w, check, { sectionKey = null } = {}) {
  const cl = getChecklist(check.checklistId);
  const secs = sectionsOf(cl);
  const only = sectionKey ? secs.find((s) => s.key === sectionKey) : null;
  const variant = VARIANTS.find((v) => v.id === cl.var);
  const cn = counts(cl, check);
  const anon = cl.role === 'Reviewer' && check.sign?.anon;
  const status = statusOf(check);
  const decision = decisionLabel(check, 'id');
  w.footer = {
    left: `ID dokumen ${check.docId || '-'}  ·  Revisi ${check.revision || 1}`,
    mid: `${check.journal?.name || ''} · ID submission ${check.manuscript?.id || '-'} · ${status}${only ? ` · Bagian ${only.letter}` : ''}`,
  };
  w.newPage();

  // Header: journal, submission ID, status
  const right = `Dokumentasi pemeriksaan · v${cl.version}`;
  w.text(right, M.l + W - w.width(right, 8), w.y - 8, 8, w.f.reg, C.muted);
  w.text(variant?.label || '', M.l, w.y - 8, 8, w.f.reg, C.muted);
  w.y -= 20;
  w.para(check.journal?.name || '-', { size: 16, font: w.f.bold, color: C.head, lh: 1.25, gap: 3 });
  w.para(`ID submission ${check.manuscript?.id || '-'}${check.manuscript?.title ? `  ·  ${check.manuscript.title}` : ''}`, { size: 10, color: C.ink, gap: 8 });
  const half = W / 2;
  w.row([
    { blocks: [{ text: 'Status', size: 7.6, color: C.muted }, { text: status + (check.revision > 1 ? ` · revisi ${check.revision}` : ''), size: 11, font: w.f.bold, color: C.head }], w: half, bg: C.goldSoft },
    { blocks: [{ text: cl.role === 'Editor' ? 'Keputusan editorial' : 'Rekomendasi', size: 7.6, color: C.muted }, { text: decision || '-', size: 11, font: w.f.bold, color: C.ink }], w: W - half, bg: C.goldSoft },
  ], { pad: 7, border: C.gold });
  if (only) { w.y -= 6; w.para(`Bagian ${only.letter}. ${only.title}`, { size: 9.5, font: w.f.bold, color: C.royal, gap: 2 }); }
  w.y -= 6;
  w.rule(C.gold, 1.4); w.y -= 10;

  // Identity
  for (const f of cl.fields) {
    w.row([
      { text: plain(f.html || f.label), w: 150, font: w.f.bold, bg: C.band, size: 8.4 },
      { text: fieldValue(f, check), w: W - 150, size: 8.6 },
    ], { pad: 4 });
  }
  w.y -= 10;

  // Summary
  const summary = only
    ? (() => {
      const a = check.answers || {};
      const on = !only.module || check.modules?.[only.key];
      const f = on ? only.items.filter((it) => a[it.key]?.s) : [];
      const tm = f.filter((it) => a[it.key].s === 'TM');
      return `Butir pada bagian ini: ${on ? only.items.length : 0}   ·   Memenuhi: ${f.length - tm.length}   ·   Tidak memenuhi: ${tm.length}`;
    })()
    : `Butir diperiksa: ${cn.filled}/${cn.total}   ·   Memenuhi: ${cn.m}   ·   Tidak memenuhi: ${cn.tm}   ·   Butir kunci TM: ${cn.ktm}${cn.ktm ? ` (${cn.ktmCodes.join(', ')})` : ''}`;
  w.row([{ text: summary, w: W, bg: C.goldSoft, size: 8.6, font: w.f.bold }], { pad: 6, border: C.gold });
  w.y -= 12;

  // Items, grouped by table
  const groups = secs.filter((s) => s.kind === 'group' && (!only || s.key === only.key) && (!s.module || check.modules?.[s.key]));
  const cols = [26, 236, 46, W - 26 - 236 - 46];
  let currentTable = null;
  const header = () => w.row([
    { text: 'No.', w: cols[0], font: w.f.bold, color: C.white, bg: C.head, size: 8, align: 'center' },
    { text: 'Butir pemeriksaan', w: cols[1], font: w.f.bold, color: C.white, bg: C.head, size: 8 },
    { text: 'Status', w: cols[2], font: w.f.bold, color: C.white, bg: C.head, size: 8, align: 'center' },
    { text: 'Komentar dan catatan', w: cols[3], font: w.f.bold, color: C.white, bg: C.head, size: 8 },
  ], { border: C.head });
  for (const s of groups) {
    if (currentTable !== s.ti) {
      currentTable = s.ti;
      w.ensure(60);
      w.y -= 4;
      w.para(s.table.title, { size: 10, font: w.f.bold, color: C.head, gap: 4 });
      header();
    }
    w.row([{ text: plain(s.titleHtml), w: W, font: w.f.bold, bg: C.band, color: C.head, size: 8.6 }], { header });
    for (const it of s.items) {
      const a = check.answers?.[it.key] || {};
      const notes = [['Komentar', a.c], ['Bukti', a.b], ['Lokasi', a.l], ['Tindak lanjut', a.t]].filter(([, v]) => (v || '').trim());
      const ticks = (a.x || []).some(Boolean) ? miniLabels(it, a.x) : '';
      const noteBlocks = notes.flatMap(([k, v]) => [{ text: `${k}: ${v}`, size: 8.2 }]);
      if (ticks) noteBlocks.push({ text: `Dicentang: ${ticks}`, size: 8.2 });
      w.row([
        { text: String(it.no), w: cols[0], size: 8.4, align: 'center', color: C.muted },
        { blocks: [{ text: `${it.code}${it.k ? '  [Kunci]' : ''}`, font: w.f.bold, size: 8.2, color: it.k ? C.bad : C.royal }, { text: plain(it.title), size: 8.4 }], w: cols[1] },
        { text: a.s || '-', w: cols[2], font: w.f.bold, size: 9.5, align: 'center', color: a.s === 'M' ? C.ok : a.s === 'TM' ? C.bad : C.muted },
        { blocks: noteBlocks.length ? noteBlocks : [{ text: '', size: 8.2 }], w: cols[3] },
      ], { header });
    }
  }

  // Signature
  w.y -= 14;
  const img = anon ? null : await embedImage(w.doc, check.sign?.image);
  w.ensure(130);
  w.para('Pengesahan pemeriksa', { size: 10, font: w.f.bold, color: C.head, gap: 4 });
  const sc = [150, 110, 160, W - 420];
  w.row([
    { text: anon ? 'Kode reviewer' : 'Nama pemeriksa', w: sc[0], font: w.f.bold, bg: C.band, size: 8 },
    { text: 'Peran', w: sc[1], font: w.f.bold, bg: C.band, size: 8 },
    { text: 'Tanda tangan', w: sc[2], font: w.f.bold, bg: C.band, size: 8 },
    { text: 'Tanggal pemeriksaan', w: sc[3], font: w.f.bold, bg: C.band, size: 8 },
  ]);
  const name = anon ? (check.code || check.fields?.['Kode reviewer'] || 'Reviewer') : (check.sign?.name || '-');
  w.row([
    { text: name, w: sc[0], size: 9 },
    { text: check.sign?.role || '-', w: sc[1], size: 9 },
    {
      text: anon ? 'Disimpan oleh editor' : (img ? '' : '-'), w: sc[2], size: 8, color: C.muted,
      draw: img ? (x, y, cw, ch) => {
        const s = Math.min((cw - 16) / img.width, (ch - 12) / img.height);
        w.page.drawImage(img, { x: x + (cw - img.width * s) / 2, y: y + (ch - img.height * s) / 2, width: img.width * s, height: img.height * s });
      } : null,
    },
    { text: fmtDate(check.sign?.date) || '-', w: sc[3], size: 9 },
  ], { minH: 74 });
  w.y -= 6;
  if (check.sign?.agree) w.para('Pemeriksa menyatakan bahwa pemeriksaan ini dilakukan sendiri dan isian sesuai dengan keadaan naskah.', { size: 8, color: C.muted, gap: 2 });
  if (check.revision > 1 && check.reason) w.para(`Revisi ${check.revision}: ${check.reason}`, { size: 8, color: C.muted, gap: 2 });
  w.para(`Diselesaikan ${fmtDateTime(check.finishedAt)}. Cocokkan ID dokumen dengan membuka berkas isian (.json) di aplikasi Cek Mutu Editorial.`, { size: 7.6, color: C.muted });
}

function miniLabels(it, ticks) {
  const parts = plain(it.cr.join(' ')).split('☐').slice(1).map((s) => s.trim().replace(/\s{2,}.*$/, '').replace(/\.$/, ''));
  return parts.filter((_, i) => ticks[i]).join('; ');
}

function drawFooters(w) {
  const total = w.pages.length;
  w.pages.forEach(({ page, footer }, i) => {
    if (!footer) return;
    const y = 30;
    page.drawLine({ start: { x: M.l, y: y + 12 }, end: { x: M.l + W, y: y + 12 }, thickness: 0.5, color: C.rule });
    page.drawText(w.clean(footer.left), { x: M.l, y, size: 7.4, font: w.f.bold, color: C.ink });
    page.drawText(w.clean(footer.mid), { x: M.l, y: y - 10, size: 7.2, font: w.f.reg, color: C.muted });
    const pg = `Halaman ${i + 1} dari ${total}`;
    page.drawText(pg, { x: M.l + W - w.f.reg.widthOfTextAtSize(pg, 7.4), y, size: 7.4, font: w.f.reg, color: C.muted });
  });
}

async function setup(title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title); doc.setCreator('Cek Mutu Editorial'); doc.setProducer('Cek Mutu Editorial (pdf-lib)');
  const fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  return { doc, w: new Writer(doc, fonts) };
}

export async function buildCheckPdf(check, opts = {}) {
  const cl = getChecklist(check.checklistId);
  const { doc, w } = await setup(`${check.journal?.name || ''} — ID ${check.manuscript?.id || ''} — ${statusOf(check)}`);
  await drawCheck(w, check, opts);
  drawFooters(w);
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

export async function buildSummaryPdf(checks) {
  const list = checks.slice().sort((a, b) => stageOrder(a) - stageOrder(b) || (a.finishedAt || '').localeCompare(b.finishedAt || ''));
  const first = list[0];
  const last = list[list.length - 1];
  const { doc, w } = await setup(`${first.journal?.name || ''} — ID ${first.manuscript?.id || ''} — Ringkasan`);
  w.footer = { left: `Ringkasan · ID submission ${first.manuscript?.id || ''}`, mid: `${first.journal?.name || ''} · ${list.length} pemeriksaan selesai · dibuat ${fmtDateTime(new Date().toISOString())}` };
  w.newPage();
  const right = 'Ringkasan pemeriksaan naskah';
  w.text(right, M.l + W - w.width(right, 8), w.y - 8, 8, w.f.reg, C.muted);
  w.y -= 20;
  w.para(first.journal?.name || '-', { size: 16, font: w.f.bold, color: C.head, gap: 3 });
  w.para(`ID submission ${first.manuscript?.id || '-'}${first.manuscript?.title ? `  ·  ${first.manuscript.title}` : ''}`, { size: 10, color: C.ink, gap: 8 });
  w.row([
    { blocks: [{ text: 'Status terakhir', size: 7.6, color: C.muted }, { text: statusOf(last), size: 11, font: w.f.bold, color: C.head }], w: W / 2, bg: C.goldSoft },
    { blocks: [{ text: 'Keputusan terakhir', size: 7.6, color: C.muted }, { text: decisionLabel(last, 'id') || '-', size: 11, font: w.f.bold, color: C.ink }], w: W / 2, bg: C.goldSoft },
  ], { pad: 7, border: C.gold });
  w.y -= 6; w.rule(C.gold, 1.4); w.y -= 12;
  const cols = [128, 100, 70, 62, 80, W - 440];
  const hdr = () => w.row(['Status', 'Pemeriksa', 'Tanggal', 'M / TM / Kunci', 'Keputusan', 'ID dokumen'].map((t, i) => ({ text: t, w: cols[i], font: w.f.bold, color: C.white, bg: C.head, size: 8 })), { border: C.head });
  hdr();
  for (const c of list) {
    const cl = getChecklist(c.checklistId);
    const n = counts(cl, c);
    const anon = cl.role === 'Reviewer' && c.sign?.anon;
    w.row([
      { text: `${statusOf(c)}${c.revision > 1 ? ` · revisi ${c.revision}` : ''}`, w: cols[0], size: 8.4 },
      { text: anon ? (c.code || c.fields?.['Kode reviewer'] || 'Reviewer') : (c.sign?.name || '-'), w: cols[1], size: 8.4 },
      { text: fmtDate(c.sign?.date), w: cols[2], size: 8.4 },
      { text: `${n.m} / ${n.tm} / ${n.ktm}`, w: cols[3], size: 8.4, align: 'center' },
      { text: decisionLabel(c, 'id') || '-', w: cols[4], size: 8.4 },
      { text: c.docId || '-', w: cols[5], size: 8, font: w.f.bold },
    ], { header: hdr });
  }
  w.y -= 10;
  w.para('Halaman berikutnya memuat setiap pemeriksaan secara lengkap, berurutan dari Preliminary sampai Publication.', { size: 8.4, color: C.muted });
  for (const c of list) await drawCheck(w, c);
  drawFooters(w);
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

