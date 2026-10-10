
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
  {re:/aio\s*panel/i, kind:'Narzędzia AIO', icon:'AP', image:'pliki/aio-panel-17.0.0.png', desc:'Centrum instalacji i aktualizacji dla Enigma2. Ułatwia dostęp do list kanałów, piconów, narzędzi i dodatków AIO z poziomu samego tunera.', aio:true},
  {re:/simple\s*iptv\s*epg|iptv\s*epg/i, kind:'EPG / IPTV', icon:'EP', image:'pliki/simple-iptv-epg-3.1.0-r1.png', desc:'Dodaje i dopasowuje dane EPG dla list IPTV. Przydatna, gdy kanały internetowe nie pokazują programu lub opisów audycji.', aio:true},
  {re:/e2\s*security|aio\s*security/i, kind:'Bezpieczeństwo', icon:'SE', image:'pliki/e2-security-interface-1.1.0.jpg', desc:'Wtyczka do zwiększenia bezpieczeństwa tunera Enigma2. Pomaga sprawdzić ustawienia dostępu i włącza dodatkową ochronę sieciową.', aio:true},
  {re:/e2\s*doctor/i, kind:'Diagnostyka', icon:'ED', image:'pliki/e2-doctor-2.3-main.png', desc:'Centrum diagnostyki i bezpiecznej naprawy Enigma2. Pomaga ocenić stan tunera i znaleźć typowe problemy systemowe.', aio:true},
  {re:/pp\s*channel\s*sync/i, kind:'Listy kanałów', icon:'CS', image:'pliki/pp-channel-sync-2.1.1-screen.png', desc:'Synchronizacja i porządkowanie list kanałów Enigma2 z obsługą różnych formatów lamedb i bezpiecznym rollbackiem.', aio:true},
  {re:/iptv\s*dream/i, kind:'IPTV', icon:'IP', image:'pliki/iptv-dream-8.0.1.png', desc:'Rozbudowana wtyczka IPTV do obsługi M3U, Xtream i MAC/Stalker oraz eksportu kanałów do bukietów Enigma2.', aio:true},
  {re:/neoradio/i, kind:'Radio / multimedia', icon:'NR', image:'pliki/neoradio-3.0.0-screen.jpg', desc:'Radio internetowe dla Enigma2 z Radio-Browser, RDS/ICY, cache grafik i nowym interfejsem AIO.', aio:true},
  {re:/opencamview/i, kind:'Kamery IP', icon:'CV', image:'pliki/1.png', desc:'Podgląd kamer IP / RTSP bezpośrednio na tunerze Enigma2.'},
  {re:/dreamosatx\s*signal/i, kind:'Sygnał SAT', icon:'DS', image:'pliki/dreamosatx-signal-2.0-pl.jpg', desc:'Narzędzie do monitorowania sygnału, transponderów i ustawiania anteny / obrotnicy.'},
  {re:/nagrania\s*on\s*demand/i, kind:'Multimedia / VOD', icon:'ND', image:'pliki/nagrania-on-demand-3.0.0-main.png', desc:'Obsługa biblioteki nagrań i materiałów na HDD/USB, EPG, timerów i plików Enigma2.', aio:true},
  {re:/picon\s*updater/i, kind:'Picony / grafika', icon:'PI', image:'pliki/logo.png', logo:true, desc:'Pobieranie i aktualizacja piconów oraz szybkie wdrożenie ich do Enigma2.'},
  {re:/myupdater/i, kind:'Updater', icon:'MU', image:'pliki/logo.png', logo:true, desc:'Updater list kanałów, piconów, softcamów i podstawowych narzędzi serwisowych.'},
  {re:/skin|glass|jihad|aiohd|full\s*hd/i, kind:'Skins / wygląd', icon:'SK', image:'pliki/aiohd-next-3.2.1-channel-list.jpg', desc:'Skin lub motyw graficzny zmieniający wygląd Enigma2 — listy kanałów, InfoBar, EPG i ogólną czytelność interfejsu.', aio:true},
  {re:/dodatki\s*systemowe/i, kind:'Dodatki systemowe', icon:'DS', image:'pliki/logo.png', logo:true, desc:'Pakiet dodatkowych narzędzi systemowych, m.in. StreamlinkProxy, ServiceApp i SoftCam Feed.'},
  {re:/tv\s*garden/i, kind:'TV / Webcams', icon:'TV', image:'pliki/logo.png', logo:true, desc:'Kanały telewizyjne i kamery internetowe z różnych krajów i kategorii w jednej wtyczce.'},
  {re:/xstreamity|xstremity/i, kind:'IPTV Xtream', icon:'XT', image:'pliki/logo.png', logo:true, desc:'Obsługa usług opartych o Xtream Codes / XUI z kategoriami LIVE, VOD i seriali.'},
  {re:/e2iplayer|iptvplayer/i, kind:'Multimedia / VOD', icon:'VO', image:'pliki/logo.png', logo:true, desc:'Dostęp do serwisów VOD i materiałów online bezpośrednio z poziomu tunera Enigma2.'},
  {re:/cccam|icam|oscam|softcam/i, kind:'Cam / narzędzia', icon:'CA', image:'pliki/logo.png', logo:true, desc:'Narzędzie związane z CAM, iCAM, OSCam lub dodatkowymi funkcjami środowiska tunera.'},
  {re:/picon/i, kind:'Picony / grafika', icon:'PI', image:'pliki/logo.png', logo:true, desc:'Pakiet lub narzędzie związane z piconami, czyli ikonami kanałów.'},
  {re:/bouquet|lista|channel\s*editor|channel/i, kind:'Listy kanałów', icon:'LI', image:'pliki/logo.png', logo:true, desc:'Narzędzie związane z listami kanałów, bukietami i ich aktualizacją.'}
];

