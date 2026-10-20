/* AIO Owner — account details and manual access management, owner only.
 * Deliberately separate manual gifts from verified payment receipts.
 */
import {requireAdmin,moderationLog,json} from '../_community.js';
import {initAccess,getStatus,SUPPORT_MS} from '../_aio_account_access.js';
import {ensureVipSchema} from '../_aio_vip.js';

const HEADERS={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const answer=(data,status=200)=>json(data,status,HEADERS);
const sameOrigin=request=>{
  const origin=request.headers.get('Origin');
  return (!origin||origin===new URL(request.url).origin) && request.headers.get('Sec-Fetch-Site')!=='cross-site';
};
function problem(status,message){return Object.assign(new Error(message),{status});}
function cleanReason(v){return String(v||'').trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,180);}
function idParam(v){const s=String(v||'');if(!/^[a-zA-Z0-9_-]{8,100}$/.test(s))throw problem(400,'Niepoprawny identyfikator konta.');return s;}
async function person(db,id){return await db.prepare(`SELECT p.id,p.display_name,p.role,p.created_at,p.banned_until,
    a.email,a.last_login_at FROM community_profiles p
    JOIN community_auth a ON a.user_id=p.id WHERE p.id=? LIMIT 1`).bind(id).first();}
function friendlyError(e){const status=[400,401,403,404,409,415].includes(e?.status)?e.status:500;
  return answer({ok:false,error:status===500?'Nie udało się obsłużyć konta.':String(e.message||'Błąd')},status);}
async function setup(env){await initAccess(env);await ensureVipSchema(env);}
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    const id=idParam(new URL(request.url).searchParams.get('user_id'));
    await setup(env);
    const db=env.COMMUNITY_DB;
    const p=await person(db,id);
    if(!p)throw problem(404,'Konto nie istnieje.');
    const now=new Date().toISOString();
    const [state,vip,grant,sessions]=await Promise.all([
      getStatus(env,id),
      db.prepare(`SELECT status,issued_at,expires_at,note FROM aio_vip_grants WHERE user_id=? LIMIT 1`).bind(id).first(),
      db.prepare(`SELECT source,issued_at,expires_at,reference FROM aio_access_account_grants WHERE user_id=? LIMIT 1`).bind(id).first(),
      db.prepare(`SELECT COUNT(*) n FROM community_sessions WHERE user_id=? AND expires_at>?`).bind(id,now).first()
    ]);
    const vipActive=!!(vip?.status==='active'&&vip.expires_at>now);
    const grantActive=!!(grant?.expires_at>now);
    return answer({ok:true,user:{id:p.id,name:p.display_name,email:p.email,role:p.role,
      created_at:p.created_at,last_login_at:p.last_login_at,banned_until:p.banned_until},
      entitlement:{email_verified:state.email_verified!==false,active:state.active===true,
        unlimited:state.unlimited===true,vip_active:vipActive,
        free_remaining:state.free_remaining,free_limit:state.free_limit,free_resets_at:state.free_resets_at,
        source:state.source||'',expires_at:state.expires_at||null},
      vip:{active:vipActive,issued_at:vip?.issued_at||null,expires_at:vip?.expires_at||null},
      grant:{active:grantActive,source:grant?.source||'',issued_at:grant?.issued_at||null,expires_at:grant?.expires_at||null},
      active_sessions:Number(sessions?.n||0)});
  }catch(e){return friendlyError(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return answer({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))
    return answer({ok:false,error:'Wymagany format JSON.'},415);
  try{
    const actor=await requireAdmin(request,env,true);
    const body=await request.json().catch(()=>({}));
    const action=String(body.action||'');
    if(!['grant_7_days','revoke_manual_grant','revoke_user_sessions'].includes(action))throw problem(400,'Nieznana operacja.');
    if(body.confirm!==true)throw problem(400,'Wymagane potwierdzenie decyzji właściciela.');
    const id=idParam(body.user_id);
    if(id===actor.user.id)throw problem(403,'Tych operacji nie wykonuje się na koncie właściciela.');
    const reason=cleanReason(body.reason);
    if(reason.length<5)throw problem(400,'Podaj przyczynę decyzji (minimum 5 znaków).');
    await setup(env);
    const db=env.COMMUNITY_DB;
    const target=await person(db,id);
    if(!target)throw problem(404,'Nie znaleziono użytkownika.');
    if(target.role==='admin'||target.role==='moderator')throw problem(403,'Ta operacja nie dotyczy kont uprzywilejowanych.');
    const now=new Date().toISOString();
    if(action==='grant_7_days'){
      const current=await db.prepare(`SELECT source,expires_at FROM aio_access_account_grants WHERE user_id=? LIMIT 1`).bind(id).first();
      if(current && current.expires_at>now && ['verified_receipt','owner_verified_support'].includes(current.source))
        throw problem(409,'Konto ma aktywny dostęp po potwierdzonym wsparciu. Nie zastępuj go ręcznym grantem; poczekaj na zakończenie albo zarządzaj istniejącą wpłatą.');
      const expires=new Date(Date.now()+SUPPORT_MS).toISOString();
      await db.prepare(`INSERT INTO aio_access_account_grants(user_id,issued_at,expires_at,source,reference,updated_at)
        VALUES(?,?,?,'owner_manual_grant',?,?) ON CONFLICT(user_id) DO UPDATE SET
        issued_at=excluded.issued_at,expires_at=excluded.expires_at,source=excluded.source,
        reference=excluded.reference,updated_at=excluded.updated_at`)
        .bind(id,now,expires,reason,now).run();
      await moderationLog(env,actor.user.id,{targetUserId:id,targetType:'user',targetId:id,
        action:'owner_manual_7d_granted',reason,metadata:{expires_at:expires}});
      return answer({ok:true,message:'Przyznano 7 dni nielimitowanego pobierania (ręcznie, bez oznaczania wpłaty).',expires_at:expires});
    }
    if(action==='revoke_manual_grant'){
      const res=await db.prepare(`UPDATE aio_access_account_grants SET expires_at=?,updated_at=?
        WHERE user_id=? AND source='owner_manual_grant' AND expires_at>?`).bind(now,now,id,now).run();
      if(Number(res.meta?.changes||0)!==1)throw problem(409,'Nie znaleziono aktywnego ręcznego dostępu 7-dniowego.');
      await moderationLog(env,actor.user.id,{targetUserId:id,targetType:'user',targetId:id,
        action:'owner_manual_7d_revoked',reason});
      return answer({ok:true,message:'Cofnięto ręczny dostęp 7-dniowy. Inne uprawnienia pozostały bez zmian.'});
    }
    const res=await db.prepare('DELETE FROM community_sessions WHERE user_id=?').bind(id).run();
    await moderationLog(env,actor.user.id,{targetUserId:id,targetType:'user',targetId:id,
      action:'owner_sessions_revoked',reason,metadata:{count:Number(res.meta?.changes||0)}});
    return answer({ok:true,message:'Zakończono '+Number(res.meta?.changes||0)+' sesji użytkownika. Ponowne zalogowanie będzie wymagało hasła.'});
  }catch(e){return friendlyError(e);}
}
