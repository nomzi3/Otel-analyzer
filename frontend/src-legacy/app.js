import { renderAll }     from './views/all.js';
import { renderLogs }    from './views/logs.js';
import { renderMetrics } from './views/metrics.js';
import { renderTraces }  from './views/traces.js';

const VIEW_MAP = {
  all:     renderAll,
  logs:    renderLogs,
  metrics: renderMetrics,
  traces:  renderTraces,
};

// Persisted filter state — survives view switches
const filterState = {
  services:    [],   // [] = show all
  sortByAttr:  '',   // '' = no sort; otherwise a resource_attributes key
  logSeverity: '',   // selected log severity filter ('' = all)
  logPattern:  '',   // selected log pattern filter
  metricName:  '',   // selected metric name filter
  traceMethod: '',   // selected trace method filter
};

let currentView = 'all';

function getViewFromHash() {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  return VIEW_MAP[hash] ? hash : 'all';
}

function setActiveTab(view) {
  document.querySelectorAll('nav a.tab').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
}

function updateStatusBar() {
  const el = document.getElementById('last-refresh');
  if (el) {
    const now = new Date();
    const pad = v => String(v).padStart(2, '0');
    el.textContent = `Last refreshed: ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} `
      + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
}

async function renderView(view, extraParams = {}) {
  const container = document.getElementById('view');
  if (!container) return;

  const fn = VIEW_MAP[view];
  if (!fn) {
    container.innerHTML = `<div class="error-box"><span>Unknown view: ${view}</span></div>`;
    return;
  }

  const params = { ...extraParams, ...filterState };

  try {
    await fn(container, params);
  } catch (err) {
    container.innerHTML = `
      <div class="error-box">
        <span>⚠</span>
        <span>Render error: ${err.message}</span>
      </div>
    `;
    console.error('Render error:', err);
  }

  updateStatusBar();
  await buildViewControls(view);
}

async function loadViewData(view) {
  try {
    if (view === 'logs') {
      const res = await fetch('/api/v1/logs/patterns');
      if (!res.ok) return [];
      return await res.json();
    }
    if (view === 'metrics') {
      const res = await fetch('/api/v1/metrics/names');
      if (!res.ok) return [];
      return await res.json();
    }
    if (view === 'traces') {
      const res = await fetch('/api/v1/traces/methods');
      if (!res.ok) return [];
      return await res.json();
    }
  } catch { /* ignore */ }
  return [];
}

async function buildViewControls(view) {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;

  // Remove any previously injected view-specific controls
  bar.querySelectorAll('.view-control').forEach(el => el.remove());

  if (view === 'logs') {
    // Fetch severities and patterns in parallel
    const [severities, patternData] = await Promise.all([
      fetch('/api/v1/logs/severities').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/v1/logs/patterns${filterState.logSeverity ? '?severity=' + encodeURIComponent(filterState.logSeverity) : ''}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    const distinctPatterns = [...new Set(patternData.map(d => d.pattern).filter(Boolean))];

    // Severity filter control
    const sevGroup = document.createElement('div');
    sevGroup.className = 'filter-group view-control';
    const sevLabel = document.createElement('span');
    sevLabel.className = 'filter-label';
    sevLabel.textContent = 'severity';
    const sevSel = document.createElement('select');
    sevSel.className = 'filter-select';
    const sevAllOpt = document.createElement('option');
    sevAllOpt.value = ''; sevAllOpt.textContent = '— all —';
    sevSel.appendChild(sevAllOpt);
    severities.forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s; o.selected = s === filterState.logSeverity;
      sevSel.appendChild(o);
    });
    sevSel.value = filterState.logSeverity;
    sevSel.addEventListener('change', async () => {
      filterState.logSeverity = sevSel.value;
      // Reset pattern when severity changes so stale selection doesn't persist
      filterState.logPattern = '';
      renderView(currentView);
    });
    sevGroup.appendChild(sevLabel); sevGroup.appendChild(sevSel);
    bar.insertBefore(sevGroup, bar.querySelector('.filter-group--right'));

    // Pattern filter control (populated based on current severity)
    const patGroup = document.createElement('div');
    patGroup.className = 'filter-group view-control';
    const patLabel = document.createElement('span');
    patLabel.className = 'filter-label';
    patLabel.textContent = 'log pattern';
    const patSel = document.createElement('select');
    patSel.className = 'filter-select';
    const allOpt = document.createElement('option');
    allOpt.value = ''; allOpt.textContent = '— all patterns —';
    patSel.appendChild(allOpt);
    distinctPatterns.forEach(p => {
      const o = document.createElement('option');
      o.value = p; o.textContent = p.length > 60 ? p.slice(0, 60) + '…' : p;
      o.selected = p === filterState.logPattern;
      patSel.appendChild(o);
    });
    patSel.value = filterState.logPattern;
    patSel.addEventListener('change', () => { filterState.logPattern = patSel.value; renderView(currentView); });
    patGroup.appendChild(patLabel); patGroup.appendChild(patSel);
    bar.insertBefore(patGroup, bar.querySelector('.filter-group--right'));

  } else if (view === 'metrics') {
    const names = await loadViewData('metrics');

    const grp = document.createElement('div');
    grp.className = 'filter-group view-control';
    const lbl = document.createElement('span');
    lbl.className = 'filter-label';
    lbl.textContent = 'metric name';
    const sel = document.createElement('select');
    sel.className = 'filter-select';
    const allOpt = document.createElement('option');
    allOpt.value = ''; allOpt.textContent = '— all metrics —';
    sel.appendChild(allOpt);
    names.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      o.selected = n === filterState.metricName;
      sel.appendChild(o);
    });
    sel.value = filterState.metricName;
    sel.addEventListener('change', () => { filterState.metricName = sel.value; renderView(currentView); });
    grp.appendChild(lbl); grp.appendChild(sel);
    bar.insertBefore(grp, bar.querySelector('.filter-group--right'));

  } else if (view === 'traces') {
    const methods = await loadViewData('traces');

    const grp = document.createElement('div');
    grp.className = 'filter-group view-control';
    const lbl = document.createElement('span');
    lbl.className = 'filter-label';
    lbl.textContent = 'http.url';
    const sel = document.createElement('select');
    sel.className = 'filter-select';
    const allOpt = document.createElement('option');
    allOpt.value = ''; allOpt.textContent = '— all methods —';
    sel.appendChild(allOpt);
    methods.forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m.length > 60 ? m.slice(0, 60) + '…' : m;
      o.selected = m === filterState.traceMethod;
      sel.appendChild(o);
    });
    sel.value = filterState.traceMethod;
    sel.addEventListener('change', () => { filterState.traceMethod = sel.value; renderView(currentView); });
    grp.appendChild(lbl); grp.appendChild(sel);
    bar.insertBefore(grp, bar.querySelector('.filter-group--right'));
  }
}

