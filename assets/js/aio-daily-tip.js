/* AIO: daily technical tip in homepage header. No API, no tracking. */
(function(){
  'use strict';
  if(!document.body || !document.body.classList.contains('aio-home-v2')) return;
  if(window.__aioDailyTipLoaded) return;
  window.__aioDailyTipLoaded=true;

  const row=document.querySelector('.site-header .brand-row');
  const support=row?.querySelector('.aio-h4-support');
  if(!row || !support || row.querySelector('.aio-h4-daily-tip')) return;

  const fallback=[
    {text:'Zrób kopię list kanałów przed aktualizacją.',href:'channel-lists.html',category:'Listy'},
    {text:'Nie działa wtyczka? Sprawdź zgodność systemu i Pythona.',href:'compatibility.html',category:'Wtyczki'},
    {text:'Po instalacji IPK często wystarczy restart GUI.',href:'help-restart-gui.html',category:'Enigma2'}
  ];

  function make(name,className,content){
    const node=document.createElement(name);
    if(className) node.className=className;
    if(content !== undefined) node.textContent=content;
    return node;
  }

  const tip=make('section','aio-h4-daily-tip');
  tip.setAttribute('aria-label','Porada dnia dotycząca Enigma2');
  const mark=make('span','aio-h4-tip-icon','✦');
  mark.setAttribute('aria-hidden','true');
  const content=make('div','aio-h4-tip-content');
  const head=make('span','aio-h4-tip-head');
  const label=make('strong','', 'PORADA DNIA');
  const day=make('small','aio-h4-tip-date');
  const link=make('a','aio-h4-tip-link');
  const category=make('span','aio-h4-tip-category');
  const text=make('span','aio-h4-tip-text','Ładowanie porady…');
  const arrow=make('span','aio-h4-tip-arrow','↗');
  arrow.setAttribute('aria-hidden','true');
  const next=make('button','aio-h4-tip-next','↻');
  next.type='button';
  next.title='Pokaż kolejną poradę';
  next.setAttribute('aria-label','Pokaż kolejną poradę');

  head.append(label,day);
  link.append(category,text,arrow);
  content.append(head,link);
  tip.append(mark,content,next);
  row.insertBefore(tip,support);

  const now=new Date();
  const localDay=Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/86400000);
  day.textContent=new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'short'}).format(now);

  let tips=fallback, index=localDay%tips.length;

  function show(){
    const item=tips[index];
    category.textContent=item.category || 'Enigma2';
    text.textContent=item.text;
    link.setAttribute('href',item.href);
    link.setAttribute('aria-label','Porada: '+item.text+' — otwórz więcej informacji');
  }

  next.addEventListener('click',function(){
    index=(index+1)%tips.length;
    show();
  });
  show();

  fetch('data/aio-daily-tips.json',{credentials:'same-origin'})
    .then(function(response){
      if(!response.ok) throw new Error('tips:'+response.status);
      return response.json();
    })
    .then(function(result){
      if(!result || !Array.isArray(result.tips)) return;
      const allowed=result.tips.filter(function(item){
        return item && typeof item.text==='string' &&
          item.text.length>12 && item.text.length<180 &&
          typeof item.href==='string' &&
          /^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/i.test(item.href) &&
          typeof item.category==='string' && item.category.length<=32;
      });
      if(!allowed.length) return;
      tips=allowed;
      index=localDay%tips.length;
      show();
    })
    .catch(function(){ /* The embedded fallback stays available offline. */ });
})();
