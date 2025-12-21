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

  
  function injectStyleOnce(id, cssText) {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = cssText;
    document.head.appendChild(style);
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
  

  // -----------------------------
  // Public comments (Supabase) — ONLY for Kontakt section
  // -----------------------------
  function initContactComments() {
    // Only on pages that include Kontakt section
    const kontakt = document.getElementById('kontakt') || document.querySelector('[data-section="kontakt"]');
    if (!kontakt) return;

    // Avoid double init
    if (document.getElementById('contact-comments-root')) return;

    // Minimal styling (kept in JS to avoid extra file edits)
    injectStyleOnce('contact-comments-css', `
      .contact-comments { margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.10); }
      .contact-comments__head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
      .contact-comments__title { font-size: 18px; margin: 0; }
      .contact-comments__note { font-size: 12px; opacity: .8; margin: 0; }
      .contact-comments__actions { display:flex; gap:8px; flex-wrap:wrap; }
      .contact-comments__btn {
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.06);
        color: inherit;
        border-radius: 12px;
        padding: 8px 10px;
        cursor: pointer;
        font-weight: 600;
      }
      .contact-comments__btn:hover { background: rgba(255,255,255,.10); }
      .contact-comments__grid { display:grid; gap:10px; }
      .contact-comments__row { display:grid; grid-template-columns: 180px 1fr; gap:10px; align-items:start; }
      .contact-comments__row input, .contact-comments__row textarea {
        width: 100%;
        border: 1px solid rgba(255,255,255,.16);
        background: rgba(0,0,0,.18);
        color: inherit;
        border-radius: 12px;
        padding: 10px 12px;
        outline: none;
      }
      .contact-comments__row textarea { min-height: 96px; resize: vertical; }
      .contact-comments__status { font-size: 13px; opacity: .9; }
      .comment-list { display:grid; gap:10px; margin-top: 12px; }
      .comment-item {
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.04);
        border-radius: 14px;
        padding: 10px 12px;
      }
      .comment-header { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size: 13px; opacity: .92; }
      .comment-text { margin-top: 6px; white-space: pre-wrap; }
      @media (max-width: 560px) {
        .contact-comments__row { grid-template-columns: 1fr; }
      }
    `);

    // Inject markup into Kontakt card
    const wrap = document.createElement('div');
    wrap.className = 'contact-comments';
    wrap.id = 'contact-comments-root';
    wrap.innerHTML = `
      <div class="contact-comments__head">
        <div>
          <h3 class="contact-comments__title">Komentarze</h3>
          <p class="contact-comments__note">Komentarze są publiczne. Proszę bez danych wrażliwych.</p>
        </div>
        <div class="contact-comments__actions">
          <button class="contact-comments__btn" type="button" id="contactCommentRefresh">Odśwież</button>
        </div>
      </div>

      <div class="contact-comments__grid">
        <div class="contact-comments__row">
          <input id="contactCommentName" type="text" placeholder="Twój nick (opcjonalnie)" autocomplete="nickname">
          <div></div>
        </div>
        <div class="contact-comments__row">
          <textarea id="contactCommentBody" placeholder="Treść komentarza..." autocomplete="off"></textarea>
          <div>
            <button class="contact-comments__btn" type="button" id="contactCommentSend">Dodaj komentarz</button>
            <div class="contact-comments__status" id="contactCommentStatus" style="margin-top:8px;"></div>
          </div>
        </div>

        <!-- honeypot (anti-spam) -->
        <input type="text" id="contactCommentHp" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;" tabindex="-1" autocomplete="off" aria-hidden="true">

        <div class="comment-list" id="contactCommentsList"></div>
      </div>
    `;

    kontakt.appendChild(wrap);

    const statusEl = document.getElementById('contactCommentStatus');
    const listEl = document.getElementById('contactCommentsList');
    const btnSend = document.getElementById('contactCommentSend');
    const btnRefresh = document.getElementById('contactCommentRefresh');

    // Basic client-side throttle (reduces accidental double posts)
    const throttleKey = 'aio_contact_comment_last_ts';
    const canPostNow = () => {
      const last = Number(localStorage.getItem(throttleKey) || '0');
      return Date.now() - last > 15000; // 15s
    };
    const markPosted = () => localStorage.setItem(throttleKey, String(Date.now()));

    const setStatus = (msg, kind='') => {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.style.opacity = msg ? '1' : '0';
    };

    const ensureSdk = () => new Promise((resolve) => {
      if (window.supabase && typeof window.supabase.createClient === 'function') return resolve(true);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });

    const run = async () => {
      // Config from window (if you keep it elsewhere), otherwise fallback to values from the old working site
      window.AIO_SITE = window.AIO_SITE || {};
      const sbUrl = window.AIO_SITE.supabaseUrl || 'https://pynjjeobqzxbrvmqofcw.supabase.co';
      const sbKey = window.AIO_SITE.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmpqZW9icXp4YnJ2bXFvZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NDA5MDYsImV4cCI6MjA4MTMxNjkwNn0.XSBB0DJw27Wrn41nranqFyj8YI0-YjLzX52dkdrgkrg';

      const ok = await ensureSdk();
      if (!ok || !window.supabase) {
        setStatus('Nie udało się załadować biblioteki komentarzy (Supabase).', 'err');
        return;
      }

      const client = window.supabase.createClient(sbUrl, sbKey);
      const pageKey = 'kontakt'; // canonical key for Kontakt section
      const legacyKeys = Array.from(new Set([pageKey, (location.pathname || '/'), '/']));

      const escape = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

      const render = (rows) => {
        if (!listEl) return;
        if (!rows || !rows.length) {
          listEl.innerHTML = '<div class="comment-item"><div class="comment-text">Brak komentarzy. Bądź pierwszy.</div></div>';
          return;
        }
        listEl.innerHTML = rows.map((c) => {
          const name = escape(c.name || 'Anonim');
          const msg = escape(c.message || '');
          const dt = c.created_at ? new Date(c.created_at) : null;
          const when = dt ? dt.toLocaleString() : '';
          return `
            <div class="comment-item">
              <div class="comment-header">
                <strong>${name}</strong>
                <span>${escape(when)}</span>
              </div>
              <div class="comment-text">${msg}</div>
            </div>
          `;
        }).join('');
      };

      const load = async () => {
        setStatus('Ładuję komentarze…');
        const { data, error } = await client
          .from('comments')
          .select('*')
          .in('page', legacyKeys)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.error(error);
          setStatus('Błąd pobierania komentarzy: ' + (error.message || 'unknown'));
          return;
        }
        setStatus('');
        render(data || []);
      };

      const send = async () => {
        const hp = document.getElementById('contactCommentHp');
        if (hp && hp.value) return; // bot

        if (!canPostNow()) {
          setStatus('Odczekaj chwilę przed kolejnym komentarzem (anty-spam).');
          return;
        }

        const nameEl = document.getElementById('contactCommentName');
        const bodyEl = document.getElementById('contactCommentBody');
        const name = (nameEl?.value || '').trim();
        const message = (bodyEl?.value || '').trim();
        if (!message) {
          setStatus('Wpisz treść komentarza.');
          return;
        }

        btnSend && (btnSend.disabled = true);
        setStatus('Wysyłam…');

        const { error } = await client.from('comments').insert({
          page: pageKey,
          name: name || 'Anonim',
          message
        });

        btnSend && (btnSend.disabled = false);

        if (error) {
          console.error(error);
          setStatus('Błąd wysyłania: ' + (error.message || 'unknown'));
          return;
        }

        markPosted();
        if (bodyEl) bodyEl.value = '';
        setStatus('Dodano komentarz.');
        await load();
        setTimeout(() => setStatus(''), 1500);
      };

      btnRefresh && btnRefresh.addEventListener('click', load);
      btnSend && btnSend.addEventListener('click', send);

      await load();
    };

    run().catch((e) => {
      console.error(e);
      setStatus('Błąd modułu komentarzy.');
    });
  }

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
    setActiveNav();
    initUpdates();
    initPayPal();
    initMarquee();
    initAIChatDrawer();
    initOneLinerGenerator();
    initContactComments();
  });
})();
