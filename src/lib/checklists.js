import { CHECKLISTS } from '../data/checklists/index.js';
import { plain } from './format.js';

export const ROLES = [
  { id: 'Editor', label: 'Editor', note: 'Preliminary sampai Publication' },
  { id: 'Reviewer', label: 'Reviewer', note: 'Peer review' },
  { id: 'Penulis', label: 'Penulis', note: 'Author proof check' },
];

export const VARIANTS = [
  { id: 'emp', label: 'Empiris & Technical Paper', short: 'Empiris & Technical' },
  { id: 'rev', label: 'Review, Survey & Konseptual', short: 'Review & Survey' },
];

// Editor stages. The checklists call them Gate 1 to 4; documents and the
// interface use the stage names instead.
export const GATES = [
  { n: 1, name: 'Preliminary', id: 'Penyaringan awal naskah' },
  { n: 2, name: 'Pre-Acceptance', id: 'Pemeriksaan sebelum penerimaan' },
  { n: 3, name: 'Post-Acceptance', id: 'Penyuntingan setelah penerimaan' },
  { n: 4, name: 'Publication', id: 'Produksi dan publikasi' },
];

// The whole process of one manuscript, in order.
export const STEPS = [
  { key: 'G1', role: 'Editor', gate: 1, name: 'Preliminary', id: 'Penyaringan awal naskah' },
  { key: 'R', role: 'Reviewer', name: 'Peer Review', id: 'Telaah sejawat oleh reviewer' },
  { key: 'G2', role: 'Editor', gate: 2, name: 'Pre-Acceptance', id: 'Pemeriksaan sebelum penerimaan' },
  { key: 'G3', role: 'Editor', gate: 3, name: 'Post-Acceptance', id: 'Penyuntingan setelah penerimaan' },
  { key: 'P', role: 'Penulis', name: 'Author Proof', id: 'Pemeriksaan pruf oleh penulis' },
  { key: 'G4', role: 'Editor', gate: 4, name: 'Publication', id: 'Produksi dan publikasi' },
];

export function getChecklist(id) {
  return CHECKLISTS.find((c) => c.id === id);
}

export function findChecklist({ role, variant, gate }) {
  if (role === 'Penulis') return CHECKLISTS.find((c) => c.role === 'Penulis');
  return CHECKLISTS.find((c) => c.role === role && c.var === variant && (role !== 'Editor' || c.gate === gate));
}

export function stepKeyOf(clOrCheck) {
  const cl = clOrCheck.checklistId ? getChecklist(clOrCheck.checklistId) : clOrCheck;
  if (!cl) return null;
  if (cl.role === 'Editor') return `G${cl.gate}`;
  return cl.role === 'Reviewer' ? 'R' : 'P';
}

export function stepOf(clOrCheck) {
  return STEPS.find((s) => s.key === stepKeyOf(clOrCheck));
}

// Status name used in documents, file names and the interface.
export function checklistLabel(cl) {
  if (!cl) return '';
  return stepOf(cl)?.name || '';
}

export const itemKey = (ti, gi, ii) => `${ti}.${gi}.${ii}`;

// Sections shown as cards in the middle column: identity, every lettered group or
// module of every table, then signing.
export function sectionsOf(cl) {
  const out = [{ key: 'identitas', kind: 'identity', title: 'Identitas naskah', letter: 'i' }];
  let n = 0;
  cl.tables.forEach((t, ti) => {
    t.groups.forEach((g, gi) => {
      const items = g.items.map((it, ii) => ({ ...it, key: itemKey(ti, gi, ii), no: ++n }));
      const m = g.plain.match(/^([A-Z])\.\s/);
      out.push({
        key: `${ti}.${gi}`, kind: 'group', title: g.plain.replace(/^(?:[A-Z]|Modul [A-Z]+(?:-[A-Z]+)?)\.\s+/, ''), titleHtml: g.title,
        letter: m ? m[1] : g.mod || '•', module: g.module, mod: g.mod, table: t, ti, gi, items,
      });
    });
  });
  out.push({ key: 'pengesahan', kind: 'sign', title: 'Pengesahan dan ekspor', letter: '✓' });
  return out;
}

export function activeItems(cl, check) {
  return sectionsOf(cl)
    .filter((s) => s.kind === 'group' && (!s.module || check.modules?.[s.key]))
    .flatMap((s) => s.items.map((it) => ({ ...it, section: s })));
}

export function counts(cl, check) {
  const act = activeItems(cl, check);
  const a = check.answers || {};
  const filled = act.filter((it) => a[it.key]?.s);
  const tm = filled.filter((it) => a[it.key].s === 'TM');
  return { total: act.length, filled: filled.length, m: filled.length - tm.length, tm: tm.length, ktm: tm.filter((it) => it.k).length, ktmCodes: tm.filter((it) => it.k).map((it) => it.code) };
}

// "Jenis artikel dan modul" choices switch on the matching module groups.
const MODULE_MAP = {
  emp: {
    Kuantitatif: ['S-E', 'E'], SEM: ['S-E', 'E', 'E-SEM'], EKS: ['S-E', 'E', 'E-EKS'], KOMP: ['S-E', 'E', 'E-KOMP'],
    'Kualitatif (QL)': ['S-E', 'E', 'E-QL'], 'Metode campuran (MM)': ['S-E', 'E', 'E-MM'],
    'R&D/DBR (RD)': ['S-E', 'E', 'E-RD'], 'Technical paper (TEK)': ['S-E', 'E-TEK'],
  },
  rev: {
    'Kajian sistematis': ['S-R', 'R'], 'SLR/mapping': ['S-R', 'R', 'R-SLR'], 'Scoping (SC)': ['S-R', 'R', 'R-SC'],
    'Bibliometrik (BIB)': ['S-R', 'R', 'R-BIB'], 'Meta-analisis (MA)': ['S-R', 'R', 'R-MA'],
    'Kajian naratif/survey paper (NR)': ['S-R', 'R-NR'], 'Konseptual/teoretis (K)': ['K'],
  },
};

export function modulesForPicks(cl, picks) {
  const map = MODULE_MAP[cl.var] || {};
  const want = new Set(picks.flatMap((p) => map[p] || []));
  const on = {};
  sectionsOf(cl).forEach((s) => { if (s.module && s.mod && want.has(s.mod)) on[s.key] = true; });
  return on;
}

// Identity fields that come from the check itself rather than the form.
export function sharedFieldValue(label, check) {
  const l = label.toLowerCase();
  if (l.startsWith('nama jurnal')) return check.journal?.name || '';
  if (l.startsWith('id naskah')) return check.manuscript?.id || '';
  if (l.startsWith('judul artikel')) return check.manuscript?.title || '';
  return null;
}

export function itemPlainTitle(it) {
  return plain(it.title);
}

export function stageOrder(check) {
  const i = STEPS.findIndex((s) => s.key === (check.step || stepKeyOf(check)));
  return i < 0 ? 99 : i * 10 + (check.role === 'Reviewer' ? (Number(check.round) || 1) / 10 : 0);
}
