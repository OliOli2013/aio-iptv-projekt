/* Public latest stable AIO Panel IPK. Counts handoffs, NOT completed transfers.
 * GET redirects directly to the official GitHub asset. HEAD/info never count.
 * This route must remain explicitly exempt from the suspended-session middleware.
 */
import {latestPanelIpk} from '../_aio_panel_public_v1.js';
import {recordPublicPanelHandoff,readPublicPanelCount} from '../_aio_owner_downloads.js';
const HEADERS={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
async function handle(context){
  const {request,env}=context;
  try{
    const latest=await latestPanelIpk(context);
    if(new URL(request.url).searchParams.get('info')==='1'){
      const count=await readPublicPanelCount(env).catch(()=>null);
      return json({ok:true,version:latest.version,file_name:latest.filename,
        public_handoffs:count,published_at:latest.published_at,
        message:'Publiczny AIO Panel IPK — bez konta i bez limitu. Licznik obejmuje przekazania do GitHub, nie ukończone pobrania.'});
    }
    if(request.method==='HEAD')return new Response(null,{status:302,headers:{...HEADERS,Location:latest.url}});
    // Never block the download because statistics could not be written.
    const audit=recordPublicPanelHandoff(env,latest.filename).catch(e=>
      console.error('[AIO Panel public handoff]',String(e?.message||e).slice(0,120)));
    if(typeof context.waitUntil==='function')context.waitUntil(audit);else await audit;
    return new Response(null,{status:302,headers:{...HEADERS,Location:latest.url}});
  }catch(e){
    console.error('[AIO Panel public IPK]',String(e?.message||e).slice(0,140));
    return request.method==='HEAD'
      ?new Response(null,{status:503,headers:HEADERS})
      :json({ok:false,error:'Nie można teraz pobrać najnowszego IPK. Spróbuj ponownie lub otwórz oficjalne wydania GitHub.',
        releases:'https://github.com/OliOli2013/PanelAIO-Plugin/releases'},503);
  }
}
export const onRequestGet=handle;
export const onRequestHead=handle;
