// Calls to the Python server. Paths are relative so the app also works when it
// is served under a sub-path, for example https://jurnal.ac.id/cekmutu/.

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

async function call(method, path, body) {
  const headers = { 'X-Requested-With': 'cekmutu' };
  let payload;
  if (body instanceof Blob) {
    headers['Content-Type'] = body.type || 'application/octet-stream';
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`api/${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Server aplikasi tidak bisa dihubungi. Periksa apakah server Python masih berjalan.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(data?.message || `Server menjawab ${res.status}`, res.status, data);
  return data;
}

export const api = {
  get: (p) => call('GET', p),
  post: (p, b = {}) => call('POST', p, b),
  put: (p, b = {}) => call('PUT', p, b),
  del: (p) => call('DELETE', p),
  upload: (p, blob) => call('POST', p, blob),
  url: (p) => `api/${p}`,
};
