import { useEffect, useState } from 'react';
import { useStore } from './lib/store.jsx';
import { useRoute } from './lib/router.js';
import { Sidebar, BottomNav } from './components/Sidebar.jsx';
import { StartPage } from './pages/StartPage.jsx';
import { CheckPage } from './pages/CheckPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { JournalsPage } from './pages/JournalsPage.jsx';
import { SignaturePage } from './pages/SignaturePage.jsx';
import { AboutPage } from './pages/AboutPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';

export default function App() {
  const store = useStore();
  const route = useRoute();
  const [top, id] = route.path;
  const check = top === 'cek' ? store.checks.find((c) => c.id === id) : null;
  const [missing, setMissing] = useState(null);

  // List responses leave out signature images; fetch the full check when opened.
  useEffect(() => {
    if (store.me && top === 'cek' && id && (!check || check.partial)) {
      store.loadFull(id).catch(() => setMissing(id));
    }
  }, [store.me, top, id, check?.partial]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!store.ready) return <div className="shell"><div className="canvas wide" aria-busy="true" /></div>;
  if (!store.me) return <LoginPage />;
  if (!store.me.roles.length) {
    return (
      <div className="shell"><main className="login"><div className="login-card">
        <h1 className="h1" style={{ fontSize: 24 }}>Belum ada peran</h1>
        <p className="lede">Akun {store.me.user.username} belum menjadi editor, reviewer, atau penulis di jurnal mana pun di OJS.</p>
        <button type="button" className="btn" onClick={store.logout}>Keluar</button>
      </div></main></div>
    );
  }

  let page; let active; let wide = false;
  switch (top) {
    case 'cek':
      page = <CheckPage check={check?.partial ? null : check} loading={!check || check.partial} missing={missing === id} query={route.query} />;
      active = 'riwayat';
      break;
    case 'riwayat': page = <HistoryPage query={route.query} />; active = 'riwayat'; break;
    case 'jurnal': page = <JournalsPage query={route.query} />; active = 'jurnal'; break;
    case 'tanda-tangan': page = <SignaturePage />; active = 'tanda-tangan'; wide = true; break;
    case 'tentang': page = <AboutPage />; active = 'tentang'; wide = true; break;
    default: page = <StartPage query={route.query} />; active = 'baru';
  }

  return (
    <div className="shell">
      <div className={`canvas${wide ? ' wide' : ''}`}>
        <Sidebar active={active} />
        {page}
      </div>
      <BottomNav active={active} />
      {store.toast && <div className={`toast ${store.toast.tone}`} role="status">{store.toast.text}</div>}
    </div>
  );
}
