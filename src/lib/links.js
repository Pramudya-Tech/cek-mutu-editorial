// Role links: the editor's preset values travel after the # of the URL, so
// they are read in the browser and never sent to the server hosting the app.

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// payload: { v, lid, role, variant, journal, manuscript:{id,title}, due, round, code, from }
export function makeLink(payload) {
  const data = b64urlEncode(JSON.stringify({ v: 1, ...payload }));
  const base = location.href.split('#')[0];
  return `${base}#/tautan?d=${data}`;
}

export function readLink(d) {
  try {
    const p = JSON.parse(b64urlDecode(d));
    if (!p || p.v !== 1 || !['Reviewer', 'Penulis'].includes(p.role)) return null;
    return p;
  } catch {
    return null;
  }
}
