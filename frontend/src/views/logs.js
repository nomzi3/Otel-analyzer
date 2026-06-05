import { formatTimestamp, severityBadge, serviceBadge, truncate, showSpinner, showError, showEmpty } from '../utils.js';

export async function renderLogs(container, params = {}) {
  const offset = params.offset || 0;
  const service = params.service || '';
  const limit = 100;

  showSpinner(container);

  let data;
  try {
    const qs = new URLSearchParams({ limit, offset });
    if (service) qs.set('service', service);
    const res = await fetch(`/api/v1/logs?${qs}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    showError(container, `Failed to load logs: ${err.message}`);
    return;
  }

  const logs = Array.isArray(data) ? data : (data.logs || data.items || data.data || []);

  if (logs.length === 0) {
    showEmpty(container, 'No logs found.');
    return;
  }

  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">Logs</span>
    <span class="section-count">${logs.length} records (offset ${offset})</span>
  `;
  wrapper.appendChild(header);

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Service</th>
        <th>Severity</th>
        <th>Pattern</th>
        <th>Body</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  logs.forEach((log, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    const ts = log.timestamp || log.time_unix_nano || log.observed_time_unix_nano || '';
    const svc = log.service_name || log.service || '';
    const sev = log.severity_text || log.severity || 'INFO';
    const pattern = log.pattern || log.log_pattern || '';
    const body = log.body || log.log_body || '';

    tr.innerHTML = `
      <td>${formatTimestamp(ts)}</td>
      <td>${serviceBadge(svc)}</td>
      <td>${severityBadge(sev)}</td>
      <td title="${escapeAttr(pattern)}">${truncate(pattern, 80)}</td>
      <td title="${escapeAttr(body)}">${truncate(body, 120)}</td>
    `;

    const expandTr = document.createElement('tr');
    expandTr.className = 'expand-row';
    expandTr.style.display = 'none';
    const expandTd = document.createElement('td');
    expandTd.colSpan = 5;

    const attrs = log.attributes || log.resource_attributes || {};
    const detail = {
      timestamp: ts,
      service: svc,
      severity: sev,
      pattern,
      body,
      attributes: attrs,
      ...(log.trace_id ? { trace_id: log.trace_id } : {}),
      ...(log.span_id  ? { span_id:  log.span_id  } : {}),
    };

    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(detail, null, 2);
    expandTd.appendChild(pre);
    expandTr.appendChild(expandTd);

    tr.addEventListener('click', () => {
      const hidden = expandTr.style.display === 'none';
      expandTr.style.display = hidden ? 'table-row' : 'none';
    });

    tbody.appendChild(tr);
    tbody.appendChild(expandTr);
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
    renderLogs(container, { ...params, offset: Math.max(0, offset - limit) });
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = logs.length < limit;
  nextBtn.addEventListener('click', () => {
    renderLogs(container, { ...params, offset: offset + limit });
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

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
