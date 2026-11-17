/* AIO Owner Unified Access V1.2 — search a single ordinary account by exact e-mail or ID.
 * Owner-only. Never search by display name or disclose data to public callers.
 */
import {requireAdmin,getOwnerId} from '../_community.js';
const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function onRequestGet({request,env}){
  try{
    const s=await requireAdmin(request,env,true);
    const owner=await getOwnerId(env);
    if(!owner||s.user.id!==owner||s.user.role!=='admin')return out({ok:false,error:'Dostęp wyłącznie dla właściciela.'},403);
    const query=String(new URL(request.url).searchParams.get('q')||'').trim();
    if(!query||query.length>254||(!UUID.test(query)&&!EMAIL.test(query)))return out({ok:false,error:'Podaj pełny adres e-mail lub identyfikator UUID konta. Nie wyszukujemy po nazwie użytkownika.'},400);
    const byId=UUID.test(query);
    const row=await env.COMMUNITY_DB.prepare(`SELECT p.id,p.role,p.display_name,a.email FROM community_profiles p
      JOIN community_auth a ON a.user_id=p.id
      WHERE ${byId?'p.id=?':'lower(trim(a.email))=?'} LIMIT 1`)
      .bind(byId?query:query.toLowerCase()).first();
    if(!row)return out({ok:false,error:'Nie znaleziono takiego konta.'},404);
    if(row.id===owner||row.role!=='user')return out({ok:false,error:'Konta właściciela ani kont uprzywilejowanych nie można odblokować w tym narzędziu.'},403);
    return out({ok:true,user:{id:row.id,name:row.display_name||'Użytkownik',email:row.email}});
  }catch(e){
    console.error('[AIO unified lookup]',String(e?.message||e).slice(0,120));
    return out({ok:false,error:'Nie można teraz sprawdzić konta. Spróbuj ponownie.'},503);
  }
}
