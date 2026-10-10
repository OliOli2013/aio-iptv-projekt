/* AIO-IPTV.pl — global sharing system, 2026-10-10 */
(function(){
  'use strict';

  if (window.__AIO_SHARE_SYSTEM__) return;
  window.__AIO_SHARE_SYSTEM__ = true;

  const SITE_NAME = 'AIO-IPTV.pl';

  function cleanText(value){
    return String(value || '').replace(/\s+/g,' ').trim();
  }

  function isPostPage(){
    return /(?:^|\/)post(?:\.html)?$/i.test(location.pathname);
  }

  function currentUrl(){
    try{
      if(isPostPage()){
        const u = new URL(location.href);
        u.hash = '';
        const id = u.searchParams.get('id');
        u.search = id ? ('?id=' + encodeURIComponent(id)) : '';
        return u.href;
      }

      const canonical = document.querySelector('link[rel="canonical"]');
      if(canonical && canonical.href) return canonical.href;

      const u = new URL(location.href);
      u.hash = '';
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid'].forEach(k=>u.searchParams.delete(k));
      return u.href;
    }catch(_){
      return location.href;
    }
  }

  function currentTitle(){
    const og = document.querySelector('meta[property="og:title"]');
    const h1 = document.querySelector('main h1, .standalone-main h1, h1');
    const value = cleanText(og?.content || h1?.textContent || document.title || SITE_NAME);
    return value.replace(/\s*[—|-]\s*AIO-IPTV\.pl\s*$/i,'') || SITE_NAME;
  }

  function payloadForPage(){
    const title = currentTitle();
    const text = title === SITE_NAME
      ? 'Sprawdź AIO-IPTV.pl — Enigma2, IPTV, wtyczki, poradniki i pomoc.'
      : `${title} — ${SITE_NAME}`;
    return {title, text, url:currentUrl()};
  }

  function postPayload(card){
    const id = card?.dataset?.postId || new URL(location.href).searchParams.get('id') || '';
    const h = card?.querySelector('h1,h2');
    const title = cleanText(h?.textContent || currentTitle());
    const url = id ? new URL(`post.html?id=${encodeURIComponent(id)}`, location.href).href : currentUrl();
    return {
      title,
      text:`${title} — wpis w Społeczności ${SITE_NAME}`,
      url
    };
  }

  function itemPayload(el){
    const title = cleanText(el.dataset.aioTitle || el.querySelector('h2,h3')?.textContent || currentTitle());
    let url = el.dataset.aioUrl || currentUrl();
    try{ url = new URL(url, location.href).href; }catch(_){}
    return {title, text:`${title} — ${SITE_NAME}`, url};
  }

  function copyFallback(value){
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly','');
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok=false;
    try{ok=document.execCommand('copy');}catch(_){}
    ta.remove();
    return ok;
  }

  async function copyLink(url){
    let ok=false;
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(url);
        ok=true;
      }
    }catch(_){}
    if(!ok) ok=copyFallback(url);
    toast(ok ? 'Link skopiowany.' : 'Nie udało się skopiować linku.', ok ? 'success' : 'error');
  }

  function toast(message,type='info'){
    let stack=document.querySelector('.aio-share-toast-stack');
    if(!stack){
      stack=document.createElement('div');
      stack.className='aio-share-toast-stack';
      document.body.appendChild(stack);
    }
    const el=document.createElement('div');
    el.className='aio-share-toast '+type;
    el.textContent=message;
    stack.appendChild(el);
    setTimeout(()=>el.remove(),3200);
  }

  function popup(url){
    window.open(url,'_blank','noopener,noreferrer,width=720,height=640');
  }

  function shareProvider(provider,payload){
    const url=encodeURIComponent(payload.url);
    const title=encodeURIComponent(payload.title);
    const text=encodeURIComponent(payload.text || payload.title);

    if(provider==='copy') return copyLink(payload.url);
    if(provider==='facebook') return popup(`https://www.facebook.com/sharer/sharer.php?u=${url}`);
    if(provider==='whatsapp') return popup(`https://wa.me/?text=${text}%20${url}`);
    if(provider==='telegram') return popup(`https://t.me/share/url?url=${url}&text=${text}`);
    if(provider==='email') location.href=`mailto:?subject=${title}&body=${text}%0A%0A${url}`;
  }

  function ensureModal(){
    let modal=document.querySelector('[data-aio-share-modal]');
    if(modal) return modal;

    modal=document.createElement('div');
    modal.className='aio-share-modal';
    modal.setAttribute('data-aio-share-modal','');
    modal.hidden=true;
    modal.innerHTML=`
      <div class="aio-share-backdrop" data-aio-share-close></div>
      <section class="aio-share-sheet" role="dialog" aria-modal="true" aria-labelledby="aio-share-title">
        <button class="aio-share-close" type="button" data-aio-share-close aria-label="Zamknij">×</button>
        <p class="aio-share-kicker">PODAJ DALEJ</p>
        <h2 id="aio-share-title">Udostępnij</h2>
        <p class="aio-share-summary" data-aio-share-summary></p>
        <div class="aio-share-grid">
          <button type="button" data-aio-share-provider="facebook"><span>f</span><strong>Facebook</strong></button>
          <button type="button" data-aio-share-provider="whatsapp"><span>WA</span><strong>WhatsApp</strong></button>
          <button type="button" data-aio-share-provider="telegram"><span>✈</span><strong>Telegram</strong></button>
          <button type="button" data-aio-share-provider="email"><span>✉</span><strong>E-mail</strong></button>
        </div>
        <div class="aio-share-linkrow">
          <input type="text" readonly data-aio-share-url aria-label="Link do udostępnienia">
          <button type="button" class="aio-share-copy" data-aio-share-provider="copy">Kopiuj link</button>
        </div>
        <small>Udostępniasz tylko link i tytuł. AIO-IPTV.pl nie wysyła danych do serwisów społecznościowych, dopóki nie wybierzesz konkretnej opcji.</small>
      </section>`;
    document.body.appendChild(modal);

    modal.addEventListener('click',e=>{
      if(e.target.closest('[data-aio-share-close]')){
        closeModal();
        return;
      }
      const provider=e.target.closest('[data-aio-share-provider]');
      if(provider){
        const payload=modal.__aioPayload || payloadForPage();
        shareProvider(provider.dataset.aioShareProvider,payload);
        if(provider.dataset.aioShareProvider!=='copy') closeModal();
      }
    });

    return modal;
  }

  function openModal(payload){
    const modal=ensureModal();
    modal.__aioPayload=payload;
    modal.querySelector('[data-aio-share-summary]').textContent=payload.title;
    modal.querySelector('[data-aio-share-url]').value=payload.url;
    modal.hidden=false;
    document.documentElement.classList.add('aio-share-open');
    setTimeout(()=>modal.querySelector('.aio-share-close')?.focus(),0);
  }

  function closeModal(){
    const modal=document.querySelector('[data-aio-share-modal]');
    if(modal) modal.hidden=true;
    document.documentElement.classList.remove('aio-share-open');
  }

  async function share(payload){
    if(navigator.share){
      try{
        await navigator.share({title:payload.title,text:payload.text,url:payload.url});
        return;
      }catch(err){
        if(err && err.name==='AbortError') return;
      }
    }
    openModal(payload);
  }

  function addFab(){
    if(document.querySelector('[data-aio-share-fab]')) return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='aio-share-fab';
    btn.setAttribute('data-aio-share-fab','');
    btn.setAttribute('aria-label','Udostępnij tę stronę');
    btn.innerHTML='<span aria-hidden="true">↗</span><strong>Udostępnij</strong>';
    btn.addEventListener('click',()=>share(payloadForPage()));
    document.body.appendChild(btn);
  }

  function addPrompt(){
    if(document.querySelector('[data-aio-share-prompt]')) return;
    const footer=document.querySelector('.site-footer, footer.site-footer');
    const main=document.querySelector('main');
    if(!footer || !main) return;

    const isHome=/\/(?:index\.html)?$/i.test(location.pathname);
    const isPost=isPostPage();
    const title=isPost ? 'Ten wpis może komuś pomóc.' : (isHome ? 'Poleć AIO-IPTV.pl innym.' : 'Ta strona może komuś pomóc.');
    const desc=isPost
      ? 'Udostępnij wpis znajomemu lub na grupie — może rozwiązać czyjś problem z Enigma2.'
      : 'Jedno udostępnienie ułatwia innym znalezienie poradników, projektów i pomocy dla Enigma2.';

    const box=document.createElement('section');
    box.className='aio-share-prompt';
    box.setAttribute('data-aio-share-prompt','');
    box.innerHTML=`
      <div class="aio-share-prompt-icon" aria-hidden="true">↗</div>
      <div><strong>${title}</strong><span>${desc}</span></div>
      <button type="button" data-aio-share-prompt-button>Udostępnij</button>`;
    footer.parentNode.insertBefore(box,footer);
    box.querySelector('[data-aio-share-prompt-button]').addEventListener('click',()=>share(payloadForPage()));
  }

  function addPostButtons(root=document){
    root.querySelectorAll('.community-post-card').forEach(card=>{
      const footer=card.querySelector('.community-post-footer');
      if(!footer || footer.querySelector('[data-aio-share-post]')) return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='community-action aio-share-inline';
      btn.setAttribute('data-aio-share-post','');
      btn.innerHTML='<span aria-hidden="true">↗</span> Udostępnij';
      btn.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        share(postPayload(card));
      });
      footer.appendChild(btn);
    });
  }

  function addItemButtons(root=document){
    root.querySelectorAll('[data-aio-url][data-aio-title]').forEach(card=>{
      const actions=card.querySelector('.download-actions');
      if(!actions || actions.querySelector('[data-aio-share-item]')) return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='button aio-share-item';
      btn.setAttribute('data-aio-share-item','');
      btn.textContent='Udostępnij';
      btn.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        share(itemPayload(card));
      });
      actions.appendChild(btn);
    });
  }

  function scan(){
    addPostButtons(document);
    addItemButtons(document);
  }

  function init(){
    if(document.body?.dataset?.aioShare==='off') return;
    addFab();
    addPrompt();
    scan();

    const observer=new MutationObserver(mutations=>{
      let needed=false;
      for(const m of mutations){
        if(m.addedNodes && m.addedNodes.length){needed=true;break;}
      }
      if(needed) scan();
    });
    observer.observe(document.body,{childList:true,subtree:true});

    document.addEventListener('keydown',e=>{
      if(e.key==='Escape') closeModal();
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
