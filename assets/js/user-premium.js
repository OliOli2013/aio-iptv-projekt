(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener('DOMContentLoaded', () => {
    setCurrentYear();
    initNavigation();
    initCopyButtons();
    initSiteSearch();
    initScrollUX();
    initSystemFilter();
    initDetailsControls();
    enhanceImagesAndLinks();
    loadChannelLists();
    initInlineAi();
    initGenerator();
  });

  function setCurrentYear() {
    $$('#year').forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  function initNavigation() {
    // Keep the Windows applications section visible in the shared navigation,
    // including older pages that were authored before the section existed.
    $$('.main-nav, .side-panel nav, .site-footer nav').forEach(container => {
      if (container.querySelector('a[href="windows-apps.html"]')) return;
      const androidLink = container.querySelector('a[href="android-apps.html"]');
      if (!androidLink) return;
      const windowsLink = document.createElement('a');
      windowsLink.href = 'windows-apps.html';
      windowsLink.textContent = container.classList.contains('main-nav') ? 'Aplikacje Windows' : 'Windows';
      androidLink.insertAdjacentElement('afterend', windowsLink);
    });

    const button = $('[data-menu-toggle]');
    const menu = $('[data-menu]');
    if (button && menu) {
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', menu.id || 'main-navigation');
      if (!menu.id) menu.id = 'main-navigation';

      const closeMenu = () => {
        menu.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
        button.textContent = 'Menu';
      };
      const openMenu = () => {
        menu.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
        button.textContent = 'Zamknij menu';
      };

      button.addEventListener('click', () => menu.classList.contains('open') ? closeMenu() : openMenu());
      menu.addEventListener('click', event => {
        if (event.target.closest('a') && window.matchMedia('(max-width: 900px)').matches) closeMenu();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menu.classList.contains('open')) closeMenu();
      });
      window.addEventListener('resize', () => {
        if (!window.matchMedia('(max-width: 900px)').matches) closeMenu();
      });
    }

    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.main-nav a, .side-panel nav a').forEach(link => {
      const href = (link.getAttribute('href') || '').split('#')[0].split('?')[0].toLowerCase();
      if (href && href === current) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  function initCopyButtons() {
    $$('[data-copy]').forEach(button => {
      const initial = button.textContent;
      button.addEventListener('click', async () => {
        const text = button.getAttribute('data-copy') || '';
        try {
          await navigator.clipboard.writeText(text);
        } catch (error) {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        }
        button.textContent = 'Skopiowano ✓';
        button.setAttribute('aria-live', 'polite');
        window.setTimeout(() => { button.textContent = initial || 'Kopiuj'; }, 1500);
      });
    });
  }

  function initSiteSearch() {
    const brandRow = $('.brand-row');
    if (!brandRow || $('.site-search-trigger')) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'site-search-trigger';
    trigger.setAttribute('aria-label', 'Szukaj na stronie');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.innerHTML = '<span>⌕ Szukaj</span><kbd>Ctrl K</kbd>';

    const download = $('.header-download', brandRow);
    if (download) download.insertAdjacentElement('afterend', trigger);
    else { trigger.style.marginLeft = 'auto'; brandRow.appendChild(trigger); }

    const modal = document.createElement('div');
    modal.className = 'site-search-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Wyszukiwarka strony');
    modal.innerHTML = `
      <div class="site-search-dialog">
        <div class="site-search-head">
          <input class="site-search-input" type="search" placeholder="Szukaj wtyczki, aplikacji, poradnika lub systemu…" aria-label="Wpisz szukaną frazę">
          <button class="site-search-close" type="button" aria-label="Zamknij wyszukiwarkę">✕</button>
        </div>
        <div class="site-search-results" aria-live="polite"><div class="site-search-empty">Zacznij wpisywać nazwę wtyczki, aplikacji, systemu lub poradnika.</div></div>
      </div>`;
    document.body.appendChild(modal);

    const input = $('.site-search-input', modal);
    const results = $('.site-search-results', modal);
    const closeButton = $('.site-search-close', modal);
    let index = [];
    let loaded = false;

    const fallback = [
      { title: 'Wtyczki', desc: 'Pobieranie i opisy wtyczek Enigma2.', url: 'plugins.html', tags: ['wtyczki', 'ipk'] },
      { title: 'CamBridge PL 1.0.0 Android', desc: 'Offline konwerter CCcam do OSCam/NCam z zapisem i eksportem.', url: 'app-cambridge-android.html', tags: ['cambridge', 'android', 'apk', 'cccam', 'oscam', 'ncam', 'offline'] },
      { title: 'CamBridge PL 1.0.0 Windows', desc: 'Przenośny konwerter CCcam do OSCam/NCam dla Windows x64 i x86.', url: 'windows-apps.html', tags: ['cambridge', 'windows', 'exe', 'x64', 'x86', 'cccam', 'oscam', 'ncam'] },
      { title: 'AIO Panel Remote 1.4.6 Free / Pro', desc: 'Pilot Enigma2, listy kanałów, EPG, picony, streaming SAT/IPTV oraz ZeroTier/VPN.', url: 'app-aio-panel-remote.html', tags: ['android', 'apk', 'AIO Panel Remote', '1.4.6', 'free', 'pro', 'openwebif', 'zerotier', 'vpn', 'streaming', 'epg', 'picony'] },
      { title: 'Multi-Click i systemy', desc: 'Gotowe systemy i instrukcje instalacji.', url: 'systems.html', tags: ['systemy', 'multiclick', 'image'] },
      { title: 'Poradniki', desc: 'Instrukcje i pomoc dla Enigma2.', url: 'guides.html', tags: ['poradniki', 'pomoc'] },
      { title: 'Listy kanałów', desc: 'Listy kanałów i bukiety.', url: 'channel-lists.html', tags: ['listy', 'bukiety'] }
    ];

    async function loadIndex() {
      if (loaded) return;
      loaded = true;
      try {
        const response = await fetch('data/search-index.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        index = Array.isArray(data) ? data : fallback;
      } catch (error) {
        index = fallback;
      }
    }

    function openSearch() {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      loadIndex().finally(() => input.focus());
    }
    function closeSearch() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      trigger.focus();
    }
    function render(query) {
      const q = normalize(query.trim());
      if (!q) {
        results.innerHTML = '<div class="site-search-empty">Zacznij wpisywać nazwę wtyczki, aplikacji, systemu lub poradnika.</div>';
        return;
      }
      const words = q.split(/\s+/).filter(Boolean);
      const matches = index.map(item => {
        const haystack = normalize([item.title, item.desc, ...(item.tags || [])].join(' '));
        let score = 0;
        words.forEach(word => {
          if (normalize(item.title).includes(word)) score += 4;
          if (haystack.includes(word)) score += 1;
        });
        return { item, score };
      }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 9);

      if (!matches.length) {
        results.innerHTML = '<div class="site-search-empty">Brak wyników. Spróbuj krótszej lub innej frazy.</div>';
        return;
      }
      results.innerHTML = matches.map(({ item }) => `
        <a class="site-search-result" href="${escapeAttr(item.url || '#')}">
          <strong>${escapeHtml(item.title || 'Wynik')}</strong>
          <span>${escapeHtml(item.desc || '')}</span>
        </a>`).join('');
    }

    trigger.addEventListener('click', openSearch);
    closeButton.addEventListener('click', closeSearch);
    modal.addEventListener('click', event => { if (event.target === modal) closeSearch(); });
    input.addEventListener('input', () => render(input.value));
    results.addEventListener('click', event => { if (event.target.closest('a')) document.body.style.overflow = ''; });
    document.addEventListener('keydown', event => {
      const activeTag = document.activeElement && document.activeElement.tagName;
      const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        modal.classList.contains('open') ? closeSearch() : openSearch();
      } else if (event.key === '/' && !typing && !modal.classList.contains('open')) {
        event.preventDefault();
        openSearch();
      } else if (event.key === 'Escape' && modal.classList.contains('open')) {
        closeSearch();
      }
    });
  }

  function initScrollUX() {
    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);

    const topButton = document.createElement('button');
    topButton.type = 'button';
    topButton.className = 'back-to-top';
    topButton.setAttribute('aria-label', 'Wróć na górę strony');
    topButton.textContent = '↑';
    document.body.appendChild(topButton);
    topButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progress.style.width = `${ratio * 100}%`;
      topButton.classList.toggle('visible', window.scrollY > 520);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  function initSystemFilter() {
    const input = $('#systemFilter');
    const cards = $$('[data-system-card]');
    if (!input || !cards.length) return;
    const count = $('#systemCount');

    const apply = () => {
      const query = normalize(input.value.trim());
      let visible = 0;
      cards.forEach(card => {
        const text = normalize(card.getAttribute('data-search') || card.textContent);
        const show = !query || text.includes(query);
        card.hidden = !show;
        if (show) visible += 1;
      });
      if (count) count.textContent = query ? `Znaleziono: ${visible} z ${cards.length}` : `Dostępne systemy: ${cards.length}`;
    };
    input.addEventListener('input', apply);
    apply();
  }

  function initDetailsControls() {
    const details = $$('[data-system-card] details');
    if (!details.length) return;
    $('[data-details-open]')?.addEventListener('click', () => details.forEach(item => { if (!item.closest('[hidden]')) item.open = true; }));
    $('[data-details-close]')?.addEventListener('click', () => details.forEach(item => { item.open = false; }));
  }

  function enhanceImagesAndLinks() {
    $$('img').forEach((image, index) => {
      if (!image.hasAttribute('decoding')) image.setAttribute('decoding', 'async');
      if (index > 0 && !image.closest('.hero-compact') && !image.hasAttribute('loading')) image.setAttribute('loading', 'lazy');
    });
    $$('a[target="_blank"]').forEach(link => {
      const rel = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      link.setAttribute('rel', Array.from(rel).join(' '));
    });
  }

  async function loadChannelLists() {
    const output = $('#listsOutput');
    const status = $('#listsStatus');
    if (!output) return;
    const url = output.getAttribute('data-manifest-url') || 'https://raw.githubusercontent.com/OliOli2013/PanelAIO-Lists/main/manifest.json';
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const items = Array.isArray(data) ? data : (data.items || data.lists || data.files || []);
      if (!items.length) throw new Error('empty');
      output.innerHTML = items.slice(0, 60).map((item, index) => {
        const title = item.title || item.name || item.filename || ('Lista ' + (index + 1));
        const href = item.url || item.download || item.href || '#';
        const desc = item.desc || item.description || 'Pobierz plik listy kanałów.';
        return `<a class="choice-card" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer"><span class="card-icon">📺</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}</p><em>pobieranie</em></a>`;
      }).join('');
      if (status) status.textContent = 'Wybierz listę z poniższych pozycji.';
    } catch (error) {
      if (status) status.textContent = 'Nie udało się automatycznie pobrać manifestu. Użyj AIO Panel albo sprawdź połączenie z internetem.';
    }
  }

  async function initInlineAi() {
    const form = $('#inlineAiForm');
    const input = $('#inlineAiInput');
    const box = $('#chatMessages');
    const status = $('#aiChatStatus');
    if (!form || !input || !box) return;
    let knowledge = [];
    let config = null;
    try { knowledge = await (await fetch('data/knowledge.json')).json(); } catch (error) { knowledge = []; }
    try { config = await (await fetch('data/aichat_config.json')).json(); } catch (error) { config = null; }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) return;
      input.value = '';
      addMessage('user', query);
      const online = config && config.mode === 'online' && config.supabase && config.supabase.url && config.supabase.anonKey;
      if (online) {
        try {
          const endpoint = config.supabase.url.replace(/\/+$/, '') + '/functions/v1/' + (config.supabase.function || 'ai-chat');
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey, Authorization: 'Bearer ' + config.supabase.anonKey },
            body: JSON.stringify({ query, message: query, source: 'aio-iptv', locale: 'pl' })
          });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const data = await response.json();
          const reply = (data.reply || data.text || data.message || '').trim();
          addMessage('bot', reply || 'Brak odpowiedzi. Spróbuj doprecyzować pytanie.');
          return;
        } catch (error) {
          if (status) status.textContent = 'Tryb online jest chwilowo niedostępny. Pokazuję odpowiedź z bazy lokalnej.';
        }
      }
      addMessage('bot', offlineAnswer(query, knowledge));
    });

    function addMessage(role, text) {
      const paragraph = document.createElement('p');
      paragraph.className = role;
      paragraph.textContent = text;
      box.appendChild(paragraph);
      box.scrollTop = box.scrollHeight;
    }
  }

  function offlineAnswer(query, knowledge) {
    const words = normalize(query).split(/\s+/).filter(word => word.length > 2).slice(0, 10);
    const scored = (knowledge || []).map(item => {
      const text = normalize([item.title, item.summary, (item.tags || []).join(' '), (item.content || []).join(' '), (item.commands || []).join(' ')].join(' '));
      let score = 0;
      words.forEach(word => { if (text.includes(word)) score += 1; });
      return { item, score };
    }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    if (!scored.length) return 'Nie znalazłem dokładnego tematu. Podaj model tunera, system, nazwę wtyczki i krótki opis błędu.';
    return 'Najbliższe tematy: ' + scored.map(entry => entry.item.title).join(' • ');
  }

  function initGenerator() {
    const checks = $$('.gen-check');
    const output = $('#generator-output');
    if (!checks.length || !output) return;
    const update = () => {
      const commands = checks.filter(check => check.checked).map(check => {
        const element = document.getElementById(check.getAttribute('data-target'));
        return element ? element.textContent.trim() : '';
      }).filter(Boolean);
      output.textContent = commands.length ? commands.join(' && ') : '# Zaznacz przynajmniej jedną opcję powyżej...';
    };
    checks.forEach(check => check.addEventListener('change', update));
    update();
  }

  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }
})();

