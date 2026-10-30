import { useState } from 'react';
import { makeLink } from '../lib/links.js';
import { uid } from '../lib/format.js';
import { Icon } from './Icons.jsx';

// Editor creates a pre-filled link for a reviewer or for the author's proof check.
export function LinkPanel({ check, onClose }) {
  const [role, setRole] = useState('Reviewer');
  const [round, setRound] = useState(1);
  const [code, setCode] = useState('R1');
  const [due, setDue] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  function create() {
    setLink(makeLink({
      lid: uid(), role, variant: check.variant,
      journal: check.journal, manuscript: check.manuscript,
      due: due || null, round: role === 'Reviewer' ? round : null, code: role === 'Reviewer' ? code.trim() : null,
    }));
    setCopied(false);
  }

  async function copy(e) {
    const input = e.currentTarget.parentElement.querySelector('input');
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { input.select(); }
  }

  return (
    <div className="panel" role="region" aria-label="Buat tautan">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>Buat tautan untuk reviewer atau penulis</h4>
        {onClose && <button type="button" className="icon-btn" onClick={onClose} title="Tutup"><Icon name="x" size={16} /></button>}
      </div>
      <div className="chips" role="radiogroup" aria-label="Tautan untuk">
        {[['Reviewer', 'Reviewer'], ['Penulis', 'Pemeriksaan pruf penulis']].map(([v, l]) => (
          <label className="chip" key={v}><input type="radio" name="link-role" checked={role === v} onChange={() => { setRole(v); setLink(''); }} /><span>{l}</span></label>
        ))}
      </div>
      <div className="form" style={{ margin: 0, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {role === 'Reviewer' && (
          <>
            <div className="field">
              <label htmlFor="lk-round">Putaran telaah</label>
              <select id="lk-round" className="input" style={{ background: '#fff' }} value={round} onChange={(e) => { setRound(Number(e.target.value)); setLink(''); }}>
                {[1, 2, 3].map((r) => <option key={r} value={r}>Putaran {r}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lk-code">Kode reviewer</label>
              <input id="lk-code" className="input" style={{ background: '#fff' }} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8)); setLink(''); }} />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="lk-due">Tenggat</label>
          <input id="lk-due" type="date" className="input" style={{ background: '#fff' }} value={due} onChange={(e) => { setDue(e.target.value); setLink(''); }} />
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={create}><Icon name="link" size={16} />Buat tautan</button>
      </div>
      {link && (
        <>
          <div className="copyline">
            <input className="input" readOnly value={link} aria-label="Tautan" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn" onClick={copy}><Icon name="copy" size={16} />{copied ? 'Tersalin' : 'Salin'}</button>
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Kirim lewat diskusi OJS atau surel. Tautan ini membuka checklist {role === 'Reviewer' ? 'reviewer' : 'penulis'} dengan data naskah sudah terisi.
            Tautan tidak kedaluwarsa dan tidak memeriksa siapa yang membukanya, jadi bagikan hanya kepada orang yang dituju. Bila spreadsheet terhubung, ID ini hanya bisa diisi satu kali pada tahap tersebut.
          </span>
        </>
      )}
    </div>
  );
}
