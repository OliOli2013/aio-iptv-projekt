import {requireAdmin,json} from '../_community.js';
import {speedConfig,saveSpeedConfig} from '../_aio_download_speed_v1.js';
const out=(obj,status=200)=>json(obj,status,{'cache-control':'private, no-store'});
const failed=e=>out({ok:false,error:'Nie można odczytać lub zapisać ustawień prędkości.'},[401,403].includes(e?.status)?e.status:503);
export async function onRequestGet({request,env}){try{await requireAdmin(request,env,true);return out({ok:true,...await speedConfig(env)});}catch(e){return failed(e);}}
export async function onRequestPost({request,env}){
  if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return out({ok:false,error:'Niedozwolone źródło żądania.'},403);
  try{await requireAdmin(request,env,true);
    if(!(request.headers.get('content-type')||'').includes('application/json'))return out({ok:false,error:'Wymagany JSON.'},415);
    const b=await request.json().catch(()=>null);
    if(!b||typeof b.enabled!=='boolean'||!Number.isInteger(b.kbps)||b.kbps<5||b.kbps>10000)return out({ok:false,error:'Podaj prędkość 5–10000 KB/s.'},400);
    return out({ok:true,...await saveSpeedConfig(env,b.enabled,b.kbps)});
  }catch(e){return failed(e);}
}
