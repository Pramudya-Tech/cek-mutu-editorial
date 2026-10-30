// Small helpers shared across the app.

export const cx = (...xs) => xs.filter(Boolean).join(' ');

export function plain(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function fmtDate(v) {
  if (!v) return '';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return String(v);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

export function relDays(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return 'hari ini';
  if (days === 1) return 'kemarin';
  if (days < 30) return `${days} hari lalu`;
  return fmtDate(iso);
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr + 'T23:59:59');
  return Math.ceil((due.getTime() - Date.now()) / 864e5);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function safeName(s, fallback = 'naskah') {
  const v = String(s || '').trim().replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
  return v || fallback;
}

export const digitsOnly = (v) => String(v ?? '').replace(/\D+/g, '').slice(0, 12);

export function journalAbbr(journal) {
  if (journal?.abbr) return journal.abbr;
  const words = String(journal?.name || '').replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|dan|the|in|on|for|untuk|di)$/i.test(w));
  return words.map((w) => w[0].toUpperCase()).join('').slice(0, 8) || 'Jurnal';
}
