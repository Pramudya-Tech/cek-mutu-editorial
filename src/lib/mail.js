import { getChecklist, stepKeyOf, activeItems, STEPS } from './checklists.js';
import { plain, fmtDate } from './format.js';

// Decisions per step. `to` says who the email is for.
export const DECISIONS = {
  G1: { to: 'author', options: [
    { value: 'review', id: 'Lanjut ke telaah sejawat', en: 'Sent to peer review' },
    { value: 'revise', id: 'Dikembalikan untuk perbaikan', en: 'Returned for revision before review' },
    { value: 'reject', id: 'Ditolak (desk reject)', en: 'Rejected (desk rejection)' },
  ] },
  R: { to: 'editor', options: [
    { value: 'accept', id: 'Diterima', en: 'Accept' },
    { value: 'minor', id: 'Revisi minor', en: 'Minor revision' },
    { value: 'major', id: 'Revisi mayor', en: 'Major revision' },
    { value: 'reject', id: 'Ditolak', en: 'Reject' },
  ] },
  G2: { to: 'author', options: [
    { value: 'accept', id: 'Diterima', en: 'Accepted' },
    { value: 'minor', id: 'Revisi minor', en: 'Minor revision' },
    { value: 'major', id: 'Revisi mayor', en: 'Major revision' },
    { value: 'reject', id: 'Ditolak', en: 'Rejected' },
  ] },
  G3: { to: 'author', options: [
    { value: 'production', id: 'Lanjut ke produksi', en: 'Moved to production' },
    { value: 'query', id: 'Perlu tanggapan penulis', en: 'Author response needed' },
  ] },
  P: { to: 'editor', options: [
    { value: 'approve', id: 'Pruf disetujui', en: 'Proof approved' },
    { value: 'corrections', id: 'Pruf perlu koreksi', en: 'Proof needs corrections' },
  ] },
  G4: { to: 'author', options: [
    { value: 'publish', id: 'Siap terbit', en: 'Ready for publication' },
    { value: 'fix', id: 'Perlu koreksi sebelum terbit', en: 'Corrections needed before publication' },
  ] },
};

export function decisionsFor(check) {
  return DECISIONS[stepKeyOf(check)];
}

export function decisionLabel(check, lang = 'id') {
  const d = decisionsFor(check)?.options.find((o) => o.value === check.decision?.value);
  return d ? d[lang] : '';
}

// A sensible default from the results: key items failing push towards the
// stricter decision, any TM towards revision.
export function suggestDecision(check, n) {
  const step = stepKeyOf(check);
  if (step === 'G1') return n.ktm ? 'revise' : 'review';
  if (step === 'R' || step === 'G2') return n.ktm >= 3 ? 'major' : n.ktm || n.tm > 3 ? 'major' : n.tm ? 'minor' : 'accept';
  if (step === 'G3') return n.tm ? 'query' : 'production';
  if (step === 'P') return n.tm ? 'corrections' : 'approve';
  return n.tm ? 'fix' : 'publish';
}

