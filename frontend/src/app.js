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
