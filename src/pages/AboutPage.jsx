import { useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { readJsonFile } from '../lib/actions.js';
import { ping, registryConfig } from '../lib/registry.js';
import CONFIG from '../data/config.json';
import { downloadBlob, today } from '../lib/format.js';
import { Icon } from '../components/Icons.jsx';

export function AboutPage() {
  const store = useStore();
  const [ask, setAsk] = useState(false);
  const fileRef = useRef(null);
  const [url, setUrl] = useState(store.registryStored?.url ?? CONFIG.registryUrl ?? '');
  const [key, setKey] = useState(store.registryStored?.key ?? CONFIG.registryKey ?? '');
  const [test, setTest] = useState(null);

  async function saveRegistry(e) {
    e.preventDefault();
    const cfg = { url: url.trim(), key: key.trim() };
    store.setRegistry(cfg);
    setTest({ state: 'loading' });
    if (!cfg.url) { setTest({ state: 'off' }); return; }
    const r = await ping(registryConfig(cfg));
    setTest(r.ok ? { state: 'ok', rows: r.rows } : { state: 'bad', message: r.message || 'Tidak terhubung' });
  }

  function backup() {
    const data = { app: 'cek-mutu-editorial', type: 'backup', savedAt: new Date().toISOString(), checks: store.checks, journals: store.journals.filter((j) => !j.builtIn), signature: store.signature };
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `Cadangan-cek-mutu-${today()}.json`);
  }

  async function restore(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const d = await readJsonFile(file);
      if (d.app !== 'cek-mutu-editorial' || d.type !== 'backup') throw new Error('ini bukan berkas cadangan');
      (d.checks || []).forEach((c) => store.saveCheck({ ...c }));
      (d.journals || []).forEach((j) => store.saveJournal(j));
      if (d.signature && !store.signature) store.setSignature(d.signature);
      store.notify(`${(d.checks || []).length} pemeriksaan dipulihkan.`, 'ok');
    } catch (ex) { store.notify(`Cadangan tidak bisa dipulihkan: ${ex.message}.`, 'bad'); }
  }

  return (
    <section className="pane pane-detail" aria-label="Tentang">
      <div className="topbar" />
      <div className="doc">
        <div className="gutter-row" style={{ marginTop: 12 }}>
          <span className="marker">v2.3</span>
          <h1 className="h1">Tentang Cek Mutu Editorial</h1>
        </div>
        <div className="prose">
          <p>
            Aplikasi ini membantu editor, reviewer, dan penulis memeriksa naskah dengan checklist mutu editorial versi 2.3.
            Naskahnya tetap diambil dari OJS. Setiap pemeriksaan menghasilkan PDF bertanda tangan sebagai dokumentasi.
          </p>
          <h3>Di mana data disimpan</h3>
          <p>
            Semua isian, riwayat, dan gambar tanda tangan disimpan di peramban ini saja, tidak dikirim ke server mana pun.
            Membersihkan data peramban akan menghapusnya, jadi simpan PDF dan berkas isian di tempat yang aman.
          </p>
          <h3>Tentang peran dan tautan</h3>
          <p>
            Pilihan peran dan tautan dari editor mengarahkan orang ke checklist yang tepat, tetapi bukan pengaman: siapa pun yang
            membuka aplikasi bisa memilih peran lain. Tautan tidak kedaluwarsa dan tidak memeriksa siapa yang membukanya.
          </p>
          <h3>ID dokumen</h3>
          <p>
            Saat pemeriksaan diselesaikan, aplikasi menghitung sidik SHA-256 dari isian dan mencetaknya sebagai ID dokumen.
            Membuka berkas isian (.json) di halaman Riwayat akan menghitung ulang ID itu dan menunjukkan apakah isian berubah.
          </p>
          <h3>Pintasan papan ketik</h3>
          <ul>
            <li>J dan K berpindah antarbutir.</li>
            <li>M memberi status Memenuhi, T memberi status Tidak memenuhi pada butir yang sedang dipilih.</li>
          </ul>

          <h3 id="spreadsheet">Spreadsheet registri</h3>
          <p>
            Hubungkan Google Sheet agar semua perangkat melihat riwayat tahap yang sama dan satu tahap tidak bisa diulang untuk ID
            submission yang sama, termasuk pemeriksaan pruf penulis. Yang dicatat hanya tahap, status, keputusan, nama, tanggal,
            dan ID dokumen; isian checklist dan tanda tangan tetap di peramban. Cara menyiapkannya ada di apps-script/README.md.
          </p>
          <form onSubmit={saveRegistry} style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '6px 0 6px' }}>
            <div className="field">
              <label htmlFor="reg-url">URL Web App Apps Script</label>
              <input id="reg-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
            </div>
            <div className="field">
              <label htmlFor="reg-key">Kunci bersama (opsional)</label>
              <input id="reg-key" className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Sama dengan SHARED_KEY di Code.gs" />
            </div>
            <div className="actions">
              <button type="submit" className="btn primary">Simpan dan uji koneksi</button>
              {test?.state === 'loading' && <span className="sync no">Menghubungi spreadsheet…</span>}
              {test?.state === 'ok' && <span className="sync ok">Terhubung. {test.rows} catatan di spreadsheet.</span>}
              {test?.state === 'bad' && <span className="sync no" style={{ color: 'var(--bad)' }}>{test.message}. Periksa URL dan pengaturan akses Web App.</span>}
              {test?.state === 'off' && <span className="sync no">Mode lokal: duplikasi hanya diperiksa di peramban ini.</span>}
            </div>
          </form>

          <h3>Data di peramban ini</h3>
          <p>{store.checks.length} pemeriksaan, {store.journals.filter((j) => !j.builtIn).length} jurnal tambahan, {store.signature ? 'tanda tangan tersimpan' : 'tanpa tanda tangan tersimpan'}.</p>
          <div className="actions">
            <button type="button" className="btn" onClick={backup}><Icon name="download" size={16} />Cadangkan riwayat</button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Pulihkan dari cadangan</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={restore} />
            {!ask && <button type="button" className="btn ghost" onClick={() => setAsk(true)}>Bersihkan peramban ini</button>}
          </div>
          {ask && (
            <div className="inline-confirm" style={{ marginTop: 12 }}>
              Hapus semua pemeriksaan, jurnal tambahan, dan tanda tangan dari peramban ini? Tindakan ini tidak bisa dibatalkan.
              <button type="button" className="btn danger" onClick={async () => { await store.clearEverything(); setAsk(false); store.notify('Peramban ini sudah dibersihkan.'); }}>Hapus semua</button>
              <button type="button" className="btn ghost" onClick={() => setAsk(false)}>Batal</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
