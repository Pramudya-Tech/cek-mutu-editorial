import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { href } from '../lib/router.js';

export function JournalsPage({ query }) {
  const store = useStore();
  const sel = store.journals.find((j) => String(j.id) === String(query.id)) || store.journals[0];
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(sel ? { abbr: sel.abbr || '', sinta: sel.sinta || '', citation: sel.citation || 'APA 7' } : {}); }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const used = (j) => store.checks.filter((c) => c.journal?.id === j.id).length;
  const ro = !sel?.canEdit;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try { await store.saveJournal({ id: sel.id, ...form }); store.notify('Pengaturan jurnal disimpan.', 'ok'); } catch (ex) { store.notify(ex.message, 'bad'); }
    setBusy(false);
  }

  return (
    <>
      <section className="pane pane-list" aria-label="Daftar jurnal">
        <div className="list-head">
          <h2 className="list-title">Jurnal</h2>
          <p className="list-sub">{store.journals.length} jurnal dari OJS</p>
        </div>
        {store.journals.map((j) => (
          <a key={j.id} className="card" href={href('/jurnal', { id: j.id })} aria-current={sel?.id === j.id ? 'true' : undefined}>
            <div className="card-title">{j.name}</div>
            <div className="card-body">{[j.abbr, j.issnOnline && `e-ISSN ${j.issnOnline}`, j.sinta && `SINTA ${j.sinta}`].filter(Boolean).join(' · ') || j.path}</div>
            <div className="card-foot"><span>{used(j)} pemeriksaan</span><span className="accent">{j.canEdit ? 'Anda manajer' : j.enabled ? 'Aktif' : 'Nonaktif'}</span></div>
          </a>
        ))}
      </section>

      <section className="pane pane-detail" aria-label="Detail jurnal">
        <div className="topbar" />
        {sel && (
          <div className="doc">
            <div className="gutter-row" style={{ marginTop: 12 }}>
              <span className="marker">Jurnal</span>
              <h1 className="h1">{sel.name}</h1>
            </div>
            <div className="gutter-row"><span /><p className="lede">
              Nama dan ISSN diambil dari pengaturan jurnal di OJS. Singkatan, peringkat SINTA, dan gaya sitasi disimpan di aplikasi
              ini dan dipakai di checklist serta nama berkas PDF.{ro ? ' Hanya manajer jurnal yang bisa mengubahnya.' : ''}
            </p></div>
            <form className="form" onSubmit={save}>
              <div className="field wide">
                <label htmlFor="j-name">Nama jurnal</label>
                <input id="j-name" className="input" value={sel.name} readOnly />
              </div>
              <div className="field">
                <label htmlFor="j-issnp">ISSN cetak</label>
                <input id="j-issnp" className="input" value={sel.issnPrint || '-'} readOnly />
              </div>
              <div className="field">
                <label htmlFor="j-issno">ISSN elektronik</label>
                <input id="j-issno" className="input" value={sel.issnOnline || '-'} readOnly />
              </div>
              <div className="field">
                <label htmlFor="j-abbr">Singkatan</label>
                <input id="j-abbr" className="input" value={form.abbr || ''} readOnly={ro} placeholder={sel.acronym || 'misalnya JPT'} onChange={(e) => setForm({ ...form, abbr: e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) })} />
                <span className="hint">Dipakai di nama berkas PDF, misalnya {form.abbr || 'JPT'}-1091-Pre-Acceptance.pdf.</span>
              </div>
              <div className="field">
                <label htmlFor="j-sinta">Peringkat SINTA</label>
                <select id="j-sinta" className="input" value={form.sinta || ''} disabled={ro} onChange={(e) => setForm({ ...form, sinta: e.target.value })}>
                  <option value="">Belum terakreditasi</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>SINTA {n}</option>)}
                </select>
                <span className="hint">Batas minimum referensi: SINTA 2 minimal 40, SINTA 3 minimal 30, SINTA 4 minimal 20.</span>
              </div>
              <div className="field">
                <label htmlFor="j-cite">Gaya sitasi</label>
                <select id="j-cite" className="input" value={form.citation || 'APA 7'} disabled={ro} onChange={(e) => setForm({ ...form, citation: e.target.value })}>
                  <option>APA 7</option><option>IEEE</option><option>Lainnya</option>
                </select>
              </div>
              {!ro && (
                <div className="actions wide">
                  <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
                </div>
              )}
            </form>
          </div>
        )}
      </section>
    </>
  );
}
