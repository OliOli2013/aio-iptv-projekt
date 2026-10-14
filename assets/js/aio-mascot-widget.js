/* AIO AI GPT V2 — light, interactive page guide (NO remote calls) */
(function(){
  'use strict';
  if (window.__aioMascotWidgetLoaded) return;
  window.__aioMascotWidgetLoaded = true;

  const SEEN = 'aio_mascot_v2_intro_seen';
  const CHAT_DRAFT = 'aio_mascot_v2_chat_draft';
  const MOBILE_NUDGE_SEEN = 'aio_mascot_v3_mobile_nudge_seen';
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 740px)').matches;
  const qs = (s,root=document) => root.querySelector(s);
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (['community-admin.html','publisher.html','access.html','aio-connect-report.html','ai-chat.html','404.html'].includes(page)) return;
  if (document.body && document.body.dataset.aioMascot === 'off') return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* AIO Mascot Guide V2 (2026-10-14): context depends only on local page path. */
  const pageGuides = {
    'index.html': {
      greeting: 'Cześć! 👋 Pomogę Ci szybko znaleźć właściwy dział AIO.',
      links: [['Systemy','systems.html'], ['Wtyczki','plugins.html'], ['Listy kanałów','channel-lists.html']]
    },
    'systems.html': {
      greeting: 'Wybierasz system Enigma2? Sprawdź dokładny model tunera i instrukcję instalacji.',
      links: [['Pobieranie','downloads.html'], ['Instalacja image','guide-instalacja-image.html'], ['Poradniki','guides.html']],
      advice: ['Ważne przed instalacją', 'Obraz systemu musi być przeznaczony dokładnie dla modelu odbiornika. Smart Tuner pomaga dobrać rozwiązania, ale nie potwierdza zgodności obrazu.', 'Sprawdź model', 'smart-tuner.html']
    },
    'downloads.html': {
      greeting: 'Szukasz pliku? Najpierw sprawdź jego opis, przeznaczenie i wersję.',
      links: [['Systemy','systems.html'], ['Wtyczki','plugins.html'], ['Poradniki','guides.html']],
      advice: ['Wskazówka pobierania', 'Przed instalacją porównaj model odbiornika, wersję systemu i wymagania pliku. W razie wątpliwości zajrzyj do Smart Tunera.', 'Dobierz do tunera', 'smart-tuner.html']
    },
    'plugins.html': {
      greeting: 'Szukasz wtyczki? Sprawdź zgodność z wersją Pythona i swoim systemem.',
      links: [['Pobieranie','downloads.html'], ['Listy kanałów','channel-lists.html'], ['Poradniki','guides.html']]
    },
    'smart-tuner.html': {
      greeting: 'Wybierz model tunera, system i Python. Wynik pokaże, co wymaga potwierdzenia.',
      links: [['Wtyczki','plugins.html'], ['Systemy','systems.html'], ['Listy kanałów','channel-lists.html']]
    },
    'channel-lists.html': {
      greeting: 'Wybierasz listę kanałów? Sprawdź satelity, format bukietów i wykonaj backup.',
      links: [['Systemy','systems.html'], ['Wtyczki','plugins.html'], ['Poradniki','guides.html']]
    },
    'guides.html': {
      greeting: 'Tutaj znajdziesz poradniki Enigma2. Wybierz zadanie lub opisz problem.',
      links: [['Diagnostyka','errors.html'], ['Systemy','systems.html'], ['Pobieranie','downloads.html']]
    },
    'errors.html': {
      greeting: 'Co nie działa w tunerze? Zacznij od diagnostyki i najprostszych kroków.',
      links: [['Diagnostyka','guide-diagnostyka-enigma2.html'], ['Poradniki','guides.html'], ['Wtyczki','plugins.html']]
    },
    'community.html': {
      greeting: 'Potrzebujesz pomocy innych użytkowników? Zobacz wpisy lub zadaj pytanie.',
      links: [['Czat AIO','community-chat.html'], ['Poradniki','guides.html'], ['Pobieranie','downloads.html']]
    },
    'default': {
      greeting: 'Cześć! 👋 Jestem AIO. Wybierz dział lub wpisz pytanie do AI Chat.',
      links: [['Systemy','systems.html'], ['Wtyczki','plugins.html'], ['Poradniki','guides.html']]
    }
  };
  const guide = pageGuides[page] || pageGuides.default;
  const intro = [
    guide.greeting,
    'Użyj skrótów, aby przejść do odpowiedniego działu bez szukania po menu.',
    'Możesz też wpisać pytanie. Przeniosę je do AI Chat bez automatycznego wysyłania.'
  ];
  const shortcutSeen = new Set();
  const shortcuts = [...guide.links,
    ['Smart Tuner', 'smart-tuner.html'],
    ['AI Chat', 'ai-chat.html'],
    ['Społeczność', 'community.html']
  ].filter(([label,href]) => {
    if (shortcutSeen.has(href)) return false;
    shortcutSeen.add(href);
    return true;
  }).slice(0,6);
  const safeStore = {
    get(k){try{return sessionStorage.getItem(k)}catch(_){return null}},
    set(k,v){try{sessionStorage.setItem(k,v)}catch(_){}}
  };

  function start(){
    if (qs('[data-aio-mascot-v2]')) return;
    const root = document.createElement('aside');
    root.className = 'aio-mascot-widget';
    root.setAttribute('data-aio-mascot-v2','');
    root.setAttribute('aria-label','Asystent nawigacji AIO');
    // Markup is constant. User input is never injected as HTML.
    root.innerHTML = `
      <button class="aio-mascot-avatar" type="button" aria-label="AIO: otwórz pomoc" aria-expanded="false" aria-controls="aio-mascot-panel-v2">
        <span class="aio-mascot-aura" aria-hidden="true"></span>
        <img src="assets/mascot/aio-mascot-20261011-v2.webp" alt="" width="112" height="139" decoding="async">
        <span class="aio-mascot-dot" aria-hidden="true"></span>
        <span class="aio-mascot-label" aria-hidden="true">AIO AI GPT</span>
      </button>
      <div class="aio-mascot-panel" id="aio-mascot-panel-v2" aria-hidden="true">
        <div class="aio-mascot-panel-head">
          <div><strong>AIO AI GPT</strong><span>Twój przewodnik po AIO-IPTV.pl</span></div>
          <button class="aio-mascot-x" type="button" aria-label="Zwiń pomoc">×</button>
        </div>
        <p class="aio-mascot-message"><span data-aio-mascot-typed></span><span class="aio-mascot-cursor" aria-hidden="true"></span></p>
        <div class="aio-mascot-advice" data-aio-mascot-advice hidden>
          <strong data-aio-mascot-advice-title></strong>
          <p data-aio-mascot-advice-body></p>
          <a data-aio-mascot-advice-link></a>
        </div>
        <p class="aio-mascot-menu-label">Szybkie przejścia</p>
        <div class="aio-mascot-chips" data-aio-mascot-shortcuts></div>
        <form class="aio-mascot-form">
          <label for="aio-mascot-question">Masz pytanie?</label>
          <textarea id="aio-mascot-question" maxlength="800" rows="2" placeholder="Np. jak dodać EPG do IPTV?"></textarea>
          <button class="aio-mascot-send" type="submit">Przejdź z pytaniem do AI Chat <span aria-hidden="true">→</span></button>
        </form>
        <p class="aio-mascot-foot">Pytanie zostanie tylko wpisane w AI Chat — sam zdecydujesz, czy je wysłać.</p>
      </div>
      <button class="aio-mascot-mobile-nudge" type="button" aria-label="Cześć. Jestem tu, żeby pomóc. Dotknij, aby zacząć.">
        <strong>Cześć! 👋</strong><span>Jestem tu, żeby pomóc. Dotknij, aby zacząć.</span>
      </button>
      <span class="aio-mascot-sr-only" aria-live="polite" data-aio-mascot-live></span>
    `;
    document.body.appendChild(root);

    const avatar = qs('.aio-mascot-avatar',root);
    const panel = qs('.aio-mascot-panel',root);
    const typed = qs('[data-aio-mascot-typed]',root);
    const live = qs('[data-aio-mascot-live]',root);
    const form = qs('.aio-mascot-form',root);
    const question = qs('#aio-mascot-question',root);
    const chips = qs('[data-aio-mascot-shortcuts]',root);
    const close = qs('.aio-mascot-x',root);
    const nudge = qs('.aio-mascot-mobile-nudge',root);

    // V2: make the safety note visible only on pages where a wrong file matters.
    const advice = qs('[data-aio-mascot-advice]',root);
    if (guide.advice && advice) {
      const [title,body,label,href] = guide.advice;
      qs('[data-aio-mascot-advice-title]',advice).textContent = title;
      qs('[data-aio-mascot-advice-body]',advice).textContent = body;
      const link = qs('[data-aio-mascot-advice-link]',advice);
      link.textContent = label + ' →';
      link.href = href; // Static, local links defined in pageGuides above.
      advice.hidden = false;
    }

    for (const [label,href] of shortcuts) {
      const a = document.createElement('a');
      a.href = href;
      a.className = 'aio-mascot-chip';
      a.textContent = label;
      chips.appendChild(a);
    }

    let msgIndex=0, typeTimer=null, cycleTimer=null, closeTimer=null, openingTimer=null, nudgeTimer=null;
    const clear = (id,kind='timeout') => {
      if(id!==null) { if(kind==='interval') clearInterval(id); else clearTimeout(id); }
    };
    function stopTimers(){
      clear(typeTimer,'interval');clear(cycleTimer);clear(closeTimer);clear(openingTimer);
      typeTimer=cycleTimer=closeTimer=openingTimer=null;
    }
    function hideNudge(){
      root.classList.remove('has-nudge');
      if(nudgeTimer!==null){clearTimeout(nudgeTimer);nudgeTimer=null;}
    }
    function showNudge(){
      if(!isMobile || root.classList.contains('is-open')) return;
      root.classList.add('has-nudge');
      hideNudgeTimerOnly();
      nudgeTimer=setTimeout(hideNudge,12000);
    }
    function hideNudgeTimerOnly(){
      if(nudgeTimer!==null){clearTimeout(nudgeTimer);nudgeTimer=null;}
    }
    function typeMessage(message){
      clear(typeTimer,'interval'); typeTimer=null;
      typed.textContent='';live.textContent='';
      if(reduceMotion){typed.textContent=message;live.textContent=message;return;}
      let i=0;
      typeTimer=setInterval(()=>{
        if(!root.classList.contains('is-open')){clear(typeTimer,'interval');typeTimer=null;return;}
        i=Math.min(i+2,message.length);
        typed.textContent=message.slice(0,i);
        if(i>=message.length){clear(typeTimer,'interval');typeTimer=null;live.textContent=message;}
      },39);
    }
    function isEditing(){return document.activeElement===question || question.value.trim().length>0;}
    function scheduleMessage(){
      clear(cycleTimer);
      cycleTimer=setTimeout(()=>{
        if(root.classList.contains('is-open') && !isEditing()){
          msgIndex=(msgIndex+1)%intro.length;
          typeMessage(intro[msgIndex]);
          scheduleMessage();
        }
      },7700);
    }
    function scheduleClose(){
      clear(closeTimer);
      closeTimer=setTimeout(()=>{
        if(root.classList.contains('is-open') && !isEditing() && !root.matches(':hover') && !root.contains(document.activeElement)) closePanel();
      },21000);
    }
    function openPanel(auto=false){
      if(root.classList.contains('is-open')) return;
      hideNudge();
      stopTimers();
      root.classList.add('is-open');
      avatar.setAttribute('aria-expanded','true');
      avatar.setAttribute('aria-label','AIO: zwiń pomoc');
      panel.setAttribute('aria-hidden','false');
      typeMessage(intro[msgIndex]);
      if(!isMobile){scheduleMessage();if(auto)scheduleClose();}
    }
    function closePanel(){
      if(!root.classList.contains('is-open')) return;
      stopTimers();
      root.classList.remove('is-open');
      avatar.setAttribute('aria-expanded','false');
      avatar.setAttribute('aria-label','AIO: otwórz pomoc');
      panel.setAttribute('aria-hidden','true');
      if(panel.contains(document.activeElement)) avatar.focus();
    }
    avatar.addEventListener('click',()=>root.classList.contains('is-open')?closePanel():openPanel());
    close.addEventListener('click',closePanel);
    nudge.addEventListener('click',()=>openPanel());
    document.addEventListener('keydown',e=>{if(e.key==='Escape') closePanel()});

    form.addEventListener('submit',e=>{
      e.preventDefault();
      const draft=question.value.trim();
      if(!draft){question.focus();return;}
      safeStore.set(CHAT_DRAFT,draft);
      location.assign('ai-chat.html');
    });
    question.addEventListener('input',()=>{clear(cycleTimer);clear(closeTimer);});
    question.addEventListener('focus',()=>{clear(cycleTimer);clear(closeTimer);});

    // Desktop: V2 behaviour is intentionally preserved, with the full welcome panel.
    // Mobile: only a small, dismissing teaser; the full panel opens after a tap.
    if(isMobile){
      if(!safeStore.get(MOBILE_NUDGE_SEEN)){
        safeStore.set(MOBILE_NUDGE_SEEN,'1');
        openingTimer=setTimeout(()=>{openingTimer=null;showNudge();},900);
      }
    } else if(page==='index.html' && !safeStore.get(SEEN)){
      safeStore.set(SEEN,'1');
      openingTimer=setTimeout(()=>{openingTimer=null;openPanel(true);},1100);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
