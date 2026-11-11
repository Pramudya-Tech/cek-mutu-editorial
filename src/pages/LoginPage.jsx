import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { RoleIcon } from '../components/Icons.jsx';

export function LoginPage() {
  const store = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(store.bootError);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) { setError('Isi nama pengguna dan kata sandi.'); return; }
    setBusy(true); setError('');
    try { await store.login(username.trim(), password); } catch (ex) { setError(ex.message); setBusy(false); }
  }

  return (
    <div className="shell">
      <main className="login">
        <form className="login-card" onSubmit={submit} noValidate>
          <div className="login-brand">
            <RoleIcon role="Editor" size={44} />
            <div>
              <b>Cek Mutu Editorial</b>
              <span>Checklist mutu naskah untuk OJS</span>
            </div>
          </div>
          <h1 className="h1" style={{ fontSize: 26, margin: '6px 0 2px' }}>Masuk</h1>
          <p className="lede" style={{ margin: 0 }}>Gunakan akun OJS Anda. Peran editor, reviewer, atau penulis diambil dari OJS.</p>
          <div className="field">
            <label htmlFor="lg-user">Nama pengguna atau surel</label>
            <input id="lg-user" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="lg-pass">Kata sandi</label>
            <input id="lg-pass" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <div className="problems" role="alert">{error}</div>}
          <button type="submit" className="btn primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
          <span className="hint" style={{ fontSize: 12.5, color: 'var(--muted)' }}>Lupa kata sandi? Atur ulang lewat halaman masuk OJS.</span>
        </form>
      </main>
    </div>
  );
}
