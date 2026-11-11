import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { getChecklist, counts, stageOrder, VARIANTS } from '../lib/checklists.js';
import { exportSummaryPdf } from '../lib/actions.js';
import { entriesFor, pipeline, startStep, describeEntry, fetchSubmission, ojsLink } from '../lib/process.js';
import { DECISIONS } from '../lib/mail.js';
import { api } from '../lib/api.js';
import { href, go } from '../lib/router.js';
import { fmtDate, relDays, digitsOnly } from '../lib/format.js';
import { Icon } from '../components/Icons.jsx';
import { DeskIllustration } from '../components/Illustration.jsx';

function decisionLabelFor(step, value) {
  return DECISIONS[step]?.options.find((o) => o.value === value)?.id || value || '';
}

export function HistoryPage({ query }) {
  const store = useStore();
  const [search, setSearch] = useState('');
  const [lookId, setLookId] = useState('');

  const groups = useMemo(() => {
    const m = new Map();
    for (const c of store.checks) {
      const k = String(c.manuscript?.id || '');
      if (!m.has(k)) m.set(k, { key: k, journal: c.journal, msid: k, title: '', latest: '', count: 0, done: 0 });
      const g = m.get(k);
      g.count++; if (c.status === 'finished') g.done++;
      if (c.manuscript?.title && !g.title) g.title = c.manuscript.title;
      if ((c.updatedAt || '') > g.latest) g.latest = c.updatedAt;
    }
    return [...m.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [store.checks]);

  const q = search.trim().toLowerCase();
  const shown = groups.filter((g) => !q || `${g.msid} ${g.title} ${g.journal?.name}`.toLowerCase().includes(q));
  const selKey = query.naskah || shown[0]?.key;

  function lookup(e) {
    e.preventDefault();
    if (lookId) go('/riwayat', { naskah: lookId });
  }

  return (
    <>
      <section className="pane pane-list" aria-label="Naskah">
        <div className="list-head">
          <label className="search"><Icon name="search" size={16} /><input type="search" placeholder="Cari judul atau ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari naskah" /></label>
          <h2 className="list-title">Riwayat</h2>
          <p className="list-sub">{groups.length} naskah dengan pemeriksaan yang bisa Anda lihat</p>
        </div>
        {shown.map((g) => (
          <a key={g.key} className="card" href={href('/riwayat', { naskah: g.key })} aria-current={selKey === g.key ? 'true' : undefined}>
            <div className="card-top"><div className="card-title">{g.title || 'Tanpa judul'}</div><span className="idchip">#{g.msid}</span></div>
            <div className="card-body">{g.journal?.name}</div>
            <div className="card-foot"><span>{g.done}/{g.count} selesai</span><span className="accent">{relDays(g.latest)}</span></div>
          </a>
        ))}
        <form className="card off" onSubmit={lookup} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="card-title" style={{ color: 'var(--ink)' }}>Buka ID submission</div>
          <div className="card-body" style={{ margin: 0 }}>Lihat tahapan satu naskah di OJS, termasuk yang belum punya pemeriksaan.</div>
          <div className="copyline">
            <input className="input" inputMode="numeric" placeholder="ID, misalnya 1010" value={lookId} onChange={(e) => setLookId(digitsOnly(e.target.value))} aria-label="ID submission" />
            <button type="submit" className="btn" disabled={!lookId}>Buka</button>
          </div>
        </form>
      </section>

      <section className="pane pane-detail" aria-label="Detail naskah">
        {!selKey ? (
          <div className="empty-state">
            <DeskIllustration width={280} />
            <h3>Riwayat masih kosong</h3>
            <p>Setiap pemeriksaan yang Anda mulai, atau yang bisa Anda lihat sebagai editor, muncul di sini per ID submission.</p>
            <a className="btn primary" href={href('/')} style={{ marginTop: 8 }}>Mulai pemeriksaan</a>
          </div>
        ) : <ManuscriptDetail key={selKey} msid={selKey} />}
      </section>
    </>
  );
}

function ManuscriptDetail({ msid }) {
  const store = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const refresh = useCallback(async () => {
    setError('');
    try { setData(await fetchSubmission(msid)); } catch (e) { setError(e.message); }
  }, [msid]);
  useEffect(() => { refresh(); }, [refresh, store.checks.length]);

  if (error) {
    return (
      <div className="empty-state">
        <DeskIllustration width={240} />
        <h3>ID {msid} tidak bisa dibuka</h3>
        <p>{error}</p>
      </div>
    );
  }
  if (!data) return <div className="doc" aria-busy="true"><p className="lede" style={{ marginTop: 40 }}>Memuat dari OJS…</p></div>;

  const sub = data.submission;
  const isEditor = data.access.editor;
  const entries = entriesFor(store.checks, data.entries);
  const { steps, closedBy, next } = pipeline(entries);
  const finished = entries.filter((e) => e.status === 'finished' && e.check).map((e) => e.check);
  const variant = entries.find((e) => e.variant)?.variant || 'emp';
  const journal = store.journals.find((j) => j.id === sub.journalId) || { id: sub.journalId, name: '' };
  const list = entries.slice().sort((a, b) => stageOrder({ ...a, checklistId: a.checklistId }) - stageOrder({ ...b, checklistId: b.checklistId }) || (Number(a.revision) || 1) - (Number(b.revision) || 1));
  const ojs = ojsLink(store, journal, sub.id, isEditor ? 'Editor' : data.access.author ? 'Penulis' : 'Reviewer');
  const reviewsActive = data.reviews.filter((r) => r.code);

  async function continueNext() {
    setProblem(null);
    const draft = next.entries.find((e) => e.status !== 'finished');
    if (draft) {
      if (draft.mine) { go(`/cek/${draft.id}`); return; }
      setProblem(`${next.name} sedang dikerjakan${draft.name ? ` oleh ${draft.name}` : ''} sejak ${relDays(draft.updatedAt)}.`);
      return;
    }
    setBusy(true);
    const r = await startStep(store, { role: 'Editor', variant, gate: next.gate, journal, manuscript: { id: sub.id, title: sub.title } });
    setBusy(false);
    if (r.check) { store.setSettings({ role: 'Editor' }); go(`/cek/${r.check.id}`); return; }
    setProblem(r.message || r.error);
    refresh();
  }

  async function summary() {
    setBusy(true);
    try {
      const full = await Promise.all(finished.map((c) => (c.partial ? store.loadFull(c.id) : c)));
      await exportSummaryPdf(full);
      store.notify('Ringkasan naskah diunduh.', 'ok');
    } catch (ex) { store.notify(`PDF gagal dibuat: ${ex.message}`, 'bad'); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="topbar"><div className="left">
        <span className="sync ok">OJS: {sub.stage} · {sub.status}</span>
        <button type="button" className="text-btn" onClick={refresh}>Muat ulang</button>
      </div><div className="right">
        {ojs && <a className="text-btn" href={ojs} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Buka di OJS</a>}
        {isEditor && <a className="text-btn" href={href('/', { naskah: sub.id })} style={{ textDecoration: 'none' }}>Checklist baru untuk naskah ini</a>}
      </div></div>
      <div className="doc">
        <div className="gutter-row" style={{ marginTop: 12 }}>
          <span className="marker">Naskah</span>
          <h1 className="h1">{sub.title || 'Tanpa judul'}<span className="idchip" title="ID submission">#{sub.id}</span></h1>
        </div>
        <div className="gutter-row"><span /><div>
          <div className="tags"><span>{journal.name}</span><span>{VARIANTS.find((v) => v.id === variant)?.short}</span></div>
          {sub.authors?.length > 0 && <p className="lede" style={{ marginTop: 6 }}>{sub.authors.join(', ')}</p>}
        </div></div>

        {isEditor && (
          <>
            <div className="gutter-row" style={{ marginTop: 30 }}>
              <span className="marker">Proses</span>
              <h2 className="h3">Tahapan naskah</h2>
            </div>
            <ol className="process" aria-label="Tahapan naskah">
              {steps.map((s, i) => {
                const done = s.entries.filter((e) => e.status === 'finished');
                const last = done[done.length - 1];
                const isNext = next?.key === s.key && !closedBy;
                const isReject = last && last.decision === 'reject';
                let st = 'Belum';
                if (s.closed) st = 'Tidak dilanjutkan';
                else if (s.key === 'R') st = s.entries.length ? `${done.length} dari ${Math.max(reviewsActive.length, s.entries.length)} selesai` : reviewsActive.length ? `${reviewsActive.length} reviewer di OJS` : 'Belum ada';
                else if (s.status === 'done') st = `Selesai · ${decisionLabelFor(s.key, last.decision)}`;
                else if (s.status === 'draft') st = 'Sedang dikerjakan';
                return (
                  <li key={s.key} className={`proc ${s.closed ? 'closed' : s.status}${isNext ? ' next' : ''}${isReject ? ' reject' : ''}`}>
                    <span className="n">{i + 1} · {s.role}</span>
                    <b>{s.name}</b>
                    <small>{s.id}</small>
                    <span className="st">{st}</span>
                  </li>
                );
              })}
            </ol>
            {closedBy ? (
              <div className="notice bad"><b>Proses berhenti di {closedBy.step.name}: {decisionLabelFor(closedBy.step.key, closedBy.entry.decision)}</b>
                <span>Tahap berikutnya tidak bisa dimulai untuk ID {sub.id}. Bila keputusan berubah, revisi pemeriksaan {closedBy.step.name}.</span></div>
            ) : next ? (
              <div className="next-row">
                <button type="button" className="btn primary" disabled={busy} onClick={continueNext}>
                  <Icon name="arrowR" size={16} />{busy ? 'Memeriksa…' : next.status === 'draft' ? `Lanjutkan ${next.name}` : `Mulai ${next.name}`}
                </button>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  {next.key === 'G2' && !steps[1].entries.some((e) => e.status === 'finished')
                    ? (reviewsActive.length ? 'Reviewer mengisi checklist setelah masuk dengan akun OJS mereka.' : 'Belum ada reviewer. Tugaskan reviewer di OJS seperti biasa.')
                    : `Tahap editor berikutnya untuk ID ${sub.id}.`}
                </span>
              </div>
            ) : (
              <div className="notice"><b>Semua tahap editor sudah selesai.</b></div>
            )}
            {problem && <div className="notice bad"><span>{problem}</span></div>}
            {reviewsActive.length > 0 && (
              <p className="meta-line" style={{ marginLeft: 56 }}>Reviewer di OJS: {data.reviews.map((r) => `${r.code || '–'} ${r.name} (putaran ${r.round}, ${r.state})`).join(' · ')}</p>
            )}
          </>
        )}

        <div className="gutter-row" style={{ marginTop: 34 }}>
          <span className="marker">{list.length}</span>
          <h2 className="h3">{isEditor ? 'Pemeriksaan tercatat' : 'Pemeriksaan Anda'}</h2>
        </div>
        <ol className="timeline">
          {list.length === 0 && <li className="tl"><span /><div className="meta">Belum ada pemeriksaan untuk ID ini.</div></li>}
          {list.map((e) => {
            const c = e.check;
            const fin = e.status === 'finished';
            const n = c ? counts(getChecklist(c.checklistId), c) : null;
            return (
              <li className="tl" key={e.id}>
                <span className={`ring ${fin ? 'done' : 'part'}`} style={{ marginTop: 5 }} aria-hidden="true" />
                <div>
                  <a href={href(`/cek/${e.id}`)} style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>{describeEntry(e)}{Number(e.revision) > 1 ? ` · revisi ${e.revision}` : ''}</a>
                  <div className="meta">
                    {fin ? `Selesai ${fmtDate(e.finishedAt)}` : `Draf, diubah ${relDays(e.updatedAt)}`}
                    {' · '}{e.name || 'tanpa nama'}{e.mine ? ' (Anda)' : ''}
                    {e.decision ? ` · ${decisionLabelFor(e.step, e.decision)}` : ''}
                    {n ? ` · ${n.m} M, ${n.tm} TM` : ''}
                    {fin && e.docId && <> · ID <span className="mono">{e.docId}</span></>}
                  </div>
                </div>
                <div className="tl-actions">
                  {fin && e.hasPdf && <a className="btn" href={api.url(`checks/${e.id}/pdf`)}><Icon name="download" size={16} />PDF</a>}
                  {!fin && (e.mine || isEditor) && <DeleteButton id={e.id} mine={e.mine} onDone={refresh} />}
                </div>
              </li>
            );
          })}
        </ol>
        {finished.length > 0 && (
          <div className="actions" style={{ margin: '20px 0 0 56px' }}>
            <button type="button" className="btn" disabled={busy} onClick={summary}>
              <Icon name="download" size={16} />Ekspor ringkasan naskah
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{finished.length} pemeriksaan selesai digabung dalam satu PDF, urut dari Preliminary.</span>
          </div>
        )}
      </div>
    </>
  );
}

function DeleteButton({ id, mine, onDone }) {
  const store = useStore();
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className="icon-btn" title="Hapus draf" onClick={() => setAsk(true)}><Icon name="trash" size={16} /></button>;
  return (
    <span className="inline-confirm" style={{ padding: '6px 10px' }}>
      {mine ? 'Hapus draf ini? Tahap ini bisa dimulai lagi setelahnya.' : 'Hapus draf milik pemeriksa lain? Tahap ini lalu bisa dimulai orang lain.'}
      <button type="button" className="btn danger" style={{ minHeight: 34 }} onClick={async () => {
        try { await store.deleteCheck(id); store.notify('Draf dihapus.'); onDone(); } catch (e) { store.notify(e.message, 'bad'); }
      }}>Hapus</button>
      <button type="button" className="btn ghost" style={{ minHeight: 34 }} onClick={() => setAsk(false)}>Batal</button>
    </span>
  );
}
