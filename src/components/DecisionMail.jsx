import { useEffect, useState } from 'react';
import { buildDecisionMail, decisionsFor } from '../lib/mail.js';
import { downloadBlob, safeName, journalAbbr } from '../lib/format.js';
import { Icon } from './Icons.jsx';

async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    if (el) { el.focus(); el.select(); }
    return false;
  }
}

// The email to send after a check: to the author for editor decisions, to the
// editor for reviewer recommendations and the author's proof check.
export function DecisionMail({ check }) {
  const [lang, setLang] = useState('id');
  const [due, setDue] = useState(check.due || '');
  const [edited, setEdited] = useState(false);
  const [mail, setMail] = useState(() => buildDecisionMail(check, { lang, due }));
  const [copied, setCopied] = useState('');
  const toEditor = decisionsFor(check)?.to === 'editor';
  const needsDue = !toEditor && ['revise', 'minor', 'major', 'query', 'fix'].includes(check.decision?.value);

  useEffect(() => { if (!edited) setMail(buildDecisionMail(check, { lang, due })); }, [check, lang, due, edited]);
  useEffect(() => { if (!copied) return undefined; const t = setTimeout(() => setCopied(''), 2200); return () => clearTimeout(t); }, [copied]);

  const all = `${mail.subject}\n\n${mail.body}`;
  const mailto = `mailto:?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;

  return (
    <div className="panel mail" role="region" aria-label="Surat keputusan">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <h4>{toEditor ? 'Surel untuk editor' : 'Surat keputusan editorial'}</h4>
        <div className="chips" role="radiogroup" aria-label="Bahasa surat">
          {[['id', 'Indonesia'], ['en', 'English']].map(([v, l]) => (
            <label className="chip" key={v}><input type="radio" name="mail-lang" checked={lang === v} onChange={() => { setLang(v); setEdited(false); }} /><span>{l}</span></label>
          ))}
        </div>
      </div>
      {needsDue && (
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="mail-due">Batas waktu perbaikan</label>
          <input id="mail-due" type="date" className="input" style={{ background: '#fff' }} value={due} onChange={(e) => { setDue(e.target.value); setEdited(false); }} />
        </div>
      )}
      <div className="field">
        <label htmlFor="mail-subject">Subjek</label>
        <input id="mail-subject" className="input" style={{ background: '#fff' }} value={mail.subject} onChange={(e) => { setMail({ ...mail, subject: e.target.value }); setEdited(true); }} />
      </div>
      <div className="field">
        <label htmlFor="mail-body">Isi surat</label>
        <textarea id="mail-body" className="input mail-body" value={mail.body} onChange={(e) => { setMail({ ...mail, body: e.target.value }); setEdited(true); }} />
        <span className="hint">Periksa dan sesuaikan isi sebelum dikirim. Butir yang tercantum diambil dari butir berstatus TM beserta komentarnya.</span>
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={async (e) => { if (await copyText(all, e.currentTarget.closest('.mail').querySelector('#mail-body'))) setCopied('all'); }}>
          <Icon name="copy" size={16} />{copied === 'all' ? 'Tersalin' : 'Salin subjek dan isi'}
        </button>
        <button type="button" className="btn" onClick={async (e) => { if (await copyText(mail.body, e.currentTarget.closest('.mail').querySelector('#mail-body'))) setCopied('body'); }}>
          {copied === 'body' ? 'Tersalin' : 'Salin isi saja'}
        </button>
        <button type="button" className="btn ghost" onClick={() => downloadBlob(new Blob([all], { type: 'text/plain;charset=utf-8' }), `Surat-${safeName(journalAbbr(check.journal))}-${safeName(check.manuscript?.id)}.txt`)}>Unduh .txt</button>
        <a className="btn ghost" href={mailto}>Buka di aplikasi surel</a>
        {edited && <button type="button" className="btn ghost" onClick={() => setEdited(false)}>Kembalikan ke templat</button>}
      </div>
    </div>
  );
}
