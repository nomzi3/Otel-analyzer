import { formatTimestamp, serviceBadge, truncate, showSpinner, showError, showEmpty } from '../utils.js';

export async function renderTraces(container, params = {}) {
  const offset = params.offset || 0;
  const service = params.service || '';
  const limit = 50;

  showSpinner(container);

  let data;
  try {
    const qs = new URLSearchParams({ limit, offset });
    if (service) qs.set('service', service);
    const res = await fetch(`/api/v1/traces?${qs}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    showError(container, `Failed to load traces: ${err.message}`);
    return;
  }

  const traces = Array.isArray(data) ? data : (data.traces || data.items || data.data || []);

  if (traces.length === 0) {
    showEmpty(container, 'No traces found.');
    return;
  }

  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">Traces</span>
    <span class="section-count">${traces.length} records (offset ${offset})</span>
  `;
  wrapper.appendChild(header);

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Start Time</th>
        <th>Service</th>
        <th>Root Span</th>
        <th>Duration (ms)</th>
        <th>Status</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  traces.forEach((trace, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    const ts = trace.start_time || trace.start_time_unix_nano || trace.timestamp || '';
    const svc = trace.service_name || trace.service || trace.root_service || '';
    const rootName = trace.root_span_name || trace.root_name || trace.name || '';
    const durationMs = formatDuration(trace);
    const status = trace.status || trace.status_code || 'UNSET';

    tr.innerHTML = `
      <td>${formatTimestamp(ts)}</td>
      <td>${serviceBadge(svc)}</td>
      <td title="${escapeAttr(rootName)}">${truncate(rootName, 60)}</td>
      <td>${durationMs}</td>
      <td>${statusBadge(status)}</td>
    `;

    // Expandable waterfall row
    const waterfallTr = document.createElement('tr');
    waterfallTr.className = 'expand-row';
    waterfallTr.style.display = 'none';
    const waterfallTd = document.createElement('td');
    waterfallTd.colSpan = 5;
    waterfallTr.appendChild(waterfallTd);

    let loaded = false;
    tr.addEventListener('click', async () => {
      const hidden = waterfallTr.style.display === 'none';
      if (!hidden) {
        waterfallTr.style.display = 'none';
        return;
      }
      waterfallTr.style.display = 'table-row';
      if (loaded) return;
      loaded = true;

      const traceId = trace.trace_id || trace.traceId || trace.id || '';
      if (!traceId) {
        waterfallTd.innerHTML = '<div class="span-waterfall"><span style="color:var(--text-muted)">No trace ID available.</span></div>';
        return;
      }

      waterfallTd.innerHTML = '<div class="span-waterfall"><div class="spinner-wrap"><div class="spinner"></div> Loading spans…</div></div>';

      try {
        const res = await fetch(`/api/v1/traces/${encodeURIComponent(traceId)}/spans`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const spanData = await res.json();
        const spans = Array.isArray(spanData) ? spanData : (spanData.spans || spanData.data || []);
        waterfallTd.innerHTML = '';
        waterfallTd.appendChild(renderWaterfall(spans));
      } catch (err) {
        waterfallTd.innerHTML = `<div class="span-waterfall"><span style="color:var(--error)">Failed to load spans: ${err.message}</span></div>`;
      }
    });

    tbody.appendChild(tr);
    tbody.appendChild(waterfallTr);
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
    renderTraces(container, { ...params, offset: Math.max(0, offset - limit) });
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = traces.length < limit;
  nextBtn.addEventListener('click', () => {
    renderTraces(container, { ...params, offset: offset + limit });
  });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Showing ${offset + 1}–${offset + traces.length}`;

  pag.appendChild(prevBtn);
  pag.appendChild(info);
  pag.appendChild(nextBtn);
  wrapper.appendChild(pag);

  container.innerHTML = '';
  container.appendChild(wrapper);
}

function renderWaterfall(spans) {
  const div = document.createElement('div');
  div.className = 'span-waterfall';

  if (!spans || spans.length === 0) {
    div.innerHTML = '<span style="color:var(--text-muted)">No spans found.</span>';
    return div;
  }

  // Build parent-child map
  const byId = {};
  spans.forEach(s => {
    const id = s.span_id || s.spanId || s.id;
    byId[id] = s;
  });

  const roots = spans.filter(s => {
    const parent = s.parent_span_id || s.parentSpanId || '';
    return !parent || !byId[parent];
  });

  function renderSpan(span, depth) {
    const item = document.createElement('div');
    item.className = 'span-item';
    item.style.paddingLeft = `${depth * 20}px`;

    const name = span.name || span.span_name || '';
    const svc = span.service_name || span.service || '';
    const dur = formatDuration(span);

    item.innerHTML = `
      <span class="span-name">${escapeHtml(truncate(name, 60))}</span>
      <span class="span-duration">${dur}ms</span>
      ${svc ? `<span class="span-service">[${escapeHtml(svc)}]</span>` : ''}
    `;
    div.appendChild(item);

    const spanId = span.span_id || span.spanId || span.id;
    const children = spans.filter(s => (s.parent_span_id || s.parentSpanId) === spanId);
    children.forEach(child => renderSpan(child, depth + 1));
  }

  roots.forEach(r => renderSpan(r, 0));

  // Fallback: just list all spans if tree building fails
  if (roots.length === 0) {
    spans.forEach(s => {
      const item = document.createElement('div');
      item.className = 'span-item';
      const name = s.name || s.span_name || '';
      const dur = formatDuration(s);
      item.innerHTML = `<span class="span-name">${escapeHtml(truncate(name, 60))}</span><span class="span-duration">${dur}ms</span>`;
      div.appendChild(item);
    });
  }

  return div;
}

function formatDuration(obj) {
  if (obj.duration_ms !== undefined) return obj.duration_ms;
  if (obj.duration !== undefined) return obj.duration;
  const start = obj.start_time_unix_nano || obj.start_time;
  const end   = obj.end_time_unix_nano   || obj.end_time;
  if (start && end) {
    const diff = Number(BigInt(end) - BigInt(start));
    // nanoseconds → ms
    return (diff / 1e6).toFixed(2);
  }
  return '—';
}

function statusBadge(status) {
  const s = String(status).toUpperCase();
  if (s === 'ERROR' || s === '2') return `<span class="badge badge-error">ERROR</span>`;
  if (s === 'OK'    || s === '1') return `<span class="badge badge-info">OK</span>`;
  return `<span class="badge badge-debug">UNSET</span>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
