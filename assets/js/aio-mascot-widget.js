(function(){
  'use strict';

  if (window.__aioMascotWidgetLoaded) return;
  window.__aioMascotWidgetLoaded = true;

  const storageKey = 'aio_mascot_widget_hidden_v1';
  const collapsedKey = 'aio_mascot_widget_collapsed_v1';

  const config = {
    image: 'assets/mascot/aio-mascot-20261011.png',
    title: 'AIO AI GPT',
    messages: [
      'Cześć 👋 Czego szukasz? Mogę pomóc Ci szybciej znaleźć to, czego potrzebujesz na stronie.',
      'Szukasz wtyczki, poradnika albo list kanałów? Kliknij poniżej, a pokieruję Cię dalej.',
      'Masz problem z tunerem? Otwórz AI Chat lub Asystenta AIO i opisz, co nie działa.',
      'Jeśli chcesz, mogę skierować Cię od razu do pobierania, wsparcia albo społeczności AIO.'
    ],
    actions: [
      { label: 'AI Chat', href: 'assistant.html', primary: true },
      { label: 'Pobieranie', href: 'downloads.html' },
      { label: 'Poradniki', href: 'guides.html' },
      { label: 'Społeczność', href: 'community.html' }
    ],
    footer: 'Kliknij robota, aby zwinąć lub rozwinąć pomoc.',
    rotateEveryMs: 6500,
    autoShowDelayMs: 900,
    hideOnPages: ['community-admin.html']
  };

  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (config.hideOnPages.includes(path)) return;

  try {
    if (localStorage.getItem(storageKey) === '1') return;
  } catch (e) {}

  function el(tag, className, text){
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function create(){
    const root = el('div', 'aio-mascot-widget is-collapsed');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('role', 'complementary');

    const bubble = el('div', 'aio-mascot-bubble');
    const headline = el('div', 'aio-mascot-headline');
    const title = el('div', 'aio-mascot-title', config.title);
    const close = el('button', 'aio-mascot-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Zamknij podpowiedź');
    close.innerHTML = '&times;';
    headline.append(title, close);

    const text = el('div', 'aio-mascot-text', config.messages[0]);
    const actions = el('div', 'aio-mascot-actions');
    config.actions.forEach(function(item){
      const a = el('a', 'aio-mascot-btn' + (item.primary ? ' is-primary' : ''), item.label);
      a.href = item.href;
      a.setAttribute('data-action', item.label);
      actions.appendChild(a);
    });
    const sub = el('div', 'aio-mascot-sub', config.footer);
    bubble.append(headline, text, actions, sub);

    const avatarWrap = el('div', 'aio-mascot-avatar-wrap');
    avatarWrap.innerHTML = '<div class="aio-mascot-pulse"></div><div class="aio-mascot-orbit"></div>';
    const avatar = el('button', 'aio-mascot-avatar');
    avatar.type = 'button';
    avatar.setAttribute('aria-label', 'AIO AI GPT - pokaż pomoc');
    const img = document.createElement('img');
    img.src = config.image;
    img.alt = 'AIO AI GPT';
    img.loading = 'eager';
    avatar.appendChild(img);
    const toggle = el('button', 'aio-mascot-toggle', '?');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Rozwiń pomoc AIO');
    avatarWrap.append(avatar, toggle);

    root.append(bubble, avatarWrap);
    document.body.appendChild(root);

    let idx = 0;
    let timer = null;

    function updateMessage(){
      idx = (idx + 1) % config.messages.length;
      text.textContent = config.messages[idx];
    }

    function start(){
      stop();
      timer = window.setInterval(updateMessage, config.rotateEveryMs);
    }
    function stop(){
      if (timer) window.clearInterval(timer);
      timer = null;
    }

    function setCollapsed(value){
      root.classList.toggle('is-collapsed', value);
      try { localStorage.setItem(collapsedKey, value ? '1' : '0'); } catch (e) {}
      if (value) stop(); else start();
    }

    function hideAll(){
      root.classList.add('is-hidden');
      stop();
      try { localStorage.setItem(storageKey, '1'); } catch (e) {}
    }

    close.addEventListener('click', hideAll);
    avatar.addEventListener('click', function(){
      setCollapsed(!root.classList.contains('is-collapsed'));
    });
    toggle.addEventListener('click', function(){
      setCollapsed(!root.classList.contains('is-collapsed'));
    });

    try {
      if (localStorage.getItem(collapsedKey) === '0') {
        root.classList.remove('is-collapsed');
        start();
      } else {
        window.setTimeout(function(){ setCollapsed(false); }, config.autoShowDelayMs);
      }
    } catch (e) {
      window.setTimeout(function(){ setCollapsed(false); }, config.autoShowDelayMs);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', create, { once: true });
  } else {
    create();
  }
})();
