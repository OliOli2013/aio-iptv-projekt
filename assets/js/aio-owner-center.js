/* AIO Owner Center V1. Read-only dashboard; all permission checks are server-side. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let latest = null;
  const txt = (name, value) => { const node = $(name); if(node) node.textContent = String(value); };
  const fmt = n => Number(n || 0).toLocaleString('pl-PL');
  const date = v => { const n = new Date(v); return Number.isNaN(n.getTime()) ? String(v || '') : n.toLocaleString('pl-PL'); };
  function make(tag, value, className) {
    const n = document.createElement(tag);
    if (value !== undefined) n.textContent = String(value);
    if (className) n.className = className;
    return n;
  }
  function renderRows(parent, data, fields, empty) {
    parent.replaceChildren();
    if (!data.length) { parent.append(make('p',empty,'aoc-empty')); return; }
    const t = make('table');
    const head = make('thead'); const tr = make('tr');
    fields.forEach(col => tr.append(make('th',col.title)));
    head.append(tr); t.append(head);
    const body=make('tbody');
    for (const item of data) {
      const row=make('tr');
      for (const col of fields) row.append(make('td',col.view(item)));
      body.append(row);
    }
    t.append(body); parent.append(t);
  }
  async function retrieve() {
    const opts = new URLSearchParams({
      days:$('aoc-days').value,
      file:$('aoc-file').value.trim().slice(0,80),
      user:$('aoc-user').value.trim().slice(0,80)
    });
    const r = await fetch('/api/owner-downloads?' + opts,{credentials:'include',cache:'no-store'});
    const data = await r.json().catch(()=>({}));
    if(!r.ok || !data.ok) throw new Error(data.error || 'Nie można odczytać statystyk.');
    return data;
  }
  function render(d) {
    latest=d;
    $('aio-owner-center').hidden=false;
    $('aio-owner-downloads').hidden=false;
    txt('aoc-issued',fmt(d.totals.issued));
    txt('aoc-account',fmt(d.totals.accounts));
    txt('aoc-guest',fmt(d.totals.guests));
    txt('aoc-active',d.totals.active_grants == null ? '—' : fmt(d.totals.active_grants));
    txt('aoc-summary','Wydane odpowiedzi serwera z ostatnich '+d.days+' dni: '+fmt(d.totals.issued)+
      '. Konta: '+fmt(d.totals.accounts)+', goście: '+fmt(d.totals.guests)+'.');
    renderRows($('aoc-top-files'),d.files,[
      {title:'Plik',view:x=>x.file_name},
      {title:'Wydania',view:x=>fmt(x.n)}
    ],'Brak zapisanych lokalnych wydań plików w tym okresie.');
    renderRows($('aoc-top-users'),d.users,[
      {title:'Konto',view:x=>x.name||'Użytkownik'},
      {title:'Wydania',view:x=>fmt(x.n)}
    ],'Brak pobrań przypisanych do kont w tym okresie.');
    renderRows($('aoc-days-table'),d.daily,[
      {title:'Data (UTC)',view:x=>x.day},
      {title:'Wydania',view:x=>fmt(x.n)}
    ],'Brak danych dziennych.');
    const audience={guest:'Gość',account_free:'Konto — bezpłatne',account_7d:'Konto — dostęp 7 dni'};
    renderRows($('aoc-history'),d.events,[
      {title:'Data',view:x=>date(x.created_at)},
      {title:'Użytkownik',view:x=>x.user_id ? (x.user_name||'Konto') : 'Gość bez konta'},
      {title:'Nazwa pliku',view:x=>x.file_name},
      {title:'Rodzaj',view:x=>audience[x.audience]||'—'},
      {title:'HTTP',view:x=>String(x.status_code)}
    ],'Nie odnotowano wydań plików dla wybranych filtrów.');
  }
  async function refresh() {
    const b=$('aoc-refresh'),s=$('aoc-status');
    b.disabled=true;s.textContent='Ładuję dane…';
    try { render(await retrieve());s.textContent='Zaktualizowano: '+new Date().toLocaleString('pl-PL'); }
    catch(e) { s.textContent='Błąd: '+e.message; }
    finally {b.disabled=false;}
  }
  function exportCsv() {
    if(!latest) return;
    const headers=['data_iso','uzytkownik','nazwa_pliku','rodzaj','status_http'];
    const csvCell=value=>'"'+String(value??'').replace(/"/g,'""').replace(/^[=+\-@]/,'\'$&')+'"';
    const data=latest.events.map(x=>[
      x.created_at,x.user_id?(x.user_name||'Konto'):'Gość',x.file_name,x.audience,x.status_code
    ]);
    const csv='\uFEFF'+[headers,...data].map(row=>row.map(csvCell).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=make('a');a.href=url;a.download='aio-pobrania-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function goTab(tab) {
    const button=document.querySelector('[data-admin-tab="'+tab+'"]');
    if(button && !button.hidden){button.click();document.querySelector('[data-community-admin]')?.scrollIntoView({behavior:'smooth',block:'start'});}
  }
  function boot() {
    if (!$('aio-owner-center') || !$('aio-owner-downloads')) return;
    document.querySelectorAll('[data-aoc-tab]').forEach(b=>b.addEventListener('click',()=>goTab(b.dataset.aocTab)));
    $('aoc-refresh').addEventListener('click',refresh);
    $('aoc-days').addEventListener('change',refresh);
    $('aoc-file').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();refresh();}});
    $('aoc-user').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();refresh();}});
    $('aoc-export').addEventListener('click',exportCsv);
    refresh(); // 401/403 leaves private sections hidden.
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
