/* Społeczność AIO — Cloudflare admin + pełna edycja wpisów, 2026-10-08 */
(function(){
  'use strict';

  const q=(s,c=document)=>c.querySelector(s);
  const qa=(s,c=document)=>Array.from(c.querySelectorAll(s));
  let tab='pending',rows=[],role='user';

  async function ownerGet(tabName){
    const r=await fetch('/api/owner-admin?tab='+encodeURIComponent(tabName),{credentials:'include',cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'Nieprawidłowa odpowiedź panelu właściciela.'}));
    if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));
    return d;
  }
  async function ownerPost(payload){
    const r=await fetch('/api/owner-admin',{method:'POST',credentials:'include',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json().catch(()=>({ok:false,error:'Nieprawidłowa odpowiedź panelu właściciela.'}));
    if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));
    return d;
  }

  function boot(){
    if(!window.AIOCommunity)return;
    if(AIOCommunity.ready)init();
    else document.addEventListener('aio-community-ready',init,{once:true});
  }

  async function init(){
    const tabs=q('.community-admin-tabs');
    if(tabs&&!q('[data-admin-tab="statistics"]',tabs)){
      const statsButton=document.createElement('button');
      statsButton.className='community-tab';
      statsButton.type='button';
      statsButton.dataset.adminTab='statistics';
      statsButton.hidden=true;
      statsButton.textContent='Statystyki';
      tabs.appendChild(statsButton);
    }
    if(tabs&&!q('[data-admin-tab="access-activity"]',tabs)){
      const accessButton=document.createElement('button');
      accessButton.className='community-tab'; accessButton.type='button'; accessButton.dataset.adminTab='access-activity'; accessButton.hidden=true; accessButton.textContent='Pobierania / AIO Access'; tabs.appendChild(accessButton);
    }
    if(tabs&&!q('[data-admin-tab="password-resets"]',tabs)){
      const b=document.createElement('button');
      b.className='community-tab';
      b.type='button';
      b.dataset.adminTab='password-resets';
      b.innerHTML='Reset hasła <span data-admin-reset-badge></span>';
      tabs.appendChild(b);
    }
    if(tabs){
      [
        ['security','Bezpieczeństwo'],
        ['sessions','Sesje'],
        ['comments','Komentarze'],
        ['chat','Czat']
      ].forEach(([id,label])=>{
        if(q(`[data-admin-tab="${id}"]`,tabs))return;
        const b=document.createElement('button');
        b.className='community-tab';b.type='button';b.dataset.adminTab=id;b.textContent=label;tabs.appendChild(b);
      });
    }
    qa('[data-admin-tab]').forEach(b=>b.onclick=()=>{
      tab=b.dataset.adminTab;
      qa('[data-admin-tab]').forEach(x=>x.classList.toggle('active',x===b));
      load();
    });
    document.addEventListener('click',handle);
    document.addEventListener('aio-community-auth',load);
    ensureEditDialog();
    await load();
  }

  async function load(){
    const root=q('[data-community-admin]');
    if(!root)return;

    if(!AIOCommunity.user||!AIOCommunity.isAdmin()){
      root.innerHTML='<div class="community-empty"><strong>Zaloguj się jako właściciel AIO.</strong><p>Ten panel jest prywatny i nie jest dostępny dla moderatorów ani zwykłych użytkowników.</p><button class="button primary" data-community-login>Zaloguj się</button></div>';
      return;
    }

    root.innerHTML='<div class="community-loading">Ładuję dane…</div>';

    try{
      const ownerTabs=['security','sessions','comments','chat'];
      const d=tab==='access-activity'
        ? await (async()=>{const r=await fetch('/api/access-activity',{credentials:'include',cache:'no-store'});const x=await r.json();if(!r.ok||!x.ok)throw new Error(x.error||'Nie udało się pobrać danych AIO Access.');return {rows:[x],role:'admin',stats:{}};})()
        : ownerTabs.includes(tab) ? await ownerGet(tab)
        : await AIOCommunity.apiGet('admin',{tab});
      rows=d.rows||[];
      role=d.role||'user';
      const resetTab=q('[data-admin-tab="password-resets"]');
      if(resetTab)resetTab.hidden=role!=='admin';
      const statsTab=q('[data-admin-tab="statistics"]');
      if(statsTab)statsTab.hidden=role!=='admin';
      const accessTab=q('[data-admin-tab="access-activity"]');
      if(accessTab)accessTab.hidden=role!=='admin';
      const resetBadge=q('[data-admin-reset-badge]');
      if(resetBadge){
        const n=Number(d.stats?.password_resets||0);
        resetBadge.textContent=n?`(${n})`:'';
      }
      Object.entries(d.stats||{}).forEach(([k,v])=>
        qa(`[data-admin-stat="${k}"]`).forEach(el=>el.textContent=Number(v||0).toLocaleString('pl-PL'))
      );
      render();
    }catch(e){
      root.innerHTML=`<div class="community-error">${AIOCommunity.escape(AIOCommunity.friendlyError(e))}</div>`;
    }
  }

  function render(){
    const root=q('[data-community-admin]');

    if(tab==='pending'||tab==='published'){
      root.innerHTML=rows.length
        ? '<div class="community-admin-list">'+rows.map(p=>{
            const a=p.author||{};
            return `<article class="community-admin-item" data-admin-post="${AIOCommunity.escapeAttr(p.id)}">
              <div class="community-admin-item-head">
                ${AIOCommunity.avatarHtml(a,a.display_name)}
                <div>
                  <strong>${AIOCommunity.escape(p.title)}</strong>
                  <small>${AIOCommunity.escape((a.display_name||'Użytkownik')+' • '+AIOCommunity.formatDate(p.created_at))}</small>
                </div>
              </div>
              <div class="community-admin-preview">${AIOCommunity.formatText(p.content,700)}</div>
              <div class="community-admin-actions">
                ${tab==='pending'
                  ? '<button class="button primary" data-admin-action="approve">Zatwierdź</button><button class="button" data-admin-action="reject">Odrzuć</button>'
                  : `<a class="button" href="post.html?id=${AIOCommunity.escapeAttr(p.id)}">Otwórz</a>
                     <button class="button" data-admin-action="official">${p.kind==='official'?'Zmień na społecznościowy':'Oznacz jako oficjalny'}</button>
                     <button class="button" data-admin-action="pin">${p.pinned?'Odepnij':'Przypnij'}</button>
                     <button class="button" data-admin-action="lock">${p.locked?'Odblokuj komentarze':'Zablokuj komentarze'}</button>
                     <button class="button danger" data-admin-action="hide">Ukryj</button>`}
                <button class="button" data-admin-action="edit">✏️ Edytuj wpis</button>
              </div>
            </article>`;
          }).join('')+'</div>'
        : '<div class="community-empty"><strong>Brak pozycji.</strong></div>';
      return;
    }

    if(tab==='reports'){
      root.innerHTML=rows.length
        ? '<div class="community-admin-list">'+rows.map(r=>`<article class="community-admin-item" data-admin-report="${AIOCommunity.escapeAttr(r.id)}">
            <strong>${AIOCommunity.escape(r.reason)}</strong>
            <small>${AIOCommunity.escape((r.reporter?.display_name||'Użytkownik')+' • '+AIOCommunity.formatDate(r.created_at))}</small>
            <p>Typ: ${AIOCommunity.escape(r.target_type)} • ID: <code>${AIOCommunity.escape(r.target_id)}</code></p>
            ${r.details?`<p>${AIOCommunity.formatText(r.details)}</p>`:''}
            <div class="community-admin-actions">
              <button class="button primary" data-report-action="resolved">Rozwiązane</button>
              <button class="button" data-report-action="dismissed">Odrzuć zgłoszenie</button>
            </div>
          </article>`).join('')+'</div>'
        : '<div class="community-empty"><strong>Brak otwartych zgłoszeń.</strong></div>';
      return;
    }

    if(tab==='users'){
      root.innerHTML=rows.length
        ? '<div class="community-admin-list">'+rows.map(u=>`<article class="community-admin-item community-user-card" data-admin-user="${AIOCommunity.escapeAttr(u.id)}">
          <div class="community-admin-item-head">
            ${AIOCommunity.avatarHtml(u,u.display_name)}
            <div><strong>${AIOCommunity.escape(u.display_name)}</strong><small>${AIOCommunity.escape(AIOCommunity.roleLabel(u.role))}${u.trusted?' • zaufany':''}</small></div>
          </div>
          ${(u.ips||[]).length?'<div class="community-ip-list">'+u.ips.map(ip=>`<span class="community-ip-chip"><code>${AIOCommunity.escape(ip.ip_address)}</code><small>${AIOCommunity.escape(AIOCommunity.formatDate(ip.last_seen_at))}</small><button class="community-mini-danger" data-ip-action="block" data-ip="${AIOCommunity.escapeAttr(ip.ip_address)}">Blokuj IP</button></span>`).join('')+'</div>':''}
          <div class="community-admin-actions">
            <button class="button" data-user-action="trust">${u.trusted?'Cofnij zaufanie':'Oznacz jako zaufany'}</button>
            ${u.banned_until&&Date.parse(u.banned_until)>Date.now()
              ? '<button class="button primary" data-user-action="unban">Odblokuj konto</button>'
              : '<button class="button danger" data-user-action="ban">Zablokuj konto</button>'}
            ${role==='admin'&&u.id!==AIOCommunity.user?.id
              ? `<button class="button danger" data-user-action="delete">Usuń konto</button>`
              : ''}
          </div>
        </article>`).join('')+'</div>'
        : '<div class="community-empty"><strong>Brak użytkowników.</strong></div>';
      return;
    }

    if(tab==='ip'){
      root.innerHTML=rows.length
        ? '<div class="community-admin-list">'+rows.map(b=>`<article class="community-admin-item" data-ip-block="${AIOCommunity.escapeAttr(b.id)}">
            <strong><code>${AIOCommunity.escape(b.ip_address)}</code></strong>
            <p>${AIOCommunity.escape(b.reason||'Brak powodu')}</p>
            <small>${b.active?(b.permanent?'Aktywna bezterminowo':'Aktywna do '+AIOCommunity.escape(AIOCommunity.formatDate(b.expires_at))):'Nieaktywna'}</small>
            ${b.active?'<div><button class="button primary" data-ip-action="unblock">Usuń blokadę</button></div>':''}
          </article>`).join('')+'</div>'
        : '<div class="community-empty"><strong>Brak blokad IP.</strong></div>';
      return;
    }

    if(tab==='logs'){
      root.innerHTML=rows.length
        ? '<div class="community-admin-list">'+rows.map(l=>`<article class="community-admin-item">
            <strong>${AIOCommunity.escape(l.action)}</strong>
            <small>${AIOCommunity.escape((l.actor_name||'System')+' • '+AIOCommunity.formatDate(l.created_at))}</small>
            <p>${AIOCommunity.escape(l.target_type||'')} ${AIOCommunity.escape(l.target_id||'')}</p>
            ${l.reason?`<p>${AIOCommunity.escape(l.reason)}</p>`:''}
          </article>`).join('')+'</div>'
        : '<div class="community-empty"><strong>Dziennik jest pusty.</strong></div>';
    }

    if(tab==='statistics'){
      const st=rows[0]||{};
      const num=v=>Number(v||0).toLocaleString('pl-PL');
      const top=Array.isArray(st.top_pages)?st.top_pages:[];
      const online=Array.isArray(st.online_users)?st.online_users:[];

      root.innerHTML=`
        <div class="community-admin-stat-dashboard">
          <div class="community-admin-stat-grid">
            <div class="community-admin-stat-card"><strong>${num(st.pageviews_today)}</strong><span>odsłon dzisiaj</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.visitors_today)}</strong><span>unikalnych przeglądarek dzisiaj</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.pageviews_7d)}</strong><span>odsłon / 7 dni</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.visitors_7d)}</strong><span>unikalnych / 7 dni</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.pageviews_30d)}</strong><span>odsłon / 30 dni</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.visitors_30d)}</strong><span>unikalnych / 30 dni</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.community_users)}</strong><span>profili Społeczności</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.new_users_7d)}</strong><span>nowych profili / 7 dni</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.posts_total)}</strong><span>opublikowanych wpisów</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.comments_total)}</strong><span>komentarzy</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.chat_total)}</strong><span>wiadomości czatu łącznie</span></div>
            <div class="community-admin-stat-card"><strong>${num(st.chat_7d)}</strong><span>wiadomości czatu / 7 dni</span></div>
          </div>
          <section class="community-admin-stat-section">
            <h3>🟢 Użytkownicy online na czacie: ${num(st.online_count)}</h3>
            <div class="community-admin-online-list">
              ${online.length?online.map(u=>`<span class="community-admin-online-chip">${AIOCommunity.escape(u.display_name)}${u.role==='admin'?' • administrator':u.role==='moderator'?' • moderator':''}</span>`).join(''):'<span class="community-muted">W tej chwili nikt nie jest aktywny na czacie.</span>'}
            </div>
          </section>
          <section class="community-admin-stat-section">
            <h3>Najczęściej odwiedzane podstrony — 30 dni</h3>
            <div class="community-admin-stat-table">
              ${top.length?top.map(p=>`<div class="community-admin-stat-row"><code>${AIOCommunity.escape(p.path||'/')}</code><strong>${num(p.views)}</strong></div>`).join(''):'<span class="community-muted">Statystyki zaczną się wypełniać po wdrożeniu pakietu.</span>'}
            </div>
          </section>
          <p class="community-side-note">Statystyki odwiedzin są agregowane. „Unikalny użytkownik” oznacza unikalną przeglądarkę rozpoznawaną losowym identyfikatorem zapisanym lokalnie — nie zapisujemy adresu IP w liczniku odwiedzin.</p>
        </div>`;
      return;
    }

    if(tab==='access-activity'){
      const d=rows[0]||{},t=d.totals||{},methods=Array.isArray(d.methods)?d.methods:[],top=Array.isArray(d.topTargets)?d.topTargets:[],daily=Array.isArray(d.daily)?d.daily:[],recent=Array.isArray(d.recent)?d.recent:[];
      const num=v=>Number(v||0).toLocaleString('pl-PL');
      const methodName=m=>({revolut:'Revolut',buycoffee:'BuyCoffee',kofi:'Ko-fi'})[m]||m||'—';
      const eventName=e=>({free_access:'darmowy dostęp',direct_free:'darmowe wejście bezpośrednie',unlocked_access:'pobranie po odblokowaniu',limit_reached:'osiągnięty limit',direct_limit:'limit wejścia bezpośredniego',access_gate_shown:'wyświetlono AIO Access',support_method_selected:'wybrano metodę',support_provider_opened:'otwarto stronę wsparcia',access_unlocked:'odblokowano dostęp po zakończeniu ścieżki'})[e]||e;
      root.innerHTML=`<div class="aio-access-admin"><div class="aio-access-note"><strong>Ważne:</strong> panel pokazuje aktywność AIO Access, a nie potwierdzone płatności. „Odblokowano dostęp” oznacza zakończenie obecnej ścieżki AIO Access.</div><div class="aio-access-kpis"><div class="aio-access-kpi"><strong>${num(t.free_today)}</strong><span>darmowych dostępów dzisiaj</span></div><div class="aio-access-kpi"><strong>${num(t.unlocked_today)}</strong><span>pobrań po odblokowaniu</span></div><div class="aio-access-kpi"><strong>${num(t.limits_today)}</strong><span>osiągnięć limitu</span></div><div class="aio-access-kpi"><strong>${num(t.gates_today)}</strong><span>wyświetleń AIO Access</span></div><div class="aio-access-kpi"><strong>${num(t.providers_today)}</strong><span>otwarć operatorów</span></div><div class="aio-access-kpi"><strong>${num(t.unlocks_today)}</strong><span>odblokowań dzisiaj</span></div><div class="aio-access-kpi"><strong>${num(t.free_7d)}</strong><span>darmowych / 7 dni</span></div><div class="aio-access-kpi"><strong>${num(t.unlocks_7d)}</strong><span>odblokowań / 7 dni</span></div><div class="aio-access-kpi"><strong>${num(t.free_30d)}</strong><span>darmowych / 30 dni</span></div><div class="aio-access-kpi"><strong>${num(t.limits_30d)}</strong><span>limitów / 30 dni</span></div><div class="aio-access-kpi"><strong>${num(t.providers_30d)}</strong><span>operatorów / 30 dni</span></div><div class="aio-access-kpi"><strong>${num(t.unlocks_30d)}</strong><span>odblokowań / 30 dni</span></div></div><section class="aio-access-panel"><h3>Metody wsparcia — 30 dni</h3><div class="aio-access-table">${methods.length?methods.map(x=>`<div class="aio-access-row"><span>${AIOCommunity.escape(methodName(x.method))}</span><strong>${num(x.n)}</strong></div>`).join(''):'<small>Brak danych.</small>'}</div></section><section class="aio-access-panel"><h3>Najczęściej otwierane pliki / elementy — 30 dni</h3><div class="aio-access-table">${top.length?top.map(x=>`<div class="aio-access-row"><span>${AIOCommunity.escape(x.target||'Nieznany element')}<small> • ${x.kind==='community'?'link społeczności':'pobranie'}</small></span><strong>${num(x.n)}</strong></div>`).join(''):'<small>Brak danych.</small>'}</div></section><section class="aio-access-panel"><h3>Aktywność dzienna — 30 dni</h3><div class="aio-access-table">${daily.length?daily.map(x=>`<div class="aio-access-row"><span><strong>${AIOCommunity.escape(x.day||'')}</strong><small> • darmowe ${num(x.free)} • limity ${num(x.limits)} • operatorzy ${num(x.providers)}</small></span><strong>${num(x.unlocks)} odblok.</strong></div>`).join(''):'<small>Brak danych.</small>'}</div></section><section class="aio-access-panel"><h3>Ostatnia aktywność</h3><div class="aio-access-table">${recent.length?recent.map(x=>`<div class="aio-access-row"><div class="aio-access-event"><strong>${AIOCommunity.escape(eventName(x.event_type))}</strong><code>${AIOCommunity.escape(x.target||x.path||'')}</code><small>${AIOCommunity.escape((x.user_name?x.user_name+' • ':'')+AIOCommunity.formatDate(x.created_at)+(x.method?' • '+methodName(x.method):''))}</small></div></div>`).join(''):'<small>Brak danych.</small>'}</div></section></div>`;
      return;
    }

    if(tab==='security'){
      const x=rows[0]||{},priv=Array.isArray(x.privileged_accounts)?x.privileged_accounts:[];
      root.innerHTML=`
        <p class="owner-admin-tabs-note">Najważniejsza sekcja bezpieczeństwa. Uprawnienia administracyjne są sprawdzane po stronie Cloudflare, nie tylko w przeglądarce.</p>
        <div class="owner-admin-lock">
          <div class="owner-admin-card ${x.lock_configured?'ok':'warn'}"><strong>${x.lock_configured?'Twarda blokada aktywna':'Tryb zgodności'}</strong><span>COMMUNITY_OWNER_USER_ID</span></div>
          <div class="owner-admin-card ok"><strong>${Number(x.active_sessions||0).toLocaleString('pl-PL')}</strong><span>aktywnych sesji</span></div>
          <div class="owner-admin-card ${Number(x.other_privileged_count||0)?'danger':'ok'}"><strong>${Number(x.other_privileged_count||0)}</strong><span>innych kont z rolą admin/moderator</span></div>
          <div class="owner-admin-card ${x.owner_email_configured?'ok':'warn'}"><strong>${x.owner_email_configured?'Ustawiony':'Opcjonalny'}</strong><span>COMMUNITY_OWNER_EMAIL</span></div>
        </div>
        <div class="owner-admin-security-note"><strong>ID właściciela:</strong> <code data-owner-id>${AIOCommunity.escape(x.owner_id||'')}</code></div>
        <div class="owner-admin-security-actions">
          <button class="button" data-owner-copy-id>Kopiuj ID właściciela</button>
          <button class="button danger" data-owner-action="cleanup_privileged_roles">Usuń role innych admin/moderator</button>
          <button class="button danger" data-owner-action="revoke_other_sessions">Wyloguj wszystkie pozostałe sesje</button>
          <button class="button primary" data-owner-backup>Pobierz backup JSON</button>
        </div>
        <div class="owner-admin-list">
          ${priv.length?priv.map(u=>`<div class="owner-admin-row"><div class="owner-admin-row-main"><strong>${AIOCommunity.escape(u.display_name||'Użytkownik')} <span class="owner-admin-badge ${u.id===x.owner_id?'current':'alert'}">${u.id===x.owner_id?'właściciel':AIOCommunity.escape(u.role||'')}</span></strong><small>${AIOCommunity.escape(u.id||'')}</small></div></div>`).join(''):'<div class="owner-admin-empty">Brak kont uprzywilejowanych.</div>'}
        </div>`;
      return;
    }

    if(tab==='sessions'){
      root.innerHTML=rows.length?'<div class="owner-admin-list">'+rows.map(x=>`<div class="owner-admin-row" data-owner-session="${AIOCommunity.escapeAttr(x.id)}"><div class="owner-admin-row-main"><strong>${AIOCommunity.escape(x.display_name||'Użytkownik')}${x.current?'<span class="owner-admin-badge current">bieżąca</span>':''}${x.owner?'<span class="owner-admin-badge">właściciel</span>':''}</strong><small>${AIOCommunity.escape((x.ip_address||'brak IP')+' • ostatnio '+AIOCommunity.formatDate(x.last_seen_at))}</small><p>${AIOCommunity.escape(x.user_agent||'Brak User-Agent')}<br>Wygasa: ${AIOCommunity.escape(AIOCommunity.formatDate(x.expires_at))}</p></div>${x.current?'':`<button class="button danger" data-owner-session-revoke>Zakończ sesję</button>`}</div>`).join('')+'</div>':'<div class="owner-admin-empty">Brak aktywnych sesji.</div>';
      return;
    }

    if(tab==='comments'){
      root.innerHTML=rows.length?'<div class="owner-admin-list">'+rows.map(x=>`<div class="owner-admin-row" data-owner-comment="${AIOCommunity.escapeAttr(x.id)}"><div class="owner-admin-row-main"><strong>${AIOCommunity.escape(x.author_name||'Użytkownik')} <span class="owner-admin-badge">${AIOCommunity.escape(x.status||'')}</span></strong><small>${AIOCommunity.escape(AIOCommunity.formatDate(x.created_at))} • ${AIOCommunity.escape(x.post_title||'Wpis')}</small><p>${AIOCommunity.formatText(x.content||'',700)}</p><a class="button" href="post.html?id=${AIOCommunity.escapeAttr(x.post_id)}">Otwórz wpis</a></div><button class="button danger" data-owner-comment-delete>Usuń komentarz</button></div>`).join('')+'</div>':'<div class="owner-admin-empty">Brak komentarzy.</div>';
      return;
    }

    if(tab==='chat'){
      root.innerHTML=rows.length?'<div class="owner-admin-list">'+rows.map(x=>`<div class="owner-admin-row" data-owner-chat="${AIOCommunity.escapeAttr(x.id)}"><div class="owner-admin-row-main"><strong>${AIOCommunity.escape(x.author_name||'Użytkownik')} <span class="owner-admin-badge">${AIOCommunity.escape(x.status||'')}</span></strong><small>${AIOCommunity.escape(AIOCommunity.formatDate(x.created_at))}</small><p>${x.status==='deleted'?'<em>Wiadomość usunięta</em>':AIOCommunity.formatText(x.content||'',700)}</p></div>${x.status==='deleted'?'':`<button class="button danger" data-owner-chat-delete>Usuń wiadomość</button>`}</div>`).join('')+'</div>':'<div class="owner-admin-empty">Brak wiadomości czatu.</div>';
      return;
    }

    if(tab==='password-resets'){
      root.innerHTML=rows.length
        ? '<div class="community-admin-list">'+rows.map(r=>`<article class="community-admin-item" data-password-reset="${AIOCommunity.escapeAttr(r.id)}">
            <div class="community-admin-item-head">
              <div>
                <strong>🔑 ${AIOCommunity.escape(r.display_name||'Użytkownik')}</strong>
                <small>${AIOCommunity.escape(AIOCommunity.formatDate(r.created_at))}</small>
              </div>
            </div>
            <p><strong>E-mail:</strong> ${AIOCommunity.escape(r.email_snapshot||'')}</p>
            <p class="community-side-note">${r.status==='approved'
              ? 'Kod został już wygenerowany. Jeśli nie został przekazany użytkownikowi, wygeneruj nowy.'
              : 'Użytkownik oczekuje na jednorazowy kod umożliwiający ustawienie nowego hasła.'}</p>
            ${r.expires_at?`<small>Kod ważny do: ${AIOCommunity.escape(AIOCommunity.formatDate(r.expires_at))}</small>`:''}
            <div class="community-admin-actions">
              <button class="button primary" data-password-reset-action="approve">${r.status==='approved'?'Wygeneruj nowy kod':'Wygeneruj kod resetu'}</button>
              <button class="button danger" data-password-reset-action="cancel">Anuluj prośbę</button>
            </div>
          </article>`).join('')+'</div>'
        : '<div class="community-empty"><strong>Brak próśb o reset hasła.</strong><p>Nowe prośby użytkowników pojawią się tutaj.</p></div>';
      return;
    }
  }

  function ensureEditDialog(){
    if(q('[data-admin-edit-dialog]'))return;

    const dialog=document.createElement('dialog');
    dialog.className='community-dialog community-admin-edit-dialog';
    dialog.setAttribute('data-admin-edit-dialog','');

    dialog.innerHTML=`
      <form class="community-dialog-card community-form community-admin-edit-form" data-admin-edit-form>
        <button class="community-dialog-close" type="button" aria-label="Zamknij">✕</button>

        <p class="eyebrow">Moderacja treści</p>
        <h2>Edytuj wpis</h2>
        <p class="community-side-note">
          Edytujesz pełny wpis. Możesz poprawić tytuł, treść, kategorię, rodzaj publikacji
          oraz dodać, zachować lub usunąć zdjęcia.
        </p>

        <input type="hidden" data-edit-id>

        <div class="community-form-row">
          <div class="community-field">
            <label>Rodzaj wpisu</label>
            <select data-edit-post-type required></select>
          </div>
          <div class="community-field">
            <label>Kategoria</label>
            <select data-edit-category required></select>
          </div>
        </div>

        <label class="community-notice success" data-edit-official-wrap>
          <input type="checkbox" data-edit-official>
          Wpis oficjalny AIO-IPTV.pl
        </label>

        <div class="community-field">
          <label>Tytuł</label>
          <input type="text" minlength="6" maxlength="140" data-edit-title required>
        </div>

        <div class="community-field">
          <label>Treść</label>
          <textarea minlength="20" maxlength="50000" rows="15" data-edit-content required></textarea>
          <small data-edit-count>0 / 50 000</small>
        </div>

        <div class="community-field">
          <label>Obecne zdjęcia</label>
          <div data-edit-existing-images></div>
          <small>Odznacz zdjęcie, jeżeli chcesz usunąć je z wpisu.</small>
        </div>

        <div class="community-field">
          <label>Dodaj nowe zdjęcia</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-edit-new-images>
          <small>Po zapisaniu wpis może mieć maksymalnie 4 zdjęcia.</small>
          <div class="community-image-preview" data-edit-image-preview></div>
        </div>
        <div class="community-form-actions">
          <button class="button" type="button" data-edit-cancel>Anuluj</button>
          <button class="button primary" type="submit" data-edit-save>Zapisz zmiany</button>
        </div>
      </form>`;

    document.body.appendChild(dialog);

    dialog.querySelector('.community-dialog-close').onclick=()=>dialog.close();
    dialog.querySelector('[data-edit-cancel]').onclick=()=>dialog.close();

    const content=dialog.querySelector('[data-edit-content]');
    content.addEventListener('input',()=>{
      dialog.querySelector('[data-edit-count]').textContent=
        AIOCommunity.characterLabel(content.value.length,50000);
    });

    dialog.querySelector('[data-edit-new-images]').addEventListener('change',previewNewImages);
    dialog.querySelector('[data-admin-edit-form]').addEventListener('submit',submitEdit);
  }

  function openEditDialog(id){
    const item=rows.find(x=>x.id===id);
    const dialog=q('[data-admin-edit-dialog]');
    if(!item||!dialog)return;

    const categories=(AIOCommunity.config?.categories||[]);
    const postTypes=(AIOCommunity.config?.postTypes||[]);

    dialog.querySelector('[data-edit-category]').innerHTML=
      categories.map(x=>`<option value="${AIOCommunity.escapeAttr(x.id)}">${AIOCommunity.escape(x.icon+' '+x.label)}</option>`).join('');

    dialog.querySelector('[data-edit-post-type]').innerHTML=
      postTypes.map(x=>`<option value="${AIOCommunity.escapeAttr(x.id)}">${AIOCommunity.escape(x.icon+' '+x.label)}</option>`).join('');

    dialog.querySelector('[data-edit-id]').value=item.id;
    dialog.querySelector('[data-edit-title]').value=item.title||'';
    dialog.querySelector('[data-edit-content]').value=item.content||'';
    dialog.querySelector('[data-edit-category]').value=item.category||'inne';
    dialog.querySelector('[data-edit-post-type]').value=item.post_type||'problem';
    dialog.querySelector('[data-edit-count]').textContent=
      AIOCommunity.characterLabel(String(item.content||'').length,50000);

    const official=dialog.querySelector('[data-edit-official]');
    const officialWrap=dialog.querySelector('[data-edit-official-wrap]');
    official.checked=item.kind==='official';
    official.disabled=role!=='admin';
    officialWrap.hidden=role!=='admin';

    renderExistingImages(item,dialog);

    const newInput=dialog.querySelector('[data-edit-new-images]');
    newInput.value='';
    dialog.querySelector('[data-edit-image-preview]').innerHTML='';

    if(typeof dialog.showModal==='function')dialog.showModal();
    else dialog.setAttribute('open','');
  }

  function renderExistingImages(item,dialog){
    const root=dialog.querySelector('[data-edit-existing-images]');
    const list=Array.isArray(item.attachments)?item.attachments:[];
    if(!list.length){
      root.innerHTML='<p class="community-muted">Ten wpis nie ma obecnie zdjęć.</p>';
      return;
    }

    root.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      ${list.map((img,index)=>`
        <label style="display:block;border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:10px">
          ${img.url?`<img src="${AIOCommunity.escapeAttr(img.url)}"
                         alt="Zdjęcie ${index+1}"
                         loading="lazy"
                         style="width:100%;height:130px;object-fit:cover;border-radius:8px;margin-bottom:8px">`:''}
          <span style="display:flex;gap:8px;align-items:center">
            <input type="checkbox" data-keep-attachment="${index}" checked>
            <span>Zachowaj: ${AIOCommunity.escape(img.name||('zdjęcie '+(index+1)))}</span>
          </span>
        </label>`).join('')}
    </div>`;
  }

  function previewNewImages(event){
    const dialog=q('[data-admin-edit-dialog]');
    if(!dialog)return;
    const root=dialog.querySelector('[data-edit-image-preview]');
    root.innerHTML='';

    Array.from(event.target.files||[]).slice(0,4).forEach(file=>{
      const fig=document.createElement('figure');
      const img=document.createElement('img');
      const url=URL.createObjectURL(file);
      img.src=url;
      img.alt=file.name;
      img.onload=()=>URL.revokeObjectURL(url);
      fig.appendChild(img);
      root.appendChild(fig);
    });
  }

  async function removeUploaded(key){
    if(!key)return;
    try{
      await fetch('/api/community-media?key='+encodeURIComponent(key),{
        method:'DELETE',
        credentials:'include',
        cache:'no-store'
      });
    }catch(_){}
  }

  async function submitEdit(event){
    event.preventDefault();

    const form=event.currentTarget;
    const id=form.querySelector('[data-edit-id]').value;
    const item=rows.find(x=>x.id===id);
    if(!item)return;

    const title=form.querySelector('[data-edit-title]').value.trim();
    const content=form.querySelector('[data-edit-content]').value.trim();

    if(title.length<6){
      AIOCommunity.showToast('Tytuł musi mieć co najmniej 6 znaków.','error');
      return;
    }
    if(content.length<20){
      AIOCommunity.showToast('Treść musi mieć co najmniej 20 znaków.','error');
      return;
    }

    const old=Array.isArray(item.attachments)?item.attachments:[];
    const kept=old.filter((_,index)=>{
      const cb=form.querySelector(`[data-keep-attachment="${index}"]`);
      return !cb||cb.checked;
    });

    const files=Array.from(form.querySelector('[data-edit-new-images]').files||[]);
    if(kept.length+files.length>4){
      AIOCommunity.showToast(
        `Po zapisaniu wpis może mieć maksymalnie 4 zdjęcia. Wybrano ${kept.length+files.length}.`,
        'error'
      );
      return;
    }

    const save=form.querySelector('[data-edit-save]');
    save.disabled=true;
    save.textContent='Zapisuję…';

    const uploaded=[];

    try{
      for(const file of files){
        uploaded.push(await AIOCommunity.uploadMedia(file,'post'));
      }

      const attachments=kept.concat(uploaded).map(x=>({
        key:x.key||x.path||'',
        path:x.key||x.path||'',
        name:x.name||'obraz',
        type:x.type||'image/jpeg',
        size:Number(x.size||0)
      }));

      const response=await fetch('/api/community-edit',{
        method:'POST',
        credentials:'include',
        cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          action:'edit_post',
          id,
          title,
          content,
          category:form.querySelector('[data-edit-category]').value,
          postType:form.querySelector('[data-edit-post-type]').value,
          official:Boolean(form.querySelector('[data-edit-official]')?.checked),
          attachments
        })
      });

      const data=await response.json().catch(()=>({ok:false,error:'Nieprawidłowa odpowiedź serwera.'}));
      if(!response.ok||data.ok===false)throw new Error(data.error||('HTTP '+response.status));

      q('[data-admin-edit-dialog]').close();
      AIOCommunity.showToast('Wpis został zaktualizowany.','success');
      await load();

    }catch(error){
      for(const x of uploaded)await removeUploaded(x.key);
      AIOCommunity.showToast(AIOCommunity.friendlyError(error),'error');
    }finally{
      save.disabled=false;
      save.textContent='Zapisz zmiany';
    }
  }

  function openResetDeliveryDialog({code,email,displayName,expiresAt}){
    const safeCode=String(code||'').trim();
    const safeEmail=String(email||'').trim();
    const safeName=String(displayName||'Użytkownik').trim()||'Użytkownik';

    if(!safeCode){
      AIOCommunity.showToast('Brak kodu resetu.','error');
      return;
    }

    const subject='Kod resetu hasła — AIO-IPTV.pl';
    const message=[
      `Dzień dobry${safeName&&safeName!=='Użytkownik'?', '+safeName:''},`,
      '',
      'otrzymaliśmy prośbę o zresetowanie hasła do Społeczności AIO-IPTV.pl.',
      '',
      'Twój jednorazowy kod resetu:',
      safeCode,
      '',
      'Kod jest ważny przez 24 godziny i może zostać użyty tylko jeden raz.',
      'Na stronie AIO-IPTV.pl wybierz „Mam kod resetu”, wpisz powyższy kod i ustaw nowe hasło.',
      '',
      'Jeżeli nie prosiłeś o zmianę hasła, zignoruj tę wiadomość.',
      '',
      'Pozdrawiam',
      'Paweł Pawełek',
      'Administrator strony AIO-IPTV.pl'
    ].join('\n');

    const dialog=document.createElement('dialog');
    dialog.className='community-dialog community-reset-delivery-dialog';
    dialog.innerHTML=`
      <div class="community-dialog-card community-form">
        <button class="community-dialog-close" type="button" aria-label="Zamknij">✕</button>
        <p class="eyebrow">Reset hasła</p>
        <h2>Kod został wygenerowany</h2>
        <p class="community-side-note">
          Możesz skopiować sam kod, skopiować gotową wiadomość albo przygotować e-mail
          do użytkownika w domyślnym programie pocztowym.
        </p>
        <div class="community-field">
          <label>Odbiorca</label>
          <input type="text" value="${AIOCommunity.escapeAttr(safeEmail)}" readonly>
        </div>
        <div class="community-field">
          <label>Jednorazowy kod resetu</label>
          <input type="text" value="${AIOCommunity.escapeAttr(safeCode)}" data-reset-delivery-code readonly>
          <small>${expiresAt?'Kod ważny do: '+AIOCommunity.escape(AIOCommunity.formatDate(expiresAt)):'Kod jest ważny 24 godziny.'}</small>
        </div>
        <div class="community-field">
          <label>Treść wiadomości</label>
          <textarea rows="14" data-reset-delivery-message readonly>${AIOCommunity.escape(message)}</textarea>
        </div>
        <div class="community-form-actions">
          <button class="button" type="button" data-reset-copy-code>Kopiuj kod</button>
          <button class="button" type="button" data-reset-copy-message>Kopiuj wiadomość</button>
          <button class="button primary" type="button" data-reset-open-email ${safeEmail?'':'disabled'}>Przygotuj e-mail</button>
          <button class="button" type="button" data-reset-close>Zamknij</button>
        </div>
      </div>`;

    document.body.appendChild(dialog);

    const close=()=>{
      try{dialog.close();}catch(_){}
      dialog.remove();
    };

    dialog.querySelector('.community-dialog-close').onclick=close;
    dialog.querySelector('[data-reset-close]').onclick=close;
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});

    dialog.querySelector('[data-reset-copy-code]').onclick=async()=>{
      try{
        await navigator.clipboard.writeText(safeCode);
        AIOCommunity.showToast('Kod został skopiowany.','success');
      }catch(_){
        const input=dialog.querySelector('[data-reset-delivery-code]');
        input.select();
        document.execCommand('copy');
        AIOCommunity.showToast('Kod został skopiowany.','success');
      }
    };

    dialog.querySelector('[data-reset-copy-message]').onclick=async()=>{
      try{
        await navigator.clipboard.writeText(message);
        AIOCommunity.showToast('Wiadomość została skopiowana.','success');
      }catch(_){
        const area=dialog.querySelector('[data-reset-delivery-message]');
        area.select();
        document.execCommand('copy');
        AIOCommunity.showToast('Wiadomość została skopiowana.','success');
      }
    };

    const emailButton=dialog.querySelector('[data-reset-open-email]');
    if(emailButton&&!emailButton.disabled){
      emailButton.onclick=()=>{
        const mailto=`mailto:${encodeURIComponent(safeEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
        window.location.href=mailto;
      };
    }

    if(typeof dialog.showModal==='function')dialog.showModal();
    else dialog.setAttribute('open','');
  }

  async function ownerCall(payload){
    try{
      await ownerPost(payload);
      AIOCommunity.showToast('Zapisano zmianę w panelu właściciela.','success');
      await load();
    }catch(e){AIOCommunity.showToast(AIOCommunity.friendlyError(e),'error');}
  }

  async function downloadOwnerBackup(){
    try{
      const d=await ownerGet('export');
      const blob=new Blob([JSON.stringify(d.export||{},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='aio-owner-backup-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      AIOCommunity.showToast('Backup JSON został przygotowany.','success');
    }catch(e){AIOCommunity.showToast(AIOCommunity.friendlyError(e),'error');}
  }

  async function call(payload){
    try{
      await AIOCommunity.api('admin_action',payload);
      AIOCommunity.showToast('Zapisano zmianę.','success');
      await load();
    }catch(e){
      AIOCommunity.showToast(AIOCommunity.friendlyError(e),'error');
    }
  }

  async function handle(e){
    const p=e.target.closest('[data-admin-post]');
    const pa=e.target.closest('[data-admin-action]');

    if(p&&pa){
      const id=p.dataset.adminPost;
      const op=pa.dataset.adminAction;

      if(op==='edit'){
        e.preventDefault();
        openEditDialog(id);
      }else{
        await call({target:'post',op,id});
      }
      return;
    }

    const rr=e.target.closest('[data-admin-report]');
    const ra=e.target.closest('[data-report-action]');
    if(rr&&ra){
      await call({target:'report',op:ra.dataset.reportAction,id:rr.dataset.adminReport});
      return;
    }

    const u=e.target.closest('[data-admin-user]');
    const ua=e.target.closest('[data-user-action]');
    if(u&&ua){
      const op=ua.dataset.userAction;
      let payload={target:'user',op,id:u.dataset.adminUser};

      if(op==='ban'){
        payload.duration=prompt('Czas blokady: 24h, 7d, 30d lub permanent','7d')||'7d';
        payload.reason=prompt('Powód blokady:','Naruszenie zasad społeczności')||'';
      }

      if(op==='delete'&&!confirm('Trwale usunąć konto?'))return;
      await call(payload);
      return;
    }

    const ib=e.target.closest('[data-ip-block]');
    const iun=e.target.closest('[data-ip-action="unblock"]');
    if(ib&&iun){
      await call({target:'ip',op:'unblock',id:ib.dataset.ipBlock});
      return;
    }

    const ip=e.target.closest('[data-ip-action="block"]');
    if(ip){
      const card=e.target.closest('[data-admin-user]');
      const reason=prompt('Powód blokady IP:','Naruszenie zasad społeczności')||'';
      const duration=prompt('Czas blokady: 24h, 7d, 30d lub permanent','7d')||'7d';
      await call({
        target:'ip',
        op:'block',
        ip:ip.dataset.ip,
        userId:card?.dataset.adminUser||null,
        reason,
        duration
      });
    }

    const copyOwner=e.target.closest('[data-owner-copy-id]');
    if(copyOwner){
      const id=q('[data-owner-id]')?.textContent?.trim()||'';
      if(id){try{await navigator.clipboard.writeText(id);AIOCommunity.showToast('ID właściciela skopiowany.','success');}catch(_){}}
      return;
    }

    const backup=e.target.closest('[data-owner-backup]');
    if(backup){await downloadOwnerBackup();return;}

    const ownerAction=e.target.closest('[data-owner-action]');
    if(ownerAction){
      const action=ownerAction.dataset.ownerAction;
      const message=action==='cleanup_privileged_roles'?'Usunąć role admin/moderator ze wszystkich innych kont?':'Wylogować wszystkie inne aktywne sesje?';
      if(confirm(message))await ownerCall({action});
      return;
    }

    const sessionCard=e.target.closest('[data-owner-session]');
    const sessionKill=e.target.closest('[data-owner-session-revoke]');
    if(sessionCard&&sessionKill){if(confirm('Zakończyć tę sesję?'))await ownerCall({action:'revoke_session',id:sessionCard.dataset.ownerSession});return;}

    const commentCard=e.target.closest('[data-owner-comment]');
    const commentDelete=e.target.closest('[data-owner-comment-delete]');
    if(commentCard&&commentDelete){if(confirm('Trwale usunąć ten komentarz?'))await ownerCall({action:'delete_comment',id:commentCard.dataset.ownerComment});return;}

    const chatCard=e.target.closest('[data-owner-chat]');
    const chatDelete=e.target.closest('[data-owner-chat-delete]');
    if(chatCard&&chatDelete){if(confirm('Usunąć tę wiadomość czatu?'))await ownerCall({action:'delete_chat',id:chatCard.dataset.ownerChat});return;}

    const resetCard=e.target.closest('[data-password-reset]');
    const resetAction=e.target.closest('[data-password-reset-action]');
    if(resetCard&&resetAction){
      const id=resetCard.dataset.passwordReset;
      const op=resetAction.dataset.passwordResetAction;

      if(op==='cancel'){
        if(!confirm('Anulować tę prośbę o reset hasła?'))return;
        await call({target:'password_reset',op:'cancel',id});
        return;
      }

      if(op==='approve'){
        try{
          const requestRow=rows.find(x=>x.id===id)||{};
          const d=await AIOCommunity.api('admin_action',{target:'password_reset',op:'approve',id});
          const code=d.resetCode||'';
          if(!code)throw new Error('Serwer nie zwrócił kodu resetu.');

          openResetDeliveryDialog({
            code,
            email:requestRow.email_snapshot||'',
            displayName:requestRow.display_name||'Użytkownik',
            expiresAt:d.expiresAt||null
          });

          await load();
        }catch(err){
          AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');
        }
        return;
      }
    }

  }

  boot();
})();
