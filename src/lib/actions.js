import { getChecklist, findChecklist, sectionsOf, checklistLabel } from './checklists.js';
import { uid, today, downloadBlob, safeName, journalAbbr } from './format.js';
import { docIdFor } from './hash.js';
import { buildCheckPdf, buildSummaryPdf } from './pdf.js';

export function newCheck({ role, variant, gate, round, journal, manuscript, signature, link }) {
  const cl = findChecklist({ role, variant, gate });
  const fields = {};
  if (role === 'Reviewer') {
    if (round) fields['Putaran telaah'] = { picked: [String(round)], other: '' };
    if (link?.code) fields['Kode reviewer'] = link.code;
  }
  const now = new Date().toISOString();
  return {
    id: uid(),
    checklistId: cl.id,
    version: cl.version,
    role,
    variant: cl.var === 'all' ? variant || 'emp' : cl.var,
    gate: cl.gate || null,
    round: role === 'Reviewer' ? Number(round) || 1 : null,
    journal: journal ? { id: journal.id, name: journal.name, abbr: journal.abbr || '', issnPrint: journal.issnPrint || '', issnOnline: journal.issnOnline || '', sinta: journal.sinta || '' } : { name: '' },
    manuscript: { id: manuscript?.id || '', title: manuscript?.title || '' },
    fields,
    answers: {},
    modules: {},
    sign: {
      name: signature?.name || '', role: signature?.roles?.[role] || cl.signRole,
      date: today(), image: signature?.image || '', agree: false, anon: false,
    },
    status: 'draft',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    locked: !!link,
    linkId: link?.lid || null,
    due: link?.due || null,
    code: link?.code || null,
  };
}

export function finishCheck(check) {
  const finishedAt = new Date().toISOString();
  const sealed = { ...check, status: 'finished', finishedAt };
  return { ...sealed, docId: docIdFor(sealed) };
}

export function reviseCheck(check, reason) {
  const now = new Date().toISOString();
  return {
    ...structuredClone(check),
    id: uid(), parentId: check.id, revision: (check.revision || 1) + 1, reason,
    status: 'draft', docId: null, finishedAt: null, createdAt: now, updatedAt: now,
    sign: { ...check.sign, agree: false, date: today() },
  };
}

function pdfName(check, suffix = '') {
  const cl = getChecklist(check.checklistId);
  const stat = checklistLabel(cl).replace(/\s+/g, '-') + (cl.role === 'Reviewer' ? `-R${check.round || 1}${check.code ? '-' + safeName(check.code) : ''}` : '');
  const rev = check.revision > 1 ? `-rev${check.revision}` : '';
  return `${safeName(journalAbbr(check.journal))}-${safeName(check.manuscript?.id)}-${stat}${rev}${suffix}.pdf`;
}

export async function exportCheckPdf(check, sectionKey = null) {
  const blob = await buildCheckPdf(check, { sectionKey });
  let suffix = '';
  if (sectionKey) {
    const s = sectionsOf(getChecklist(check.checklistId)).find((x) => x.key === sectionKey);
    suffix = `-Bagian-${s?.letter || sectionKey}`;
  }
  downloadBlob(blob, pdfName(check, suffix));
}

export async function exportSummaryPdf(checks) {
  const blob = await buildSummaryPdf(checks);
  downloadBlob(blob, `${safeName(journalAbbr(checks[0]?.journal))}-${safeName(checks[0]?.manuscript?.id)}-Ringkasan.pdf`);
}

export function exportCheckFile(check) {
  const data = { app: 'cek-mutu-editorial', type: 'check', savedAt: new Date().toISOString(), check };
  downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }),
    `Isian-${safeName(journalAbbr(check.journal))}-${safeName(check.manuscript?.id)}-${checklistLabel(getChecklist(check.checklistId)).replace(/\s+/g, '-')}${check.revision > 1 ? '-rev' + check.revision : ''}.json`);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { try { resolve(JSON.parse(r.result)); } catch (e) { reject(new Error('Berkas bukan JSON yang valid')); } };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

// Accepts a check file; returns { check, verified } where verified is
// true/false for finished checks and null for drafts.
export function importCheckData(data) {
  if (!data || data.app !== 'cek-mutu-editorial' || data.type !== 'check' || !data.check?.checklistId) {
    throw new Error('Ini bukan berkas isian Cek Mutu Editorial');
  }
  if (!getChecklist(data.check.checklistId)) throw new Error('Checklist dalam berkas tidak dikenal');
  const check = data.check;
  const verified = check.status === 'finished' ? docIdFor(check) === check.docId : null;
  return { check, verified };
}

// Turn an uploaded signature photo or scan into a trimmed PNG; optionally
// make the white paper transparent so it sits cleanly in the PDF box.
export function processSignature(file, { removeWhite = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { reject(new Error('Gunakan berkas PNG atau JPG')); return; }
    if (file.size > 4 * 1024 * 1024) { reject(new Error('Ukuran berkas lebih dari 4 MB')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 900 / img.width);
        const cw = Math.max(1, Math.round(img.width * scale)), ch = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas'); c.width = cw; c.height = ch;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, cw, ch);
        const d = x.getImageData(0, 0, cw, ch); const p = d.data;
        let minX = cw, minY = ch, maxX = -1, maxY = -1;
        for (let i = 0; i < p.length; i += 4) {
          const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          if (removeWhite && lum > 215) p[i + 3] = 0;
          else if (removeWhite && lum > 160) p[i + 3] = Math.round(p[i + 3] * (215 - lum) / 55);
          if (p[i + 3] > 24) {
            const px = (i / 4) % cw, py = Math.floor(i / 4 / cw);
            if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
          }
        }
        x.putImageData(d, 0, 0);
        if (maxX < 0) { reject(new Error('Tanda tangan tidak terlihat pada gambar')); return; }
        const pad = 8;
        const sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
        const sw = Math.min(cw - sx, maxX - minX + pad * 2), sh = Math.min(ch - sy, maxY - minY + pad * 2);
        const o = document.createElement('canvas'); o.width = sw; o.height = sh;
        o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(o.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Gambar tidak bisa dibaca'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
