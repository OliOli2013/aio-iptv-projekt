/* AIO VPN Guard V1 — owner-only on-demand review. No account mutations beyond
 * acknowledgement of a review; never change bans, sessions, grants or quotas.
 */
import {requireAdmin} from '../_community.js';
import {vpnGuardDashboard,scanVpnAccounts,scanVpnOneAccount,markVpnReviewed} from '../_aio_vpn_guard_v1.js';
const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','vary':'Cookie'};
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:HEAD});
const error=(e)=>{
  const status=[400,401,403,404,409,429].includes(e?.status)?e.status:503;
  return reply({ok:false,error:status===503?'Weryfikacja jest tymczasowo niedostępna.':String(e?.message||'Brak uprawnień.').slice(0,180)},status);
};
function sameOrigin(request){
  const origin=request.headers.get('Origin');
  if(!origin||origin!==new URL(request.url).origin)return false;
  return request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
export async function onRequestGet({request,env}){
  try{await requireAdmin(request,env,true);return reply(await vpnGuardDashboard(env));}
  catch(e){return error(e);}
}
export async function onRequestPost({request,env}){
  try{
    const owner=await requireAdmin(request,env,true);
    if(!sameOrigin(request))return reply({ok:false,error:'Niedozwolona operacja.'},403);
    const raw=await request.text();
    if(raw.length>2048)return reply({ok:false,error:'Za duże żądanie.'},413);
    let body;try{body=JSON.parse(raw);}catch{return reply({ok:false,error:'Nieprawidłowe dane.'},400);}
    if(!body||typeof body!=='object')return reply({ok:false,error:'Nieprawidłowe dane.'},400);
    if(body.action==='scan'){
      if(!Number.isInteger(body.processed)||body.processed<0||body.processed>200000)
        return reply({ok:false,error:'Nieprawidłowa pozycja skanowania.'},400);
      const c=body.cursor;
      if(c!==null&&(typeof c!=='object'||Array.isArray(c)||
        !/^[0-9TtZz:. +\-]{10,45}$/.test(String(c.created_at||''))||
        !/^[a-zA-Z0-9-]{8,80}$/.test(String(c.id||''))))
        return reply({ok:false,error:'Nieprawidłowy kursor skanowania.'},400);
      return reply(await scanVpnAccounts(env,{cursor:c,processed:body.processed}));
    }
    if(body.action==='scan-one'){
      if(!/^[a-zA-Z0-9-]{8,80}$/.test(String(body.user_id||'')))return reply({ok:false,error:'Nieprawidłowe konto.'},400);
      return reply(await scanVpnOneAccount(env,body.user_id));
    }
    if(body.action==='review'){
      if(!/^[a-zA-Z0-9-]{8,80}$/.test(String(body.user_id||'')))return reply({ok:false,error:'Nieprawidłowe konto.'},400);
      return reply({ok:await markVpnReviewed(env,body.user_id,owner.user.id)});
    }
    return reply({ok:false,error:'Nieznana operacja.'},400);
  }catch(e){return error(e);}
}
