(function () {
  'use strict';

  const DEFAULT_MEASUREMENT_ID = 'G-H1D8KEP1W4';

  function detectLang() {
    const nav = navigator.languages && navigator.languages.length ? navigator.languages[0] : (navigator.language || 'en');
    return /^pl/i.test(nav) ? 'pl' : 'en';
  }

  function baseUrl(path) {
    // GitHub Pages safe base
    const base = document.baseURI || window.location.href;
    return new URL(path, base).toString();
  }

  async function loadConfig() {
    try {
      const res = await fetch(baseUrl('data/analytics_config.json'), { cache: 'no-store' });
      if (!res.ok) throw new Error('config_fetch_failed');
      return await res.json();
    } catch (e) {
      return { measurement_id: DEFAULT_MEASUREMENT_ID, looker_embed_url: '' };
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showNotice(text) {
    const el = document.getElementById('statsNotice');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = text;
  }

  function setIframe(url) {
    const frame = document.getElementById('statsFrame');
    if (!frame) return;
    frame.src = url;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const lang = detectLang();

    if (lang === 'pl') {
      setText('statsTitle', 'Statystyki');
      setText('statsSub', 'Panel statystyk (Google Analytics 4) osadzony z Looker Studio.');
      setText('statsHint', 'Jeśli widzisz pusty panel, sprawdź czy raport Looker Studio jest udostępniony (publiczny lub dla zalogowanych).');
    } else {
      setText('statsTitle', 'Analytics');
      setText('statsSub', 'Analytics dashboard (Google Analytics 4) embedded from Looker Studio.');
      setText('statsHint', 'If the panel is blank, verify the Looker Studio report sharing settings (public or signed-in users).');
    }

    const cfg = await loadConfig();
    const embed = (cfg && typeof cfg.looker_embed_url === 'string') ? cfg.looker_embed_url.trim() : '';
    if (!embed) {
      showNotice(lang === 'pl'
        ? 'Brak adresu osadzenia Looker Studio. Wklej link embed w pliku data/analytics_config.json (pole "looker_embed_url").'
        : 'Missing Looker Studio embed URL. Paste the embed link into data/analytics_config.json ("looker_embed_url").'
      );
      return;
    }
    setIframe(embed);
  });
})();