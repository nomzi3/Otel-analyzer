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

export { escapeHtml };

export function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function buildPagination(offset, itemCount, limit, onPrev, onNext) {
  const pag = document.createElement('div');
  pag.className = 'pagination';
  const prev = document.createElement('button');
  prev.textContent = '← Prev';
  prev.disabled = offset === 0;
  prev.addEventListener('click', onPrev);
  const next = document.createElement('button');
  next.textContent = 'Next →';
  next.disabled = itemCount < limit;
  next.addEventListener('click', onNext);
  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = itemCount === 0
    ? 'No results'
    : `Showing ${offset + 1}–${offset + itemCount}`;
  pag.append(prev, info, next);
  return pag;
}

export function sortByResourceAttr(items, attr) {
  if (!attr) return items;
  return [...items].sort((a, b) => {
    const va = String((a.resource_attributes || {})[attr] ?? '');
    const vb = String((b.resource_attributes || {})[attr] ?? '');
    return va.localeCompare(vb);
  });
}

export function normalizeResponse(data, primaryKey) {
  if (Array.isArray(data)) return data;
  return data[primaryKey] || data.items || data.data || [];
}

export function statusBadge(status) {
  const s = String(status).toUpperCase();
  if (s === 'ERROR' || s === '2') return `<span class="badge badge-error">ERROR</span>`;
  if (s === 'OK' || s === '1') return `<span class="badge badge-info">OK</span>`;
  return `<span class="badge badge-debug">UNSET</span>`;
}

export function getServiceName(item) { return item.service_name || item.service || ''; }
export function getTimestamp(item)   { return item.timestamp || item.time_unix_nano || ''; }

// Modal helpers
let _modalOverlay = null;

export function showModal(title, contentEl) {
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const box = document.createElement('div');
  box.className = 'modal-box';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeModal);

  const titleEl = document.createElement('h2');
  titleEl.className = 'modal-title';
  titleEl.textContent = title;

  box.appendChild(closeBtn);
  box.appendChild(titleEl);
  box.appendChild(contentEl);
  overlay.appendChild(box);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', _escHandler);
  document.body.appendChild(overlay);
  _modalOverlay = overlay;
}

export function closeModal() {
  if (_modalOverlay) {
    _modalOverlay.remove();
    _modalOverlay = null;
  }
  document.removeEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape') closeModal();
}

// Build a key-value table element from an object
export function kvTable(obj) {
  const table = document.createElement('table');
  table.className = 'kv-table';
  const entries = Object.entries(obj || {});
  if (entries.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-muted';
    p.textContent = '(none)';
    return p;
  }
  entries.forEach(([k, v]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="kv-key">${escapeHtml(k)}</td><td class="kv-val">${escapeHtml(String(v))}</td>`;
    table.appendChild(tr);
  });
  return table;
}
