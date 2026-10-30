import { STEPS, stepKeyOf, getChecklist } from './checklists.js';
import { rowFromCheck, uniqueKey, listRows, upsertCheck } from './registry.js';
import { newCheck } from './actions.js';

// Decisions that end the manuscript's process.
const CLOSING = { G1: ['reject'], G2: ['reject'] };

const sameManuscript = (a, journal, msid) => String(a.msid) === String(msid) && String(a.journal).trim().toLowerCase() === String(journal).trim().toLowerCase();

// Local checks and registry rows as one list of entries; local wins on the same id.
export function entriesFor(checks, remoteRows, journal, msid) {
  const local = checks
    .filter((c) => String(c.manuscript?.id) === String(msid) && (c.journal?.name || '').trim().toLowerCase() === String(journal).trim().toLowerCase())
    .map((c) => ({ ...rowFromCheck(c), local: true, check: c, synced: c.synced }));
  const ids = new Set(local.map((e) => e.id));
  const remote = (remoteRows || []).filter((r) => !ids.has(r.id) && sameManuscript(r, journal, msid)).map((r) => ({ ...r, local: false }));
  return [...local, ...remote];
}

// Latest revision per unique key (a step, or a reviewer's round).
function latestPerKey(entries) {
  const m = new Map();
  for (const e of entries) {
    const k = uniqueKey(e);
    const cur = m.get(k);
    if (!cur || (Number(e.revision) || 1) > (Number(cur.revision) || 1)) m.set(k, e);
  }
  return m;
}

export function pipeline(entries) {
  const latest = [...latestPerKey(entries).values()];
  let closedBy = null;
  const steps = STEPS.map((s) => {
    const list = latest.filter((e) => e.step === s.key).sort((a, b) => (Number(a.round) || 0) - (Number(b.round) || 0) || String(a.code).localeCompare(String(b.code)));
    const done = list.filter((e) => e.status === 'finished');
    const status = list.length === 0 ? 'none' : (s.key === 'R' ? (done.length ? 'done' : 'draft') : (done.length ? 'done' : 'draft'));
    const step = { ...s, entries: list, status, closed: !!closedBy, closedBy };
    const closing = done.find((e) => CLOSING[s.key]?.includes(e.decision));
    if (closing && !closedBy) closedBy = { step: s, entry: closing };
    return step;
  });
  const next = steps.find((s) => s.role === 'Editor' && s.status !== 'done' && !s.closed) || null;
  return { steps, closedBy, next };
}

// Is this step already taken for this manuscript?
export function findConflict(params, entries) {
  const key = uniqueKey(params);
  const same = entries.filter((e) => uniqueKey(e) === key);
  if (!same.length) return null;
  const latest = same.reduce((a, e) => ((Number(e.revision) || 1) > (Number(a.revision) || 1) ? e : a));
  return latest;
}

export function previousEditorStep(gate, entries) {
  if (gate <= 1) return null;
  const prevKey = `G${gate - 1}`;
  const done = entries.some((e) => e.step === prevKey && e.status === 'finished');
  return done ? null : STEPS.find((s) => s.key === prevKey);
}

// Start a step for a manuscript, refusing duplicates found locally or in the
// shared registry. Returns { check } or { conflict } or { error }.
export async function startStep(store, params, { skipRegistry = false } = {}) {
  const { role, variant, gate, round, code, journal, manuscript, link } = params;
  const step = role === 'Editor' ? `G${gate}` : role === 'Reviewer' ? 'R' : 'P';
  const probe = { journal: journal.name, msid: manuscript.id, step, round: step === 'R' ? Number(round) || 1 : '', code: step === 'R' ? String(code || '').toUpperCase() : '' };

  let remote = [];
  if (store.registry.enabled && !skipRegistry) {
    const r = await listRows(store.registry, journal.name, manuscript.id);
    if (!r.ok) return { error: r.message || 'Spreadsheet tidak bisa dihubungi', offline: r.reason === 'network' };
    remote = r.rows;
    store.setRemote(journal.name, manuscript.id, remote);
  }
  const entries = entriesFor(store.checks, remote, journal.name, manuscript.id);
  const conflict = findConflict(probe, entries);
  if (conflict) return { conflict };

  const check = newCheck({ role, variant, gate, round, journal, manuscript, signature: store.signature, link: link || (code ? { code } : null) });
  if (code && !link) { check.code = String(code).toUpperCase(); check.locked = false; check.fields['Kode reviewer'] = check.code; }
  store.saveCheck(check);

  if (store.registry.enabled && !skipRegistry) {
    const u = await upsertCheck(store.registry, check);
    if (!u.ok && u.reason === 'duplicate') {
      store.deleteCheck(check.id);
      return { conflict: { ...u.existing, local: false } };
    }
    store.saveCheck({ ...check, synced: !!u.ok });
  }
  return { check };
}

// Record a check in the registry after it changes state (finished, revised).
export async function syncCheck(store, check) {
  if (!store.registry.enabled) return { ok: true, skipped: true };
  const u = await upsertCheck(store.registry, check);
  store.saveCheck({ ...check, synced: !!u.ok });
  return u;
}

export function describeEntry(e) {
  const cl = e.check ? getChecklist(e.check.checklistId) : null;
  const step = STEPS.find((s) => s.key === (e.step || (cl && stepKeyOf(cl))));
  return step ? `${step.name}${e.step === 'R' ? ` putaran ${e.round || 1}${e.code ? ` (${e.code})` : ''}` : ''}` : '';
}
