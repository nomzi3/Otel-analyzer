import { formatTimestamp, serviceBadge, truncate, showSpinner, showError, showEmpty, showModal, kvTable } from '../utils.js';

export async function renderTraces(container, params = {}) {
  const offset = params.offset || 0;
  const services = params.services || [];
  const sortByAttr = params.sortByAttr || '';
  const traceMethod = params.traceMethod || '';
  const limit = 50;

  showSpinner(container);

  let data;
  try {
    const qs = new URLSearchParams({ limit, offset });
    if (services.length > 0) qs.set('services', services.join(','));
    if (traceMethod) qs.set('method', traceMethod);
    const res = await fetch(`/api/v1/traces?${qs}`, { signal: params.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    showError(container, `Failed to load traces: ${err.message}`);
    return;
  }

  let traces = Array.isArray(data) ? data : (data.traces || data.items || data.data || []);

  if (sortByAttr) {
    traces = [...traces].sort((a, b) => {
      const va = String((a.resource_attributes || {})[sortByAttr] ?? '');
      const vb = String((b.resource_attributes || {})[sortByAttr] ?? '');
      return va.localeCompare(vb);
    });
  }

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
        <th>Trace ID</th>
        <th>Duration (ms)</th>
        <th>Status</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  traces.forEach(trace => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';

    const ts = trace.start_time || trace.start_time_unix_nano || trace.timestamp || '';
    const svc = trace.service_name || trace.service || trace.root_service || '';
    const traceId = trace.trace_id || trace.traceId || trace.id || '';
    const durationMs = formatDuration(trace);
    const status = trace.status || trace.status_code || 'UNSET';

    tr.innerHTML = `
      <td>${formatTimestamp(ts)}</td>
      <td>${serviceBadge(svc)}</td>
      <td style="font-family:monospace;font-size:12px" title="${escapeAttr(traceId)}">${truncate(traceId, 20)}</td>
      <td>${durationMs}</td>
      <td>${statusBadge(status)}</td>
    `;

    tr.addEventListener('click', () => openTraceModal(trace));
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
    renderTraces(container, { ...params, services, sortByAttr, traceMethod, offset: Math.max(0, offset - limit) });
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = traces.length < limit;
  nextBtn.addEventListener('click', () => {
    renderTraces(container, { ...params, services, sortByAttr, traceMethod, offset: offset + limit });
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

async function openTraceModal(trace) {
  const traceId = trace.trace_id || trace.traceId || trace.id || '';

  const content = document.createElement('div');

  // Trace attributes section
  const attrSec = document.createElement('div');
  attrSec.className = 'modal-section';
  const attrTitle = document.createElement('div');
  attrTitle.className = 'modal-section-title';
  attrTitle.textContent = 'Resource Attributes';
  attrSec.appendChild(attrTitle);
  attrSec.appendChild(kvTable(trace.resource_attributes || {}));
  content.appendChild(attrSec);

  const spanAttrSec = document.createElement('div');
  spanAttrSec.className = 'modal-section';
  const spanAttrTitle = document.createElement('div');
  spanAttrTitle.className = 'modal-section-title';
  spanAttrTitle.textContent = 'Root Span Attributes';
  spanAttrSec.appendChild(spanAttrTitle);
  spanAttrSec.appendChild(kvTable(trace.span_attributes || {}));
  content.appendChild(spanAttrSec);

  // Spans section — load async
  const spansSec = document.createElement('div');
  spansSec.className = 'modal-section';
  const spansTitle = document.createElement('div');
  spansTitle.className = 'modal-section-title';
  spansTitle.textContent = 'Spans';
  spansSec.appendChild(spansTitle);
  const spansContainer = document.createElement('div');
  spansContainer.textContent = 'Loading spans…';
  spansSec.appendChild(spansContainer);
  content.appendChild(spansSec);

  showModal(traceId || 'Trace', content);

  // Fetch spans after modal is shown
  if (!traceId) {
    spansContainer.textContent = 'No trace ID available.';
    return;
  }

  try {
    const res = await fetch(`/api/v1/traces/${encodeURIComponent(traceId)}/spans`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const spanData = await res.json();
    const spans = Array.isArray(spanData) ? spanData : (spanData.spans || spanData.data || []);
    spansContainer.innerHTML = '';
    spansContainer.appendChild(renderSpanTree(spans));
  } catch (err) {
    spansContainer.textContent = `Failed to load spans: ${err.message}`;
    spansContainer.style.color = 'var(--error)';
  }
}

function renderSpanTree(spans) {
  const div = document.createElement('div');
  div.className = 'span-waterfall';

  if (!spans || spans.length === 0) {
    div.innerHTML = '<span style="color:var(--text-muted)">No spans found.</span>';
    return div;
  }

  // Build O(1) lookup maps once — avoids O(N²) filter-per-span below.
  const byId = new Map();
  spans.forEach(s => byId.set(s.span_id || s.spanId || s.id, s));

  const childrenMap = new Map();
  spans.forEach(s => {
    const pid = s.parent_span_id || s.parentSpanId || '';
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid).push(s);
  });

  const roots = spans.filter(s => {
    const parent = s.parent_span_id || s.parentSpanId || '';
    return !parent || !byId.has(parent);
  });

  function renderSpan(span, depth) {
    const item = document.createElement('div');
    item.className = 'span-item span-item-clickable';
    item.style.paddingLeft = `${depth * 20}px`;

    const name = span.name || span.span_name || '';
    const svc = span.service_name || span.service || '';
    const dur = formatDuration(span);
    const statusCode = span.status_code ?? span.status ?? 'UNSET';

    item.innerHTML = `
      <span class="span-name">${escapeHtml(truncate(name, 60))}</span>
      <span class="span-duration">${dur}ms</span>
      ${svc ? `<span class="span-service">[${escapeHtml(svc)}]</span>` : ''}
      ${statusBadge(statusCode)}
    `;

    // Toggle span attributes panel on click
    const attrsPanel = document.createElement('div');
    attrsPanel.className = 'span-attrs-panel';
    attrsPanel.style.display = 'none';

    const allAttrs = Object.assign({}, span.span_attributes || {});
    attrsPanel.appendChild(kvTable(allAttrs));

    item.addEventListener('click', e => {
      e.stopPropagation();
      attrsPanel.style.display = attrsPanel.style.display === 'none' ? 'block' : 'none';
    });

    div.appendChild(item);
    div.appendChild(attrsPanel);

    // O(1) children lookup via pre-built map — replaces O(N) spans.filter()
    const spanId = span.span_id || span.spanId || span.id;
    const children = childrenMap.get(spanId) || [];
    children.forEach(child => renderSpan(child, depth + 1));
  }

  roots.forEach(r => renderSpan(r, 0));

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
