import { formatTimestamp, severityBadge, serviceBadge, truncate, showSpinner, showError, showEmpty, showModal, kvTable } from '../utils.js';

const SEVERITY_ORDER = { FATAL: 0, ERROR4: 1, ERROR3: 2, ERROR2: 3, ERROR: 4, WARN: 5, WARNING: 5, INFO4: 6, INFO3: 7, INFO2: 8, INFO: 9, DEBUG4: 10, DEBUG3: 11, DEBUG2: 12, DEBUG: 13, TRACE: 14 };
function sevRank(sev) { return SEVERITY_ORDER[String(sev).toUpperCase()] ?? 99; }

export async function renderLogs(container, params = {}) {
  const offset = params.offset || 0;
  const services = params.services || [];
  const sortByAttr = params.sortByAttr || '';
  const logSeverity = params.logSeverity || '';
  const logPattern = params.logPattern || '';
  const limit = 100;

  showSpinner(container);

  let data;
  try {
    const qs = new URLSearchParams({ limit, offset });
    if (services.length > 0) qs.set('services', services.join(','));
    if (logPattern) qs.set('log_pattern', logPattern);
    if (logSeverity) qs.set('severity', logSeverity);
    const res = await fetch(`/api/v1/logs?${qs}`, { signal: params.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    showError(container, `Failed to load logs: ${err.message}`);
    return;
  }

  let logs = Array.isArray(data) ? data : (data.logs || data.items || data.data || []);

  if (sortByAttr) {
    logs = [...logs].sort((a, b) => {
      const va = String((a.resource_attributes || {})[sortByAttr] ?? '');
      const vb = String((b.resource_attributes || {})[sortByAttr] ?? '');
      return va.localeCompare(vb);
    });
  }

  if (logs.length === 0) {
    showEmpty(container, 'No logs found.');
    return;
  }

  // Group by (log_pattern, service_name)
  const groupMap = new Map();
  for (const log of logs) {
    const svc = log.service_name || log.service || '';
    const pattern = log.log_pattern || log.pattern || '';
    const key = `${pattern}\x00${svc}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { pattern, svc, examples: [], worstSev: 99, latestTs: '' });
    }
    const g = groupMap.get(key);
    g.examples.push(log);
    const rank = sevRank(log.severity_text || log.severity || '');
    if (rank < g.worstSev) { g.worstSev = rank; g.sev = log.severity_text || log.severity || 'INFO'; }
    if (!g.latestTs || String(log.timestamp) > String(g.latestTs)) g.latestTs = log.timestamp;
  }

  let groups = [...groupMap.values()];

  // Sort groups by worst severity first by default
  groups.sort((a, b) => a.worstSev - b.worstSev);

  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">Logs</span>
    <span class="section-count">${groups.length} patterns / ${logs.length} records (offset ${offset})</span>
  `;
  wrapper.appendChild(header);

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Latest</th>
        <th>Service</th>
        <th>Severity</th>
        <th>Pattern</th>
        <th>Count</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  groups.forEach(g => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td>${formatTimestamp(g.latestTs)}</td>
      <td>${serviceBadge(g.svc)}</td>
      <td>${severityBadge(g.sev || 'INFO')}</td>
      <td title="${escapeAttr(g.pattern)}">${truncate(g.pattern, 80)}</td>
      <td><span class="badge badge-metric">${g.examples.length}</span></td>
    `;

    tr.addEventListener('click', () => openLogGroupModal(g));
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);

  // Pagination
  const pag = document.createElement('div');
  pag.className = 'pagination';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = offset === 0;
  prevBtn.addEventListener('click', () => {
    renderLogs(container, { ...params, services, sortByAttr, logSeverity, logPattern, offset: Math.max(0, offset - limit) });
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = logs.length < limit;
  nextBtn.addEventListener('click', () => {
    renderLogs(container, { ...params, services, sortByAttr, logSeverity, logPattern, offset: offset + limit });
  });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Showing ${offset + 1}–${offset + logs.length}`;

  pag.appendChild(prevBtn);
  pag.appendChild(info);
  pag.appendChild(nextBtn);
  wrapper.appendChild(pag);

  container.innerHTML = '';
  container.appendChild(wrapper);
}

function openLogGroupModal(g) {
  const content = document.createElement('div');

  const meta = document.createElement('p');
  meta.className = 'text-muted';
  meta.style.marginBottom = '1rem';
  meta.textContent = `Service: ${g.svc || '(unknown)'}  ·  ${g.examples.length} occurrence${g.examples.length !== 1 ? 's' : ''}`;
  content.appendChild(meta);

  const sec = document.createElement('div');
  sec.className = 'modal-section';

  const secTitle = document.createElement('div');
  secTitle.className = 'modal-section-title';
  secTitle.textContent = 'Examples (up to 20)';
  sec.appendChild(secTitle);

  const exTable = document.createElement('table');
  exTable.className = 'data-table';
  exTable.innerHTML = `<thead><tr><th>Timestamp</th><th>Severity</th><th>Body</th></tr></thead>`;
  const etbody = document.createElement('tbody');
  g.examples.slice(0, 20).forEach(log => {
    const etr = document.createElement('tr');
    etr.innerHTML = `
      <td>${formatTimestamp(log.timestamp)}</td>
      <td>${severityBadge(log.severity_text || log.severity || 'INFO')}</td>
      <td style="word-break:break-all">${escapeHtml(log.body || log.log_body || '')}</td>
    `;
    etbody.appendChild(etr);
  });
  exTable.appendChild(etbody);
  sec.appendChild(exTable);
  content.appendChild(sec);

  showModal(truncate(g.pattern, 80) || '(no pattern)', content);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
