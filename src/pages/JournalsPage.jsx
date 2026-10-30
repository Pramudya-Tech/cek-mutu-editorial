import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { href, go } from '../lib/router.js';
import { uid } from '../lib/format.js';
import { Icon } from '../components/Icons.jsx';

const EMPTY = { name: '', abbr: '', issnPrint: '', issnOnline: '', sinta: '', citation: 'APA 7' };

export function JournalsPage({ query }) {
  const store = useStore();
  const isNew = query.baru === '1';
  const sel = isNew ? null : store.journals.find((j) => j.id === query.id) || store.journals[0];
  const [form, setForm] = useState(EMPTY);
  const [ask, setAsk] = useState(false);
  useEffect(() => { setForm(isNew ? EMPTY : { ...EMPTY, ...sel }); setAsk(false); }, [isNew, sel?.id]);

  const used = (j) => store.checks.filter((c) => c.journal?.name === j.name).length;
  const ro = !isNew && sel?.builtIn;

  function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const j = { ...form, name: form.name.trim(), id: isNew ? uid() : sel.id, sinta: form.sinta ? Number(form.sinta) : '' };
    delete j.builtIn;
    store.saveJournal(j);
    store.setSettings({ journalId: j.id });
    store.notify(isNew ? 'Jurnal ditambahkan.' : 'Jurnal disimpan.', 'ok');
    go('/jurnal', { id: j.id });
  }

  return (
    <>
      <section className="pane pane-list" aria-label="Daftar jurnal">
        <div className="list-head">
          <h2 className="list-title">Jurnal</h2>
          <p className="list-sub">{store.journals.length} jurnal tersedia</p>
        </div>
        {store.journals.map((j) => (
          <a key={j.id} className="card" href={href('/jurnal', { id: j.id })} aria-current={!isNew && sel?.id === j.id ? 'true' : undefined}>
            <div className="card-title">{j.name}</div>
            <div className="card-body">{[j.issnOnline && `e-ISSN ${j.issnOnline}`, j.sinta && `SINTA ${j.sinta}`].filter(Boolean).join(' · ') || 'Belum ada detail'}</div>
            <div className="card-foot"><span>{used(j)} pemeriksaan</span><span className="accent">{j.builtIn ? 'Bawaan' : 'Peramban ini'}</span></div>
          </a>
        ))}
        <a className="btn" href={href('/jurnal', { baru: '1' })}><Icon name="plus" size={16} />Tambah jurnal</a>
      </section>

      <section className="pane pane-detail" aria-label="Detail jurnal">
        <div className="topbar" />
        <div className="doc">
          <div className="gutter-row" style={{ marginTop: 12 }}>
            <span className="marker">{isNew ? 'Baru' : 'Jurnal'}</span>
            <h1 className="h1">{isNew ? 'Tambah jurnal' : sel?.name}</h1>
          </div>
          <div className="gutter-row"><span /><p className="lede">
            {ro ? 'Jurnal bawaan diatur di berkas src/data/journals.json pada repositori, sehingga sama untuk semua pengguna setelah aplikasi diterbitkan ulang.'
              : 'Jurnal yang ditambahkan di sini hanya tersimpan di peramban ini. Untuk menjadikannya bawaan bagi semua pengguna, tambahkan juga ke src/data/journals.json.'}
          </p></div>
          <form className="form" onSubmit={save}>
            <div className="field wide">
              <label htmlFor="j-name">Nama jurnal</label>
              <input id="j-name" className="input" value={form.name} readOnly={ro} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="j-abbr">Singkatan</label>
              <input id="j-abbr" className="input" value={form.abbr || ''} readOnly={ro} placeholder="misalnya JAAIE" onChange={(e) => setForm({ ...form, abbr: e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) })} />
              <span className="hint">Dipakai di nama berkas PDF, misalnya JAAIE-1091-Pre-Acceptance.pdf.</span>
            </div>
            <div className="field">
              <label htmlFor="j-issnp">ISSN cetak</label>
              <input id="j-issnp" className="input" value={form.issnPrint} readOnly={ro} placeholder="0000-0000" onChange={(e) => setForm({ ...form, issnPrint: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="j-issno">ISSN elektronik</label>
              <input id="j-issno" className="input" value={form.issnOnline} readOnly={ro} placeholder="0000-0000" onChange={(e) => setForm({ ...form, issnOnline: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="j-sinta">Peringkat SINTA</label>
              <select id="j-sinta" className="input" value={form.sinta} disabled={ro} onChange={(e) => setForm({ ...form, sinta: e.target.value })}>
                <option value="">Belum terakreditasi</option>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>SINTA {n}</option>)}
              </select>
              <span className="hint">Batas minimum referensi: SINTA 2 minimal 40, SINTA 3 minimal 30, SINTA 4 minimal 20.</span>
            </div>
            <div className="field">
              <label htmlFor="j-cite">Gaya sitasi</label>
              <select id="j-cite" className="input" value={form.citation} disabled={ro} onChange={(e) => setForm({ ...form, citation: e.target.value })}>
                <option>APA 7</option><option>IEEE</option><option>Lainnya</option>
              </select>
            </div>
            {!ro && (
              <div className="actions wide">
                <button type="submit" className="btn primary">{isNew ? 'Tambah jurnal' : 'Simpan'}</button>
                {!isNew && !ask && <button type="button" className="btn ghost" onClick={() => setAsk(true)}>Hapus jurnal</button>}
                {ask && (
                  <span className="inline-confirm">Hapus {sel.name} dari peramban ini? Pemeriksaan yang sudah ada tidak ikut terhapus.
                    <button type="button" className="btn danger" onClick={() => { store.deleteJournal(sel.id); go('/jurnal'); }}>Hapus</button>
                    <button type="button" className="btn ghost" onClick={() => setAsk(false)}>Batal</button>
                  </span>
                )}
              </div>
            )}
          </form>
        </div>
      </section>
    </>
  );
}
