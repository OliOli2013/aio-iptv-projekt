/* AIO Team Online List Editor V1 — changes remain in browser; only optional local bridge receives credentials. */
(function(){
'use strict';
const C=window.AIOListCore, Zip=window.JSZip;
const MANIFEST='https://raw.githubusercontent.com/OliOli2013/PanelAIO-Lists/main/manifest.json';
const BASE='https://raw.githubusercontent.com/OliOli2013/PanelAIO-Lists/main/archives/';
const IDS=new Set(['polska_13e_aio_panel','polska_13e_19e_aio_panel','polska_13e_19e_16e_23e_aio_panel']);
const $=id=>document.getElementById(id);
const state={zip:null,originalFile:'',indexPath:'',indexText:'',prefix:'',bouquets:[],active:-1,activeChannel:-1,changes:0,page:0,filter:'',zipName:'',busy:false,managedFilenames:[]};
const PER_PAGE=90;
function setStatus(message,error){const el=$('leStatus');el.textContent=message;el.className='le-status'+(error?' is-error':' is-success');}
function setBusy(v){state.busy=v;for(const id of ['leLoad','leDownload','leSend'])$(id).disabled=v;}
function norm(s){return String(s||'').toLowerCase();}
function validFilename(f){return /^userbouquet\.[A-Za-z0-9_.-]+\.tv$/.test(f);}
function stamp(){const d=new Date(),s=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${s(d.getMonth()+1)}${s(d.getDate())}-${s(d.getHours())}${s(d.getMinutes())}`;}
async function fetchManifestList(id){
 const response=await fetch(MANIFEST,{cache:'no-store'});
 if(!response.ok)throw Error('Nie udało się odczytać manifestu AIO Team (HTTP '+response.status+').');
 const manifest=await response.json();if(!Array.isArray(manifest))throw Error('Nieprawidłowy manifest list.');
 const rec=manifest.find(x=>x.id===id && x.author==='AIO Team');
 if(!rec||!IDS.has(id))throw Error('Wybrana lista nie należy do 3 list AIO Team.');
 const address=new URL(rec.url);
 if(!['raw.githubusercontent.com','github.com'].includes(address.hostname)|| !/\/OliOli2013\/PanelAIO-Lists\//.test(address.pathname))throw Error('Nieprawidłowe źródło ZIP w manifeście.');
 const filename=decodeURIComponent(address.pathname.split('/').pop()||'');
 if(!/^[A-Za-z0-9_.-]+\.zip$/.test(filename))throw Error('Niedozwolona nazwa archiwum ZIP.');
 const url=BASE+encodeURIComponent(filename);
 return {rec,url,filename};
}
async function loadList(){
 const id=$('leList').value;setBusy(true);setStatus('Pobieram manifest i oficjalne archiwum AIO Team…');
 try{
  const {rec,url,filename}=await fetchManifestList(id);
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('Nie udało się pobrać archiwum ZIP ('+response.status+').');
  const data=await response.arrayBuffer();if(data.byteLength>38*1024*1024)throw Error('Archiwum przekracza bezpieczny limit 38 MB.');
  const z=await Zip.loadAsync(data,{checkCRC32:true});
  const files=Object.values(z.files).filter(f=>!f.dir);
  if(files.length>2000)throw Error('Zbyt wiele pozycji w archiwum.');
  for(const f of files){if(!C.safeZipPath(f.unsafeOriginalName||f.name))throw Error('Archiwum zawiera niedozwoloną ścieżkę.');}
  const indexes=files.filter(f=>f.name.endsWith('/bouquets.tv')||f.name==='bouquets.tv');
  if(indexes.length!==1)throw Error('Archiwum musi zawierać dokładnie jeden indeks bouquets.tv.');
  const index=indexes[0], prefix=index.name.slice(0,-'bouquets.tv'.length);
  const indexText=C.decodeText(await index.async('uint8array'));
  const ordered=Array.from(indexText.matchAll(/^#SERVICE[^\r\n]*FROM BOUQUET\s+"(userbouquet\.[^"/\\]+\.tv)"\s+ORDER BY bouquet/gm),x=>x[1]);
  const channels=files.filter(f=>f.name.startsWith(prefix) && validFilename(f.name.slice(prefix.length)) && f.name.slice(prefix.length).indexOf('/')<0);
  const byName=new Map(channels.map(f=>[f.name.slice(prefix.length),f]));
  for(const name of ordered){if(!byName.has(name))throw Error('Archiwum ma niekompletny indeks — brak pliku: '+name);}
  if(!channels.length||!ordered.length)throw Error('Brak list bukietów TV w archiwum.');
  // Only indexed TV bouquets are editable. Keep unindexed files (e.g. favourites) unchanged.
  const sequence=[...new Set(ordered)];
  const bouquets=[];
  for(const name of sequence){
    const file=byName.get(name);const bytes=await file.async('uint8array');
    if(bytes.length>8*1024*1024)throw Error('Zbyt duży bukiet: '+name);
    const b=C.parseBouquet(C.decodeText(bytes));
    if(b.entries.length>100000)throw Error('Zbyt wiele kanałów w '+name);
    bouquets.push({...b,filename:name,originalFilename:name,dirty:false});
  }
  state.zip=z;state.indexPath=index.name;state.indexText=indexText;state.prefix=prefix;state.bouquets=bouquets;state.active=0;state.activeChannel=-1;state.changes=0;state.page=0;state.filter='';state.originalFile=filename;
  state.managedFilenames=sequence.slice();
  state.zipName=filename.replace(/\.zip$/i,'')+'_EDYCJA_'+stamp()+'.zip';
  $('leSearch').value='';$('leNewRef').value='';$('leNewName').value='';$('leVersion').textContent=rec.name+' • '+(rec.version||'');
  $('leWorkspace').hidden=false;render();
  setStatus('Wczytano '+bouquets.length+' bukietów. Możesz rozpocząć edycję. Zmiany nie dotyczą oryginalnego archiwum.');
 }catch(e){setStatus('Błąd wczytywania: '+e.message,true);}finally{setBusy(false);}
}
function current(){return state.bouquets[state.active]||null;}
function selected(){const b=current();return b&&b.entries[state.activeChannel]||null;}
function mark(b){if(b)b.dirty=true;state.changes++;}
function render(){
 const count=state.bouquets.reduce((n,b)=>n+b.entries.length,0);
 $('leArchiveLabel').textContent='Źródło: '+state.originalFile;
 $('leBouquetCount').textContent=state.bouquets.length+' bukietów';$('leChannelCount').textContent=count+' pozycji';$('leChanges').textContent=state.changes?'Zmian: '+state.changes:'Brak zmian';
 const list=$('leBouquetList');list.replaceChildren();
 state.bouquets.forEach((b,i)=>{
  const wrap=document.createElement('div');wrap.className='le-bouquet-row'+(i===state.active?' is-active':'');wrap.setAttribute('role','option');wrap.setAttribute('aria-selected',String(i===state.active));
  const btn=document.createElement('button');btn.className='le-bouquet-select';btn.textContent=b.name;
  const small=document.createElement('small');small.textContent=b.entries.length+' pozycji';btn.appendChild(small);btn.onclick=()=>{state.active=i;state.activeChannel=-1;state.page=0;render()};
  const up=document.createElement('button');up.title='Przenieś bukiet wyżej';up.textContent='↑';up.disabled=i===0;up.onclick=()=>{[state.bouquets[i-1],state.bouquets[i]]=[state.bouquets[i],state.bouquets[i-1]];state.active=i-1;state.changes++;render();};
  const down=document.createElement('button');down.title='Przenieś bukiet niżej';down.textContent='↓';down.disabled=i===state.bouquets.length-1;down.onclick=()=>{[state.bouquets[i+1],state.bouquets[i]]=[state.bouquets[i],state.bouquets[i+1]];state.active=i+1;state.changes++;render();};
  wrap.append(btn,up,down);list.appendChild(wrap);
 });
 const b=current();$('leBouquetName').value=b?b.name:'';
 $('leChannelsTitle').textContent=b?b.name:'Kanały';$('leChannelInfo').textContent=b?b.entries.length+' pozycji':'';
 for(const id of ['leRenameBouquet','leCloneBouquet','leDeleteBouquet','leRenameChannel','leCopyChannel','leDeleteChannel','leMoveChannel','leAddChannel'])$(id).disabled=!b;
 const t=$('leTargetBouquet');t.replaceChildren();state.bouquets.forEach((it,i)=>{if(i!==state.active){const o=document.createElement('option');o.value=String(i);o.textContent=it.name;t.appendChild(o);}});
 $('leMoveChannel').disabled=!selected()||t.options.length===0;
 renderChannels();
}
function renderChannels(){
 const b=current(),list=$('leChannelList');list.replaceChildren();
 if(!b)return;
 const filtered=b.entries.map((e,i)=>({e,i})).filter(({e})=>!state.filter||norm(C.entryName(e)+' '+C.entryRef(e)).includes(state.filter));
 const pages=Math.max(1,Math.ceil(filtered.length/PER_PAGE));state.page=Math.max(0,Math.min(state.page,pages-1));
 $('lePage').textContent=`${state.page+1}/${pages} • ${filtered.length} wyników`;
 $('lePrev').disabled=state.page===0;$('leNext').disabled=state.page>=pages-1;
 const fragment=document.createDocumentFragment();
 filtered.slice(state.page*PER_PAGE,(state.page+1)*PER_PAGE).forEach(({e,i})=>{
  const row=document.createElement('div');row.className='le-channel-row'+(state.activeChannel===i?' is-active':'');
  const num=document.createElement('small');num.textContent=String(i+1);
  const choose=document.createElement('button');choose.type='button';choose.className='le-choose';choose.textContent=C.entryName(e);
  const ref=document.createElement('small');ref.textContent=C.entryRef(e);ref.title=C.entryRef(e);choose.appendChild(ref);
  choose.onclick=()=>{state.activeChannel=i;renderChannels();};
  const up=document.createElement('button');up.textContent='↑';up.title='Kanał wyżej';up.disabled=i===0;up.onclick=()=>{[b.entries[i-1],b.entries[i]]=[b.entries[i],b.entries[i-1]];state.activeChannel=i-1;mark(b);render();};
  const down=document.createElement('button');down.textContent='↓';down.title='Kanał niżej';down.disabled=i===b.entries.length-1;down.onclick=()=>{[b.entries[i+1],b.entries[i]]=[b.entries[i],b.entries[i+1]];state.activeChannel=i+1;mark(b);render();};
  row.append(num,choose,up,down);fragment.appendChild(row);
 });list.appendChild(fragment);
 const selectedEntry=selected();$('leChannelName').value=selectedEntry?C.entryName(selectedEntry):'';
 for(const id of ['leRenameChannel','leCopyChannel','leDeleteChannel'])$(id).disabled=!selectedEntry;
 $('leMoveChannel').disabled=!selectedEntry||$('leTargetBouquet').options.length===0;
}
function newName(){return 'userbouquet.aio_custom_'+Date.now()+'_'+Math.floor(Math.random()*99999)+'.tv';}
function guard(action){try{if(!state.zip)throw Error('Najpierw wczytaj listę.');action();}catch(e){setStatus(e.message,true);}}
function addBouquet(){guard(()=>{const name=prompt('Podaj nazwę nowego bukietu:','Mój bukiet');if(name===null)return;const clean=C.validName(name);if(!clean)throw Error('Nazwa bukietu nie może być pusta.');const b={name:clean,filename:newName(),originalFilename:null,prelude:['#NAME '+clean],entries:[],newline:'\n',trailing:true,dirty:true};state.bouquets.push(b);state.active=state.bouquets.length-1;state.activeChannel=-1;state.changes++;render();});}
function cloneBouquet(){guard(()=>{const b=current();const clean=C.validName(b.name+' (kopia)');const clone={...b,name:clean,filename:newName(),originalFilename:null,entries:b.entries.map(e=>({lines:e.lines.slice()})),prelude:b.prelude.slice(),dirty:true};state.bouquets.splice(state.active+1,0,clone);state.active++;state.activeChannel=-1;state.changes++;render();});}
function deleteBouquet(){guard(()=>{const b=current();if(!b)return;if(state.bouquets.length<=1)throw Error('Nie można usunąć ostatniego bukietu.');if(!confirm(`Usunąć bukiet „${b.name}” (${b.entries.length} pozycji) z eksportowanej listy?`))return;state.bouquets.splice(state.active,1);state.active=Math.min(state.active,state.bouquets.length-1);state.activeChannel=-1;state.changes++;render();});}
async function archiveBlob(){
 if(!state.zip)throw Error('Najpierw wczytaj listę AIO Team.');
 const clone=await Zip.loadAsync(await state.zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:4}}));
 const names=new Set(state.bouquets.map(b=>b.filename));
 for(const originalName of state.managedFilenames)if(!names.has(originalName))clone.remove(state.prefix+originalName);
 for(const b of state.bouquets)if(b.dirty)clone.file(state.prefix+b.filename,C.serializeBouquet(b));
 if(state.changes)clone.file(state.indexPath,C.serializeIndex(state.indexText,state.bouquets));
 return clone.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
}
async function download(){setBusy(true);try{const b=await archiveBlob();const url=URL.createObjectURL(b);const a=document.createElement('a');a.href=url;a.download=state.zipName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setStatus('Zapisano ZIP: '+state.zipName+' ('+(b.size/1024/1024).toFixed(2)+' MB).');}catch(e){setStatus(e.message,true);}finally{setBusy(false);}}
function bridgeHeaders(){const token=$('leBridgeToken').value.trim();if(!token)throw Error('Uruchom AIO List Bridge i wpisz kod wyświetlony w terminalu.');return {'X-AIO-Bridge-Token':token};}
function bridgeError(e){return `Lokalny most nie odpowiada (${e.message}). Upewnij się, że program jest uruchomiony na tym samym komputerze. Jeśli przeglądarka blokuje połączenie z 127.0.0.1, wybierz eksport ZIP.`;}
async function checkBridge(){try{const response=await fetch('http://127.0.0.1:8765/health',{headers:bridgeHeaders(),cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Kod mostu jest nieprawidłowy.');setStatus('Połączenie z lokalnym mostem AIO działa. Możesz wysłać listę na tuner.');}catch(e){setStatus(bridgeError(e),true);}}
function ipValid(ip){const x=ip.split('.').map(Number);return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)&&x.length===4&&x.every(v=>Number.isInteger(v)&&v>=0&&v<256)&&((x[0]===10)||(x[0]===172&&x[1]>=16&&x[1]<=31)||(x[0]===192&&x[1]===168));}
function blobBase64(blob){return blob.arrayBuffer().then(buffer=>{const a=new Uint8Array(buffer);let out='';for(let i=0;i<a.length;i+=32768)out+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(out);});}
async function send(){
 if(!state.zip){setStatus('Najpierw wczytaj i ewentualnie edytuj listę.',true);return;}
 const ip=$('leTunerIp').value.trim();if(!ipValid(ip)){setStatus('Podaj prywatny adres IPv4 tunera (np. 192.168.1.100).',true);return;}
 if(!$('leFtpConsent').checked){setStatus('Najpierw zaakceptuj ostrzeżenie o braku szyfrowania FTP.',true);return;}
 const port=Number($('leFtpPort').value);if(!Number.isInteger(port)||port<1||port>65535){setStatus('Nieprawidłowy port FTP.',true);return;}
 if(!confirm('Wysłać własną listę na '+ip+'? Most najpierw zapisze kopię zastępowanych plików tunera. Nie wykonuj tej operacji, jeśli nie znasz konfiguracji odbiornika.'))return;
 setBusy(true);setStatus('Przygotowuję ZIP i przekazuję go do lokalnego programu na komputerze…');
 try{
  const headers=bridgeHeaders();const file=await archiveBlob();if(file.size>28*1024*1024)throw Error('ZIP za duży do wysyłki mostem (28 MB). Zapisz go na komputerze.');
  const res=await fetch('http://127.0.0.1:8765/upload',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({ip,port,username:'root',password:$('lePassword').value,archive:await blobBase64(file)})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Nie udało się wysłać listy.');
  $('lePassword').value='';setStatus(`Gotowe. Wysłano ${data.uploaded} plików. Kopia zapasowa na komputerze: ${data.backup}. Uruchom ponownie GUI Enigma2.`);
 }catch(e){setStatus('Błąd wysyłki: '+e.message+'. Możesz zawsze pobrać ZIP.',true);}finally{setBusy(false);}
}
function bind(){
 if(!C||!Zip){setStatus('Nie udało się załadować biblioteki ZIP lub edytora. Odśwież stronę.',true);return;}
 const params=new URLSearchParams(location.search);if(IDS.has(params.get('list'))) $('leList').value=params.get('list');
 $('leLoad').onclick=loadList;$('leDownload').onclick=download;$('leCheckBridge').onclick=checkBridge;$('leSend').onclick=send;
 $('leAddBouquet').onclick=addBouquet;$('leCloneBouquet').onclick=cloneBouquet;$('leDeleteBouquet').onclick=deleteBouquet;
 $('leRenameBouquet').onclick=()=>guard(()=>{const b=current(),s=C.validName($('leBouquetName').value);if(!s)throw Error('Nazwa bukietu jest pusta.');b.name=s;mark(b);render();});
 $('leSearch').oninput=e=>{state.filter=norm(e.target.value.trim());state.page=0;renderChannels();};
 $('lePrev').onclick=()=>{state.page--;renderChannels();};$('leNext').onclick=()=>{state.page++;renderChannels();};
 $('leRenameChannel').onclick=()=>guard(()=>{const e=selected();if(!e)throw Error('Zaznacz kanał.');C.renameEntry(e,$('leChannelName').value);mark(current());render();});
 $('leCopyChannel').onclick=()=>guard(()=>{const e=selected(),b=current();if(!e)throw Error('Zaznacz kanał.');b.entries.splice(state.activeChannel+1,0,{lines:e.lines.slice()});mark(b);render();});
 $('leDeleteChannel').onclick=()=>guard(()=>{const e=selected(),b=current();if(!e)throw Error('Zaznacz kanał.');if(!confirm('Usunąć zaznaczony kanał z bukietu?'))return;b.entries.splice(state.activeChannel,1);state.activeChannel=-1;mark(b);render();});
 $('leMoveChannel').onclick=()=>guard(()=>{const e=selected(),a=current(),target=state.bouquets[Number($('leTargetBouquet').value)];if(!e||!target||target===a)throw Error('Zaznacz kanał i inny bukiet.');a.entries.splice(state.activeChannel,1);target.entries.push(e);mark(a);mark(target);state.activeChannel=-1;render();});
 $('leAddChannel').onclick=()=>guard(()=>{const b=current();const e=C.addEntry($('leNewRef').value,$('leNewName').value);b.entries.push(e);state.activeChannel=b.entries.length-1;$('leNewRef').value='';$('leNewName').value='';mark(b);render();});
 window.addEventListener('beforeunload',e=>{if(!state.changes)return;e.preventDefault();e.returnValue='';});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
