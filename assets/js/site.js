(function () {
  'use strict';

  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  // -------------------------
  // i18n (auto by device; PL fallback)
  // -------------------------
  const LANG_KEY = 'aio_lang';

  function detectLang() {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'pl' || saved === 'en') return saved;
    const l = String(navigator.language || 'pl').toLowerCase();
    return l.startsWith('pl') ? 'pl' : 'en';
  }

  const lang = detectLang();
  document.documentElement.setAttribute('lang', lang);

  function getLang() {
    return lang;
  }

  const dict = {
    pl: {
      nav_home: 'Start',
      nav_ai: 'AI-Chat Enigma2',
      nav_plugins: 'Wtyczki',
      nav_lists: 'Listy kanałów',
      nav_guides: 'Poradniki',
      nav_tools: 'Narzędzia',
      nav_downloads: 'Pobieranie',
      nav_systems: 'Systemy',
      nav_contact: 'Kontakt',
      nav_support: 'Wsparcie',
      nav_stats: 'Statystyki',
      nav_futurelab: 'Future Lab',

      cta_update: 'Aktualizacja: AIO Panel v5.0',
      cta_download: 'Pobierz teraz',

      updates: 'Nowości',
      support: 'Wesprzyj projekt',

      marquee_text:
        'Wesprzyj AIO‑IPTV — kawa pomaga rozwijać stronę i autorskie wtyczki: AIO Panel, IPTV Dream i inne.',
      marquee_cta: 'Postaw kawę',
      holiday:
        'Paweł Pawełek — życzy Zdrowych Wesołych Świąt',

      generator_hint: '# Zaznacz przynajmniej jedną opcję powyżej...',

      // AI Chat
      ai_placeholder: 'Zadaj pytanie o Enigma2…',
      ai_send: 'Wyślij',
      ai_hint: 'Podpowiedź: pytaj np. „jak zainstalować softcam feed?” albo „gdzie są picony?”.',
      ai_mode_offline: 'Tryb: OFFLINE (baza wiedzy)',
      ai_mode_online: 'Tryb: ONLINE'
    },
    en: {
      nav_home: 'Home',
      nav_ai: 'AI-Chat Enigma2',
      nav_plugins: 'Plugins',
      nav_lists: 'Channel lists',
      nav_guides: 'Guides',
      nav_tools: 'Tools',
      nav_downloads: 'Downloads',
      nav_systems: 'Systems',
      nav_contact: 'Contact',
      nav_support: 'Support',
      nav_stats: 'Stats',
      nav_futurelab: 'Future Lab',

      cta_update: 'Update: AIO Panel v5.0',
      cta_download: 'Download now',

      updates: 'Updates',
      support: 'Support the project',

      marquee_text:
        'Support AIO‑IPTV — coffee helps build the site and original plugins: AIO Panel, IPTV Dream and more.',
      marquee_cta: 'Buy coffee',
      holiday:
        'Paweł Pawełek — wishes you a joyful holiday season',

      generator_hint: '# Select at least one option above...',

      // AI Chat
      ai_placeholder: 'Ask about Enigma2…',
      ai_send: 'Send',
      ai_hint: 'Tip: ask “how to install softcam feed?” or “where are picons?”.',
      ai_mode_offline: 'Mode: OFFLINE (knowledge base)',
      ai_mode_online: 'Mode: ONLINE'
    }
  };

  function t(key) {
    return (dict[lang] && dict[lang][key]) || (dict.pl && dict.pl[key]) || '';
  }

  function applyI18n() {
    qsa('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      const v = t(k);
      if (v) el.textContent = v;
    });
    qsa('[data-i18n-placeholder]').forEach((el) => {
      const k = el.getAttribute('data-i18n-placeholder');
      const v = t(k);
      if (v) el.setAttribute('placeholder', v);
    });
    qsa('[data-i18n-aria]').forEach((el) => {
      const k = el.getAttribute('data-i18n-aria');
      const v = t(k);
      if (v) el.setAttribute('aria-label', v);
    });
  }

  // -------------------------
  // Helpers
  // -------------------------
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
    );
  }

  function relUrl(path) {
    // Works on GitHub Pages subpaths
    return new URL(path, document.baseURI).toString();
  }

  async function safeFetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  window.copyToClipboard = async function (elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) return;

    const btn = (function () {
      const maybe = el.parentElement ? el.parentElement.querySelector('button.copy-btn') : null;
      return maybe;
    })();

    const flash = () => {
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = lang === 'pl' ? '✅ Skopiowano!' : '✅ Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove('copied');
      }, 1100);
    };

    try {
      await navigator.clipboard.writeText(text);
      flash();
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (e) {}
      document.body.removeChild(ta);
      flash();
    }
  };

  // -------------------------
  // Analytics (GA4 tag injection)
  // -------------------------
  async function initAnalytics() {
    // Optional config file. Safe for GitHub Pages (no secrets).
    try {
      const cfg = await safeFetchJSON(relUrl('data/analytics_config.json'));
      const mid = (cfg && cfg.measurement_id) ? String(cfg.measurement_id).trim() : '';
      if (!mid) return;

      // Avoid double-inject
      if (window.__aioGtagLoaded) return;

      window.dataLayer = window.dataLayer || [];
      function gtag(){ window.dataLayer.push(arguments); }
      window.gtag = window.gtag || gtag;

      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(mid);
      document.head.appendChild(s);

      gtag('js', new Date());
      gtag('config', mid, { anonymize_ip: true });

      window.__aioGtagLoaded = true;
    } catch (_) {
      // ignore
    }
  }

  // -------------------------
  // Mobile drawer
  // -------------------------
  function initDrawer() {
    const btn = qs('#navToggle');
    const drawer = qs('#mobileDrawer');
    const back = qs('#drawerBackdrop');
    if (!btn || !drawer || !back) return;

    const open = () => {
      drawer.classList.add('open');
      back.classList.add('open');
      document.body.style.overflow = 'hidden';
      drawer.setAttribute('aria-hidden', 'false');
    };
    const close = () => {
      drawer.classList.remove('open');
      back.classList.remove('open');
      document.body.style.overflow = '';
      drawer.setAttribute('aria-hidden', 'true');
    };

    btn.addEventListener('click', open);
    back.addEventListener('click', close);
    qsa('[data-drawer-close]').forEach((x) => x.addEventListener('click', close));
    qsa('a', drawer).forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  // -------------------------
  // Active nav
  // -------------------------
  function setActiveNav() {
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    qsa('.nav a').forEach((a) => {
      const href = String(a.getAttribute('href') || '').toLowerCase();
      if (href === path) a.classList.add('active');
      else a.classList.remove('active');
    });
  }

  // -------------------------
  // Notifications bell (changelog from data/updates.json)
  // -------------------------
  function parseTs(it) {
    if (typeof it.ts === 'number' && isFinite(it.ts)) return it.ts;
    const d = Date.parse(it.date || '');
    return isNaN(d) ? 0 : d;
  }

  
  // Mobile portrait navigation UX:
  // - ensures navigation links are fully visible (no confusing horizontal swipe),
  // - optionally moves the hamburger (#navToggle) to the left side near the coffee/cup button.
  function fixMobileNavPortrait() {
    const mq = window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;
    const isPortraitSmall = mq ? mq.matches : (window.innerWidth <= 768);

    const toggle = qs('#navToggle');
    if (!toggle) return;

    // Inject minimal CSS once (scoped by body class + data attribute).
    let styleEl = qs('#aioMobileNavPortraitStyle');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'aioMobileNavPortraitStyle';
      styleEl.textContent = `
        @media (max-width: 768px) {
          body.aio-mobile-nav-wrap [data-aio-nav-row="1"] {
            display: flex !important;
            flex-wrap: wrap !important;
            overflow-x: visible !important;
            white-space: normal !important;
            gap: 6px !important;
            row-gap: 6px !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 4px !important;
          }
          body.aio-mobile-nav-wrap [data-aio-nav-row="1"] a,
          body.aio-mobile-nav-wrap [data-aio-nav-row="1"] button {
            flex: 1 0 48% !important;
            min-width: auto !important;
            max-width: calc(50% - 3px) !important;
            padding: 8px 6px !important;
            font-size: clamp(11px, 2.8vw, 14px) !important;
            line-height: 1.2 !important;
            text-align: center !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
          }

          /* Ensure content fits viewport */
          body.aio-mobile-nav-wrap {
            overflow-x: hidden !important;
          }

          /* Adjust marquee for mobile */
          @media (max-width: 768px) {
            .marquee-bar {
              padding: 6px 0 !important;
            }
            .marquee-inner {
              gap: 8px !important;
              padding: 0 8px !important;
            }
            .marquee-track {
              font-size: clamp(10px, 2.5vw, 12px) !important;
            }
            .marquee-cta {
              padding: 4px 10px !important;
              font-size: clamp(10px, 2.5vw, 12px) !important;
            }
          }
        }
      `;
      document.head.appendChild(styleEl);
    }

    // Tag the best nav container within topbar
    const topRoot = qs('.topbar') || qs('#topbar') || document.body;
    const containers = qsa('nav, .nav, .nav-links, .topbar-nav, ul', topRoot);

    let best = null;
    let bestN = 0;
    for (const el of containers) {
      const n = el.querySelectorAll('a').length;
      if (n > bestN) { best = el; bestN = n; }
    }
    if (best) best.setAttribute('data-aio-nav-row', '1');

    document.body.classList.toggle('aio-mobile-nav-wrap', !!isPortraitSmall);

    // Move hamburger near the coffee/cup link (if present) in portrait small.
    if (isPortraitSmall) {
      const coffee =
        qs('a[aria-label*="kaw" i]') ||
        qs('a[title*="kaw" i]') ||
        qs('a[href*="kaw" i]') ||
        qs('a[href*="coffee" i]') ||
        qs('button[aria-label*="kaw" i]');

      if (coffee && coffee.parentElement) {
        const p = coffee.parentElement;
        if (toggle.parentElement !== p) {
          try { p.insertBefore(toggle, coffee); } catch (_) {}
        } else {
          // ensure ordering
          try {
            if (coffee.previousElementSibling !== toggle) p.insertBefore(toggle, coffee);
          } catch (_) {}
        }
        toggle.style.marginRight = '10px';
      }
    } else {
      const actions = qs('.topbar-actions') || qs('.header-actions') || qs('#headerActions') || qs('.actions');
      if (actions && toggle.parentElement !== actions) {
        try { actions.appendChild(toggle); } catch (_) {}
      }
      toggle.style.marginRight = '';
    }
  }


