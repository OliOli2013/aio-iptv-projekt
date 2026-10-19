/* AIO Download Security V1
 * Per-account, 168-hour free window STARTING at the first free action.
 * Historical local tickets and daily external counters are included once on rollout.
 * Only server-side D1 statements authorize downloads. Never use display names/IPs.
 */
export const FREE_WEEKLY_LIMIT=3;
export const FREE_WINDOW_MS=7*24*60*60*1000;
export const FILE_RETRY_MS=30*60*1000;
let schemaPromise;
export function warsawDay(date=new Date()) {
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;
}
function tzOffsetAt(ms){
  const s=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Warsaw',timeZoneName:'shortOffset'}).formatToParts(new Date(ms)).find(x=>x.type==='timeZoneName')?.value||'';
  const m=/GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(s);
  return m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]||0)):60;
}
// Old daily counters lack timestamps. Assign the LAST second of their Warsaw day,
// never an early timestamp that could prematurely restore quota.
export function conservativeDailyTimestamp(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
  const [y,m,d]=day.split('-').map(Number);
  const nextNoonUtc=Date.UTC(y,m-1,d+1,12);
  const midnightUtc=Date.UTC(y,m-1,d+1)-tzOffsetAt(nextNoonUtc)*60000;
  return midnightUtc-1;
}
export function inheritedWindow(events,now){
  const ordered=events.filter(t=>Number.isFinite(t) && t>0 && t<=now).sort((a,b)=>a-b);
  let start=0,used=0;
  for(const t of ordered){
    if(!start || t>=start+FREE_WINDOW_MS){start=t;used=1;}
    else used++;
  }
  if(!start || now>=start+FREE_WINDOW_MS)return {started_ms:0,expires_ms:0,historical_used:0};
  return {started_ms:start,expires_ms:start+FREE_WINDOW_MS,historical_used:used};
}
export async function ensureWeeklySchema(env){
  if(!schemaPromise)schemaPromise=(async()=>{
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_free_windows (
        user_id TEXT PRIMARY KEY, started_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL,
        historical_used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_free_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, window_started_ms INTEGER NOT NULL,
        file_key TEXT, issued_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL)`),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_free_events_window ON aio_access_free_events(user_id,window_started_ms)'),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_free_events_retry ON aio_access_free_events(user_id,file_key,expires_ms)')
    ]);
  })().catch(e=>{schemaPromise=null;throw e;});
  await schemaPromise;
}
async function initWeeklyAccount(env,userId,now=Date.now()){
  await ensureWeeklySchema(env);
  let existing=await env.COMMUNITY_DB.prepare('SELECT started_ms,expires_ms,historical_used FROM aio_access_free_windows WHERE user_id=?').bind(userId).first();
  if(existing)return existing;
  // Source of truth, NOT browser telemetry: local tickets + server-side external counter.
  // 15-day scan covers any window that could still be active during migration.
  const dayFrom=warsawDay(new Date(now-15*86400000));
  const [local,external]=await Promise.all([
    env.COMMUNITY_DB.prepare(`SELECT opened_ms FROM aio_access_account_file_retries WHERE user_id=? AND opened_ms>=? ORDER BY opened_ms ASC LIMIT 5000`).bind(userId,now-15*86400000).all(),
    env.COMMUNITY_DB.prepare(`SELECT day,used FROM aio_access_account_daily WHERE user_id=? AND day>=? ORDER BY day ASC LIMIT 25`).bind(userId,dayFrom).all()
  ]);
  const events=(local.results||[]).map(x=>Number(x.opened_ms));
  for(const item of external.results||[]){
    const t=conservativeDailyTimestamp(String(item.day));
    // Counter written by server, one count per authorised external link click.
    // Historical exact time is irrecoverable; end-of-day is intentionally conservative.
    const count=Math.max(0,Math.min(100,Number(item.used)||0));
    if(t!==null)for(let i=0;i<count;i++)events.push(Math.min(t,now));
  }
  const hist=inheritedWindow(events,now);
  await env.COMMUNITY_DB.prepare(`INSERT OR IGNORE INTO aio_access_free_windows
    (user_id,started_ms,expires_ms,historical_used,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
    .bind(userId,hist.started_ms,hist.expires_ms,hist.historical_used,new Date(now).toISOString(),new Date(now).toISOString()).run();
  return await env.COMMUNITY_DB.prepare('SELECT started_ms,expires_ms,historical_used FROM aio_access_free_windows WHERE user_id=?').bind(userId).first();
}
function validFileKey(file){return typeof file==='string' && /^\/pliki\/[^\x00-\x1f\x7f\\]{1,795}$/.test(file) && !/\.(?:png|jpe?g|webp|gif|svg|avif)$/i.test(file);}
async function currentWindow(env,userId,now){
  const row=await initWeeklyAccount(env,userId,now);
  if(Number(row.expires_ms)>now)return row;
  return {started_ms:0,expires_ms:0,historical_used:0};
}
export async function weeklyStatus(env,userId,now=Date.now()){
  const row=await currentWindow(env,userId,now);
  if(!row.started_ms)return {free_limit:FREE_WEEKLY_LIMIT,free_remaining:FREE_WEEKLY_LIMIT,free_window_started_at:null,free_resets_at:null,retry_files:[]};
  const [counter,tickets,legacyRetries]=await Promise.all([
    env.COMMUNITY_DB.prepare('SELECT COUNT(*) AS n FROM aio_access_free_events WHERE user_id=? AND window_started_ms=?').bind(userId,row.started_ms).first(),
    env.COMMUNITY_DB.prepare(`SELECT file_key FROM aio_access_free_events WHERE user_id=? AND window_started_ms=? AND file_key IS NOT NULL AND expires_ms>? ORDER BY issued_ms DESC LIMIT 12`).bind(userId,row.started_ms,now).all(),
    env.COMMUNITY_DB.prepare(`SELECT file_key FROM aio_access_account_file_retries WHERE user_id=? AND opened_ms>=? AND expires_ms>? ORDER BY opened_ms DESC LIMIT 12`).bind(userId,row.started_ms,now).all()
  ]);
  const used=Number(row.historical_used||0)+Number(counter?.n||0);
  return {free_limit:FREE_WEEKLY_LIMIT,free_remaining:Math.max(0,FREE_WEEKLY_LIMIT-used),
    free_window_started_at:new Date(Number(row.started_ms)).toISOString(),free_resets_at:new Date(Number(row.expires_ms)).toISOString(),
    retry_files:[...new Set([...(tickets.results||[]),...(legacyRetries.results||[])].map(x=>x.file_key))]};
}
export async function consumeWeekly(env,userId,fileKey=null,now=Date.now()){
  if(fileKey!==null && !validFileKey(fileKey))throw Object.assign(new Error('Nieprawidłowa ścieżka pliku.'),{status:400});
  await initWeeklyAccount(env,userId,now);
  // CAS: when the previous 168h period expires, the next action STARTS a new period.
  // Concurrent calls cannot reset the same live window.
  await env.COMMUNITY_DB.prepare(`UPDATE aio_access_free_windows SET started_ms=?,expires_ms=?,historical_used=0,updated_at=?
    WHERE user_id=? AND expires_ms<=?`)
    .bind(now,now+FREE_WINDOW_MS,new Date(now).toISOString(),userId,now).run();
  const row=await env.COMMUNITY_DB.prepare('SELECT started_ms,expires_ms,historical_used FROM aio_access_free_windows WHERE user_id=?').bind(userId).first();
  if(!row||Number(row.expires_ms)<=now)throw Object.assign(new Error('Nie udało się ustalić okresu pobierania.'),{status:503});
  const start=Number(row.started_ms);
  if(fileKey){
    const legacyRetry=await env.COMMUNITY_DB.prepare(`SELECT 1 AS yes FROM aio_access_account_file_retries
      WHERE user_id=? AND opened_ms>=? AND file_key=? AND expires_ms>? LIMIT 1`)
      .bind(userId,start,fileKey,now).first();
    if(legacyRetry)return {allowed:true,reason:'free_retry'};
    const retry=await env.COMMUNITY_DB.prepare(`SELECT 1 AS yes FROM aio_access_free_events
      WHERE user_id=? AND window_started_ms=? AND file_key=? AND expires_ms>? LIMIT 1`)
      .bind(userId,start,fileKey,now).first();
    if(retry)return {allowed:true,reason:'free_retry'};
  }
  // A SINGLE conditional INSERT performs both quota and retry checks atomically in D1.
  const result=await env.COMMUNITY_DB.prepare(`INSERT INTO aio_access_free_events
    (id,user_id,window_started_ms,file_key,issued_ms,expires_ms)
    SELECT ?,?,?,?,?,?
    WHERE EXISTS (SELECT 1 FROM aio_access_free_windows w
      WHERE w.user_id=? AND w.started_ms=? AND w.expires_ms>?
        AND w.historical_used+(SELECT COUNT(*) FROM aio_access_free_events e
          WHERE e.user_id=? AND e.window_started_ms=?)<?)
    AND NOT EXISTS (SELECT 1 FROM aio_access_free_events r
      WHERE r.user_id=? AND r.window_started_ms=? AND r.file_key=? AND r.expires_ms>?)`)
    .bind(crypto.randomUUID(),userId,start,fileKey,now,now+FILE_RETRY_MS,
      userId,start,now,userId,start,FREE_WEEKLY_LIMIT,
      userId,start,fileKey,now).run();
  if(Number(result.meta?.changes||0)===1)return {allowed:true,reason:'free'};
  // When a concurrent download has just issued a ticket for this exact file, retry is OK.
  if(fileKey){
    const retry=await env.COMMUNITY_DB.prepare(`SELECT 1 AS yes FROM aio_access_free_events
      WHERE user_id=? AND window_started_ms=? AND file_key=? AND expires_ms>? LIMIT 1`)
      .bind(userId,start,fileKey,now).first();
    if(retry)return {allowed:true,reason:'free_retry'};
  }
  return {allowed:false,reason:'limit'};
}
