import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { db } from './db.js';
import JOURNALS from '../data/journals.json';
import { registryConfig } from './registry.js';

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [checks, setChecks] = useState([]);
  const [settings, setSettingsState] = useState({ role: 'Editor', variant: 'emp', journalId: JOURNALS[0]?.id });
  const [signature, setSignatureState] = useState(null);
  const [customJournals, setCustomJournals] = useState([]);
  const [toast, setToast] = useState(null);
  const [registryStored, setRegistryStored] = useState(null);
  const [remote, setRemoteState] = useState({});
  const timers = useRef({});

  useEffect(() => {
    (async () => {
      const [all, st, sig, cj, reg] = await Promise.all([
        db.allChecks(), db.get('settings', null), db.get('signature', null), db.get('journals', []), db.get('registry', null),
      ]);
      setRegistryStored(reg);
      setChecks(all);
      if (st) setSettingsState((s) => ({ ...s, ...st }));
      setSignatureState(sig);
      setCustomJournals(cj || []);
      setReady(true);
    })();
  }, []);

  const saveCheck = useCallback((check) => {
    const next = { ...check, updatedAt: new Date().toISOString() };
    setChecks((list) => {
      const i = list.findIndex((c) => c.id === next.id);
      if (i < 0) return [...list, next];
      const copy = list.slice(); copy[i] = next; return copy;
    });
    clearTimeout(timers.current[next.id]);
    timers.current[next.id] = setTimeout(() => db.putCheck(next), 250);
    return next;
  }, []);

  const deleteCheck = useCallback((id) => {
    setChecks((list) => list.filter((c) => c.id !== id));
    db.deleteCheck(id);
  }, []);

  const setSettings = useCallback((patch) => {
    setSettingsState((s) => { const n = { ...s, ...patch }; db.set('settings', n); return n; });
  }, []);

  const setSignature = useCallback((sig) => { setSignatureState(sig); db.set('signature', sig); }, []);

  const journals = useMemo(() => [...JOURNALS.map((j) => ({ ...j, builtIn: true })), ...customJournals], [customJournals]);
  const saveJournal = useCallback((j) => {
    setCustomJournals((list) => {
      const i = list.findIndex((x) => x.id === j.id);
      const n = i < 0 ? [...list, j] : list.map((x) => (x.id === j.id ? j : x));
      db.set('journals', n); return n;
    });
  }, []);
  const deleteJournal = useCallback((id) => {
    setCustomJournals((list) => { const n = list.filter((x) => x.id !== id); db.set('journals', n); return n; });
  }, []);

  const notify = useCallback((text, tone = 'info') => {
    setToast({ text, tone, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4800);
    return () => clearTimeout(t);
  }, [toast]);

  const clearEverything = useCallback(async () => {
    await db.clearAll();
    setChecks([]); setSignatureState(null); setCustomJournals([]);
    setSettingsState({ role: 'Editor', variant: 'emp', journalId: JOURNALS[0]?.id });
  }, []);

  const registry = useMemo(() => registryConfig(registryStored), [registryStored]);
  const setRegistry = useCallback((cfg) => { setRegistryStored(cfg); db.set('registry', cfg); }, []);
  const setRemote = useCallback((journal, msid, rows) => {
    setRemoteState((m) => ({ ...m, [`${String(journal).trim().toLowerCase()}|${msid}`]: { rows, at: Date.now() } }));
  }, []);
  const remoteFor = useCallback((journal, msid) => remote[`${String(journal).trim().toLowerCase()}|${msid}`], [remote]);

  const value = {
    ready, checks, saveCheck, deleteCheck, settings, setSettings, signature, setSignature,
    journals, saveJournal, deleteJournal, toast, notify, clearEverything,
    registry, registryStored, setRegistry, setRemote, remoteFor,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
