/* AIO Individual Speed V1 — only the verified owner can read or mutate exceptions. */
import {requireAdmin,getOwnerId,json} from '../_community.js';
import {speedConfig,individualSpeed} from '../_aio_download_speed_v1.js';
const out=(o,s=200)=>json(o,s,{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const durations={'24h':86400000,'7d':604800000,'30d':2592000000,'forever':null};
function fail(status,message){throw Object.assign(new Error(message),{status});}
async function owner(req,env){const s=await requireAdmin(req,env,true);const id=await getOwnerId(env);if(!id||s.user.id!==id||s.user.role!=='admin')fail(403,'Wyłącznie właściciel.');return id;}
async function target(db,id){if(!uuid.test(String(id||'')))fail(400,'Nieprawidłowy identyfikator konta.');const p=await db.prepare(`SELECT p.id,p.role,p.display_name AS name,a.email FROM community_profiles p JOIN community_auth a ON a.user_id=p.id WHERE p.id=?`).bind(id).first();if(!p)fail(404,'Nie znaleziono konta.');if(p.role!=='user')fail(403,'Wyjątki są tylko dla zwykłych kont.');return p;}
function error(e){const status=[400,401,403,404,409,415].includes(e?.status)?e.status:503;if(status===503)console.error('[AIO individual speed]',String(e?.message||e).slice(0,160));return out({ok:false,error:status===503?'Nie udało się odczytać lub zapisać indywidualnej prędkości.':e.message},status);}
async function detail(env,id){const user=await target(env.COMMUNITY_DB,id);const global=await speedConfig(env),stored=await individualSpeed(env,id),effective=await speedConfig(env,id);return {ok:true,user,global,stored,effective};}
export async function onRequestGet({request,env}){try{
  await owner(request,env);const db=env.COMMUNITY_DB,u=new URL(request.url),id=u.searchParams.get('user_id');
  if(id)return out(await detail(env,id));
  const filter=u.searchParams.get('filter')||'all',raw=u.searchParams.get('page')||'0',page=Number(raw);
  if(!['all','custom','unlimited','grouped'].includes(filter)||!Number.isInteger(page)||page<0||page>10000)fail(400,'Nieprawidłowy filtr.');
  const extra=filter==='grouped'?' AND m.group_id IS NOT NULL':filter==='custom'||filter==='unlimited'?' AND x.mode=?':'';
  const args=[Date.now(),...(['custom','unlimited'].includes(filter)?[filter]:[]),51,page*50];
  const rows=(await db.prepare(`SELECT x.user_id,x.mode,x.kbps,x.expires_ms,x.updated_at,x.reason,p.display_name AS name,a.email,CASE WHEN m.group_id IS NULL THEN 0 ELSE 1 END AS grouped FROM aio_download_speed_users_v1 x JOIN community_profiles p ON p.id=x.user_id JOIN community_auth a ON a.user_id=x.user_id LEFT JOIN aio_multikonta_quota_members_v2 m ON m.user_id=x.user_id WHERE p.role='user' AND (x.expires_ms IS NULL OR x.expires_ms>?)${extra} ORDER BY x.updated_at DESC,x.user_id LIMIT ? OFFSET ?`).bind(...args).all()).results||[];
  return out({ok:true,rows:rows.slice(0,50),more:rows.length>50,page});
}catch(e){return error(e);}}
export async function onRequestPost({request,env}){try{
  if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'Niedozwolone źródło żądania.');
  const actor=await owner(request,env);if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))fail(415,'Wymagany JSON.');
  const b=await request.json().catch(()=>null);if(!b||b.confirm!==true||!['default','custom','unlimited'].includes(b.mode))fail(400,'Wybierz tryb i potwierdź decyzję.');
  const db=env.COMMUNITY_DB,user=await target(db,b.user_id),id=user.id;
  const reason=String(b.reason||'').trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,180);if(reason.length<5)fail(400,'Podaj powód (minimum 5 znaków).');
  const previous=await individualSpeed(env,id),global=await speedConfig(env);let kbps=null,expires=null;
  if(b.mode!=='default'){
    if(previous.grouped)fail(409,'Konto należy do potwierdzonej grupy. Obowiązuje wspólny limit.');
    if(!Object.hasOwn(durations,b.duration))fail(400,'Nieprawidłowy okres.');
    if(b.mode==='custom'){kbps=b.kbps;if(!Number.isInteger(kbps)||kbps<global.kbps||kbps>10000)fail(400,'Podaj prędkość od '+global.kbps+' do 10000 KB/s.');}
    expires=durations[b.duration]===null?null:Date.now()+durations[b.duration];
  }
  const now=new Date().toISOString();
  const change=b.mode==='default'?db.prepare('DELETE FROM aio_download_speed_users_v1 WHERE user_id=?').bind(id):db.prepare(`INSERT INTO aio_download_speed_users_v1(user_id,mode,kbps,expires_ms,reason,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode,kbps=excluded.kbps,expires_ms=excluded.expires_ms,reason=excluded.reason,updated_at=excluded.updated_at`).bind(id,b.mode,kbps,expires,reason,now);
  const metadata=JSON.stringify({previous:{mode:previous.mode,kbps:previous.kbps,expires_ms:previous.expires_ms},mode:b.mode,kbps,expires_ms:expires});
  // Both decision and audit are committed atomically. No VIP/grant/quota writes.
  const audit=db.prepare(`INSERT INTO community_moderation_log(id,actor_id,target_user_id,target_type,target_id,action,reason,ip_address,metadata,created_at) VALUES(?,?,?,'user',?,?,?,NULL,?,?)`).bind(crypto.randomUUID(),actor,id,id,b.mode==='default'?'owner_download_speed_reset':'owner_download_speed_set',reason,metadata,now);
  await db.batch([change,audit]);return out({...await detail(env,id),message:'Zapisano indywidualne ustawienia pobierania.'});
}catch(e){return error(e);}}
