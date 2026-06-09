import { formatTimestamp, serviceBadge, truncate, showSpinner, showError, showEmpty } from '../utils.js';

export async function renderAll(container, params = {}) {
  const services = params.services || [];
  const sortByAttr = params.sortByAttr || '';
  showSpinner(container);

  let logs = [], metrics = [], traces = [];

  const svcQS = services.length > 0 ? `&services=${encodeURIComponent(services.join(','))}` : '';

  try {
    const [logsRes, metricsRes, tracesRes] = await Promise.allSettled([
      fetch(`/api/v1/logs?limit=30&offset=0${svcQS}`),
      fetch(`/api/v1/metrics?limit=30&offset=0${svcQS}`),
      fetch(`/api/v1/traces?limit=30&offset=0${svcQS}`),
    ]);

    if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
      const d = await logsRes.value.json();
      logs = Array.isArray(d) ? d : (d.logs || d.items || d.data || []);
    }
    if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
      const d = await metricsRes.value.json();
      metrics = Array.isArray(d) ? d : (d.metrics || d.items || d.data || []);
    }
    if (tracesRes.status === 'fulfilled' && tracesRes.value.ok) {
      const d = await tracesRes.value.json();
      traces = Array.isArray(d) ? d : (d.traces || d.items || d.data || []);
    }
  } catch (err) {
    showError(container, `Failed to load data: ${err.message}`);
    return;
  }

  // Normalise into unified rows
  const rows = [];

  logs.forEach(l => {
    rows.push({
      type: 'LOG',
      ts: l.timestamp || l.time_unix_nano || l.observed_time_unix_nano || '',
      service: l.service_name || l.service || '',
      summary: l.pattern || l.log_pattern || l.body || l.log_body || '',
      resourceAttrs: l.resource_attributes || {},
    });
  });

  metrics.forEach(m => {
    const val = m.value !== undefined ? m.value : (m.gauge ?? m.sum ?? m.as_double ?? m.as_int ?? '');
    rows.push({
      type: 'METRIC',
      ts: m.timestamp || m.time_unix_nano || '',
      service: m.service_name || m.service || '',
      summary: `${m.metric_name || m.name || ''} = ${val}`,
      resourceAttrs: m.resource_attributes || {},
    });
  });

  traces.forEach(t => {
    const dur = t.duration_ms ?? t.duration ?? '?';
    rows.push({
      type: 'TRACE',
      ts: t.start_time || t.start_time_unix_nano || t.timestamp || '',
      service: t.service_name || t.service || t.root_service || '',
      summary: `${t.root_span_name || t.root_name || t.name || ''} (${dur}ms)`,
      resourceAttrs: t.resource_attributes || {},
    });
  });

  // Sort by resource attribute if requested, otherwise by timestamp desc
  if (sortByAttr) {
    rows.sort((a, b) => {
      const va = String(a.resourceAttrs?.[sortByAttr] ?? '');
      const vb = String(b.resourceAttrs?.[sortByAttr] ?? '');
      return va.localeCompare(vb);
    });
  } else {
    rows.sort((a, b) => {
      const ta = normalizeTs(a.ts);
      const tb = normalizeTs(b.ts);
      return tb - ta;
    });
  }

  if (rows.length === 0) {
    showEmpty(container, 'No telemetry data found.');
    return;
  }

  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">All Signals</span>
    <span class="section-count">${rows.length} records — ${logs.length} logs, ${metrics.length} metrics, ${traces.length} traces</span>
  `;
  wrapper.appendChild(header);

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Type</th>
        <th>Service</th>
        <th>Summary</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatTimestamp(row.ts)}</td>
      <td>${typeBadge(row.type)}</td>
      <td>${serviceBadge(row.service)}</td>
      <td title="${escapeAttr(row.summary)}">${truncate(row.summary, 120)}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);

  container.innerHTML = '';
  container.appendChild(wrapper);
}

function typeBadge(type) {
  const map = { LOG: 'log', METRIC: 'metric', TRACE: 'trace' };
  const cls = map[type] || 'debug';
  return `<span class="badge badge-${cls}">${type}</span>`;
}

function normalizeTs(ts) {
  if (!ts) return 0;
  // nanoseconds (>1e15) → ms; microseconds (>1e12) → ms; already ms/s
  const n = Number(ts);
  if (n > 1e15) return n / 1e6;
  if (n > 1e12) return n / 1e3;
  if (n > 1e9)  return n * 1000; // seconds → ms
  return new Date(ts).getTime() || 0;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
