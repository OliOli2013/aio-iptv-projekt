/* Społeczność AIO — Cloudflare D1/R2 backend, 2026-10-08 */
(function(){
  'use strict';

  // Linki publikowane w Społeczności AIO są przechowywane tylko w pamięci JS.
  // W DOM nie ma bezpośredniego adresu URL, dzięki czemu zwykłe
  // "Kopiuj adres linku" nie omija mechanizmu AIO Access.
  const protectedCommunityLinks = new Map();
  let protectedCommunityLinkSeq = 0;

  function storeProtectedCommunityLink(url){
    protectedCommunityLinkSeq += 1;
    let randomPart = '';
    try{
      if(window.crypto && window.crypto.getRandomValues){
        const data = new Uint32Array(1);
        window.crypto.getRandomValues(data);
        randomPart = data[0].toString(36);
      }
    }catch(_){}
    if(!randomPart) randomPart = Math.random().toString(36).slice(2,10);
    const token = 'aio-cl-' + Date.now().toString(36) + '-' +
      protectedCommunityLinkSeq.toString(36) + '-' + randomPart;
    protectedCommunityLinks.set(token,String(url||''));
    return token;
  }

  function maskCommunityLink(url){
    try{
      const parsed = new URL(url,window.location.href);
      const protocol = /^https?:$/.test(parsed.protocol) ? parsed.protocol+'//' : '';
      const host = parsed.host || '';
      const hasTail = (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash;
      return protocol + host + (hasTail ? '/••••••' : '');
    }catch(_){
      return 'link/••••••';
    }
  }

  function openProtectedCommunityLink(token,anchor){
    const url = protectedCommunityLinks.get(String(token||''));
    if(!url) return false;

    const access = window.AIO_ACCESS_V21;
    if(!access || typeof access.openCommunityLink !== 'function') return false;

    const label = anchor
      ? String(anchor.textContent||'').replace(/\s+/g,' ').trim()
      : maskCommunityLink(url);

    return access.openCommunityLink({
      href:url,
      target:(anchor && anchor.getAttribute('target')) || '_blank',
      download:'',
      label:label || 'Link ze Społeczności AIO'
    });
  }

  const AIOCommunity = {
    config:null, user:null, profile:null, ready:false, backendReady:false, ipBlocked:false,

    async init(){
      try{
        this.config = await this.loadConfig();
        const health = await this.apiGet('health');
        this.backendReady = Boolean(health && health.ok);
        const session = await this.authSession();
        if(session && session.authenticated){
          this.user = session.user;
          this.profile = session.profile || session.user;
        }
        this.ready=true;
        this.initGlobalUi();
        this.renderAccountBars();
        document.dispatchEvent(new CustomEvent('aio-community-ready',{detail:this}));
      }catch(error){
        console.error(error);
        this.ready=true; this.backendReady=false;
        this.initGlobalUi(); this.renderAccountBars(error);
        document.dispatchEvent(new CustomEvent('aio-community-ready',{detail:this}));
      }
    },

    async loadConfig(){
      try{
        const r=await fetch('data/community_config.json?v=20261008-cloudflare-clean1',{cache:'no-store'});
        if(r.ok) return await r.json();
      }catch(_){}
      return {
        enabled:true, postsPerPage:12, maxImageSizeMb:5, maxImagesPerPost:4,
        maxPostLength:50000,maxCommentLength:10000,postPreviewLength:1400,officialPreviewLength:3200,
        categories:[
          {id:'pomoc',label:'Pomoc techniczna',icon:'🛠️'},{id:'aio-panel',label:'AIO Panel',icon:'🧩'},
          {id:'iptv',label:'IPTV i listy M3U',icon:'📺'},{id:'kanaly',label:'Listy kanałów',icon:'📡'},
          {id:'picony',label:'Picony i EPG',icon:'🖼️'},{id:'oscam',label:'OSCam i softcam',icon:'🔐'},
          {id:'systemy',label:'Systemy Enigma2',icon:'💿'},{id:'wtyczki',label:'Wtyczki',icon:'🔌'},
          {id:'aplikacje',label:'Aplikacje',icon:'📱'},{id:'testy',label:'Testy i opinie',icon:'✅'},
          {id:'inne',label:'Inne',icon:'💬'}
        ],
        postTypes:[
          {id:'problem',label:'Problem / pytanie',icon:'❓'},{id:'information',label:'Informacja / komunikat',icon:'ℹ️'},
          {id:'update',label:'Aktualizacja / nowość',icon:'📢'},{id:'guide',label:'Poradnik / rozwiązanie',icon:'💡'},
          {id:'discussion',label:'Dyskusja / opinia',icon:'💬'}
        ]
      };
    },

    async apiGet(action, params={}){
      const u=new URL('/api/community',location.origin);
      u.searchParams.set('action',action);
      Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));});
      const r=await fetch(u,{credentials:'include',cache:'no-store'});
      const d=await r.json().catch(()=>({ok:false,error:'Nieprawidłowa odpowiedź serwera.'}));
      if(!r.ok||d.ok===false) throw new Error(d.error||('HTTP '+r.status));
      return d;
    },
    async api(action,payload={}){
      const r=await fetch('/api/community',{
        method:'POST',credentials:'include',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({action,...payload})
      });
      const d=await r.json().catch(()=>({ok:false,error:'Nieprawidłowa odpowiedź serwera.'}));
      if(!r.ok||d.ok===false) throw new Error(d.error||('HTTP '+r.status));
      return d;
    },
    async authSession(){
      const r=await fetch('/api/community-auth',{credentials:'include',cache:'no-store'});
      return r.json();
    },
    async auth(action,payload={}){
      const r=await fetch('/api/community-auth',{
        method:'POST',credentials:'include',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({action,...payload})
      });
      const d=await r.json().catch(()=>({ok:false,error:'Nieprawidłowa odpowiedź serwera.'}));
      if(!r.ok||d.ok===false) throw new Error(d.error||('HTTP '+r.status));
      return d;
    },

    initGlobalUi(){
      document.addEventListener('click',e=>{
        const login=e.target.closest('[data-community-login]');
        if(login){e.preventDefault();this.openAuth();}
        const logout=e.target.closest('[data-community-logout]');
        if(logout){e.preventDefault();this.signOut();}
        const image=e.target.closest('[data-community-image]');
        if(image){e.preventDefault();this.openImage(image.getAttribute('src'),image.getAttribute('alt'));}

        const protectedLink=e.target.closest('[data-community-link-token]');
        if(protectedLink){
          e.preventDefault();
          e.stopPropagation();
          if(!openProtectedCommunityLink(
            protectedLink.getAttribute('data-community-link-token'),
            protectedLink
          )){
            this.showToast('Nie udało się otworzyć chronionego linku. Odśwież stronę i spróbuj ponownie.','warning');
          }
        }
      });
    },

    async signOut(){
      try{await this.auth('logout');}catch(_){}
      this.user=null;this.profile=null;this.renderAccountBars();
      document.dispatchEvent(new CustomEvent('aio-community-auth',{detail:{user:null,profile:null}}));
      this.showToast('Wylogowano ze Społeczności AIO.','success');
    },

    openAuth(message){
      let dialog=document.querySelector('[data-aio-auth-dialog]');
      if(!dialog){
        dialog=document.createElement('dialog');
        dialog.setAttribute('data-aio-auth-dialog','');
        dialog.className='community-dialog';
        dialog.innerHTML=`
          <form class="community-dialog-card" data-aio-auth-form>
            <button class="community-dialog-close" type="button" aria-label="Zamknij">✕</button>
            <p class="eyebrow">Społeczność AIO • Cloudflare</p>
            <h2>Zaloguj się lub utwórz konto</h2>
            <p data-aio-auth-message class="community-side-note">Konto działa już na Cloudflare. Hasło musi mieć co najmniej 10 znaków.</p>
            <div class="community-field"><label>E-mail</label><input type="email" name="email" required autocomplete="email"></div>
            <div class="community-field"><label>Hasło</label><input type="password" name="password" required minlength="10" autocomplete="current-password"></div>
            <div class="community-auth-recovery-actions">
              <button class="community-auth-forgot" type="button" data-forgot-password>Nie pamiętam hasła</button>
              <button class="community-auth-forgot" type="button" data-have-reset-code>Mam kod resetu</button>
            </div>
            <div class="community-field" data-register-name hidden><label>Nazwa wyświetlana</label><input type="text" name="displayName" minlength="2" maxlength="60"></div>
            <div class="community-form-actions">
              <button class="button primary" type="submit" data-login-submit>Zaloguj</button>
              <button class="button" type="button" data-register-toggle>Utwórz konto</button>
            </div>
            <small class="community-muted">Stare konta Supabase nie przenoszą haseł. Przy pierwszym wejściu do nowej Społeczności utwórz nowe konto.</small>
          </form>`;
        document.body.appendChild(dialog);
        const form=dialog.querySelector('[data-aio-auth-form]');
        const regWrap=dialog.querySelector('[data-register-name]');
        const toggle=dialog.querySelector('[data-register-toggle]');
        const submit=dialog.querySelector('[data-login-submit]');
        let register=false;
        toggle.addEventListener('click',()=>{
          register=!register;regWrap.hidden=!register;
          submit.textContent=register?'Utwórz konto':'Zaloguj';
          toggle.textContent=register?'Mam już konto':'Utwórz konto';
          form.querySelector('[name="displayName"]').required=register;
        });
        dialog.querySelector('.community-dialog-close').addEventListener('click',()=>dialog.close());
        dialog.querySelector('[data-forgot-password]').addEventListener('click',()=>{const email=form.email.value.trim();dialog.close();this.openPasswordReset(email);});
        dialog.querySelector('[data-have-reset-code]').addEventListener('click',()=>{
          dialog.close();
          this.openPasswordResetConfirm();
        });
        form.addEventListener('submit',async e=>{
          e.preventDefault();
          const button=submit;button.disabled=true;
          try{
            const email=form.email.value.trim(), password=form.password.value;
            const d=await this.auth(register?'register':'login',{
              email,password,displayName:form.displayName.value.trim()
            });
            this.user=d.user;this.profile=d.user;dialog.close();form.reset();
            this.renderAccountBars();
            document.dispatchEvent(new CustomEvent('aio-community-auth',{detail:{user:this.user,profile:this.profile}}));
            this.showToast(d.firstAccount?'Konto utworzone. To pierwsze konto otrzymało uprawnienia administratora.':'Zalogowano.','success');
          }catch(err){this.showToast(this.friendlyError(err),'error');}
          finally{button.disabled=false;}
        });
      }
      const msg=dialog.querySelector('[data-aio-auth-message]');
      if(msg&&message)msg.textContent=message;
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    },

    openPasswordReset(prefill=''){
      let dialog=document.querySelector('[data-aio-reset-request-dialog]');
      if(!dialog){
        dialog=document.createElement('dialog');
        dialog.setAttribute('data-aio-reset-request-dialog','');
        dialog.className='community-dialog';
        dialog.innerHTML=`
          <form class="community-dialog-card" data-aio-reset-request-form>
            <button class="community-dialog-close" type="button" aria-label="Zamknij">✕</button>
            <p class="eyebrow">Społeczność AIO</p>
            <h2>Nie pamiętam hasła</h2>
            <p class="community-side-note">
              Podaj adres e-mail użyty przy rejestracji. Prośba trafi do administratora.
              Po weryfikacji otrzymasz od administratora jednorazowy kod resetu.
            </p>
            <div class="community-field">
              <label>E-mail</label>
              <input type="email" name="email" required autocomplete="email">
            </div>
            <div class="community-form-actions">
              <button class="button" type="button" data-reset-have-code>Mam już kod</button>
              <button class="button primary" type="submit">Wyślij prośbę</button>
            </div>
          </form>`;
        document.body.appendChild(dialog);
        const form=dialog.querySelector('[data-aio-reset-request-form]');
        dialog.querySelector('.community-dialog-close').onclick=()=>dialog.close();
        dialog.querySelector('[data-reset-have-code]').onclick=()=>{
          dialog.close();
          this.openPasswordResetConfirm();
        };
        form.addEventListener('submit',async e=>{
          e.preventDefault();
          const button=form.querySelector('[type="submit"]');
          button.disabled=true;
          button.textContent='Wysyłam…';
          try{
            await this.auth('request_reset',{email:form.email.value.trim()});
            dialog.close();
            this.showToast('Prośba została przyjęta. Skontaktuj się z administratorem AIO, aby otrzymać jednorazowy kod resetu.','success');
          }catch(err){
            this.showToast(this.friendlyError(err),'error');
          }finally{
            button.disabled=false;
            button.textContent='Wyślij prośbę';
          }
        });
      }
      const input=dialog.querySelector('input[name="email"]');
      input.value=prefill||'';
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
      setTimeout(()=>input.focus(),0);
    },

    openPasswordResetConfirm(){
      let dialog=document.querySelector('[data-aio-reset-confirm-dialog]');
      if(!dialog){
        dialog=document.createElement('dialog');
        dialog.setAttribute('data-aio-reset-confirm-dialog','');
        dialog.className='community-dialog';
        dialog.innerHTML=`
          <form class="community-dialog-card" data-aio-reset-confirm-form>
            <button class="community-dialog-close" type="button" aria-label="Zamknij">✕</button>
            <p class="eyebrow">Społeczność AIO</p>
            <h2>Ustaw nowe hasło</h2>
            <p class="community-side-note">
              Wpisz jednorazowy kod otrzymany od administratora. Kod jest ważny 24 godziny i działa tylko raz.
            </p>
            <div class="community-field">
              <label>Kod resetu</label>
              <input type="text" name="code" required minlength="8" maxlength="80" autocomplete="one-time-code" autocapitalize="none" spellcheck="false">
            </div>
            <div class="community-field">
              <label>Nowe hasło</label>
              <input type="password" name="password" required minlength="10" autocomplete="new-password">
            </div>
            <div class="community-field">
              <label>Powtórz nowe hasło</label>
              <input type="password" name="password2" required minlength="10" autocomplete="new-password">
            </div>
            <div class="community-form-actions">
              <button class="button primary" type="submit">Zmień hasło</button>
            </div>
          </form>`;
        document.body.appendChild(dialog);
        dialog.querySelector('.community-dialog-close').onclick=()=>dialog.close();
        const form=dialog.querySelector('[data-aio-reset-confirm-form]');
        form.addEventListener('submit',async e=>{
          e.preventDefault();
          if(form.password.value!==form.password2.value){
            this.showToast('Podane hasła nie są identyczne.','error');
            return;
          }
          const button=form.querySelector('[type="submit"]');
          button.disabled=true;
          button.textContent='Zmieniam…';
          try{
            await this.auth('reset_password',{
              code:form.code.value.trim(),
              password:form.password.value
            });
            dialog.close();
            form.reset();
            this.showToast('Hasło zostało zmienione. Zaloguj się nowym hasłem.','success');
            this.openAuth('Hasło zostało zmienione. Możesz się teraz zalogować.');
          }catch(err){
            this.showToast(this.friendlyError(err),'error');
          }finally{
            button.disabled=false;
            button.textContent='Zmień hasło';
          }
        });
      }
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
      setTimeout(()=>dialog.querySelector('input[name="code"]').focus(),0);
    },

    renderAccountBars(error){
      document.querySelectorAll('[data-community-account]').forEach(bar=>{
        bar.classList.toggle('is-guest',!this.user);
        const main=bar.querySelector('[data-community-account-main]');
        const actions=bar.querySelector('[data-community-account-actions]');
        if(!main||!actions)return;
        if(this.user){
          main.innerHTML=this.avatarHtml(this.profile,this.profile?.display_name,false)+
            `<div class="community-account-copy"><strong>${this.escape(this.profile?.display_name||'Użytkownik')}</strong><small>${this.escape(this.roleLabel(this.profile?.role||'user'))}</small></div>`;
          actions.innerHTML=`<a class="button" href="profile.html?id=${this.escapeAttr(this.user.id)}">Profil</a>`+
            (this.isAdmin()?'<a class="button" href="community-admin.html">Moderacja</a>':'')+
            '<button class="button" type="button" data-community-logout>Wyloguj</button>';
        }else{
          main.innerHTML='<span class="community-avatar">AIO</span><div class="community-account-copy"><strong>Społeczność AIO</strong><small>'+
            (error?'Backend chwilowo niedostępny':'Zaloguj się, aby czytać i publikować')+'</small></div>';
          actions.innerHTML='<button class="button primary" type="button" data-community-login>Zaloguj się / utwórz konto</button>';
        }
      });
    },

    requireAuth(message){
      if(this.user)return true;
      this.openAuth(message||'Zaloguj się, aby skorzystać z tej funkcji.');
      return false;
    },
    isAdmin(){return Boolean(this.profile&&['admin','moderator'].includes(this.profile.role));},
    isOwner(id){return Boolean(this.user&&id&&this.user.id===id);},
    isBanned(){return Boolean(this.profile?.banned_until&&Date.parse(this.profile.banned_until)>Date.now());},

    async uploadMedia(file,kind='post'){
      if(!file)throw new Error('Nie wybrano pliku.');
      const compressed=await this.compressImage(file,kind==='avatar'?512:1600,kind==='avatar'?0.8:0.82);
      const fd=new FormData();fd.append('file',compressed,compressed.name||file.name);fd.append('kind',kind);
      const r=await fetch('/api/community-media',{method:'POST',credentials:'include',body:fd});
      const d=await r.json().catch(()=>({ok:false,error:'Błąd wysyłania obrazu.'}));
      if(!r.ok||d.ok===false)throw new Error(d.error||'Błąd wysyłania obrazu.');
      return d;
    },
    async compressImage(file,maxEdge=1600,quality=.82){
      if(!/^image\/(jpeg|png|webp)$/i.test(file.type)||file.size<450000)return file;
      try{
        const bmp=await createImageBitmap(file);
        let w=bmp.width,h=bmp.height;
        const scale=Math.min(1,maxEdge/Math.max(w,h));w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(bmp,0,0,w,h);
        const blob=await new Promise(res=>canvas.toBlob(res,'image/webp',quality));
        if(!blob)return file;
        return new File([blob],(file.name.replace(/\.[^.]+$/,'')||'image')+'.webp',{type:'image/webp'});
      }catch(_){return file;}
    },

    category(id){return (this.config?.categories||[]).find(x=>x.id===id)||{id:'inne',label:'Inne',icon:'💬'};},
    postType(id){return (this.config?.postTypes||[]).find(x=>x.id===id)||{id:'problem',label:'Problem / pytanie',icon:'❓'};},
    roleLabel(role){return role==='admin'?'Administrator':role==='moderator'?'Moderator':'Użytkownik';},
    escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
    escapeAttr(value){return this.escape(value);},

    formatText(text,limit){
      let value=String(text||'');
      if(limit&&value.length>limit)value=value.slice(0,limit).trimEnd()+'…';

      const pattern=/(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:pl|com|net|org|eu|io|tv|dev|app|info|me)(?:\/[^\s<>"']*)?/gi;
      let html='';
      let last=0;
      let match;

      while((match=pattern.exec(value))!==null){
        html+=this.escape(value.slice(last,match.index));

        let shown=match[0];
        let trailing='';
        while(/[.,;:!?\)\]\}]+$/.test(shown)){
          trailing=shown.slice(-1)+trailing;
          shown=shown.slice(0,-1);
        }

        const href=/^https?:\/\//i.test(shown)?shown:'https://'+shown;
        const token=storeProtectedCommunityLink(href);
        const masked=maskCommunityLink(href);

        html+='<a class="community-link community-link-protected" '+
          'href="#aio-community-link" '+
          'data-community-link-token="'+this.escapeAttr(token)+'" '+
          'title="Link chroniony — kliknij, aby otworzyć" '+
          'rel="nofollow ugc"><span>'+this.escape(masked)+
          '</span><b aria-hidden="true">↗</b></a>'+this.escape(trailing);

        last=match.index+match[0].length;
      }

      html+=this.escape(value.slice(last));
      return html.replace(/\r?\n/g,'<br>');
    },

    timeAgo(value){
      const t=Date.parse(value);if(!t)return '';
      const s=Math.floor((Date.now()-t)/1000);
      if(s<60)return 'przed chwilą';if(s<3600)return Math.floor(s/60)+' min temu';if(s<86400)return Math.floor(s/3600)+' godz. temu';
      if(s<604800)return Math.floor(s/86400)+' dni temu';return new Intl.DateTimeFormat('pl-PL',{dateStyle:'medium'}).format(new Date(t));
    },
    formatDate(value){const t=Date.parse(value);return t?new Intl.DateTimeFormat('pl-PL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(t)):'';},
    characterLabel(n,max){return Number(n||0).toLocaleString('pl-PL')+' / '+Number(max||0).toLocaleString('pl-PL');},
    friendlyError(error){return String(error?.message||error||'Wystąpił błąd.').replace(/^Error:\s*/,'');},
    avatarHtml(profile,name,link=true){
      const p=profile||{},label=this.escape(name||p.display_name||'Użytkownik'),src=p.avatar_url||'';
      const body=src?`<img class="community-avatar" src="${this.escapeAttr(src)}" alt="${label}" loading="lazy">`:`<span class="community-avatar">${this.escape((name||p.display_name||'A').slice(0,2).toUpperCase())}</span>`;
      return body;
    },
    showToast(message,type='info'){
      let box=document.querySelector('.community-toast-stack');
      if(!box){box=document.createElement('div');box.className='community-toast-stack';document.body.appendChild(box);}
      const el=document.createElement('div');el.className='community-toast '+type;el.textContent=String(message||'');box.appendChild(el);
      setTimeout(()=>el.remove(),4200);
    },
    showSetupError(error){this.showToast(this.friendlyError(error),'error');},
    openImage(src,alt){
      let d=document.querySelector('[data-community-image-dialog]');
      if(!d){d=document.createElement('dialog');d.className='community-image-dialog';d.setAttribute('data-community-image-dialog','');d.innerHTML='<button type="button" aria-label="Zamknij">✕</button><img alt="">';document.body.appendChild(d);d.querySelector('button').onclick=()=>d.close();}
      d.querySelector('img').src=src;d.querySelector('img').alt=alt||'Zdjęcie';d.showModal();
    },
    async preparePostMedia(post){return post;}
  };

  window.AIOCommunity=AIOCommunity;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>AIOCommunity.init());
  else AIOCommunity.init();
})();