function infer(title,text){
  const hay=(title+' '+text).toLowerCase();
  for(const x of DESC){ if(x.re.test(hay)) return x; }
  return {
    kind:'Wtyczka Enigma2',
    icon:'PL',
    image:'pliki/logo.png',
    logo:true,
    desc:'Wtyczka dla Enigma2. Otwórz kartę, aby sprawdzić szczegóły działania, zgodność i sposób instalacji.',
    aio:/aio/i.test(title)
  };
}

function getCards(){
  const root=$('main')||document.body;
  const selectors=['[data-plugin-card]','.plugin-card','.download-card','.choice-card','.project-card','.module .card'];
  const found=[];
  const seen=new Set();
  selectors.forEach(sel=>{
    $$(sel,root).forEach(el=>{
      if(seen.has(el)) return;
      if(el.closest('.plugins-v2-hero,.plugins-v2-helpbar')) return;
      const heading=$('h3,h2,strong',el);
      if(!heading) return;
      const text=el.textContent||'';
      if(text.trim().length<20) return;
      seen.add(el);
      found.push(el);
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
    const info=infer(title,card.textContent||'');

    card.dataset.pluginKind=info.kind;
    card.dataset.pluginSearch=(title+' '+info.kind+' '+info.desc+' '+card.textContent).toLowerCase();

    if(!$('.plugin-v2-thumb',card)){
      const thumb=document.createElement('div');
      thumb.className='plugin-v2-thumb'+(info.logo?' is-logo':'');
      const img=document.createElement('img');
      img.src=info.image;
      img.alt=title ? `${title} — podgląd` : 'Podgląd wtyczki';
      img.loading='lazy';
      img.decoding='async';
      img.addEventListener('error',()=>{
        thumb.classList.add('is-logo');
        if(img.src.indexOf('/pliki/logo.png')===-1) img.src='pliki/logo.png';
      },{once:true});
      thumb.appendChild(img);
      card.insertBefore(thumb,card.firstChild);
    }

    if(!$('.plugin-v2-mini',card)){
      const box=document.createElement('div');
      box.className='plugin-v2-mini';
      box.innerHTML=`<div class="plugin-v2-icon">${info.icon}</div><div class="plugin-v2-mini-text"><strong>${info.kind}</strong><span>${info.aio?'PROJEKT AIO':'Wtyczka / dodatek'}</span></div>`;
      const before=titleNode.closest('header')||titleNode.parentElement||card;
      before.insertBefore(box,before.firstChild);
    }

    if(!$('.plugin-v2-summary',card)){
      const existingDescription=$('p',card);
      if(!existingDescription || (existingDescription.textContent||'').trim().length<20){
        const summary=document.createElement('div');
        summary.className='plugin-v2-summary';
        summary.textContent=info.desc;
        card.appendChild(summary);
      }
    }

    if(!$('.plugin-v2-tags',card)){
      const tags=document.createElement('div');
      tags.className='plugin-v2-tags';
      const items=[{cls:'kind',label:info.kind}];
      if(info.aio) items.push({cls:'aio',label:'Projekt AIO'});
      if(/python\s*3|py3/i.test(card.textContent)) items.push({cls:'py',label:'Python 3'});
      if(/python\s*2|py2/i.test(card.textContent)) items.push({cls:'py',label:'Python 2'});
      tags.innerHTML=items.map(t=>`<span class="plugin-v2-tag ${t.cls}">${t.label}</span>`).join('');
      card.appendChild(tags);
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
    card.classList.toggle('plugin-v2-hidden',!show);
    if(show) visible++;
  });
  if(count) count.textContent=String(visible);
  if(countMirror) countMirror.textContent=String(visible);
  if(empty) empty.classList.toggle('is-visible',visible===0);
  $$('[data-pv2-kind]').forEach(b=>b.classList.toggle('is-active',b.dataset.pv2Kind===activeKind));
}

annotate();

search?.addEventListener('input',()=>{
  freeQuery=search.value||'';
  applyFilter();
});
reset?.addEventListener('click',()=>{
  freeQuery='';
  activeKind='';
  if(search) search.value='';
  applyFilter();
});
$$('[data-pv2-kind]').forEach(btn=>btn.addEventListener('click',()=>{
  activeKind=activeKind===btn.dataset.pv2Kind?'':btn.dataset.pv2Kind;
  applyFilter();
}));
$('#pluginsV2ShowCatalog')?.addEventListener('click',()=>{
  (cards[0]||document.querySelector('main')).scrollIntoView({behavior:'smooth',block:'start'});
});
$('#pluginsV2OnlyAIO')?.addEventListener('click',()=>{
  freeQuery='AIO';
  if(search) search.value='AIO';
  activeKind='';
  applyFilter();
});

applyFilter();
})();
