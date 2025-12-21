(function () {
  'use strict';

  // Repo config
  const GH_USER = 'OliOli2013';
  const GH_REPO = 'aio-iptv-projekt';

  // Traffic JSON files produced by GitHub Actions (stored in /traffic)
  const TRAFFIC_FILES = [
    { id: 'PanelAIO', file: 'traffic/PanelAIO-Plugin.json' },
    { id: 'MyUpdater', file: 'traffic/MyUpdater-Plugin.json' },
    { id: 'IPTV Dream', file: 'traffic/IPTV-Dream-Plugin.json' },
    { id: 'PiconUpdater', file: 'traffic/PiconUpdater.json' }
  ];

  function $(id) { return document.getElementById(id); }

  function baseUrl(path) {
    const base = document.baseURI || window.location.href;
    return new URL(path, base).toString();
  }

  function setStatus(ok, label) {
    const wrap = $('github-status');
    const lab = $('github-status-label');
    if (!wrap || !lab) return;
    wrap.classList.toggle('ok', !!ok);
    wrap.classList.toggle('err', !ok);
    lab.textContent = label;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function formatDatePL(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (_) {
      return '...';
    }
  }

  function updateLocalVisits() {
    const els = document.querySelectorAll('.local-visit-counter');
    if (!els.length) return;

    const key = 'aio_local_visits';
    const raw = localStorage.getItem(key);
    const n = (raw && /^\d+$/.test(raw)) ? parseInt(raw, 10) : 0;
    const next = n + 1;
    localStorage.setItem(key, String(next));
    els.forEach(el => { el.textContent = String(next); });
  }

  async function fillRepoStats() {
    const elStars = $('repo-stars');
    const elWatchers = $('repo-watchers');
    const elSize = $('repo-size');
    const elDate = $('repo-date');

    try {
      const data = await fetchJson(`https://api.github.com/repos/${GH_USER}/${GH_REPO}`);

      if (elStars) elStars.textContent = String(data.stargazers_count ?? '0');
      if (elWatchers) elWatchers.textContent = String(data.subscribers_count ?? data.watchers_count ?? '0');
      if (elSize) {
        const mb = (Number(data.size || 0) / 1024);
        elSize.textContent = `${mb.toFixed(1)} MB`;
      }
      if (elDate) elDate.textContent = data.pushed_at ? formatDatePL(data.pushed_at) : '...';

      setStatus(true, 'API GitHub: OK');
    } catch (e) {
      // Common failure: rate limit / blocked network
      setStatus(false, 'API GitHub: błąd / limit');
      // Keep placeholders ("...") as-is
      // Optional: log for debugging
      // console.warn('[AIO Stats] GitHub API error:', e);
    }
  }

  async function loadTrafficData() {
    // Attempt to load local traffic JSON files from /traffic
    const results = [];
    for (const item of TRAFFIC_FILES) {
      try {
        const data = await fetchJson(baseUrl(item.file));
        const views = data && data.summary && data.summary.views ? Number(data.summary.views.count || 0) : 0;
        const clones = data && data.summary && data.summary.clones ? Number(data.summary.clones.count || 0) : 0;
        results.push({ label: item.id, views, clones, ok: true });
      } catch (e) {
        results.push({ label: item.id, views: 0, clones: 0, ok: false });
      }
    }
    return results;
  }

  function renderPopularity(results) {
    const canvas = $('popularity-chart');
    const list = $('popularity-list');

    if (!canvas || typeof Chart === 'undefined') return;

    // Prefer views as popularity metric; fall back to clones if views are all zero.
    const views = results.map(r => r.views);
    const sumViews = views.reduce((a, b) => a + b, 0);
    const metric = sumViews > 0 ? 'views' : 'clones';

    const values = results.map(r => r[metric]);
    const labels = results.map(r => r.label);

    // Destroy previous chart
    if (window.__aioPopularityChart) {
      try { window.__aioPopularityChart.destroy(); } catch (_) {}
    }

    window.__aioPopularityChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    });

    // List
    if (list) {
      list.innerHTML = '';
      results
        .slice()
        .sort((a, b) => (b[metric] - a[metric]))
        .forEach(r => {
          const row = document.createElement('div');
          row.className = 'popularity-item';
          row.innerHTML = `<span class="popularity-name">${escapeHtml(r.label)}</span>
                           <span class="popularity-value">${r[metric]}</span>`;
          list.appendChild(row);
        });

      // If nothing loaded, show hint
      const anyOk = results.some(r => r.ok);
      if (!anyOk) {
        const hint = document.createElement('div');
        hint.className = 'muted';
        hint.style.marginTop = '10px';
        hint.textContent = 'Nie udało się wczytać plików traffic/*.json (sprawdź publikację GitHub Pages i ścieżkę /traffic).';
        list.appendChild(hint);
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function init() {
    // Run only when stats card exists
    if (!$('github-status') && !$('repo-stars') && !$('popularity-chart')) return;

    updateLocalVisits();
    await fillRepoStats();

    const traffic = await loadTrafficData();
    renderPopularity(traffic);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
