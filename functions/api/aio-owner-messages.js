/* AIO Wiadomosci od Administracji V1 — private D1 inbox + one-row broadcasts.
 * Authorization is always performed on the server, never from user-supplied IDs.
 */
import {requireUser,requireAdmin,moderationLog} from '../_community.js';

const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const now=()=>new Date().toISOString();
let schemaReady;
async function schema(env){
  if(!env.COMMUNITY_DB)throw Error('Brak COMMUNITY_DB');
  if(!schemaReady)schemaReady=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_owner_messages (
      id TEXT PRIMARY KEY, sender_user_id TEXT NOT NULL, recipient_user_id TEXT,
      audience TEXT NOT NULL CHECK(audience IN ('user','all')),
      subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
      revoked_at TEXT, request_id TEXT NOT NULL UNIQUE,
      CHECK((audience='user' AND recipient_user_id IS NOT NULL)
         OR (audience='all' AND recipient_user_id IS NULL)),
      FOREIGN KEY(sender_user_id) REFERENCES community_profiles(id),
      FOREIGN KEY(recipient_user_id) REFERENCES community_profiles(id))`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_owner_msg_recipient ON aio_owner_messages(recipient_user_id,created_at DESC)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_owner_msg_audience ON aio_owner_messages(audience,created_at DESC)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_owner_message_reads (
      message_id TEXT NOT NULL, user_id TEXT NOT NULL, read_at TEXT NOT NULL,
      PRIMARY KEY(message_id,user_id),
      FOREIGN KEY(message_id) REFERENCES aio_owner_messages(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_owner_msg_reads_user ON aio_owner_message_reads(user_id,read_at DESC)')
  ]).catch(e=>{schemaReady=null;throw e;});
  return schemaReady;
}
const statusError=e=>{
  const code=[400,401,403,404,409,415,429].includes(e?.status)?e.status:500;
  return respond({ok:false,error:code===500?'Moduł wiadomości jest chwilowo niedostępny.':String(e.message||'Nie udało się wykonać operacji.')},code);
};
function fail(code,msg){throw Object.assign(new Error(msg),{status:code});}
function sameOrigin(req){
  const origin=req.headers.get('Origin');
  return (!origin||origin===new URL(req.url).origin) && req.headers.get('Sec-Fetch-Site')!=='cross-site';
}
function clean(value,max){return String(value??'').trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').slice(0,max+1);}
function validId(value){return /^[a-z0-9_-]{8,100}$/i.test(String(value||''));}
async function registeredAt(db,userId){
  const p=await db.prepare('SELECT created_at FROM community_profiles WHERE id=? LIMIT 1').bind(userId).first();
  if(!p)fail(401,'Konto nie jest dostępne.');
  return p.created_at;
}
async function unreadCount(db,userId,createdAt){
  const q=await db.prepare(`SELECT COUNT(*) n FROM aio_owner_messages m
    LEFT JOIN aio_owner_message_reads r ON r.message_id=m.id AND r.user_id=?
    WHERE m.revoked_at IS NULL AND r.message_id IS NULL
      AND (m.recipient_user_id=? OR (m.audience='all' AND m.created_at>=?))`)
    .bind(userId,userId,createdAt).first();
  return Number(q?.n||0);
}
async function inbox(db,userId,createdAt,offset){
  const q=await db.prepare(`SELECT m.id,m.subject,m.created_at,m.audience,r.read_at,
      COALESCE(p.display_name,'Administracja AIO') sender_name
    FROM aio_owner_messages m
    LEFT JOIN aio_owner_message_reads r ON r.message_id=m.id AND r.user_id=?
    LEFT JOIN community_profiles p ON p.id=m.sender_user_id
    WHERE m.revoked_at IS NULL
      AND (m.recipient_user_id=? OR (m.audience='all' AND m.created_at>=?))
    ORDER BY m.created_at DESC,m.id DESC LIMIT 40 OFFSET ?`)
    .bind(userId,userId,createdAt,offset).all();
  return q.results||[];
}
async function audit(env,actorId,targetId,action,detail){
  try{await moderationLog(env,actorId,{targetUserId:targetId||actorId,targetType:'user',targetId:targetId||actorId,action,metadata:detail});}
  catch(e){console.error('AIO owner mail audit',String(e?.message||'error').slice(0,90));}
}
export async function onRequestGet({request,env}){
  try{
    const url=new URL(request.url),view=url.searchParams.get('view')||'unread';
    const owner=['users','sent'].includes(view);
    const s=owner?await requireAdmin(request,env,true):await requireUser(request,env);
    await schema(env);
    const db=env.COMMUNITY_DB;
    if(view==='users'){
      const q=clean(url.searchParams.get('q'),80);
      if(q.length<2||q.length>80)return respond({ok:true,rows:[]});
      const match='%'+q.replace(/[!%_]/g,c=>'!'+c)+'%';
      const rows=await db.prepare(`SELECT p.id,p.display_name,COALESCE(a.email,'') email
        FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
        WHERE p.display_name LIKE ? ESCAPE '!' COLLATE NOCASE
          OR p.id LIKE ? ESCAPE '!' OR a.email LIKE ? ESCAPE '!' COLLATE NOCASE
        ORDER BY p.display_name COLLATE NOCASE,p.id LIMIT 35`).bind(match,match,match).all();
      return respond({ok:true,rows:rows.results||[]});
    }
    if(view==='sent'){
      const q=await db.prepare(`SELECT m.id,m.created_at,m.audience,m.subject,m.revoked_at,
        m.recipient_user_id,COALESCE(p.display_name,'Konto niedostępne') recipient_name,
        (SELECT COUNT(*) FROM aio_owner_message_reads r WHERE r.message_id=m.id) read_count
        FROM aio_owner_messages m LEFT JOIN community_profiles p ON p.id=m.recipient_user_id
        ORDER BY m.created_at DESC LIMIT 40`).all();
      return respond({ok:true,rows:q.results||[]});
    }
    if(!['unread','inbox'].includes(view))fail(400,'Nieznany widok.');
    const createdAt=await registeredAt(db,s.user.id);
    const unread=await unreadCount(db,s.user.id,createdAt);
    if(view==='unread')return respond({ok:true,unread});
    const offset=Math.min(400,Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    return respond({ok:true,unread,rows:await inbox(db,s.user.id,createdAt,offset),offset});
  }catch(e){return statusError(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return respond({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))
    return respond({ok:false,error:'Wymagany JSON.'},415);
  try{
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Niepoprawne dane.');
    const action=String(body.action||'');
    const owner=['send','revoke'].includes(action);
    if(!['send','revoke','open'].includes(action))fail(400,'Nieznana operacja.');
    const s=owner?await requireAdmin(request,env,true):await requireUser(request,env);
    await schema(env);
    const db=env.COMMUNITY_DB;
    if(action==='open'){
      const id=String(body.id||'');if(!validId(id))fail(400,'Nieprawidłowe ID wiadomości.');
      const created=await registeredAt(db,s.user.id);
      const msg=await db.prepare(`SELECT m.id,m.subject,m.body,m.created_at,m.audience,
          COALESCE(p.display_name,'Administracja AIO') sender_name
        FROM aio_owner_messages m LEFT JOIN community_profiles p ON p.id=m.sender_user_id
        WHERE m.id=? AND m.revoked_at IS NULL
          AND (m.recipient_user_id=? OR (m.audience='all' AND m.created_at>=?)) LIMIT 1`)
        .bind(id,s.user.id,created).first();
      if(!msg)fail(404,'Wiadomość nie istnieje lub nie masz do niej dostępu.');
      await db.prepare(`INSERT OR IGNORE INTO aio_owner_message_reads(message_id,user_id,read_at) VALUES(?,?,?)`)
        .bind(msg.id,s.user.id,now()).run();
      return respond({ok:true,message:msg,unread:await unreadCount(db,s.user.id,created)});
    }
    if(action==='send'){
      const audience=String(body.audience||'');
      if(!['user','all'].includes(audience))fail(400,'Wybierz odbiorcę.');
      if(audience==='all'&&body.confirm_all!==true)fail(400,'Potwierdź wysyłkę do wszystkich kont.');
      const subject=clean(body.subject,120),content=clean(body.content,4000);
      if(subject.length<3||subject.length>120||content.length<3||content.length>4000)
        fail(400,'Temat: 3–120 znaków. Treść: 3–4000 znaków.');
      const requestId=String(body.request_id||'');
      if(!/^[a-f0-9-]{36}$/i.test(requestId))fail(400,'Nieprawidłowy identyfikator wysyłki.');
      // Idempotency: re-submitting the same operation must never send another message.
      const existing=await db.prepare('SELECT id,audience FROM aio_owner_messages WHERE request_id=? AND sender_user_id=?')
        .bind(requestId,s.user.id).first();
      if(existing)return respond({ok:true,id:existing.id,duplicate:true,message:'Wiadomość była już wysłana.'});
      let target=null;
      if(audience==='user'){
        target=String(body.user_id||'');if(!validId(target))fail(400,'Wybierz konto z listy wyszukiwania.');
        const user=await db.prepare('SELECT id FROM community_profiles WHERE id=? LIMIT 1').bind(target).first();
        if(!user)fail(404,'Konto odbiorcy już nie istnieje.');
      }
      const cutoff=new Date(Date.now()-86400000).toISOString();
      const cap=audience==='all'?5:120;
      const nr=await db.prepare('SELECT COUNT(*) n FROM aio_owner_messages WHERE sender_user_id=? AND audience=? AND created_at>=?')
        .bind(s.user.id,audience,cutoff).first();
      if(Number(nr?.n||0)>=cap)fail(429,'Osiągnięto dzienny limit wysyłek dla tego typu wiadomości.');
      const id=crypto.randomUUID(),created=now();
      const write=await db.prepare(`INSERT OR IGNORE INTO aio_owner_messages
        (id,sender_user_id,recipient_user_id,audience,subject,body,created_at,request_id)
        VALUES(?,?,?,?,?,?,?,?)`).bind(id,s.user.id,target,audience,subject,content,created,requestId).run();
      if(Number(write.meta?.changes||0)!==1){
        const duplicate=await db.prepare('SELECT id FROM aio_owner_messages WHERE request_id=? AND sender_user_id=?')
          .bind(requestId,s.user.id).first();
        if(duplicate)return respond({ok:true,id:duplicate.id,duplicate:true,message:'Wiadomość była już wysłana.'});
        fail(409,'Nie udało się zakończyć wysyłki.');
      }
      const c=audience==='all'
        ?await db.prepare('SELECT COUNT(*) n FROM community_profiles WHERE created_at<=?').bind(created).first()
        :{n:1};
      await audit(env,s.user.id,target,'aio_owner_message_sent',{id,audience,count:Number(c?.n||0)});
      return respond({ok:true,id,recipients:Number(c?.n||0),message:'Wiadomość zapisana i dostępna w skrzynce odbiorców.'},201);
    }
    const id=String(body.id||'');if(!validId(id)||body.confirm!==true)fail(400,'Wymagane ID i potwierdzenie cofnięcia.');
    const stamp=now();
    const result=await db.prepare('UPDATE aio_owner_messages SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
      .bind(stamp,id).run();
    if(Number(result.meta?.changes||0)!==1)fail(409,'Wiadomość jest już cofnięta lub nie istnieje.');
    await audit(env,s.user.id,null,'aio_owner_message_revoked',{id});
    return respond({ok:true,message:'Wiadomość cofnięta. Nie będzie już widoczna u odbiorców.'});
  }catch(e){return statusError(e);}
}
