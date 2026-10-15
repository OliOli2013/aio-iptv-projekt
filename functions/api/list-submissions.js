/* AIO Panel Lists — zgłoszenia od zalogowanych użytkowników, bez zmian w istniejącym API. */
import {json, requireUser, requireAdmin, getSession, errorResponse, cleanText, isoNow, sha256} from '../_community.js';
import {validateAioZip, prepareAioZip, AIO_ZIP_MAX_BYTES} from '../_aio_list_validation.js';

const REPO = 'OliOli2013/PanelAIO-Lists';
const BASE = `https://api.github.com/repos/${REPO}`;
const LIMIT_PER_DAY = 3;
let tablePromise = null;
function httpError(status, detail) {return Object.assign(new Error(detail),{status});}
function sameOrigin(request) {
  const origin=request.headers.get('Origin');
  if (origin && origin!==new URL(request.url).origin) return false;
  return request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
function idValid(id) {return /^[a-f0-9-]{36}$/.test(String(id||''));}
async function schema(env) {
  if(!env.COMMUNITY_DB || !env.COMMUNITY_MEDIA) throw new Error('Brak zasobu D1 lub R2.');
  if(!tablePromise) tablePromise=(async()=>{
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_list_submissions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', version TEXT NOT NULL, file_name TEXT NOT NULL,
        r2_key TEXT NOT NULL, file_size INTEGER NOT NULL, zip_sha256 TEXT NOT NULL,
        report_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        review_reason TEXT, reviewer_id TEXT, archive_path TEXT, manifest_id TEXT,
        created_at TEXT NOT NULL, reviewed_at TEXT, published_at TEXT,
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
      )`),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_lists_user ON aio_list_submissions(user_id,created_at)'),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_lists_status ON aio_list_submissions(status,created_at)'),
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_list_upload_blocks (
        user_id TEXT PRIMARY KEY, reason TEXT NOT NULL, blocked_by TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
      )`)
    ]);
  })().catch(e=>{tablePromise=null;throw e;});
  await tablePromise;
}
function publicRow(row, owner=false) {
  return {id:row.id, user_id:owner?row.user_id:undefined,
    author:owner?row.author:undefined,name:row.name,description:row.description,
    version:row.version,file_name:row.file_name,file_size:row.file_size,
    status:row.status, created_at:row.created_at,review_reason:row.review_reason,
    reviewed_at:row.reviewed_at,published_at:row.published_at,
    report:JSON.parse(row.report_json||'{}'),manifest_id:row.manifest_id};
}
async function ownList(env,userId) {
  const rr=await env.COMMUNITY_DB.prepare('SELECT * FROM aio_list_submissions WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(userId).all();
  return (rr.results||[]).map(r=>publicRow(r));
}
async function isBlocked(env,userId) {
  return env.COMMUNITY_DB.prepare('SELECT reason,created_at FROM aio_list_upload_blocks WHERE user_id=?').bind(userId).first();
}
const ISO_DAY = /^20\d\d-\d\d-\d\d$/;
function safeMetadata(form) {
  const name=cleanText(form.get('name'),90), description=cleanText(form.get('description'),500),version=cleanText(form.get('version'),10);
  if(name.length<5 || name.length>90) throw httpError(400,'Nazwa listy musi zawierać 5–90 znaków.');
  if(!ISO_DAY.test(version) || Number.isNaN(Date.parse(version+'T00:00:00Z')) || new Date(version+'T00:00:00Z').toISOString().slice(0,10)!==version)
    throw httpError(400,'Data wersji musi mieć postać RRRR-MM-DD.');
  if(description.length<10) throw httpError(400,'Dodaj opis listy (minimum 10 znaków).');
  if(!['1','true','on'].includes(String(form.get('legal')||''))) throw httpError(400,'Potwierdź zasady udostępniania list.');
  return {name,description,version};
}
async function userGet(request,env) {
  const session=await getSession(request,env);
  if(!session || session.blocked || session.banned) return json({ok:true,authenticated:false,items:[]});
  const blocked=await isBlocked(env,session.user.id);
  if(new URL(request.url).searchParams.get('view')==='admin') {
    const a=await requireAdmin(request,env,true);
    const rr=await env.COMMUNITY_DB.prepare(`SELECT s.*,p.display_name AS author
      FROM aio_list_submissions s JOIN community_profiles p ON p.id=s.user_id
      ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'publish_failed' THEN 1 WHEN 'publishing' THEN 2 ELSE 3 END, s.created_at DESC LIMIT 150`).all();
    const bb=await env.COMMUNITY_DB.prepare(`SELECT b.*,p.display_name AS author FROM aio_list_upload_blocks b
      LEFT JOIN community_profiles p ON p.id=b.user_id ORDER BY b.created_at DESC LIMIT 150`).all();
    return json({ok:true,authenticated:true,is_owner:true,items:(rr.results||[]).map(r=>publicRow(r,true)),blocks:bb.results||[]});
  }
  return json({ok:true,authenticated:true,is_owner:!!session.user.is_owner,user:session.user,
    blocked:blocked?.reason||null,items:await ownList(env,session.user.id)});
}
async function upload(request,env) {
  const s=await requireUser(request,env);
  if(await isBlocked(env,s.user.id)) throw httpError(403,'Administrator cofnął możliwość dodawania list na tym koncie.');
  const n=Number(request.headers.get('content-length')||0);
  if(n && n>AIO_ZIP_MAX_BYTES+1024*128) throw httpError(413,'Przekroczono limit przesyłania 12 MB.');
  const form=await request.formData();
  const {name,description,version}=safeMetadata(form);
  const file=form.get('file');
  if(!(file instanceof File)) throw httpError(400,'Wybierz archiwum ZIP.');
  if(!/\.zip$/i.test(file.name) || file.size>AIO_ZIP_MAX_BYTES || file.size<22) throw httpError(413,'Obsługujemy wyłącznie pliki .zip do 12 MB.');
  const db=env.COMMUNITY_DB;
  const day=new Date().toISOString().slice(0,10);
  const limit=await db.prepare('SELECT COUNT(*) AS n FROM aio_list_submissions WHERE user_id=? AND created_at>=?').bind(s.user.id,day).first();
  if(Number(limit?.n||0)>=LIMIT_PER_DAY) throw httpError(429,'Limit 3 nowych zgłoszeń dziennie. Spróbuj jutro.');
  const pending=await db.prepare("SELECT COUNT(*) AS n FROM aio_list_submissions WHERE user_id=? AND status IN ('pending','publish_failed','publishing')").bind(s.user.id).first();
  if(Number(pending?.n||0)>=3) throw httpError(429,'Masz już 3 nierozpatrzone zgłoszenia. Poczekaj na ocenę.');
  const source=await file.arrayBuffer();
  const {report,cleanedBytes}=await prepareAioZip(source);
  if(!report.ok) return json({ok:false,validation:report,error:'Popraw wskazane błędy archiwum i prześlij je ponownie.'},422);
  // Drugi test po oczyszczeniu wyklucza publikację niezgodnego ZIP.
  const cleanReport=await validateAioZip(cleanedBytes.buffer);
  if(!cleanReport.ok) throw httpError(422,'Oczyszczone archiwum nie przeszło kontroli. Prześlij zgłoszenie administratorowi.');
  const bytes=cleanedBytes;
  const id=crypto.randomUUID(),r2Key=`aio-list-submissions/${s.user.id}/${id}.zip`, hash=await sha256(bytes);
  await env.COMMUNITY_MEDIA.put(r2Key,bytes,{httpMetadata:{contentType:'application/zip',cacheControl:'private, no-store'},customMetadata:{owner:s.user.id,kind:'aio-list-review'}});
  try{
    await db.prepare(`INSERT INTO aio_list_submissions
      (id,user_id,name,description,version,file_name,r2_key,file_size,zip_sha256,report_json,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?)`).bind(id,s.user.id,name,description,version,cleanText(file.name,170),r2Key,bytes.byteLength,hash,JSON.stringify(report),isoNow()).run();
  }catch(e){await env.COMMUNITY_MEDIA.delete(r2Key).catch(()=>{});throw e;}
  return json({ok:true,id,status:'pending',validation:report,message:'Lista poprawna technicznie. Bezpieczna kopia ZIP (bez plików dodatkowych) została przekazana do zatwierdzenia.'},201);
}
async function git(env,method,path,body) {
  if(!env.AIO_LISTS_GITHUB_TOKEN) throw httpError(503,'Brak sekretu AIO_LISTS_GITHUB_TOKEN. Dodaj go w Cloudflare Pages.');
  const headers={'accept':'application/vnd.github+json','authorization':`Bearer ${env.AIO_LISTS_GITHUB_TOKEN}`,'x-github-api-version':'2022-11-28','user-agent':'AIO-List-Moderation/1.0'};
  if(body!==undefined) headers['content-type']='application/json';
  const r=await fetch(`${BASE}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  if(!r.ok) {
    console.error('[AIO List] GitHub API failure',method,path,r.status);
    throw httpError(502,`GitHub odrzucił publikację (${r.status}). Sprawdź token, uprawnienia i historię repozytorium.`);
  }
  if(r.status===204)return {};
  return r.json();
}
function base64(bytes) {
  let result='';
  for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(result);
}
function decodeBase64Unicode(str) {
  const bin=atob(str.replace(/\s/g,''));
  const bytes=Uint8Array.from(bin,x=>x.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function repoSnapshot(env) {
  const ref=await git(env,'GET','/git/ref/heads/main');
  const parent=ref.object?.sha;
  if(!/^[a-f\d]{40}$/.test(parent||'')) throw httpError(502,'Brak gałęzi main w repozytorium list.');
  const [commit,contents]=await Promise.all([
    git(env,'GET',`/git/commits/${parent}`),
    git(env,'GET','/contents/manifest.json?ref=main')
  ]);
  const arr=JSON.parse(decodeBase64Unicode(contents.content||''));
  if(!Array.isArray(arr)||!commit.tree?.sha) throw httpError(502,'Nieprawidłowa struktura manifest.json. Wstrzymano publikację.');
  return {arr,parent,tree:commit.tree.sha};
}
async function publishTree(env,snapshot,arr,addPath,zipBytes=null,deletePath=null) {
  const tree=[{path:'manifest.json',mode:'100644',type:'blob',content:JSON.stringify(arr,null,2)+'\n'}];
  if(addPath) {
    const blob=await git(env,'POST','/git/blobs',{content:base64(new Uint8Array(zipBytes)),encoding:'base64'});
    tree.push({path:addPath,mode:'100644',type:'blob',sha:blob.sha});
  }
  if(deletePath) tree.push({path:deletePath,mode:'100644',type:'blob',sha:null});
  const updated=await git(env,'POST','/git/trees',{base_tree:snapshot.tree,tree});
  const commit=await git(env,'POST','/git/commits',{message:`AIO Lists: ${addPath?'publish':'remove'} reviewed channel list`,tree:updated.sha,parents:[snapshot.parent]});
  await git(env,'PATCH','/git/refs/heads/main',{sha:commit.sha,force:false});
  return commit.sha;
}
async function adminPost(request,env,body) {
  const admin=await requireAdmin(request,env,true);
  const action=String(body.action||''),db=env.COMMUNITY_DB;
  if(action==='block'||action==='unblock') {
    const target=String(body.user_id||'');
    if(!target || target===admin.user.id) throw httpError(400,'Nie można zablokować właściciela.');
    const exists=await db.prepare('SELECT id FROM community_profiles WHERE id=?').bind(target).first();
    if(!exists) throw httpError(404,'Nie znaleziono użytkownika.');
    if(action==='block') {
      const reason=cleanText(body.reason,350);
      if(reason.length<10) throw httpError(400,'Podaj powód blokady (min. 10 znaków).');
      await db.prepare('INSERT INTO aio_list_upload_blocks(user_id,reason,blocked_by,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,blocked_by=excluded.blocked_by,created_at=excluded.created_at').bind(target,reason,admin.user.id,isoNow()).run();
    } else await db.prepare('DELETE FROM aio_list_upload_blocks WHERE user_id=?').bind(target).run();
    return json({ok:true});
  }
  if(!idValid(body.id)) throw httpError(400,'Nieprawidłowy identyfikator zgłoszenia.');
  const row=await db.prepare('SELECT * FROM aio_list_submissions WHERE id=?').bind(body.id).first();
  if(!row) throw httpError(404,'Nie znaleziono zgłoszenia.');
  const now=isoNow();
  if(action==='reject') {
    if(!['pending','publish_failed'].includes(row.status)) throw httpError(409,'Tego zgłoszenia nie można odrzucić.');
    const reason=cleanText(body.reason,500);
    if(reason.length<10) throw httpError(400,'Podaj autorowi konkretny powód odmowy (min. 10 znaków).');
    const changed=await db.prepare("UPDATE aio_list_submissions SET status='rejected',review_reason=?,reviewer_id=?,reviewed_at=? WHERE id=? AND status IN ('pending','publish_failed')").bind(reason,admin.user.id,now,row.id).run();
    if(!changed.meta?.changes) throw httpError(409,'Status zgłoszenia zmienił się w trakcie moderacji.');
    await env.COMMUNITY_MEDIA.delete(row.r2_key).catch(()=>{});
    return json({ok:true});
  }
  if(action==='approve') {
    if(!['pending','publish_failed'].includes(row.status)) throw httpError(409,'Lista nie oczekuje na zatwierdzenie.');
    if(await isBlocked(env,row.user_id)) throw httpError(403,'Użytkownik ma blokadę dodawania list.');
    const lock=await db.prepare("UPDATE aio_list_submissions SET status='publishing',reviewer_id=?,reviewed_at=?,review_reason=NULL WHERE id=? AND status IN ('pending','publish_failed')").bind(admin.user.id,now,row.id).run();
    if(!lock.meta?.changes) throw httpError(409,'Inny administrator już publikuje tę listę.');
    const manifestId='community_'+row.id.replace(/-/g,''),archivePath='archives/Community_'+row.id.replace(/-/g,'')+'.zip';
    try {
      const stored=await env.COMMUNITY_MEDIA.get(row.r2_key);
      if(!stored) throw httpError(410,'Nie znaleziono zatwierdzanego ZIP w R2.');
      const bytes=await stored.arrayBuffer();
      if(await sha256(bytes)!==row.zip_sha256) throw httpError(409,'ZIP w R2 różni się od sprawdzonej wersji.');
      const valid=await validateAioZip(bytes);
      if(!valid.ok) throw httpError(422,'Archiwum nie przeszło ponownej walidacji.');
      const snap=await repoSnapshot(env);
      let already=snap.arr.find(x=>x?.id===manifestId);
      if(already) {
        if(already.url!==`https://raw.githubusercontent.com/${REPO}/main/${archivePath}`) throw httpError(409,'Konflikt identyfikatora manifestu.');
      } else {
        if(snap.arr.some(x=>String(x?.name||'').toLowerCase()===row.name.toLowerCase() && x.type!=='BOUQUET'))
          throw httpError(409,'Lista o identycznej nazwie już istnieje w manifeście. Poproś autora o inną nazwę.');
        const author=await db.prepare('SELECT display_name FROM community_profiles WHERE id=?').bind(row.user_id).first();
        snap.arr.push({id:manifestId,name:row.name,author:author?.display_name||'Użytkownik AIO',version:row.version,description:row.description,
          url:`https://raw.githubusercontent.com/${REPO}/main/${archivePath}`});
        await publishTree(env,snap,snap.arr,archivePath,bytes);
      }
      await db.prepare("UPDATE aio_list_submissions SET status='published',published_at=?,archive_path=?,manifest_id=?,review_reason=NULL WHERE id=?").bind(isoNow(),archivePath,manifestId,row.id).run();
      await env.COMMUNITY_MEDIA.delete(row.r2_key).catch(()=>{});
      return json({ok:true,message:'Lista opublikowana. AIO Panel pobierze aktualny manifest przy kolejnym odświeżeniu.'});
    } catch(e) {
      await db.prepare("UPDATE aio_list_submissions SET status='publish_failed',review_reason=? WHERE id=? AND status='publishing'").bind(String(e.message||'Błąd publikacji').slice(0,500),row.id).run().catch(()=>{});
      throw e;
    }
  }
  if(action==='remove') {
    if(row.status!=='published' || !row.manifest_id || !/^archives\/Community_[a-f0-9]{32}\.zip$/.test(row.archive_path||''))
      throw httpError(409,'Usunąć można tylko listę opublikowaną przez ten panel.');
    const reason=cleanText(body.reason,500);
    if(reason.length<10) throw httpError(400,'Podaj powód usunięcia (min. 10 znaków).');
    const lock=await db.prepare("UPDATE aio_list_submissions SET status='publishing' WHERE id=? AND status='published'").bind(row.id).run();
    if(!lock.meta?.changes) throw httpError(409,'Zmiana jest już przetwarzana.');
    try {
      const snap=await repoSnapshot(env);
      const target=snap.arr.find(x=>x?.id===row.manifest_id);
      if(target) {
        if(target.url!==`https://raw.githubusercontent.com/${REPO}/main/${row.archive_path}`) throw httpError(409,'Ścieżka archiwum w manifeście jest inna niż oczekiwana.');
        await publishTree(env,snap,snap.arr.filter(x=>x?.id!==row.manifest_id),null,null,row.archive_path);
      }
      await db.prepare("UPDATE aio_list_submissions SET status='removed',review_reason=?,reviewed_at=?,reviewer_id=? WHERE id=?").bind(reason,isoNow(),admin.user.id,row.id).run();
      return json({ok:true,message:'Lista usunięta z głównej gałęzi i manifestu. Historia Git nadal może zawierać archiwum.'});
    }catch(e){await db.prepare("UPDATE aio_list_submissions SET status='published' WHERE id=? AND status='publishing'").bind(row.id).run().catch(()=>{});throw e;}
  }
  throw httpError(400,'Nieznana operacja administracyjna.');
}
export async function onRequestGet({request,env}) {
  try{await schema(env);return await userGet(request,env);}catch(e){return errorResponse(e);}
}
export async function onRequestPost({request,env}) {
  if(!sameOrigin(request)) return json({ok:false,error:'Niedozwolone źródło żądania.'},403);
  try{
    await schema(env);
    const ct=request.headers.get('content-type')||'';
    if(ct.includes('multipart/form-data'))return await upload(request,env);
    if(!ct.includes('application/json')) throw httpError(415,'Nieobsługiwany typ żądania.');
    const body=await request.json().catch(()=>({}));
    return await adminPost(request,env,body);
  }catch(e){return errorResponse(e);}
}
