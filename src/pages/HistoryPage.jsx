import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { getChecklist, counts, stageOrder, VARIANTS } from '../lib/checklists.js';
import { exportCheckPdf, exportSummaryPdf, exportCheckFile, readJsonFile, importCheckData } from '../lib/actions.js';
import { entriesFor, pipeline, startStep, syncCheck, describeEntry } from '../lib/process.js';
import { listRows } from '../lib/registry.js';
import { DECISIONS } from '../lib/mail.js';
import { href, go } from '../lib/router.js';
import { fmtDate, relDays, digitsOnly, fmtDateTime } from '../lib/format.js';
import { Icon } from '../components/Icons.jsx';
import { DeskIllustration } from '../components/Illustration.jsx';
import { LinkPanel } from '../components/LinkPanel.jsx';

const keyOf = (journal, msid) => `${journal || ''}|${msid || ''}`;

function decisionLabelFor(step, value) {
  return DECISIONS[step]?.options.find((o) => o.value === value)?.id || value || '';
}

export function HistoryPage({ query }) {
  const store = useStore();
  const [search, setSearch] = useState('');
  const [lookJournal, setLookJournal] = useState(store.settings.journalId || store.journals[0]?.id);
  const [lookId, setLookId] = useState('');
  const fileRef = useRef(null);

  const groups = useMemo(() => {
    const m = new Map();
    for (const c of store.checks) {
      const k = keyOf(c.journal?.name, c.manuscript?.id);
      if (!m.has(k)) m.set(k, { key: k, journal: c.journal, msid: c.manuscript?.id, title: '', latest: '', count: 0, done: 0 });
      const g = m.get(k);
      g.count++; if (c.status === 'finished') g.done++;
      if (c.manuscript?.title && !g.title) g.title = c.manuscript.title;
      if ((c.updatedAt || '') > g.latest) g.latest = c.updatedAt;
    }
    return [...m.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [store.checks]);

  const q = search.trim().toLowerCase();
  const shown = groups.filter((g) => !q || `${g.msid} ${g.title} ${g.journal?.name}`.toLowerCase().includes(q));
  let sel = groups.find((g) => g.key === query.naskah);
  if (!sel && query.naskah) {
    const [jname, msid] = query.naskah.split('|');
    const j = store.journals.find((x) => x.name === jname) || { name: jname };
    sel = { key: query.naskah, journal: j, msid, title: '', virtual: true };
  }
  if (!sel) sel = shown[0];

  async function onImport(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const { check, verified } = importCheckData(await readJsonFile(file));
      store.saveCheck({ ...check });
      if (verified === true) store.notify(`Berkas dibuka. ID dokumen cocok: ${check.docId}.`, 'ok');
      else if (verified === false) store.notify('Berkas dibuka, tetapi ID dokumen tidak cocok. Isian berubah setelah PDF dibuat.', 'bad');
      else store.notify('Draf dibuka dan bisa dilanjutkan.');
      go(`/cek/${check.id}`);
    } catch (ex) {
      store.notify(`Berkas tidak bisa dibuka: ${ex.message}.`, 'bad');
    }
  }

  function lookup(e) {
    e.preventDefault();
    const j = store.journals.find((x) => x.id === lookJournal);
    if (!j || !lookId) return;
    go('/riwayat', { naskah: keyOf(j.name, lookId) });
  }

  return (
    <>
      <section className="pane pane-list" aria-label="Naskah">
        <div className="list-head">
          <label className="search"><Icon name="search" size={16} /><input type="search" placeholder="Cari judul atau ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari naskah" /></label>
          <h2 className="list-title">Riwayat</h2>
          <p className="list-sub">{groups.length} naskah di peramban ini{store.registry.enabled ? ' · spreadsheet terhubung' : ''}</p>
        </div>
        {shown.map((g) => (
          <a key={g.key} className="card" href={href('/riwayat', { naskah: g.key })} aria-current={sel?.key === g.key ? 'true' : undefined}>
            <div className="card-top"><div className="card-title">{g.title || 'Tanpa judul'}</div><span className="idchip">#{g.msid}</span></div>
            <div className="card-body">{g.journal?.name}</div>
            <div className="card-foot"><span>{g.done}/{g.count} selesai</span><span className="accent">{relDays(g.latest)}</span></div>
          </a>
        ))}
        <form className="card off" onSubmit={lookup} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="card-title" style={{ color: 'var(--ink)' }}>Buka ID submission</div>
          <div className="card-body" style={{ margin: 0 }}>{store.registry.enabled ? 'Lihat riwayat naskah dari spreadsheet, termasuk tahap yang dikerjakan di perangkat lain.' : 'Lihat riwayat satu naskah di peramban ini.'}</div>
          <select className="input" value={lookJournal} onChange={(e) => setLookJournal(e.target.value)} aria-label="Jurnal">
            {store.journals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <div className="copyline">
            <input className="input" inputMode="numeric" placeholder="ID, misalnya 1010" value={lookId} onChange={(e) => setLookId(digitsOnly(e.target.value))} aria-label="ID submission" />
            <button type="submit" className="btn" disabled={!lookId}>Buka</button>
          </div>
        </form>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="file" size={16} />Buka berkas isian</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImport} />
      </section>

      <section className="pane pane-detail" aria-label="Detail naskah">
        {!sel ? (
          <div className="empty-state">
            <DeskIllustration width={280} />
            <h3>Riwayat masih kosong</h3>
            <p>Setiap pemeriksaan yang dimulai di peramban ini akan muncul di sini, dikelompokkan per ID submission.</p>
            <a className="btn primary" href={href('/')} style={{ marginTop: 8 }}>Mulai pemeriksaan</a>
          </div>
        ) : <ManuscriptDetail key={sel.key} g={sel} />}
      </section>
    </>
  );
}

function ManuscriptDetail({ g }) {
  const store = useStore();
  const [showLink, setShowLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remoteState, setRemoteState] = useState(store.registry.enabled ? 'loading' : 'off');
  const [problem, setProblem] = useState(null);
  const jname = g.journal?.name || '';
  const cached = store.remoteFor(jname, g.msid);

  async function refresh() {
    if (!store.registry.enabled) return;
    setRemoteState('loading');
    const r = await listRows(store.registry, jname, g.msid);
    if (r.ok) { store.setRemote(jname, g.msid, r.rows); setRemoteState('ok'); } else setRemoteState('error');
  }
  useEffect(() => { refresh(); }, [g.key, store.registry.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = entriesFor(store.checks, cached?.rows || [], jname, g.msid);
  const { steps, closedBy, next } = pipeline(entries);
  const local = entries.filter((e) => e.local).map((e) => e.check);
  const finished = local.filter((c) => c.status === 'finished');
  const title = g.title || entries.find((e) => e.title)?.title || '';
  const variant = entries.find((e) => e.variant)?.variant || local[0]?.variant || 'emp';
  const anyCheck = local[0] || { journal: g.journal, manuscript: { id: g.msid, title }, variant, role: 'Editor' };
  const list = entries.slice().sort((a, b) => stageOrder(a) - stageOrder(b) || (Number(a.revision) || 1) - (Number(b.revision) || 1));

  async function continueNext() {
    setProblem(null);
    const draft = next.entries.find((e) => e.status !== 'finished');
    if (draft?.local) { go(`/cek/${draft.check.id}`); return; }
    if (draft && !draft.local) { setProblem(`${next.name} sedang dikerjakan${draft.name ? ` oleh ${draft.name}` : ''} di perangkat lain sejak ${relDays(draft.updatedAt)}.`); return; }
    setBusy(true);
    const journal = store.journals.find((j) => j.name === jname) || { id: g.journal?.id, name: jname };
    const r = await startStep(store, { role: 'Editor', variant, gate: next.gate, journal, manuscript: { id: g.msid, title } });
    setBusy(false);
    if (r.conflict) { setProblem(`${describeEntry(r.conflict)} sudah tercatat${r.conflict.name ? ` oleh ${r.conflict.name}` : ''}. Muat ulang riwayat untuk melihatnya.`); refresh(); return; }
    if (r.error) { setProblem(`${r.error}. Coba lagi, atau mulai dari halaman Checklist baru.`); return; }
    store.setSettings({ role: 'Editor' });
    go(`/cek/${r.check.id}`);
  }

  async function summary() {
    setBusy(true);
    try { await exportSummaryPdf(finished); store.notify('Ringkasan naskah diunduh.', 'ok'); }
    catch (ex) { store.notify(`PDF gagal dibuat: ${ex.message}`, 'bad'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="topbar"><div className="left">
        {store.registry.enabled && (
          <span className={`sync ${remoteState === 'ok' ? 'ok' : 'no'}`}>
            {remoteState === 'loading' ? 'Memuat dari spreadsheet…' : remoteState === 'ok' ? `Tersinkron dengan spreadsheet${cached?.at ? `, ${fmtDateTime(new Date(cached.at).toISOString()).split(', ')[1]}` : ''}` : 'Spreadsheet tidak bisa dihubungi'}
          </span>
        )}
        {store.registry.enabled && <button type="button" className="text-btn" onClick={refresh}>Muat ulang</button>}
      </div><div className="right">
        <button type="button" className="text-btn" onClick={() => setShowLink((v) => !v)} aria-expanded={showLink}>Buat tautan</button>
        <a className="text-btn" href={href('/', { naskah: g.msid, judul: title, jurnal: g.journal?.id || '', jenis: variant })} style={{ textDecoration: 'none' }}>Checklist baru untuk naskah ini</a>
      </div></div>
      <div className="doc">
        <div className="gutter-row" style={{ marginTop: 12 }}>
          <span className="marker">Naskah</span>
          <h1 className="h1">{title || 'Tanpa judul'}<span className="idchip" title="ID submission">#{g.msid}</span></h1>
        </div>
        <div className="gutter-row"><span /><div className="tags"><span>{jname}</span><span>{VARIANTS.find((v) => v.id === variant)?.short}</span></div></div>
        {showLink && <LinkPanel check={anyCheck} onClose={() => setShowLink(false)} />}

        <div className="gutter-row" style={{ marginTop: 30 }}>
          <span className="marker">Proses</span>
          <h2 className="h3">Tahapan naskah</h2>
        </div>
        <ol className="process" aria-label="Tahapan naskah">
          {steps.map((s, i) => {
            const done = s.entries.filter((e) => e.status === 'finished');
            const last = done[done.length - 1];
            const isNext = next?.key === s.key && !closedBy;
            const isReject = last && ['reject'].includes(last.decision);
            let st = 'Belum';
            if (s.closed) st = 'Tidak dilanjutkan';
            else if (s.key === 'R') st = s.entries.length ? `${done.length} selesai${s.entries.length > done.length ? `, ${s.entries.length - done.length} draf` : ''}` : 'Belum ada';
            else if (s.status === 'done') st = `Selesai · ${decisionLabelFor(s.key, last.decision)}`;
            else if (s.status === 'draft') st = 'Sedang dikerjakan';
            return (
              <li key={s.key} className={`proc ${s.closed ? 'closed' : s.status}${isNext ? ' next' : ''}${isReject ? ' reject' : ''}`}>
                <span className="n">{i + 1} · {s.role === 'Penulis' ? 'Penulis' : s.role}</span>
                <b>{s.name}</b>
                <small>{s.id}</small>
                <span className="st">{st}</span>
              </li>
            );
          })}
        </ol>
        {closedBy ? (
          <div className="notice bad"><b>Proses berhenti di {closedBy.step.name}: {decisionLabelFor(closedBy.step.key, closedBy.entry.decision)}</b>
            <span>Tahap berikutnya tidak bisa dimulai untuk ID {g.msid}. Bila keputusan berubah, revisi pemeriksaan {closedBy.step.name}.</span></div>
        ) : next ? (
          <div className="next-row">
            <button type="button" className="btn primary" disabled={busy} onClick={continueNext}>
              <Icon name="arrowR" size={16} />{busy ? 'Memeriksa…' : next.status === 'draft' ? `Lanjutkan ${next.name}` : `Mulai ${next.name}`}
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {next.key === 'G2' && !steps[1].entries.some((e) => e.status === 'finished') ? 'Belum ada hasil peer review yang tercatat. Kirim tautan reviewer lewat Buat tautan.' : `Tahap editor berikutnya untuk ID ${g.msid}.`}
            </span>
          </div>
        ) : (
          <div className="notice"><b>Semua tahap editor sudah selesai.</b></div>
        )}
        {problem && <div className="notice bad"><span>{problem}</span></div>}

        <div className="gutter-row" style={{ marginTop: 34 }}>
          <span className="marker">{list.length}</span>
          <h2 className="h3">Pemeriksaan tercatat</h2>
        </div>
        <ol className="timeline">
          {list.length === 0 && <li className="tl"><span /><div className="meta">Belum ada pemeriksaan untuk ID ini{store.registry.enabled ? ' di peramban ini maupun di spreadsheet' : ' di peramban ini'}.</div></li>}
          {list.map((e) => {
            const c = e.check;
            const fin = e.status === 'finished';
            const n = c ? counts(getChecklist(c.checklistId), c) : null;
            return (
              <li className="tl" key={e.id}>
                <span className={`ring ${fin ? 'done' : 'part'}`} style={{ marginTop: 5 }} aria-hidden="true" />
                <div>
                  {c ? (
                    <a href={href(`/cek/${c.id}`)} style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>{describeEntry(e)}{Number(e.revision) > 1 ? ` · revisi ${e.revision}` : ''}</a>
                  ) : (
                    <span style={{ fontWeight: 600 }}>{describeEntry(e)}{Number(e.revision) > 1 ? ` · revisi ${e.revision}` : ''}</span>
                  )}
                  <div className="meta">
                    {fin ? `Selesai ${fmtDate(e.finishedAt)}` : `Draf, diubah ${relDays(e.updatedAt)}`}
                    {' · '}{e.name || 'tanpa nama'}
                    {e.decision ? ` · ${decisionLabelFor(e.step, e.decision)}` : ''}
                    {n ? ` · ${n.m} M, ${n.tm} TM` : ''}
                    {fin && e.docId && <> · ID <span className="mono">{e.docId}</span></>}
                    {!e.local && ' · dari spreadsheet'}
                  </div>
                </div>
                <div className="tl-actions">
                  {c && fin && <button type="button" className="btn" onClick={() => exportCheckPdf(c)}><Icon name="download" size={16} />PDF</button>}
                  {c && <button type="button" className="btn ghost" onClick={() => exportCheckFile(c)}>Berkas isian</button>}
                  {c && store.registry.enabled && c.synced === false && <button type="button" className="btn ghost" onClick={async () => { const u = await syncCheck(store, c); store.notify(u.ok ? 'Tercatat di spreadsheet.' : (u.message || 'Belum bisa dicatat.'), u.ok ? 'ok' : 'bad'); refresh(); }}>Catat ke spreadsheet</button>}
                  {c && <DeleteButton check={c} />}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="actions" style={{ margin: '20px 0 0 56px' }}>
          <button type="button" className="btn" disabled={!finished.length || busy} onClick={summary}>
            <Icon name="download" size={16} />Ekspor ringkasan naskah
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{finished.length ? `${finished.length} pemeriksaan selesai di peramban ini digabung dalam satu PDF, urut dari Preliminary.` : 'Ringkasan tersedia setelah ada pemeriksaan selesai di peramban ini.'}</span>
        </div>
      </div>
    </>
  );
}

function DeleteButton({ check }) {
  const store = useStore();
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className="icon-btn" title="Hapus dari peramban ini" onClick={() => setAsk(true)}><Icon name="trash" size={16} /></button>;
  return (
    <span className="inline-confirm" style={{ padding: '6px 10px' }}>
      Hapus dari peramban ini? Catatan di spreadsheet tidak ikut terhapus.
      <button type="button" className="btn danger" style={{ minHeight: 34 }} onClick={() => { store.deleteCheck(check.id); store.notify('Pemeriksaan dihapus dari peramban ini.'); }}>Hapus</button>
      <button type="button" className="btn ghost" style={{ minHeight: 34 }} onClick={() => setAsk(false)}>Batal</button>
    </span>
  );
}

