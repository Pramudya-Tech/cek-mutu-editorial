import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { GATES, VARIANTS, findChecklist, checklistLabel, getChecklist, counts, STEPS } from '../lib/checklists.js';
import { startStep, describeEntry } from '../lib/process.js';
import { api } from '../lib/api.js';
import { go, href } from '../lib/router.js';
import { relDays, fmtDate, daysUntil } from '../lib/format.js';
import { Icon } from '../components/Icons.jsx';

const STEP_NAME = Object.fromEntries(STEPS.map((s) => [s.key, s.name]));

function useSubmissions(role, journalId, q) {
  const [state, setState] = useState({ items: [], loading: true, error: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ role, q });
        if (role === 'Editor' && journalId) params.set('journal', journalId);
        const r = await api.get(`submissions?${params}`);
        if (!off) setState({ items: r.items, loading: false, error: '' });
      } catch (e) {
        if (!off) setState({ items: [], loading: false, error: e.message });
      }
    }, q ? 250 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [role, journalId, q, tick]);
  return { ...state, reload: () => setTick((n) => n + 1) };
}

function nextGate(progress) {
  for (const g of GATES) if (progress?.[`G${g.n}`] !== 'done') return g.n;
  return 4;
}

export function StartPage({ query }) {
  const store = useStore();
  const { checks, settings, setSettings, journals } = store;
  const role = settings.role;
  const editorJournals = journals.filter((j) => j.isEditor);
  const [journalId, setJournalId] = useState(settings.journalId || editorJournals[0]?.id || null);
  const [variant, setVariant] = useState(settings.variant || 'emp');
  const [q, setQ] = useState(query.naskah || '');
  const [selKey, setSelKey] = useState(query.naskah ? `${query.naskah}-` : null);
  const [gate, setGate] = useState(Number(query.gate) || null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [prereq, setPrereq] = useState(null);
  const subs = useSubmissions(role, journalId, q);

  const drafts = useMemo(() => checks
    .filter((c) => c.status === 'draft' && c.mine && c.role === role)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), [checks, role]);

  const keyOf = (s) => `${s.id}-${s.review?.id || ''}`;
  const sel = subs.items.find((s) => keyOf(s) === selKey) || (selKey && subs.items.length === 1 && String(subs.items[0].id) === selKey.split('-')[0] ? subs.items[0] : null);
  const progress = sel?.progress || {};
  const g = gate || nextGate(progress);
  const cl = findChecklist({ role, variant, gate: g });
  const journal = journals.find((j) => j.id === (sel?.journalId ?? journalId));

  function choose(s) {
    setSelKey(keyOf(s)); setProblem(null); setPrereq(null);
    if (role === 'Editor') setGate(nextGate(s.progress));
  }

  async function start(force = false) {
    if (!sel) { setProblem({ text: 'Pilih naskah dari daftar OJS terlebih dahulu.' }); return; }
    if (role === 'Reviewer' && sel.review?.checkId) { go(`/cek/${sel.review.checkId}`); return; }
    if (role === 'Editor' && !force && g > 1 && progress[`G${g - 1}`] !== 'done') {
      setPrereq(STEPS.find((s) => s.key === `G${g - 1}`)); return;
    }
    setProblem(null); setPrereq(null);
    setSettings({ journalId, variant });
    setBusy(true);
    const r = await startStep(store, {
      role, variant, gate: g, reviewId: sel.review?.id, journal, manuscript: { id: sel.id, title: sel.title },
    });
    setBusy(false);
    if (r.check) { go(`/cek/${r.check.id}`); return; }
    if (r.conflict) { setProblem({ conflict: r.conflict, text: r.message }); subs.reload(); return; }
    setProblem({ text: r.message || r.error });
  }

  const conflictLocal = problem?.conflict?.id && checks.find((c) => c.id === problem.conflict.id);
  const taken = (n) => progress[`G${n}`];

  return (
    <>
      <section className="pane pane-list" aria-label="Draf">
        <div className="list-head">
          <h2 className="list-title">Lanjutkan</h2>
          <p className="list-sub">Draf {role.toLowerCase()} Anda</p>
        </div>
        {drafts.length === 0 && (
          <div className="card off"><div className="card-title">Belum ada draf</div><div className="card-body">Pemeriksaan yang belum selesai akan muncul di sini.</div></div>
        )}
        {drafts.map((c) => {
          const dcl = getChecklist(c.checklistId);
          const n = counts(dcl, c);
          return (
            <a key={c.id} className="card" href={href(`/cek/${c.id}`)}>
              <div className="card-top">
                <div className="card-title">{c.manuscript?.title || 'Tanpa judul'} <span className="idchip">#{c.manuscript?.id}</span></div>
                <span className={`ring ${n.tm ? 'warn' : n.filled ? 'part' : ''}`} aria-hidden="true" />
              </div>
              <div className="card-body">{checklistLabel(dcl)}{c.code ? ` · ${c.code}` : ''} · {c.journal?.name}</div>
              <div className="card-foot"><span>{n.filled}/{n.total} butir</span><span className="accent">{relDays(c.updatedAt)}</span></div>
            </a>
          );
        })}
      </section>

      <section className="pane pane-detail" aria-label="Mulai pemeriksaan">
        <div className="topbar"><div className="left" /><div className="right"><span className="saved">Terhubung ke OJS</span></div></div>
        <div className="doc">
          <div className="gutter-row" style={{ marginTop: 18 }}>
            <span className="marker">Baru</span>
            <h1 className="h1">Mulai pemeriksaan</h1>
          </div>
          <div className="gutter-row">
            <span />
            <div>
              <div className="tags"><span>{role}</span>{role !== 'Penulis' && <span>{VARIANTS.find((v) => v.id === variant)?.short}</span>}{role === 'Editor' && sel && <span>{GATES[g - 1].name}</span>}</div>
              <p className="lede">
                {role === 'Editor' && 'Pilih naskah dari OJS, lalu tahap pemeriksaannya. Satu tahap hanya bisa diperiksa sekali per ID submission.'}
                {role === 'Reviewer' && 'Ini penugasan review Anda di OJS. Unduh naskah dari OJS seperti biasa, lalu isi checklist telaah di sini.'}
                {role === 'Penulis' && 'Ini naskah Anda di OJS. Periksa pruf dari editor, lalu isi checklist pemeriksaan pruf di sini.'}
              </p>
            </div>
          </div>

          <div className="form">
            {role === 'Editor' && editorJournals.length > 1 && (
              <div className="field wide">
                <label htmlFor="start-journal">Jurnal</label>
                <select id="start-journal" className="input" value={journalId || ''} onChange={(e) => { setJournalId(Number(e.target.value)); setSelKey(null); setSettings({ journalId: Number(e.target.value) }); }}>
                  {editorJournals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
            )}

            <div className="field wide">
              <label htmlFor="start-q">{role === 'Reviewer' ? 'Penugasan review' : 'Naskah di OJS'}</label>
              <div className="search" style={{ background: 'var(--card)' }}>
                <Icon name="search" size={16} />
                <input id="start-q" type="search" placeholder="Cari ID submission atau judul" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
              </div>
              <div className="sublist" role="listbox" aria-label="Naskah">
                {subs.loading && <div className="sub-empty">Memuat dari OJS…</div>}
                {!subs.loading && subs.error && <div className="sub-empty bad">{subs.error}</div>}
                {!subs.loading && !subs.error && subs.items.length === 0 && (
                  <div className="sub-empty">{q ? `Tidak ada naskah yang cocok dengan “${q}”.` : role === 'Reviewer' ? 'Belum ada penugasan review aktif untuk Anda di OJS.' : role === 'Penulis' ? 'Belum ada naskah Anda di OJS.' : 'Belum ada naskah di jurnal ini.'}</div>
                )}
                {!subs.loading && subs.items.map((s) => (
                  <button type="button" role="option" aria-selected={sel ? keyOf(s) === keyOf(sel) : false} key={keyOf(s)} className="sub" onClick={() => choose(s)}>
                    <span className="sub-top"><span className="idchip">#{s.id}</span><b>{s.title || 'Tanpa judul'}</b></span>
                    <span className="sub-meta">
                      {role === 'Reviewer' ? (
                        <>Putaran {s.review.round} · {s.review.code}{s.review.due ? ` · tenggat ${fmtDate(s.review.due)}${daysUntil(s.review.due) < 0 ? ' (lewat)' : ''}` : ''}
                          {s.review.checkStatus === 'finished' ? ' · checklist selesai' : s.review.checkStatus === 'draft' ? ' · draf ada' : ''}</>
                      ) : (
                        <>{s.authors?.length ? `${s.authors.slice(0, 2).join(', ')}${s.authors.length > 2 ? ' dkk.' : ''} · ` : ''}OJS: {s.stage}{s.statusId !== 1 ? ` · ${s.status}` : ''}</>
                      )}
                    </span>
                    {role === 'Editor' && Object.keys(s.progress || {}).length > 0 && (
                      <span className="sub-steps">
                        {['G1', 'R', 'G2', 'G3', 'P', 'G4'].filter((k) => s.progress[k]).map((k) => (
                          <span key={k} className={k === 'R' ? (s.progress.R.done ? 'done' : 'draft') : s.progress[k]}>
                            {STEP_NAME[k]}{k === 'R' ? ` ${s.progress.R.done}` : ''}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {sel && role !== 'Penulis' && !(role === 'Reviewer' && sel.review?.checkId) && (
              <fieldset className="field wide" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="lab" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 7 }}>Jenis artikel</legend>
                <div className="choice-grid">
                  {VARIANTS.map((v) => (
                    <label className="choice" key={v.id}>
                      <input type="radio" name="variant" value={v.id} checked={variant === v.id} onChange={() => setVariant(v.id)} />
                      <span><b>{v.label}</b><small>{v.id === 'emp' ? 'Kuantitatif, kualitatif, campuran, R&D, technical paper' : 'SLR, scoping, bibliometrik, meta-analisis, naratif, konseptual'}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {sel && role === 'Editor' && (
              <fieldset className="field wide" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="lab" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 7 }}>Tahap pemeriksaan untuk #{sel.id}</legend>
                <div className="choice-grid">
                  {GATES.map((x) => (
                    <label className="choice" key={x.n}>
                      <input type="radio" name="gate" value={x.n} checked={g === x.n} onChange={() => { setGate(x.n); setProblem(null); setPrereq(null); }} />
                      <span><b>{x.name}</b><small>{taken(x.n) === 'done' ? 'Sudah selesai' : taken(x.n) === 'draft' ? 'Sedang dikerjakan' : `Tahap ${x.n} · ${x.id}`}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {sel && role === 'Penulis' && sel.stageId < 5 && (
              <div className="notice wide"><span>Naskah ini masih di tahap {sel.stage} di OJS. Pruf biasanya dikirim editor pada tahap Production; mulai bila editor sudah memintanya.</span></div>
            )}

            {problem && (
              <div className="problems wide" role="alert">
                <b>{problem.conflict ? `${describeEntry(problem.conflict)} untuk ID ${sel?.id} sudah ${problem.conflict.status === 'finished' ? 'selesai' : 'dimulai'}` : problem.text}</b>
                {problem.conflict && (
                  <>
                    <div style={{ marginTop: 4 }}>
                      {problem.conflict.status === 'finished' ? `Diselesaikan ${fmtDate(problem.conflict.finishedAt)}` : `Dimulai ${relDays(problem.conflict.updatedAt)}`}
                      {problem.conflict.name ? ` oleh ${problem.conflict.name}` : ''}.
                      {' '}Satu tahap hanya diperiksa sekali per naskah. Untuk mengubah hasilnya, buka pemeriksaan itu dan gunakan Revisi.
                    </div>
                    <div className="actions" style={{ marginTop: 10 }}>
                      {conflictLocal && <a className="btn" href={href(`/cek/${conflictLocal.id}`)}>Buka pemeriksaan itu</a>}
                      {role === 'Editor' && <a className="btn ghost" href={href('/riwayat', { naskah: sel?.id })}>Lihat riwayat naskah</a>}
                    </div>
                  </>
                )}
              </div>
            )}
            {prereq && (
              <div className="problems wide" role="alert" style={{ background: 'var(--gold-soft)' }}>
                <b>{prereq.name} untuk ID {sel?.id} belum selesai</b>
                <div style={{ marginTop: 4 }}>Urutan prosesnya Preliminary, Peer Review, Pre-Acceptance, Post-Acceptance, Author Proof, lalu Publication.</div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button type="button" className="btn" onClick={() => start(true)}>Tetap mulai {GATES[g - 1].name}</button>
                  <button type="button" className="btn ghost" onClick={() => setPrereq(null)}>Batal</button>
                </div>
              </div>
            )}
            <div className="actions wide">
              <button className="btn primary" type="button" disabled={busy || !sel} onClick={() => start()}>
                <Icon name="arrowR" size={16} />
                {busy ? 'Memeriksa riwayat…' : role === 'Reviewer' && sel?.review?.checkId ? 'Buka checklist review' : 'Mulai pemeriksaan'}
              </button>
              <span className="hint" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {sel ? `#${sel.id} · ${cl ? `${checklistLabel(cl)}: ${cl.tables.reduce((s, t) => s + t.groups.filter((x) => !x.module).reduce((a, x) => a + x.items.length, 0), 0)} butir inti` : ''}` : 'Pilih naskah dari daftar.'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
