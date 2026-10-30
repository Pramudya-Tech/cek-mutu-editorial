import { useEffect, useRef, useState } from 'react';
import { Icon, RoleIcon } from './Icons.jsx';
import { ROLES } from '../lib/checklists.js';
import { href } from '../lib/router.js';
import { useStore } from '../lib/store.jsx';

const NAV = [
  { id: 'baru', path: '/', label: 'Checklist baru', short: 'Baru', icon: 'plus' },
  { id: 'riwayat', path: '/riwayat', label: 'Riwayat', short: 'Riwayat', icon: 'history' },
  { id: 'jurnal', path: '/jurnal', label: 'Jurnal', short: 'Jurnal', icon: 'book' },
  { id: 'tanda-tangan', path: '/tanda-tangan', label: 'Tanda tangan', short: 'Tanda tangan', icon: 'pen' },
  { id: 'tentang', path: '/tentang', label: 'Tentang', short: 'Tentang', icon: 'info' },
];

export function Sidebar({ active, lockedRole }) {
  const { settings, setSettings, checks } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const role = lockedRole || settings.role;
  const drafts = checks.filter((c) => c.status === 'draft' && c.role === role).length;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <aside className="pane side" aria-label="Navigasi">
      <div className="brand">
        <RoleIcon role={role} />
        <div className="brand-text role-switch" ref={ref}>
          <button type="button" className="role-btn" onClick={() => setOpen((o) => !o)} disabled={!!lockedRole}
            aria-haspopup="menu" aria-expanded={open} title="Ganti peran">
            <span className="lbl">{role}</span>
            {!lockedRole && <Icon name="updown" size={14} />}
            {lockedRole && <Icon name="lock" size={13} />}
          </button>
          {lockedRole && <div className="locknote">Dibuka dari tautan editor</div>}
          {open && (
            <div className="role-menu" role="menu">
              {ROLES.map((r) => (
                <button key={r.id} type="button" role="menuitemradio" aria-checked={r.id === role} aria-current={r.id === role}
                  onClick={() => { setSettings({ role: r.id }); setOpen(false); location.hash = '#/'; }}>
                  <span className="role-row"><RoleIcon role={r.id} size={30} /><span><b>{r.label}</b><span>{r.note}</span></span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <nav className="nav" aria-label="Menu utama">
        <div className="nav-label">Ruang kerja</div>
        {NAV.slice(1).map((n) => (
          <a key={n.id} href={href(n.path)} aria-current={active === n.id ? 'page' : undefined} title={n.label}>
            <Icon name={n.icon} />
            <span className="lbl">{n.label}</span>
            {n.id === 'riwayat' && drafts > 0 && <span className="count">{drafts} draf</span>}
          </a>
        ))}
      </nav>

      <div className="side-foot">
        <a className="new-btn" href={href('/')} title="Checklist baru">
          <span className="dot"><Icon name="plus" size={14} stroke={2} /></span>
          <span className="lbl">Checklist baru</span>
        </a>
      </div>
    </aside>
  );
}

export function BottomNav({ active }) {
  return (
    <nav className="bottom-nav" aria-label="Menu utama">
      {NAV.slice(0, 4).map((n) => (
        <a key={n.id} href={href(n.path)} aria-current={active === n.id ? 'page' : undefined}>
          <Icon name={n.icon} size={20} />
          {n.short}
        </a>
      ))}
    </nav>
  );
}
