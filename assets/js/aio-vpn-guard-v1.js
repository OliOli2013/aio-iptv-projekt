/* Owner-only read-only classification panel. No public IP or API key rendered. */
(()=>{'use strict';
  const $=id=>document.getElementById(id);
  const state={offset:0,cursor:null,total:0,all:false,working:false,stopped:false,ok:false};
  const labels={tor:'Tor',proxy:'Proxy',vpn:'VPN',relay:'Relay / sieć firmowa',datacenter:'Centrum danych',mobile:'Operator mobilny',clean:'Bez sygnałów',unknown:'Nieustalone'};
  const clean=x=>String(x??'').replace(/[\u0000-\u001f]/g,'').slice(0,120);
  const formatDate=x=>x?new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw',dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—';
  const cell=(row,value)=>{const el=document.createElement('td');el.textContent=clean(value);row.append(el);return el};
  const status=(message,warning=false)=>{const el=$('status');el.textContent=message;el.className=warning?'live warning':'live'};
  async function api(method,body){
    const options={method,credentials:'include',cache:'no-store',headers:{'Accept':'application/json'}};
    if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
    const response=await fetch('/api/aio-vpn-guard',options);
    const data=await response.json().catch(()=>({ok:false,error:'Błędna odpowiedź serwera.'}));
    if(!response.ok||data.ok!==true)throw new Error(clean(data.error||'HTTP '+response.status));
    return data;
  }
  function stat(label,value){const el=document.createElement('div');const txt=document.createElement('span');txt.textContent=label;const bold=document.createElement('strong');bold.textContent=String(value);el.append(txt,bold);return el;}
  function renderConfig(data){
    const c=data.config;state.ok=c.ready;state.total=data.total_accounts;
    const box=$('config');box.replaceChildren();
    const p=document.createElement('p');p.className=c.ready?'notice':'warning';
    p.textContent=c.ready
      ?'Dostawca gotowy · Nowe rejestracje: '+(c.mode==='enforce'?'blokowanie potwierdzonego VPN/proxy/Tor':'tylko obserwacja, bez blokad')
      :'Skanowanie nieaktywne. Uzupełnij w Cloudflare sekret AIO_VPN_GUARD_API_KEY oraz AIO_VPN_GUARD_HMAC_SECRET (lub istniejący AIO_MULTIKONTA_HMAC_SECRET).';
    box.append(p);
    $('stats').replaceChildren(
      stat('Konta do kontroli',data.total_accounts),
      stat('VPN',data.review_counts.vpn||0),
      stat('Proxy',data.review_counts.proxy||0),
      stat('Tor',data.review_counts.tor||0),
      stat('Bez sygnałów',data.review_counts.clean||0),
      stat('Wykorzystane zapytania dzisiaj',`${data.budget_used}/${c.daily_budget}`),
      stat('Podejrzane rejestracje dzisiaj',(data.today_signup_flags||[]).reduce((n,r)=>n+Number(r.n||0),0)));
    for(const id of ['scan','scan-all'])$(id).disabled=!c.ready||state.working;
    renderFlagged(data.flagged||[]);
  }
  function makeButton(label,callback){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',callback);return b;}
  async function action(name,id){
    try{status('Sprawdzam wskazane konto…');const result=await api('POST',{action:name,user_id:id});
      if(name==='scan-one')status(`Konto ${clean(result.name)}: ${labels[result.kind]||result.kind}. Sprawdzono ${result.samples} adresów.`);
      else status('Oznaczono wynik jako przejrzany.');
      await refresh();
    }catch(e){status('Błąd: '+e.message,true);}
  }
  function appendResult(parent,r,stored=false){
    const row=document.createElement('tr');
    cell(row,r.name||r.id);const flag=cell(row,labels[r.kind]||r.kind);if(['tor','vpn','proxy'].includes(r.kind))flag.className='flag';else if(r.kind==='clean')flag.className='good';
    if(stored){cell(row,formatDate(r.checked_at));cell(row,r.reviewed_at?'Sprawdzone: '+formatDate(r.reviewed_at):'Do przeglądu');}
    else{cell(row,r.samples+'/'+r.known_ips);cell(row,[r.service,...(r.flags||[])].filter(Boolean).join(' · ')||'—');}
    const controls=document.createElement('td');
    controls.append(makeButton('Skanuj dokładniej',()=>action('scan-one',r.id)));
    if(stored&&!r.reviewed_at)controls.append(makeButton('Oznacz jako przejrzane',()=>action('review',r.id)));
    row.append(controls);parent.append(row);
  }
  function renderFlagged(rows){const tbody=$('flagged');tbody.replaceChildren();if(!rows.length){const r=document.createElement('tr');cell(r,'Nie ma jeszcze wyników wymagających oceny.').colSpan=5;tbody.append(r);return;}
    for(const r of rows)appendResult(tbody,r,true);
  }
  async function refresh(){
    const d=await api('GET');renderConfig(d);
    status(d.config.ready?'Status odświeżony. Skanowanie kont można rozpocząć na żądanie.':'Usługa nie jest jeszcze skonfigurowana.',!d.config.ready);
  }
  const updateProgress=()=>{$('bar').style.width=state.total?Math.min(100,Math.round(100*state.offset/state.total))+'%':'0%';};
  function controls(active){
    state.working=active;
    $('scan').disabled=active||!state.ok;
    $('scan-all').disabled=active||!state.ok;
    $('stop').disabled=!active;
    $('reset-cursor').disabled=active;
  }
  async function scanBatch(){
    const result=await api('POST',{action:'scan',processed:state.offset,cursor:state.cursor});
    const tbody=$('batch');tbody.replaceChildren();
    if(!result.results.length){const r=document.createElement('tr');cell(r,'Brak nowych kont do skanowania.').colSpan=5;tbody.append(r);}
    for(const r of result.results)appendResult(tbody,r);
    if(['budget_exhausted','provider_timeout','provider_invalid'].includes(result.provider_status)||result.provider_status.startsWith('provider_http_')){
      state.stopped=true;
      status('Skanowanie wstrzymane: '+result.provider_status+'. Zachowano bieżącą pozycję; spróbuj później.',true);
    }else{
      state.offset=result.next_offset;state.cursor=result.next_cursor;
      status(`Sprawdzono do ${result.next_offset} z ${result.total} kont. Zdalne sprawdzenia IP w partii: ${result.remote_lookups}.`);
    }
    state.total=result.total;updateProgress();
    if(result.complete)state.stopped=true;
    return result;
  }
  async function run(all){
    if(state.working||!state.ok)return;
    state.stopped=false;controls(true);
    try{
      do{await scanBatch();if(state.stopped||!all)break;
        // Sequential owner-triggered batches: no background scheduler and no runaway concurrency.
        await new Promise(resolve=>setTimeout(resolve,300));
      }while(!state.stopped);
      const progress=$('progress');progress.textContent=`Pozycja: ${state.offset} / ${state.total}. ${state.stopped?'Zakończono albo wstrzymano.':'Możesz uruchomić kolejną partię.'}`;
    }catch(e){state.stopped=true;status('Skanowanie przerwane: '+e.message,true);}
    finally{controls(false);try{const d=await api('GET');renderConfig(d);}catch(_){}}
  }
  $('refresh').addEventListener('click',()=>refresh().catch(e=>status('Błąd: '+e.message,true)));
  $('scan').addEventListener('click',()=>run(false));
  $('scan-all').addEventListener('click',()=>run(true));
  $('stop').addEventListener('click',()=>{state.stopped=true;status('Zatrzymywanie po bieżącej partii.');});
  $('reset-cursor').addEventListener('click',()=>{state.offset=0;state.cursor=null;state.stopped=false;updateProgress();$('progress').textContent='Wrócono do pierwszego konta.';});
  refresh().catch(e=>{status('Brak dostępu lub błąd API: '+e.message,true);$('scan').disabled=true;$('scan-all').disabled=true;});
})();
