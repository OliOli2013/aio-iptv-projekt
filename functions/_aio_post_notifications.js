/* AIO Post Notifications V1
 * Inbox: virtual rows from published posts, no fan-out writes at publish time.
 * Email: explicit opt-in, verified account only, at most one digest per 24 h.
 * No user-provided email address or recipient ID is trusted.
 */
import {sendWpSmtp,wpSmtpReady} from './_aio_wp_smtp.js';

const BASE='https://aio-iptv-projekt.pages.dev';
const MAX_BATCH=6;
const DAY_MS=24*60*60*1000;
const RETRY_MS=20*60*1000;
let schemaPromise=null;
const stamp=()=>new Date().toISOString();
const parseDate=v=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:0;};
const fail=(status,message)=>Object.assign(new Error(message),{status});
const goodTitle=s=>String(s||'Nowy wpis').replace(/[\r\n\x00-\x1f]/g,' ').trim().slice(0,120);
const validUserId=s=>/^[a-z0-9_-]{8,100}$/i.test(String(s||''));
const validPostId=s=>/^[a-z0-9_-]{8,100}$/i.test(String(s||''));

export async function ensurePostNotifySchema(env){
  if(!env?.COMMUNITY_DB)throw fail(503,'Nie można odczytać ustawień powiadomień.');
  if(!schemaPromise){
    const db=env.COMMUNITY_DB;
    schemaPromise=(async()=>{
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS aio_post_notify_rollout (
          key TEXT PRIMARY KEY,value TEXT NOT NULL)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS aio_post_notify_preferences (
          user_id TEXT PRIMARY KEY,
          inbox_enabled INTEGER NOT NULL DEFAULT 1 CHECK(inbox_enabled IN (0,1)),
          inbox_since TEXT,
          email_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_enabled IN (0,1)),
          email_since TEXT,
          last_email_sent_at TEXT,
          last_email_attempt_at TEXT,
          email_claimed_at TEXT,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS aio_post_notify_reads (
          user_id TEXT NOT NULL,post_id TEXT NOT NULL,read_at TEXT NOT NULL,
          PRIMARY KEY(user_id,post_id),
          FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE,
          FOREIGN KEY(post_id) REFERENCES community_posts(id) ON DELETE CASCADE)`),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_aio_post_notify_posts ON community_posts(status,published_at DESC)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_aio_post_notify_email ON aio_post_notify_preferences(email_enabled,last_email_sent_at,last_email_attempt_at)')
      ]);
      await db.prepare('INSERT OR IGNORE INTO aio_post_notify_rollout(key,value) VALUES(?,?)').bind('started_at',stamp()).run();
    })().catch(error=>{schemaPromise=null;throw error;});
  }
  return schemaPromise;
}

async function rolloutAt(db){
  const row=await db.prepare('SELECT value FROM aio_post_notify_rollout WHERE key=? LIMIT 1').bind('started_at').first();
  return row?.value||stamp();
}
async function userPrefs(db,userId){
  return db.prepare('SELECT * FROM aio_post_notify_preferences WHERE user_id=? LIMIT 1').bind(userId).first();
}
async function inboxInfo(db,userId,userCreated){
  const p=await userPrefs(db,userId);
  if(p && Number(p.inbox_enabled)!==1)return {enabled:false,since:''};
  const start=await rolloutAt(db);
  const since=new Date(Math.max(parseDate(start),parseDate(userCreated),parseDate(p?.inbox_since))).toISOString();
  return {enabled:true,since};
}

export async function unreadPostCount(db,userId,userCreated){
  const opt=await inboxInfo(db,userId,userCreated);
  if(!opt.enabled)return 0;
  const r=await db.prepare(`SELECT COUNT(*) n FROM community_posts p
    WHERE p.status='published' AND p.kind IN ('official','community') AND p.author_id<>?
      AND julianday(COALESCE(p.published_at,p.created_at))>julianday(?)
      AND NOT EXISTS(SELECT 1 FROM aio_post_notify_reads x WHERE x.user_id=? AND x.post_id=p.id)`)
    .bind(userId,opt.since,userId).first();
  return Number(r?.n||0);
}
export async function postInboxRows(db,userId,userCreated,limit=40){
  const opt=await inboxInfo(db,userId,userCreated);
  if(!opt.enabled)return [];
  const n=Math.min(440,Math.max(1,Number(limit)||40));
  const result=await db.prepare(`SELECT 'p_'||p.id id,p.title subject,
     COALESCE(p.published_at,p.created_at) created_at,'post' audience,
     x.read_at,COALESCE(a.display_name,'Społeczność AIO') sender_name,
     'post' kind,p.id post_id
    FROM community_posts p
    LEFT JOIN aio_post_notify_reads x ON x.user_id=? AND x.post_id=p.id
    LEFT JOIN community_profiles a ON a.id=p.author_id
    WHERE p.status='published' AND p.kind IN ('official','community') AND p.author_id<>?
      AND julianday(COALESCE(p.published_at,p.created_at))>julianday(?)
    ORDER BY COALESCE(p.published_at,p.created_at) DESC,p.id DESC LIMIT ?`)
    .bind(userId,userId,opt.since,n).all();
  return result.results||[];
}
export async function openPostNotice(db,userId,userCreated,noticeId){
  if(!/^p_[a-z0-9_-]{8,100}$/i.test(String(noticeId||'')))throw fail(400,'Nieprawidłowa wiadomość.');
  const postId=noticeId.slice(2),opt=await inboxInfo(db,userId,userCreated);
  if(!opt.enabled)throw fail(404,'Powiadomienie jest niedostępne.');
  const row=await db.prepare(`SELECT p.id,p.title,p.content,COALESCE(p.published_at,p.created_at) created_at,
      COALESCE(a.display_name,'Społeczność AIO') sender_name
    FROM community_posts p LEFT JOIN community_profiles a ON a.id=p.author_id
    WHERE p.id=? AND p.status='published' AND p.kind IN ('official','community')
      AND p.author_id<>? AND julianday(COALESCE(p.published_at,p.created_at))>julianday(?) LIMIT 1`)
    .bind(postId,userId,opt.since).first();
  if(!row)throw fail(404,'Powiadomienie jest niedostępne.');
  await db.prepare('INSERT OR IGNORE INTO aio_post_notify_reads(user_id,post_id,read_at) VALUES(?,?,?)')
    .bind(userId,postId,stamp()).run();
  const excerpt=String(row.content||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,280);
  return {id:noticeId,kind:'post',subject:goodTitle(row.title),created_at:row.created_at,
    sender_name:row.sender_name,body:(excerpt?excerpt+'…':'Nowy post w Społeczności AIO.'),
    post_url:'post.html?id='+encodeURIComponent(row.id)};
}
export async function readPostNotificationSettings(env,userId){
  await ensurePostNotifySchema(env);
  const db=env.COMMUNITY_DB,p=await userPrefs(db,userId);
  const verified=await db.prepare('SELECT verified_at FROM aio_email_verifications WHERE user_id=? LIMIT 1').bind(userId).first();
  const emailReady=wpSmtpReady(env)&&String(env.AIO_POST_NOTIFY_TOKEN||'').length>=32;
  return {inbox_enabled:p?Number(p.inbox_enabled)===1:true,
    email_enabled:p?Number(p.email_enabled)===1:false,
    email_verified:Boolean(verified?.verified_at),email_delivery_available:emailReady};
}
export async function savePostNotificationSettings(env,userId,data){
  await ensurePostNotifySchema(env);
  if(!validUserId(userId)||typeof data?.inbox_enabled!=='boolean'||typeof data?.email_enabled!=='boolean')
    throw fail(400,'Wybierz ustawienia powiadomień.');
  const db=env.COMMUNITY_DB;
  const old=await userPrefs(db,userId);
  const verified=await db.prepare('SELECT verified_at FROM aio_email_verifications WHERE user_id=? LIMIT 1').bind(userId).first();
  if(data.email_enabled&&!verified?.verified_at)throw fail(403,'Najpierw potwierdź adres e-mail na swoim koncie.');
  if(data.email_enabled&&Number(old?.email_enabled)!==1&&(!wpSmtpReady(env)||String(env.AIO_POST_NOTIFY_TOKEN||'').length<32))
    throw fail(503,'Powiadomienia e-mail są chwilowo niedostępne. Spróbuj później.');
  const time=stamp();
  const rollout=await rolloutAt(db);
  const inboxSince=data.inbox_enabled ? (!old?rollout:(Number(old.inbox_enabled)===0?time:old.inbox_since||rollout)):old?.inbox_since||null;
  const emailSince=data.email_enabled ? (!old||Number(old.email_enabled)===0?time:old.email_since||time):null;
  await db.prepare(`INSERT INTO aio_post_notify_preferences
    (user_id,inbox_enabled,inbox_since,email_enabled,email_since,updated_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
    inbox_enabled=excluded.inbox_enabled,inbox_since=excluded.inbox_since,
    email_enabled=excluded.email_enabled,email_since=excluded.email_since,
    email_claimed_at=NULL,updated_at=excluded.updated_at`)
    .bind(userId,data.inbox_enabled?1:0,inboxSince,data.email_enabled?1:0,emailSince,time).run();
  return readPostNotificationSettings(env,userId);
}

export async function dispatchPostEmailDigests(env){
  await ensurePostNotifySchema(env);
  if(!wpSmtpReady(env))return {sent:0,failed:0,checked:0,mail_configured:false};
  const db=env.COMMUNITY_DB,now=stamp(),dayAgo=new Date(Date.now()-DAY_MS).toISOString();
  const retryAgo=new Date(Date.now()-RETRY_MS).toISOString();
  // A small work unit per invocation. The cron repeats, so no long-running mail fanout.
  const recipients=await db.prepare(`SELECT pref.user_id,pref.email_since,pref.last_email_sent_at,a.email
    FROM aio_post_notify_preferences pref
    JOIN community_auth a ON a.user_id=pref.user_id
    JOIN community_profiles pr ON pr.id=pref.user_id
    JOIN aio_email_verifications ev ON ev.user_id=pref.user_id AND ev.verified_at IS NOT NULL
    WHERE pref.email_enabled=1 AND pref.email_since IS NOT NULL
      AND (pr.banned_until IS NULL OR julianday(pr.banned_until)<=julianday(?))
      AND (pref.last_email_sent_at IS NULL OR julianday(pref.last_email_sent_at)<=julianday(?))
      AND (pref.last_email_attempt_at IS NULL OR julianday(pref.last_email_attempt_at)<=julianday(?))
      AND EXISTS(SELECT 1 FROM community_posts p WHERE p.status='published'
        AND p.kind IN ('official','community') AND p.author_id<>pref.user_id
        AND julianday(COALESCE(p.published_at,p.created_at))>max(julianday(pref.email_since),julianday(COALESCE(pref.last_email_sent_at,pref.email_since))))
    ORDER BY COALESCE(pref.last_email_attempt_at,pref.email_since) ASC LIMIT ?`)
    .bind(now,dayAgo,retryAgo,MAX_BATCH).all();
  let sent=0,failed=0,checked=0;
  for(const receiver of recipients.results||[]){
    checked++;
    const claim=await db.prepare(`UPDATE aio_post_notify_preferences
      SET email_claimed_at=?,last_email_attempt_at=?
      WHERE user_id=? AND email_enabled=1
      AND (email_claimed_at IS NULL OR julianday(email_claimed_at)<=julianday(?))
      AND (last_email_attempt_at IS NULL OR julianday(last_email_attempt_at)<=julianday(?))`)
      .bind(now,now,receiver.user_id,retryAgo,retryAgo).run();
    if(Number(claim.meta?.changes||0)!==1)continue;
    try{
      const state=await db.prepare(`SELECT p.email_enabled,a.email,v.verified_at
        FROM aio_post_notify_preferences p
        JOIN community_auth a ON a.user_id=p.user_id
        JOIN aio_email_verifications v ON v.user_id=p.user_id
        WHERE p.user_id=? LIMIT 1`).bind(receiver.user_id).first();
      if(Number(state?.email_enabled)!==1||!state?.verified_at||state.email!==receiver.email)continue;
      const cutoff=new Date(Math.max(parseDate(receiver.email_since),parseDate(receiver.last_email_sent_at))).toISOString();
      const rows=await db.prepare(`SELECT p.id,p.title,COALESCE(p.published_at,p.created_at) created_at
        FROM community_posts p WHERE p.status='published' AND p.kind IN ('official','community')
          AND p.author_id<>? AND julianday(COALESCE(p.published_at,p.created_at))>julianday(?)
          AND julianday(COALESCE(p.published_at,p.created_at))<=julianday(?)
        ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT 11`)
        .bind(receiver.user_id,cutoff,now).all();
      const newPosts=rows.results||[];
      if(!newPosts.length)continue;
      const display=newPosts.slice(0,10);
      const parts=['Nowe posty w AIO TunerHub','','Na stronie pojawiły się nowe posty:',''];
      display.forEach((p,i)=>{parts.push((i+1)+'. '+goodTitle(p.title));parts.push(BASE+'/post.html?id='+encodeURIComponent(p.id));parts.push('');});
      if(newPosts.length>10)parts.push('Więcej nowych postów znajdziesz w Społeczności AIO.','');
      parts.push('Społeczność AIO: '+BASE+'/community.html');
      parts.push('Możesz wyłączyć powiadomienia e-mail w dowolnym momencie w Moim koncie: '+BASE+'/konto.html#aio-post-notify-settings');
      parts.push('To powiadomienie otrzymujesz dlatego, że włączyłeś je na swoim koncie AIO.');
      await sendWpSmtp(env,{to:receiver.email,subject:'AIO TunerHub — nowe posty',text:parts.join('\n')});
      // Advance only for successfully accepted SMTP messages. Opting out mid-flight remains disabled.
      await db.prepare(`UPDATE aio_post_notify_preferences SET last_email_sent_at=?,email_claimed_at=NULL
        WHERE user_id=? AND email_claimed_at=? AND email_enabled=1`).bind(now,receiver.user_id,now).run();
      sent++;
    }catch(e){failed++;console.error('[AIO post digest] send failed',String(e?.code||'MAIL_FAILED').slice(0,50));}
    finally{
      await db.prepare('UPDATE aio_post_notify_preferences SET email_claimed_at=NULL WHERE user_id=? AND email_claimed_at=?')
        .bind(receiver.user_id,now).run().catch(()=>{});
    }
  }
  return {sent,failed,checked,mail_configured:true};
}