function navigate(view) {
  currentView = view;
  setActiveTab(view);
  renderView(view);
}

// --- Filter bar ---

async function loadServices() {
  try {
    const res = await fetch('/api/v1/services');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function loadResourceAttrKeys() {
  try {
    const res = await fetch('/api/v1/resource-attributes');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function buildFilterBar(services, resourceAttrKeys) {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  bar.innerHTML = '';

  // Service filter
  const serviceGroup = document.createElement('div');
  serviceGroup.className = 'filter-group';

  const serviceLabel = document.createElement('span');
  serviceLabel.className = 'filter-label';
  serviceLabel.textContent = 'service.name';
  serviceGroup.appendChild(serviceLabel);

  const dropdown = document.createElement('div');
  dropdown.className = 'filter-dropdown';

  const trigger = document.createElement('button');
  trigger.className = 'filter-trigger';
  trigger.id = 'service-trigger';
  trigger.textContent = 'Show all';
  dropdown.appendChild(trigger);

  const panel = document.createElement('div');
  panel.className = 'filter-panel';
  panel.id = 'service-panel';

  // "Show all" option
  const allLabel = document.createElement('label');
  allLabel.className = 'filter-option';
  const allCheck = document.createElement('input');
  allCheck.type = 'checkbox';
  allCheck.value = '__all__';
  allCheck.checked = true;
  allLabel.appendChild(allCheck);
  allLabel.appendChild(document.createTextNode(' Show all'));
  panel.appendChild(allLabel);

  services.forEach(svc => {
    const label = document.createElement('label');
    label.className = 'filter-option';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.value = svc;
    check.checked = false;
    label.appendChild(check);
    label.appendChild(document.createTextNode(' ' + svc));
    panel.appendChild(label);
  });

  dropdown.appendChild(panel);
  serviceGroup.appendChild(dropdown);
  bar.appendChild(serviceGroup);

  // Toggle panel
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', () => panel.classList.remove('open'));
  panel.addEventListener('click', e => e.stopPropagation());

  // Handle checkbox changes
  panel.addEventListener('change', e => {
    if (e.target.value === '__all__') {
      // "Show all" ticked — clear individual selections
      panel.querySelectorAll('input[type=checkbox]').forEach(c => {
        if (c.value !== '__all__') c.checked = false;
      });
      allCheck.checked = true;
      filterState.services = [];
      trigger.textContent = 'Show all';
    } else {
      // A service was toggled — uncheck "Show all"
      allCheck.checked = false;
      const selected = [...panel.querySelectorAll('input[type=checkbox]:checked')]
        .filter(c => c.value !== '__all__')
        .map(c => c.value);
      if (selected.length === 0) {
        allCheck.checked = true;
        filterState.services = [];
        trigger.textContent = 'Show all';
      } else {
        filterState.services = selected;
        trigger.textContent = selected.length === 1 ? selected[0] : `${selected.length} services`;
      }
    }
    renderView(currentView);
  });

  // Sort by resource.attributes
  const sortGroup = document.createElement('div');
  sortGroup.className = 'filter-group';

  const sortLabel = document.createElement('span');
  sortLabel.className = 'filter-label';
  sortLabel.textContent = 'sort by resource attribute';
  sortGroup.appendChild(sortLabel);

  const sortSelect = document.createElement('select');
  sortSelect.className = 'filter-select';

  const noSortOpt = document.createElement('option');
  noSortOpt.value = '';
  noSortOpt.textContent = '— none —';
  sortSelect.appendChild(noSortOpt);

  resourceAttrKeys.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key;
    opt.selected = key === filterState.sortByAttr;
    sortSelect.appendChild(opt);
  });

  sortSelect.value = filterState.sortByAttr;
  sortSelect.addEventListener('change', () => {
    filterState.sortByAttr = sortSelect.value;
    renderView(currentView);
  });
  sortGroup.appendChild(sortSelect);

  bar.appendChild(sortGroup);

  // Refresh button
  const refreshGroup = document.createElement('div');
  refreshGroup.className = 'filter-group filter-group--right';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'refresh-btn';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', () => renderView(currentView));
  refreshGroup.appendChild(refreshBtn);

  bar.appendChild(refreshGroup);
}

// Handle nav tab clicks
document.querySelectorAll('nav a.tab').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const view = a.dataset.view;
    window.location.hash = view;
    navigate(view);
  });
});

// Handle browser back/forward (hash change)
window.addEventListener('hashchange', () => {
  const view = getViewFromHash();
  navigate(view);
});

// Initial render on load
window.addEventListener('DOMContentLoaded', async () => {
  const view = getViewFromHash();
  const [services, resourceAttrKeys] = await Promise.all([loadServices(), loadResourceAttrKeys()]);
  buildFilterBar(services, resourceAttrKeys);
  navigate(view);
});
