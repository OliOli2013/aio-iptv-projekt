import {speedConfig} from '../_aio_download_speed_v1.js';
export async function onRequestGet({env}){
  try{const c=await speedConfig(env);return Response.json({ok:true,enabled:c.enabled,kbps:c.kbps},{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
