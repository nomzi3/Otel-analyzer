import { formatTimestamp, serviceBadge, truncate, showSpinner, showError, showEmpty, showModal, kvTable } from '../utils.js';

export async function renderMetrics(container, params = {}) {
  const offset = params.offset || 0;
  const metricName = params.metricName || '';
  const services = params.services || [];
  const sortByAttr = params.sortByAttr || '';
  const limit = 100;

  showSpinner(container);

  let data;
  try {
    const qs = new URLSearchParams({ limit, offset });
    if (metricName) qs.set('metric_name', metricName);
    if (services.length > 0) qs.set('services', services.join(','));
    const res = await fetch(`/api/v1/metrics?${qs}`, { signal: params.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    showError(container, `Failed to load metrics: ${err.message}`);
    return;
  }

  let metrics = Array.isArray(data) ? data : (data.metrics || data.items || data.data || []);

  if (sortByAttr) {
    metrics = [...metrics].sort((a, b) => {
      const va = String((a.resource_attributes || {})[sortByAttr] ?? '');
      const vb = String((b.resource_attributes || {})[sortByAttr] ?? '');
      return va.localeCompare(vb);
    });
  }

  if (metrics.length === 0) {
    showEmpty(container, 'No metrics found.');
    return;
  }

  // Group by (metric_name, service_name, metric_attributes key, resource_attributes key)
  const groupMap = new Map();
  for (const m of metrics) {
    const name = m.metric_name || m.name || '';
    const svc = m.service_name || m.service || '';
    const mAttrs = m.metric_attributes || m.attributes || m.labels || {};
    const rAttrs = m.resource_attributes || {};
    const key = `${name}\x00${svc}\x00${stableJson(mAttrs)}\x00${stableJson(rAttrs)}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        name, svc,
        type: m.metric_type || m.type || '',
        mAttrs, rAttrs,
        values: [],
      });
    }
    const g = groupMap.get(key);
    g.values.push({ ts: m.timestamp, value: formatMetricValue(m) });
  }

  const groups = [...groupMap.values()];

  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">Metrics</span>
    <span class="section-count">${groups.length} groups / ${metrics.length} records (offset ${offset})</span>
  `;
  wrapper.appendChild(header);

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Metric Name</th>
        <th>Service</th>
        <th>Type</th>
        <th>Attributes</th>
        <th>Points</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  groups.forEach(g => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';

    const attrsStr = Object.entries(g.mAttrs).map(([k, v]) => `${k}=${v}`).join(', ');

    tr.innerHTML = `
      <td>${truncate(g.name, 60)}</td>
      <td>${serviceBadge(g.svc)}</td>
      <td><span class="badge badge-metric">${truncate(g.type, 20)}</span></td>
      <td title="${escapeAttr(attrsStr)}">${truncate(attrsStr, 80)}</td>
      <td><span class="badge badge-metric">${g.values.length}</span></td>
    `;

    tr.addEventListener('click', () => openMetricGroupModal(g));
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
    renderMetrics(container, { ...params, services, sortByAttr, metricName, offset: Math.max(0, offset - limit) });
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = metrics.length < limit;
  nextBtn.addEventListener('click', () => {
    renderMetrics(container, { ...params, services, sortByAttr, metricName, offset: offset + limit });
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

function openMetricGroupModal(g) {
  const content = document.createElement('div');

  const svcMeta = document.createElement('p');
  svcMeta.className = 'text-muted';
  svcMeta.style.marginBottom = '1rem';
  svcMeta.textContent = `Service: ${g.svc || '(unknown)'}  ·  Type: ${g.type || '—'}  ·  ${g.values.length} data point${g.values.length !== 1 ? 's' : ''}`;
  content.appendChild(svcMeta);

  // Resource attributes
  const rSec = document.createElement('div');
  rSec.className = 'modal-section';
  const rTitle = document.createElement('div');
  rTitle.className = 'modal-section-title';
  rTitle.textContent = 'Resource Attributes';
  rSec.appendChild(rTitle);
  rSec.appendChild(kvTable(g.rAttrs));
  content.appendChild(rSec);

  // Metric attributes
  const mSec = document.createElement('div');
  mSec.className = 'modal-section';
  const mTitle = document.createElement('div');
  mTitle.className = 'modal-section-title';
  mTitle.textContent = 'Metric Attributes';
  mSec.appendChild(mTitle);
  mSec.appendChild(kvTable(g.mAttrs));
  content.appendChild(mSec);

  // Values over time
  const vSec = document.createElement('div');
  vSec.className = 'modal-section';
  const vTitle = document.createElement('div');
  vTitle.className = 'modal-section-title';
  vTitle.textContent = 'Values (newest first)';
  vSec.appendChild(vTitle);

  const vTable = document.createElement('table');
  vTable.className = 'data-table';
  vTable.innerHTML = `<thead><tr><th>Timestamp</th><th>Value</th></tr></thead>`;
  const vtbody = document.createElement('tbody');
  g.values.forEach(v => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${formatTimestamp(v.ts)}</td><td style="font-family:monospace">${escapeHtml(String(v.value))}</td>`;
    vtbody.appendChild(row);
  });
  vTable.appendChild(vtbody);
  vSec.appendChild(vTable);
  content.appendChild(vSec);

  showModal(truncate(g.name, 80), content);
}

function formatMetricValue(m) {
  if (m.value !== undefined && m.value !== null) return m.value;
  if (m.gauge !== undefined) return m.gauge;
  if (m.sum !== undefined) return m.sum;
  if (m.count !== undefined) return `count=${m.count}`;
  if (m.as_double !== undefined) return m.as_double;
  if (m.as_int !== undefined) return m.as_int;
  return '—';
}

function stableJson(obj) {
  const keys = Object.keys(obj || {}).sort();
  return keys.map(k => `${k}=${obj[k]}`).join('\x01');
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
