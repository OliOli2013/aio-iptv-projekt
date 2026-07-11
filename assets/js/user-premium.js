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
          <input class="site-search-input" type="search" placeholder="Szukaj wtyczki, poradnika lub systemu…" aria-label="Wpisz szukaną frazę">
          <button class="site-search-close" type="button" aria-label="Zamknij wyszukiwarkę">✕</button>
        </div>
        <div class="site-search-results" aria-live="polite"><div class="site-search-empty">Zacznij wpisywać nazwę wtyczki, systemu lub poradnika.</div></div>
      </div>`;
    document.body.appendChild(modal);

    const input = $('.site-search-input', modal);
    const results = $('.site-search-results', modal);
    const closeButton = $('.site-search-close', modal);
    let index = [];
    let loaded = false;

    const fallback = [
      { title: 'Wtyczki', desc: 'Pobieranie i opisy wtyczek Enigma2.', url: 'plugins.html', tags: ['wtyczki', 'ipk'] },
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
        results.innerHTML = '<div class="site-search-empty">Zacznij wpisywać nazwę wtyczki, systemu lub poradnika.</div>';
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
