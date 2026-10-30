// Shared registry in a Google Sheet, reached through a Google Apps Script web
// app (see apps-script/Code.gs). It records which steps each manuscript has
// been through, so every browser can see the history and repeated steps are
// refused. Answers and signatures are never sent; only who, what and when.

import CONFIG from '../data/config.json';
import { getChecklist, stepKeyOf } from './checklists.js';

export function registryConfig(stored) {
  const url = (stored?.url ?? CONFIG.registryUrl ?? '').trim();
  const key = (stored?.key ?? CONFIG.registryKey ?? '').trim();
  // localhost is accepted so the registry can be tried against a local mock.
  return { url, key, enabled: /^https:\/\/script\.google(usercontent)?\.com\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) };
}

export function reviewerCode(check) {
  return String(check.code || check.fields?.['Kode reviewer'] || '').trim().toUpperCase();
}

export function rowFromCheck(check) {
  const step = stepKeyOf(check);
  return {
    id: check.id,
    parentId: check.parentId || '',
    journal: check.journal?.name || '',
    msid: String(check.manuscript?.id || ''),
    title: check.manuscript?.title || '',
    step,
    role: check.role,
    variant: check.variant || '',
    round: step === 'R' ? Number(check.round) || 1 : '',
    code: step === 'R' ? reviewerCode(check) : '',
    status: check.status,
    revision: check.revision || 1,
    decision: check.decision?.value || '',
    docId: check.docId || '',
    name: check.sign?.anon ? reviewerCode(check) : (check.sign?.name || ''),
    updatedAt: check.updatedAt || new Date().toISOString(),
    finishedAt: check.finishedAt || '',
  };
}

// Same rule as the Apps Script: one entry per manuscript and step
// (per round and reviewer code for peer review), revisions excepted.
export function uniqueKey(r) {
  const base = `${String(r.journal).trim().toLowerCase()}|${String(r.msid).trim()}|${r.step}`;
  return r.step === 'R' ? `${base}|${Number(r.round) || 1}|${String(r.code || '').toUpperCase()}` : base;
}

async function request(cfg, { params = {}, body = null, timeout = 12000 }) {
  const u = new URL(cfg.url);
  Object.entries({ ...params, key: cfg.key }).forEach(([k, v]) => v !== '' && v != null && u.searchParams.set(k, v));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(u.toString(), body
      ? { method: 'POST', body: JSON.stringify({ ...body, key: cfg.key }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal, redirect: 'follow' }
      : { method: 'GET', signal: ctrl.signal, redirect: 'follow' });
    const data = await res.json();
    return data;
  } catch (e) {
    return { ok: false, reason: 'network', message: e.name === 'AbortError' ? 'Spreadsheet tidak menjawab dalam 12 detik' : 'Spreadsheet tidak bisa dihubungi' };
  } finally {
    clearTimeout(t);
  }
}

export async function ping(cfg) {
  if (!cfg.enabled) return { ok: false, reason: 'config', message: 'URL Web App belum diisi atau tidak valid' };
  return request(cfg, { params: { action: 'ping' } });
}

export async function listRows(cfg, journal, msid) {
  if (!cfg.enabled) return { ok: true, rows: [], local: true };
  const r = await request(cfg, { params: { action: 'list', journal, msid } });
  if (!r.ok) return r;
  return { ok: true, rows: (r.rows || []).map((x) => ({ ...x, msid: String(x.msid), local: false })) };
}

export async function upsertCheck(cfg, check) {
  if (!cfg.enabled) return { ok: true, skipped: true };
  return request(cfg, { body: { action: 'upsert', row: rowFromCheck(check) } });
}

export function labelForRow(r) {
  const cl = r.checklistId ? getChecklist(r.checklistId) : null;
  return cl ? cl.title : r.step;
}
