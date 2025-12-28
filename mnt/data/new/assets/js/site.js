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
      marquee_text2: 'Wsparcie (kawa): Revolut i PayPal — dziękuję!',
      marquee_cta: 'Postaw kawę',
      holiday:
        'Paweł Pawełek — życzy Zdrowych Wesołych Świąt',

      // (nieużywane w marquee; zostawione na przyszłość)
      newyear_greeting: 'Szczęśliwego Nowego Roku 2026 życzy Paweł Pawełek!',

      generator_hint: '# Zaznacz przynajmniej jedną opcję powyżej...',
      show_more: 'Pokaż więcej',
      show_less: 'Pokaż mniej',

      file_before: 'Plik „przed”',
      file_after: 'Plik „po”',
      compare: 'Porównaj',
      download_report: 'Pobierz raport',
      clear: 'Wyczyść',

      checklist_run: 'Uruchom testy',
      checklist_copy: 'Kopiuj komendy',

      srv_load_sample: 'Wczytaj próbkę',
      srv_upload: 'Wczytaj plik lamedb',
      srv_export: 'Eksport CSV',
      srv_search: 'Szukaj kanału / ServiceRef…'
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
      marquee_text2: 'Coffee support: Revolut & PayPal — thank you!',
      marquee_cta: 'Buy coffee',
      holiday:
        'Paweł Pawełek — wishes you a joyful holiday season',

      // (not used in marquee; kept for future use)
      newyear_greeting: 'Happy New Year 2026 — from Paweł Pawełek!',

      generator_hint: '# Select at least one option above...',
      show_more: 'Show more',
      show_less: 'Show less',

      file_before: '“Before” file',
      file_after: '“After” file',
      compare: 'Compare',
      download_report: 'Download report',
      clear: 'Clear',

      checklist_run: 'Run tests',
      checklist_copy: 'Copy commands',

      srv_load_sample: 'Load sample',
      srv_upload: 'Load lamedb file',
      srv_export: 'Export CSV',
      srv_search: 'Search channel / ServiceRef…'
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

  window.copyToClipboard = async function (elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) return;

    const btn = (function () {
      // Expected layout: <div id="..."> + <button class="copy-btn">
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
      } catch (e) {
        // ignore
      }
      document.body.removeChild(ta);
      flash();
    }
  };

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
  // Notifications bell
  // -------------------------
  function initUpdates() {
    const bell = qs('#bellBtn');
    const panel = qs('#notifPanel');
    if (!bell || !panel) return;

    async function load() {
      try {
        const res = await fetch('./data/updates.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const items = await res.json();
        panel.innerHTML = `<div style="font-weight:900;margin:4px 6px 10px">${escapeHtml(t('updates'))}</div>`;
        (Array.isArray(items) ? items : []).slice(0, 14).forEach((it) => {
          const div = document.createElement('div');
          div.className = 'notif-item';
          div.innerHTML = `
            <div style="width:26px;opacity:.9">🔔</div>
            <div>
              <div style="font-weight:900">${escapeHtml(it.title || '')}</div>
              <div class="date">${escapeHtml(it.date || '')}</div>
              ${it.details ? `<div style="margin-top:6px;opacity:.85;line-height:1.35">${escapeHtml(it.details)}</div>` : ''}
            </div>
          `;
          panel.appendChild(div);
        });
      } catch (e) {
        panel.innerHTML = `<div class="notif-item"><div>⚠️</div><div>${lang === 'pl' ? 'Nie udało się wczytać aktualizacji.' : 'Failed to load updates.'}</div></div>`;
      }
    }

    const toggle = async () => {
      if (!panel.dataset.loaded) {
        await load();
        panel.dataset.loaded = '1';
      }
      panel.classList.toggle('open');
    };

    bell.addEventListener('click', toggle);
    document.addEventListener('click', (e) => {
      if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== bell) {
        panel.classList.remove('open');
      }
    });
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
    } catch (_) {
      // ignore
    }
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
            <div class="marquee-text">${escapeHtml(t('marquee_text2'))}</div>
          </div>
          <a class="marquee-cta" href="support.html">${escapeHtml(t('marquee_cta'))}</a>
        </div>
      </div>
    `;

    document.body.insertBefore(bar, document.body.firstChild);
  }

  // -------------------------
  // External visit counter (counterliczniki.com)
  // -------------------------
  function initExternalCounter() {
    if (window.__counterlicznikiLoaded) return;
    const footer = document.querySelector('footer.site-footer .footer-bottom');
    if (!footer) return;

    const wrap = document.createElement('div');
    wrap.className = 'counterliczniki';
    wrap.id = 'counterliczniki-root';
    wrap.innerHTML = "<a href='http://www.counterliczniki.com' rel='nofollow' target='_blank'>licznik odwiedzin tumblr</a>";
    footer.appendChild(wrap);

    const s1 = document.createElement('script');
    s1.type = 'text/javascript';
    s1.src = 'https://www.counterliczniki.com/auth.php?id=1a977b2874c28eff7105e5f733e082df3e79428e';
    const s2 = document.createElement('script');
    s2.type = 'text/javascript';
    s2.src = 'https://www.counterliczniki.com/pl/home/counter/1464496/t/0';

    document.body.appendChild(s1);
    document.body.appendChild(s2);
    window.__counterlicznikiLoaded = true;
  }

  // -------------------------
  // Generator One-Liner
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

  
  // -----------------------------
  // AI-Chat Enigma2 (drawer, offline KB + optional online endpoint)
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
        <button type="button" class="ai-drawer__close" id="ai-chat-close" aria-label="Zamknij">✕</button>
      </div>
      <div class="ai-drawer__meta" id="ai-chat-meta"></div>
      <div class="ai-drawer__messages" id="aiChatMessages"></div>
      <form class="ai-drawer__form" id="aiChatForm" autocomplete="off">
        <input id="aiChatInput" class="ai-drawer__input" type="text" placeholder="Zadaj pytanie o Enigma2…" />
        <button class="ai-drawer__send" type="submit">Wyślij</button>
      </form>
      <div class="ai-drawer__hint">Podpowiedź: pytaj np. „jak zainstalować softcam feed?” albo „gdzie są picony?”.</div>
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
    return (s || '').toString().toLowerCase()
      .replace(/[ąć]/g,'a').replace(/[ę]/g,'e').replace(/[ł]/g,'l')
      .replace(/[ń]/g,'n').replace(/[ó]/g,'o').replace(/[ś]/g,'s')
      .replace(/[żź]/g,'z')
      .replace(/[^a-z0-9\s_-]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function scoreKBItem(item, q) {
    const nq = normText(q);
    if (!nq) return 0;
    const words = nq.split(' ').filter(w => w.length > 2).slice(0, 8);

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
      .map(it => ({ it, score: scoreKBItem(it, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!scored.length) {
      return [
        'Nie znalazłem dokładnej odpowiedzi w bazie offline.',
        'Spróbuj doprecyzować: model tunera / image (OpenATV/OpenPLi) / błąd z logu.',
        'Jeżeli masz tryb ONLINE (API), ustaw go w data/aichat_config.json.'
      ];
    }

    const out = [];
    out.push(`Znalazłem w bazie offline ${scored.length} pasujące tematy:`);
    scored.forEach((x, i) => {
      out.push(`${i + 1}) ${x.it.title}`);
      if (x.it.summary) out.push(`— ${x.it.summary}`);
      const cmds = (x.it.commands || []).slice(0, 3);
      if (cmds.length) {
        out.push('Polecenia (przykłady):');
        cmds.forEach(c => out.push(`$ ${c}`));
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

  async function safeFetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }


  async function initAIChatDrawer() {
    injectAIChatMarkup();

    const fab = document.getElementById('ai-chat-fab');
    const closeBtn = document.getElementById('ai-chat-close');
    const backdrop = document.getElementById('ai-chat-backdrop');

    fab && fab.addEventListener('click', () => setAIChatOpen(true));
    closeBtn && closeBtn.addEventListener('click', () => setAIChatOpen(false));
    backdrop && backdrop.addEventListener('click', () => setAIChatOpen(false));

    const form = document.getElementById('aiChatForm');
    const input = document.getElementById('aiChatInput');
    const meta = document.getElementById('ai-chat-meta');

    const defaults = {
      mode: 'offline',
      provider: 'supabase',
      endpoint: '',
      supabaseUrl: '',
      supabaseAnonKey: '',
      functionName: 'ai-chat'
    };

    let cfg = { ...defaults };
    try {
      const fromFile = await safeFetchJSON('./data/aichat_config.json');
      if (fromFile && typeof fromFile === 'object') cfg = { ...cfg, ...fromFile };
    } catch (e) {
      // ignore
    }

    // Allow legacy globals (from base build) if present
    if (!cfg.supabaseUrl && window.AIO_SITE && window.AIO_SITE.supabaseUrl) {
      cfg.supabaseUrl = window.AIO_SITE.supabaseUrl;
    }
    if (!cfg.supabaseAnonKey && window.AIO_SITE && window.AIO_SITE.supabaseAnonKey) {
      cfg.supabaseAnonKey = window.AIO_SITE.supabaseAnonKey;
    }

    const onlineSupabase =
      cfg.mode === 'online' &&
      String(cfg.provider || 'supabase').toLowerCase() === 'supabase' &&
      !!cfg.supabaseUrl &&
      !!cfg.supabaseAnonKey;

    const onlineEndpoint = cfg.mode === 'online' && !!cfg.endpoint;

    if (meta) {
      if (onlineSupabase) meta.textContent = 'Tryb: ONLINE';
      else if (onlineEndpoint) meta.textContent = 'Tryb: ONLINE';
      else meta.textContent = 'Tryb: OFFLINE (baza wiedzy)';
    }

    let kb = [];
    try {
      kb = await safeFetchJSON('./data/knowledge.json');
    } catch (e) {
      kb = [];
    }

    async function callSupabaseFunction(query) {
      const base = String(cfg.supabaseUrl).replace(/\/+$/, '');
      const fn = String(cfg.functionName || 'ai-chat').trim() || 'ai-chat';
      const url = `${base}/functions/v1/${encodeURIComponent(fn)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.supabaseAnonKey,
          'Authorization': `Bearer ${cfg.supabaseAnonKey}`
        },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const reply = (data && (data.reply || data.text || data.message)) ? String(data.reply || data.text || data.message) : '';
      return reply.trim();
    }

    async function callGenericEndpoint(message) {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, source: 'aio-iptv', locale: lang })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const reply = (data && (data.reply || data.text || data.message)) ? String(data.reply || data.text || data.message) : '';
      return reply.trim();
    }

    function botLines(lines) {
      (lines || []).forEach((l) => renderChatMessage('bot', l));
    }

    form && form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = (input && input.value || '').trim();
      if (!q) return;
      if (input) input.value = '';
      renderChatMessage('user', q);

      // ONLINE
      if (onlineSupabase || onlineEndpoint) {
        try {
          const reply = onlineSupabase ? await callSupabaseFunction(q) : await callGenericEndpoint(q);
          renderChatMessage('bot', reply || (lang === 'pl' ? 'Brak odpowiedzi z trybu ONLINE.' : 'No reply from ONLINE mode.'));
          return;
        } catch (e) {
          renderChatMessage('bot', lang === 'pl'
            ? 'Nie udało się połączyć z trybem ONLINE. Odpowiadam z bazy offline.'
            : 'Unable to reach ONLINE mode. Falling back to offline knowledge base.'
          );
        }
      }

      // OFFLINE fallback
      botLines(buildOfflineReply(q, kb));
    });

    // Auto-open on the dedicated AI-Chat tab
    const isAIChatPage = (location.pathname.split('/').pop() || '').toLowerCase() === 'ai-chat.html';
    if (isAIChatPage || window.__aio_ai_chat_autopen) {
      // Wait a tick so CSS/layout is ready
      setTimeout(() => setAIChatOpen(true), 80);
    }
  }


document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    initDrawer();
    setActiveNav();
    initUpdates();
    initPayPal();
    initMarquee();
    initAIChatDrawer();
    initExternalCounter();
    initOneLinerGenerator();
  });
})();
