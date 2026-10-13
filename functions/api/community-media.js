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

/*
 * Publiczny odczyt dotyczy wyłącznie załączników opublikowanych
 * w oficjalnych wpisach. Używamy instr() zamiast LIKE, ponieważ
 * Cloudflare D1 może zwracać "LIKE or GLOB pattern too complex"
 * przy wyszukiwaniu klucza R2 w polu JSON attachments.
 */
async function canReadPublic(env,key){
  const row=await env.COMMUNITY_DB.prepare(`
    SELECT id
    FROM community_posts
    WHERE status='published'
      AND kind='official'
      AND instr(COALESCE(attachments,''), ?) > 0
    LIMIT 1
  `).bind(key).first();
  return Boolean(row);
}

/* aio-maint-media-check-v1: member may access only own or actually published media. */
async function canReadMember(env,key){
  const db=env.COMMUNITY_DB;
  const posts=await db.prepare(`SELECT 1 FROM community_posts
    WHERE status='published' AND instr(COALESCE(attachments,''),?)>0 LIMIT 1`).bind(key).first();
  if(posts) return true;
  const chat=await db.prepare(`SELECT 1 FROM community_chat_messages
    WHERE status='published' AND instr(COALESCE(attachments,''),?)>0 LIMIT 1`).bind(key).first();
  if(chat) return true;
  const avatar=await db.prepare(`SELECT 1 FROM community_profiles WHERE avatar_key=? LIMIT 1`).bind(key).first();
  return !!avatar;
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

    const headers=new Headers();
    obj.writeHttpMetadata(headers);
    if(obj.httpEtag) headers.set("etag",obj.httpEtag);
    headers.set("x-content-type-options","nosniff");
    headers.set("cache-control",publicAllowed?"public, max-age=86400":"private, max-age=3600");

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
        cacheControl:"private, max-age=3600"
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
