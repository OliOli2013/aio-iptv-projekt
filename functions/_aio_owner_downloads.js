/* AIO Owner Center V1: minimal server-side file-delivery journal.
 * No IP addresses, no emails, no cookies or external-link URLs are saved here.
 * A successful GET response is not proof the browser finished saving the file.
 */
import {linksInPost} from './_aio_post_links_v5.js';
const MAX_HISTORY_DAYS = 90;
let schemaPromise;

export async function ensureOwnerDownloadSchema(env) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.COMMUNITY_DB.batch([
        env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_owner_downloads (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          audience TEXT NOT NULL CHECK(audience IN ('guest','account_free','account_7d')),
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          declared_bytes INTEGER,
          created_at TEXT NOT NULL
        )`),
        env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_owner_downloads_time ON aio_owner_downloads(created_at DESC)'),
        env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_owner_downloads_user ON aio_owner_downloads(user_id,created_at DESC)')
      ]);
      // Additive migration: preserve prior audit events and their legacy audiences.
      const columns=await env.COMMUNITY_DB.prepare('PRAGMA table_info(aio_owner_downloads)').all();
      if(!(columns.results||[]).some(x=>x.name==='access_reason')){
        try{await env.COMMUNITY_DB.prepare("ALTER TABLE aio_owner_downloads ADD COLUMN access_reason TEXT NOT NULL DEFAULT ''").run();}
        catch(error){if(!/duplicate column name/i.test(String(error?.message||error)))throw error;}
      }
      if(!(columns.results||[]).some(x=>x.name==='source_post_id')){
        try{await env.COMMUNITY_DB.prepare("ALTER TABLE aio_owner_downloads ADD COLUMN source_post_id TEXT NOT NULL DEFAULT ''").run();}
        catch(error){if(!/duplicate column name/i.test(String(error?.message||error)))throw error;}
      }
    })().catch((err) => { schemaPromise = null; throw err; });
  }
  await schemaPromise;
}

function filePathFromRequest(request) {
  const pathname = new URL(request.url).pathname;
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch (_) { /* keep original */ }
  return decoded.replace(/[\x00-\x1F\x7F]/g,'').slice(0,500);
}

export async function recordIssuedFile(env, request, userId, audience, response, accessReason='') {
  // Only a served local file, not a click, redirection, 404 or HEAD request.
  if (request.method !== 'GET' || ![200,206].includes(response?.status)) return;
  if (!['guest','account_free','account_7d'].includes(audience)) return;
  const path = filePathFromRequest(request);
  if (!/^\/pliki\//i.test(path)) return;
  const fileName = (path.split('/').pop() || 'plik').slice(0,220);
  const rawLength = Number(response.headers?.get('Content-Length'));
  const bytes = Number.isSafeInteger(rawLength) && rawLength > 0 ? rawLength : null;
  await ensureOwnerDownloadSchema(env);
  let sourcePostId='';
  const suppliedId=new URL(request.url).searchParams.get('aio_post')||'';
  if(suppliedId.length>=8 && suppliedId.length<=100){
    const row=await env.COMMUNITY_DB.prepare("SELECT content FROM community_posts WHERE id=? AND status='published' LIMIT 1").bind(suppliedId).first();
    if(row){
      const cleanUrl=new URL(request.url);cleanUrl.searchParams.delete('aio_post');
      if(linksInPost(row.content).includes(cleanUrl.href))sourcePostId=suppliedId;
    }
  }
  const now = new Date();
  await env.COMMUNITY_DB.prepare(`INSERT INTO aio_owner_downloads
    (id,user_id,audience,file_name,file_path,status_code,declared_bytes,created_at,access_reason,source_post_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),userId || null,audience,fileName,path,response.status,bytes,now.toISOString(),String(accessReason||'').slice(0,25),sourcePostId).run();
  // Bounded retention even when the admin does not visit the dashboard.
  await env.COMMUNITY_DB.prepare('DELETE FROM aio_owner_downloads WHERE created_at < ?')
    .bind(new Date(now.getTime() - MAX_HISTORY_DAYS*86400000).toISOString()).run();
}

export function queueIssuedFileAudit(context, userId, audience, response, accessReason='') {
  if (context.request?.method !== 'GET' || ![200,206].includes(response?.status)) return;
  try {
    const task = recordIssuedFile(context.env, context.request, userId, audience, response, accessReason)
      .catch(err => console.error('AIO Owner Center: audit unavailable', String(err?.message || err)));
    // Cloudflare waits for this non-critical write without delaying the download.
    if (typeof context.waitUntil === 'function') context.waitUntil(task);
    else void task;
  } catch (_) { /* logging must never prevent serving files */ }
}
