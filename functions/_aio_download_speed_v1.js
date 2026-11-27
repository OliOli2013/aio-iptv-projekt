/* AIO Download Speed V1. D1 is the cross-isolate arbiter; never trust browser flags. */
const TTL=180000, RENEW=60000;
export const DEFAULT_KB=25;
export async function ensureSpeedSchema(env){
  // Deliberately do not cache request-bound promises across Worker invocations.
  await env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_download_speed_config_v1 (id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),kbps INTEGER NOT NULL CHECK(kbps BETWEEN 5 AND 10000),updated_at TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_download_speed_leases_v1 (scope TEXT PRIMARY KEY,token TEXT NOT NULL,expires_ms INTEGER NOT NULL)`)
  ]);
}
export async function speedConfig(env){
  const row=await env.COMMUNITY_DB.prepare('SELECT enabled,kbps,updated_at FROM aio_download_speed_config_v1 WHERE id=1').first();
  return {enabled:row?.enabled===1,kbps:row?Number(row.kbps):DEFAULT_KB,updated_at:row?.updated_at||null};
}
export async function saveSpeedConfig(env,enabled,kbps){
  if(typeof enabled!=='boolean'||!Number.isInteger(kbps)||kbps<5||kbps>10000)throw new Error('Nieprawidłowe ustawienia');
  await ensureSpeedSchema(env);
  await env.COMMUNITY_DB.prepare(`INSERT INTO aio_download_speed_config_v1(id,enabled,kbps,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,kbps=excluded.kbps,updated_at=excluded.updated_at`).bind(+enabled,kbps,new Date().toISOString()).run();
  return speedConfig(env);
}
export function shouldThrottle(state,config){return config.enabled===true && state.active!==true && state.owner!==true;}
export async function claimSpeedLease(env,userId){
  const db=env.COMMUNITY_DB;
  // Only owner-confirmed quota groups, not speculative IP/device correlations.
  const member=await db.prepare('SELECT group_id FROM aio_multikonta_quota_members_v2 WHERE user_id=? LIMIT 1').bind(userId).first();
  const scope=member?.group_id?'group:'+member.group_id:'user:'+userId;
  const token=crypto.randomUUID(),now=Date.now();
  const r=await db.prepare(`INSERT INTO aio_download_speed_leases_v1(scope,token,expires_ms) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET token=excluded.token,expires_ms=excluded.expires_ms WHERE aio_download_speed_leases_v1.expires_ms<=?`).bind(scope,token,now+TTL,now).run();
  if(Number(r.meta?.changes)!==1)return null;
  let expires=now+TTL,renewAt=now+RENEW,released=false;
  return {
    async check(){
      if(released)throw new Error('Transfer closed');
      const t=Date.now();if(t>=expires)throw new Error('Transfer lease expired');
      if(t<renewAt)return;
      const r=await db.prepare('UPDATE aio_download_speed_leases_v1 SET expires_ms=? WHERE scope=? AND token=? AND expires_ms>?').bind(t+TTL,scope,token,t).run();
      if(Number(r.meta?.changes)!==1||Date.now()>=t+TTL)throw new Error('Transfer lease lost');
      expires=t+TTL;renewAt=t+RENEW;
    },
    async release(){if(released)return;released=true;await db.prepare('DELETE FROM aio_download_speed_leases_v1 WHERE scope=? AND token=?').bind(scope,token).run();}
  };
}
const sleep=ms=>new Promise(resolve=>globalThis.setTimeout(resolve,ms));
// Backpressure-aware, no accumulated credits: every piece waits before delivery.
// A 200ms piece is small even at 25 KB/s. No full-file buffering.
export function pacedStream(body,bytesPerSecond,lease,{delay=sleep}={}){
  if(!Number.isFinite(bytesPerSecond)||bytesPerSecond<=0)throw new Error('Invalid speed');
  const reader=body.getReader(),maxChunk=Math.max(1,Math.floor(bytesPerSecond/5));
  let pending=null,offset=0,closed=false;
  async function finish(reason,cancel){
    if(closed)return;closed=true;
    if(cancel){try{await reader.cancel(reason);}catch{}}
    try{reader.releaseLock();}catch{}
    try{await lease.release();}catch(e){console.error('AIO speed lease release',String(e?.message||e).slice(0,100));}
  }
  return new ReadableStream({
    async pull(controller){
      try{
        await lease.check();
        while(!pending||offset>=pending.byteLength){
          const part=await reader.read();if(closed)return;
          if(part.done){await finish(null,false);if(!closed)return;controller.close();return;}
          pending=part.value;offset=0;
        }
        const n=Math.min(maxChunk,pending.byteLength-offset);
        await delay(Math.ceil(n*1000/bytesPerSecond));
        if(closed)return;
        await lease.check();if(closed)return;
        controller.enqueue(pending.subarray(offset,offset+n));offset+=n;
      }catch(e){if(!closed){await finish(e,true);controller.error(e);}}
    },
    async cancel(reason){await finish(reason,true);}
  },{highWaterMark:0});
}
export function speedBusy(){return new Response('Trwa już pobieranie FREE dla tego konta lub potwierdzonej grupy kont. Zakończ je i spróbuj ponownie.',{status:429,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store','Retry-After':'15'}});}
export function speedResponse(asset,config,lease,context){
  const headers=new Headers(asset.headers);headers.set('Cache-Control','private, no-store');headers.set('X-AIO-Download-Limit-KBps',String(config.kbps));headers.set('X-AIO-Download-Speed','free');
  // Preserve lengths for R2 200/206 using Cloudflare's FixedLengthStream where available.
  const length=Number(headers.get('Content-Length'));
  let body=pacedStream(asset.body,config.kbps*1000,lease);
  if(typeof FixedLengthStream==='function' && Number.isSafeInteger(length)&&length>=0 && headers.has('Content-Length')){
    const fixed=new FixedLengthStream(length);
    const pumping=body.pipeTo(fixed.writable).catch(e=>{console.error('AIO speed stream',String(e?.message||e).slice(0,100));});
    if(typeof context.waitUntil==='function')context.waitUntil(pumping);
    body=fixed.readable;
  }
  return new Response(body,{status:asset.status,statusText:asset.statusText,headers});
}
