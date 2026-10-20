/* Owner-only, API-enforced V5 external file handoff history. */
(()=>{'use strict';
 const e=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let section,offset=0;
 function when(x){const d=new Date(x);return Number.isNaN(+d)?String(x||''):d.toLocaleString('pl-PL');}
 async function refresh(){
   if(!section)return;const status=section.querySelector('[data-apl-status]');status.textContent='Odczyt…';
   try{
     const response=await fetch('/api/owner-post-links?offset='+offset,{credentials:'include',cache:'no-store'});
     const data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==true)throw new Error(data.error||'HTTP '+response.status);
     const content=section.querySelector('[data-apl-list]');content.replaceChildren();
     const intro=e('p','Przekazania plików z postów: '+data.total+' łącznie, '+data.last_7_days+' w ostatnich 7 dniach.','apl-intro');content.append(intro);
     const table=e('table',undefined,'apl-table'),head=e('tr');
     ['Data','Konto','Post','Plik','Serwer','Rodzaj'].forEach(v=>head.append(e('th',v)));
     const thead=e('thead');thead.append(head);table.append(thead);const body=e('tbody');
     for(const row of data.rows||[]){const tr=e('tr');[when(row.created_at),row.user_name,row.post_title,row.file_name,row.host,row.reason].forEach(v=>tr.append(e('td',v||'—')));body.append(tr)}
     table.append(body);const scroll=e('div',undefined,'apl-scroll');scroll.append(table);content.append(scroll);
     const controls=e('div',undefined,'apl-controls'),back=e('button','← Poprzednie'),next=e('button','Następne →');
     back.type='button';next.type='button';back.disabled=offset===0;next.disabled=!data.has_more;
     back.addEventListener('click',()=>{offset=Math.max(0,offset-100);void refresh()});next.addEventListener('click',()=>{offset+=100;void refresh()});
     controls.append(back,e('span','Od '+(offset+1)+' do '+(offset+(data.rows||[]).length)+' / '+data.total),next);content.append(controls);
     content.append(e('p',data.note,'apl-note'));
     status.textContent='Odczyt: '+new Date().toLocaleString('pl-PL');
   }catch(err){status.textContent='Błąd historii linków: '+String(err.message||err)}
 }
 async function init(){const host=document.querySelector('.oh-content');if(!host)return;
   const auth=await fetch('/api/community-auth',{credentials:'include',cache:'no-store'}).then(r=>r.json()).catch(()=>null);
   if(!auth?.authenticated||auth.user?.is_owner!==true||auth.email_verified!==true)return;
   section=e('section',undefined,'apl-root');section.id='aio-post-links-history';section.append(e('h2','Pliki z postów — historia przekazań'));
   section.append(e('p','Osobny dziennik zewnętrznych linków do plików. Wspólny licznik 3 pobrań / 168 h jest egzekwowany przez D1.'));
   const button=e('button','Odśwież');button.type='button';button.addEventListener('click',()=>void refresh());section.append(button);
   const status=e('span','Odczyt…');status.dataset.aplStatus='';section.append(status);const list=e('div');list.dataset.aplList='';section.append(list);
   const anchor=host.querySelector('.oh-tools');host.insertBefore(section,anchor||null);
   const style=e('style');style.textContent='.apl-root{margin:20px 0;padding:18px;border:1px solid #24576b;border-radius:14px;background:#082733;color:#e6f9ff}.apl-root h2{margin:0 0 8px;font-size:1.32rem}.apl-root p,.apl-root span{color:#a9ccd8}.apl-root button{background:#14536a;color:white;border:1px solid #397f95;padding:8px 12px;border-radius:7px;cursor:pointer;margin:8px}.apl-root button:disabled{opacity:.45;cursor:not-allowed}.apl-scroll{overflow:auto}.apl-table{border-collapse:collapse;width:100%;font-size:.85rem}.apl-table th,.apl-table td{padding:8px;text-align:left;border-bottom:1px solid #265064;white-space:nowrap}.apl-table th{background:#18576c}.apl-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.apl-note{font-size:.81rem}';section.append(style);
   await refresh();if(location.hash==='#aio-post-links-history')section.scrollIntoView({block:'start'});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void init(),{once:true});else void init();
})();
