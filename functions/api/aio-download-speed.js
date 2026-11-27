import {speedConfig} from '../_aio_download_speed_v1.js';
import {sessionUser} from '../_aio_account_access.js';
export async function onRequestGet({request,env}){
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
  try{
    const personal=new URL(request.url).searchParams.get('personal')==='1';
    let id;
    if(personal){const user=await sessionUser(request,env);if(!user)return Response.json({ok:false},{status:401,headers});id=user.id;}
    const c=await speedConfig(env,id);
    return Response.json({ok:true,enabled:c.enabled,kbps:c.kbps,individual:c.individual||false,unlimited:c.kbps===null},{headers});
  }catch{return Response.json({ok:false},{status:503,headers});}
}
