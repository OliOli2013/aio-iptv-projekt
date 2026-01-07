(function () {
  'use strict';

  // =========================
  // KONFIGURACJA AIO-IPTV (SUPABASE)
  // =========================
  window.AIO_SITE = window.AIO_SITE || {};
  window.AIO_SITE.supabaseUrl = "https://pynjjeobqzxbrvmqofcw.supabase.co";
  window.AIO_SITE.supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmpqZW9icXp4YnJ2bXFvZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NDA5MDYsImV4cCI6MjA4MTMxNjkwNn0.XSBB0DJw27Wrn41nranqFyj8YI0-YjLzX52dkdrgkrg";

  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  // -------------------------
  // i18n
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

  function getLang() { return lang; }

  const dict = {
    pl: {
      nav_home: 'Start',
      nav_new_projects: 'Nowe Projekty',
      updates: 'Nowości',
      marquee_text: 'Wesprzyj AIO‑IPTV — kawa pomaga rozwijać stronę i autorskie wtyczki.',
      marquee_text2: 'Wsparcie (kawa): Revolut i PayPal — dziękuję!',
      marquee_cta: 'Postaw kawę',
      holiday: 'Paweł Pawełek — życzy Zdrowych Wesołych Świąt',
      countdown_label: 'Odliczanie do końca 2025:',
      newyear_greeting: 'Szczęśliwego Nowego Roku 2026 życzy Paweł Pawełek!',
      unit_days: 'dni',
      unit_hours: 'godz',
      unit_minutes: 'min',
      unit_seconds: 'sek',
      generator_hint: '# Zaznacz przynajmniej jedną opcję powyżej...',
      ai_placeholder: 'Zadaj pytanie o Enigma2…',
      ai_send: 'Wyślij',
      ai_hint: 'Podpowiedź: pytaj np. „jak zainstalować softcam?”',
      ai_mode_offline: 'Tryb: OFFLINE',
      ai_mode_online: 'Tryb: ONLINE'
    },
    en: {
      nav_home: 'Home',
      nav_new_projects: 'New Projects',
      updates: 'Updates',
      marquee_text: 'Support AIO‑IPTV — coffee helps build the site.',
      marquee_text2: 'Coffee support: Revolut & PayPal — thank you!',
      marquee_cta: 'Buy coffee',
      holiday: 'Paweł Pawełek — wishes you a joyful holiday season',
      countdown_label: 'Countdown to the end of 2025:',
      newyear_greeting: 'Happy New Year 2026 — from Paweł Pawełek!',
      unit_days: 'days',
      unit_hours: 'h',
      unit_minutes: 'min',
      unit_seconds: 's',
      generator_hint: '# Select at least one option above...',
      ai_placeholder: 'Ask about Enigma2…',
      ai_send: 'Send',
      ai_hint: 'Tip: ask “how to install softcam?”',
      ai_mode_offline: 'Mode: OFFLINE',
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
  }

  // -------------------------
  // Helpers
  // -------------------------
  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function relUrl(path) {
    return new URL(path, document.baseURI).toString();
  }

  async function safeFetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function ensureSupabaseV2() {
    return new Promise((resolve) => {
      if (window.supabase && typeof window.supabase.createClient === 'function') return resolve(true);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  window.copyToClipboard = async function (elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const btn = el.parentElement ? el.parentElement.querySelector('button.copy-btn') : null;
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = prev, 1500);
      } else {
        alert('Skopiowano!');
      }
    } catch (_) {}
  };

  // -------------------------
  // Analytics
  // -------------------------
  async function initAnalytics() {
    try {
      const cfg = await safeFetchJSON(relUrl('data/analytics_config.json'));
      const mid = (cfg && cfg.measurement_id) ? String(cfg.measurement_id).trim() : '';
      if (!mid) return;
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
    } catch (_) {}
  }

  // -------------------------
  // Drawer
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
  // Mobile Top Icons (Twoja oryginalna funkcja - BEZ ZMIAN)
  // -------------------------
  function isMobilePortrait() {
    return (window.innerWidth <= 720) && (window.innerHeight >= window.innerWidth);
  }

  function ensureCoffeeLink(coffeeEl) {
    if (!coffeeEl) return null;
    if (coffeeEl.tagName === 'A' || coffeeEl.tagName === 'BUTTON') return coffeeEl;
    const a = document.createElement('a');
    a.href = '#wsparcie';
    a.className = 'mobile-coffee-link';
    a.setAttribute('aria-label', 'Wsparcie (Postaw kawę)');
    a.style.display = 'inline-flex';
    a.style.alignItems = 'center';
    a.style.justifyContent = 'center';
    a.style.width = '38px';
    a.style.height = '38px';
    a.style.borderRadius = '999px';
    a.style.border = '1px solid rgba(255,255,255,.18)';
    a.style.background = 'rgba(255,255,255,.06)';
    a.style.boxShadow = '0 10px 28px rgba(0,0,0,.35)';
    a.style.backdropFilter = 'blur(10px)';
    a.style.textDecoration = 'none';
    a.style.fontSize = '18px';
    a.style.color = '#fff';
    const parent = coffeeEl.parentNode;
    a.appendChild(coffeeEl);
    if (parent) parent.insertBefore(a, coffeeEl.nextSibling);
    return a;
  }

  function moveMobileTopIcons() {
    if (!isMobilePortrait()) return;

    const menuBtn = qs('#navToggle');
    if (menuBtn) {
      menuBtn.style.color = '#fff';
      menuBtn.style.filter = 'brightness(1.9) saturate(1.2)';
      menuBtn.style.textShadow = '0 0 8px rgba(255,255,255,.18)';
    }

    const bellBtn = qs('#bellBtn') || qs('#newsBellBtn') || qs('#notifBtn');
    if (bellBtn) {
      bellBtn.style.color = '#fff';
      bellBtn.style.filter = 'brightness(1.2) saturate(1.1)';
    }

    const topBar = qs('.top-support-bar') || qs('.topbar') || qs('header') || document.body;
    let coffeeEl =
      qs('.support-ico', topBar) ||
      qs('.coffee', topBar) ||
      qs('.coffee-btn', topBar) ||
      qs('a[aria-label*="kaw" i],a[title*="kaw" i],a[href*="wspar" i],a[href*="coffee" i]', topBar) ||
      null;

    if (coffeeEl && coffeeEl.tagName === 'SPAN') {
      coffeeEl = ensureCoffeeLink(coffeeEl);
    }

    if (!coffeeEl) {
      const fallback = document.createElement('a');
      fallback.href = '#wsparcie';
      fallback.className = 'mobile-coffee-link';
      fallback.setAttribute('aria-label', 'Wsparcie (Postaw kawę)');
      fallback.textContent = '☕';
      fallback.style.display = 'inline-flex';
      fallback.style.alignItems = 'center';
      fallback.style.justifyContent = 'center';
      fallback.style.width = '38px';
      fallback.style.height = '38px';
      fallback.style.borderRadius = '999px';
      fallback.style.border = '1px solid rgba(255,255,255,.18)';
      fallback.style.background = 'rgba(255,255,255,.06)';
      fallback.style.boxShadow = '0 10px 28px rgba(0,0,0,.35)';
      fallback.style.backdropFilter = 'blur(10px)';
      fallback.style.textDecoration = 'none';
      fallback.style.fontSize = '18px';
      fallback.style.color = '#fff';
      coffeeEl = fallback;
    }

    const target =
      qs('.support-copy', topBar) ||
      qs('.top-support-inner', topBar) ||
      qs('.top-support-bar', topBar) ||
      topBar;

    let row = qs('#mobileTopIconRow', topBar);
    if (!row) {
      row = document.createElement('div');
      row.id = 'mobileTopIconRow';
      row.style.display = 'inline-flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.marginRight = '10px';
      row.style.flex = '0 0 auto';
    }

    if (target && row.parentNode !== target) {
      target.insertBefore(row, target.firstChild);
    }

    if (bellBtn && bellBtn.parentNode !== row) row.appendChild(bellBtn);
    if (menuBtn && menuBtn.parentNode !== row) row.appendChild(menuBtn);

    if (coffeeEl) {
      if (!coffeeEl.isConnected) row.appendChild(coffeeEl);
      else if (coffeeEl.parentNode !== row) row.appendChild(coffeeEl);
    }

    const navBar = qs('.nav') || qs('.main-nav') || qs('#mainNav');
    if (navBar) {
      navBar.style.display = 'none';
    }
  }

  function setupMobileTopIcons() {
    moveMobileTopIcons();
    let t = null;
    const rerun = () => {
      if (t) clearTimeout(t);
      t = setTimeout(moveMobileTopIcons, 120);
    };
    window.addEventListener('resize', rerun);
    window.addEventListener('orientationchange', rerun);
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
// Inject nav: Instalacja Image
// -------------------------
function injectImageInstallNav() {
  const href = 'image-installation.html';
  const label = 'Instalacja Image';

  // Top nav
  const navInner =
    qs('.nav .nav-inner') ||
    qs('.nav-inner.nav') ||
    qs('.nav-inner') ||
    qs('.nav');

  if (navInner && !navInner.querySelector(`a[href="${href}"]`)) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;

    // Insert near "Systemy" if present, otherwise before "Kontakt", otherwise append
    const afterSystems = navInner.querySelector('a[href="systems.html"]');
    const beforeContact = navInner.querySelector('a[href="contact.html"]');
    if (afterSystems && afterSystems.nextElementSibling) navInner.insertBefore(a, afterSystems.nextElementSibling);
    else if (beforeContact) navInner.insertBefore(a, beforeContact);
    else navInner.appendChild(a);
  }

  // Drawer
  const drawer = qs('#mobileDrawer');
  if (drawer && !drawer.querySelector(`a[href="${href}"]`)) {
    const da = document.createElement('a');
    da.href = href;
    da.innerHTML = '💾 <span>' + escapeHtml(label) + '</span>';

    const sys = drawer.querySelector('a[href="systems.html"]');
    const contact = drawer.querySelector('a[href="contact.html"]');
    if (sys && sys.nextSibling) drawer.insertBefore(da, sys.nextSibling);
    else if (contact) drawer.insertBefore(da, contact);
    else drawer.appendChild(da);
  }
}


  // -------------------------
  // Notifications bell
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

    load().catch(() => {});
  }

  // -------------------------
  // PayPal obfuscation
  // -------------------------
  function initPayPal() {
    const btns = qsa('[data-paypal]');
    if (!btns || !btns.length) return;
    const fallback = "https://www.paypal.com/send?recipient=pawelzarzycki61@gmail.com&currencyCode=PLN";
    btns.forEach((btn) => {
      try {
        const b64 = btn.getAttribute('data-paypal');
        let href = fallback;
        if (b64) {
          try {
            href = atob(b64);
          } catch (_) {}
        }
        // Normalizacja: upewnij się, że PayPal kieruje na właściwy adres e-mail
        if (!href || href.indexOf("pawelzarzycki61@gmail.com") === -1) {
          href = fallback;
        }
        btn.setAttribute('href', href);
      } catch (_) {}
    });
  }

  // -------------------------
  // Top marquee
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
  // Countdown (end of 2025) + New Year wishes from 01.01.2026
  // -------------------------
  function initYearCountdown() {
    const el = qs('#yearCountdown');
    if (!el) return;

    // Midnight in Poland (CET) on 01.01.2026 = 2025-12-31 23:00:00Z
    const targetTs = Date.parse('2025-12-31T23:00:00Z');
    if (!isFinite(targetTs)) return;

    const pad2 = (n) => String(n).padStart(2, '0');

    const renderNewYear = () => {
      el.classList.add('done');
      el.innerHTML = `
        <span class="yc-icon">🎉</span>
        <span class="yc-msg">${escapeHtml(t('newyear_greeting'))}</span>
      `;
    };

    const tick = () => {
      const now = Date.now();
      const diffMs = targetTs - now;

      if (diffMs <= 0) {
        el.textContent = ''; el.classList.add('done');
        return false;
      }

      el.classList.remove('done');

      const totalSec = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      el.innerHTML = `
        <span class="yc-label">${escapeHtml(t('countdown_label'))}</span>
        <span class="yc-time" aria-label="countdown">
          <span class="yc-part"><span class="yc-num">${days}</span><span class="yc-unit">${escapeHtml(t('unit_days'))}</span></span>
          <span class="yc-sep">•</span>
          <span class="yc-part"><span class="yc-num">${pad2(hours)}</span><span class="yc-unit">${escapeHtml(t('unit_hours'))}</span></span>
          <span class="yc-part"><span class="yc-num">${pad2(minutes)}</span><span class="yc-unit">${escapeHtml(t('unit_minutes'))}</span></span>
          <span class="yc-part"><span class="yc-num">${pad2(seconds)}</span><span class="yc-unit">${escapeHtml(t('unit_seconds'))}</span></span>
        </span>
      `;

      return true;
    };

    // Initial render
    const keepRunning = tick();
    if (!keepRunning) return;

    const timer = setInterval(() => {
      const ok = tick();
      if (!ok) clearInterval(timer);
    }, 1000);
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

  // -------------------------
  // KOMENTARZE W KONTAKCIE (Dodane bezpiecznie)
  // -------------------------
  function initContactComments() {
    const contact = qs('#kontakt');
    if (!contact) return; // Jeśli nie ma sekcji #kontakt, nie robimy nic

    const cfg = window.AIO_SITE || {};
    const url = cfg.supabaseUrl;
    const anon = cfg.supabaseAnonKey;
    if (!url || !anon) return;

    let wrap = qs('#contactComments', contact);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'contactComments';
      // Stylowanie pasujące do ciemnego motywu
      wrap.style.marginTop = '20px';
      wrap.style.padding = '20px';
      wrap.style.background = 'rgba(22, 27, 34, 0.6)';
      wrap.style.borderRadius = '8px';
      wrap.style.border = '1px solid #30363d';
      
      // HTML formularza i listy komentarzy
      wrap.innerHTML = `
        <h3 style="margin:0 0 10px 0; font-size:1.2rem; color:#58a6ff;">💬 Komentarze</h3>
        <p style="margin:0 0 15px 0; opacity:.85; font-size:0.9rem; color:#8b949e;">Dodaj publiczny komentarz lub opinię.</p>
        
        <div class="cc-form" style="display:flex; flex-direction:column; gap:10px;">
          <input id="ccName" type="text" placeholder="Twój nick" style="padding:10px; background:#0d1117; border:1px solid #30363d; border-radius:6px; color:#e6edf3; font-family:inherit;">
          <textarea id="ccMsg" rows="3" placeholder="Treść komentarza..." style="padding:10px; background:#0d1117; border:1px solid #30363d; border-radius:6px; color:#e6edf3; font-family:inherit;"></textarea>
          <button id="ccSend" class="btn" style="background:#238636; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:600; align-self:flex-start;">Dodaj komentarz</button>
        </div>
        
        <div id="ccStatus" style="margin-top:10px; font-size:0.85rem;"></div>
        <div id="ccList" style="margin-top:20px; display:flex; flex-direction:column; gap:15px;"></div>
      `;
      // Dodajemy na sam koniec kontenera #kontakt
      contact.appendChild(wrap);
    }

    const elName = qs('#ccName', wrap);
    const elMsg = qs('#ccMsg', wrap);
    const elSend = qs('#ccSend', wrap);
    const elStatus = qs('#ccStatus', wrap);
    const elList = qs('#ccList', wrap);

    let client = null;

    const render = (items) => {
      elList.innerHTML = '';
      if (!items || !items.length) {
        elList.innerHTML = `<div style="opacity:.6; font-style:italic; padding:10px;">Brak komentarzy. Bądź pierwszy!</div>`;
        return;
      }
      for (const it of items) {
        const name = escapeHtml(String(it.name || 'Anonim'));
        const msg = escapeHtml(String(it.message || ''));
        const d = it.created_at ? new Date(it.created_at) : null;
        const when = d && !isNaN(d.getTime()) ? d.toLocaleString('pl-PL') : '';
        
        const itemDiv = document.createElement('div');
        itemDiv.style.borderBottom = '1px solid #30363d';
        itemDiv.style.padding = '10px';
        itemDiv.style.background = 'rgba(13,17,23,0.4)';
        itemDiv.style.borderRadius = '6px';
        
        itemDiv.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <strong style="color:#58a6ff;">${name}</strong>
            <span style="font-size:0.8rem; color:#8b949e;">${escapeHtml(when)}</span>
          </div>
          <div style="color:#c9d1d9; line-height:1.5; font-size:0.95rem;">${msg.replace(/\n/g, '<br>')}</div>
        `;
        elList.appendChild(itemDiv);
      }
    };

    const setStatus = (t, ok = true) => {
      elStatus.textContent = t || '';
      elStatus.style.color = ok ? '#3fb950' : '#f85149';
    };

    const load = async () => {
      try {
        setStatus('Ładowanie...');
        const { data, error } = await client
          .from('comments')
          .select('*')
          .eq('page', 'kontakt')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        render(Array.isArray(data) ? data : []);
        setStatus('');
      } catch (e) {
        setStatus('Błąd wczytywania komentarzy.', false);
      }
    };

    const send = async () => {
      const name = (elName.value || '').trim() || 'Anonim';
      const message = (elMsg.value || '').trim();
      if (!message) return setStatus('Wpisz treść komentarza.', false);

      elSend.disabled = true;
      try {
        setStatus('Wysyłanie...');
        const payload = { page: 'kontakt', name, message };
        const { error } = await client.from('comments').insert(payload);
        if (error) throw error;

        elMsg.value = '';
        localStorage.setItem('aio_cc_name', name);
        setStatus('Dodano komentarz!', true);
        await load();
      } catch (e) {
        console.error(e);
        setStatus('Błąd wysyłania.', false);
      } finally {
        elSend.disabled = false;
      }
    };

    (async () => {
      const ok = await ensureSupabaseV2();
      if (!ok) return setStatus('Błąd biblioteki bazy danych.', false);
      try {
        client = window.supabase.createClient(url, anon);
        elName.value = localStorage.getItem('aio_cc_name') || '';
        elSend.addEventListener('click', send);
        await load();
      } catch(e) { console.error(e); }
    })();
  }

  // -------------------------
  // PUBLIC COMMENTS (na innych stronach, np. index)
  // -------------------------
  function renderStars(n) {
    const v = Number(n);
    if (!v || v < 1 || v > 5) return '';
    return '★★★★★'.slice(0, v) + '☆☆☆☆☆'.slice(0, 5 - v);
  }

  async function initPublicComments() {
    const listEl = document.getElementById('commentsListPublic');
    const statusEl = document.getElementById('commentsStatus');
    
    if (!listEl) return;

    const ok = await ensureSupabaseV2();
    if (!ok) {
        if (statusEl) statusEl.textContent = 'Błąd biblioteki.';
        return;
    }

    const url = window.AIO_SITE.supabaseUrl;
    const key = window.AIO_SITE.supabaseAnonKey;
    if (!url || !key) return;

    const client = window.supabase.createClient(url, key);
    const page = (location.pathname === '/' || location.pathname.endsWith('index.html')) ? '/' : location.pathname;

    const loadComments = async () => {
        if (statusEl) statusEl.textContent = 'Ładowanie...';
        const { data, error } = await client
            .from('comments')
            .select('*')
            .eq('page', page)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            if (statusEl) statusEl.textContent = 'Błąd.';
            return;
        }

        if (statusEl) statusEl.textContent = '';
        if (!data || data.length === 0) {
            listEl.innerHTML = '<div style="opacity:0.7; padding:10px;">Brak komentarzy. Bądź pierwszy!</div>';
            return;
        }

        listEl.innerHTML = data.map(c => {
            const nick = escapeHtml(c.name || 'Anonim');
            const msg = escapeHtml(c.message || '');
            const date = c.created_at ? new Date(c.created_at).toLocaleString('pl-PL') : '';
            const stars = c.rating ? `<span style="color:#d29922; margin-left:10px;">${renderStars(c.rating)}</span>` : '';
            return `
            <div class="comment-item">
                <div class="comment-header">
                    <span style="font-weight:bold; color:#58a6ff;">${nick}</span>
                    ${stars}
                    <span style="font-size:0.8em; opacity:0.7;">${date}</span>
                </div>
                <div class="comment-text" style="margin-top:5px; line-height:1.4;">${msg}</div>
            </div>`;
        }).join('');
    };

    const btnSend = document.getElementById('commentSubmitBtn');
    if (btnSend) {
        btnSend.addEventListener('click', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('commentNamePublic');
            const msgInput = document.getElementById('commentBodyPublic');
            const rateInput = document.getElementById('commentRatingPublic');

            const name = nameInput.value.trim() || 'Anonim';
            const message = msgInput.value.trim();
            const rating = rateInput.value ? parseInt(rateInput.value) : null;

            if (message.length < 3) {
                alert('Za krótki komentarz.');
                return;
            }

            btnSend.disabled = true;
            btnSend.textContent = '...';

            const payload = { page: page, name: name, message: message };
            if (rating) payload.rating = rating;

            const { error } = await client.from('comments').insert(payload);
            if (error) {
                alert('Błąd: ' + error.message);
            } else {
                msgInput.value = '';
                if(rateInput) rateInput.value = '';
                loadComments();
            }
            btnSend.disabled = false;
            btnSend.textContent = 'Wyślij';
        });
    }
    
    const btnRefresh = document.getElementById('commentRefreshBtn');
    if (btnRefresh) btnRefresh.addEventListener('click', loadComments);
    loadComments();
  }

  // -------------------------
  
  // -------------------------
  // Topbar promos (AIO Panel / IPTV Dream)
  // -------------------------
  function initTopPromos() {
    const bar = document.querySelector('.topbar-inner');
    if (!bar) return;

    const pills = bar.querySelectorAll('a.pill');
    const firstPill = bar.querySelector('a.pill-accent') || (pills.length ? pills[0] : null);

    // Emphasize existing pill
    if (firstPill) firstPill.classList.add('pill-prominent');

    // Avoid duplicates
    if (bar.querySelector('a.pill-iptvdream')) return;

    const lang = (typeof getLang === 'function') ? getLang() : 'pl';
    const label = (lang === 'en') ? 'Update: IPTV Dream v6.2' : 'Aktualizacja: IPTV Dream v6.2';
    const cta = (lang === 'en') ? 'Download now' : 'Pobierz teraz';

    const a = document.createElement('a');
    a.className = 'pill pill-accent pill-prominent pill-iptvdream';
    a.setAttribute('href', 'pliki/enigma2-plugin-extensions-iptvdream_6.2_all.ipk');
    a.setAttribute('download', '');
    a.innerHTML = `<span>${label}</span> <strong>${cta}</strong>`;

    if (firstPill && firstPill.nextSibling) {
      firstPill.insertAdjacentElement('afterend', a);
    } else {
      // Put after brand link if no pill exists
      const brand = bar.querySelector('.brand');
      if (brand) brand.insertAdjacentElement('afterend', a);
      else bar.appendChild(a);
    }
  }

// START
  // -------------------------
  document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    initAnalytics();
    initDrawer();
    setupMobileTopIcons();
    injectImageInstallNav();
    setActiveNav();
    initTopPromos();
    initUpdates();
    initPayPal();
    initMarquee();
    initYearCountdown();
initAIChatDrawer();
    initOneLinerGenerator();
    
    // KOMENTARZE
    initContactComments();
    initPublicComments();
  });
})();


/* ===== Quick Access injector (spójne kafelki na podstronach) ===== */
(function(){
  'use strict';

  function el(tag, attrs, children){
    var e=document.createElement(tag);
    if(attrs){
      Object.keys(attrs).forEach(function(k){
        if(k === 'class') e.className = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    (children||[]).forEach(function(c){
      if(typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if(c) e.appendChild(c);
    });
    return e;
  }

  function initQuickAccess(){
    try{
      var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
      if(page === 'plugins.html') return; // plugins ma własne zakładki

      var main = document.querySelector('main.container');
      if(!main) return;

      if(main.querySelector('.quick-access')) return;

      var section = el('section', { class:'card quick-access', 'aria-label':'Szybki dostęp' }, []);
      var head = el('div', { class:'qa-head' }, [
        el('h2', null, ['Szybki dostęp']),
        el('div', { class:'muted small' }, ['Najczęściej używane narzędzia i wtyczki w jednym miejscu.'])
      ]);
      var grid = el('div', { class:'qa-grid' }, []);

      var items = [
        { href:'plugins.html#aio-panel', title:'AIO Panel', sub:'Panel narzędzi v6.x' },
        { href:'plugins.html#nagrania-on-demand', title:'Nagrania On Demand', sub:'Porządek w nagraniach' },
        { href:'plugins.html#opencamview', title:'OpenCamView', sub:'Podgląd kamer RTSP' },
        { href:'plugins.html#iptv-dream', title:'IPTV Dream', sub:'IPTV + eksport do bukietów' },
        { href:'one-liner.html', title:'Generator One‑Liner', sub:'Komendy i instalatory' },
        { href:'tuner-compare.html', title:'Porównywarka tunerów', sub:'Dobór sprzętu' },
        { href:'config-builder.html', title:'Kreator konfiguracji', sub:'Ustawienia i checklisty' },
        { href:'guides.html', title:'Poradniki', sub:'Instrukcje i tipy' }
      ];

      items.forEach(function(x){
        var a = el('a', { class:'qa', href:x.href }, [
          el('div', { class:'qa-title' }, [x.title]),
          el('div', { class:'qa-sub' }, [x.sub])
        ]);
        grid.appendChild(a);
      });

      section.appendChild(head);
      section.appendChild(grid);

      // Wstaw na początek main (nie przed hero, bo hero jest wewnątrz main)
      main.insertBefore(section, main.firstChild);
    }catch(e){
      // silent
    }
  }

  document.addEventListener('DOMContentLoaded', initQuickAccess);
})();
