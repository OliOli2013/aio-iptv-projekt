/* AIO-IPTV.pl — Content Protection
 * 2026-10-09
 * Utrudnia kopiowanie i dodaje watermark.
 * Uwaga: żadna strona WWW nie może zagwarantować pełnej blokady screenshotów.
 */
(function(){
  'use strict';
  if (window.__AIO_CONTENT_PROTECTION__) return;
  window.__AIO_CONTENT_PROTECTION__ = true;

  const CONFIG = {
    protectSelector: ['main','.community-post-text','.community-comment-body','.community-feed','.community-post-card','.module','article'].join(','),
    allowSelector: ['input','textarea','select','option','pre','code','kbd','samp','[contenteditable="true"]','[data-copy]','.command','.aio-allow-copy'].join(','),
    blockContextMenu: true,
    blockCopy: true,
    blockCut: true,
    blockDragImages: true,
    guardPrintScreen: true,
    watermark: true
  };

  let toastTimer = null;
  let guardTimer = null;

  function closestProtected(target){
    if (!target || !target.closest) return null;
    if (target.closest(CONFIG.allowSelector)) return null;
    return target.closest('.aio-protected-content');
  }

  function showToast(message){
    let el = document.getElementById('aio-protection-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aio-protection-toast';
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>el.classList.remove('is-visible'),2600);
  }

  function protectMainContent(){
    document.querySelectorAll(CONFIG.protectSelector).forEach(el=>{
      if (el) el.classList.add('aio-protected-content');
    });
  }

  function shortId(value){
    const s = String(value || '').trim();
    if (!s) return '';
    return s.length <= 10 ? s : s.slice(0,8);
  }

  function currentIdentity(){
    const C = window.AIOCommunity;
    const p = C && C.profile ? C.profile : null;
    const u = C && C.user ? C.user : null;
    if (p || u) {
      const name = String((p && p.display_name) || 'Użytkownik').trim();
      const id = shortId((u && u.id) || (p && p.id));
      return id ? `${name} • ${id}` : name;
    }
    return 'AIO-IPTV.pl • Paweł Pawełek';
  }

  function watermarkText(){
    const stamp = new Intl.DateTimeFormat('pl-PL',{
      year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit'
    }).format(new Date());
    return `${currentIdentity()} • ${stamp}`;
  }

  function renderWatermark(){
    if (!CONFIG.watermark || !document.body) return;
    let root = document.getElementById('aio-content-watermark');
    if (!root) {
      root = document.createElement('div');
      root.id = 'aio-content-watermark';
      root.setAttribute('aria-hidden','true');
      const grid = document.createElement('div');
      grid.className = 'aio-watermark-grid';
      for (let i=0;i<28;i++) {
        const item=document.createElement('span');
        item.className='aio-watermark-item';
        grid.appendChild(item);
      }
      root.appendChild(grid);
      document.body.appendChild(root);
    }
    const text=watermarkText();
    root.querySelectorAll('.aio-watermark-item').forEach((el,i)=>{
      el.textContent = i%2===0 ? text : 'AIO-IPTV.pl • treść chroniona';
    });
  }

  function activateScreenGuard(ms){
    if (!CONFIG.guardPrintScreen) return;
    document.documentElement.classList.add('aio-screen-guard');
    clearTimeout(guardTimer);
    guardTimer=setTimeout(()=>document.documentElement.classList.remove('aio-screen-guard'),Math.max(350,Number(ms||900)));
  }

  function bindProtection(){
    document.addEventListener('copy',e=>{
      if (!CONFIG.blockCopy || !closestProtected(e.target)) return;
      e.preventDefault();
      showToast('Kopiowanie chronionej treści jest wyłączone. Komendy techniczne nadal można kopiować.');
    },true);

    document.addEventListener('cut',e=>{
      if (!CONFIG.blockCut || !closestProtected(e.target)) return;
      e.preventDefault();
    },true);

    document.addEventListener('selectstart',e=>{
      if (!closestProtected(e.target)) return;
      e.preventDefault();
    },true);

    document.addEventListener('contextmenu',e=>{
      if (!CONFIG.blockContextMenu || !closestProtected(e.target)) return;
      e.preventDefault();
      showToast('Menu kontekstowe dla chronionej treści jest wyłączone.');
    },true);

    document.addEventListener('dragstart',e=>{
      if (!CONFIG.blockDragImages) return;
      const img=e.target && e.target.closest ? e.target.closest('img') : null;
      if (!img || !img.closest('.aio-protected-content')) return;
      e.preventDefault();
    },true);

    document.addEventListener('keydown',e=>{
      const key=String(e.key||'').toLowerCase();
      const mod=e.ctrlKey||e.metaKey;
      const active=document.activeElement;
      const inAllowed=active && active.closest && active.closest(CONFIG.allowSelector);

      if (!inAllowed && mod && ['c','x','s','p','u'].includes(key)) {
        if (document.querySelector('.aio-protected-content')) {
          e.preventDefault();
          if (key==='p') showToast('Drukowanie chronionej treści jest wyłączone.');
          else if (key==='s') showToast('Zapisywanie chronionej strony jest ograniczone.');
          else if (key==='u') showToast('Podgląd źródła nie jest częścią udostępnionej treści.');
          else showToast('Kopiowanie chronionej treści jest wyłączone.');
        }
      }

      if (CONFIG.guardPrintScreen && (key==='printscreen' || e.code==='PrintScreen')) {
        activateScreenGuard(1200);
        showToast('Wykryto próbę zrzutu. Znak wodny identyfikuje źródło treści.');
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('');
        } catch(_){}
      }
    },true);

    document.addEventListener('visibilitychange',()=>{
      if (document.hidden) document.documentElement.classList.add('aio-screen-guard');
      else setTimeout(()=>document.documentElement.classList.remove('aio-screen-guard'),180);
    });

    window.addEventListener('blur',()=>{
      if (CONFIG.guardPrintScreen) activateScreenGuard(500);
    },{passive:true});

    const observer=new MutationObserver(protectMainContent);
    observer.observe(document.body,{subtree:true,childList:true});
  }

  function init(){
    protectMainContent();
    renderWatermark();
    bindProtection();
    document.addEventListener('aio-community-ready',renderWatermark);
    document.addEventListener('aio-community-auth',renderWatermark);
    setInterval(renderWatermark,60*1000);
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
