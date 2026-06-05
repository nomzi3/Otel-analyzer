// Timestamp formatting
export function formatTimestamp(ts) {
  if (!ts) return '—';
  let date;
  const n = Number(ts);
  if (!isNaN(n) && n > 0) {
    if (n > 1e15) date = new Date(n / 1e6);
    else if (n > 1e12) date = new Date(n / 1e3);
    else if (n > 1e9)  date = new Date(n * 1000);
    else date = new Date(n);
  } else {
    date = new Date(ts);
  }
  if (isNaN(date.getTime())) return String(ts).slice(0, 23);

  const pad = (v, n = 2) => String(v).padStart(n, '0');
  const Y  = date.getUTCFullYear();
  const Mo = pad(date.getUTCMonth() + 1);
  const D  = pad(date.getUTCDate());
  const H  = pad(date.getUTCHours());
  const Mi = pad(date.getUTCMinutes());
  const S  = pad(date.getUTCSeconds());
  const ms = pad(date.getUTCMilliseconds(), 3);
  return `${Y}-${Mo}-${D} ${H}:${Mi}:${S}.${ms}`;
}

// Severity badge
export function severityBadge(sev) {
  const s = String(sev).toUpperCase();
  if (s === 'ERROR' || s === 'FATAL' || s === 'CRITICAL' || s === 'ERROR2' || s === 'ERROR3' || s === 'ERROR4' || Number(sev) >= 17)
    return `<span class="badge badge-error">${s}</span>`;
  if (s === 'WARN' || s === 'WARNING' || Number(sev) >= 13)
    return `<span class="badge badge-warn">${s}</span>`;
  if (s === 'INFO' || s === 'INFO2' || s === 'INFO3' || s === 'INFO4' || Number(sev) >= 9)
    return `<span class="badge badge-info">${s}</span>`;
  return `<span class="badge badge-debug">${s || 'DEBUG'}</span>`;
}

// Service badge — color by djb2 hash of service name
const SERVICE_COLORS = [
  '#6366f1', '#3b82f6', '#a855f7', '#ec4899',
  '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
];

export function serviceBadge(name) {
  if (!name) return '<span class="badge-service" style="color:var(--text-muted)">—</span>';
  const hash = djb2(name);
  const color = SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
  const bg = color + '22';
  const border = color + '55';
  return `<span class="badge-service" style="color:${color};background:${bg};border:1px solid ${border}">${escapeHtml(name)}</span>`;
}

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return h;
}

// Truncate string
export function truncate(str, max) {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Spinner
export function showSpinner(container) {
  container.innerHTML = `
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <span>Loading…</span>
    </div>
  `;
}

// Error
export function showError(container, message) {
  container.innerHTML = `
    <div class="error-box">
      <span>⚠</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

// Empty
export function showEmpty(container, message) {
  container.innerHTML = `<div class="empty-box">${escapeHtml(message)}</div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
