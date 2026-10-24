/* AIO Post File Stats V1. Independent, best-effort click journal.
 * No raw URL, query string, IP, cookies, browser fingerprint or email stored.
 * Nothing in this module debits a quota, grants access or changes a block.
 */
let schemaReady;
export async function ensurePostFileStatsV1(env){
  const db=env.COMMUNITY_DB;
  if(!db)throw new Error('Brak COMMUNITY_DB');
  if(!schemaReady){
    schemaReady=db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS aio_post_file_clicks_v1 (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, post_id TEXT NOT NULL,
        user_id TEXT, kind TEXT NOT NULL CHECK(kind IN ('local','external','info')),
        host TEXT NOT NULL, file_name TEXT NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_aio_pfc_v1_date ON aio_post_file_clicks_v1(created_at DESC)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_aio_pfc_v1_post ON aio_post_file_clicks_v1(post_id,created_at DESC)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_aio_pfc_v1_file ON aio_post_file_clicks_v1(host,file_name,created_at DESC)')
    ]).catch(err=>{schemaReady=null;throw err;});
  }
  await schemaReady;
}
export async function recordPostFileClickV1(env,{postId,userId,kind,url}){
  if(!['local','external','info'].includes(kind))return;
  const link=new URL(url);
  if(!['https:','http:'].includes(link.protocol))return;
  await ensurePostFileStatsV1(env);
  let name=link.pathname.split('/').filter(Boolean).pop()||'strona główna';
  try{name=decodeURIComponent(name);}catch(_e){}
  name=name.replace(/[\x00-\x1f\x7f<>]/g,'').slice(0,160)||'plik';
  const db=env.COMMUNITY_DB;
  await db.prepare(`INSERT INTO aio_post_file_clicks_v1
    (id,created_at,post_id,user_id,kind,host,file_name)
    VALUES(?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(),new Date().toISOString(),String(postId).slice(0,100),userId||null,
    kind,link.hostname.toLowerCase().slice(0,160),name
  ).run();
  // Periodic lightweight pruning (90 days), not an extra DELETE per click.
  if(Math.random()<0.015){
    try{await db.prepare('DELETE FROM aio_post_file_clicks_v1 WHERE created_at<?')
      .bind(new Date(Date.now()-90*86400000).toISOString()).run();}
    catch(e){console.error('AIO post stats retention:',String(e?.message||e).slice(0,90));}
  }
}
