import { json, ensureSchema, getSession, requireAdmin, sha256, cleanText, countRows } from "../_community.js";

function warsawDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Warsaw",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function dayKeyOffset(days){ return warsawDayKey(new Date(Date.now()+days*86400000)); }
function allowedEvent(v){
  return new Set(["free_access","unlocked_access","limit_reached","access_gate_shown","support_method_selected","support_provider_opened","access_unlocked","direct_free","direct_limit"]).has(String(v||"")) ? String(v) : "";
}
function safeTarget(v){ return cleanText(v||"",180).replace(/[?#].*$/,""); }
function safePath(v){ let x=cleanText(v||"/",220); if(!x.startsWith("/"))x="/"+x; return x.replace(/[?#].*$/,""); }
async function optionalUser(request,env){ try{ const s=await getSession(request,env,{touch:false}); return s&&!s.blocked&&!s.banned?s.user:null; }catch(_){ return null; } }

export async function onRequestPost({request,env}){
  try{
    await ensureSchema(env);
    const body=await request.json().catch(()=>({}));
    const eventType=allowedEvent(body.event);
    if(!eventType)return json({ok:false,error:"Nieprawidłowy typ zdarzenia."},400);
    const visitorId=String(body.visitorId||"").trim().slice(0,120);
    const visitorHash=visitorId?await sha256(visitorId):null;
    const user=await optionalUser(request,env);
    const method=["revolut","buycoffee","kofi"].includes(String(body.method||""))?String(body.method):"";
    const kind=["download","community"].includes(String(body.kind||""))?String(body.kind):"download";
    await env.COMMUNITY_DB.prepare(`INSERT INTO aio_access_events(id,event_type,kind,target,path,method,visitor_hash,user_id,day,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),eventType,kind,safeTarget(body.target),safePath(body.path||"/"),method,visitorHash,user?.id||null,warsawDayKey(),new Date().toISOString()).run();
    return json({ok:true});
  }catch(e){ return json({ok:false,error:e?.message||"Błąd zapisu aktywności."},500); }
}

export async function onRequestGet({request,env}){
  try{
    await ensureSchema(env);
    await requireAdmin(request,env,true);
    const db=env.COMMUNITY_DB,today=warsawDayKey(),from7=dayKeyOffset(-6),from30=dayKeyOffset(-29);
    const count=async(event,from=null)=>from?countRows(env,`SELECT COUNT(*) AS n FROM aio_access_events WHERE event_type=? AND day>=?`,event,from):countRows(env,`SELECT COUNT(*) AS n FROM aio_access_events WHERE event_type=? AND day=?`,event,today);
    const totals={
      free_today:await count("free_access")+await count("direct_free"),unlocked_today:await count("unlocked_access"),limits_today:await count("limit_reached")+await count("direct_limit"),gates_today:await count("access_gate_shown"),providers_today:await count("support_provider_opened"),unlocks_today:await count("access_unlocked"),
      free_7d:await count("free_access",from7)+await count("direct_free",from7),limits_7d:await count("limit_reached",from7)+await count("direct_limit",from7),providers_7d:await count("support_provider_opened",from7),unlocks_7d:await count("access_unlocked",from7),
      free_30d:await count("free_access",from30)+await count("direct_free",from30),limits_30d:await count("limit_reached",from30)+await count("direct_limit",from30),providers_30d:await count("support_provider_opened",from30),unlocks_30d:await count("access_unlocked",from30)
    };
    const methods=await db.prepare(`SELECT method,COUNT(*) AS n FROM aio_access_events WHERE event_type='support_provider_opened' AND day>=? AND method<>'' GROUP BY method ORDER BY n DESC`).bind(from30).all();
    const topTargets=await db.prepare(`SELECT target,kind,COUNT(*) AS n FROM aio_access_events WHERE event_type IN ('free_access','unlocked_access','direct_free') AND day>=? AND target<>'' GROUP BY target,kind ORDER BY n DESC LIMIT 15`).bind(from30).all();
    const daily=await db.prepare(`SELECT day,SUM(CASE WHEN event_type IN ('free_access','direct_free') THEN 1 ELSE 0 END) AS free,SUM(CASE WHEN event_type IN ('limit_reached','direct_limit') THEN 1 ELSE 0 END) AS limits,SUM(CASE WHEN event_type='support_provider_opened' THEN 1 ELSE 0 END) AS providers,SUM(CASE WHEN event_type='access_unlocked' THEN 1 ELSE 0 END) AS unlocks FROM aio_access_events WHERE day>=? GROUP BY day ORDER BY day DESC LIMIT 30`).bind(from30).all();
    const recent=await db.prepare(`SELECT e.event_type,e.kind,e.target,e.path,e.method,e.created_at,p.display_name AS user_name FROM aio_access_events e LEFT JOIN community_profiles p ON p.id=e.user_id ORDER BY e.created_at DESC LIMIT 80`).all();
    return json({ok:true,totals,methods:methods.results||[],topTargets:topTargets.results||[],daily:daily.results||[],recent:recent.results||[]});
  }catch(e){ return json({ok:false,error:e?.message||"Brak dostępu."},e?.status||500); }
}
