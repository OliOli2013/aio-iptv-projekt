/* AIO Support Purpose V1 — declaration != payment; only owner verifies transactions. */
import {ensureSchema,requireUser,requireAdmin,moderationLog} from '../../_community.js';
import {initAccess,SUPPORT_MS} from '../../_aio_account_access.js';
import {ensureVipSchema,oneCalendarMonth} from '../../_aio_vip.js';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const ALLOWED=new Set(['donation','access7','vip30']);
const METHODS=new Set(['buycoffee','revolut','kofi']);
const labels={donation:'Dobrowolne wsparcie — bez dostępu',access7:'7 dni nielimitowanego pobierania',vip30:'VIP — 30 dni, minimum 30 zł'};
let schemaPromise;
function answer(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:HEADERS});}
function fail(status,message){throw Object.assign(new Error(message),{status});}
function error(e){const status=[400,401,403,404,409,429].includes(e?.status)?e.status:500;return answer({ok:false,error:status===500?'Operacja jest chwilowo niedostępna. Spróbuj później.':String(e.message)},status);}
function originOK(req){const origin=req.headers.get('Origin');return (!origin||origin===new URL(req.url).origin)&&req.headers.get('Sec-Fetch-Site')!=='cross-site';}
function sanitize(value,max=160){return String(value||'').trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);}
function amount(value){const n=Number(value);return Number.isFinite(n)?Math.round(n*100)/100:NaN;}
function code(){return 'AIO-'+crypto.randomUUID().replace(/-/g,'').slice(0,10).toUpperCase();}
async function ensure(env){
  await ensureSchema(env);
  if(!schemaPromise)schemaPromise=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_support_intents (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,purpose TEXT NOT NULL,method TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'started',
      payer_identifier TEXT NOT NULL DEFAULT '',declared_pln REAL,
      verified_pln REAL,created_at TEXT NOT NULL,reported_at TEXT,
      reviewed_at TEXT,reviewed_by TEXT,review_note TEXT NOT NULL DEFAULT '',
      entitlement_expires_at TEXT,FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_support_intents_owner ON aio_support_intents(status,created_at DESC)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_support_intents_user ON aio_support_intents(user_id,created_at DESC)')
  ]).catch(e=>{schemaPromise=null;throw e;});
  await schemaPromise;
}
async function audit(env,actorId,targetId,action,metadata={}){
  try{await moderationLog(env,actorId,{targetUserId:targetId,targetType:'support',targetId:metadata.id||targetId,action,metadata});}
  catch(e){console.error('AIO support moderation audit unavailable:',String(e?.message||e).slice(0,90));}
}
export async function onRequestGet({request,env}){
  try{
    const admin=new URL(request.url).searchParams.get('scope')==='admin';
    const s=admin?await requireAdmin(request,env,true):await requireUser(request,env);
    await ensure(env);const db=env.COMMUNITY_DB;
    if(admin){
      await initAccess(env);
      const rows=await db.prepare(`SELECT i.id,i.user_id,i.purpose,i.method,i.reference,i.status,
        i.payer_identifier,i.declared_pln,i.verified_pln,i.created_at,i.reported_at,
        i.reviewed_at,i.review_note,i.entitlement_expires_at,
        COALESCE(p.display_name,'Konto') user_name,COALESCE(a.email,'') email
        FROM aio_support_intents i LEFT JOIN community_profiles p ON p.id=i.user_id
        LEFT JOIN community_auth a ON a.user_id=i.user_id
        ORDER BY CASE i.status WHEN 'reported' THEN 0 WHEN 'started' THEN 1 ELSE 2 END,
        i.created_at DESC LIMIT 200`).all();
      const legacy=await db.prepare("SELECT COUNT(*) AS n FROM aio_access_approval_requests WHERE status='pending'").first();
      const counts=await db.prepare("SELECT SUM(CASE WHEN status='reported' THEN 1 ELSE 0 END) reported,SUM(CASE WHEN status='started' THEN 1 ELSE 0 END) started FROM aio_support_intents").first();
      return answer({ok:true,rows:rows.results||[],labels,pending_reported:Number(counts?.reported||0),pending_started:Number(counts?.started||0),legacy_pending:Number(legacy?.n||0),pending_total:Number(counts?.reported||0)+Number(legacy?.n||0)});
    }
    const rr=await db.prepare(`SELECT id,purpose,method,reference,status,created_at,reported_at,declared_pln,review_note,entitlement_expires_at
      FROM aio_support_intents WHERE user_id=? ORDER BY created_at DESC LIMIT 25`).bind(s.user.id).all();
    return answer({ok:true,rows:rr.results||[],labels});
  }catch(e){return error(e);}
}
export async function onRequestPost({request,env}){
  if(!originOK(request))return answer({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return answer({ok:false,error:'Wymagany JSON.'},415);
  try{
    const body=await request.json().catch(()=>({}));const action=String(body.action||'');
    const isOwner=['confirm','reject'].includes(action);
    const s=isOwner?await requireAdmin(request,env,true):await requireUser(request,env);
    await ensure(env);const db=env.COMMUNITY_DB;const now=new Date(),iso=now.toISOString();
    if(action==='create'){
      const purpose=String(body.purpose||''),method=String(body.method||'');
      if(!ALLOWED.has(purpose)||!METHODS.has(method))fail(400,'Wybierz cel wpłaty i metodę płatności.');
      const n=await db.prepare(`SELECT COUNT(*) n FROM aio_support_intents WHERE user_id=? AND created_at>?`)
        .bind(s.user.id,new Date(now.getTime()-24*3600000).toISOString()).first();
      if(Number(n?.n||0)>=8)fail(429,'Zbyt wiele zgłoszeń w ciągu doby. Skontaktuj się z administratorem.');
      const id=crypto.randomUUID(),ref=code();
      await db.prepare(`INSERT INTO aio_support_intents(id,user_id,purpose,method,reference,status,created_at)
        VALUES(?,?,?,?,?,'started',?)`).bind(id,s.user.id,purpose,method,ref,iso).run();
      return answer({ok:true,id,reference:ref,purpose,method,message:'Zapisano wybrany cel. Nie jest to potwierdzenie wpłaty.'});
    }
    const id=sanitize(body.id,100);
    if(!/^[a-f0-9-]{36}$/i.test(id))fail(400,'Nieprawidłowy identyfikator zgłoszenia.');
    const row=await db.prepare('SELECT * FROM aio_support_intents WHERE id=? LIMIT 1').bind(id).first();
    if(!row)fail(404,'Nie znaleziono zgłoszenia.');
    if(action==='report'){
      if(row.user_id!==s.user.id)fail(403,'Brak dostępu do zgłoszenia.');
      if(row.status!=='started')fail(409,'Zgłoszenie zostało już przesłane do weryfikacji.');
      const payer=sanitize(body.payer_identifier,150),declared=amount(body.declared_pln);
      if(payer.length<3)fail(400,'Podaj nazwę lub e-mail użyte u operatora wpłaty.');
      if(!Number.isFinite(declared)||declared<=0||declared>100000)fail(400,'Podaj kwotę faktycznie wpłaconą, w PLN lub równowartości PLN.');
      if(/(?:\b\d[ -]?){13,19}\b/.test(payer))fail(400,'Nie wpisuj numerów kart płatniczych.');
      await db.prepare(`UPDATE aio_support_intents SET payer_identifier=?,declared_pln=?,status='reported',reported_at=?
        WHERE id=? AND user_id=? AND status='started'`).bind(payer,declared,iso,id,s.user.id).run();
      return answer({ok:true,message:'Zgłoszenie wpłaty zapisane. Administrator zweryfikuje je u operatora; dostęp nie został jeszcze przyznany.'});
    }
    if(action==='reject'){
      if(!['started','reported'].includes(row.status))fail(409,'Zgłoszenie zostało już rozpatrzone.');
      const note=sanitize(body.note,300);if(note.length<5)fail(400,'Podaj powód odrzucenia.');
      const change=await db.prepare(`UPDATE aio_support_intents SET status='rejected',reviewed_at=?,reviewed_by=?,review_note=?
        WHERE id=? AND status IN ('started','reported')`).bind(iso,s.user.id,note,id).run();
      if(Number(change.meta?.changes||0)!==1)fail(409,'Zgłoszenie jest już rozpatrzone.');
      await audit(env,s.user.id,row.user_id,'support_intent_rejected',{id,purpose:row.purpose});
      return answer({ok:true,message:'Zgłoszenie odrzucono.'});
    }
    if(action==='confirm'){
      if(row.status!=='reported')fail(409,'Potwierdzać można tylko zgłoszoną wpłatę.');
      if(body.confirm!==true)fail(400,'Wymagane świadome potwierdzenie weryfikacji wpłaty u operatora.');
      const verified=amount(body.verified_pln),note=sanitize(body.note,300);
      if(!Number.isFinite(verified)||verified<=0||verified>100000)fail(400,'Podaj kwotę faktycznie sprawdzoną u operatora (PLN lub równowartość PLN).');
      if(row.purpose==='vip30'&&verified<30)fail(400,'VIP wymaga minimum 30 zł zweryfikowanej wpłaty.');
      let expiry=null;
      const statements=[db.prepare(`UPDATE aio_support_intents SET status='approved',verified_pln=?,reviewed_at=?,reviewed_by=?,review_note=?,entitlement_expires_at=?
        WHERE id=? AND status='reported'`)];
      if(row.purpose==='access7')expiry=new Date(now.getTime()+SUPPORT_MS).toISOString();
      if(row.purpose==='vip30')expiry=oneCalendarMonth(now).toISOString();
      statements[0]=statements[0].bind(verified,iso,s.user.id,note,expiry,id);
      if(row.purpose==='access7'){
        await initAccess(env);
        statements.push(db.prepare(`INSERT INTO aio_access_account_grants (user_id,issued_at,expires_at,source,reference,updated_at)
          SELECT user_id,?,?, 'owner_verified_support',?,? FROM aio_support_intents WHERE id=? AND status='approved' AND reviewed_at=? AND reviewed_by=?
          ON CONFLICT(user_id) DO UPDATE SET issued_at=excluded.issued_at,expires_at=excluded.expires_at,
          source=excluded.source,reference=excluded.reference,updated_at=excluded.updated_at
          WHERE excluded.expires_at>aio_access_account_grants.expires_at`).bind(iso,expiry,'purpose:'+id,iso,id,iso,s.user.id));
      } else if(row.purpose==='vip30'){
        await ensureVipSchema(env);
        statements.push(db.prepare(`INSERT INTO aio_vip_grants(user_id,issued_at,expires_at,status,activated_by,note,revoked_at,revoked_by,updated_at)
          SELECT user_id,?,?,'active',?, ?,NULL,NULL,? FROM aio_support_intents WHERE id=? AND status='approved' AND reviewed_at=? AND reviewed_by=?
          ON CONFLICT(user_id) DO UPDATE SET issued_at=excluded.issued_at,expires_at=excluded.expires_at,
          status='active',activated_by=excluded.activated_by,note=excluded.note,revoked_at=NULL,revoked_by=NULL,updated_at=excluded.updated_at`)
          .bind(iso,expiry,s.user.id,('Potwierdzone '+verified+' PLN; '+row.reference).slice(0,220),iso,id,iso,s.user.id));
      }
      const changed=await db.batch(statements);
      if(Number(changed?.[0]?.meta?.changes||0)!==1)fail(409,'Zgłoszenie zostało już rozpatrzone.');
      await audit(env,s.user.id,row.user_id,'support_intent_confirmed',{id,purpose:row.purpose,verified_pln:verified,expires_at:expiry});
      return answer({ok:true,purpose:row.purpose,expires_at:expiry,
        message:row.purpose==='donation'?'Dziękujemy. Zapisano darowiznę bez nadawania dostępu.':row.purpose==='access7'?'Potwierdzono wpłatę i przyznano 7 dni pobierania.':'Potwierdzono wpłatę i aktywowano VIP na 30 dni.'});
    }
    fail(400,'Nieznana operacja.');
  }catch(e){return error(e);}
}
