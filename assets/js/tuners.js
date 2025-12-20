(function () {
  'use strict';

  const qs = (s, r = document) => r.querySelector(s);

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
    );
  }

  function getLang() {
    const htmlLang = String(document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (htmlLang.startsWith('pl')) return 'pl';
    if (htmlLang.startsWith('en')) return 'en';
    const nav = String(navigator.language || 'pl').toLowerCase();
    return nav.startsWith('pl') ? 'pl' : 'en';
  }

  const L = {
    pl: {
      loadFail: 'Nie udało się wczytać listy tunerów (data/tuners.json).',
      noResults: 'Brak wyników dla wybranych filtrów.',
      tuners: 'Tunery',
      video: 'Wideo',
      lanWifi: 'LAN/Wi‑Fi',
      ports: 'Porty',
      price: 'Cena'
    },
    en: {
      loadFail: 'Failed to load the receivers list (data/tuners.json).',
      noResults: 'No results for selected filters.',
      tuners: 'Tuners',
      video: 'Video',
      lanWifi: 'LAN/Wi‑Fi',
      ports: 'Ports',
      price: 'Price'
    }
  };

  async function fetchFirstJson(paths) {
    let lastErr = null;
    for (const p of paths) {
      try {
        const res = await fetch(p, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Failed to fetch JSON');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const host = qs('#tunersHost');
    if (!host) return;

    const lang = getLang();
    const T = L[lang] || L.pl;

    const brandSel = qs('#brandFilter');
    const tagSel = qs('#tagFilter');
    const qInput = qs('#tunerQuery');
    const countEl = qs('#tunersCount');
    const moreBtn = qs('#tunersMore');

    let data;
    try {
      data = await fetchFirstJson(['./data/tuners.json', './data/tuner.json', './data/tuners_full.json']);
    } catch (_) {
      host.innerHTML = `<div class="card">${escapeHtml(T.loadFail)}</div>`;
      return;
    }

    const tuners = data && Array.isArray(data.tuners) ? data.tuners : [];

    // Populate filters
    const brands = [...new Set(tuners.map((t) => t.brand).filter(Boolean))].sort();
    if (brandSel) {
      brands.forEach((b) => {
        const o = document.createElement('option');
        o.value = b;
        o.textContent = b;
        brandSel.appendChild(o);
      });
    }

    const tags = [...new Set(tuners.flatMap((t) => (Array.isArray(t.tags) ? t.tags : [])))].sort();
    if (tagSel) {
      tags.forEach((t) => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        tagSel.appendChild(o);
      });
    }

    let limit = 60;

    function getFiltered() {
      const q = (qInput?.value || '').toLowerCase().trim();
      const b = brandSel?.value || '';
      const tag = tagSel?.value || '';

      return tuners.filter((t) => {
        if (b && t.brand !== b) return false;
        if (tag && !(Array.isArray(t.tags) ? t.tags : []).includes(tag)) return false;
        if (!q) return true;

        const hay = [
          t.brand,
          t.model,
          t.cpu,
          t.ram,
          t.flash,
          t.tuners,
          t.resolution,
          t.lan,
          t.wifi,
          t.ports,
          t.price,
          ...(Array.isArray(t.tags) ? t.tags : [])
        ]
          .join(' ')
          .toLowerCase();

        return hay.includes(q);
      });
    }

    function render() {
      const filtered = getFiltered();
      if (countEl) countEl.textContent = `${filtered.length} / ${tuners.length}`;

      host.innerHTML = '';
      if (!filtered.length) {
        host.innerHTML = `<div class="card">${escapeHtml(T.noResults)}</div>`;
        if (moreBtn) moreBtn.style.display = 'none';
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'grid';

      filtered.slice(0, limit).forEach((t) => {
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
          <h3 style="margin:0 0 6px">${escapeHtml(t.brand || '')} ${escapeHtml(t.model || '')}</h3>
          <p style="margin:0 0 10px">${escapeHtml(t.cpu || '')}${t.ram ? ` • ${escapeHtml(t.ram)}` : ''}${t.flash ? ` • ${escapeHtml(t.flash)}` : ''}</p>
          <div style="display:grid;gap:6px;color:var(--muted);font-size:.95rem">
            <div><strong style="color:var(--text)">${escapeHtml(T.tuners)}:</strong> ${escapeHtml(t.tuners || '—')}</div>
            <div><strong style="color:var(--text)">${escapeHtml(T.video)}:</strong> ${escapeHtml(t.resolution || '—')}</div>
            <div><strong style="color:var(--text)">${escapeHtml(T.lanWifi)}:</strong> ${escapeHtml(t.lan || '—')} / ${escapeHtml(t.wifi || '—')}</div>
            <div><strong style="color:var(--text)">${escapeHtml(T.ports)}:</strong> ${escapeHtml(t.ports || '—')}</div>
            <div><strong style="color:var(--text)">${escapeHtml(T.price)}:</strong> ${escapeHtml(t.price || '—')}</div>
          </div>
          ${(Array.isArray(t.tags) && t.tags.length) ? `<div class="link-row" style="margin-top:12px">${t.tags.slice(0, 6).map((x) => `<span class="pill" style="padding:6px 10px;font-size:.82rem;opacity:.95">${escapeHtml(x)}</span>`).join('')}</div>` : ''}
        `;
        grid.appendChild(el);
      });

      host.appendChild(grid);

      if (moreBtn) {
        if (limit >= filtered.length) moreBtn.style.display = 'none';
        else moreBtn.style.display = 'inline-flex';
      }
    }

    function reset() {
      limit = 60;
      render();
    }

    [brandSel, tagSel, qInput].forEach((el) => {
      if (!el) return;
      el.addEventListener('input', reset);
      el.addEventListener('change', reset);
    });

    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        limit += 60;
        render();
      });
    }

    render();
  });
})();
