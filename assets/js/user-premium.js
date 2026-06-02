
(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  document.addEventListener('DOMContentLoaded', () => {
    const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
    const btn = $('[data-menu-toggle]'); const menu = $('[data-menu]');
    if (btn && menu) btn.addEventListener('click', () => menu.classList.toggle('open'));
    $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const txt = b.getAttribute('data-copy') || '';
      try { await navigator.clipboard.writeText(txt); b.textContent = 'Skopiowano'; setTimeout(()=>b.textContent='Kopiuj',1400); }
      catch(e){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); b.textContent='Skopiowano'; setTimeout(()=>b.textContent='Kopiuj',1400); }
    }));
    loadChannelLists();
    initInlineAi();
  });
  async function loadChannelLists(){
    const out = $('#listsOutput'); const status = $('#listsStatus');
    if(!out) return;
    const url = out.getAttribute('data-manifest-url') || 'https://raw.githubusercontent.com/OliOli2013/PanelAIO-Lists/main/manifest.json';
    try{
      const res = await fetch(url, {cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.items || data.lists || data.files || []);
      if(!items.length) throw new Error('empty');
      out.innerHTML = items.slice(0,60).map((it,idx)=>{
        const title = it.title || it.name || it.filename || ('Lista '+(idx+1));
        const href = it.url || it.download || it.href || '#';
        const desc = it.desc || it.description || 'Pobierz plik listy kanałów.';
        return `<a class="choice-card" href="${escapeAttr(href)}" target="_blank" rel="noopener"><span class="card-icon">📺</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}</p><em>pobieranie</em></a>`;
      }).join('');
      if(status) status.textContent = 'Wybierz listę z poniższych pozycji.';
    } catch(e){
      if(status) status.innerHTML = 'Nie udało się automatycznie pobrać manifestu. Użyj AIO Panel albo sprawdź połączenie z internetem.';
    }
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function escapeAttr(s){return escapeHtml(s).replace(/`/g,'&#96;');}
  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');}
  async function initInlineAi(){
    const form = $('#inlineAiForm'); const input = $('#inlineAiInput'); const box = $('#chatMessages'); const stat = $('#aiChatStatus');
    if(!form || !input || !box) return;
    let kb=[]; let cfg=null;
    try { kb = await (await fetch('data/knowledge.json')).json(); } catch(e) { kb=[]; }
    try { cfg = await (await fetch('data/aichat_config.json')).json(); } catch(e) { cfg=null; }
    form.addEventListener('submit', async ev=>{
      ev.preventDefault(); const q = input.value.trim(); if(!q) return; input.value=''; add('user', q);
      const online = cfg && cfg.mode === 'online' && cfg.supabase && cfg.supabase.url && cfg.supabase.anonKey;
      if(online){
        try{
          const endpoint = cfg.supabase.url.replace(/\/+$/,'') + '/functions/v1/' + (cfg.supabase.function || 'ai-chat');
          const res = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json', apikey:cfg.supabase.anonKey, Authorization:'Bearer '+cfg.supabase.anonKey}, body:JSON.stringify({query:q,message:q,source:'aio-iptv',locale:'pl'})});
          if(!res.ok) throw new Error('HTTP '+res.status); const data = await res.json(); const reply=(data.reply||data.text||data.message||'').trim();
          add('bot', reply || 'Brak odpowiedzi. Spróbuj doprecyzować pytanie.'); return;
        }catch(e){ if(stat) stat.textContent='Tryb online jest chwilowo niedostępny. Pokazuję odpowiedź z bazy lokalnej.'; }
      }
      add('bot', offlineAnswer(q,kb));
    });
    function add(role, text){ const p=document.createElement('p'); p.className=role; p.textContent=text; box.appendChild(p); box.scrollTop=box.scrollHeight; }
    function offlineAnswer(q,kb){
      const words = norm(q).split(/\s+/).filter(w=>w.length>2).slice(0,10);
      const scored = (kb||[]).map(it=>{ const text=norm([it.title,it.summary,(it.tags||[]).join(' '),(it.content||[]).join(' '),(it.commands||[]).join(' ')].join(' ')); let s=0; words.forEach(w=>{if(text.includes(w))s++}); return {it,s};}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,3);
      if(!scored.length) return 'Nie znalazłem dokładnego tematu. Podaj model tunera, system, nazwę wtyczki i krótki opis błędu.';
      return 'Najbliższe tematy: ' + scored.map(x=>x.it.title).join(' • ');
    }
  }
})();
