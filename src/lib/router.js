import { useEffect, useState } from 'react';

// Hash routing works on GitHub Pages without server rewrites:
// #/cek/<id>?bagian=identitas  ->  { path: ['cek', '<id>'], query: { bagian: 'identitas' } }

function parse() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const [p, q = ''] = raw.split('?');
  const path = p.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(q));
  return { path, query, raw };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path, query) {
  const q = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  const next = '#' + (path.startsWith('/') ? path : '/' + path) + (q === '?' ? '' : q);
  if (location.hash !== next) location.hash = next;
}

export function href(path, query) {
  const q = query ? '?' + new URLSearchParams(query).toString() : '';
  return '#' + (path.startsWith('/') ? path : '/' + path) + q;
}
