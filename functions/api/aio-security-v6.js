/* Owner-only V6 block registry and reversible, logged account decisions. */
import {json,requireAdmin,moderationLog} from '../_community.js';
import {ensureV6,cleanupV6,ownerBlock,ownerRelease,POLICY} from '../_aio_security_v6.js';
const opt={'Cache-Control':'private, no-store'};
const safe=(v,n=200)=>String(v||'').trim().slice(0,n);
const err=e=>json({ok:false,error:[400,401,403,404,409].includes(e?.status)?e.message:'Błąd serwera V6.'},[400,401,403,404,409].includes(e?.status)?e.status:500,opt);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
function checkOrigin(r){const h=r.headers.get('Origin');return(!h||h===new URL(r.url).origin)&&r.headers.get('Sec-Fetch-Site')!=='cross-site';}
export async function onRequestGet({request,env}){
  try{
    const a=await requireAdmin(request,env,true);await ensureV6(env);await cleanupV6(env);
    const db=env.COMMUNITY_DB,url=new URL(request.url);
    const search=safe(url.searchParams.get('q'),80);const pattern='%'+search.replace(/[!%_]/g,v=>'!'+v)+'%';
    const rows=await db.prepare(`SELECT b.user_id,p.display_name,COALESCE(a.email,'') email,
      b.reason,b.evidence,b.origin,b.status,b.created_at,b.expires_at,b.reviewed_at,b.released_at
      FROM aio_v6_blocks b JOIN community_profiles p ON p.id=b.user_id
      LEFT JOIN community_auth a ON a.user_id=b.user_id
      ORDER BY CASE b.status WHEN 'active' THEN 0 ELSE 1 END,b.created_at DESC LIMIT 250`).all();
    // Include account bans issued by older V4/V5 modules. Never release them through V6.
    const older=await db.prepare(`SELECT p.id user_id,p.display_name,COALESCE(a.email,'') email,
      COALESCE(p.ban_reason,'Blokada administratora') reason,'' evidence,'v5' origin,
      'active' status,p.banned_at created_at,p.banned_until expires_at,NULL reviewed_at,NULL released_at
      FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
      WHERE p.banned_until>? AND NOT EXISTS (
        SELECT 1 FROM aio_v6_blocks b WHERE b.user_id=p.id AND b.status='active')
      ORDER BY p.banned_until DESC LIMIT 100`).bind(new Date().toISOString()).all();
    const users=search.length>=2?await db.prepare(`SELECT p.id,p.display_name,COALESCE(a.email,'') email
      FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
      WHERE p.id<>? AND (p.display_name LIKE ? ESCAPE '!' COLLATE NOCASE OR
      p.id LIKE ? ESCAPE '!' OR a.email LIKE ? ESCAPE '!' COLLATE NOCASE)
      ORDER BY p.created_at DESC LIMIT 25`).bind(a.user.id,pattern,pattern,pattern).all():{results:[]};
    return json({ok:true,blocks:[...(rows.results||[]),...(older.results||[])],users:users.results||[],policy:POLICY,updated_at:new Date().toISOString(),
      note:'Automatyczne blokady dotyczą wyłącznie zalogowanego konta. Ruch bez sesji wymaga osobnej reguły Cloudflare WAF.'},200,opt);
  }catch(e){console.error('[AIO V6 read]',String(e?.message||e));return err(e)}
}
export async function onRequestPost({request,env}){
  if(!checkOrigin(request))return json({ok:false,error:'Niedozwolone źródło żądania.'},403,opt);
  if(!String(request.headers.get('content-type')||'').includes('application/json'))return json({ok:false,error:'Wymagany JSON.'},415,opt);
  try{
    const a=await requireAdmin(request,env,true);await ensureV6(env);
    const body=await request.json().catch(()=>({}));const userId=safe(body.user_id,100);
    if(!/^[a-f\d-]{36}$/i.test(userId)||userId===a.user.id)fail(400,'Nieprawidłowe konto. Właściciel jest chroniony.');
    const db=env.COMMUNITY_DB;
    if(body.action==='block'){
      if(body.confirm!==true)fail(400,'Potwierdź blokadę.');
      const reason=safe(body.reason,260);if(reason.length<10)fail(400,'Podaj przyczynę (minimum 10 znaków).');
      const h=body.hours===null?null:Number(body.hours);
      const result=await ownerBlock(env,request,userId,reason,h);
      if(!result)fail(409,'Konto nie istnieje, jest kontem właściciela lub ma już aktywną blokadę.');
      await moderationLog(env,a.user.id,{targetUserId:userId,targetType:'user',targetId:userId,action:'v6_owner_block',reason});
      return json({ok:true,message:'Zablokowano konto. Dostęp do strony i API odmówiony dla jego bieżącej sesji.'},200,opt);
    }
    if(body.action==='review'){
      const r=await db.prepare("UPDATE aio_v6_blocks SET reviewed_at=?,reviewed_by=? WHERE user_id=? AND status='active'").bind(new Date().toISOString(),a.user.id,userId).run();
      if(!r.meta?.changes)fail(409,'Nie znaleziono aktywnej blokady.');
      return json({ok:true,message:'Oznaczono jako przejrzane. Blokada pozostaje aktywna.'},200,opt);
    }
    if(body.action==='release'){
      if(body.confirm!==true)fail(400,'Potwierdź zdjęcie blokady.');
      if(!(await ownerRelease(env,userId,a.user.id)))fail(409,'Nie znaleziono aktywnej blokady V6.');
      await moderationLog(env,a.user.id,{targetUserId:userId,targetType:'user',targetId:userId,action:'v6_owner_release',reason:'Zwolnienie konta po weryfikacji'});
      return json({ok:true,message:'Blokada V6 zdjęta. Pozostałe ograniczenia (np. V5) pozostają bez zmian.'},200,opt);
    }
    if(body.action==='cleanup'){
      await cleanupV6(env);
      return json({ok:true,message:'Uporządkowano wygasłe blokady V6, ograniczenia bezpieczeństwa i stare liczniki.'},200,opt);
    }
    fail(400,'Nieznana operacja.');
  }catch(e){console.error('[AIO V6 write]',String(e?.message||e));return err(e)}
}
