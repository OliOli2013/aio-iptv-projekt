/* Owner-only UI. Text is assigned via textContent, never HTML. */
(()=>{'use strict';
 const api='/api/owner-user-speed';
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const btn=(text,fn)=>{const b=el('button',text);b.type='button';b.className='aou-btn';b.addEventListener('click',fn);return b;};
 const label=(title,node)=>{const l=el('label',title+' ');l.append(node);return l;};
 const select=options=>{const s=el('select');for(const [v,t] of options){const o=el('option',t);o.value=v;s.append(o);}return s;};
 const when=ms=>ms===null?'bezterminowo':new Date(ms).toLocaleString('pl-PL');
 const speed=r=>r.kbps===null?'pełna dostępna prędkość':r.kbps+' KB/s';
 async function call(url,body){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Błąd '+r.status);return j;}
 function mount(host,user){
   const panel=el('section');panel.className='aio-individual-speed';panel.append(el('h3','Indywidualna prędkość – FREE'));host.append(panel);
   const msg=el('p','Wczytywanie ustawień…');msg.setAttribute('role','status');panel.append(msg);
   let generation=0;
   function render(d){if(!panel.isConnected)return;panel.replaceChildren(el('h3','Indywidualna prędkość – FREE'),el('p',d.user.name+' • '+d.user.email));
     const s=d.stored,g=d.global,e=d.effective;
     panel.append(el('p','Domyślnie: '+(g.enabled?speed(g):'ograniczenie wyłączone')+' · Aktualnie dla FREE: '+(e.enabled?speed(e):'pełna dostępna prędkość')));
     if(s.mode!=='default')panel.append(el('p','Zapisany wyjątek: '+speed(s)+' · '+when(s.expires_ms)+(s.expired?' (wygasł)':s.grouped?' (wstrzymany – grupa kont)':'')+' · '+s.reason));
     if(s.grouped)panel.append(el('p','Potwierdzona grupa kont: obowiązuje wspólny limit. Można cofnąć istniejący wyjątek, ale nie można nadać nowego.'));
     const mode=select([['default','Domyślny limit'],['custom','Indywidualny limit'],['unlimited','Pełna dostępna prędkość']]);mode.value=s.expired?'default':s.mode;
     if(s.grouped){for(const o of mode.options)if(o.value!=='default')o.disabled=true;mode.value='default';}
     const kb=el('input');kb.type='number';kb.min=String(g.kbps);kb.max='10000';kb.step='1';kb.value=String(Math.max(g.kbps,s.kbps||250));
     const duration=select([['24h','24 godziny od zapisu'],['7d','7 dni od zapisu'],['30d','30 dni od zapisu'],['forever','Bezterminowo']]);duration.value=s.mode!=='default'&&s.expires_ms===null?'forever':'7d';
     const reason=el('input');reason.type='text';reason.maxLength=180;reason.placeholder='Powód decyzji (minimum 5 znaków)';
     const kl=label('KB/s',kb),dl=label('Nowy okres',duration);const fields=el('div');fields.className='aio-individual-fields';fields.append(label('Tryb',mode),kl,dl,label('Powód',reason));
     const sync=()=>{kl.hidden=mode.value!=='custom';dl.hidden=mode.value==='default';};mode.addEventListener('change',sync);sync();
     const feedback=el('p');feedback.setAttribute('role','status');
     const save=btn('Zapisz decyzję',async()=>{if(reason.value.trim().length<5){feedback.textContent='Podaj powód (minimum 5 znaków).';return;}
       if(mode.value==='custom'&&(!Number.isInteger(Number(kb.value))||Number(kb.value)<g.kbps||Number(kb.value)>10000)){feedback.textContent='Podaj poprawną prędkość.';return;}
       if(!confirm('Zapisać ustawienia prędkości dla '+d.user.name+' ('+d.user.email+')? Limit liczby pobrań pozostanie bez zmian.'))return;
       save.disabled=true;feedback.textContent='Zapisywanie…';try{const result=await call(api,{user_id:d.user.id,mode:mode.value,kbps:Number(kb.value),duration:duration.value,reason:reason.value,confirm:true});render(result);document.dispatchEvent(new CustomEvent('aio-individual-speed-saved',{detail:{id:d.user.id,active:result.stored.active}}));}catch(e){feedback.textContent=e.message;save.disabled=false;}});
     panel.append(fields,el('small','Wyjątek nie nadaje 7D/VIP, nie omija blokad i nie zmienia miesięcznego limitu 3 pobrań. Zmiana obowiązuje od następnego transferu.'),save,feedback);
   }
   const reload=async()=>{const n=++generation;try{const d=await call(api+'?user_id='+encodeURIComponent(user.id));if(n===generation)render(d);}catch(e){if(n===generation&&panel.isConnected){msg.textContent=e.message;}}};void reload();return panel;
 }
 window.AIOSpeedUser={mount};
 const globalPanel=document.getElementById('aio-speed-panel');if(!globalPanel)return;
 const main=el('details');main.className='aio-individual-speed';main.append(el('summary','Indywidualne prędkości użytkowników'));globalPanel.append(main);
 const q=el('input');q.type='search';q.placeholder='Pełny e-mail lub UUID';q.setAttribute('aria-label','Konto użytkownika');
 const form=el('form');const find=el('button','Znajdź konto');find.type='submit';form.append(q,find);main.append(form);
 const feedback=el('p');feedback.setAttribute('role','status');const slot=el('div');main.append(feedback,slot);
 let lookupSerial=0;
 form.addEventListener('submit',async e=>{e.preventDefault();const n=++lookupSerial;find.disabled=true;slot.replaceChildren();feedback.textContent='Wyszukiwanie…';try{const d=await call('/api/owner-unified-lookup?q='+encodeURIComponent(q.value.trim()));if(n===lookupSerial){mount(slot,d.user);feedback.textContent='Znaleziono konto.';}}catch(e){if(n===lookupSerial)feedback.textContent=e.message;}finally{if(n===lookupSerial)find.disabled=false;}});
 const listTitle=el('h3','Zapisane niewygasłe wyjątki');const filter=select([['all','Wszystkie'],['custom','Indywidualny limit'],['unlimited','Pełna prędkość'],['grouped','Wstrzymane przez grupę']]);const list=el('div');const pager=el('div');let page=0,serial=0;
 const load=async()=>{const n=++serial;list.textContent='Wczytywanie…';pager.replaceChildren();try{const d=await call(api+'?filter='+encodeURIComponent(filter.value)+'&page='+page);if(n!==serial)return;list.replaceChildren();if(!d.rows.length)list.textContent='Brak wyjątków.';for(const r of d.rows){const row=el('div');row.className='aio-individual-list-row';row.append(el('span',r.name+' · '+r.email+' · '+speed(r)+' · '+when(r.expires_ms)+(r.grouped?' · grupa (wstrzymany)':'')),btn('Edytuj',()=>{++lookupSerial;find.disabled=false;slot.replaceChildren();mount(slot,{id:r.user_id});feedback.textContent='Wybrane konto.';slot.scrollIntoView({block:'nearest'});}));list.append(row);}if(page>0)pager.append(btn('Poprzednia',()=>{page--;void load();}));if(d.more)pager.append(btn('Następna',()=>{page++;void load();}));}catch(e){if(n===serial)list.textContent=e.message;}};
 const refresh=btn('Odśwież wyjątki',()=>{page=0;void load();});filter.addEventListener('change',()=>{page=0;void load();});main.append(listTitle,label('Filtr',filter),refresh,list,pager);
 main.addEventListener('toggle',()=>{if(main.open)void load();});document.addEventListener('aio-individual-speed-saved',()=>{if(main.open){page=0;void load();}});
})();
