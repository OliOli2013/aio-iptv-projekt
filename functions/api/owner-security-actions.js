/* AIO owner security controls V4: explicit, audited, owner-only user and network actions. */
import {requireAdmin,moderationLog,clientIp} from '../_community.js';
import {ensureEmailBlockTable,emailIsBlocked,emailHash} from '../_aio_email_blocks.js';
const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const respond=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:HEAD});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const safe=(v,n=200)=>String(v??'').trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,n);
const validId=s=>/^[0-9a-f-]{36}$/i.test(s);
const originOK=request=>{const o=request.headers.get('origin');return (!o||o===new URL(request.url).origin)&&request.headers.get('sec-fetch-site')!=='cross-site';};
function handleError(e){const s=[400,401,403,404,409].includes(e?.status)?e.status:500;return respond({ok:false,error:s===500?'Operacja jest chwilowo niedostępna.':e.message},s);}
async function account(db,id,ownerId){
  if(!validId(id))fail(400,'Nieprawidłowy identyfikator konta.');
  const user=await db.prepare(`SELECT p.id,p.role,p.display_name,p.banned_until,a.email FROM community_profiles p
    LEFT JOIN community_auth a ON a.user_id=p.id WHERE p.id=? LIMIT 1`).bind(id).first();
  if(!user)fail(404,'Konto nie istnieje.');
  if(user.id===ownerId||user.role!=='user')fail(403,'Nie można wykonać tej operacji na koncie administracyjnym.');
  return user;
}
async function ipChoices(db,userId){
  const ips=await db.prepare(`SELECT ip_address,last_seen_at FROM community_user_ips WHERE user_id=?
    ORDER BY last_seen_at DESC LIMIT 8`).bind(userId).all();
  const results=[];
  for(const x of ips.results||[]){
    if(!x.ip_address)continue;
    const other=await db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM community_user_ips WHERE ip_address=? AND user_id<>?').bind(x.ip_address,userId).first();
    const block=await db.prepare('SELECT active,permanent,expires_at FROM community_ip_blocks WHERE ip_address=? LIMIT 1').bind(x.ip_address).first();
    results.push({ip:x.ip_address,last_seen_at:x.last_seen_at,other_accounts:Number(other?.n||0),blocked:!!block?.active,expires_at:block?.expires_at||null});
  }
  return results;
}
export async function onRequestGet({request,env}){
  try{
    const s=await requireAdmin(request,env,true);const db=env.COMMUNITY_DB;
    const id=safe(new URL(request.url).searchParams.get('user_id'),100);
    const user=await account(db,id,s.user.id);
    const ips=await ipChoices(db,id);
    const emailBlocked=user.email?await emailIsBlocked(env,user.email):false;
    return respond({ok:true,user:{id:user.id,name:user.display_name,email:user.email||'',banned_until:user.banned_until||null,email_blocked:emailBlocked},ips});
  }catch(e){return handleError(e)}
}
export async function onRequestPost({request,env}){
  if(!originOK(request))return respond({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').includes('application/json'))return respond({ok:false,error:'Wymagany JSON.'},415);
  try{
    const s=await requireAdmin(request,env,true);const db=env.COMMUNITY_DB;
    const body=await request.json().catch(()=>({}));const action=safe(body.action,40);const id=safe(body.user_id,100);
    const user=await account(db,id,s.user.id);
    if(body.confirm!==true)fail(400,'Wymagane potwierdzenie.');
    const reason=safe(body.reason,300);
    if(reason.length<8)fail(400,'Podaj powód działania (minimum 8 znaków).');
    const now=new Date().toISOString();
    if(action==='block_account'||action==='unblock_account'){
      const until=action==='block_account'?new Date(Date.now()+30*86400000).toISOString():null;
      await db.prepare(`UPDATE community_profiles SET banned_until=?,ban_reason=?,banned_by=?,banned_at=?,updated_at=? WHERE id=?`)
        .bind(until,action==='block_account'?reason:null,action==='block_account'?s.user.id:null,action==='block_account'?now:null,now,id).run();
      if(action==='block_account')await db.prepare('DELETE FROM community_sessions WHERE user_id=?').bind(id).run();
      await moderationLog(env,s.user.id,{targetUserId:id,targetType:'user',targetId:id,action:'owner_'+action,reason,ip:clientIp(request)});
      return respond({ok:true,message:action==='block_account'?'Konto zablokowane na 30 dni.':'Zdjęto blokadę konta.'});
    }
    if(action==='block_email'||action==='unblock_email'){
      if(!user.email)fail(409,'Konto nie ma przypisanego adresu e-mail.');
      await ensureEmailBlockTable(env);const hash=await emailHash(user.email);
      if(action==='block_email'){
        await db.prepare(`INSERT INTO aio_owner_email_blocks(email_hash,user_id,created_at,created_by,reason)
          VALUES(?,?,?,?,?) ON CONFLICT(email_hash) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at,created_by=excluded.created_by,user_id=excluded.user_id`)
          .bind(hash,id,now,s.user.id,reason).run();
        await db.prepare(`UPDATE community_profiles SET banned_until='9999-12-31T23:59:59.000Z',ban_reason=?,banned_by=?,banned_at=?,updated_at=? WHERE id=?`).bind(reason,s.user.id,now,now,id).run();
        await db.prepare('DELETE FROM community_sessions WHERE user_id=?').bind(id).run();
      }else{
        const r=await db.prepare('DELETE FROM aio_owner_email_blocks WHERE email_hash=?').bind(hash).run();
        if(!r.meta?.changes)fail(404,'Adres nie był na liście blokad.');
      }
      await moderationLog(env,s.user.id,{targetUserId:id,targetType:'user',targetId:id,action:'owner_'+action,reason,ip:clientIp(request)});
      return respond({ok:true,message:action==='block_email'?'E-mail zablokowany dla logowania i rejestracji; konto wylogowane.':'Blokada e-mail usunięta. Sprawdź oddzielnie blokadę konta.'});
    }
    if(action==='block_ip'||action==='unblock_ip'){
      const ip=safe(body.ip,80);
      const choices=await ipChoices(db,id);
      const match=choices.find(x=>x.ip===ip);
      if(!match)fail(400,'Adres IP nie jest przypisany do wybranego konta.');
      if(ip===clientIp(request))fail(403,'Nie wolno blokować aktualnego adresu IP właściciela.');
      if(action==='block_ip'){
        if(match.other_accounts>0&&body.ack_shared!==true)fail(409,'Ten adres ma inne konta. Potwierdź świadomie blokadę całej sieci.');
        const expiry=new Date(Date.now()+7*86400000).toISOString();
        await db.prepare(`INSERT INTO community_ip_blocks(id,ip_address,reason,permanent,expires_at,active,target_user_id,created_by,created_at,updated_at)
          VALUES(?,?,?,0,?,1,?,?,?,?) ON CONFLICT(ip_address) DO UPDATE SET reason=excluded.reason,permanent=0,expires_at=excluded.expires_at,active=1,target_user_id=excluded.target_user_id,created_by=excluded.created_by,updated_at=excluded.updated_at`)
          .bind(crypto.randomUUID(),ip,reason,expiry,id,s.user.id,now,now).run();
      }else{
        const b=await db.prepare('SELECT target_user_id FROM community_ip_blocks WHERE ip_address=? AND active=1 LIMIT 1').bind(ip).first();
        if(!b||b.target_user_id!==id)fail(409,'Blokada IP nie jest powiązana z tym kontem.');
        await db.prepare('UPDATE community_ip_blocks SET active=0,updated_at=? WHERE ip_address=?').bind(now,ip).run();
      }
      await moderationLog(env,s.user.id,{targetUserId:id,targetType:'ip',targetId:id,action:'owner_'+action,reason,ip:clientIp(request)});
      return respond({ok:true,message:action==='block_ip'?'Adres IP zablokowany na 7 dni (może dotknąć inne konta w tej sieci).':'Blokada IP zdjęta.'});
    }
    fail(400,'Nieznana operacja.');
  }catch(e){return handleError(e)}
}
