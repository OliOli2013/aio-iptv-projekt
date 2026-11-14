(()=>{'use strict';const id=x=>document.getElementById(x);const el=(tag,value)=>{const e=document.createElement(tag);e.textContent=String(value??'');return e;};
async function refresh(){id('notice').textContent='Pobieram dane…';id('output').hidden=true;
 try{const r=await fetch('/api/aio-security-core',{credentials:'include',cache:'no-store'});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Brak danych');
 id('build').textContent=d.version+' · stan: '+new Date(d.generated_at).toLocaleString('pl-PL');
 id('stats').replaceChildren();for(const [key,value] of Object.entries(d.active_holds_by_source||{})){const c=el('div','');c.className='stat';const k=el('small',key.replaceAll('_',' '));const v=el('strong',value);c.append(k,v);id('stats').append(c)}
 id('paths').replaceChildren(...(d.protected_paths||[]).map(x=>el('li',x)));
 id('warnings').replaceChildren(...(d.warnings||[]).map(x=>{const p=el('div',x);p.className='warn';return p;}));
 if(d.unavailable_sources?.length)id('warnings').append(el('p','Nie udało się odczytać: '+d.unavailable_sources.join(', ')));
 id('output').hidden=false;id('notice').textContent='Zaktualizowano.';
 }catch(e){id('notice').textContent='Status niedostępny: '+String(e.message||'Błąd');}}
 id('refresh').addEventListener('click',refresh);void refresh();})();
