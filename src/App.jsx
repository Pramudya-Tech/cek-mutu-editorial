import { useStore } from './lib/store.jsx';
import { useRoute } from './lib/router.js';
import { Sidebar, BottomNav } from './components/Sidebar.jsx';
import { StartPage } from './pages/StartPage.jsx';
import { CheckPage } from './pages/CheckPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { JournalsPage } from './pages/JournalsPage.jsx';
import { SignaturePage } from './pages/SignaturePage.jsx';
import { AboutPage } from './pages/AboutPage.jsx';
import { LinkPage } from './pages/LinkPage.jsx';

export default function App() {
  const store = useStore();
  const route = useRoute();
  const [top, id] = route.path;

  if (!store.ready) return <div className="shell"><div className="canvas wide" aria-busy="true" /></div>;

  let page; let active; let wide = false; let lockedRole = null;
  switch (top) {
    case 'cek': {
      const check = store.checks.find((c) => c.id === id);
      if (check?.locked) lockedRole = check.role;
      page = <CheckPage check={check} query={route.query} />;
      active = 'riwayat';
      break;
    }
    case 'riwayat': page = <HistoryPage query={route.query} />; active = 'riwayat'; break;
    case 'jurnal': page = <JournalsPage query={route.query} />; active = 'jurnal'; break;
    case 'tanda-tangan': page = <SignaturePage />; active = 'tanda-tangan'; wide = true; break;
    case 'tentang': page = <AboutPage />; active = 'tentang'; wide = true; break;
    case 'tautan': page = <LinkPage query={route.query} />; wide = true; break;
    default: page = <StartPage query={route.query} />; active = 'baru';
  }

  return (
    <div className="shell">
      <div className={`canvas${wide ? ' wide' : ''}`}>
        <Sidebar active={active} lockedRole={lockedRole} />
        {page}
      </div>
      <BottomNav active={active} />
      {store.toast && <div className={`toast ${store.toast.tone}`} role="status">{store.toast.text}</div>}
    </div>
  );
}
