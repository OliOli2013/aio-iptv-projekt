/* AIO Panel public IPK: latest standard stable GitHub release only.
 * No credentials or account status required; never grant general AIO access.
 */
const API='https://api.github.com/repos/OliOli2013/PanelAIO-Plugin/releases/latest';
const LIST_API='https://api.github.com/repos/OliOli2013/PanelAIO-Plugin/releases?per_page=15';
const CACHE_KEY='https://aio-iptv-projekt.pages.dev/__cache/aio-panel-latest-ipk-v1';
const TTL=300000; // Changes in GitHub release metadata appear within five minutes.
let remembered=null;

export const PUBLIC_IPK_PATH='/api/aio-panel-ipk';
const BASENAME=/^enigma2-plugin-extensions-panelaio_([0-9][0-9A-Za-z.+-]*)_all\.ipk$/i;
export function isAioPanelIpkAlias(path){
  if(typeof path!=='string')return false;
  const m=/^\/pliki\/enigma2-plugin-extensions-panelaio_([0-9][0-9A-Za-z.+-]*)_all\.ipk$/i.exec(path);
  return !!(m&&!/hds|satelit|test|beta|rc/i.test(m[1]));
}
export function isOfficialAioPanelIpkUrl(raw,siteOrigin){
  let u;try{u=new URL(raw);}catch(_){return false;}
  if(siteOrigin&&u.origin===siteOrigin)return u.pathname===PUBLIC_IPK_PATH||isAioPanelIpkAlias(u.pathname);
  if(u.protocol!=='https:'||u.hostname.toLowerCase()!=='github.com'||u.username||u.password)return false;
  let parts;try{parts=decodeURIComponent(u.pathname).split('/');}catch(_){return false;}
  const m=parts.length===7&&BASENAME.exec(parts[6]);
  return !!(parts[0]===''&&parts[1]==='OliOli2013'&&parts[2]==='PanelAIO-Plugin'&&
    parts[3]==='releases'&&parts[4]==='download'&&parts[5].length>0&&m&&
    !/hds|satelit|test|beta|rc/i.test(m[1]));
}
export function selectLatestStandardIpk(data){
  if(!data||data.draft||data.prerelease)throw new Error('Brak stabilnego wydania AIO Panel.');
  const tag=String(data.tag_name||'');
  const ver=tag.replace(/^v/i,'');
  if(!/^\d+\.\d+\.\d+(?:r\d+)?(?:[.+-][\da-zA-Z.-]+)?$/i.test(ver) || /hds|satelit|test|beta|rc/i.test(ver))
    throw new Error('Nieoczekiwany tag oficjalnego wydania IPK.');
  const name='enigma2-plugin-extensions-panelaio_'+ver+'_all.ipk';
  const item=Array.isArray(data.assets)?data.assets.find(x=>x.name===name && x.state!=='deleted'):null;
  if(!item||item.state&&item.state!=='uploaded')throw new Error('Najnowsze wydanie nie zawiera opublikowanego standardowego pakietu IPK.');
  const raw=String(item.browser_download_url||'');
  let url;try{url=new URL(raw);}catch(_){throw new Error('Niepoprawny link wydania AIO Panel.');}
  const parts=decodeURIComponent(url.pathname).split('/');
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||
    parts.length!==7||parts[0]!==''||parts[1]!=='OliOli2013'||parts[2]!=='PanelAIO-Plugin'||
    parts[3]!=='releases'||parts[4]!=='download'||parts[5]!==tag||parts[6]!==name){
      throw new Error('Nieautoryzowane źródło pakietu AIO Panel.');
  }
  if(url.search||url.hash)throw new Error('Link wydania ma nieoczekiwane parametry.');
  return {version:ver,filename:name,url:url.href,published_at:String(data.published_at||''),size:Number(item.size)||null};
}
async function readCache(){
  try{if(typeof caches!=='undefined'&&caches?.default){
    const response=await caches.default.match(new Request(CACHE_KEY));
    if(response?.ok){const obj=await response.json();if(obj?.url&&obj.version)return obj;}
  }}catch(_){/* Cache API is optional and does not grant a fallback URL. */}
  return null;
}
function storeCache(item,context){
  try{if(typeof caches==='undefined'||!caches?.default)return;
    const write=caches.default.put(new Request(CACHE_KEY),new Response(JSON.stringify(item),{
      headers:{'content-type':'application/json','cache-control':'public, max-age=300'}})).catch(()=>{});
    if(typeof context?.waitUntil==='function')context.waitUntil(write);
  }catch(_){/* Download flow is independent of cache storage. */}
}
export async function latestPanelIpk(context){
  if(remembered&&Date.now()<remembered.expires)return remembered.value;
  const cached=await readCache();if(cached){remembered={value:cached,expires:Date.now()+15000};return cached;}
  const github=async url=>{
    const response=await fetch(url,{headers:{'Accept':'application/vnd.github+json','User-Agent':'AIO-TunerHub-Public-IPK'},
      cf:{cacheTtl:300,cacheEverything:true}});
    if(!response.ok)throw new Error('Oficjalny GitHub Releases jest chwilowo niedostępny.');
    return response.json();
  };
  const latest=await github(API);
  let item;
  try{item=selectLatestStandardIpk(latest);}
  catch(_){
    // A stable release might publish DEB first or be a special HD Satelit build.
    // Fall back ONLY to the newest stable release with a canonical standard IPK.
    const releases=await github(LIST_API);
    if(!Array.isArray(releases))throw new Error('Nieprawidłowy rejestr wydań AIO Panel.');
    for(const release of releases){
      try{item=selectLatestStandardIpk(release);break;}catch(_){/* try older standard release */}
    }
    if(!item)throw new Error('Brak oficjalnego standardowego pakietu IPK w wydaniach GitHub.');
  }
  remembered={value:item,expires:Date.now()+TTL};storeCache(item,context);return item;
}
