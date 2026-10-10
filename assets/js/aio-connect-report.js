(function(){
'use strict';

const $=s=>document.querySelector(s);
let cfg=null,reportData=null;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function config(){
  const r=await fetch('data/aio-connect-config.json?v=20261010-connectv2',{cache:'no-store'});
  if(!r.ok)throw new Error('Nie udało się odczytać konfiguracji AIO Connect.');
  const data=await r.json();
  if(!data.supabaseUrl||!data.anonKey||!data.functionName)throw new Error('Konfiguracja AIO Connect jest niepełna.');
  return data;
}

async function reportApi(payload){
  const url=String(cfg.supabaseUrl).replace(/\/+$/,'')+'/functions/v1/'+String(cfg.functionName||'aio-connect-report');
  const r=await fetch(url,{
    method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json','apikey':cfg.anonKey},
    body:JSON.stringify(payload)
  });
  const raw=await r.text();let data={};
  try{data=raw?JSON.parse(raw):{};}catch(_){data={error:raw};}
  if(!r.ok||data.error)throw new Error(data.error||('HTTP '+r.status));
  return data;
}

function showError(message){
  const status=$('#report-status');
  status.innerHTML='<div class="aio-report-error"><strong>Nie udało się otworzyć raportu.</strong><p>'+esc(message)+'</p></div>';
  $('#manual-report').hidden=false;
}

function updateCounters(){
  const desc=$('#problem-description')?.value||'';
  const report=$('#technical-report')?.value||'';
  if($('#connectDescCount'))$('#connectDescCount').textContent=desc.length.toLocaleString('pl-PL');
  if($('#connectReportCount'))$('#connectReportCount').textContent=report.length.toLocaleString('pl-PL');
}

function render(data){
  reportData=data;
  $('#report-status').hidden=true;
  $('#report-editor').hidden=false;

  const meta=data.meta||{};
  const pairs=[
    ['Kod urządzenia',meta.device||'—'],
    ['Tuner',meta.model||'—'],
    ['System',meta.system||'—'],
    ['Python',meta.python||'—'],
    ['Kondycja',meta.health!==''&&meta.health!=null?meta.health+'/100':'—']
  ];
  $('#report-summary').innerHTML=pairs.map(x=>'<div><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>').join('');
  $('#technical-report').value=data.report||'';
  if(meta.model)$('#report-title').value='Problem z '+meta.model+' — raport AIO Connect';

  const health=Number(meta.health);
  const healthEl=$('#connectHealth');
  if(healthEl){
    healthEl.textContent=Number.isFinite(health)?String(health)+'/100':'brak danych';
  }

  if(data.expiresAt){
    const d=new Date(data.expiresAt);
    const formatted=new Intl.DateTimeFormat('pl-PL',{dateStyle:'medium',timeStyle:'short'}).format(d);
    $('#report-expiry').textContent='Raport wygaśnie: '+formatted;
    if($('#connectExpiryText'))$('#connectExpiryText').textContent=formatted;
  }else{
    if($('#connectExpiryText'))$('#connectExpiryText').textContent='tryb ręczny / brak daty';
  }
  updateCounters();
}

async function load(){
  try{
    cfg=await config();
    const p=new URLSearchParams(location.search);
    const id=p.get('id'),token=p.get('token');

    if(!id||!token){
      const meta={
        device:p.get('device')||'',
        model:p.get('model')||'',
        system:p.get('system')||'',
        python:p.get('python')||'',
        health:p.get('health')||''
      };
      render({meta,report:'',expiresAt:null});
      $('#manual-report').hidden=false;
      return;
    }

    const data=await reportApi({action:'read',id,token});
    render(data);
  }catch(e){
    showError(e.message||e);
  }
}

async function copyReport(){
  const text=$('#technical-report').value;
  try{
    await navigator.clipboard.writeText(text);
    window.AIOCommunity&&AIOCommunity.showToast('Raport skopiowany.','success');
  }catch(_){
    $('#technical-report').select();
    document.execCommand('copy');
  }
}

function sanitizeReport(){
  const area=$('#technical-report');
  if(!area)return;
  let text=String(area.value||'');
  text=text
    .replace(/(password|passwd|pwd|token|apikey|api_key|secret)(\s*[:=]\s*)([^\s,;]+)/gi,'$1$2***')
    .replace(/(https?:\/\/)([^\s:@/]+):([^\s@/]+)@/gi,'$1***:***@')
    .replace(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/gi,'**:**:**:**:**:**')
    .replace(/\bC:\s+\S+\s+\S+\s+\S+\b/gi,'C: *** *** ***')
    .replace(/\b((?:\d{1,3}\.){3})\d{1,3}\b/g,'$1***');
  area.value=text;
  updateCounters();
  const C=window.AIOCommunity;
  if(C&&C.showToast)C.showToast('Dane wrażliwe zostały zamaskowane lokalnie.','success');
}

async function publish(){
  const C=window.AIOCommunity;
  if(!C||!C.ready){alert('Moduł Społeczności AIO jeszcze się ładuje.');return;}
  if(!C.user){C.openAuth('Zaloguj się, aby opublikować raport w Społeczności AIO.');return;}

  const title=$('#report-title').value.trim();
  const desc=$('#problem-description').value.trim();
  const report=$('#technical-report').value.trim();

  if(title.length<6){C.showToast('Uzupełnij tytuł zgłoszenia.','error');return;}
  if(desc.length<20){C.showToast('Opisz problem w co najmniej 20 znakach.','error');return;}

  const content='OPIS PROBLEMU\n'+desc+'\n\nRAPORT AIO CONNECT\n'+report;
  const btn=$('#publish-report');
  btn.disabled=true;
  btn.textContent='Publikowanie…';

  try{
    const result=await C.api('create_post',{
      title,
      content,
      category:'aio-panel',
      postType:'problem',
      official:false,
      attachments:[]
    });

    const msg=result&&result.status==='pending'
      ?'Zgłoszenie zapisano i przekazano do zatwierdzenia.'
      :'Zgłoszenie zostało opublikowane.';

    const link=result&&result.id
      ?'<p><a class="button primary" href="post.html?id='+encodeURIComponent(result.id)+'">Otwórz wpis</a></p>'
      :'';

    $('#report-editor').insertAdjacentHTML('afterbegin','<div class="aio-report-success"><strong>'+esc(msg)+'</strong>'+link+'</div>');
    C.showToast(msg,'success');
  }catch(e){
    C.showToast(C.friendlyError(e),'error');
  }finally{
    btn.disabled=false;
    btn.textContent='Opublikuj w Społeczności AIO';
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  load();
  $('#copy-report')?.addEventListener('click',copyReport);
  $('#publish-report')?.addEventListener('click',publish);
  $('#sanitize-report')?.addEventListener('click',sanitizeReport);
  $('#problem-description')?.addEventListener('input',updateCounters);
  $('#technical-report')?.addEventListener('input',updateCounters);
});
})();
