/* Społeczność AIO — promo czatu V1 */
(function(){
  if(window.__AIO_CHAT_PROMO__) return;
  window.__AIO_CHAT_PROMO__ = true;

  function onReady(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }

  function textOf(el){ return (el?.textContent || '').replace(/\s+/g,' ').trim(); }
  function q(sel, root){ return (root || document).querySelector(sel); }
  function qa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }
  function esc(s){ return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function ensureStyle(){
    if(document.getElementById('aio-chat-promo-style')) return;
    const style = document.createElement('style');
    style.id = 'aio-chat-promo-style';
    style.textContent = `
      .aio-chat-promo-box{margin:16px 0 22px;padding:18px 20px;border-radius:20px;border:1px solid rgba(115,223,246,.25);background:linear-gradient(135deg,rgba(8,31,44,.96),rgba(5,18,28,.98));box-shadow:0 18px 40px rgba(0,0,0,.22);color:#e8f8ff;position:relative;overflow:hidden}
      .aio-chat-promo-box::after{content:'';position:absolute;inset:auto -40px -40px auto;width:180px;height:180px;background:radial-gradient(circle,rgba(92,211,255,.16),transparent 70%);pointer-events:none}
      .aio-chat-promo-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:5px 10px;border-radius:999px;background:rgba(115,223,246,.12);border:1px solid rgba(115,223,246,.28);font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9defff;margin-bottom:10px}
      .aio-chat-promo-title{margin:0 0 8px;font-size:clamp(1.3rem,2vw,2rem);line-height:1.1;color:#fff;font-weight:800}
      .aio-chat-promo-text{margin:0;color:#cfe8f2;max-width:900px;line-height:1.6}
      .aio-chat-promo-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
      .aio-chat-promo-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 16px;border-radius:12px;text-decoration:none;font-weight:800;line-height:1.1;transition:transform .16s ease,opacity .16s ease,box-shadow .16s ease}
      .aio-chat-promo-btn:hover{transform:translateY(-1px);opacity:.98}
      .aio-chat-promo-btn-primary{background:linear-gradient(135deg,#7adfff,#98ecff);color:#082434;box-shadow:0 12px 24px rgba(78,193,245,.18)}
      .aio-chat-promo-btn-secondary{background:rgba(115,223,246,.08);color:#dff8ff;border:1px solid rgba(115,223,246,.28)}
      .aio-chat-promo-note{margin-top:12px;font-size:.95rem;color:#9fc5d5}
      .aio-chat-promo-badge{display:inline-flex;align-items:center;margin-left:8px;padding:2px 8px;border-radius:999px;background:#f0bd31;color:#082434;font-weight:900;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle}
      .aio-chat-inline-tip{margin-top:12px;padding:12px 14px;border-radius:14px;background:rgba(115,223,246,.08);border:1px solid rgba(115,223,246,.22);color:#d7f2fb;line-height:1.55}
      .aio-chat-inline-tip strong{color:#fff}
      .aio-chat-menu-link{position:relative}
      .aio-chat-menu-link .aio-chat-promo-badge{margin-left:6px;padding:1px 6px;font-size:.64rem}
      @media (max-width: 768px){
        .aio-chat-promo-box{padding:16px}
        .aio-chat-promo-actions{flex-direction:column}
        .aio-chat-promo-btn{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function createPromoBox(type){
    const box = document.createElement('section');
    box.className = 'aio-chat-promo-box';
    if(type === 'community'){
      box.innerHTML = `
        <div class="aio-chat-promo-eyebrow">💬 Nowość w Społeczności AIO</div>
        <h2 class="aio-chat-promo-title">Dołącz do Czat Społeczności AIO</h2>
        <p class="aio-chat-promo-text">Po zalogowaniu możesz szybko wymieniać się pomysłami, opiniami, wnioskami i doświadczeniami związanymi z Enigma2 oraz projektami AIO. Zachęcam do korzystania z czatu, ale proszę o zachowanie kultury wypowiedzi i przestrzeganie regulaminu.</p>
        <div class="aio-chat-promo-actions">
          <a class="aio-chat-promo-btn aio-chat-promo-btn-primary" href="/community-chat">Przejdź do czatu</a>
          <a class="aio-chat-promo-btn aio-chat-promo-btn-secondary" href="/community-rules">Zasady społeczności</a>
        </div>
        <div class="aio-chat-promo-note">Nieprzestrzeganie regulaminu może skutkować usunięciem użytkownika ze strony.</div>
      `;
    } else {
      box.innerHTML = `
        <div class="aio-chat-promo-eyebrow">💬 Nowa funkcja na stronie</div>
        <h2 class="aio-chat-promo-title">Czat Społeczności AIO już dostępny</h2>
        <p class="aio-chat-promo-text">Uruchomiony został czat dla zalogowanych użytkowników. To miejsce do szybkiej wymiany pytań, pomysłów, opinii i doświadczeń związanych z Enigma2 oraz projektami AIO.</p>
        <div class="aio-chat-promo-actions">
          <a class="aio-chat-promo-btn aio-chat-promo-btn-primary" href="/community-chat">Otwórz czat</a>
          <a class="aio-chat-promo-btn aio-chat-promo-btn-secondary" href="/community">Przejdź do Społeczności</a>
        </div>
        <div class="aio-chat-promo-note">Dostęp po zalogowaniu. Zachęcam do aktywności i kulturalnej wymiany zdań.</div>
      `;
    }
    return box;
  }

  function ensureMenuLink(){
    const candidates = qa('nav, .nav, .menu, .topnav, .main-nav, .navbar, .header-nav').filter(el => {
      const t = textOf(el).toLowerCase();
      return t.includes('społeczność') && (t.includes('pobieranie') || t.includes('aktualności') || t.includes('wsparcie'));
    });
    candidates.forEach(nav => {
      const hasChat = qa('a,button', nav).some(el => /czat/i.test(textOf(el)));
      if(hasChat) return;
      const base = qa('a,button', nav).find(el => /społeczność|wsparcie|aktualności/i.test(textOf(el)));
      if(!base) return;
      let node;
      if(base.tagName.toLowerCase() === 'a'){
        node = base.cloneNode(true);
        node.href = '/community-chat';
      } else {
        node = document.createElement('a');
        node.className = base.className || '';
        node.href = '/community-chat';
      }
      node.classList.add('aio-chat-menu-link');
      node.innerHTML = '💬 Czat AIO <span class="aio-chat-promo-badge">Nowość</span>';
      base.insertAdjacentElement('afterend', node);
    });
  }

  function highlightExistingChatButton(){
    qa('a,button').forEach(btn => {
      if(!/czat społeczności/i.test(textOf(btn))) return;
      if(btn.querySelector('.aio-chat-promo-badge')) return;
      const badge = document.createElement('span');
      badge.className = 'aio-chat-promo-badge';
      badge.textContent = 'Nowość';
      btn.appendChild(badge);
      if(btn.tagName.toLowerCase() === 'a') btn.href = '/community-chat';
    });
  }

  function addCommunityHighlight(){
    if(document.querySelector('[data-aio-chat-community-highlight]')) return;

    const heading = qa('h1,h2').find(el => /społeczność aio/i.test(textOf(el)));
    const anchorSection = heading ? (heading.closest('section, article, .card, .hero, .panel, .box, .container') || heading.parentElement) : null;
    const afterNode = anchorSection || q('main') || q('.page-content') || document.body;
    const promo = createPromoBox('community');
    promo.setAttribute('data-aio-chat-community-highlight','1');

    if(afterNode === document.body) document.body.insertAdjacentElement('afterbegin', promo);
    else afterNode.insertAdjacentElement('afterend', promo);

    const chatBtn = qa('a,button').find(el => /czat społeczności/i.test(textOf(el)));
    if(chatBtn && !chatBtn.parentElement.querySelector('.aio-chat-inline-tip')){
      const tip = document.createElement('div');
      tip.className = 'aio-chat-inline-tip';
      tip.innerHTML = '<strong>Czat Społeczności AIO</strong> jest dostępny po zalogowaniu. To szybkie miejsce do rozmów, zadawania pytań i wymiany opinii. Pamiętaj o kulturze wypowiedzi i regulaminie.';
      chatBtn.parentElement.insertAdjacentElement('afterend', tip);
    }
  }

  function addHomeHighlight(){
    if(document.querySelector('[data-aio-chat-home-highlight]')) return;
    const main = q('main') || q('.page-content') || q('.content') || document.body;
    const promo = createPromoBox('home');
    promo.setAttribute('data-aio-chat-home-highlight','1');

    const firstLarge = qa('section, article, .card, .box, .panel', main).find(el => {
      const t = textOf(el).toLowerCase();
      return t.includes('aktual') || t.includes('społeczność') || t.includes('enigma2');
    });

    if(firstLarge) firstLarge.insertAdjacentElement('beforebegin', promo);
    else main.insertAdjacentElement('afterbegin', promo);
  }

  onReady(function(){
    ensureStyle();
    ensureMenuLink();
    highlightExistingChatButton();

    const path = location.pathname.toLowerCase();
    if(path === '/' || path.endsWith('/index.html') || path === '/start'){
      addHomeHighlight();
    }
    if(path.includes('/community') && !path.includes('/community-chat')){
      addCommunityHighlight();
    }
  });
})();
