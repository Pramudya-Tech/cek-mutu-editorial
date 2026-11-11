import { STEPS, stepKeyOf, getChecklist } from './checklists.js';
import { newCheck } from './actions.js';
import { api } from './api.js';

// Decisions that end the manuscript's process.
const CLOSING = { G1: ['reject'], G2: ['reject'] };

// One slot per stage: a step of a submission, or one review assignment.
export function uniqueKey(e) {
  if (e.slot) return e.slot;
  return `${e.msid}|${e.step}|${e.reviewId || ''}`;
}

// Server entries for a submission, with the full check attached when this
// browser has it loaded.
export function entriesFor(checks, serverEntries) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  return (serverEntries || []).map((e) => ({ ...e, check: byId.get(e.id) || null }));
}

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
    const status = list.length === 0 ? 'none' : (done.length ? 'done' : 'draft');
    const step = { ...s, entries: list, status, closed: !!closedBy, closedBy };
    const closing = done.find((e) => CLOSING[s.key]?.includes(e.decision));
    if (closing && !closedBy) closedBy = { step: s, entry: closing };
    return step;
  });
  const next = steps.find((s) => s.role === 'Editor' && s.status !== 'done' && !s.closed) || null;
  return { steps, closedBy, next };
}

export function previousEditorStep(gate, entries) {
  if (gate <= 1) return null;
  const prevKey = `G${gate - 1}`;
  const done = entries.some((e) => e.step === prevKey && e.status === 'finished');
  return done ? null : STEPS.find((s) => s.key === prevKey);
}

export async function fetchSubmission(msid) {
  return api.get(`submissions/${msid}`);
}

// Start a stage. The server refuses repeats and checks the OJS assignment.
// Returns { check } or { conflict, message } or { closed, message } or { error }.
export async function startStep(store, { role, variant, gate, reviewId, journal, manuscript }) {
  const check = newCheck({ role, variant, gate, journal, manuscript, signature: store.signature, reviewId });
  return store.createCheck(check);
}

export function describeEntry(e) {
  const cl = e.check ? getChecklist(e.check.checklistId) : (e.checklistId ? getChecklist(e.checklistId) : null);
  const step = STEPS.find((s) => s.key === (e.step || (cl && stepKeyOf(cl))));
  return step ? `${step.name}${e.step === 'R' ? ` putaran ${e.round || 1}${e.code ? ` (${e.code})` : ''}` : ''}` : '';
}

export function ojsLink(store, journal, msid, role) {
  const base = store.me?.ojsUrl;
  const path = store.journals.find((j) => j.id === (journal?.id ?? journal))?.path;
  if (!base || !path || !msid) return '';
  if (role === 'Reviewer') return `${base}/${path}/reviewer/submission/${msid}`;
  if (role === 'Penulis') return `${base}/${path}/authorDashboard/submission/${msid}`;
  return `${base}/${path}/workflow/access/${msid}`;
}
