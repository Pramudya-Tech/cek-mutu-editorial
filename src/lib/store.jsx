import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
const PREFS = 'cek-mutu-prefs';

function readPrefs(uid) {
  try { return JSON.parse(localStorage.getItem(`${PREFS}-${uid}`) || '{}'); } catch { return {}; }
}
function writePrefs(uid, v) {
  try { localStorage.setItem(`${PREFS}-${uid}`, JSON.stringify(v)); } catch { /* private mode */ }
}

// All data lives on the server. Drafts are saved shortly after each change;
// the list keeps the last known state so pages render immediately.
export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [checks, setChecks] = useState([]);
  const [journals, setJournals] = useState([]);
  const [signature, setSignatureState] = useState(null);
  const [settings, setSettingsState] = useState({ role: 'Editor', variant: 'emp', journalId: null });
  const [saveState, setSaveState] = useState({});
  const [toast, setToast] = useState(null);
  const [bootError, setBootError] = useState('');
  const timers = useRef({});
  const pending = useRef({});

  const notify = useCallback((text, tone = 'info') => setToast({ text, tone, at: Date.now() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4800);
    return () => clearTimeout(t);
  }, [toast]);

  const loadChecks = useCallback(async () => {
    const r = await api.get('checks');
    setChecks(r.checks);
    return r.checks;
  }, []);

  const accept = useCallback(async (data) => {
    setMe({ user: data.user, roles: data.roles, isAdmin: data.isAdmin, ojsUrl: data.ojsUrl });
    setJournals(data.journals);
    setSignatureState(data.signature);
    const prefs = readPrefs(data.user.id);
    const role = data.roles.includes(prefs.role) ? prefs.role : data.roles[0] || 'Editor';
    const editorJournals = data.journals.filter((j) => j.isEditor);
    const journalId = (editorJournals.find((j) => j.id === prefs.journalId) || editorJournals[0] || data.journals[0])?.id || null;
    setSettingsState({ variant: 'emp', ...prefs, role, journalId });
    await loadChecks();
  }, [loadChecks]);

  useEffect(() => {
    (async () => {
      try { await accept(await api.get('me')); } catch (e) {
        if (e.status !== 401) setBootError(e.message);
        setMe(null);
      }
      setReady(true);
    })();
  }, [accept]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('login', { username, password });
    await accept(data);
    location.hash = '#/';
  }, [accept]);

  const logout = useCallback(async () => {
    try { await api.post('logout'); } catch { /* already out */ }
    setMe(null); setChecks([]); setJournals([]); setSignatureState(null);
    location.hash = '#/';
  }, []);

  const replace = useCallback((check) => {
    setChecks((list) => {
      const i = list.findIndex((c) => c.id === check.id);
      if (i < 0) return [...list, check];
      const copy = list.slice(); copy[i] = check; return copy;
    });
  }, []);

  const flush = useCallback(async (id) => {
    const next = pending.current[id];
    if (!next) return;
    delete pending.current[id];
    setSaveState((s) => ({ ...s, [id]: 'saving' }));
    try {
      await api.put(`checks/${id}`, { check: next });
      setSaveState((s) => ({ ...s, [id]: pending.current[id] ? 'saving' : 'saved' }));
    } catch (e) {
      setSaveState((s) => ({ ...s, [id]: 'error' }));
      notify(`Perubahan belum tersimpan: ${e.message}`, 'bad');
    }
  }, [notify]);

  // Local update now, server save a moment later.
  const saveCheck = useCallback((check) => {
    const next = { ...check, updatedAt: new Date().toISOString() };
    replace(next);
    if (next.mine && next.status === 'draft') {
      pending.current[next.id] = next;
      setSaveState((s) => ({ ...s, [next.id]: 'saving' }));
      clearTimeout(timers.current[next.id]);
      timers.current[next.id] = setTimeout(() => flush(next.id), 600);
    }
    return next;
  }, [replace, flush]);

  const flushAll = useCallback(async () => {
    await Promise.all(Object.keys(pending.current).map((id) => { clearTimeout(timers.current[id]); return flush(id); }));
  }, [flush]);
  useEffect(() => {
    const warn = (e) => { if (Object.keys(pending.current).length) { flushAll(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flushAll]);

  // Returns { check } or { conflict, message } or { closed, message } or { error }.
  const createCheck = useCallback(async (check) => {
    try {
      const r = await api.post('checks', { check });
      replace(r.check);
      return { check: r.check };
    } catch (e) {
      if (e.status === 409) return { conflict: e.data.conflict || null, closed: e.data.closed || null, message: e.message };
      return { error: e.message };
    }
  }, [replace]);

  const finishCheck = useCallback(async (check) => {
    clearTimeout(timers.current[check.id]);
    delete pending.current[check.id];
    const r = await api.post(`checks/${check.id}/finish`, { check, docId: check.docId });
    replace(r.check);
    return r.check;
  }, [replace]);

  const uploadPdf = useCallback(async (id, blob, name) => {
    await api.upload(`checks/${id}/pdf?name=${encodeURIComponent(name)}`, new Blob([blob], { type: 'application/pdf' }));
    setChecks((list) => list.map((c) => (c.id === id ? { ...c, hasPdf: true } : c)));
  }, []);

  const loadFull = useCallback(async (id) => {
    const r = await api.get(`checks/${id}`);
    replace(r.check);
    return r.check;
  }, [replace]);

  const deleteCheck = useCallback(async (id) => {
    clearTimeout(timers.current[id]);
    delete pending.current[id];
    await api.del(`checks/${id}`);
    setChecks((list) => list.filter((c) => c.id !== id));
  }, []);

  const setSettings = useCallback((patch) => {
    setSettingsState((s) => {
      const n = { ...s, ...patch };
      if (me) writePrefs(me.user.id, { role: n.role, variant: n.variant, journalId: n.journalId });
      return n;
    });
  }, [me]);

  const setSignature = useCallback(async (sig) => {
    const r = await api.put('signature', { signature: sig });
    setSignatureState(r.signature);
  }, []);

  const saveJournal = useCallback(async (j) => {
    const r = await api.put(`journals/${j.id}`, { abbr: j.abbr, sinta: j.sinta, citation: j.citation });
    setJournals(r.journals);
  }, []);

  const value = useMemo(() => ({
    ready, me, bootError, login, logout, checks, loadChecks, saveCheck, saveState, createCheck, finishCheck,
    uploadPdf, loadFull, deleteCheck, flushAll, settings, setSettings, signature, setSignature, journals,
    saveJournal, toast, notify,
  }), [ready, me, bootError, login, logout, checks, loadChecks, saveCheck, saveState, createCheck, finishCheck,
    uploadPdf, loadFull, deleteCheck, flushAll, settings, setSettings, signature, setSignature, journals,
    saveJournal, toast, notify]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
