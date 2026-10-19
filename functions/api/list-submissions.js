/* AIO Panel Lists — zgłoszenia od zalogowanych użytkowników, bez zmian w istniejącym API. */
import {json, requireUser, requireAdmin, getSession, errorResponse, cleanText, isoNow, sha256} from '../_community.js';
import {validateAioZip, prepareAioZip, AIO_ZIP_MAX_BYTES} from '../_aio_list_validation.js';
import {createListNotice,ensureListInbox} from '../_aio_list_notice.js';
import {SLOT_LABELS,legacySlot} from '../_aio_list_slots.js';

const REPO = 'OliOli2013/PanelAIO-Lists';
const BASE = `https://api.github.com/repos/${REPO}`;
const LIMIT_PER_DAY = 3;
const MAX_ACTIVE_LISTS = 3; // one active list per satellite slot
const MAX_NEW_LISTS_30_DAYS = 30; // submitted ZIPs per 30 days; linked historical lists are excluded
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
        created_at TEXT NOT NULL, reviewed_at TEXT, published_at TEXT, update_of TEXT, satellite_slot TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
      )`),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_lists_user ON aio_list_submissions(user_id,created_at)'),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_lists_status ON aio_list_submissions(status,created_at)'),
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_list_trusted_publishers (
        user_id TEXT PRIMARY KEY, approved_at TEXT NOT NULL, approved_by TEXT, enabled INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
      )`),
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_list_upload_blocks (
        user_id TEXT PRIMARY KEY, reason TEXT NOT NULL, blocked_by TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
      )`)
    ]);
    // Existing production D1 tables date from V1.1. Migrate additively.
    const cols=await env.COMMUNITY_DB.prepare('PRAGMA table_info(aio_list_submissions)').all();
    if(!(cols.results||[]).some(c=>c.name==='update_of')) {
      try {await env.COMMUNITY_DB.prepare('ALTER TABLE aio_list_submissions ADD COLUMN update_of TEXT').run();}
      catch(e) {
        const retry=await env.COMMUNITY_DB.prepare('PRAGMA table_info(aio_list_submissions)').all();
        if(!(retry.results||[]).some(c=>c.name==='update_of')) throw e;
      }
    }
    if(!(cols.results||[]).some(c=>c.name==='satellite_slot')){
      try{await env.COMMUNITY_DB.prepare("ALTER TABLE aio_list_submissions ADD COLUMN satellite_slot TEXT NOT NULL DEFAULT ''").run();}
      catch(e){
        const retry=await env.COMMUNITY_DB.prepare('PRAGMA table_info(aio_list_submissions)').all();
        if(!(retry.results||[]).some(c=>c.name==='satellite_slot'))throw e;
      }
    }
    // Linked historical GitHub entries have real authors, but were published before this panel.
    // An admin must bind each entry to a registered account. NEVER infer ownership from a public name.
    for (const [column, definition] of [
      ['source_type', "TEXT NOT NULL DEFAULT 'community'"],
      ['manifest_url', "TEXT NOT NULL DEFAULT ''"]
    ]) {
      const current=await env.COMMUNITY_DB.prepare('PRAGMA table_info(aio_list_submissions)').all();
      if(!(current.results||[]).some(x=>x.name===column)){
        try {await env.COMMUNITY_DB.prepare(`ALTER TABLE aio_list_submissions ADD COLUMN ${column} ${definition}`).run();}
        catch(e){const retry=await env.COMMUNITY_DB.prepare('PRAGMA table_info(aio_list_submissions)').all();
          if(!(retry.results||[]).some(x=>x.name===column))throw e;}
      }
    }
    await env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_lists_active_manifest ON aio_list_submissions(manifest_id,status)').run();
    await env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_lists_update_of ON aio_list_submissions(update_of,status)').run();
    await env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_lists_user_slot ON aio_list_submissions(user_id,satellite_slot,status)').run();
    // All historical published/removed community lists were originally manually approved.
    // Keep enabled=0 untouched when an owner has revoked trust.
    await env.COMMUNITY_DB.prepare(`INSERT OR IGNORE INTO aio_list_trusted_publishers(user_id,approved_at,approved_by,enabled)
      SELECT user_id, MIN(COALESCE(reviewed_at,published_at,created_at)),NULL,1
      FROM aio_list_submissions WHERE status IN ('published','removed','applied')
      GROUP BY user_id`).run();
    // Historical rows have no satellite_slot; infer only if explicit in the NAME.
    const olds=await env.COMMUNITY_DB.prepare(`SELECT id,name,description FROM aio_list_submissions
      WHERE update_of IS NULL AND satellite_slot='' AND status IN ('pending','publish_failed','publishing','published','removing') LIMIT 200`).all();
    for(const row of olds.results||[]){
      const slot=legacySlot(row.name,row.description);
      if(slot)await env.COMMUNITY_DB.prepare("UPDATE aio_list_submissions SET satellite_slot=? WHERE id=? AND satellite_slot=''").bind(slot,row.id).run();
    }
  })().catch(e=>{tablePromise=null;throw e;});
  await tablePromise;
}
function publicRow(row, owner=false) {
  return {id:row.id, user_id:owner?row.user_id:undefined,
    author:owner?row.author:undefined,name:row.name,description:row.description,
    version:row.version,file_name:row.file_name,file_size:row.file_size,
    status:row.status, created_at:row.created_at,review_reason:row.review_reason,
    reviewed_at:row.reviewed_at,published_at:row.published_at,
    update_of:row.update_of||null,satellite_slot:row.satellite_slot||null,linked_legacy:row.source_type==='legacy',
    report:JSON.parse(row.report_json||'{}'),manifest_id:row.manifest_id};
}
async function ownList(env,userId) {
  const rr=await env.COMMUNITY_DB.prepare('SELECT * FROM aio_list_submissions WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(userId).all();
  return (rr.results||[]).map(r=>publicRow(r));
}
async function isTrusted(env,userId){
  const row=await env.COMMUNITY_DB.prepare('SELECT enabled FROM aio_list_trusted_publishers WHERE user_id=?').bind(userId).first();
  return Number(row?.enabled)===1;
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
    // Owner can unlist pre-existing channel archives that were never submitted via AIO.
    // A GitHub outage must never disable the regular moderation panel.
    let legacy=[],manifest_error=null;
    try {
      const snap=await repoSnapshot(env);
      const rr=await env.COMMUNITY_DB.prepare("SELECT manifest_id FROM aio_list_submissions WHERE update_of IS NULL AND manifest_id IS NOT NULL AND status IN ('published','publishing','removing','editing')").all();
      const managed=new Set((rr.results||[]).map(x=>x.manifest_id));
      legacy=snap.arr.filter(x=>x && x.type!=='BOUQUET' && typeof x.id==='string' && !managed.has(x.id))
        .map(x=>({id:x.id,name:String(x.name||''),author:String(x.author||''),version:String(x.version||''),url:String(x.url||''),
          can_link:!!safeArchivedUrl(x.url)&&snap.arr.filter(y=>y?.id===x.id).length===1}));
    } catch(e) {manifest_error='Nie można teraz pobrać katalogu GitHub. Zgłoszenia są dostępne.';}
    return json({ok:true,authenticated:true,is_owner:true,items:(rr.results||[]).map(r=>publicRow(r,true)),blocks:bb.results||[],legacy,manifest_error,policy:{max_active:MAX_ACTIVE_LISTS,max_new_30d:MAX_NEW_LISTS_30_DAYS,slots:SLOT_LABELS}});
  }
  const account=await env.COMMUNITY_DB.prepare('SELECT email FROM community_auth WHERE user_id=?').bind(session.user.id).first();
  return json({ok:true,authenticated:true,is_owner:!!session.user.is_owner,user:session.user,account_email:account?.email||null,
    blocked:blocked?.reason||null,items:await ownList(env,session.user.id),
    trusted_publisher:await isTrusted(env,session.user.id),
    policy:{max_active:MAX_ACTIVE_LISTS,max_new_30d:MAX_NEW_LISTS_30_DAYS,slots:SLOT_LABELS}});
}
async function upload(request,env) {
  const s=await requireUser(request,env);
  // Nie przyjmuj nowych zgłoszeń, jeżeli nie można zapisać ich w skrzynce administratora.
  await ensureListInbox(env);
  if(await isBlocked(env,s.user.id)) throw httpError(403,'Administrator cofnął możliwość dodawania list na tym koncie.');
  const n=Number(request.headers.get('content-length')||0);
  if(n && n>AIO_ZIP_MAX_BYTES+1024*128) throw httpError(413,'Przekroczono limit przesyłania 12 MB.');
  const form=await request.formData();
  const {name,description,version}=safeMetadata(form);
  const updateOf=String(form.get('update_of')||'').trim();
  if(updateOf&&!idValid(updateOf))throw httpError(400,'Nieprawidłowy identyfikator aktualizowanej listy.');
  const base=updateOf?await env.COMMUNITY_DB.prepare("SELECT * FROM aio_list_submissions WHERE id=? AND user_id=? AND update_of IS NULL AND status='published'").bind(updateOf,s.user.id).first():null;
  if(updateOf&&(!base||!managedPath(base)))throw httpError(403,'Możesz aktualizować wyłącznie własną opublikowaną listę.');
  const declaredSlot=String(form.get('satellite_slot')||'').trim();
  if(!Object.hasOwn(SLOT_LABELS,declaredSlot)) throw httpError(400,'Wybierz jedną z trzech kategorii satelitarnych.');
  if(base?.satellite_slot && base.satellite_slot!==declaredSlot)
    throw httpError(409,'Aktualizacja musi zachować kategorię satelitów dotychczasowej listy.');
  const file=form.get('file');
  if(!(file instanceof File)) throw httpError(400,'Wybierz archiwum ZIP.');
  if(!/\.zip$/i.test(file.name) || file.size>AIO_ZIP_MAX_BYTES || file.size<22) throw httpError(413,'Obsługujemy wyłącznie pliki .zip do 12 MB.');
  const db=env.COMMUNITY_DB;
  const day=new Date().toISOString().slice(0,10);
  const limit=await db.prepare("SELECT COUNT(*) AS n FROM aio_list_submissions WHERE user_id=? AND created_at>=? AND source_type!='legacy'").bind(s.user.id,day).first();
  if(Number(limit?.n||0)>=LIMIT_PER_DAY) throw httpError(429,'Limit 3 nowych zgłoszeń dziennie. Spróbuj jutro.');
  const pending=await db.prepare("SELECT COUNT(*) AS n FROM aio_list_submissions WHERE user_id=? AND status IN ('pending','publish_failed','publishing')").bind(s.user.id).first();
  if(Number(pending?.n||0)>=3) throw httpError(429,'Masz już 3 nierozpatrzone zgłoszenia. Poczekaj na ocenę.');
  const source=await file.arrayBuffer();
  const {report,cleanedBytes}=await prepareAioZip(source);
  if(!report.ok) return json({ok:false,validation:report,error:'Popraw wskazane błędy archiwum i prześlij je ponownie.'},422);
  // Drugi test po oczyszczeniu wyklucza publikację niezgodnego ZIP.
  const cleanReport=await validateAioZip(cleanedBytes.buffer);
  if(!cleanReport.ok) throw httpError(422,'Oczyszczone archiwum nie przeszło kontroli. Prześlij zgłoszenie administratorowi.');
  if(!report.satellite_slot || report.satellite_slot!==declaredSlot || cleanReport.satellite_slot!==declaredSlot){
    return json({ok:false,error:'Satelity wykryte w kanałach ZIP nie odpowiadają wybranej kategorii. Wybierz właściwy zestaw i prześlij pełną listę DVB.',validation:{...report,errors:[...(report.errors||[]),{code:'SATELLITE_SLOT',detail:'Wykryte pozycje: '+(report.satellites||[]).map(x=>(x/10).toFixed(1)+'°E').join(', ')+'. Dozwolone: 13°E, 13°E + 19,2°E, lub 13°E + 19,2°E + kolejne satelity.'}]}},422);
  }
  // New lists cannot occupy an existing slot; updates must point to the same owned base.
  if(!base){
    const occupied=await db.prepare(`SELECT name,satellite_slot FROM aio_list_submissions
      WHERE user_id=? AND update_of IS NULL AND status IN ('pending','publish_failed','publishing','published','removing','editing')
        AND (satellite_slot=? OR satellite_slot='') LIMIT 1`).bind(s.user.id,declaredSlot).first();
    if(occupied)throw httpError(409,occupied.satellite_slot
      ? 'Masz już listę w tej kategorii: „'+occupied.name+'”. Użyj przy niej przycisku „Aktualizuj listę”, zamiast dodawać nową.'
      : 'Masz starszą listę bez kategorii. Zaktualizuj ją lub poproś administratora o przypisanie satelitów.');
  }
  const trusted=await isTrusted(env,s.user.id);
  const bytes=cleanedBytes;
  const id=crypto.randomUUID(),r2Key=`aio-list-submissions/${s.user.id}/${id}.zip`, hash=await sha256(bytes);
  await env.COMMUNITY_MEDIA.put(r2Key,bytes,{httpMetadata:{contentType:'application/zip',cacheControl:'private, no-store'},customMetadata:{owner:s.user.id,kind:'aio-list-review'}});
  try{
    // All quotas/ownership checks happen atomically with INSERT to resist
    // concurrent submissions from the same account or different IPs.
    const since30=new Date(Date.now()-30*86400000).toISOString();
    // Existing lists are updated in place: no second manifest ID, no removal, no new GitHub URL.
    // Concurrent updates to the same base are rejected, including retries still pending.
    const common=`INSERT INTO aio_list_submissions
      (id,user_id,name,description,version,file_name,r2_key,file_size,zip_sha256,report_json,status,created_at,update_of,satellite_slot)
      SELECT ?,?,?,?,?,?,?,?,?,?,'pending',?,?,?`;
    const params=[id,s.user.id,name,description,version,cleanText(file.name,170),r2Key,bytes.byteLength,hash,JSON.stringify(report),isoNow(),base?.id||null,declaredSlot];
    let result;
    if(base){
      result=await db.prepare(`${common} WHERE
        (SELECT COUNT(*) FROM aio_list_submissions WHERE user_id=? AND created_at>=? AND source_type!='legacy')<?
        AND (SELECT COUNT(*) FROM aio_list_submissions WHERE user_id=? AND created_at>=? AND source_type!='legacy')<?
        AND NOT EXISTS(SELECT 1 FROM aio_list_submissions WHERE update_of=? AND status IN ('pending','publish_failed','publishing'))
        AND EXISTS(SELECT 1 FROM aio_list_submissions WHERE id=? AND user_id=? AND status='published')`)
        .bind(...params,s.user.id,day,LIMIT_PER_DAY,s.user.id,since30,MAX_NEW_LISTS_30_DAYS,base.id,base.id,s.user.id).run();
    }else{
      result=await db.prepare(`${common} WHERE
        (SELECT COUNT(*) FROM aio_list_submissions WHERE user_id=? AND created_at>=? AND source_type!='legacy')<?
        AND (SELECT COUNT(*) FROM aio_list_submissions WHERE user_id=? AND status IN ('pending','publish_failed','publishing'))<3
        AND (SELECT COUNT(*) FROM aio_list_submissions WHERE user_id=? AND update_of IS NULL AND status IN ('pending','publish_failed','publishing','published','removing','editing'))<?
        AND (SELECT COUNT(*) FROM aio_list_submissions WHERE user_id=? AND created_at>=? AND source_type!='legacy')<?
        AND NOT EXISTS(SELECT 1 FROM aio_list_submissions WHERE user_id=? AND update_of IS NULL AND (satellite_slot=? OR satellite_slot='') AND status IN ('pending','publish_failed','publishing','published','removing','editing'))
        AND NOT EXISTS(SELECT 1 FROM aio_list_submissions WHERE user_id=? AND update_of IS NULL AND name=? COLLATE NOCASE AND status IN ('pending','publish_failed','publishing','published','removing','editing'))
        AND NOT EXISTS(SELECT 1 FROM aio_list_submissions WHERE zip_sha256=? AND user_id<>? AND status IN ('pending','published','publishing'))`)
        .bind(...params,s.user.id,day,LIMIT_PER_DAY,s.user.id,s.user.id,MAX_ACTIVE_LISTS,s.user.id,since30,MAX_NEW_LISTS_30_DAYS,s.user.id,declaredSlot,s.user.id,name,hash,s.user.id).run();
    }
    if(!result.meta?.changes)throw httpError(409,base?'Jest już aktywna aktualizacja tej listy lub przekroczono limit zgłoszeń.':'Limit kategorii, nazwy albo zgłoszeń. Użyj przycisku „Aktualizuj” przy istniejącej liście.');
  }catch(e){await env.COMMUNITY_MEDIA.delete(r2Key).catch(()=>{});throw e;}
  if(trusted){
    try{
      const row=await db.prepare('SELECT * FROM aio_list_submissions WHERE id=?').bind(id).first();
      const published=await publishSubmission(env,row,s.user.id,false);
      return json({ok:true,id,status:'published',validation:report,message:published.message},201);
    }catch(e){
      // The row and safe R2 backup survive; author may retry without submitting another list.
      return json({ok:true,id,status:'publish_failed',validation:report,
        message:'Lista została zweryfikowana, ale publikacja na GitHub nie powiodła się: '+String(e.message||'Błąd').slice(0,190)+'. Użyj „Ponów publikację” przy zgłoszeniu.'},201);
    }
  }
  try{
    await createListNotice(env,{senderId:s.user.id,kind:'submission',
      subject:(base?'Aktualizacja listy: ':'Pierwsza lista do zatwierdzenia: ')+name,
      body:`Zgłoszenie od użytkownika ${s.user.display_name}. Zestaw: ${SLOT_LABELS[declaredSlot]}. Wersja ${version}. Opis: ${description}. ${base?'Aktualizacja własnej opublikowanej listy.':'Zatwierdzenie nada autorowi możliwość samodzielnej publikacji.'}`,
      listId:id});
  }catch(e){console.error('[AIO LISTS] Nie udało się zapisać powiadomienia o pierwszej liście.');}
  return json({ok:true,id,status:'pending',validation:report,message:base?'Aktualizacja oczekuje na zatwierdzenie.':'Pierwsza lista przekazana do zatwierdzenia administratora. Po jej akceptacji kolejne listy opublikujesz samodzielnie.'},201);
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
async function publishTree(env,snapshot,arr,addPath,zipBytes=null,deletePath=null,purpose=null) {
  const tree=[{path:'manifest.json',mode:'100644',type:'blob',content:JSON.stringify(arr,null,2)+'\n'}];
  if(addPath) {
    const blob=await git(env,'POST','/git/blobs',{content:base64(new Uint8Array(zipBytes)),encoding:'base64'});
    tree.push({path:addPath,mode:'100644',type:'blob',sha:blob.sha});
  }
  if(deletePath) tree.push({path:deletePath,mode:'100644',type:'blob',sha:null});
  const updated=await git(env,'POST','/git/trees',{base_tree:snapshot.tree,tree});
  const operation=purpose||(addPath?'publish':(deletePath?'remove':'modify'));
  const commit=await git(env,'POST','/git/commits',{message:`AIO Lists: ${operation} reviewed channel list`,tree:updated.sha,parents:[snapshot.parent]});
  await git(env,'PATCH','/git/refs/heads/main',{sha:commit.sha,force:false});
  return commit.sha;
}
// Author identity is the authenticated D1 user_id, never an IP address or display name.
function managedPath(row) {
  if(!row||row.update_of!=null)return false;
  if(row.source_type==='legacy')return typeof row.manifest_id==='string'&&row.manifest_id.length>0&&
    !!row.manifest_url&&safeArchivedUrl(row.manifest_url)===row.archive_path;
  return /^community_[a-f0-9]{32}$/.test(row.manifest_id||'') &&
    /^archives\/Community_[a-f0-9]{32}\.zip$/.test(row.archive_path||'') &&
    row.manifest_id.slice(10)===row.archive_path.match(/^archives\/Community_([a-f0-9]{32})\.zip$/)?.[1];
}
function matchesUrl(row,url){return row.source_type==='legacy' ?
  url===row.manifest_url&&safeArchivedUrl(url)===row.archive_path : url===expectedUrl(row.archive_path);}
function expectedUrl(path) {return `https://raw.githubusercontent.com/${REPO}/main/${path}`;}
function safeArchivedUrl(url) {
  // No external URLs, no query strings, no percent-encoded slashes/path traversal.
  try {
    const u=new URL(url);
    if(u.search||u.hash||u.username||u.password)return null;
    let path='';
    if(u.origin==='https://raw.githubusercontent.com') {
      const pre=`/${REPO}/main/archives/`;
      if(!u.pathname.startsWith(pre))return null;
      path=u.pathname.slice(pre.length);
    } else if(u.origin==='https://github.com') {
      const pre=`/${REPO}/raw/main/archives/`;
      if(!u.pathname.startsWith(pre))return null;
      path=u.pathname.slice(pre.length);
    } else return null;
    if(/%2f|%5c/i.test(path))return null;
    const file=decodeURIComponent(path);
    if(!/^[a-zA-Z0-9._@+\-]+\.zip$/.test(file) || file==='.' || file.includes('..'))return null;
    return `archives/${file}`;
  }catch(_){return null;}
}
async function removeManaged(env,row,reason,actorId) {
  if(row.status!=='published' || !managedPath(row)) throw httpError(409,'Można usunąć wyłącznie opublikowaną listę utworzoną przez ten panel.');
  const db=env.COMMUNITY_DB;
  const lock=await db.prepare("UPDATE aio_list_submissions SET status='removing' WHERE id=? AND user_id=? AND status='published'").bind(row.id,row.user_id).run();
  if(!lock.meta?.changes) throw httpError(409,'Lista jest już modyfikowana.');
  try {
    const snap=await repoSnapshot(env);
    const target=snap.arr.find(x=>x?.id===row.manifest_id);
    if(target) {
      if(snap.arr.filter(x=>x?.id===row.manifest_id).length!==1 || !matchesUrl(row,target.url))
        throw httpError(409,'Niejednoznaczny identyfikator lub zmieniony adres listy. Zatrzymano usuwanie.');
      const others=snap.arr.some(x=>x?.id!==row.manifest_id && x?.url===target.url);
      // Preserve original ZIP for historical lists; only unlist the manifest entry.
      await publishTree(env,snap,snap.arr.filter(x=>x?.id!==row.manifest_id),null,null,
        (others||row.source_type==='legacy')?null:row.archive_path,'remove');
    }
    await db.prepare("UPDATE aio_list_submissions SET status='removed',review_reason=?,reviewed_at=?,reviewer_id=? WHERE id=? AND status='removing'")
      .bind(reason,isoNow(),actorId,row.id).run();
    const updates=await db.prepare("SELECT id,r2_key FROM aio_list_submissions WHERE update_of=? AND status IN ('pending','publish_failed')").bind(row.id).all();
    await db.prepare("UPDATE aio_list_submissions SET status='rejected',review_reason='Lista bazowa została usunięta.' WHERE update_of=? AND status IN ('pending','publish_failed')").bind(row.id).run();
    for(const x of updates.results||[])await env.COMMUNITY_MEDIA.delete(x.r2_key).catch(()=>{});
    return json({ok:true,message:row.source_type==='legacy'?'Starsza lista wycofana z manifestu. Archiwum ZIP zachowano.':'Lista wycofana z manifestu. Niewspółdzielony ZIP usunięty z aktualnej gałęzi; historia Git pozostała.'});
  }catch(e){await db.prepare("UPDATE aio_list_submissions SET status='published' WHERE id=? AND status='removing'").bind(row.id).run().catch(()=>{});throw e;}
}
async function removeOwn(request,env,body) {
  const s=await requireUser(request,env);
  if(!idValid(body.id)) throw httpError(400,'Nieprawidłowe ID listy.');
  const row=await env.COMMUNITY_DB.prepare("SELECT * FROM aio_list_submissions WHERE id=? AND user_id=? AND update_of IS NULL AND status='published'").bind(body.id,s.user.id).first();
  if(!row) throw httpError(403,'Nie możesz usunąć cudzej lub nieopublikowanej listy.');
  if(String(body.confirm_name||'')!==row.name)throw httpError(400,'Potwierdź dokładną nazwę swojej listy.');
  return removeManaged(env,row,'Usunięta przez autora listy.',s.user.id);
}
async function hideLegacy(request,env,body) {
  const admin=await requireAdmin(request,env,true);
  const id=String(body.manifest_id||''),name=String(body.confirm_name||'');
  const reason=cleanText(body.reason,350);
  if(!id||id.length>180||reason.length<10) throw httpError(400,'Wskaż wpis i podaj powód wycofania (min. 10 znaków).');
  const db=env.COMMUNITY_DB;
  const snap=await repoSnapshot(env);
  const matches=snap.arr.filter(x=>x?.id===id && x?.type!=='BOUQUET');
  if(matches.length!==1)throw httpError(409,'Zduplikowany identyfikator manifestu. Najpierw napraw wpisy ręcznie w GitHub.');
  const target=matches[0];
  if(!target||target.name!==name) throw httpError(409,'Wpis zmienił się lub nie istnieje. Odśwież panel.');
  const managed=await db.prepare("SELECT 1 FROM aio_list_submissions WHERE manifest_id=? AND update_of IS NULL AND status IN ('published','publishing','removing','editing') LIMIT 1").bind(id).first();
  if(managed) throw httpError(409,'To lista z panelu Społeczności. Użyj jej przycisku usuwania.');
  let deletePath=null;
  if(body.delete_archive===true) {
    deletePath=safeArchivedUrl(target.url||'');
    if(!deletePath) throw httpError(400,'Nie można bezpiecznie usunąć archiwum z tego URL. Wycofaj jedynie wpis manifestu.');
    if(snap.arr.some(x=>x?.id!==id && x?.url===target.url)) throw httpError(409,'Inna lista używa tego samego ZIP. Usuń wyłącznie wpis manifestu.');
    // If file was manually removed already, don't fail a manifest-only removal.
    // publishTree base tree null deletion requires an existing path, so we stop with a clear error.
    const encoded=deletePath.split('/').map(encodeURIComponent).join('/');
    await git(env,'GET',`/contents/${encoded}?ref=main`);
  }
  await publishTree(env,snap,snap.arr.filter(x=>x?.id!==id),null,null,deletePath,'remove');
  return json({ok:true,message:deletePath?'Usunięto wpis manifestu i archiwum z bieżącej gałęzi GitHub.':'Wycofano listę z manifestu. Archiwum ZIP pozostało w repozytorium dla kopii bezpieczeństwa.'});
}