const T = {
  id: {
    subject: (j, id, status) => `[${j}] Keputusan editorial naskah #${id}: ${status}`,
    subjectToEditor: (j, id, status) => `[${j}] Hasil ${status} naskah #${id}`,
    hello: 'Yth. Penulis,',
    helloEditor: 'Yth. Editor,',
    thanks: (title, id, j) => `Terima kasih telah mengirimkan naskah berjudul "${title}" (ID ${id}) ke ${j}.`,
    items: 'Mohon perhatikan hal-hal berikut:',
    itemsReviewer: 'Butir yang belum terpenuhi:',
    comment: 'Komentar', loc: 'Lokasi', act: 'Tindak lanjut', evid: 'Bukti',
    due: (d) => `Mohon unggah perbaikan melalui OJS paling lambat ${d}.`,
    upload: 'Mohon unggah naskah perbaikan beserta surat tanggapan melalui OJS.',
    regards: 'Hormat kami,',
    attach: (docId) => `Dokumentasi pemeriksaan terlampir (ID dokumen ${docId}).`,
    body: {
      G1: {
        review: 'Naskah Anda telah melewati penyaringan awal (Preliminary) dan akan diteruskan ke tahap telaah sejawat.',
        revise: 'Berdasarkan penyaringan awal (Preliminary), naskah Anda perlu diperbaiki sebelum dapat diteruskan ke telaah sejawat.',
        reject: 'Berdasarkan penyaringan awal (Preliminary), dengan menyesal kami sampaikan bahwa naskah Anda belum dapat kami proses lebih lanjut.',
      },
      G2: {
        accept: 'Berdasarkan hasil telaah sejawat dan pemeriksaan sebelum penerimaan (Pre-Acceptance), dengan senang hati kami sampaikan bahwa naskah Anda diterima untuk diterbitkan.',
        minor: 'Berdasarkan hasil telaah sejawat dan pemeriksaan sebelum penerimaan (Pre-Acceptance), naskah Anda memerlukan revisi minor.',
        major: 'Berdasarkan hasil telaah sejawat dan pemeriksaan sebelum penerimaan (Pre-Acceptance), naskah Anda memerlukan revisi mayor.',
        reject: 'Berdasarkan hasil telaah sejawat dan pemeriksaan sebelum penerimaan (Pre-Acceptance), dengan menyesal kami sampaikan bahwa naskah Anda tidak dapat kami terima.',
      },
      G3: {
        production: 'Penyuntingan naskah Anda (Post-Acceptance) telah selesai dan naskah diteruskan ke tahap produksi.',
        query: 'Penyuntingan naskah Anda (Post-Acceptance) memerlukan tanggapan Anda atas beberapa hal berikut sebelum naskah diteruskan ke produksi.',
      },
      G4: {
        publish: 'Naskah Anda telah melewati pemeriksaan produksi dan publikasi (Publication) dan siap diterbitkan.',
        fix: 'Pemeriksaan produksi dan publikasi (Publication) menemukan beberapa hal yang perlu dikoreksi sebelum naskah diterbitkan.',
      },
      R: {
        any: (dec) => `Berikut hasil telaah saya atas naskah tersebut. Rekomendasi saya: ${dec}.`,
      },
      P: {
        approve: 'Saya telah memeriksa pruf naskah dan menyetujuinya untuk diterbitkan.',
        corrections: 'Saya telah memeriksa pruf naskah dan menemukan hal-hal berikut yang perlu dikoreksi.',
      },
    },
  },
  en: {
    subject: (j, id, status) => `[${j}] Editorial decision on submission #${id}: ${status}`,
    subjectToEditor: (j, id, status) => `[${j}] ${status} result for submission #${id}`,
    hello: 'Dear Author,',
    helloEditor: 'Dear Editor,',
    thanks: (title, id, j) => `Thank you for submitting your manuscript "${title}" (ID ${id}) to ${j}.`,
    items: 'Please address the following points:',
    itemsReviewer: 'Items not yet met:',
    comment: 'Comment', loc: 'Location', act: 'Follow-up', evid: 'Evidence',
    due: (d) => `Please upload your revision through OJS by ${d}.`,
    upload: 'Please upload the revised manuscript together with a response letter through OJS.',
    regards: 'Kind regards,',
    attach: (docId) => `The check record is attached (document ID ${docId}).`,
    body: {
      G1: {
        review: 'Your manuscript has passed preliminary screening and will now be sent for peer review.',
        revise: 'Following preliminary screening, your manuscript needs revision before it can be sent for peer review.',
        reject: 'Following preliminary screening, we regret to inform you that we cannot consider your manuscript further.',
      },
      G2: {
        accept: 'Following peer review and our pre-acceptance check, we are pleased to inform you that your manuscript has been accepted for publication.',
        minor: 'Following peer review and our pre-acceptance check, your manuscript requires minor revision.',
        major: 'Following peer review and our pre-acceptance check, your manuscript requires major revision.',
        reject: 'Following peer review and our pre-acceptance check, we regret to inform you that your manuscript cannot be accepted.',
      },
      G3: {
        production: 'Copyediting of your manuscript (post-acceptance) is complete and it has moved to production.',
        query: 'Copyediting of your manuscript (post-acceptance) needs your response on the points below before it can move to production.',
      },
      G4: {
        publish: 'Your manuscript has passed the production and publication check and is ready for publication.',
        fix: 'The production and publication check found points that need correcting before publication.',
      },
      R: {
        any: (dec) => `Please find my review of this manuscript below. My recommendation: ${dec}.`,
      },
      P: {
        approve: 'I have checked the proof and approve it for publication.',
        corrections: 'I have checked the proof and found the following points that need correcting.',
      },
    },
  },
};

export function buildDecisionMail(check, { lang = 'id', due = '' } = {}) {
  const t = T[lang];
  const cl = getChecklist(check.checklistId);
  const step = stepKeyOf(check);
  const stepName = STEPS.find((s) => s.key === step)?.name || '';
  const dec = check.decision?.value;
  const decLabel = decisionLabel(check, lang);
  const toEditor = DECISIONS[step]?.to === 'editor';
  const j = check.journal?.name || '';
  const id = check.manuscript?.id || '';
  const status = toEditor ? stepName : `${stepName} – ${decLabel}`;
  const subject = toEditor ? t.subjectToEditor(j, id, stepName) : t.subject(j, id, decLabel || stepName);

  const a = check.answers || {};
  const tm = activeItems(cl, check).filter((it) => a[it.key]?.s === 'TM').sort((x, y) => Number(y.k) - Number(x.k));
  const lines = [];
  lines.push(toEditor ? t.helloEditor : t.hello, '');
  lines.push(toEditor
    ? `${lang === 'id' ? 'Naskah' : 'Manuscript'}: "${check.manuscript?.title || '-'}" (ID ${id}), ${j}.`
    : t.thanks(check.manuscript?.title || '-', id, j));
  const body = step === 'R' ? t.body.R.any(decLabel) : (t.body[step]?.[dec] || '');
  if (body) lines.push(body);
  const showItems = tm.length && !(step === 'G2' && dec === 'accept') && !(step === 'G1' && dec === 'review');
  if (showItems) {
    lines.push('', toEditor ? t.itemsReviewer : t.items, '');
    tm.forEach((it, i) => {
      const x = a[it.key];
      lines.push(`${i + 1}. ${it.code}${it.k ? (lang === 'id' ? ' (butir kunci)' : ' (key item)') : ''} – ${plain(it.title)}`);
      if ((x.c || '').trim()) lines.push(`   ${t.comment}: ${x.c.trim()}`);
      if ((x.l || '').trim()) lines.push(`   ${t.loc}: ${x.l.trim()}`);
      if ((x.b || '').trim()) lines.push(`   ${t.evid}: ${x.b.trim()}`);
      if ((x.t || '').trim()) lines.push(`   ${t.act}: ${x.t.trim()}`);
    });
  }
  const needsUpload = !toEditor && ['revise', 'minor', 'major', 'query', 'fix'].includes(dec);
  if (needsUpload) lines.push('', due ? t.due(fmtDateLang(due, lang)) : t.upload);
  if (check.docId) lines.push('', t.attach(check.docId));
  lines.push('', t.regards, '', check.sign?.anon ? (check.code || 'Reviewer') : (check.sign?.name || ''), check.sign?.role || '', j);
  return { subject, body: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), status };
}

function fmtDateLang(d, lang) {
  if (lang === 'id') return fmtDate(d);
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
