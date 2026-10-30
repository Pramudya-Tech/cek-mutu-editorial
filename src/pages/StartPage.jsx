import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { GATES, VARIANTS, findChecklist, checklistLabel, getChecklist, counts } from '../lib/checklists.js';
import { listRows } from '../lib/registry.js';
import { startStep, entriesFor, previousEditorStep, describeEntry } from '../lib/process.js';
import { go, href } from '../lib/router.js';
import { relDays, digitsOnly, fmtDate } from '../lib/format.js';
import { Icon } from '../components/Icons.jsx';

export function StartPage({ query }) {
  const store = useStore();
  const { checks, settings, setSettings, journals, notify } = store;
  const role = settings.role;
  const [journalId, setJournalId] = useState(query.jurnal || settings.journalId || journals[0]?.id || '');
  const [variant, setVariant] = useState(query.jenis || settings.variant || 'emp');
  const [gate, setGate] = useState(Number(query.gate) || 1);
  const [round, setRoundState] = useState(Number(query.putaran) || 1);
  const setRound = setRoundState;
  const [msid, setMsid] = useState(digitsOnly(query.naskah || ''));
  const [code, setCode] = useState('R1');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [prereq, setPrereq] = useState(null);
  const [offline, setOffline] = useState('');
  const [title, setTitle] = useState(query.judul || '');
  const [error, setError] = useState('');

  const drafts = useMemo(() => checks
    .filter((c) => c.status === 'draft' && c.role === role)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), [checks, role]);

  const journal = journals.find((j) => j.id === journalId);
  const known = useMemo(() => {
    const m = new Map();
    checks.forEach((c) => { if (c.manuscript?.id && c.journal?.name === journal?.name) m.set(c.manuscript.id, c.manuscript.title); });
    return m;
  }, [checks, journal]);

  const cl = findChecklist({ role, variant, gate });

  function onMsid(v) {
    const d = digitsOnly(v);
    setMsid(d); setConflict(null); setPrereq(null); setOffline('');
    if (!title && known.get(d)) setTitle(known.get(d));
  }

  async function start(e, { force = false, skipRegistry = false } = {}) {
    e?.preventDefault();
    if (!journal) { setError('Pilih jurnal terlebih dahulu, atau tambahkan jurnal baru.'); return; }
    if (!msid) { setError('Isi ID submission dari OJS (angka saja).'); return; }
    if (role === 'Reviewer' && !code.trim()) { setError('Isi kode reviewer, misalnya R1.'); return; }
    setError(''); setConflict(null); setOffline('');
    setSettings({ journalId, variant });
    setBusy(true);
    if (role === 'Editor' && !force) {
      let remote = [];
      if (store.registry.enabled && !skipRegistry) {
        const r = await listRows(store.registry, journal.name, msid);
        if (!r.ok) { setBusy(false); setOffline(r.message || 'Spreadsheet tidak bisa dihubungi'); return; }
        remote = r.rows; store.setRemote(journal.name, msid, remote);
      }
      const prev = previousEditorStep(gate, entriesFor(checks, remote, journal.name, msid));
      if (prev) { setBusy(false); setPrereq(prev); return; }
    }
    const r = await startStep(store, { role, variant, gate, round, code: role === 'Reviewer' ? code.trim() : '', journal, manuscript: { id: msid, title: title.trim() } }, { skipRegistry });
    setBusy(false);
    if (r.conflict) { setConflict(r.conflict); return; }
    if (r.error) { setOffline(r.error); return; }
    go(`/cek/${r.check.id}`);
  }

  const conflictLocal = conflict && checks.find((c) => c.id === conflict.id);
  return (
    <>
      <section className="pane pane-list" aria-label="Draf">
        <div className="list-head">
          <h2 className="list-title">Lanjutkan</h2>
          <p className="list-sub">Draf {role.toLowerCase()} di peramban ini</p>
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
              <div className="card-body">{checklistLabel(dcl)} · {c.journal?.name}</div>
              <div className="card-foot"><span>{n.filled}/{n.total} butir</span><span className="accent">{relDays(c.updatedAt)}</span></div>
            </a>
          );
        })}
      </section>

      <section className="pane pane-detail" aria-label="Mulai pemeriksaan">
        <div className="topbar"><div className="left" /><div className="right"><span className="saved">Tersimpan di peramban ini saja</span></div></div>
        <div className="doc">
          <div className="gutter-row" style={{ marginTop: 18 }}>
            <span className="marker">Baru</span>
            <h1 className="h1">Mulai pemeriksaan</h1>
          </div>
          <div className="gutter-row">
            <span />
            <div>
              <div className="tags"><span>{role}</span>{role !== 'Penulis' && <span>{VARIANTS.find((v) => v.id === variant)?.short}</span>}{role === 'Editor' && <span>{GATES[gate - 1].name}</span>}</div>
              <p className="lede">
                Ambil naskah dari OJS seperti biasa, lalu periksa di sini bagian demi bagian. Di akhir, unggah tanda tangan
                dan ekspor PDF sebagai dokumentasi pemeriksaan.
                {role === 'Penulis' && ' Biasanya penulis membuka checklist ini lewat tautan yang dikirim editor.'}
              </p>
            </div>
          </div>

          <form className="form" onSubmit={start} noValidate>
            <div className="field wide">
              <label htmlFor="start-journal">Jurnal</label>
              <select id="start-journal" className="input" value={journalId} onChange={(e) => setJournalId(e.target.value)}>
                {journals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
              <span className="hint">Jurnal belum ada? <a href={href('/jurnal', { baru: '1' })}>Tambah jurnal</a></span>
            </div>

            {role !== 'Penulis' && (
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

            {role === 'Editor' && (
              <fieldset className="field wide" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="lab" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 7 }}>Gate pemeriksaan</legend>
                <div className="choice-grid">
                  {GATES.map((g) => (
                    <label className="choice" key={g.n}>
                      <input type="radio" name="gate" value={g.n} checked={gate === g.n} onChange={() => { setGate(g.n); setConflict(null); setPrereq(null); }} />
                      <span><b>{g.name}</b><small>Tahap {g.n} · {g.id}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {role === 'Reviewer' && (
              <div className="field wide">
                <span className="lab">Putaran telaah</span>
                <div className="chips" role="radiogroup" aria-label="Putaran telaah">
                  {[1, 2, 3].map((r) => (
                    <label className="chip" key={r}><input type="radio" name="round" checked={round === r} onChange={() => { setRound(r); setConflict(null); }} /><span>Putaran {r}</span></label>
                  ))}
                </div>
              </div>
            )}
            {role === 'Reviewer' && (
              <div className="field">
                <label htmlFor="start-code">Kode reviewer</label>
                <input id="start-code" className="input" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8)); setConflict(null); }} />
                <span className="hint">Dari editor, misalnya R1. Satu kode hanya bisa mengisi satu kali per putaran.</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="start-msid">ID submission di OJS</label>
              <input id="start-msid" className="input" value={msid} onChange={(e) => onMsid(e.target.value)} list="known-ms" placeholder="misalnya 4127" autoComplete="off"
                inputMode="numeric" pattern="[0-9]*" aria-describedby="msid-hint" />
              <span className="hint" id="msid-hint">Angka saja, sama dengan ID di OJS.</span>
              <datalist id="known-ms">{[...known.keys()].map((k) => <option key={k} value={k} />)}</datalist>
            </div>
            <div className="field">
              <label htmlFor="start-title">Judul artikel</label>
              <input id="start-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Salin dari OJS" />
            </div>

            {error && <div className="problems" role="alert">{error}</div>}
            {conflict && (
              <div className="problems wide" role="alert">
                <b>{describeEntry(conflict)} untuk ID {msid} sudah {conflict.status === 'finished' ? 'selesai' : 'dimulai'}</b>
                <div style={{ marginTop: 4 }}>
                  {conflict.status === 'finished' ? `Diselesaikan ${fmtDate(conflict.finishedAt)}` : `Dimulai ${relDays(conflict.updatedAt)}`}
                  {conflict.name ? ` oleh ${conflict.name}` : ''}{conflict.local === false ? ' (tercatat di spreadsheet)' : ''}.
                  {' '}Satu tahap hanya diperiksa sekali per naskah. Untuk mengubah hasilnya, buka pemeriksaan itu dan gunakan Revisi.
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  {conflictLocal && <a className="btn" href={href(`/cek/${conflictLocal.id}`)}>Buka pemeriksaan itu</a>}
                  <a className="btn ghost" href={href('/riwayat', { naskah: `${journal?.name}|${msid}` })}>Lihat riwayat naskah</a>
                </div>
              </div>
            )}
            {prereq && (
              <div className="problems wide" role="alert" style={{ background: 'var(--gold-soft)' }}>
                <b>{prereq.name} untuk ID {msid} belum {store.registry.enabled ? 'tercatat selesai' : 'selesai di peramban ini'}</b>
                <div style={{ marginTop: 4 }}>Urutan prosesnya Preliminary, Peer Review, Pre-Acceptance, Post-Acceptance, Author Proof, lalu Publication. Lanjutkan hanya bila tahap sebelumnya dikerjakan di perangkat lain.</div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button type="button" className="btn" onClick={(e) => { setPrereq(null); start(e, { force: true }); }}>Tetap mulai {GATES[gate - 1].name}</button>
                  <button type="button" className="btn ghost" onClick={() => setPrereq(null)}>Batal</button>
                </div>
              </div>
            )}
            {offline && (
              <div className="problems wide" role="alert">
                <b>{offline}</b>
                <div style={{ marginTop: 4 }}>Tanpa spreadsheet, aplikasi hanya bisa memeriksa duplikasi di peramban ini.</div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button type="button" className="btn" onClick={(e) => start(e)}>Coba lagi</button>
                  <button type="button" className="btn ghost" onClick={(e) => start(e, { skipRegistry: true, force: true })}>Mulai tanpa pengecekan spreadsheet</button>
                </div>
              </div>
            )}
            <div className="actions wide">
              <button className="btn primary" type="submit" disabled={busy}><Icon name="arrowR" size={16} />{busy ? 'Memeriksa riwayat…' : 'Mulai pemeriksaan'}</button>
              <span className="hint" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{cl ? `${checklistLabel(cl)}: ${cl.tables.reduce((s, t) => s + t.groups.filter((g) => !g.module).reduce((a, g) => a + g.items.length, 0), 0)} butir inti` : ''}</span>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
