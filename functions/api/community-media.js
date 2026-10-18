/* aioSameOriginWrite: reject cross-site browser mutation requests. */
function aioSameOriginWrite(request) {
  const origin=request.headers.get('Origin');
  if (origin) {
    try { if (origin !== new URL(request.url).origin) return false; }
    catch (_) { return false; }
  }
  const site=request.headers.get('Sec-Fetch-Site');
  return site!=='cross-site';
}
import {
  json, ensureSchema, requireUser, getSession, isAdmin, errorResponse, cleanText
} from "../_community.js";

function extFor(type,name){
  const map={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"};
  if(map[type]) return map[type];
  const m=String(name||"").toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return m?m[1]:"bin";
}

/* AIO MEDIA & SECURITY V2
 * instr() is only a prefilter. Authorization always compares complete JSON keys.
 * D1 stores post/chat attachments as JSON; older records may use `path`.
 */
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const IMAGE_EXT = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
function readAttachments(raw){
  let arr;
  try{arr=Array.isArray(raw)?raw:JSON.parse(raw||'[]');}catch(_){return [];}
  if(!Array.isArray(arr))return [];
  return arr.filter(x=>x&&typeof x==='object').map(x=>({
    key:String(x.key||x.path||''),type:String(x.type||'').toLowerCase()
  }));
}
function containsExactKey(attachments,key){
  return readAttachments(attachments).some(x=>x.key===key);
}
function isFirstImage(attachments,key){
  const first=readAttachments(attachments).find(x=>IMAGE_TYPES.has(x.type));
  return Boolean(first&&first.key===key);
}
async function candidateRows(env,table,key){
  // Only fixed table names are permitted; never interpolate request parameters as SQL.
  if(table!=='community_posts'&&table!=='community_chat_messages')throw new Error('Invalid media table');
  const selection=table==='community_posts'?'attachments, kind':'attachments';
  const res=await env.COMMUNITY_DB.prepare(`SELECT ${selection} FROM ${table}
    WHERE status='published' AND instr(COALESCE(attachments,''),?)>0 LIMIT 60`).bind(key).all();
  return res.results||[];
}
async function canReadPublic(env,key){
  const posts=await candidateRows(env,'community_posts',key);
  // Every attached image of a published official post remains public.
  // Published ordinary posts expose only the first attached image.
  // Fetch kind with attachments so both visibility branches share the exact-key check.
  return posts.some(row=>row.kind==='official'
    ? containsExactKey(row.attachments,key)
    : row.kind==='community' && isFirstImage(row.attachments,key));
}
async function canReadMember(env,key){
  const posts=await candidateRows(env,'community_posts',key);
  if(posts.some(x=>containsExactKey(x.attachments,key)))return true;
  const chat=await candidateRows(env,'community_chat_messages',key);
  if(chat.some(x=>containsExactKey(x.attachments,key)))return true;
  const avatar=await env.COMMUNITY_DB.prepare(`SELECT 1 FROM community_profiles WHERE avatar_key=? LIMIT 1`).bind(key).first();
  return !!avatar;
}
function safeImageMime(obj,key){
  const raw=String(obj.httpMetadata?.contentType||'').split(';',1)[0].trim().toLowerCase();
  // Reject active document types even if the object key has an image extension.
  if(raw)return IMAGE_TYPES.has(raw)?raw:null;
  return IMAGE_EXT[String(key).split('.').pop().toLowerCase()]||null;
}

export async function onRequestGet({request,env}) {
  try{
    await ensureSchema(env);

    const url=new URL(request.url);
    const key=cleanText(url.searchParams.get("key")||"",500);
    if(!key) return json({ok:false,error:"Brak klucza pliku."},400);

    let session=null;
    try{session=await getSession(request,env);}catch(_){}

    if(session?.blocked || session?.banned){
      return json({ok:false,error:"Dostęp do społeczności jest zablokowany."},403);
    }

    /*
     * Zalogowany użytkownik ma dostęp do mediów Społeczności
     * bez dodatkowego skanowania tabeli postów.
     * Dla gościa sprawdzamy, czy plik należy do publicznego wpisu oficjalnego.
     */
    let publicAllowed=false;
    if(session && !key.startsWith(`${session.user.id}/`) && !isAdmin(session)) {
      const allowed=await canReadMember(env,key);
      if(!allowed) return json({ok:false,error:"Nie masz dostępu do tego pliku."},403);
    }
    if(!session){
      publicAllowed=await canReadPublic(env,key);
      if(!publicAllowed){
        return json({ok:false,error:"Zaloguj się, aby wyświetlić ten plik."},401);
      }
    }

    const obj=await env.COMMUNITY_MEDIA.get(key);
    if(!obj) return json({ok:false,error:"Nie znaleziono pliku."},404);

    const mime=safeImageMime(obj,key);
    if(!mime)return json({ok:false,error:"Nieobsługiwany format obrazu."},415);
    const headers=new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("content-type",mime);
    headers.delete("etag"); // no cache validators on entitlement-dependent resources
    headers.set("x-content-type-options","nosniff");
    headers.set("referrer-policy","no-referrer");
    // Hidden/deleted post images must be reauthorized on the very next request.
    // Cache of previously downloaded copies cannot be revoked retroactively.
    headers.set("cache-control","private, no-store, max-age=0");
    headers.set("pragma","no-cache");
    headers.set("expires","0");
    return new Response(obj.body,{headers});
  }catch(e){
    return errorResponse(e);
  }
}

export async function onRequestPost({request,env}) {
  if (!aioSameOriginWrite(request)) return new Response(JSON.stringify({ok:false,error:"Niedozwolone źródło żądania."}),
    {status:403,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  try{
    await ensureSchema(env);
    const s=await requireUser(request,env);

    const form=await request.formData();
    const file=form.get("file");
    const kind=cleanText(form.get("kind")||"post",30);

    if(!(file instanceof File)) return json({ok:false,error:"Nie wybrano pliku."},400);

    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){
      return json({ok:false,error:"Dozwolone są obrazy JPG, PNG, WEBP i GIF."},400);
    }

    const max=5*1024*1024;
    if(file.size>max) return json({ok:false,error:"Plik jest większy niż 5 MB."},413);

    const ext=extFor(file.type,file.name);
    const safeKind=kind==="avatar"?"avatar":kind==="chat"?"chat":"post";
    const key=`${s.user.id}/${safeKind}/${crypto.randomUUID()}.${ext}`;

    await env.COMMUNITY_MEDIA.put(key,file.stream(),{
      httpMetadata:{
        contentType:file.type,
        cacheControl:"private, no-store, max-age=0"
      },
      customMetadata:{
        owner:s.user.id,
        originalName:cleanText(file.name,180),
        kind:safeKind
      }
    });

    return json({
      ok:true,
      key,
      name:cleanText(file.name,180),
      type:file.type,
      size:file.size,
      url:`/api/community-media?key=${encodeURIComponent(key)}`
    },201);

  }catch(e){
    return errorResponse(e);
  }
}

export async function onRequestDelete({request,env}) {
  if (!aioSameOriginWrite(request)) return new Response(JSON.stringify({ok:false,error:"Niedozwolone źródło żądania."}),
    {status:403,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  try{
    await ensureSchema(env);
    const s=await requireUser(request,env);

    const url=new URL(request.url);
    const key=cleanText(url.searchParams.get("key")||"",500);
    if(!key) return json({ok:false,error:"Brak klucza pliku."},400);

    if(!key.startsWith(`${s.user.id}/`)&&!isAdmin(s)){
      return json({ok:false,error:"Brak uprawnień."},403);
    }

    await env.COMMUNITY_MEDIA.delete(key);
    return json({ok:true});

  }catch(e){
    return errorResponse(e);
  }
}