async function publishSubmission(env,row,actorId,manual=false){
  const db=env.COMMUNITY_DB,now=isoNow();
  if(!row || !['pending','publish_failed'].includes(row.status))throw httpError(409,'Brak zgłoszenia gotowego do publikacji.');
  if(await isBlocked(env,row.user_id))throw httpError(403,'Użytkownik ma blokadę dodawania list.');
  if(!manual && !await isTrusted(env,row.user_id))throw httpError(403,'Samodzielna publikacja wymaga wcześniejszej akceptacji administratora.');
  const lock=await db.prepare("UPDATE aio_list_submissions SET status='publishing',reviewer_id=?,reviewed_at=?,review_reason=NULL WHERE id=? AND status IN ('pending','publish_failed')")
    .bind(manual?actorId:null,manual?now:null,row.id).run();
  if(!lock.meta?.changes)throw httpError(409,'Publikacja jest już przetwarzana.');
    const base=row.update_of?await db.prepare("SELECT * FROM aio_list_submissions WHERE id=? AND user_id=? AND update_of IS NULL AND status='published'").bind(row.update_of,row.user_id).first():null;
    const manifestId=base?.manifest_id||'community_'+row.id.replace(/-/g,''),archivePath=base?.archive_path||'archives/Community_'+row.id.replace(/-/g,'')+'.zip';
    try {
      if(row.update_of && (!base||!managedPath(base))) throw httpError(409,'Pierwotna lista została usunięta lub zmieniła status. Aktualizacja wstrzymana.');
      const stored=await env.COMMUNITY_MEDIA.get(row.r2_key);
      if(!stored) throw httpError(410,'Nie znaleziono zatwierdzanego ZIP w R2.');
      const bytes=await stored.arrayBuffer();
      if(await sha256(bytes)!==row.zip_sha256) throw httpError(409,'ZIP w R2 różni się od sprawdzonej wersji.');
      const valid=await validateAioZip(bytes);
      if(!valid.ok) throw httpError(422,'Archiwum nie przeszło ponownej walidacji.');
      const snap=await repoSnapshot(env);
      let already=snap.arr.find(x=>x?.id===manifestId);
      if(row.update_of) {
        if(snap.arr.filter(x=>x?.id===manifestId).length!==1 || !already || !matchesUrl(base,already.url) || already.name!==base.name)
          throw httpError(409,'Zmieniła się nazwa, adres lub identyfikator listy bazowej. Aktualizacja wstrzymana.');
        if(snap.arr.some(x=>x?.id!==manifestId&&x?.type!=='BOUQUET'&&String(x.name||'').toLowerCase()===row.name.toLowerCase()))
          throw httpError(409,'Inna lista ma już taką nazwę.');
        if(snap.arr.some(x=>x?.id!==manifestId&&x?.url===already.url))
          throw httpError(409,'Archiwum jest współdzielone przez inny wpis. Aktualizacja ZIP wstrzymana.');
        if(base.version>row.version) throw httpError(409,'Wersja listy bazowej jest już nowsza niż zgłoszenie.');
        const next=snap.arr.map(x=>x?.id===manifestId?{...x,name:row.name,version:row.version,description:row.description}:x);
        await publishTree(env,snap,next,archivePath,bytes); // same ZIP and manifest ID, one Git commit
        await db.prepare("UPDATE aio_list_submissions SET name=?,version=?,description=?,satellite_slot=?,file_name=?,file_size=?,zip_sha256=?,report_json=?,published_at=? WHERE id=? AND status='published'")
          .bind(row.name,row.version,row.description,row.satellite_slot,row.file_name,row.file_size,row.zip_sha256,row.report_json,isoNow(),base.id).run();
        await db.prepare("UPDATE aio_list_submissions SET status='applied',published_at=?,archive_path=?,manifest_id=?,review_reason=NULL WHERE id=?").bind(isoNow(),archivePath,manifestId,row.id).run();
        await env.COMMUNITY_MEDIA.delete(row.r2_key).catch(()=>{});
        return {message:'Zaktualizowano istniejącą listę, zachowując jej identyfikator i adres ZIP.'};
      }
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
      if(manual)await db.prepare(`INSERT INTO aio_list_trusted_publishers(user_id,approved_at,approved_by,enabled)
        VALUES(?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET approved_at=excluded.approved_at,approved_by=excluded.approved_by,enabled=1`)
        .bind(row.user_id,isoNow(),actorId).run().catch(e=>console.error('[AIO LISTS] Trust migration next request',e));
      await env.COMMUNITY_MEDIA.delete(row.r2_key).catch(()=>{});
      return {message:'Lista opublikowana w GitHub. AIO Panel pobierze aktualny manifest przy kolejnym odświeżeniu.'};
    } catch(e) {
      await db.prepare("UPDATE aio_list_submissions SET status='publish_failed',review_reason=? WHERE id=? AND status='publishing'").bind(String(e.message||'Błąd publikacji').slice(0,500),row.id).run().catch(()=>{});
      throw e;
    }

}
// The only route for binding a pre-panel manifest entry to a user is an OWNER action.
// The e-mail address is read from the server-side account database, never trusted from a client session payload.
async function assignHistorical(request,env,body){
  await requireAdmin(request,env,true);
  const email=String(body.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw httpError(400,'Podaj poprawny adres e-mail zarejestrowanego konta.');
  const account=await env.COMMUNITY_DB.prepare('SELECT user_id FROM community_auth WHERE lower(email)=? LIMIT 1').bind(email).first();
  if(!account)throw httpError(404,'Nie znaleziono konta o wskazanym adresie e-mail.');
  const manifestId=String(body.manifest_id||'');
  if(!manifestId||manifestId.length>180||/[\x00-\x1f\x7f]/.test(manifestId))throw httpError(400,'Nieprawidłowy identyfikator listy.');
  const snap=await repoSnapshot(env);
  const found=snap.arr.filter(x=>x?.id===manifestId&&x.type!=='BOUQUET');
  if(found.length!==1)throw httpError(409,'Brak listy lub zduplikowany identyfikator w manifeście. Najpierw popraw konflikt w GitHub.');
  const entry=found[0],path=safeArchivedUrl(entry.url||'');
  if(!path)throw httpError(409,'Można przypisać tylko archiwa ZIP utrzymywane w PanelAIO-Lists.');
  if(snap.arr.filter(x=>x?.url===entry.url).length!==1)throw httpError(409,'Archiwum ZIP jest współdzielone przez kilka wpisów. Przypisanie wstrzymane.');
  if(String(body.confirm_name||'')!==entry.name)throw httpError(409,'Nazwa listy uległa zmianie. Odśwież panel.');
  const db=env.COMMUNITY_DB,id=crypto.randomUUID(),now=isoNow();
  const author=await db.prepare('SELECT display_name FROM community_profiles WHERE id=?').bind(account.user_id).first();
  if(!author)throw httpError(404,'Nie znaleziono profilu wskazanego konta.');
  const result=await db.prepare(`INSERT INTO aio_list_submissions
      (id,user_id,name,description,version,file_name,r2_key,file_size,zip_sha256,report_json,status,created_at,published_at,
       manifest_id,archive_path,satellite_slot,source_type,manifest_url)
      SELECT ?,?,?,?,?,?,'',0,'','{}','published',?,?,?,?,?, 'legacy',?
      WHERE NOT EXISTS(SELECT 1 FROM aio_list_submissions WHERE manifest_id=? AND update_of IS NULL
        AND status IN ('published','publishing','removing','editing'))`)
    .bind(id,account.user_id,entry.name,cleanText(entry.description||'Starsza lista przeniesiona pod opiekę autora.',500),
      String(entry.version||''),path.split('/').pop(),now,now,manifestId,path,legacySlot(entry.name)||'',entry.url,manifestId).run();
  if(!result.meta?.changes)throw httpError(409,'Ta lista ma już właściciela w bazie. Nie zmieniono uprawnień.');
  // Do not reinstate a disabled (enabled=0) publisher without an explicit admin action.
  await db.prepare(`INSERT OR IGNORE INTO aio_list_trusted_publishers(user_id,approved_at,approved_by,enabled) VALUES(?,?,?,1)`)
    .bind(account.user_id,now,(await requireAdmin(request,env,true)).user.id).run();
  return json({ok:true,message:'Przypisano starszą listę do istniejącego konta. ZIP i manifest pozostały bez zmian.',owner:author.display_name});
}
async function editOwnDetails(request,env,body){
  const s=await requireUser(request,env);
  if(await isBlocked(env,s.user.id))throw httpError(403,'Konto ma blokadę publikowania list.');
  if(!idValid(body.id))throw httpError(400,'Nieprawidłowa lista.');
  const db=env.COMMUNITY_DB,row=await db.prepare("SELECT * FROM aio_list_submissions WHERE id=? AND user_id=? AND update_of IS NULL AND status='published'").bind(body.id,s.user.id).first();
  if(!row||!managedPath(row))throw httpError(403,'Możesz zmieniać tylko swoje opublikowane listy.');
  const name=cleanText(body.name,90),description=cleanText(body.description,500),version=cleanText(body.version,10);
  if(name.length<5||description.length<10||!ISO_DAY.test(version)||!Number.isFinite(Date.parse(version+'T00:00:00Z'))||new Date(version+'T00:00:00Z').toISOString().slice(0,10)!==version)
    throw httpError(400,'Podaj poprawną nazwę (min. 5), opis (min. 10) i datę RRRR-MM-DD.');
  if(row.version&&version<row.version)throw httpError(409,'Data aktualizacji nie może być starsza od obecnej.');
  const lock=await db.prepare("UPDATE aio_list_submissions SET status='editing' WHERE id=? AND user_id=? AND status='published'").bind(row.id,s.user.id).run();
  if(!lock.meta?.changes)throw httpError(409,'Lista jest teraz modyfikowana.');
  try{
    const snap=await repoSnapshot(env);
    const items=snap.arr.filter(x=>x?.id===row.manifest_id);
    if(items.length!==1||items[0].name!==row.name||!matchesUrl(row,items[0].url))throw httpError(409,'Zmienił się wpis w GitHub. Edycja wstrzymana.');
    if(snap.arr.some(x=>x?.id!==row.manifest_id&&x?.type!=='BOUQUET'&&String(x.name||'').toLowerCase()===name.toLowerCase()))
      throw httpError(409,'Inna lista ma już taką nazwę.');
    if(name!==row.name||description!==row.description||version!==row.version){
      await publishTree(env,snap,snap.arr.map(x=>x?.id===row.manifest_id?{...x,name,description,version}:x),null,null,null,'edit');
    }
    await db.prepare("UPDATE aio_list_submissions SET name=?,description=?,version=?,status='published',published_at=? WHERE id=? AND user_id=? AND status='editing'")
      .bind(name,description,version,isoNow(),row.id,s.user.id).run();
    return json({ok:true,message:'Zmieniono dane listy bez usuwania ZIP, identyfikatora i adresu pobierania.'});
  }catch(e){await db.prepare("UPDATE aio_list_submissions SET status='published' WHERE id=? AND status='editing'").bind(row.id).run().catch(()=>{});throw e;}
}
async function adminPost(request,env,body) {
  const action=String(body.action||'');
  if(action==='delete_own') return removeOwn(request,env,body);
  if(action==='edit_details_own') return editOwnDetails(request,env,body);
  if(action==='assign_legacy') return assignHistorical(request,env,body);
  if(action==='cancel_own') {
    const author=await requireUser(request,env);
    if(!idValid(body.id)) throw httpError(400,'Nieprawidłowe ID zgłoszenia.');
    const row=await env.COMMUNITY_DB.prepare("SELECT * FROM aio_list_submissions WHERE id=? AND user_id=? AND status IN ('pending','publish_failed')").bind(body.id,author.user.id).first();
    if(!row) throw httpError(403,'Możesz wycofać tylko własne nierozpatrzone zgłoszenie.');
    const result=await env.COMMUNITY_DB.prepare("UPDATE aio_list_submissions SET status='cancelled',review_reason='Zgłoszenie wycofane przez autora.',reviewed_at=? WHERE id=? AND user_id=? AND status IN ('pending','publish_failed')")
      .bind(isoNow(),row.id,author.user.id).run();
    if(!result.meta?.changes) throw httpError(409,'Zgłoszenie jest już przetwarzane.');
    await env.COMMUNITY_MEDIA.delete(row.r2_key).catch(()=>{});
    return json({ok:true,message:'Twoje zgłoszenie zostało wycofane, nie trafi do AIO Panel.'});
  }
  if(action==='retry_own'){
    const user=await requireUser(request,env);
    if(!idValid(body.id))throw httpError(400,'Nieprawidłowe zgłoszenie.');
    const row=await env.COMMUNITY_DB.prepare("SELECT * FROM aio_list_submissions WHERE id=? AND user_id=? AND status='publish_failed'")
      .bind(body.id,user.user.id).first();
    if(!row)throw httpError(403,'Nie można ponowić tej publikacji.');
    const result=await publishSubmission(env,row,user.user.id,false);
    return json({ok:true,message:result.message});
  }
  if(action==='hide_legacy') return hideLegacy(request,env,body);
  const admin=await requireAdmin(request,env,true);
  const db=env.COMMUNITY_DB;
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
  if(action==='approve'){
    const published=await publishSubmission(env,row,admin.user.id,true);
    return json({ok:true,message:published.message});
  }
  if(action==='remove') {
    const reason=cleanText(body.reason,500);
    if(reason.length<10) throw httpError(400,'Podaj powód usunięcia (min. 10 znaków).');
    return removeManaged(env,row,reason,admin.user.id);
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
