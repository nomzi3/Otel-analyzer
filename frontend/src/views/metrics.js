import { formatTimestamp, serviceBadge, truncate, showSpinner, showError, showEmpty } from '../utils.js';

export async function renderMetrics(container, params = {}) {
  const offset = params.offset || 0;
  const metric_name = params.metric_name || '';
  const limit = 100;

  showSpinner(container);

  let data;
  try {
    const qs = new URLSearchParams({ limit, offset });
    if (metric_name) qs.set('metric_name', metric_name);
    const res = await fetch(`/api/v1/metrics?${qs}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    showError(container, `Failed to load metrics: ${err.message}`);
    return;
  }

  const metrics = Array.isArray(data) ? data : (data.metrics || data.items || data.data || []);

  if (metrics.length === 0) {
    showEmpty(container, 'No metrics found.');
    return;
  }

  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">Metrics</span>
    <span class="section-count">${metrics.length} records (offset ${offset})</span>
  `;
  wrapper.appendChild(header);

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Service</th>
        <th>Metric Name</th>
        <th>Type</th>
        <th>Value</th>
        <th>Attributes</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  metrics.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    const ts = m.timestamp || m.time_unix_nano || m.start_time_unix_nano || '';
    const svc = m.service_name || m.service || '';
    const name = m.metric_name || m.name || '';
    const type = m.metric_type || m.type || '';
    const value = formatMetricValue(m);
    const attrs = m.attributes || m.labels || {};
    const attrsStr = Object.entries(attrs).map(([k, v]) => `${k}=${v}`).join(', ');

    tr.innerHTML = `
      <td>${formatTimestamp(ts)}</td>
      <td>${serviceBadge(svc)}</td>
      <td>${truncate(name, 60)}</td>
      <td><span class="badge badge-metric">${truncate(type, 20)}</span></td>
      <td>${value}</td>
      <td title="${escapeAttr(attrsStr)}">${truncate(attrsStr, 80)}</td>
    `;

    const expandTr = document.createElement('tr');
    expandTr.className = 'expand-row';
    expandTr.style.display = 'none';
    const expandTd = document.createElement('td');
    expandTd.colSpan = 6;

    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(m, null, 2);
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
    renderMetrics(container, { ...params, offset: Math.max(0, offset - limit) });
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = metrics.length < limit;
  nextBtn.addEventListener('click', () => {
    renderMetrics(container, { ...params, offset: offset + limit });
  });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Showing ${offset + 1}–${offset + metrics.length}`;

  pag.appendChild(prevBtn);
  pag.appendChild(info);
  pag.appendChild(nextBtn);
  wrapper.appendChild(pag);

  container.innerHTML = '';
  container.appendChild(wrapper);
}

function formatMetricValue(m) {
  if (m.value !== undefined && m.value !== null) return String(m.value);
  if (m.gauge !== undefined) return String(m.gauge);
  if (m.sum !== undefined) return String(m.sum);
  if (m.count !== undefined) return `count=${m.count}`;
  if (m.as_double !== undefined) return String(m.as_double);
  if (m.as_int !== undefined) return String(m.as_int);
  return '—';
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