/* ===== AIO-IPTV: globalny monit wsparcia przed pobieraniem — 2026-07-24 ===== */
(function () {
  'use strict';

  const SUPPORT_LINKS = {
    kofi: 'https://ko-fi.com/pawelpawlek',
    revolut: 'https://revolut.me/pawelz75',
    paypal: 'https://www.paypal.com/send?recipient=pawelzarzycki61@gmail.com&currencyCode=PLN'
  };

  const DOWNLOAD_EXTENSIONS = /\.(?:ipk|apk|exe|msi|zip|7z|rar|deb|rpm|pdf|tar|tgz|gz|xz|img|bin|iso|m3u|m3u8|xml|conf|cfg|backup)(?:$|[?#])/i;
  const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|svg|avif)(?:$|[?#])/i;
  const SUPPORT_HOSTS = /(?:^|\.)(?:ko-fi\.com|revolut\.me|paypal\.com|buycoffee\.to)$/i;

  let modal = null;
  let pendingDownload = null;
  let previouslyFocused = null;
  let statusMessage = null;
  let continueButton = null;
  let fileNameElement = null;

  function onReady(callback) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  }

  onReady(initSupportGate);

  function initSupportGate() {
    if (document.documentElement.dataset.aioSupportGate === 'ready') return;
    document.documentElement.dataset.aioSupportGate = 'ready';

    createSupportTicker();
    createSupportModal();
    document.addEventListener('click', interceptDownload, true);
  }

  function createSupportTicker() {
    const header = document.querySelector('.site-header');
    if (!header || header.querySelector('.support-ticker')) return;

    const message = 'Dzięki dobrowolnemu wsparciu rozwijam AIO Panel, wtyczki, aplikacje, listy kanałów, picony, poradniki i systemy Enigma2.';
    const ticker = document.createElement('div');
    ticker.className = 'support-ticker';
    ticker.setAttribute('role', 'button');
    ticker.setAttribute('tabindex', '0');
    ticker.setAttribute('aria-label', 'Otwórz możliwości wsparcia projektów');
    ticker.innerHTML = `
      <span class="support-ticker-heart" aria-hidden="true">♥</span>
      <div class="support-ticker-viewport">
        <div class="support-ticker-track">
          <span><strong>WESPRZYJ ROZWÓJ</strong> • ${message} • Pobieranie pozostaje bezpłatne.</span>
          <span aria-hidden="true"><strong>WESPRZYJ ROZWÓJ</strong> • ${message} • Pobieranie pozostaje bezpłatne.</span>
        </div>
      </div>
      <span class="support-ticker-cta">Wesprzyj</span>`;

    header.insertBefore(ticker, header.firstChild);
    ticker.addEventListener('click', () => openSupportModal(null));
    ticker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openSupportModal(null);
      }
    });
  }

  function createSupportModal() {
    if (document.querySelector('.support-gate-modal')) return;

    modal = document.createElement('div');
    modal.className = 'support-gate-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="support-gate-backdrop" data-support-close></div>
      <section class="support-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="support-gate-title" aria-describedby="support-gate-description">
        <button class="support-gate-x" type="button" aria-label="Zamknij" data-support-close>×</button>
        <div class="support-gate-icon" aria-hidden="true">♥</div>
        <p class="support-gate-eyebrow">DOBROWOLNE WSPARCIE PROJEKTÓW</p>
        <h2 id="support-gate-title">Pomóż rozwijać projekty dla Enigma2</h2>
        <p id="support-gate-description">AIO Panel, wtyczki, aplikacje, listy kanałów, picony, systemy i poradniki są rozwijane dzięki poświęconemu czasowi oraz dobrowolnemu wsparciu użytkowników.</p>
        <div class="support-gate-file" hidden>
          <span>Wybrany plik:</span>
          <strong class="support-gate-filename"></strong>
        </div>
        <p class="support-gate-note">Wsparcie nie jest wymagane. Możesz wybrać jedną z poniższych metod albo od razu przejść dalej.</p>
        <div class="support-gate-methods" aria-label="Metody wsparcia">
          <a class="support-method support-method-kofi" href="${SUPPORT_LINKS.kofi}" target="_blank" rel="noopener noreferrer" data-support-bypass="true"><span>☕</span><strong>Ko-fi</strong><small>Dobrowolna wpłata</small></a>
          <a class="support-method support-method-revolut" href="${SUPPORT_LINKS.revolut}" target="_blank" rel="noopener noreferrer" data-support-bypass="true"><span>R</span><strong>Revolut</strong><small>Szybkie wsparcie</small></a>
          <a class="support-method support-method-paypal" href="${SUPPORT_LINKS.paypal}" target="_blank" rel="noopener noreferrer" data-support-bypass="true"><span>P</span><strong>PayPal</strong><small>Wpłata online</small></a>
        </div>
        <p class="support-gate-status" aria-live="polite"></p>
        <div class="support-gate-actions">
          <button class="support-gate-continue" type="button">Przejdź dalej do pobierania</button>
          <button class="support-gate-cancel" type="button" data-support-close>Nie teraz</button>
        </div>
        <p class="support-gate-privacy">Kliknięcie metody wsparcia otwiera jej stronę w nowej karcie. Pobieranie ze strony AIO-IPTV.pl pozostaje bezpłatne.</p>
      </section>`;

    document.body.appendChild(modal);
    statusMessage = modal.querySelector('.support-gate-status');
    continueButton = modal.querySelector('.support-gate-continue');
    fileNameElement = modal.querySelector('.support-gate-filename');

    modal.querySelectorAll('[data-support-close]').forEach(element => element.addEventListener('click', closeSupportModal));
    modal.querySelectorAll('.support-method').forEach(link => {
      link.addEventListener('click', () => {
        statusMessage.textContent = 'Dziękuję za wsparcie. Po powrocie do tej karty możesz kontynuować pobieranie.';
        continueButton.classList.add('is-thanks');
        if (pendingDownload) continueButton.textContent = 'Dziękuję — pobierz plik';
      });
    });
    continueButton.addEventListener('click', continueAfterPrompt);
    modal.addEventListener('keydown', trapModalKeyboard);
  }

  function interceptDownload(event) {
    const anchor = event.target.closest && event.target.closest('a');
    if (!anchor || !isDownloadLink(anchor)) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    openSupportModal({
      href: anchor.href,
      target: anchor.getAttribute('target') || '',
      download: anchor.getAttribute('download') || '',
      label: getDownloadLabel(anchor)
    });
  }

  function isDownloadLink(anchor) {
    if (anchor.dataset.supportBypass === 'true' || anchor.closest('.support-gate-modal') || anchor.closest('.support-ticker')) return false;

    const rawHref = (anchor.getAttribute('href') || '').trim();
    if (!rawHref || /^(?:#|javascript:|mailto:|tel:)/i.test(rawHref)) return false;

    let url;
    try { url = new URL(rawHref, window.location.href); }
    catch (error) { return false; }

    if (SUPPORT_HOSTS.test(url.hostname)) return false;

    const full = `${url.pathname}${url.search}${url.hash}`;
    const decoded = safeDecode(full).toLowerCase();
    const text = `${anchor.textContent || ''} ${anchor.getAttribute('aria-label') || ''} ${anchor.className || ''}`.toLowerCase();

    if (IMAGE_EXTENSIONS.test(decoded)) return false;
    if (anchor.hasAttribute('download')) return true;
    if (DOWNLOAD_EXTENSIONS.test(decoded)) return true;
    if (/controller=attachment|id_attachment=|\/releases\/download\/|\/downloads?\/|[?&](?:download|attachment)=/i.test(decoded)) return true;
    if (/multi-click\.pl$/i.test(url.hostname) && /attachment|id_attachment/i.test(decoded)) return true;
    if (/raw\.githubusercontent\.com$/i.test(url.hostname) && /\.(?:sh|ipk|apk|zip|json)(?:$|[?#])/i.test(decoded)) return true;

    const isInternalHtml = url.origin === window.location.origin && /\.html(?:$|[?#])/i.test(decoded);
    if (isInternalHtml) return false;

    const looksLikeDownloadButton = /\b(?:pobierz|pobieranie|download|ściągnij|instaluj|plik\s+ipk|plik\s+apk|wersja\s+x64|wersja\s+x86)\b/i.test(text);
    const pointsToFiles = /(?:^|\/)pliki\//i.test(decoded) || /(?:^|\/)archives?\//i.test(decoded);
    return looksLikeDownloadButton && pointsToFiles;
  }

  function getDownloadLabel(anchor) {
    const rawText = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (rawText && rawText.length <= 90) return rawText;
    try {
      const path = new URL(anchor.href, window.location.href).pathname;
      return safeDecode(path.split('/').pop() || 'Wybrany plik');
    } catch (error) {
      return 'Wybrany plik';
    }
  }

  function openSupportModal(download) {
    if (!modal) createSupportModal();
    pendingDownload = download;
    previouslyFocused = document.activeElement;
    statusMessage.textContent = '';
    continueButton.classList.remove('is-thanks');

    const fileBox = modal.querySelector('.support-gate-file');
    if (download) {
      fileBox.hidden = false;
      fileNameElement.textContent = download.label || fileNameFromUrl(download.href);
      continueButton.textContent = 'Przejdź dalej do pobierania';
      modal.querySelector('.support-gate-cancel').textContent = 'Anuluj';
    } else {
      fileBox.hidden = true;
      fileNameElement.textContent = '';
      continueButton.textContent = 'Zamknij planszę';
      modal.querySelector('.support-gate-cancel').textContent = 'Nie teraz';
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('support-gate-open');
    window.setTimeout(() => modal.querySelector('.support-method')?.focus(), 30);
  }

  function closeSupportModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('support-gate-open');
    pendingDownload = null;
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
  }

  function continueAfterPrompt() {
    if (!pendingDownload) {
      closeSupportModal();
      return;
    }

    const download = pendingDownload;
    pendingDownload = null;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('support-gate-open');

    const link = document.createElement('a');
    link.href = download.href;
    link.dataset.supportBypass = 'true';
    if (download.download) link.setAttribute('download', download.download);
    if (download.target) link.target = download.target;
    if (download.target === '_blank') link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function trapModalKeyboard(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSupportModal();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(element => element.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function fileNameFromUrl(href) {
    try {
      const path = new URL(href, window.location.href).pathname;
      return safeDecode(path.split('/').pop() || 'Wybrany plik');
    } catch (error) {
      return 'Wybrany plik';
    }
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); }
    catch (error) { return value; }
  }
})();
