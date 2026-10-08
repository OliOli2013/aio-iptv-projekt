import { ensureSchema } from "../_community.js";
/* AIO Download Shield — Cloudflare Pages, 2026-10-08 */
const PROTECTED = /\.(?:ipk|apk|exe|msi|zip|7z|rar|deb|rpm|pdf|tar|tgz|gz|xz|img|bin|iso|m3u|m3u8|xml|conf|cfg|backup|sh|py|json|txt|list|tv|radio|bouquet)(?:$|[?#])/i;
const IMAGE = /\.(?:png|jpe?g|webp|gif|svg|avif)(?:$|[?#])/i;
const USAGE_COOKIE = "aio_dl_usage_v21";
const UNLOCK_COOKIE = "aio_support_unlock_v21";

function cookie(request,name){
  const raw=request.headers.get("cookie")||"";
  for(const part of raw.split(";")){
    const [k,...rest]=part.trim().split("=");
    if(k===name) return decodeURIComponent(rest.join("=")||"");
  }
  return "";
}

function dayKey(){
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Europe/Warsaw",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date());
  const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

function usageCount(request,today){
  const raw=cookie(request,USAGE_COOKIE);
  const [day,countText]=raw.split("|");
  const count=Number(countText);
  return day===today&&Number.isFinite(count)?Math.max(0,count):0;
}

function setUsage(headers,today,count){
  headers.append("Set-Cookie",
    `${USAGE_COOKIE}=${encodeURIComponent(today+"|"+count)}; Path=/; Max-Age=${60*60*24*3}; SameSite=Lax`);
}

async function recordAccessEvent(context,eventType,target){try{await ensureSchema(context.env);await context.env.COMMUNITY_DB.prepare(`INSERT INTO aio_access_events(id,event_type,kind,target,path,method,visitor_hash,user_id,day,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),eventType,"download",String(target||"").slice(0,180),new URL(context.request.url).pathname,"",null,null,dayKey(),new Date().toISOString()).run();}catch(_){}}

function protectedRequest(request){
  const url=new URL(request.url);
  const path=decodeURIComponent(url.pathname);
  if(IMAGE.test(path)) return false;
  return PROTECTED.test(path);
}

async function handle(context){
  const {request}=context;
  if(!protectedRequest(request)) return context.next();

  const today=dayKey();
  if(cookie(request,UNLOCK_COOKIE)===today) return context.next();

  const count=usageCount(request,today);
  if(count<1){
    recordAccessEvent(context,"direct_free",new URL(request.url).pathname.split("/").pop()||"plik");
    const response=await context.next();
    const headers=new Headers(response.headers);
    setUsage(headers,today,1);
    return new Response(response.body,{
      status:response.status,
      statusText:response.statusText,
      headers
    });
  }

  const url=new URL(request.url);
  recordAccessEvent(context,"direct_limit",url.pathname.split("/").pop()||"plik");
  const gate=new URL("/downloads.html",url.origin);
  gate.searchParams.set("aio_direct",url.pathname+url.search);
  return Response.redirect(gate.toString(),302);
}

export const onRequestGet=handle;
export const onRequestHead=handle;
