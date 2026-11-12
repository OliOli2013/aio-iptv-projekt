(()=>{'use strict';
const $=id=>document.getElementById(id),text=(name,value)=>{const el=document.createElement(name);el.textContent=String(value??'');return el;};
function clear(id){$(id).replaceChildren()}
function group(id,list){clear(id);if(!list?.length){$(id).append(text('p','Nie wykryto powiązań w badanej próbce.'));return;}
 const tbl=document.createElement('table'),head=document.createElement('tr');for(const h of ['Prefiks','Konta','Liczba adresów','Ostatnia aktywność'])head.append(text('th',h));tbl.append(head);
 for(const g of list){const tr=document.createElement('tr');tr.append(text('td',g.prefix),text('td',g.accounts.map(a=>a.name+' ('+a.id.slice(0,8)+')').join('; ')),text('td',g.ip_count),text('td',g.latest));tbl.append(tr);}$(id).append(tbl);}
function similarities(id,list){clear(id);$(id).append(text('h3',id==='emails'?'Te same części adresów e-mail':id==='gmail'?'Aliasy tej samej skrzynki Gmail':'Powtarzające się nazwy'));
 if(!list?.length){$(id).append(text('p','Brak powiązań w profilu danych.'));return;}
 for(const group of list.slice(0,35)){$(id).append(text('p',group.match+' → '+group.accounts.map(a=>a.name+' ['+a.id.slice(0,8)+']').join(', ')));}}
async function run(){ $('scan').disabled=true;$('status').textContent='Trwa bezpieczny audyt D1…';
 try{const resp=await fetch('/api/aio-multikonto-audit-v1',{cache:'no-store',credentials:'include'});const d=await resp.json();if(!resp.ok||!d.ok)throw new Error(d.error||'Brak uprawnień właściciela.');
  clear('metrics');for(const [label,value] of Object.entries(d.stats)){$('metrics').append(text('span',label+': '+value+'  '));}
  group('v64',d.groups['64']);group('v4',d.ipv4);group('v56',d.groups['56']);group('v48',d.groups['48']);
  similarities('emails',d.similarity.email_local);similarities('gmail',d.similarity.gmail_alias);similarities('names',d.similarity.display_name);
  clear('rotations');for(const x of d.rotations.slice(0,30))$('rotations').append(text('p',x.name+' — '+x.prefixes_64+' różnych /64'));
  $('status').textContent='Audyt wykonany. '+(d.stats.truncated?'Osiągnięto limit skanowania; wyniki częściowe.':'');
 }catch(e){$('status').textContent='Błąd: '+e.message;}finally{$('scan').disabled=false;}}
$('scan').addEventListener('click',run);run();
})();
