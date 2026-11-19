/* AIO Social: optional config/status and OAuth start (browser POST only). */
import {socialConfig,getSocialStatus,startSocial,apiError} from '../_aio_social_v1.js';
export async function onRequestGet({request,env}){
  try{return new Response(JSON.stringify(new URL(request.url).searchParams.get('view')==='status'
    ?await getSocialStatus(request,env):socialConfig(env)),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }catch(e){console.error('AIO Social status',String(e?.code||e?.status||'ERROR'));return apiError(e);}
}
export async function onRequestPost({request,env}){
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return apiError({status:415,message:'Wymagany JSON.'});
  try{
    const body=await request.json().catch(()=>({}));
    const result=await startSocial(request,env,body);
    const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    headers.append('Set-Cookie',result.stateCookie);
    return new Response(JSON.stringify({ok:true,url:result.url}),{status:200,headers});
  }catch(e){console.error('AIO Social start',String(e?.code||e?.status||'ERROR'));return apiError(e);}
}
