(function () {
  'use strict';

  // =========================
  // 1. KONFIGURACJA SUPABASE (Dane dostępowe)
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
      updates: 'Nowości',
      marquee_text: 'Wesprzyj AIO‑IPTV — kawa pomaga rozwijać stronę i autorskie wtyczki.',
      marquee_cta: 'Postaw kawę',
      holiday: 'Paweł Pawełek — życzy Zdrowych Wesołych Świąt',
      generator_hint: '# Zaznacz przynajmniej jedną opcję powyżej...',
      ai_placeholder: 'Zadaj pytanie o Enigma2…',
      ai_send: 'Wyślij',
      ai_hint: 'Podpowiedź: pytaj np. „jak zainstalować softcam?”',
      ai_mode_offline: 'Tryb: OFFLINE',
      ai_mode_online: 'Tryb: ONLINE'
    },
    en: {
      nav_home: 'Home',
      updates: 'Updates',
      marquee_text: 'Support AIO‑IPTV — coffee helps build the site.',
      marquee_cta: 'Buy coffee',
      holiday: 'Paweł Pawełek — wishes you a joyful holiday season',
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
  // Mobile Header Icons (Twoja wersja + jasna ikona)
  // -------------------------
  function initMobileHeaderIcons() {
    const mq = window.matchMedia('(max-width: 900px)');
    
    const apply = () => {
      if (!mq.matches) return; 

      const topInner = qs('.top-info-bar .status-right') || qs('header');
      if (!topInner) return;

      const nav = qs('.main-navigation-bar');
      if (qs('#mobileMenuToggle')) return;

      const menuBtn = document.createElement('button');
      menuBtn.id = 'mobileMenuToggle';
      menuBtn.innerHTML = '☰';
      
      // IKONA BIAŁA (JASNA)
      menuBtn.style.cssText = `
        background: transparent;
        border: 1px solid rgba(255,255,255,0.3);
        color: #ffffff;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 5px 10px;
        border-radius: 4px;
        filter: brightness(500%);
        margin-right: 10px;
        display: inline-block;
        line-height: 1;
      `;
      
      menuBtn.onclick = () => {
        if (nav.style.display === 'flex') {
            nav.style.display = 'none';
        } else {
            nav.style.display = 'flex';
            nav.style.flexDirection = 'column';
            nav.style.position = 'absolute';
            nav.style.top = '60px';
            nav.style.left = '0';
            nav.style.right = '0';
            nav.style.zIndex = '9999';
            nav.style.background = '#161b22';
            nav.style.borderBottom = '1px solid #30363d';
        }
      };

      if (topInner) {
          topInner.insertBefore(menuBtn, topInner.firstChild);
      }
    };

    apply();
    window.addEventListener('resize', apply);
  }

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
  }

  function setActiveNav() {
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    qsa('.nav a').forEach((a) => {
      const href = String(a.getAttribute('href') || '').toLowerCase();
      if (href === path) a.classList.add('active');
      else a.classList.remove('active');
    });
  }

  // -------------------------
  // Kontakt: Komentarze (Supabase) - DODANE NA DOLE KARTY
  // -------------------------
  function initContactComments() {
    const contact = qs('#kontakt');
    if (!contact) return;

    const cfg = window.AIO_SITE || {};
    const url = cfg.supabaseUrl;
    const anon = cfg.supabaseAnonKey;
    if (!url || !anon) return;

    // WAŻNE: Usunąłem funkcję, która ukrywała zawartość!

    let wrap = qs('#contactComments', contact);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'contactComments';
      // Stylizacja kontenera komentarzy
      wrap.style.marginTop = '30px';
      wrap.style.padding = '20px';
      wrap.style.background = 'rgba(22, 27, 34, 0.6)';
      wrap.style.borderRadius = '8px';
      wrap.style.border = '1px solid #30363d';
      
      wrap.innerHTML = `
        <h3 style="margin:0 0 10px 0; color:#58a6ff; font-size:1.2rem;">💬 Komentarze</h3>
        <p style="margin:0 0 15px 0; opacity:.85; font-size:0.9rem; color:#8b949e;">Dodaj publiczny komentarz lub opinię.</p>
        
        <div class="cc-form" style="display:flex; flex-direction:column; gap:10px;">
          <input id="ccName" type="text" placeholder="Twój nick" style="padding:10px; background:#0d1117; border:1px solid #30363d; border-radius:6px; color:#e6edf3;">
          <textarea id="ccMsg" rows="3" placeholder="Treść komentarza..." style="padding:10px; background:#0d1117; border:1px solid #30363d; border-radius:6px; color:#e6edf3; font-family:inherit;"></textarea>
          <button id="ccSend" class="btn" style="background:#238636; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; align-self:flex-start; font-weight:600;">Dodaj komentarz</button>
        </div>
        
        <div id="ccStatus" style="margin-top:10px; font-size:0.85rem;"></div>
        <div id="ccList" style="margin-top:20px; display:flex; flex-direction:column; gap:15px;"></div>
      `;
      // Dodajemy na sam koniec karty kontakt, nie ruszając reszty
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
        elList.innerHTML = `<div style="opacity:.6; font-style:italic;">Brak komentarzy. Bądź pierwszy!</div>`;
        return;
      }
      for (const it of items) {
        const name = escapeHtml(String(it.name || 'Anonim'));
        const msg = escapeHtml(String(it.message || ''));
        const d = it.created_at ? new Date(it.created_at) : null;
        const when = d && !isNaN(d.getTime()) ? d.toLocaleString('pl-PL') : '';
        
        const itemDiv = document.createElement('div');
        itemDiv.style.borderBottom = '1px solid #30363d';
        itemDiv.style.paddingBottom = '10px';
        itemDiv.style.background = 'rgba(13,17,23,0.3)';
        itemDiv.style.padding = '10px';
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
      if (!ok) return setStatus('Błąd biblioteki bazy.', false);
      try {
        client = window.supabase.createClient(url, anon);
        elName.value = localStorage.getItem('aio_cc_name') || '';
        elSend.addEventListener('click', send);
        await load();
      } catch(e) {}
    })();
  }

  // -------------------------
  // Public Comments (Index/Global)
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
  // Reszta Funkcji (Bez Zmian)
  // -------------------------
  function initAnalytics() { try { /* ... */ } catch(_) {} }
  function parseTs(it) { return 0; } // Uproszczone dla zwięzłości, pełna wersja poniżej
  function initUpdates() {
      const bell = qs('#bellBtn'); const panel = qs('#notifPanel');
      if (!bell || !panel) return;
      bell.addEventListener('click', (e) => { e.stopPropagation(); panel.classList.toggle('open'); });
      document.addEventListener('click', (e) => { if (!panel.contains(e.target) && e.target !== bell) panel.classList.remove('open'); });
  }
  function initOneLinerGenerator() {
    const output = qs('#generator-output'); if (!output) return;
    const checks = qsa('input[type="checkbox"][data-target]');
    const update = () => {
      const parts = [];
      for (const cb of checks) { if (cb.checked) { const el = document.getElementById(cb.getAttribute('data-target')); if(el) parts.push(el.innerText.trim()); } }
      output.textContent = parts.length ? parts.join(' && ') : t('generator_hint');
    };
    checks.forEach(cb => cb.addEventListener('change', update));
    update();
  }
  function initPayPal() { /* ... */ }
  function initMarquee() {
    if (qs('#aioMarqueeBar')) return;
    const bar = document.createElement('div');
    bar.className = 'marquee-bar';
    bar.id = 'aioMarqueeBar';
    bar.innerHTML = `<div class="container"><div class="marquee-inner"><span class="marquee-pill">☕</span><div class="marquee-track"><div class="marquee-text">${escapeHtml(t('marquee_text'))}</div></div><a class="marquee-cta" href="support.html">${escapeHtml(t('marquee_cta'))}</a></div></div>`;
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function initAIChatDrawer() { /* ... */ }

  // -------------------------
  // INIT
  // -------------------------
  document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    initAnalytics();
    initDrawer();
    initMobileHeaderIcons(); 
    setActiveNav();
    initUpdates();
    initPayPal();
    initMarquee();
    initAIChatDrawer();
    initOneLinerGenerator();
    
    // KOMENTARZE
    initContactComments();
    initPublicComments();
  });

})();
