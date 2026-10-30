import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { startStep, describeEntry } from '../lib/process.js';
import { readLink } from '../lib/links.js';
import { findChecklist, checklistLabel, VARIANTS } from '../lib/checklists.js';
import { go, href } from '../lib/router.js';
import { fmtDate, daysUntil, relDays } from '../lib/format.js';
import { DeskIllustration } from '../components/Illustration.jsx';
import { Icon } from '../components/Icons.jsx';

export function LinkPage({ query }) {
  const store = useStore();
  const p = query.d ? readLink(query.d) : null;
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState('');

  if (!p) {
    return (
      <section className="pane pane-detail">
        <div className="empty-state">
          <DeskIllustration width={260} />
          <h3>Tautan tidak bisa dibaca</h3>
          <p>Tautan ini rusak atau terpotong saat disalin. Minta editor mengirim ulang tautannya, atau mulai pemeriksaan sendiri.</p>
          <a className="btn primary" href={href('/')} style={{ marginTop: 8 }}>Mulai pemeriksaan</a>
        </div>
      </section>
    );
  }

  const cl = findChecklist({ role: p.role, variant: p.variant, gate: null });
  const existing = store.checks.find((c) => c.linkId && c.linkId === p.lid);
  const days = daysUntil(p.due);

  async function start(skipRegistry = false) {
    if (existing) { go(`/cek/${existing.id}`); return; }
    setBusy(true); setConflict(null); setError('');
    const r = await startStep(store, { role: p.role, variant: p.variant, round: p.round, code: p.code, journal: p.journal, manuscript: p.manuscript, link: p }, { skipRegistry });
    setBusy(false);
    if (r.conflict) { setConflict(r.conflict); return; }
    if (r.error) { setError(r.error); return; }
    store.setSettings({ role: p.role });
    go(`/cek/${r.check.id}`);
  }

  return (
    <section className="pane pane-detail" aria-label="Undangan pemeriksaan">
      <div className="topbar" />
      <div className="doc">
        <div className="gutter-row" style={{ marginTop: 12 }}>
          <span className="marker">{p.role === 'Reviewer' ? `R${p.round || 1}` : 'P'}</span>
          <h1 className="h1">{p.role === 'Reviewer' ? 'Anda diminta menelaah naskah' : 'Anda diminta memeriksa pruf naskah'}</h1>
        </div>
        <div className="gutter-row"><span /><div>
          <div className="tags"><span>{p.journal?.name}</span><span>Naskah {p.manuscript?.id}</span>{p.role === 'Reviewer' && <span>{VARIANTS.find((v) => v.id === p.variant)?.short}</span>}</div>
          {p.manuscript?.title && <p className="lede">“{p.manuscript.title}”</p>}
        </div></div>
        <div className="panel">
          <h4>{checklistLabel(cl)}{p.role === 'Reviewer' ? ` · putaran ${p.round || 1}${p.code ? ` · kode ${p.code}` : ''}` : ''}</h4>
          <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
            {p.role === 'Reviewer'
              ? 'Unduh naskah dari OJS, lalu nilai setiap aspek di sini. Di akhir, unggah tanda tangan dan ekspor PDF, kemudian unggah PDF itu ke OJS.'
              : 'Bandingkan pruf dari editor dengan naskah akhir Anda. Di akhir, unggah tanda tangan dan ekspor PDF, kemudian kirim PDF itu kepada editor lewat OJS.'}
          </span>
          {p.due && <span style={{ fontSize: 13.5 }}><b>Tenggat {fmtDate(p.due)}</b> · {days < 0 ? `terlambat ${-days} hari` : days === 0 ? 'hari ini' : `${days} hari lagi`}</span>}
          <div className="actions">
            <button type="button" className="btn primary" disabled={busy} onClick={() => start()}><Icon name="arrowR" size={16} />{busy ? 'Memeriksa riwayat…' : existing ? 'Lanjutkan pemeriksaan' : 'Mulai pemeriksaan'}</button>
          </div>
          {conflict && (
            <div className="problems" role="alert">
              <b>{describeEntry(conflict)} untuk ID {p.manuscript?.id} sudah {conflict.status === 'finished' ? 'diselesaikan' : 'dimulai'}{conflict.name ? ` oleh ${conflict.name}` : ''}</b>
              <div style={{ marginTop: 4 }}>
                {conflict.status === 'finished' ? `Tercatat ${fmtDate(conflict.finishedAt)}.` : `Dimulai ${relDays(conflict.updatedAt)}.`}
                {' '}Satu ID submission hanya bisa diperiksa sekali pada tahap ini. Hubungi editor bila Anda perlu mengubah hasilnya.
              </div>
            </div>
          )}
          {error && (
            <div className="problems" role="alert">
              <b>{error}</b>
              <div className="actions" style={{ marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => start()}>Coba lagi</button>
                <button type="button" className="btn ghost" onClick={() => start(true)}>Mulai tanpa pengecekan spreadsheet</button>
              </div>
            </div>
          )}
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Isian tersimpan di peramban ini saja, sampai Anda mengekspor PDF.</span>
        </div>
      </div>
    </section>
  );
}
