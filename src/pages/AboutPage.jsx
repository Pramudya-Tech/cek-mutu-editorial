import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { href } from '../lib/router.js';
import { fmtDateTime } from '../lib/format.js';

export function AboutPage() {
  const store = useStore();
  const [doc, setDoc] = useState('');
  const [result, setResult] = useState(null);

  async function verify(e) {
    e.preventDefault();
    const id = doc.trim().toUpperCase();
    if (!id) return;
    setResult({ loading: true });
    try { setResult(await api.get(`verify/${encodeURIComponent(id)}`)); } catch (ex) { setResult({ error: ex.message }); }
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
            Akun, peran, naskah, dan penugasan review dibaca dari OJS; aplikasi tidak pernah mengubah data OJS.
          </p>

          <h3 id="verifikasi">Cek ID dokumen</h3>
          <p>Setiap PDF mencetak ID dokumen. Masukkan ID itu untuk memastikan PDF berasal dari pemeriksaan yang tercatat.</p>
          <form onSubmit={verify} className="copyline" style={{ maxWidth: 520 }}>
            <input className="input" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="misalnya 8FCE-82D0-EB39-9987-0C1B" aria-label="ID dokumen" />
            <button type="submit" className="btn">Cek</button>
          </form>
          {result?.loading && <p className="meta-line">Memeriksa…</p>}
          {result?.error && <div className="problems" role="alert">{result.error}</div>}
          {result && !result.loading && !result.error && (result.found ? (
            <div className="notice"><b>Tercatat: {result.step}{result.round ? ` putaran ${result.round}` : ''} untuk ID {result.msid}</b>
              <span>{result.journal} · selesai {fmtDateTime(result.finishedAt)}{result.revision > 1 ? ` · revisi ${result.revision}` : ''}{result.name ? ` · ${result.name}` : ''}
                {result.checkId && <> · <a href={href(`/cek/${result.checkId}`)}>buka pemeriksaan</a></>}</span></div>
          ) : (
            <div className="notice bad"><b>ID dokumen tidak ditemukan.</b><span>PDF ini tidak berasal dari pemeriksaan yang tercatat di aplikasi ini, atau ID-nya salah ketik.</span></div>
          ))}

          <h3>Di mana data disimpan</h3>
          <p>
            Isian checklist, PDF yang diekspor, dan tanda tangan tersimpan di database aplikasi pada server, terpisah dari
            database OJS. Draf tersimpan otomatis setiap kali Anda mengubah isian.
          </p>
          <h3>Siapa melihat apa</h3>
          <ul>
            <li>Manajer jurnal melihat semua pemeriksaan di jurnalnya; editor bagian melihat naskah yang ditugaskan kepadanya di OJS.</li>
            <li>Reviewer hanya melihat checklist review miliknya sendiri, tanpa nama penulis.</li>
            <li>Penulis hanya melihat pemeriksaan pruf miliknya sendiri.</li>
            <li>Satu tahap hanya bisa diperiksa sekali per ID submission. Perubahan setelah selesai dibuat sebagai revisi.</li>
          </ul>
          <h3>Pintasan papan ketik</h3>
          <ul>
            <li>J dan K berpindah antarbutir.</li>
            <li>M memberi status Memenuhi, T memberi status Tidak memenuhi pada butir yang sedang dipilih.</li>
          </ul>
          <h3>Akun</h3>
          <p>Masuk sebagai {store.me.user.name} ({store.me.user.username}) dengan peran {store.me.roles.join(', ')}.</p>
        </div>
      </div>
    </section>
  );
}
