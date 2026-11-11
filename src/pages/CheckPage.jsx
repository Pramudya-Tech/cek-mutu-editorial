import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { getChecklist, sectionsOf, counts, VARIANTS, sharedFieldValue, modulesForPicks, checklistLabel } from '../lib/checklists.js';
import { validateCheck } from '../lib/validate.js';
import { finishCheck, reviseCheck, exportCheckPdf, makeCheckPdf, processSignature } from '../lib/actions.js';
import { go, href } from '../lib/router.js';
import { plain, fmtDate, fmtDateTime, daysUntil, cx, downloadBlob } from '../lib/format.js';
import { Icon } from '../components/Icons.jsx';
import { DeskIllustration } from '../components/Illustration.jsx';
import { DecisionMail } from '../components/DecisionMail.jsx';
import { decisionsFor, suggestDecision, decisionLabel } from '../lib/mail.js';
import { api } from '../lib/api.js';
import { stepOf } from '../lib/checklists.js';

export function CheckPage({ check, loading, missing, query }) {
  if (loading && !missing) {
    return (
      <>
        <section className="pane pane-list" />
        <section className="pane pane-detail" aria-busy="true"><div className="doc"><p className="lede" style={{ marginTop: 40 }}>Memuat pemeriksaan…</p></div></section>
      </>
    );
  }
  if (!check) {
    return (
      <>
        <section className="pane pane-list" />
        <section className="pane pane-detail">
          <div className="empty-state">
            <DeskIllustration width={260} />
            <h3>Pemeriksaan tidak ditemukan</h3>
            <p>Pemeriksaan ini tidak ada, sudah dihapus, atau tidak bisa Anda lihat dengan akun ini.</p>
            <div className="actions" style={{ justifyContent: 'center', marginTop: 8 }}>
              <a className="btn" href={href('/riwayat')}>Buka riwayat</a>
              <a className="btn primary" href={href('/')}>Checklist baru</a>
            </div>
          </div>
        </section>
      </>
    );
  }
  return <CheckEditor check={check} query={query} />;
}