function iconForType(type) {
    const t = String(type || '').toLowerCase();
    if (t === 'fix') return '🛠';
    if (t === 'feature') return '✨';
    if (t === 'change') return '🔁';
    if (t === 'release') return '📦';
    return '🔔';
  }

  function initUpdates() {
    const bell = qs('#bellBtn');
    const panel = qs('#notifPanel');
    if (!bell || !panel) return;

    // Badge
    let badge = bell.querySelector('.bell-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'bell-badge';
      badge.style.display = 'none';
      bell.appendChild(badge);
    }

    const SEEN_KEY = 'aio_updates_seen_ts';
    const seenTs = () => Number(localStorage.getItem(SEEN_KEY) || '0') || 0;
    const setSeen = (ts) => localStorage.setItem(SEEN_KEY, String(ts || 0));

    let cachedItems = null;

    async function load() {
      try {
        const items = await safeFetchJSON(relUrl('data/updates.json'));
        cachedItems = Array.isArray(items) ? items : [];
        const newest = cachedItems.reduce((m, x) => Math.max(m, parseTs(x)), 0);
        const unread = cachedItems.filter((x) => parseTs(x) > seenTs()).length;

        if (unread > 0) {
          badge.textContent = unread > 99 ? '99+' : String(unread);
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }

        panel.innerHTML = `<div class="notif-title">${escapeHtml(t('updates'))}</div>`;
        cachedItems
          .slice()
          .sort((a, b) => parseTs(b) - parseTs(a))
          .slice(0, 20)
          .forEach((it) => {
            const div = document.createElement('div');
            div.className = 'notif-item';
            const ic = iconForType(it.type);
            div.innerHTML = `
              <div class="notif-ic">${escapeHtml(ic)}</div>
              <div>
                <div class="notif-h">${escapeHtml(it.title || '')}</div>
                <div class="date">${escapeHtml(it.date || '')}</div>
                ${it.details ? `<div class="notif-d">${escapeHtml(it.details)}</div>` : ''}
              </div>
            `;
            panel.appendChild(div);
          });

        panel.dataset.newestTs = String(newest || 0);
      } catch (e) {
        panel.innerHTML = `<div class="notif-item"><div>⚠️</div><div>${lang === 'pl' ? 'Nie udało się wczytać aktualizacji.' : 'Failed to load updates.'}</div></div>`;
      }
    }

    const openPanel = async () => {
      if (!panel.dataset.loaded) {
        await load();
        panel.dataset.loaded = '1';
      }
      panel.classList.add('open');

      // Mark as read (on open)
      const newest = Number(panel.dataset.newestTs || '0') || 0;
      if (newest > 0) setSeen(newest);
      badge.style.display = 'none';
    };

    const closePanel = () => panel.classList.remove('open');

    bell.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (panel.classList.contains('open')) closePanel();
      else await openPanel();
    });

    document.addEventListener('click', (e) => {
      if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== bell) {
        closePanel();
      }
    });

    // refresh badge in background
    load().catch(() => {});
  }

  // -------------------------
  // PayPal obfuscation (personal)
  // -------------------------
  function initPayPal() {
    const btn = qs('#paypalSupportBtn');
    if (!btn) return;
    try {
      const b64 = btn.getAttribute('data-paypal');
      if (!b64) return;
      btn.setAttribute('href', atob(b64));
    } catch (_) {}
  }

  // -------------------------
  // Top marquee (coffee + holiday)
  // -------------------------
  function initMarquee() {
    if (qs('#aioMarqueeBar')) return;

    const bar = document.createElement('div');
    bar.className = 'marquee-bar';
    bar.id = 'aioMarqueeBar';
    bar.innerHTML = `
      <div class="container">
        <div class="marquee-inner">
          <span class="marquee-pill">☕</span>
          <div class="marquee-track" aria-label="marquee">
            <div class="marquee-text">${escapeHtml(t('marquee_text'))}</div>
            <div class="marquee-text">${escapeHtml(t('holiday'))}</div>
          </div>
          <a class="marquee-cta" href="support.html">${escapeHtml(t('marquee_cta'))}</a>
        </div>
      </div>
    `;

    document.body.insertBefore(bar, document.body.firstChild);
  }

  // -----------------------------
  // AI-Chat Enigma2 (drawer, offline KB + optional online endpoint / Supabase)
  // -----------------------------
  function injectAIChatMarkup() {
    if (document.getElementById('ai-chat-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'ai-chat-fab';
    fab.className = 'ai-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'AI Chat');
    fab.innerHTML = '<span class="ai-fab__icon">🤖</span><span class="ai-fab__text">AI Chat</span>';
    document.body.appendChild(fab);

    const backdrop = document.createElement('div');
    backdrop.id = 'ai-chat-backdrop';
    backdrop.className = 'ai-backdrop';
    document.body.appendChild(backdrop);

    const drawer = document.createElement('div');
    drawer.id = 'ai-chat-drawer';
    drawer.className = 'ai-drawer';
    drawer.innerHTML = `
      <div class="ai-drawer__head">
        <div class="ai-drawer__title">AI‑Chat Enigma2</div>
        <button type="button" class="ai-drawer__close" id="ai-chat-close" aria-label="Close">✕</button>
      </div>
      <div class="ai-drawer__meta" id="ai-chat-meta"></div>
      <div class="ai-drawer__messages" id="aiChatMessages"></div>
      <form class="ai-drawer__form" id="aiChatForm" autocomplete="off">
        <input id="aiChatInput" class="ai-drawer__input" type="text" data-i18n-placeholder="ai_placeholder" placeholder="${escapeHtml(t('ai_placeholder'))}" />
        <button class="ai-drawer__send" type="submit" data-i18n="ai_send">${escapeHtml(t('ai_send'))}</button>
      </form>
      <div class="ai-drawer__hint" data-i18n="ai_hint">${escapeHtml(t('ai_hint'))}</div>
    `;
    document.body.appendChild(drawer);
  }

  function setAIChatOpen(open) {
    const drawer = document.getElementById('ai-chat-drawer');
    const backdrop = document.getElementById('ai-chat-backdrop');
    if (!drawer || !backdrop) return;
    drawer.classList.toggle('is-open', !!open);
    backdrop.classList.toggle('is-open', !!open);
    document.documentElement.classList.toggle('ai-lock', !!open);
  }

  function normText(s) {
    return (s || '')
      .toString()
      .toLowerCase()
      .replace(/[ąć]/g, 'a')
      .replace(/[ę]/g, 'e')
      .replace(/[ł]/g, 'l')
      .replace(/[ń]/g, 'n')
      .replace(/[ó]/g, 'o')
      .replace(/[ś]/g, 's')
      .replace(/[żź]/g, 'z')
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scoreKBItem(item, q) {
    const nq = normText(q);
    if (!nq) return 0;
    const words = nq.split(' ').filter((w) => w.length > 2).slice(0, 8);

    const title = normText(item.title);
    const tags = (item.tags || []).map(normText).join(' ');
    const summary = normText(item.summary);
    const body = normText((item.content || []).join(' '));

    let s = 0;
    for (const w of words) {
      if (title.includes(w)) s += 6;
      if (tags.includes(w)) s += 4;
      if (summary.includes(w)) s += 2;
      if (body.includes(w)) s += 1;
    }
    return s;
  }

  function buildOfflineReply(q, kb) {
    const scored = (kb || [])
      .map((it) => ({ it, score: scoreKBItem(it, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!scored.length) {
      return [
        lang === 'pl'
          ? 'Nie znalazłem dokładnej odpowiedzi w bazie offline.'
          : 'I could not find an exact answer in the offline knowledge base.',
        lang === 'pl'
          ? 'Spróbuj doprecyzować: model tunera / image (OpenATV/OpenPLi) / błąd z logu.'
          : 'Try to уточнить: receiver model / image (OpenATV/OpenPLi) / error log.',
        lang === 'pl'
          ? 'Jeżeli masz tryb ONLINE (API), skonfiguruj go w data/aichat_config.json.'
          : 'If you have ONLINE mode (API), configure it in data/aichat_config.json.'
      ];
    }

    const out = [];
    out.push(
      (lang === 'pl' ? 'Znalazłem w bazie offline ' : 'Found in offline KB ') +
        scored.length +
        (lang === 'pl' ? ' pasujące tematy:' : ' matching topics:')
    );
    scored.forEach((x, i) => {
      out.push(`${i + 1}) ${x.it.title}`);
      if (x.it.summary) out.push(`— ${x.it.summary}`);
      const cmds = (x.it.commands || []).slice(0, 3);
      if (cmds.length) {
        out.push(lang === 'pl' ? 'Polecenia (przykłady):' : 'Commands (examples):');
        cmds.forEach((c) => out.push(`$ ${c}`));
      }
    });
    return out;
  }

  function renderChatMessage(role, text) {
    const messages = document.getElementById('aiChatMessages');
    if (!messages) return;
    const el = document.createElement('div');
    el.className = 'ai-msg ' + (role === 'user' ? 'ai-msg--user' : 'ai-msg--bot');
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function makeOnlineClient(cfg) {
    // Supported configurations:
    // 1) Supabase (recommended): { mode:"online", supabase:{ url, anonKey, function:"ai-chat" } }
    // 2) Generic endpoint: { mode:"online", endpoint:"https://...", headers:{...} }
    const supa = cfg && cfg.supabase ? cfg.supabase : null;
    if (cfg && cfg.mode === 'online' && supa && supa.url && supa.anonKey) {
      const fn = supa.function || 'ai-chat';
      const endpoint = String(supa.url).replace(/\/+$/, '') + '/functions/v1/' + fn;
      const headers = {
        'Content-Type': 'application/json',
        apikey: String(supa.anonKey),
        Authorization: 'Bearer ' + String(supa.anonKey)
      };
      return { endpoint, headers };
    }

    if (cfg && cfg.mode === 'online' && cfg.endpoint) {
      const headers = Object.assign({ 'Content-Type': 'application/json' }, cfg.headers || {});
      return { endpoint: cfg.endpoint, headers };
    }

    return null;
  }

  async function initAIChatDrawer() {
    injectAIChatMarkup();
    applyI18n();

    const fab = document.getElementById('ai-chat-fab');
    const closeBtn = document.getElementById('ai-chat-close');
    const backdrop = document.getElementById('ai-chat-backdrop');

    fab && fab.addEventListener('click', () => setAIChatOpen(true));
    closeBtn && closeBtn.addEventListener('click', () => setAIChatOpen(false));
    backdrop && backdrop.addEventListener('click', () => setAIChatOpen(false));

    const form = document.getElementById('aiChatForm');
    const input = document.getElementById('aiChatInput');
    const meta = document.getElementById('ai-chat-meta');

    let cfg = { mode: 'offline' };
    try {
      cfg = await safeFetchJSON(relUrl('data/aichat_config.json'));
    } catch (_) {}

    const online = makeOnlineClient(cfg);
    meta.textContent = online ? t('ai_mode_online') : t('ai_mode_offline');

    let kb = [];
    try {
      kb = await safeFetchJSON(relUrl('data/knowledge.json'));
    } catch (_) {
      kb = [];
    }

    form &&
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const q = (input && input.value) || '';
        const query = q.trim();
        if (!query) return;
        if (input) input.value = '';
        renderChatMessage('user', query);

        if (online) {
          try {
            const res = await fetch(online.endpoint, {
              method: 'POST',
              headers: online.headers,
              body: JSON.stringify({ query: query, message: query, source: 'aio-iptv', locale: getLang() })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const reply = (data.reply || data.text || data.message || '').toString().trim();
            renderChatMessage('bot', reply || (lang === 'pl' ? 'Brak odpowiedzi z endpointu.' : 'No response from endpoint.'));
            return;
          } catch (e) {
            renderChatMessage(
              'bot',
              lang === 'pl'
                ? 'Nie udało się połączyć z trybem ONLINE. Odpowiadam z bazy offline.'
                : 'Failed to reach ONLINE mode. Falling back to offline KB.'
            );
          }
        }

        const lines = buildOfflineReply(query, kb);
        lines.forEach((l) => renderChatMessage('bot', l));
      });
  }

  // -------------------------
  // One-liner generator
  // -------------------------
  function initOneLinerGenerator() {
    const output = qs('#generator-output');
    if (!output) return;

    const checks = qsa('input[type="checkbox"][data-target]');
    if (!checks.length) return;

    const update = () => {
      const parts = [];
      for (const cb of checks) {
        if (!cb.checked) continue;
        const tid = cb.getAttribute('data-target');
        const src = tid ? document.getElementById(tid) : null;
        const txt = src ? String(src.innerText || src.textContent || '').trim() : '';
        if (txt) parts.push(txt);
      }
      output.textContent = parts.length ? parts.join(' && ') : t('generator_hint');
    };

    checks.forEach((cb) => cb.addEventListener('change', update));
    update();
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    initAnalytics();
    initDrawer();
    fixMobileNavPortrait();
    // keep it responsive to rotations/resizes
    let __aioNavFixT = null;
    const __aioNavFix = () => { clearTimeout(__aioNavFixT); __aioNavFixT = setTimeout(fixMobileNavPortrait, 80); };
    window.addEventListener('resize', __aioNavFix, { passive: true });
    window.addEventListener('orientationchange', __aioNavFix, { passive: true });
    setActiveNav();
    initUpdates();
    initPayPal();
    initMarquee();
    initAIChatDrawer();
    initOneLinerGenerator();
  });
})();
