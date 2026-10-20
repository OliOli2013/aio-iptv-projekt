/* Owner-only V5 handoff history, separate from real /pliki/ issued file history. */
import {json,requireAdmin} from '../_community.js';
import {ensurePostLinkSchema} from '../_aio_post_links_v5.js';
import {ensureOwnerDownloadSchema} from '../_aio_owner_downloads.js';
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    await ensurePostLinkSchema(env);await ensureOwnerDownloadSchema(env);
    const db=env.COMMUNITY_DB,url=new URL(request.url);
    const offset=Math.min(20000,Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    const now=Date.now();
    const ago=new Date(now-7*86400000).toISOString();
    const union=`SELECT created_at,user_id,post_id,host,file_name,reason,kind FROM aio_post_link_handoffs
      UNION ALL SELECT created_at,user_id,source_post_id post_id,'AIO / prywatne R2' host,file_name,access_reason reason,'local' kind
      FROM aio_owner_downloads WHERE source_post_id<>''`;
    const [total,week,rows]=await Promise.all([
      db.prepare(`SELECT COUNT(*) n FROM (${union})`).first(),
      db.prepare(`SELECT COUNT(*) n FROM (${union}) WHERE created_at>=?`).bind(ago).first(),
      db.prepare(`SELECT l.created_at,l.host,l.file_name,l.reason,l.kind,l.post_id,
        COALESCE(p.display_name,'Konto usunięte') user_name,
        COALESCE(s.title,'Post usunięty') post_title
        FROM (${union}) l
        LEFT JOIN community_profiles p ON p.id=l.user_id
        LEFT JOIN community_posts s ON s.id=l.post_id
        ORDER BY l.created_at DESC LIMIT 100 OFFSET ?`).bind(offset).all()
    ]);
    return json({ok:true,total:Number(total?.n||0),last_7_days:Number(week?.n||0),
      offset,has_more:offset+(rows.results||[]).length<Number(total?.n||0),rows:rows.results||[],
      note:'Zewnętrzne pliki: przekazanie do obcego serwera, bez potwierdzenia transferu. Lokalne: wydanie HTTP 200/206 z prywatnego R2, bez gwarancji ukończenia zapisu przez przeglądarkę.'},200,{'Cache-Control':'no-store'});
  }catch(e){return json({ok:false,error:e?.status===401||e?.status===403?'Brak uprawnień właściciela.':'Nie można odczytać historii linków z postów.'},e?.status===401?401:e?.status===403?403:503,{'Cache-Control':'no-store'});}
}
