import { activeItems } from './checklists.js';
import { decisionsFor } from './mail.js';

// Returns what still blocks the PDF: each entry points at the section to fix.
export function validateCheck(cl, check) {
  const problems = [];
  const a = check.answers || {};
  const act = activeItems(cl, check);
  const empty = act.filter((it) => !a[it.key]?.s);
  if (empty.length) {
    problems.push({
      section: empty[0].section.key,
      text: `${empty.length} butir belum diberi status: ${empty.slice(0, 6).map((it) => it.code).join(', ')}${empty.length > 6 ? ', dan lainnya' : ''}.`,
    });
  }
  const tmNoNote = act.filter((it) => a[it.key]?.s === 'TM' && !(a[it.key].c || '').trim());
  if (tmNoNote.length) {
    problems.push({ section: tmNoNote[0].section.key, text: `Butir TM wajib diberi komentar: ${tmNoNote.map((it) => it.code).join(', ')}.` });
  }
  const s = check.sign || {};
  if (!(s.name || '').trim()) problems.push({ section: 'pengesahan', text: 'Isi nama pemeriksa.' });
  if (!s.date) problems.push({ section: 'pengesahan', text: 'Isi tanggal pemeriksaan.' });
  if (!s.image) problems.push({ section: 'pengesahan', text: 'Unggah gambar tanda tangan.' });
  if (decisionsFor(check) && !check.decision?.value) problems.push({ section: 'pengesahan', text: 'Pilih keputusan atau rekomendasi.' });
  if (!s.agree) problems.push({ section: 'pengesahan', text: 'Centang pernyataan pemeriksaan.' });
  return problems;
}
