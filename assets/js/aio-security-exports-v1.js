/* AIO Security Exports V1 — manual owner-triggered pagination, no account mutations. */
(()=>{'use strict';
  const root=document.getElementById('list'),msg=document.getElementById('status');
  const BASE='/api/aio-security-exports-v1';let busy=false;
  const safe=x=>String(x??'').slice(0,220);
  const status=(text,warn=false)=>{msg.textContent=text;msg.classList.toggle('warn',warn)};
  const cell=v=>{
    const raw=String(v??'').replace(/\u0000/g,'');
    const guarded=/^[\s\uFEFF]*[=+@\-]/u.test(raw)?"'"+raw:raw;
    return '"'+guarded.replace(/"/g,'""')+'"';
  };
  async function api(kind,page){
    const url=page?`${BASE}?kind=${encodeURIComponent(kind)}&format=json&page=${page}`:`${BASE}?kind=list`;
    const res=await fetch(url,{method:'GET',credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}});
    const json=await res.json().catch(()=>({ok:false,error:'Nieprawidłowa odpowiedź serwera.'}));
    if(!res.ok||json.ok!==true)throw new Error(safe(json.error||'HTTP '+res.status));
    return json;
  }
  const byId=()=>[...root.querySelectorAll('button[data-kind]')];
  function download(name,contents,type){
    const blob=new Blob([contents],{type});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function save(kind,format){
    if(busy)return;busy=true;byId().forEach(x=>x.disabled=true);
    const rows=[];let columns=null,exportedAt=null,countPages=0;
    try{
      for(let page=1;page<=100;page++){
        status(`Eksport ${safe(kind)}: pobieram partię ${page}…`);
        const data=await api(kind,page);
        if(!Array.isArray(data.columns)||!Array.isArray(data.rows))throw new Error('Niekompletna odpowiedź źródła.');
        if(!columns){columns=data.columns;exportedAt=data.exported_at;}
        else if(columns.join('|')!==data.columns.join('|'))throw new Error('Kolumny zmieniły się w trakcie eksportu.');
        rows.push(...data.rows);countPages=page;
        if(!data.has_more)break;
        if(page===100)throw new Error('Raport przekracza 40 000 wierszy. Nie pobrano niepełnego pliku.');
      }
      const stamp=(exportedAt||new Date().toISOString()).slice(0,10);
      if(format==='csv'){
        const text='\ufeff'+[columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
        download(`AIO-${kind}-${stamp}.csv`,text,'text/csv;charset=utf-8');
      }else{
        download(`AIO-${kind}-${stamp}.json`,JSON.stringify({ok:true,version:'AIO_SECURITY_EXPORTS_V1',kind,
          exported_at:exportedAt,complete:true,pages:countPages,records:rows.length,columns,rows},null,2), 'application/json;charset=utf-8');
      }
      status(`Gotowe: ${safe(kind)} · ${rows.length} wierszy w ${countPages} partiach · ${format.toUpperCase()}.`);
    }catch(e){status('Eksport nie powiódł się: '+safe(e.message),true);}
    finally{busy=false;byId().forEach(x=>x.disabled=false);}
  }
  function button(kind,label,format){
    const b=document.createElement('button');b.type='button';b.dataset.kind=kind;b.textContent=label;
    if(format==='json')b.className='secondary';
    b.addEventListener('click',()=>save(kind,format));return b;
  }
  async function init(){
    const data=await api('list');root.replaceChildren();const groups=new Map();
    for(const source of data.sources||[]){
      if(!groups.has(source.group))groups.set(source.group,[]);
      groups.get(source.group).push(source);
    }
    for(const [group,sources] of groups){
      const card=document.createElement('section');card.className='group';
      const heading=document.createElement('h2');heading.textContent=group;card.append(heading);
      for(const source of sources){
        const entry=document.createElement('div');entry.className='item';
        const name=document.createElement('strong');name.className='name';name.textContent=source.title;
        const options=document.createElement('div');options.className='buttons';
        options.append(button(source.kind,'↓ CSV','csv'),button(source.kind,'↓ JSON','json'));
        entry.append(name,options);card.append(entry);
      }
      root.append(card);
    }
    if(!groups.size)throw new Error('Serwer nie zwrócił katalogu eksportów.');
    status(`Dostęp właściciela potwierdzony. Dostępnych zestawów: ${data.sources.length}. Wybierz format przy odpowiednim module.`);
  }
  init().catch(e=>{status('Brak dostępu lub błąd katalogu: '+safe(e.message),true);});
})();
