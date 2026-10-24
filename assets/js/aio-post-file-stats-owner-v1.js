/* AIO Post File Stats V1. Owner-only view appended to existing Post Files history.
 * Uses safe textContent, never interpolates untrusted D1 content as HTML.
 */
(()=>{'use strict';
  const q=(s,c=document)=>c.querySelector(s);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const num=x=>Number(x||0).toLocaleString('pl-PL');
  let mounted=false;
  let root=null;
  let busy=false;
  function stat(label,value,hint){
    const card=el('div',undefined,'apfs-card');card.append(el('span',label),el('strong',num(value)),el('small',hint));return card;
  }
  function table(columns,rows,selectors){
    const shell=el('div',undefined,'apfs-overflow'),table=el('table',undefined,'apfs-table');
    const th=el('thead'),hr=el('tr');columns.forEach(x=>hr.append(el('th',x)));th.append(hr);table.append(th);
    const body=el('tbody');
    for(const r of rows){const tr=el('tr');selectors.forEach(fn=>tr.append(el('td',fn(r))));body.append(tr);}
    if(!rows.length){const row=el('tr'),td=el('td','Brak danych w tym okresie.');td.colSpan=columns.length;row.append(td);body.append(row);}
    table.append(body);shell.append(table);return shell;
  }
  function report(d){
    const out=q('[data-apfs-content]',root);out.replaceChildren();
    const cards=el('div',undefined,'apfs-grid');
    cards.append(
      stat('Kliknięcia linków • 7 dni',d.clicks?.last7,'Nowy dziennik V1'),
      stat('Kliknięcia • dziś (UTC)',d.clicks?.today,'Zweryfikowane odwołania'),
      stat('Przekazania zewnętrzne • 7 dni',d.external?.last7,'Historyczne przekazania'),
      stat('Wydane pliki R2 z postów • 7 dni',d.local?.last7,'HTTP 200/206'),
      stat('Konta klikające • 7 dni',d.clicks?.accounts7,'Bez powtarzania kont'),
      stat('Posty z kliknięciami • 7 dni',d.clicks?.posts7,'Różne posty')
    );out.append(cards);
    const detail=el('p',`Kliknięcia łącznie: ${num(d.clicks?.total)} · przekazania zewnętrzne: ${num(d.external?.total)} · wydania lokalne: ${num(d.local?.total)}.`, 'apfs-summary');out.append(detail);
    const details=el('details',undefined,'apfs-expand');details.open=true;
    details.append(el('summary','Najpopularniejsze posty — ostatnie 30 dni'));
    details.append(table(['Post','Kliknięcia','Różne konta'],d.posts||[],[
      r=>r.title||'Post usunięty',r=>num(r.n),r=>num(r.accounts)
    ]));out.append(details);
    const files=el('details',undefined,'apfs-expand');
    files.append(el('summary','Najczęściej otwierane linki i pliki — ostatnie 30 dni'));
    files.append(table(['Plik / strona','Serwer','Rodzaj','Kliknięcia'],d.files||[],[
      r=>r.file_name||'—',r=>r.host||'—',r=>r.kind||'—',r=>num(r.n)
    ]));out.append(files);
    const days=el('details',undefined,'apfs-expand');
    days.append(el('summary','Dni i rodzaje odwołań — ostatnie 30 dni'));
    days.append(table(['Data (UTC)','Rodzaj','Kliknięcia'],d.days||[],[
      r=>r.day,r=>r.kind,r=>num(r.n)
    ]));out.append(days);
    const recent=el('details',undefined,'apfs-expand');
    recent.append(el('summary','100 ostatnich kliknięć — rozwiń historię'));
    recent.append(table(['Data','Konto','Post','Plik','Rodzaj'],d.recent||[],[
      r=>{const t=Date.parse(r.created_at);return Number.isFinite(t)?new Date(t).toLocaleString('pl-PL'):String(r.created_at||'—')},
      r=>r.user_name||'—',r=>r.post_title||'—',r=>r.file_name||'—',r=>r.kind||'—'
    ]));out.append(recent);
    out.append(el('p',d.note||'','apfs-note'));
    const status=q('[data-apfs-status]',root);status.textContent='Odczyt: '+new Date().toLocaleString('pl-PL');
  }
  async function refresh(){
    if(busy)return;busy=true;const status=q('[data-apfs-status]',root);status.textContent='Wczytywanie statystyk…';
    try{
      const response=await fetch('/api/owner-post-file-stats',{cache:'no-store',credentials:'include'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok!==true)throw new Error(data.error||'HTTP '+response.status);
      report(data);
    }catch(err){status.textContent='Statystyki niedostępne: '+String(err.message||err)}
    finally{busy=false;}
  }
  function mount(){
    if(mounted)return;
    const parent=q('#aio-post-links-history');if(!parent)return;
    mounted=true;root=el('div',undefined,'apfs-root');
    const top=el('div',undefined,'apfs-top'),heading=el('div');heading.append(el('h3','Statystyki otwarć i wydań plików'),el('p','Kliknięcia, przekazania do serwerów zewnętrznych oraz wydania z R2 — trzy osobne liczniki.'));
    const actions=el('div',undefined,'apfs-actions');
    const refreshBtn=el('button','Odśwież'),exportLink=el('a','Eksport CSV');refreshBtn.type='button';refreshBtn.addEventListener('click',refresh);exportLink.href='/api/owner-post-file-stats?format=csv';exportLink.download='aio-post-file-stats-v1.csv';actions.append(refreshBtn,exportLink);top.append(heading,actions);root.append(top);
    const status=el('span','Ładowanie…','apfs-status');status.dataset.apfsStatus='';root.append(status);
    const body=el('div');body.dataset.apfsContent='';root.append(body);
    const css=el('style');css.textContent=`
      .apfs-root{color:#e5faff;border:1px solid rgba(87,213,242,.25);padding:16px;margin:16px 0 26px;border-radius:15px;background:#092b38}
      .apfs-root *{box-sizing:border-box}.apfs-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .apfs-top h3{font-size:1.35rem;margin:0 0 5px}.apfs-top p,.apfs-note{font-size:.87rem;line-height:1.5;color:#a9cbd7;margin:6px 0}
      .apfs-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.apfs-actions button,.apfs-actions a{display:inline-flex;align-items:center;min-height:37px;border:1px solid #388299;border-radius:9px;padding:8px 13px;color:#e6fbff;background:#145267;text-decoration:none;cursor:pointer;font-size:.85rem}
      .apfs-status{color:#92cbd8;font-size:.77rem;display:block;margin:8px 0}.apfs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:14px 0}
      .apfs-card{min-width:0;border:1px solid #23576c;border-radius:11px;padding:13px;background:#082533}.apfs-card span,.apfs-card small{display:block;color:#9ec8d5;font-size:.75rem}.apfs-card strong{display:block;font-size:1.6rem;line-height:1.25;margin:7px 0}.apfs-summary{color:#bfe7f3;font-size:.85rem}
      .apfs-expand{border:1px solid #27546a;border-radius:10px;margin:10px 0;padding:9px}.apfs-expand summary{cursor:pointer;padding:5px;font-weight:750}.apfs-overflow{overflow:auto;max-width:100%;margin-top:8px}
      .apfs-table{width:100%;border-collapse:collapse;font-size:.78rem}.apfs-table th,.apfs-table td{padding:8px;border-bottom:1px solid #245061;text-align:left;max-width:400px;overflow-wrap:anywhere}.apfs-table th{color:#9adceb;background:#124b61;white-space:nowrap}
      @media(max-width:980px){.apfs-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.apfs-root{padding:11px}.apfs-grid{grid-template-columns:1fr 1fr;gap:6px}.apfs-card{padding:9px}.apfs-card strong{font-size:1.3rem}.apfs-top{display:block}.apfs-actions{margin-top:10px}}
    `;root.append(css);
    parent.insertBefore(root,parent.firstChild);void refresh();
  }
  function boot(){const parent=q('.oh-content');if(!parent)return;
    if(q('#aio-post-links-history')){mount();return;}
    const observer=new MutationObserver(()=>{if(q('#aio-post-links-history')){observer.disconnect();mount();}});
    observer.observe(parent,{subtree:true,childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