function CheckEditor({ check, query }) {
  const store = useStore();
  const cl = getChecklist(check.checklistId);
  const sections = useMemo(() => sectionsOf(cl), [cl]);
  const current = sections.find((s) => s.key === query.bagian) || sections[0];
  const idx = sections.indexOf(current);
  const ro = check.status === 'finished' || !check.mine;
  const [search, setSearch] = useState('');
  const detailRef = useRef(null);
  const n = counts(cl, check);

  const update = (fn) => { if (ro) return; const next = structuredClone(check); fn(next); store.saveCheck(next); };
  const goSection = (key) => go(`/cek/${check.id}`, { bagian: key });

  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [current.key]);

  // Keyboard: M / T set the focused item's status, J / K move between items.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const items = [...document.querySelectorAll('.item[data-key]')];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement?.closest?.('.item'));
      const k = e.key.toLowerCase();
      if (k === 'j' || k === 'k') {
        e.preventDefault();
        const next = items[Math.max(0, Math.min(items.length - 1, i < 0 ? 0 : i + (k === 'j' ? 1 : -1)))];
        next.focus(); next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if ((k === 'm' || k === 't') && i >= 0 && !ro) {
        e.preventDefault();
        const key = items[i].dataset.key;
        update((c) => { (c.answers[key] ||= {}).s = k === 'm' ? 'M' : 'TM'; });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const q = search.trim().toLowerCase();
  const matches = (s) => {
    if (!q) return true;
    if (s.kind !== 'group') return s.title.toLowerCase().includes(q);
    return s.title.toLowerCase().includes(q) || s.items.some((it) => `${it.code} ${plain(it.title)} ${plain(it.cr.join(' '))}`.toLowerCase().includes(q));
  };
  const variant = VARIANTS.find((v) => v.id === check.variant);
  const days = daysUntil(check.due);

  return (
    <>
      <section className="pane pane-list strip" aria-label="Bagian checklist">
        <div className="list-head">
          <label className="search">
            <Icon name="search" size={16} />
            <input type="search" placeholder="Cari butir, misalnya G1-14" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari butir" />
          </label>
          <h2 className="list-title">Bagian</h2>
          <p className="list-sub">{n.filled}/{n.total} butir terisi{n.tm ? ` · ${n.tm} TM` : ''}{n.ktm ? ` · ${n.ktm} kunci TM` : ''}</p>
        </div>
        {sections.filter(matches).map((s) => <SectionCard key={s.key} s={s} check={check} cl={cl} current={current.key === s.key} q={q} />)}
      </section>

      <section className="pane pane-detail" ref={detailRef} aria-label={current.title}>
        <div className="topbar">
          <div className="left">
            <button type="button" className="icon-btn" title="Bagian sebelumnya" disabled={idx === 0} onClick={() => goSection(sections[idx - 1].key)}><Icon name="arrowL" /></button>
            <button type="button" className="icon-btn" title="Bagian berikutnya" disabled={idx === sections.length - 1} onClick={() => goSection(sections[idx + 1].key)}><Icon name="arrowR" /></button>
          </div>
          <div className="right">
            <span className={`saved${store.saveState[check.id] === 'error' ? ' bad' : ''}`}>
              {check.status === 'finished' ? `Selesai ${fmtDate(check.finishedAt)}`
                : !check.mine ? `Hanya baca · draf ${check.sign?.name || 'pemeriksa lain'}`
                  : store.saveState[check.id] === 'saving' ? 'Menyimpan…' : store.saveState[check.id] === 'error' ? 'Belum tersimpan' : 'Tersimpan di server'}
            </span>
            {check.hasPdf && <a className="text-btn" href={api.url(`checks/${check.id}/pdf`)} style={{ textDecoration: 'none' }}>PDF tersimpan</a>}
          </div>
        </div>

        <div className="doc">
          <div className="gutter-row" style={{ marginTop: 12 }}>
            <span className="marker">{cl.role === 'Editor' ? `Tahap ${cl.gate}` : cl.role === 'Reviewer' ? `R${check.round || 1}` : 'Pruf'}</span>
            <h1 className="h1">{stepOf(cl)?.name}<span className="idchip" title="ID submission">#{check.manuscript?.id}</span></h1>
          </div>
          <div className="gutter-row">
            <span />
            <div>
              <div className="tags">
                <span>{check.journal?.name}</span>
                <span>{stepOf(cl)?.id}</span>
                {cl.role !== 'Penulis' && <span>{variant?.short}</span>}
                {cl.role === 'Reviewer' && <span>Putaran {check.round || 1}</span>}
                {check.revision > 1 && <span>Revisi {check.revision}</span>}
              </div>
              {check.manuscript?.title && <p className="lede">“{check.manuscript.title}”</p>}
              {cl.stage && <div className="stage" dangerouslySetInnerHTML={{ __html: cl.stage }} />}
            </div>
          </div>

          {check.status === 'finished' && (
            <div className="banner done">
              <span><b>Pemeriksaan selesai</b> {fmtDateTime(check.finishedAt)}</span>
              <span>ID dokumen <span className="mono">{check.docId}</span></span>
              {check.decision?.value && <span>{cl.role === 'Editor' ? 'Keputusan' : 'Rekomendasi'}: <b>{decisionLabel(check, 'id')}</b></span>}
              <span className="actions" style={{ marginLeft: 'auto' }}>
                <button type="button" className="btn primary" onClick={() => exportCheckPdf(check)}><Icon name="download" size={16} />PDF lengkap</button>
                {current.kind === 'group' && (!current.module || check.modules?.[current.key]) && (
                  <button type="button" className="btn" onClick={() => exportCheckPdf(check, current.key)}>PDF bagian {current.letter}</button>
                )}
                {current.kind !== 'sign' && check.decision?.value && <button type="button" className="btn" onClick={() => goSection('pengesahan')}>Surat keputusan</button>}
                {(check.mine || check.role === 'Editor') && <ReviseButton check={check} />}
              </span>
            </div>
          )}
          {!ro && check.due && (
            <div className="banner warn">
              <span><b>Tenggat {fmtDate(check.due)}</b> · {days < 0 ? `terlambat ${-days} hari` : days === 0 ? 'hari ini' : `${days} hari lagi`}</span>
            </div>
          )}

          {current.kind === 'identity' && <IdentitySection cl={cl} check={check} update={update} ro={ro} />}
          {current.kind === 'group' && <GroupSection s={current} cl={cl} check={check} update={update} ro={ro} sections={sections} />}
          {current.kind === 'sign' && <SignSection cl={cl} check={check} update={update} ro={ro} goSection={goSection} />}

          <div className="sticky-fab">
            {idx < sections.length - 1 && (
              <div className="fab-inline">
                <button type="button" className="btn primary" onClick={() => goSection(sections[idx + 1].key)}>
                  {sections[idx + 1].kind === 'sign' ? 'Ke pengesahan' : `Bagian ${sections[idx + 1].letter}`}<Icon name="arrowR" size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function SectionCard({ s, check, cl, current, q }) {
  const a = check.answers || {};
  let title = s.title; let body = ''; let left = ''; let right = ''; let ring = ''; let off = false;
  if (s.kind === 'identity') {
    const own = cl.fields.filter((f) => sharedFieldValue(f.label, check) == null);
    const filled = own.filter((f) => { const v = check.fields?.[f.label]; return f.type === 'choice' ? v?.picked?.length : (v || '').trim(); }).length;
    body = `${check.journal?.name || ''} · Naskah ${check.manuscript?.id || '-'}`;
    left = `${filled}/${own.length} kolom`; ring = filled === own.length ? 'done' : filled ? 'part' : '';
  } else if (s.kind === 'sign') {
    const probs = validateCheck(cl, check).filter((p) => p.section === 'pengesahan');
    body = check.status === 'finished' ? `ID ${check.docId}` : (check.sign?.name ? `${check.sign.name} · ${check.sign.role || ''}` : 'Nama, tanda tangan, pernyataan, lalu ekspor PDF');
    left = check.status === 'finished' ? 'Selesai' : probs.length ? `${probs.length} hal belum lengkap` : 'Siap diekspor';
    ring = check.status === 'finished' ? 'done' : probs.length ? '' : 'part';
  } else {
    off = s.module && !check.modules?.[s.key];
    const done = s.items.filter((it) => a[it.key]?.s).length;
    const tm = s.items.filter((it) => a[it.key]?.s === 'TM');
    const hits = q ? s.items.filter((it) => `${it.code} ${plain(it.title)} ${plain(it.cr.join(' '))}`.toLowerCase().includes(q)).length : 0;
    body = q && hits ? `${hits} butir cocok dengan pencarian` : s.items.slice(0, 2).map((it) => plain(it.title)).join(' · ');
    left = off ? 'Modul tidak dipakai' : `${done}/${s.items.length} butir`;
    right = off ? '' : tm.some((it) => it.k) ? 'Kunci TM' : tm.length ? `${tm.length} TM` : done === s.items.length ? 'Lengkap' : '';
    ring = off ? '' : tm.length ? 'warn' : done === s.items.length ? 'done' : done ? 'part' : '';
  }
  return (
    <a className={cx('card', off && 'off')} aria-current={current ? 'true' : undefined} href={href(`/cek/${check.id}`, { bagian: s.key })}>
      <div className="card-top">
        <div className="card-title">{s.kind === 'group' && <span className="card-letter">{s.letter}</span>}{title}</div>
        <span className={`ring ${ring}`} aria-hidden="true" />
      </div>
      <div className="card-body">{body}</div>
      <div className="card-foot"><span>{left}</span>{right && <span className="accent">{right}</span>}</div>
    </a>
  );
}

function IdentitySection({ cl, check, update, ro }) {
  const own = cl.fields;
  return (
    <div className="section">
      <div className="gutter-row"><span className="marker">i</span><h2 className="h3">Identitas naskah</h2></div>
      {cl.intro?.map((t, i) => <div className="gutter-row" key={i}><span /><p className="lede" style={{ marginTop: 10 }}>{t}</p></div>)}
      <div className="form">
        {own.map((f) => {
          const id = `fld-${f.label.replace(/\W+/g, '-')}`;
          const shared = sharedFieldValue(f.label, check);
          const lbl = <span dangerouslySetInnerHTML={{ __html: f.html }} />;
          if (shared != null) {
            const isJournal = f.label.toLowerCase().startsWith('nama jurnal');
            const isId = f.label.toLowerCase().startsWith('id naskah');
            return (
              <div className={cx('field', f.wide && 'wide')} key={f.label}>
                <label htmlFor={id}>{lbl}</label>
                <input id={id} className="input" value={shared} readOnly={ro || isJournal}
                  onChange={(e) => update((c) => { if (isId) c.manuscript.id = e.target.value; else c.manuscript.title = e.target.value; })} />
                {isJournal && <span className="hint">Dipilih saat memulai pemeriksaan.</span>}
              </div>
            );
          }
          if (f.type === 'choice') {
            const cur = check.fields?.[f.label] || { picked: [], other: '' };
            return (
              <div className={cx('field', 'wide')} key={f.label}>
                <span className="lab">{lbl}</span>
                <div className="chips" role="group" aria-label={f.label}>
                  {f.opts.map((o) => (
                    <Fragment key={o.t}>
                      <label className="chip">
                        <input type={f.multi ? 'checkbox' : 'radio'} name={id} disabled={ro} checked={cur.picked.includes(o.t)}
                          onChange={(e) => update((c) => {
                            const v = (c.fields[f.label] ||= { picked: [], other: '' });
                            if (f.multi) v.picked = e.target.checked ? [...new Set([...v.picked, o.t])] : v.picked.filter((x) => x !== o.t);
                            else v.picked = [o.t];
                            if (f.label === 'Putaran telaah') c.round = Number(o.t) || c.round;
                            if (f.multi && /Jenis artikel/.test(f.label)) Object.assign(c.modules, modulesForPicks(cl, v.picked));
                          })} />
                        <span>{o.t}</span>
                      </label>
                      {o.other && (
                        <input className="input chip-other" aria-label={`${o.t} (sebutkan)`} placeholder="sebutkan" value={cur.other} readOnly={ro}
                          onChange={(e) => update((c) => { (c.fields[f.label] ||= { picked: [], other: '' }).other = e.target.value; })} />
                      )}
                    </Fragment>
                  ))}
                </div>
                {f.multi && /Jenis artikel/.test(f.label) && <span className="hint">Pilihan ini menyalakan modul yang sesuai di bagian modul.</span>}
              </div>
            );
          }
          const v = check.fields?.[f.label] || '';
          return (
            <div className={cx('field', f.wide && 'wide')} key={f.label}>
              <label htmlFor={id}>{lbl}</label>
              <input id={id} type={f.type === 'date' ? 'date' : 'text'} className="input" value={v} readOnly={ro}
                placeholder={/^Nama (editor|pemeriksa)/i.test(f.label) ? 'Kosongkan bila sama dengan nama di pengesahan' : (f.ph || '').replace(/[()]/g, '')}
                onChange={(e) => update((c) => { c.fields[f.label] = e.target.value; })} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupSection({ s, cl, check, update, ro, sections }) {
  const on = !s.module || !!check.modules?.[s.key];
  const firstOfTable = sections.find((x) => x.kind === 'group' && x.ti === s.ti) === s;
  return (
    <div className="section">
      <div className="gutter-row"><span /><div className="stage" style={{ marginTop: 0, marginBottom: 6 }}>{s.table.title}</div></div>
      <div className="gutter-row">
        <span className="marker">{s.letter}</span>
        <h2 className="h3">{s.title}</h2>
      </div>
      {firstOfTable && s.table.notes?.map((t, i) => <div className="gutter-row" key={i}><span /><p className="lede" style={{ marginTop: 8, fontSize: 13 }}>{t}</p></div>)}
      {s.module && (
        <div className="gutter-row" style={{ marginTop: 14 }}>
          <span />
          <label className="check">
            <input type="checkbox" checked={on} disabled={ro} onChange={(e) => update((c) => { c.modules[s.key] = e.target.checked; })} />
            <span>Modul ini dipakai untuk naskah ini. Modul yang tidak dipakai tidak dihitung dan tidak dicetak.</span>
          </label>
        </div>
      )}
      {on && (
        <ol className="items">
          {s.items.map((it) => <ItemRow key={it.key} it={it} a={check.answers?.[it.key] || {}} ro={ro} update={update} />)}
        </ol>
      )}
    </div>
  );
}

function Criteria({ it, a, ro, update }) {
  let n = 0;
  return (
    <div className="crit">
      {it.cr.map((p, pi) => {
        const parts = p.split('☐');
        return (
          <p key={pi}>
            {pi === 0 && it.lab && <span className="lab">{it.lab}: </span>}
            <span dangerouslySetInnerHTML={{ __html: parts[0] }} />
            {parts.slice(1).map((chunk) => {
              const k = n++;
              return (
                <label className="mini" key={k}>
                  <input type="checkbox" disabled={ro} checked={!!a.x?.[k]}
                    onChange={(e) => update((c) => { const x = ((c.answers[it.key] ||= {}).x ||= []); x[k] = e.target.checked; })} />
                  <span dangerouslySetInnerHTML={{ __html: chunk.trim() }} />
                </label>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

function ItemRow({ it, a, ro, update }) {
  const [open, setOpen] = useState(!!(a.b || a.l || a.t));
  const set = (k, v) => update((c) => { (c.answers[it.key] ||= {})[k] = v; });
  const needNote = a.s === 'TM' && !(a.c || '').trim();
  return (
    <li className="item" data-key={it.key} tabIndex={0} id={`item-${it.key}`} aria-label={`${it.code} ${plain(it.title)}`}>
      <div className="num">{it.no}</div>
      <div className="item-main">
        <div className="item-head">
          <div className="item-title">
            <span className="code">{it.code}</span>
            {it.k && <span className="kunci" title="Butir kunci">Kunci</span>}
            <span dangerouslySetInnerHTML={{ __html: it.title }} />
          </div>
          <div className={cx('status', ro && 'readonly')} role="radiogroup" aria-label={`Status ${it.code}`}>
            {['M', 'TM'].map((v) => (
              <label key={v}>
                <input type="radio" name={`s-${it.key}`} value={v} checked={a.s === v} disabled={ro} onChange={() => set('s', v)} />
                <span className="dot">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={v === 'M' ? 'M4.5 10.5 8 14l7.5-8' : 'M6 6l8 8M14 6l-8 8'} />
                  </svg>
                </span>
                <span>{v === 'M' ? 'Memenuhi' : 'Tidak memenuhi'}</span>
              </label>
            ))}
          </div>
        </div>
        {it.b && <div className="berlaku"><b>Berlaku apabila:</b> <span dangerouslySetInnerHTML={{ __html: it.b }} /></div>}
        <Criteria it={it} a={a} ro={ro} update={update} />
        {ro ? (
          <div className="ro-note">
            {[['Komentar', a.c], ['Bukti', a.b], ['Lokasi', a.l], ['Tindak lanjut', a.t]].filter(([, v]) => (v || '').trim()).map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}
          </div>
        ) : (
          <>
            <textarea className={cx('note', needNote && 'need')} rows={1} value={a.c || ''} placeholder={a.s === 'TM' ? 'Komentar wajib untuk butir TM' : 'Komentar'}
              aria-label={`Komentar ${it.code}`} onChange={(e) => set('c', e.target.value)} />
            {open ? (
              <div className="more">
                <label>Bukti<input value={a.b || ''} onChange={(e) => set('b', e.target.value)} /></label>
                <label>Lokasi<input value={a.l || ''} placeholder="hlm., baris, tabel" onChange={(e) => set('l', e.target.value)} /></label>
                <label>Tindak lanjut<input value={a.t || ''} onChange={(e) => set('t', e.target.value)} /></label>
              </div>
            ) : (
              <button type="button" className="link-btn" onClick={() => setOpen(true)}>Tambah bukti, lokasi, tindak lanjut</button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function SignSection({ cl, check, update, ro, goSection }) {
  const store = useStore();
  const [removeWhite, setRemoveWhite] = useState(true);
  const [remember, setRemember] = useState(!store.signature?.image);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const problems = validateCheck(cl, check);
  const s = check.sign || {};
  const saved = store.signature;

  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setErr('');
    try {
      const image = await processSignature(file, { removeWhite });
      update((c) => { c.sign.image = image; });
      if (remember) store.setSignature({ ...(saved || {}), name: s.name || saved?.name || '', image, roles: { ...(saved?.roles || {}), [check.role]: s.role || cl.signRole } }).catch(() => {});
    } catch (ex) { setErr(ex.message); }
  }

  async function finish() {
    if (problems.length) return;
    setBusy(true);
    try {
      const saved = await store.finishCheck(finishCheck(check));
      if (remember && s.name) store.setSignature({ ...(store.signature || {}), name: s.name, image: s.image, roles: { ...(store.signature?.roles || {}), [check.role]: s.role } }).catch(() => {});
      const { blob, name } = await makeCheckPdf(saved);
      downloadBlob(blob, name);
      try {
        await store.uploadPdf(saved.id, blob, name);
        store.notify(`Selesai. PDF diunduh dan disimpan di server dengan ID dokumen ${saved.docId}.`, 'ok');
      } catch (ex) {
        store.notify(`PDF diunduh, tetapi belum tersimpan di server: ${ex.message}`, 'bad');
      }
    } catch (ex) {
      store.notify(`Pemeriksaan belum bisa diselesaikan: ${ex.message}`, 'bad');
    } finally { setBusy(false); }
  }

  const n = counts(cl, check);
  return (
    <div className="section">
      <div className="gutter-row"><span className="marker">✓</span><h2 className="h3">Pengesahan dan ekspor</h2></div>
      <div className="gutter-row"><span /><p className="lede" style={{ marginTop: 10 }}>
        {n.filled}/{n.total} butir terisi · {n.m} memenuhi · {n.tm} tidak memenuhi{n.ktm ? ` · butir kunci TM: ${n.ktmCodes.join(', ')}` : ''}.
      </p></div>
      <div className="form">
        <div className="field">
          <label htmlFor="sg-name">{cl.role === 'Reviewer' ? 'Nama reviewer' : 'Nama pemeriksa'}</label>
          <input id="sg-name" className="input" value={s.name || ''} readOnly={ro} autoComplete="name" onChange={(e) => update((c) => { c.sign.name = e.target.value; })} />
        </div>
        <div className="field">
          <label htmlFor="sg-role">Peran</label>
          <input id="sg-role" className="input" value={s.role || ''} readOnly={ro} onChange={(e) => update((c) => { c.sign.role = e.target.value; })} />
        </div>
        <div className="field">
          <label htmlFor="sg-date">Tanggal pemeriksaan</label>
          <input id="sg-date" type="date" className="input" value={s.date || ''} readOnly={ro} onChange={(e) => update((c) => { c.sign.date = e.target.value; })} />
        </div>
        <div className="field wide">
          <span className="lab">Tanda tangan</span>
          <div className="sig-box">
            {s.image ? <img src={s.image} alt="Tanda tangan yang akan dicetak di PDF" /> : <div className="empty">Unggah foto atau pindaian tanda tangan (PNG atau JPG).<br />Gambar ditempatkan di kotak tanda tangan PDF.</div>}
          </div>
          {!ro && (
            <div className="actions" style={{ marginTop: 6 }}>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Unggah tanda tangan</button>
              {saved?.image && saved.image !== s.image && <button type="button" className="btn" onClick={() => update((c) => { c.sign.image = saved.image; if (!c.sign.name) c.sign.name = saved.name || ''; })}>Pakai tanda tangan tersimpan</button>}
              {s.image && <button type="button" className="btn ghost" onClick={() => update((c) => { c.sign.image = ''; })}>Hapus</button>}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={onFile} />
            </div>
          )}
          {!ro && (
            <div className="actions" style={{ gap: 18 }}>
              <label className="check"><input type="checkbox" checked={removeWhite} onChange={(e) => setRemoveWhite(e.target.checked)} /><span>Hapus latar putih</span></label>
              <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span>Simpan ke akun saya</span></label>
            </div>
          )}
          {err && <div className="problems" role="alert">{err}</div>}
        </div>
        {decisionsFor(check) && (
          <div className="field wide">
            <span className="lab">{cl.role === 'Editor' ? 'Keputusan editorial' : cl.role === 'Reviewer' ? 'Rekomendasi kepada editor' : 'Hasil pemeriksaan pruf'}</span>
            <div className="decisions" role="radiogroup" aria-label="Keputusan">
              {decisionsFor(check).options.map((o) => (
                <label className="choice" key={o.value}>
                  <input type="radio" name="decision" disabled={ro} checked={check.decision?.value === o.value} onChange={() => update((c) => { c.decision = { value: o.value }; })} />
                  <span><b>{o.id}</b><small>{o.en}</small></span>
                </label>
              ))}
            </div>
            {!ro && (() => {
              const sug = suggestDecision(check, n);
              const lab = decisionsFor(check).options.find((o) => o.value === sug)?.id;
              return check.decision?.value !== sug && (
                <span className="suggest">Saran dari hasil pemeriksaan: <button type="button" onClick={() => update((c) => { c.decision = { value: sug }; })}>{lab}</button></span>
              );
            })()}
          </div>
        )}
        {cl.role === 'Reviewer' && (
          <label className="check wide">
            <input type="checkbox" checked={!!s.anon} disabled={ro} onChange={(e) => update((c) => { c.sign.anon = e.target.checked; })} />
            <span>Cetak kode reviewer saja di PDF, tanpa nama dan tanda tangan. Pakai ini bila PDF akan diteruskan kepada penulis.</span>
          </label>
        )}
        <label className="check wide">
          <input type="checkbox" checked={!!s.agree} disabled={ro} onChange={(e) => update((c) => { c.sign.agree = e.target.checked; })} />
          <span>Saya menyatakan bahwa pemeriksaan ini saya lakukan sendiri dan isian di atas sesuai dengan keadaan naskah.</span>
        </label>

        {!ro && problems.length > 0 && (
          <div className="problems" role="status">
            <b>Sebelum PDF bisa dibuat</b>
            <ul>{problems.map((p, i) => <li key={i}><button type="button" onClick={() => goSection(p.section)}>{p.text}</button></li>)}</ul>
          </div>
        )}
        <div className="actions wide">
          {check.status === 'finished' ? (
            <>
              <button type="button" className="btn primary" onClick={() => exportCheckPdf(check)}><Icon name="download" size={16} />Ekspor PDF lengkap</button>
            </>
          ) : ro ? null : (
            <button type="button" className="btn primary" disabled={problems.length > 0 || busy} onClick={finish}>
              <Icon name="check" size={16} />{busy ? 'Membuat PDF…' : 'Selesaikan dan ekspor PDF'}
            </button>
          )}
          <span style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: 380 }}>
            {check.status === 'finished' ? 'Pemeriksaan sudah dikunci. Gunakan Revisi untuk mengubah isian.' : ro ? 'Hanya pemeriksa yang memulai draf ini yang bisa mengisi dan menyelesaikannya.' : 'Setelah selesai, isian dikunci, diberi ID dokumen, dan PDF-nya disimpan di server. Surat keputusan siap disalin setelahnya.'}
          </span>
        </div>
      </div>
      {check.status === 'finished' && decisionsFor(check) && check.decision?.value && <DecisionMail check={check} />}
    </div>
  );
}

function ReviseButton({ check }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className="btn ghost" onClick={() => setOpen(true)}><Icon name="refresh" size={16} />Revisi</button>;
  return (
    <span className="actions" style={{ width: '100%' }}>
      <input className="input" style={{ flex: '1 1 240px', background: '#fff' }} placeholder="Alasan revisi" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Alasan revisi" />
      <button type="button" className="btn primary" disabled={!reason.trim() || busy} onClick={async () => {
        setBusy(true);
        const r = await store.createCheck(reviseCheck(check, reason.trim()));
        setBusy(false);
        if (!r.check) { store.notify(r.message || r.error, 'bad'); return; }
        store.notify(`Revisi ${r.check.revision} dibuat. Versi sebelumnya tetap ada di Riwayat.`);
        go(`/cek/${r.check.id}`);
      }}>Buat revisi</button>
      <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Batal</button>
    </span>
  );
}

