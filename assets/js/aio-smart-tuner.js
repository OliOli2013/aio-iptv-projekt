/* AIO Smart Tuner V1 — public, client-side project selector. No backend writes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('stForm')) return;
  const engine = window.AIOSmartTunerCore;
  const PROFILE_KEY = 'aio_tuner_profile_v1';
  const categories = {plugins:'Wtyczka Enigma2', skins:'Skórka', lists:'Listy kanałów', systems:'System', companion:'Aplikacja dodatkowa'};
  let tuners = [], projects = [], rules = {}, chosen = {}, ready = false;
  let hasResults = false;
  function safeRead() { try { const p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}'); return p && typeof p==='object' && !Array.isArray(p)?p:{}; }catch(_){return {};} }
  const esc = engine ? engine.escapes : (v=>String(v||''));
  function readForm() {
    return {
      model:$('stModel').value,system:$('stSystem').value,
      systemVersion:$('stVersion').value.trim(),python:$('stPython').value,
      satellites:$('stSatellites').value
    };
  }
  function say(msg, error=false){const el=$('stMessage');el.textContent=msg;el.style.color=error?'#ffadad':'#9bffcc';}
  function makeOption(value,label,selected){const o=document.createElement('option');o.value=value;o.textContent=label;if(value===selected)o.selected=true;return o;}
  function populateModels(search='') {
    const selected=$('stModel').value || chosen.model || '';
    const query=engine.normalize(search);
    const groups = new Map();
    for(const t of tuners){
      const val=String(t.brand||'')+' '+String(t.model||'');
      if(query && !engine.normalize(val).includes(query))continue;
      const brand=String(t.brand||'Inne');
      if(!groups.has(brand)) groups.set(brand,[]);
      groups.get(brand).push({name:val.trim(),tuner:t});
    }
    const field=$('stModel');field.replaceChildren(makeOption('','Wybierz model tunera',selected));
    for(const brand of [...groups.keys()].sort((a,b)=>a.localeCompare(b,'pl'))){
      const group=document.createElement('optgroup');group.label=brand;
      for(const row of groups.get(brand).sort((a,b)=>a.name.localeCompare(b.name,'pl'))){
        group.appendChild(makeOption(row.name,row.name,selected));
      }
      field.appendChild(group);
    }
    if(selected && ![...field.options].some(o=>o.value===selected)){
      field.appendChild(makeOption(selected,selected+' (zapisany / spoza filtra)',selected));
    }
    $('stModelSearch').setAttribute('aria-label','Wyszukiwanie: '+(groups.size?'wyświetlono pasujące modele':'nie znaleziono modelu'));
  }
  function assignValue(element,value){
    const el=$(element);if(!el || !value)return;
    if(el.tagName==='SELECT' && ![...el.options].some(o=>o.value===value))el.add(makeOption(value,value,false));
    el.value=value;
  }
  function fill(p){
    assignValue('stSystem',p.system);
    assignValue('stVersion',p.systemVersion);
    assignValue('stPython',p.python);
    assignValue('stSatellites',p.satellites);
  }
  function modelRecord(){return tuners.find(t=>`${t.brand||''} ${t.model||''}`.trim()===$('stModel').value);}
  function hardware(){
    const box=$('stHardware'),t=modelRecord();
    if(!t){box.innerHTML='<p class="st-muted">'+($('stModel').value?'Model nie ma potwierdzonych danych w katalogu AIO. Zweryfikuj oznaczenie urządzenia.':'Wybierz model tunera, aby zobaczyć dane sprzętowe.')+'</p>';return;}
    const entries=[['Model',`${t.brand||''} ${t.model||''}`.trim()],['CPU',t.cpu],['RAM',t.ram],['Flash',t.flash],['Rozdzielczość',t.resolution]];
    box.innerHTML=entries.filter(x=>x[1]).map(([name,val])=>`<div class="st-spec"><span>${esc(name)}</span><strong>${esc(val)}</strong></div>`).join('')+
      '<p class="st-muted">Dane informacyjne katalogu AIO. Dokładny model i wersję sprzętową sprawdź przed flashowaniem.</p>';
  }
  function actionLinks(p,r){
    const url=String(p.page||'');
    const safe=/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.html$/.test(url);
    if(!safe)return '';
    const primary=`<a href="${esc(url)}">Opis i wymagania →</a>`;
    if(r.group==='systems'||r.group==='lists')return primary;
    return primary+`<a href="downloads.html?q=${encodeURIComponent(p.name)}">Znajdź pliki ↗</a>`;
  }
  function render(){
    if(!ready || !hasResults)return;
    const p=readForm();
    const rows=engine.select(projects,rules,p,$('stCategory').value,$('stConfidence').value,$('stProjectSearch').value);
    $('stCount').textContent=String(rows.length);
    $('stResultsSubtitle').textContent=`${p.model||'Nie wybrano tunera'} • ${p.system||'system nieznany'} ${p.systemVersion||''} • ${p.python||'Python nieznany'}${p.satellites?' • '+p.satellites:''}`;
    $('stResults').innerHTML=rows.map(({project:r,rule, evaluation:e})=>{
      const extra=e.notes.filter(Boolean).slice(0,3);
      return `<article class="st-card is-${esc(e.state)}"><div class="st-card-top"><span class="st-kind">${esc(categories[rule.group]||'Projekt AIO')}</span><span class="st-state is-${esc(e.state)}">${esc(e.label)}</span></div>`+
        `<h3>${esc(r.name)} <small>${esc(r.version||'')}</small></h3>`+
        `<p>${esc(r.summary||'Sprawdź informacje na stronie projektu.')}</p>`+
        (extra.length?`<ul>${extra.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'')+
        `<div class="st-card-actions">${actionLinks(r,rule)}</div></article>`;
    }).join('')||'<div class="st-placeholder">Brak wyników dla wybranych filtrów. Zmień kategorię lub wyszukiwane słowo.</div>';
  }
  function update(allowAuto=false){
    hardware();
    if(hasResults || allowAuto)render();
  }
  function save(){
    const p=readForm();
    if(!p.model){say('Wybierz model przed zapisaniem profilu.',true);return;}
    const current=safeRead();
    const data={...current,...p,updatedAt:new Date().toISOString()};
    try{
      localStorage.setItem(PROFILE_KEY,JSON.stringify(data));
      document.dispatchEvent(new CustomEvent('aio:profile-updated',{detail:data}));
      say('Zapisano profil w tej przeglądarce. Jest dostępny również w „Moim tunerze”.');
    }catch(_){say('Przeglądarka blokuje zapis lokalny. Dopasowanie działa nadal.',true);}
  }
  async function loadJson(path){const r=await fetch(path,{cache:'default',credentials:'same-origin'});if(!r.ok)throw Error('HTTP '+r.status+': '+path);return r.json();}
  function wire(){
    $('stModelSearch').addEventListener('input',e=>{populateModels(e.target.value);update();});
    $('stModel').addEventListener('change',()=>{chosen.model=$('stModel').value;update();});
    ['stSystem','stPython','stSatellites'].forEach(id=>$(id).addEventListener('change',update));
    $('stVersion').addEventListener('input',update);
    $('stForm').addEventListener('submit',e=>{
      e.preventDefault();if(!ready){say('Katalog jeszcze się ładuje.',true);return;}
      if(!$('stModel').value){say('Najpierw wybierz model tunera.',true);$('stModel').focus();return;}
      hasResults=true;chosen.model=$('stModel').value;render();say('Dopasowanie gotowe. Sprawdź oznaczenia i wymagania projektów.');
      $('stResultsSection').scrollIntoView({block:'start',behavior:'smooth'});
    });
    $('stSave').addEventListener('click',save);
    $('stClear').addEventListener('click',()=>{
      $('stForm').reset();chosen={};$('stModelSearch').value='';populateModels();hardware();
      hasResults=false;$('stCount').textContent='—';$('stResultsSubtitle').textContent='Wybierz tuner i kliknij „Dopasuj oprogramowanie”.';
      $('stResults').innerHTML='<div class="st-placeholder">Uzupełnij profil tunera, aby wyświetlić sugestie.</div>';say('Wyczyszczono formularz. Zapisany profil „Mój tuner” pozostaje bez zmian.');
    });
    ['stCategory','stConfidence'].forEach(id=>$(id).addEventListener('change',render));
    $('stProjectSearch').addEventListener('input',render);
  }
  async function init(){
    if(!engine){say('Nie udało się uruchomić mechanizmu zgodności.',true);return;}
    wire();
    $('stResults').innerHTML='<div class="st-placeholder">Wczytywanie katalogów AIO…</div>';
    try {
      const [t,p,c]=await Promise.all([loadJson('data/tuners.json'),loadJson('data/aio-catalog-v1.json').then(c=>{
        if(!c||!Array.isArray(c.projects))throw Error('Brak projektów');
        return c.projects;
      }).catch(()=>loadJson('data/projects.json')),loadJson('data/smart-tuner-compat.json')]);
      if(!Array.isArray(t.tuners)||!Array.isArray(p)||!c||!c.rules)throw Error('Nieprawidłowa struktura katalogu.');
      // The source catalog currently has repeated brand/model records.
      // Present each model once without modifying the shared tuner database.
      const modelNames=new Set();
      tuners=t.tuners.filter(x=>{
        if(!x||!x.brand||!x.model)return false;
        const key=engine.normalize(String(x.brand)+' '+String(x.model));
        if(modelNames.has(key))return false;
        modelNames.add(key);
        return true;
      });
      projects=p.filter(x=>x&&x.id&&x.name);
      rules=c.rules;
      chosen=safeRead();
      populateModels();
      fill(chosen);
      ready=true;
      hardware();
      $('stResults').innerHTML='<div class="st-placeholder">Wybierz model tunera, aby wyświetlić dopasowanie.</div>';
      if(chosen.model){hasResults=true;render();say('Wczytano zapisany profil z „Mojego tunera”.');}
      if(c.disclaimer)$('stDisclaimer').textContent=c.disclaimer;
      const count=document.querySelector('.st-hero-badges span');
      if(count)count.textContent='◉ '+tuners.length+' modeli w bazie AIO';
    }catch(err){
      console.error('[AIO Smart Tuner]',err);
      $('stResults').innerHTML='<div class="st-placeholder">Nie udało się wczytać katalogu. Spróbuj ponownie później.</div>';
      say('Nie można wczytać danych Smart Tunera. Sprawdź połączenie i pliki katalogu.',true);
      $('stModel').replaceChildren(makeOption('','Katalog niedostępny',''));
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
