(function () {
  'use strict';

  const DEFAULT_MEASUREMENT_ID = 'G-H1D8KEP1W4';

  function detectLang() {
    const nav = navigator.languages && navigator.languages.length ? navigator.languages[0] : (navigator.language || 'en');
    return /^pl/i.test(nav) ? 'pl' : 'en';
  }

  function baseUrl(path) {
    const base = document.baseURI || window.location.href;
    return new URL(path, base).toString();
  }

  async function loadAnalyticsConfig() {
    try {
      const res = await fetch(baseUrl('data/analytics_config.json'), { cache: 'no-store' });
      if (!res.ok) throw new Error('config_fetch_failed');
      return await res.json();
    } catch (e) {
      return { measurement_id: DEFAULT_MEASUREMENT_ID };
    }
  }

  function ensureGtag(measurementId) {
    if (!measurementId) return;

    // Guard: avoid duplicate config calls (e.g., if tag already embedded in <head>)
    if (window.__aio_ga4_configured === measurementId) return;

    // If another tag already configured GA4, detect it from dataLayer
    if (Array.isArray(window.dataLayer)) {
      const already = window.dataLayer.some((x) => Array.isArray(x) && x[0] === 'config' && x[1] === measurementId);
      if (already) {
        window.__aio_ga4_configured = measurementId;
        return;
      }
    }


    // Prevent duplicate script loading
    const existing = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
    if (!existing) {
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(s);
    }

    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;

    // Configure once
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { anonymize_ip: true });

    window.__aio_ga4_configured = measurementId;
  }

  function hasStatsLink(root) {
    if (!root) return false;
    return !!root.querySelector('a[href$="stats.html"], a[href*="stats.html"]');
  }

  function appendStatsLinkToNav(lang) {
    const label = lang === 'pl' ? 'Statystyki' : 'Analytics';

    // Top nav
    const nav = document.querySelector('.nav-inner');
    if (nav && !hasStatsLink(nav)) {
      const a = document.createElement('a');
      a.href = 'stats.html';
      a.textContent = label;
      nav.appendChild(a);
    }

    // Drawer links (mobile)
    const drawerNav = document.querySelector('.drawer nav, .drawer-links, .drawer .drawer-links');
    if (drawerNav && !hasStatsLink(drawerNav)) {
      const a = document.createElement('a');
      a.href = 'stats.html';
      a.innerHTML = `📈 <span>${label}</span>`;
      drawerNav.appendChild(a);
    }

    // Stats page: update label if present
    const statsLink = document.getElementById('statsNavLink');
    if (statsLink) statsLink.textContent = label;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const lang = detectLang();
    appendStatsLinkToNav(lang);

    const cfg = await loadAnalyticsConfig();
    const measurementId = (cfg && typeof cfg.measurement_id === 'string' && cfg.measurement_id.trim())
      ? cfg.measurement_id.trim()
      : DEFAULT_MEASUREMENT_ID;

    ensureGtag(measurementId);
  });
})();