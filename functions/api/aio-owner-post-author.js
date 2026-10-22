/* AIO Owner Post Contact V1 — post-author identity accessible ONLY to verified owner. */
import {requireAdmin} from '../_community.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'vary':'Cookie'
};
const respond=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:HEADERS});
const ID=/^[a-f\d-]{36}$/i;

export async function onRequestGet({request,env}){
  try{
    // Do not trust any client-supplied user ID, username or email.
    await requireAdmin(request,env,true);
    if(!env.COMMUNITY_DB)return respond({ok:false,error:'Baza danych niedostępna.'},503);
    const url=new URL(request.url);
    const raw=url.searchParams.get('ids')||'';
    if(raw.length>4000)return respond({ok:false,error:'Zbyt długa lista identyfikatorów.'},400);
    const ids=[...new Set(raw.split(',').map(s=>s.trim()).filter(Boolean))];
    if(!ids.length||ids.length>100||ids.some(id=>!ID.test(id)))
      return respond({ok:false,error:'Podaj od 1 do 100 poprawnych identyfikatorów postów.'},400);
    const marks=ids.map(()=>'?').join(',');
    const q=`SELECT p.id AS post_id,p.title AS post_title,p.author_id AS user_id,
      COALESCE(pr.display_name,'Konto niedostępne') AS display_name,
      COALESCE(NULLIF(a.email,''),NULLIF(pr.email,''),'') AS email
      FROM community_posts p
      LEFT JOIN community_profiles pr ON pr.id=p.author_id
      LEFT JOIN community_auth a ON a.user_id=p.author_id
      WHERE p.id IN (${marks}) AND p.status IN ('pending','published')`;
    const result=await env.COMMUNITY_DB.prepare(q).bind(...ids).all();
    const rows=(result.results||[]).map(row=>({
      post_id:String(row.post_id),post_title:String(row.post_title||''),
      user_id:String(row.user_id||''),display_name:String(row.display_name||'Konto niedostępne'),
      email:String(row.email||'')
    }));
    return respond({ok:true,rows});
  }catch(e){
    const status=e?.status===401?401:e?.status===403?403:500;
    if(status===500)console.error('[AIO Owner Post Contact]',String(e?.message||e).slice(0,150));
    return respond({ok:false,error:status===500?'Nie udało się odczytać autora wpisu.':'Brak uprawnień.'},status);
  }
}
