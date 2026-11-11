import { useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { processSignature } from '../lib/actions.js';
import { ROLES } from '../lib/checklists.js';
import { Icon } from '../components/Icons.jsx';

const DEFAULT_ROLE = { Editor: 'Editor', Reviewer: 'Reviewer', Penulis: 'Penulis korespondensi' };

export function SignaturePage() {
  const store = useStore();
  const sig = store.signature || {};
  const [name, setName] = useState(sig.name || '');
  const [roles, setRoles] = useState({ ...DEFAULT_ROLE, ...(sig.roles || {}) });
  const [image, setImage] = useState(sig.image || '');
  const [removeWhite, setRemoveWhite] = useState(true);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState(false);
  const fileRef = useRef(null);

  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setErr('');
    try { setImage(await processSignature(file, { removeWhite })); } catch (ex) { setErr(ex.message); }
  }

  async function save(e) {
    e.preventDefault();
    try {
      await store.setSignature({ name: name.trim(), roles, image });
      store.notify('Tanda tangan disimpan di akun Anda.', 'ok');
    } catch (ex) { store.notify(ex.message, 'bad'); }
  }

  return (
    <section className="pane pane-detail" aria-label="Tanda tangan">
      <div className="topbar" />
      <div className="doc">
        <div className="gutter-row" style={{ marginTop: 12 }}>
          <span className="marker">TTD</span>
          <h1 className="h1">Tanda tangan saya</h1>
        </div>
        <div className="gutter-row"><span /><p className="lede">
          Simpan nama dan gambar tanda tangan sekali, lalu setiap pemeriksaan baru memakainya otomatis. Gambar ditempatkan di kotak
          tanda tangan pada PDF. Tersimpan di akun Anda pada aplikasi ini, bukan di OJS.
        </p></div>
        <form className="form" onSubmit={save}>
          <div className="field wide">
            <label htmlFor="ts-name">Nama lengkap dengan gelar</label>
            <input id="ts-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="misalnya Dr. Andi Rahman, M.Pd." autoComplete="name" />
          </div>
          {ROLES.filter((r) => store.me.roles.includes(r.id)).map((r) => (
            <div className="field" key={r.id}>
              <label htmlFor={`ts-role-${r.id}`}>Peran saat mengisi sebagai {r.label}</label>
              <input id={`ts-role-${r.id}`} className="input" value={roles[r.id] || ''} onChange={(e) => setRoles({ ...roles, [r.id]: e.target.value })} />
            </div>
          ))}
          <div className="field wide">
            <span className="lab">Gambar tanda tangan</span>
            <div className="sig-box" style={{ minHeight: 190 }}>
              {image ? <img src={image} alt="Pratinjau tanda tangan" /> : (
                <div className="empty">Tanda tangani kertas putih dengan pena gelap, foto atau pindai, lalu unggah di sini.<br />PNG dengan latar transparan memberi hasil terbaik.</div>
              )}
            </div>
            <div className="actions" style={{ marginTop: 6 }}>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Unggah gambar</button>
              {image && <button type="button" className="btn ghost" onClick={() => setImage('')}>Hapus gambar</button>}
              <label className="check"><input type="checkbox" checked={removeWhite} onChange={(e) => setRemoveWhite(e.target.checked)} /><span>Hapus latar putih</span></label>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={onFile} />
            </div>
            {err && <div className="problems" role="alert">{err}</div>}
          </div>
          <div className="actions wide">
            <button type="submit" className="btn primary">Simpan tanda tangan</button>
            {store.signature && !ask && <button type="button" className="btn ghost" onClick={() => setAsk(true)}>Lupakan tanda tangan</button>}
            {ask && (
              <span className="inline-confirm">Hapus nama dan tanda tangan tersimpan? PDF yang sudah dibuat tidak berubah.
                <button type="button" className="btn danger" onClick={async () => { await store.setSignature(null); setName(''); setImage(''); setAsk(false); }}>Hapus</button>
                <button type="button" className="btn ghost" onClick={() => setAsk(false)}>Batal</button>
              </span>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

