/* AIO Free Monthly V1 — 3 counted handoffs per account. Every subsequent GET/handoff
 * (including the same file) consumes a ticket. Third ticket starts ONE calendar month
 * of cooldown. Old D1 free events are migrated lazily, once per account.
 * This file alone never grants paid access or changes guest/owner policies.
 */
export const FREE_MONTHLY_LIMIT=3;
export const FREE_MONTHLY_POLICY='calendar_month_from_third';
const DAY=86400000;
const LOOKBACK_MS=75*DAY;
let schemaPromise;

export function nextCalendarMonth(ms){
  const date=new Date(ms);
  if(!Number.isFinite(ms)||Number.isNaN(date.getTime()))throw new Error('Nieprawidłowa data pobrania.');
  const year=date.getUTCFullYear(),month=date.getUTCMonth(),day=date.getUTCDate();
  const last=new Date(Date.UTC(year,month+2,0)).getUTCDate();
  return Date.UTC(year,month+1,Math.min(day,last),date.getUTCHours(),date.getUTCMinutes(),date.getUTCSeconds(),date.getUTCMilliseconds());
}
function asNum(x){const v=Number(x);return Number.isFinite(v)&&v>0?v:0;}
function utcMs(raw){const t=Date.parse(String(raw||''));return Number.isFinite(t)?t:0;}
async function ensureSchema(env){
  if(!schemaPromise)schemaPromise=(async()=>{
    await env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_monthly_cycles (
      user_id TEXT PRIMARY KEY, started_ms INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0, third_ms INTEGER NOT NULL DEFAULT 0,
      resets_ms INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'new',
      updated_at TEXT NOT NULL)`).run();
  })().catch(e=>{schemaPromise=null;throw e;});
  await schemaPromise;
}
async function safeAll(db,sql,values){
  try{return (await db.prepare(sql).bind(...values).all()).results||[];}
  catch(e){if(/no such (?:table|column)/i.test(String(e?.message||'')))return [];throw e;}
}
// Historical local tickets and legacy daily counters do not always contain an exact
// third-event timestamp. Use available SERVER-SIDE audit records; never browser events.
async function historicalEvents(db,userId,now){
  const since=now-LOOKBACK_MS;
  const ticketRows=await safeAll(db,`SELECT issued_ms,window_started_ms FROM aio_access_free_events
    WHERE user_id=? AND issued_ms>=? ORDER BY issued_ms ASC LIMIT 1500`,[userId,since]);
  const groups=new Map();
  for(const row of ticketRows){
    const t=asNum(row.issued_ms),w=asNum(row.window_started_ms);
    if(!t||t>now||!w)continue;
    if(!groups.has(w))groups.set(w,[]);
    groups.get(w).push(t);
  }
  const windows=[...groups].map(([started,ts])=>({started,ts:ts.sort((a,b)=>a-b)}))
    .sort((a,b)=>a.started-b.started);
  // Existing rolling-window row may include counted pre-ticket history.
  const legacy=await db.prepare(`SELECT started_ms,expires_ms,historical_used,updated_at
    FROM aio_access_free_windows WHERE user_id=? LIMIT 1`).bind(userId).first().catch(e=>{if(/no such (?:table|column)/i.test(String(e?.message||'')))return null;throw e;});
  if(legacy&&asNum(legacy.started_ms)>0 && Number(legacy.historical_used||0)>0){
    const start=asNum(legacy.started_ms);
    let w=windows.find(x=>x.started===start);
    if(!w){w={started:start,ts:[]};windows.push(w);windows.sort((a,b)=>a.started-b.started);}
    // Exact legacy third may be unavailable; conservative estimate from persisted
    // server-created window and available free-download audit records below.
    w.legacyUsed=Math.min(FREE_MONTHLY_LIMIT,Math.max(0,Number(legacy.historical_used)||0));
    w.legacyUpdated=utcMs(legacy.updated_at);
  }
  // Audit only if no exact free-ticket events; otherwise those audit rows duplicate tickets.
  if(!ticketRows.length){
    const [local,external]=await Promise.all([
      safeAll(db,`SELECT created_at AS event_at FROM aio_owner_downloads WHERE user_id=?
        AND audience='account_free' AND access_reason='free' AND created_at>=?
        ORDER BY created_at ASC LIMIT 500`,[userId,new Date(since).toISOString()]),
      safeAll(db,`SELECT created_at AS event_at FROM aio_post_link_handoffs WHERE user_id=?
        AND reason='free' AND created_at>=? ORDER BY created_at ASC LIMIT 500`,[userId,new Date(since).toISOString()])
    ]);
    const exact=[...local,...external].map(x=>utcMs(x.event_at)).filter(t=>t>=since&&t<=now).sort((a,b)=>a-b);
    if(exact.length){
      // Logs do not encode old window boundaries; treat the most recent three
      // successful FREE handoffs as one possible completed cycle.
      const tail=exact.slice(-FREE_MONTHLY_LIMIT);
      const start=tail[0];
      windows.push({started:start,ts:tail,fromAudit:true});
    }
  }
  // Very old accounts may have only pre-ticket retry/daily counters. Run this only
  // if neither a complete event group nor precise audit can establish a cycle.
  if(!windows.length){
    const [raw,daily]=await Promise.all([
      safeAll(db,`SELECT opened_ms FROM aio_access_account_file_retries
        WHERE user_id=? AND opened_ms>=? ORDER BY opened_ms ASC LIMIT 500`,[userId,since]),
      safeAll(db,`SELECT day,used FROM aio_access_account_daily WHERE user_id=?
        AND day>=? ORDER BY day ASC LIMIT 80`,[userId,new Date(since).toISOString().slice(0,10)])
    ]);
    const t=raw.map(x=>asNum(x.opened_ms)).filter(x=>x>0&&x<=now);
    for(const row of daily){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(row.day||'')))continue;
      // Historic daily totals lack their third-event time. End of the day UTC
      // is a conservative estimate; the actual exact hour is not recoverable.
      const last=Date.parse(row.day+'T23:59:59.999Z');
      if(!Number.isFinite(last)||last>now)continue;
      for(let i=0;i<Math.min(3,Math.max(0,Number(row.used)||0));i++)t.push(last);
    }
    t.sort((a,b)=>a-b);
    if(t.length)windows.push({started:t[0],ts:t.slice(-FREE_MONTHLY_LIMIT)});
  }
  const complete=[];
  for(const w of windows){
    const historical=Number(w.legacyUsed||0);
    const total=historical+w.ts.length;
    if(total<FREE_MONTHLY_LIMIT)continue;
    // When legacy users have >=3 counted events but timestamps are missing,
    // use the most recent available event or updated_at; never rely on client time.
    const index=Math.max(0,FREE_MONTHLY_LIMIT-historical-1);
    const third=w.ts[index]||w.legacyUpdated||w.started;
    if(third>0)complete.push({third,started:w.started,resets:nextCalendarMonth(third)});
  }
  const active=complete.filter(x=>x.resets>now).sort((a,b)=>b.third-a.third)[0];
  if(active)return {started_ms:active.started,used:3,third_ms:active.third,resets_ms:active.resets,source:'migration'};
  const newest=windows.sort((a,b)=>b.started-a.started)[0];
  if(newest){
    const used=Math.min(3,Number(newest.legacyUsed||0)+newest.ts.length);
    // Do not restore an exhausted cycle simply because the old seven-day timer elapsed.
    if(used===3){
      const third=newest.ts[Math.max(0,2-Number(newest.legacyUsed||0))]||newest.legacyUpdated||newest.started;
      const resets=nextCalendarMonth(third);
      if(resets>now)return {started_ms:newest.started,used,third_ms:third,resets_ms:resets,source:'migration'};
    }else if(used>0)return {started_ms:newest.started,used,third_ms:0,resets_ms:0,source:'migration'};
  }
  return {started_ms:0,used:0,third_ms:0,resets_ms:0,source:'migration'};
}
async function initAccount(env,userId,now){
  await ensureSchema(env);
  const db=env.COMMUNITY_DB;
  let existing=await db.prepare('SELECT * FROM aio_access_monthly_cycles WHERE user_id=?').bind(userId).first();
  if(existing)return existing;
  const migrated=await historicalEvents(db,userId,now);
  await db.prepare(`INSERT OR IGNORE INTO aio_access_monthly_cycles
    (user_id,started_ms,used,third_ms,resets_ms,source,updated_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(userId,migrated.started_ms,migrated.used,migrated.third_ms,migrated.resets_ms,migrated.source,new Date(now).toISOString()).run();
  return await db.prepare('SELECT * FROM aio_access_monthly_cycles WHERE user_id=?').bind(userId).first();
}
async function refreshCycle(env,userId,now){
  await initAccount(env,userId,now);
  // Atomic reset only for a completed monthly cycle. 1 or 2 used files do NOT
  // start a countdown: their next reset is determined by the eventual third file.
  await env.COMMUNITY_DB.prepare(`UPDATE aio_access_monthly_cycles SET
    started_ms=0,used=0,third_ms=0,resets_ms=0,source='new',updated_at=?
    WHERE user_id=? AND used>=3 AND resets_ms>0 AND resets_ms<=?`)
    .bind(new Date(now).toISOString(),userId,now).run();
  return await env.COMMUNITY_DB.prepare('SELECT * FROM aio_access_monthly_cycles WHERE user_id=?').bind(userId).first();
}
export async function monthlyStatus(env,userId,now=Date.now()){
  const row=await refreshCycle(env,userId,now);
  const used=Math.max(0,Math.min(3,Number(row?.used||0)));
  const reset=used===3?asNum(row.resets_ms):0;
  return {free_limit:FREE_MONTHLY_LIMIT,free_remaining:FREE_MONTHLY_LIMIT-used,
    free_used:used,free_period:'calendar_month_after_third',free_period_hours:null,
    free_window_started_at:asNum(row.started_ms)?new Date(Number(row.started_ms)).toISOString():null,
    free_resets_at:reset?new Date(reset).toISOString():null,
    retry_files:[]};
}
export async function consumeMonthly(env,userId,fileKey=null,now=Date.now()){
  if(fileKey!==null && (typeof fileKey!=='string'||fileKey.length>2100))
    throw Object.assign(new Error('Nieprawidłowy klucz pobrania.'),{status:400});
  await refreshCycle(env,userId,now);
  const next=nextCalendarMonth(now);
  // One conditional D1 UPDATE is the sole authorization decision. No same-file
  // SELECT, no retry-window whitelist, no browser cache exemption.
  const updated=await env.COMMUNITY_DB.prepare(`UPDATE aio_access_monthly_cycles SET
    started_ms=CASE WHEN used=0 THEN ? ELSE started_ms END,
    third_ms=CASE WHEN used=2 THEN ? ELSE third_ms END,
    resets_ms=CASE WHEN used=2 THEN ? ELSE resets_ms END,
    used=used+1,updated_at=? WHERE user_id=? AND used>=0 AND used<3`)
    .bind(now,now,next,new Date(now).toISOString(),userId).run();
  if(Number(updated.meta?.changes||0)!==1)return {allowed:false,reason:'limit',...(await monthlyStatus(env,userId,now))};
  return {allowed:true,reason:'free',...(await monthlyStatus(env,userId,now))};
}
