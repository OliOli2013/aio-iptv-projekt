/* Private owner-only download activity. No public or moderator access. */
import { requireAdmin, json } from '../_community.js';
import { ensureOwnerDownloadSchema } from '../_aio_owner_downloads.js';

function intIn(value, choices, fallback) {
  const n = Number(value);
  return choices.includes(n) ? n : fallback;
}
function clampText(value) { return String(value || '').trim().slice(0,80); }

function validDay(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00.000Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===value;
}
function sameOrigin(request){
  const origin=request.headers.get('Origin');
  return (!origin || origin===new URL(request.url).origin) && request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env, true);
    await ensureOwnerDownloadSchema(env);
    const url = new URL(request.url);
    const all = url.searchParams.get('days')==='all';
    const days = all ? 90 : intIn(url.searchParams.get('days'),[1,7,30,90],7);
    const selectedDay=String(url.searchParams.get('day')||'').trim();
    if(selectedDay && !validDay(selectedDay))return json({ok:false,error:'Niepoprawna data (YYYY-MM-DD).'},400,{'cache-control':'no-store'});
    const offset=Math.min(100000,Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    const fileFilter = clampText(url.searchParams.get('file'));
    const userFilter = clampText(url.searchParams.get('user'));
    const since = new Date(Date.now() - days*86400000).toISOString();
    const where = `FROM aio_owner_downloads d
      LEFT JOIN community_profiles p ON p.id=d.user_id
      WHERE d.created_at >= ?
        AND (?='' OR instr(lower(d.file_name),lower(?)) > 0)
        AND (?='' OR instr(lower(COALESCE(p.display_name,'')),lower(?)) > 0
                    OR instr(lower(COALESCE(d.user_id,'')),lower(?)) > 0)
        ${selectedDay ? 'AND substr(d.created_at,1,10)=?' : ''}`;
    const params = [since,fileFilter,fileFilter,userFilter,userFilter,userFilter,...(selectedDay?[selectedDay]:[])];
    const db = env.COMMUNITY_DB;
    const run = (sql,...extra) => db.prepare(sql).bind(...params,...extra).all();
    const [totalsRows, dailyRows, filesRows, usersRows, eventRows, activeRows] = await Promise.all([
      run(`SELECT COUNT(*) AS n,
        SUM(CASE WHEN d.user_id IS NULL THEN 1 ELSE 0 END) AS guests,
        SUM(CASE WHEN d.user_id IS NOT NULL THEN 1 ELSE 0 END) AS accounts,
        SUM(CASE WHEN d.audience='account_7d' AND d.access_reason='grant' THEN 1 ELSE 0 END) AS on_7d,
        SUM(CASE WHEN d.access_reason='vip' THEN 1 ELSE 0 END) AS on_vip,
        SUM(CASE WHEN d.audience='account_7d' AND d.access_reason='' THEN 1 ELSE 0 END) AS legacy_unclassified,
        SUM(CASE WHEN d.status_code=206 THEN 1 ELSE 0 END) AS partials,
        SUM(CASE WHEN d.source_post_id<>'' THEN 1 ELSE 0 END) AS from_posts
        ${where}`),
      run(`SELECT substr(d.created_at,1,10) AS day, COUNT(*) AS n ${where}
        GROUP BY substr(d.created_at,1,10) ORDER BY day DESC LIMIT 90`),
      run(`SELECT d.file_name,COUNT(*) AS n ${where}
        GROUP BY d.file_name ORDER BY n DESC,d.file_name LIMIT 15`),
      run(`SELECT d.user_id,COALESCE(p.display_name,'Konto usunięte') AS name,COUNT(*) AS n ${where}
        AND d.user_id IS NOT NULL GROUP BY d.user_id,p.display_name ORDER BY n DESC LIMIT 20`),
      run(`SELECT d.created_at,d.user_id,d.audience,d.access_reason,d.file_name,d.status_code,d.declared_bytes,d.source_post_id,
        COALESCE(p.display_name,'Konto usunięte') AS user_name ${where}
        ORDER BY d.created_at DESC LIMIT 100 OFFSET ?`,offset),
      db.prepare(`SELECT COUNT(*) AS n FROM aio_access_account_grants WHERE expires_at > ?`)
        .bind(new Date().toISOString()).first().catch(() => ({n:null}))
    ]);
    const totals = totalsRows.results?.[0] || {};
    return json({ok:true,days,all,day:selectedDay,offset,page_size:100,has_more:(offset+(eventRows.results||[]).length)<Number(totals.n||0),retention_days:90,
      totals:{issued:Number(totals.n||0),guests:Number(totals.guests||0),accounts:Number(totals.accounts||0),
        on_7d:Number(totals.on_7d||0),on_vip:Number(totals.on_vip||0),legacy_unclassified:Number(totals.legacy_unclassified||0),partials:Number(totals.partials||0),from_posts:Number(totals.from_posts||0),
        active_grants:activeRows?.n === null ? null : Number(activeRows?.n||0)},
      daily:dailyRows.results||[],files:filesRows.results||[],users:usersRows.results||[],events:eventRows.results||[],
      note:'Odpowiedź 200/206 wydana przez serwer nie potwierdza ukończenia pobrania. Pole from_posts wskazuje wydania lokalnych plików z postów. Zewnętrzne przekazania mają osobną historię w Centrum Właściciela.'},200,{'cache-control':'no-store'});
  } catch (e) {
    return json({ok:false,error:e?.status === 401 || e?.status === 403 ? 'Brak uprawnień właściciela.' : 'Nie można odczytać statystyk pobierania.'},
      e?.status===401?401:e?.status===403?403:500,{'cache-control':'no-store'});
  }
}

// Owner-only destructive operation: audit rows only, no account grants or application events.
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return json({ok:false,error:'Niedozwolone źródło żądania.'},403,{'cache-control':'no-store'});
  try{
    await requireAdmin(request,env,true);
    if(!(request.headers.get('content-type')||'').includes('application/json'))return json({ok:false,error:'Wymagany JSON.'},415);
    const body=await request.json().catch(()=>({}));
    if(body.action!=='clear_download_history' || body.confirm!=='USUN')return json({ok:false,error:'Wymagane potwierdzenie USUN.'},400);
    const mode=body.mode;
    if(mode!=='day' && mode!=='all')return json({ok:false,error:'Nieznany zakres czyszczenia.'},400);
    if(mode==='day' && !validDay(String(body.day||'')))return json({ok:false,error:'Podaj prawidłowy dzień UTC.'},400);
    await ensureOwnerDownloadSchema(env);
    const db=env.COMMUNITY_DB;
    const result=mode==='day'
      ?await db.prepare('DELETE FROM aio_owner_downloads WHERE substr(created_at,1,10)=?').bind(body.day).run()
      :await db.prepare('DELETE FROM aio_owner_downloads').run();
    return json({ok:true,deleted:Number(result.meta?.changes||0),message:'Usunięto wpisy historii pobrań. Dostępy i decyzje nie zostały zmienione.'},200,{'cache-control':'no-store'});
  }catch(e){
    return json({ok:false,error:e?.status===401||e?.status===403?'Brak uprawnień właściciela.':'Nie udało się usunąć historii pobrań.'},
      e?.status===401?401:e?.status===403?403:500,{'cache-control':'no-store'});
  }
}
