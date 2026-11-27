(()=>{'use strict';const root=document.getElementById('aio-external-map');if(!root)return;
 const source=root.querySelector('[data-source]'),path=root.querySelector('[data-path]'),msg=root.querySelector('[data-msg]'),policy=root.querySelector('[data-policy]'),results=root.querySelector('[data-results]');
 const buttons=[...root.querySelectorAll('button')];let offset=0;
 async function call(data){const r=await fetch('/api/owner-external-speed-map',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Błąd');return j;}
 async function run(action){if(['lookup','save','remove'].includes(action)&&!source.value.trim()){msg.textContent='Wpisz pełny adres z posta.';return;}
 if(action==='set_policy'&&!confirm(policy.checked?'Włączyć kontrolę zewnętrznych linków? FREE nie otrzyma bezpośredniego linku z nieobsługiwanego hostingu. Najpierw sprawdź raport i przygotuj kopie.':'Wyłączyć kontrolę zewnętrznych linków?'))return;
 if(['save','remove'].includes(action)&&!confirm(action==='save'?'Przypisać istniejący plik R2 do tego linku? Upewnij się, że masz prawo go udostępniać.':'Usunąć powiązanie?'))return;
 buttons.forEach(x=>x.disabled=true);try{
  if(action==='report'||action==='next'){if(action==='report')offset=0;const j=await call({action:'report',offset});results.replaceChildren();let n=0,paid=0;for(const item of j.items){const p=document.createElement('p'),b=document.createElement('button');b.type='button';b.textContent=({mapped:'Kopia R2',direct:'Próba transferu bezpośredniego',needs_copy:'Wymaga kopii R2',paid_only:'Tylko 7D / VIP'})[item.mode]+': '+item.href;b.style.cssText='max-width:100%;overflow-wrap:anywhere;text-align:left;white-space:normal';b.addEventListener('click',()=>{source.value=item.href;void run('lookup');});p.append(b);results.append(p);if(item.mode==='needs_copy')n++;if(item.mode==='paid_only')paid++;}msg.textContent='Publikacje: '+j.checked+', rozpoznane linki: '+j.items.length+', wymagają kopii: '+n+', tylko 7D / VIP: '+paid+'. Strona '+(offset/50+1)+(j.more?' – są dalsze wyniki.':' – koniec.');if(j.more)offset+=50;else offset=0;return;}
  const j=await call({action,href:source.value.trim(),path:path.value.trim(),enabled:policy.checked,confirm:true});
  if(action==='policy'||action==='set_policy'){policy.checked=j.enabled;msg.textContent=j.enabled?'Kontrola zewnętrznych linków włączona (jeśli globalny limiter FREE aktywny).':'Kontrola zewnętrznych linków wyłączona.';return;}
  path.value=j.mapping?.r2_path||'';msg.textContent=j.paid_only?'Megawrzuta: tylko 7D / VIP (niezależnie od przełącznika transferu).':j.message||(j.mapping?'Przypisano: '+j.mapping.r2_path:'Brak kopii AIO dla tego linku.');
 }catch(e){msg.textContent=e.message;}finally{buttons.forEach(x=>x.disabled=false);}}
 buttons.forEach(b=>b.addEventListener('click',()=>void run(b.dataset.action)));void run('policy');
})();
