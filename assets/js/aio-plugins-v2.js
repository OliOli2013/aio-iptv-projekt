(function(){
'use strict';
const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
const search=$('#pluginsV2Search');
const reset=$('#pluginsV2Reset');
const count=$('#pluginsV2Count');
const countMirror=$('#pluginsV2CountMirror');
const empty=$('#pluginsV2Empty');
let activeKind='';
let freeQuery='';
const DESC=[
  {re:/aio\s*panel/i, kind:'Narzędzia AIO', icon:'AP', desc:'Centrum instalacji i aktualizacji dla Enigma2. Ułatwia dostęp do list kanałów, piconów, narzędzi i dodatków AIO z poziomu samego tunera.', aio:true},
  {re:/simple\s*iptv\s*epg|iptv\s*epg/i, kind:'EPG / IPTV', icon:'EP', desc:'Dodaje i dopasowuje dane EPG dla list IPTV. Przydatna, gdy kanały internetowe nie pokazują programu lub opisów audycji.'},
  {re:/e2\s*security|aio\s*security/i, kind:'Bezpieczeństwo', icon:'SE', desc:'Wtyczka do zwiększenia bezpieczeństwa tunera Enigma2. Pomaga sprawdzić ustawienia dostępu i włącza dodatkową ochronę sieciową.', aio:true},
  {re:/tv\s*garden/i, kind:'TV / Webcams', icon:'TV', desc:'Służy do przeglądania kanałów telewizyjnych oraz kamer internetowych z różnych krajów i kategorii w jednej wtyczce.'},
  {re:/iptv\s*dream/i, kind:'IPTV', icon:'IP', desc:'Rozbudowana wtyczka IPTV do obsługi playlist, portali oraz dodatkowych funkcji związanych z odtwarzaniem i organizacją kanałów internetowych.', aio:true},
  {re:/xstreamity|xstremity/i, kind:'IPTV Xtream', icon:'XT', desc:'Wtyczka do obsługi usług opartych o Xtream Codes / XUI. Umożliwia wygodne zarządzanie kategoriami VOD, seriali i kanałów live.'},
  {re:/e2iplayer|iptvplayer/i, kind:'Multimedia / VOD', icon:'VO', desc:'Dostęp do serwisów VOD i materiałów online bezpośrednio z poziomu tunera. Przydatna do oglądania treści internetowych na Enigma2.'},
  {re:/cccam|icam|oscam|softcam/i, kind:'Cam / narzędzia', icon:'CA', desc:'Wtyczka lub narzędzie związane z konfiguracją CAM, iCAM lub dodatkowymi funkcjami wspierającymi środowisko tunera.'},
  {re:/skin|glass|jihad|aiohd|full\s*hd/i, kind:'Skins / wygląd', icon:'SK', desc:'Skin lub motyw graficzny zmieniający wygląd Enigma2 — układ ekranów, list kanałów, infobar i ogólną czytelność interfejsu.'},
  {re:/picon/i, kind:'Picony / grafika', icon:'PI', desc:'Pakiet lub narzędzie związane z piconami, czyli ikonami kanałów wyświetlanymi na liście i infobarze.'},
  {re:/bouquet|lista|channel\s*editor|channel/i, kind:'Listy kanałów', icon:'LI', desc:'Narzędzie związane z listami kanałów, bukietami albo wygodniejszym porządkowaniem i aktualizacją kanałów.'},
  {re:/weather|pogod/i, kind:'Informacje', icon:'IN', desc:'Dodatek informacyjny rozszerzający Enigma2 o dodatkowe dane, np. pogodę lub inne treści pomocnicze.'}
];
function infer(title, text){
  const hay=(title+' '+text).toLowerCase();
  for(const x of DESC){ if(x.re.test(hay)) return x; }
  return {kind:'Wtyczka Enigma2', icon:'PL', desc:'Wtyczka dla Enigma2. Otwórz kartę, aby sprawdzić szczegóły działania, zgodność z systemem i sposób instalacji.', aio:/aio/i.test(title)};
}
function getCards(){
  const root=$('main')||document.body;
  const selectors=['[data-plugin-card]','.plugin-card','.download-card','.choice-card','.project-card','.module .card'];
  const found=[]; const seen=new Set();
  selectors.forEach(sel=>{
    $$(sel,root).forEach(el=>{
      if(seen.has(el)) return;
      if(el.closest('.plugins-v2-hero,.plugins-v2-helpbar')) return;
      const heading=$('h3,h2,strong',el);
      if(!heading) return;
      const text=el.textContent||'';
      if(text.trim().length<20) return;
      seen.add(el); found.push(el);
    });
  });
  return found;
}
const cards=getCards();
if(!cards.length) return;
function annotate(){
  cards.forEach(card=>{
    card.classList.add('plugin-v2-target');
    const titleNode=$('h3,h2,strong',card);
    const title=(titleNode?.textContent||'').trim();
    const info=infer(title, card.textContent||'');
    card.dataset.pluginKind=info.kind;
    card.dataset.pluginSearch=(title+' '+info.kind+' '+info.desc+' '+card.textContent).toLowerCase();
    if(!$('.plugin-v2-mini',card)){
      const box=document.createElement('div');
      box.className='plugin-v2-mini';
      box.innerHTML=`<div class="plugin-v2-icon">${info.icon}</div><div class="plugin-v2-mini-text"><strong>${info.kind}</strong><span>${info.aio?'PROJEKT AIO':'Wtyczka / dodatek'}</span></div>`;
      const before = titleNode.closest('header') || titleNode.parentElement || card;
      before.insertBefore(box, before.firstChild);
    }
    if(!$('.plugin-v2-summary',card)){
      const summary=document.createElement('div');
      summary.className='plugin-v2-summary';
      summary.textContent=info.desc;
      const ref=titleNode.closest('header') || titleNode.parentElement || card.firstChild;
      if(ref && ref.nextSibling){ ref.parentNode.insertBefore(summary, ref.nextSibling); }
      else { card.appendChild(summary); }
    }
    if(!$('.plugin-v2-tags',card)){
      const tags=document.createElement('div');
      tags.className='plugin-v2-tags';
      const items=[{cls:'kind',label:info.kind}];
      if(info.aio) items.push({cls:'aio',label:'Projekt AIO'});
      if(/python\s*3|py3/i.test(card.textContent)) items.push({cls:'py',label:'Python 3'});
      if(/python\s*2|py2/i.test(card.textContent)) items.push({cls:'py',label:'Python 2'});
      tags.innerHTML=items.map(t=>`<span class="plugin-v2-tag ${t.cls}">${t.label}</span>`).join('');
      const sum=$('.plugin-v2-summary',card);
      if(sum && sum.nextSibling) sum.parentNode.insertBefore(tags, sum.nextSibling); else card.appendChild(tags);
    }
  });
}
function applyFilter(){
  const q=(freeQuery||'').toLowerCase().trim();
  let visible=0;
  cards.forEach(card=>{
    const hay=card.dataset.pluginSearch||'';
    const matchQuery=!q || q.split(/\s+/).every(t=>hay.includes(t));
    const matchKind=!activeKind || (card.dataset.pluginKind||'').toLowerCase()===activeKind.toLowerCase();
    const show=matchQuery && matchKind;
    card.classList.toggle('plugin-v2-hidden', !show);
    if(show) visible++;
  });
  if(count) count.textContent=String(visible);
  if(countMirror) countMirror.textContent=String(visible);
  if(empty) empty.classList.toggle('is-visible', visible===0);
  $$('[data-pv2-kind]').forEach(b=>b.classList.toggle('is-active', b.dataset.pv2Kind===activeKind));
}
annotate();
search?.addEventListener('input',()=>{ freeQuery=search.value||''; applyFilter(); });
reset?.addEventListener('click',()=>{ freeQuery=''; activeKind=''; if(search) search.value=''; applyFilter(); });
$$('[data-pv2-kind]').forEach(btn=>btn.addEventListener('click',()=>{ activeKind = activeKind===btn.dataset.pv2Kind ? '' : btn.dataset.pv2Kind; applyFilter(); }));
$('#pluginsV2ShowCatalog')?.addEventListener('click',()=>{ (cards[0]||document.querySelector('main')).scrollIntoView({behavior:'smooth',block:'start'}); });
$('#pluginsV2OnlyAIO')?.addEventListener('click',()=>{ freeQuery='AIO'; if(search) search.value='AIO'; activeKind=''; applyFilter(); });
applyFilter();
})();
