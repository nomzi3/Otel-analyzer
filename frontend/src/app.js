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

const REFRESH_INTERVAL_MS = 15_000;

let currentView = 'all';
let refreshTimer = null;

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

async function renderView(view, params = {}) {
  const container = document.getElementById('view');
  if (!container) return;

  const fn = VIEW_MAP[view];
  if (!fn) {
    container.innerHTML = `<div class="error-box"><span>Unknown view: ${view}</span></div>`;
    return;
  }

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

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    renderView(currentView);
  }, REFRESH_INTERVAL_MS);
}

function navigate(view) {
  currentView = view;
  setActiveTab(view);
  renderView(view);
  scheduleRefresh();
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
window.addEventListener('DOMContentLoaded', () => {
  const view = getViewFromHash();
  navigate(view);
});
