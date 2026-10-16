/* Private owner-only download activity. No public or moderator access. */
import { requireAdmin, json } from '../_community.js';
import { ensureOwnerDownloadSchema } from '../_aio_owner_downloads.js';

function intIn(value, choices, fallback) {
  const n = Number(value);
  return choices.includes(n) ? n : fallback;
}
function clampText(value) { return String(value || '').trim().slice(0,80); }

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env, true);
    await ensureOwnerDownloadSchema(env);
    const url = new URL(request.url);
    const days = intIn(url.searchParams.get('days'),[1,7,30,90],7);
    const fileFilter = clampText(url.searchParams.get('file'));
    const userFilter = clampText(url.searchParams.get('user'));
    const since = new Date(Date.now() - days*86400000).toISOString();
    const where = `FROM aio_owner_downloads d
      LEFT JOIN community_profiles p ON p.id=d.user_id
      WHERE d.created_at >= ?
        AND (?='' OR instr(lower(d.file_name),lower(?)) > 0)
        AND (?='' OR instr(lower(COALESCE(p.display_name,'')),lower(?)) > 0
                    OR instr(lower(COALESCE(d.user_id,'')),lower(?)) > 0)`;
    const params = [since,fileFilter,fileFilter,userFilter,userFilter,userFilter];
    const db = env.COMMUNITY_DB;
    const run = (sql,...extra) => db.prepare(sql).bind(...params,...extra).all();
    const [totalsRows, dailyRows, filesRows, usersRows, eventRows, activeRows] = await Promise.all([
      run(`SELECT COUNT(*) AS n,
        SUM(CASE WHEN d.user_id IS NULL THEN 1 ELSE 0 END) AS guests,
        SUM(CASE WHEN d.user_id IS NOT NULL THEN 1 ELSE 0 END) AS accounts,
        SUM(CASE WHEN d.audience='account_7d' THEN 1 ELSE 0 END) AS on_7d,
        SUM(CASE WHEN d.status_code=206 THEN 1 ELSE 0 END) AS partials
        ${where}`),
      run(`SELECT substr(d.created_at,1,10) AS day, COUNT(*) AS n ${where}
        GROUP BY substr(d.created_at,1,10) ORDER BY day DESC LIMIT 31`),
      run(`SELECT d.file_name,COUNT(*) AS n ${where}
        GROUP BY d.file_name ORDER BY n DESC,d.file_name LIMIT 15`),
      run(`SELECT d.user_id,COALESCE(p.display_name,'Konto usunięte') AS name,COUNT(*) AS n ${where}
        AND d.user_id IS NOT NULL GROUP BY d.user_id,p.display_name ORDER BY n DESC LIMIT 20`),
      run(`SELECT d.created_at,d.user_id,d.audience,d.file_name,d.status_code,d.declared_bytes,
        COALESCE(p.display_name,'Konto usunięte') AS user_name ${where}
        ORDER BY d.created_at DESC LIMIT 100`),
      db.prepare(`SELECT COUNT(*) AS n FROM aio_access_account_grants WHERE expires_at > ?`)
        .bind(new Date().toISOString()).first().catch(() => ({n:null}))
    ]);
    const totals = totalsRows.results?.[0] || {};
    return json({ok:true,days,retention_days:90,
      totals:{issued:Number(totals.n||0),guests:Number(totals.guests||0),accounts:Number(totals.accounts||0),
        on_7d:Number(totals.on_7d||0),partials:Number(totals.partials||0),
        active_grants:activeRows?.n === null ? null : Number(activeRows?.n||0)},
      daily:dailyRows.results||[],files:filesRows.results||[],users:usersRows.results||[],events:eventRows.results||[],
      note:'Zapis oznacza wydaną przez serwer odpowiedź 200/206, nie gwarancję pobrania całego pliku. Linki zewnętrzne są raportowane osobno jako aktywność AIO Access.'},200,{'cache-control':'no-store'});
  } catch (e) {
    return json({ok:false,error:e?.status === 401 || e?.status === 403 ? 'Brak uprawnień właściciela.' : 'Nie można odczytać statystyk pobierania.'},
      e?.status===401?401:e?.status===403?403:500,{'cache-control':'no-store'});
  }
}
