(()=>{'use strict';
const root=document.getElementById('aio-history-v3');if(!root)return;
const $=id=>root.querySelector('#'+id),make=(tag,txt)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=String(txt);return n;};
const state={data:null};
async function api(method,body){
  const q=method==='GET'?'?q='+encodeURIComponent($('aio-v3-query').value.trim()):'';
  const response=await fetch('/api/aio-multikonta-history-v3'+q,{method,credentials:'same-origin',cache:'no-store',
    headers:method==='POST'?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({error:'Nie udało się odczytać odpowiedzi API.'}));
  if(!response.ok||!data.ok)throw Error(data.error||'Błąd odpowiedzi serwera.');return data;
}
function render(d){state.data=d;
  $('aio-v3-summary').textContent=`Konta: ${d.accounts_scanned}; wspólne IPv4: ${d.shared_ipv4}; IPv6 /64: ${d.shared_ipv6_64}; znalezione pary: ${d.candidates_total}; wyświetlane: ${d.shown}.`;
  $('aio-v3-warning').textContent=d.partial?'Uwaga: limit skanu został osiągnięty. Wynik może być niepełny; nie jest to dowód braku innych powiązań.':'';
  const list=$('aio-v3-results');list.replaceChildren();if(!d.pairs.length){list.append(make('p','Brak par dla wybranego filtra w analizowanych danych.'));return;}
  for(const pair of d.pairs){
    const card=make('section');card.style.cssText='padding:14px;margin:10px 0;border:1px solid #376782;border-radius:10px;background:#0a2838';
    const a=pair.accounts[0],b=pair.accounts[1];
    const heading=make('h3',`${a.name} ↔ ${b.name} · ${pair.priority==='wysoki'?'wysoki priorytet':'do weryfikacji'} (wynik ${pair.score})`);heading.style.margin='0 0 8px';card.append(heading);
    card.append(make('p',`${a.name} [${a.id}] — rejestracja ${a.registered_at||'?'} · kontrola ${a.review_status||'brak'}`));
    card.append(make('p',`${b.name} [${b.id}] — rejestracja ${b.registered_at||'?'} · kontrola ${b.review_status||'brak'}`));
    if(pair.shared_ipv4.length)card.append(make('p','Wspólny IPv4: '+pair.shared_ipv4.join(', ')+(pair.ipv4_count>pair.shared_ipv4.length?' (oraz inne)':'')));
    if(pair.shared_ipv6_64.length)card.append(make('p','Wspólny IPv6 /64: '+pair.shared_ipv6_64.join(', ')));
    card.append(make('p','Przesłanki: '+pair.signals.join(', ')+' · ostatnia wspólna aktywność: '+(pair.latest||'?')));
    const target=pair.accounts.find(x=>x.id===pair.suggested_review_user_id)||b;
    if(target.review_status!=='pending'){
      const button=make('button','Wstrzymaj darmowe pobrania: '+target.name);button.type='button';
      button.addEventListener('click',async()=>{
        const other=pair.accounts.find(x=>x.id!==target.id);const reason=prompt('Podaj uzasadnienie ręcznej weryfikacji (nie sam wspólny IP):','Wspólna historia sieciowa i dodatkowe przesłanki. Wyjaśnienie z użytkownikiem.');
        if(reason===null)return;
        if(!confirm(`Wstrzymać DARMOWE pobrania konta ${target.name} (${target.id})? Nie blokuje to IP, VIP ani samego logowania.`))return;
        button.disabled=true;
        try{const result=await api('POST',{action:'hold_free',user_id:target.id,peer_user_id:other.id,reason,confirm:true});
          if(!result.audit_logged)alert('Uwaga: kontrola włączona, ale nie udało się zapisać dziennika moderacji.');
          await load();}
        catch(e){alert('Nie wprowadzono potwierdzonej zmiany: '+e.message);button.disabled=false;}
      });card.append(button);
    } else {
      const b2=make('button','Zwolnij kontrolę darmowych pobrań: '+target.name);b2.type='button';
      b2.addEventListener('click',async()=>{
        if(!confirm('Zwolnić kontrolę darmowych pobrań? Inne blokady pozostają bez zmian.'))return;b2.disabled=true;
        try{const r=await fetch('/api/aio-multikonta-owner-v2',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'release',user_id:target.id,confirm:true})});
          const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Błąd zwolnienia');await load();}
        catch(e){alert(e.message);b2.disabled=false;}
      });card.append(b2);
    }
    list.append(card);
  }
}
async function load(){const btn=$('aio-v3-search');btn.disabled=true;$('aio-v3-status').textContent='Analiza pełnej historii IPv4 oraz prefiksów IPv6…';
  try{render(await api('GET'));$('aio-v3-status').textContent='Skan wykonany. Wyniki dotyczą tylko zidentyfikowanych korelacji, nie dowodzą wspólnej tożsamości.';}
  catch(e){$('aio-v3-status').textContent='Błąd: '+e.message;}finally{btn.disabled=false;}}
$('aio-v3-search').addEventListener('click',load);$('aio-v3-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();load();}});
$('aio-v3-status').textContent='Wpisz nazwę lub IP i kliknij „Przeanalizuj historię”.';
})();
