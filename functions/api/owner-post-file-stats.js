/* Owner-only AIO Post File Stats V1: read-only aggregation of existing audit logs
 * plus new click journal. Does not mutate access, posts or download limits.
 */
import {json,requireAdmin} from '../_community.js';
import {ensurePostLinkSchema} from '../_aio_post_links_v5.js';
import {ensureOwnerDownloadSchema} from '../_aio_owner_downloads.js';
import {ensurePostFileStatsV1} from '../_aio_post_file_stats_v1.js';

const NO_STORE={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const safeN=x=>Math.max(0,Number(x||0));
function cell(v){let t=String(v??'').replace(/\r|\n/g,' ');if(/^[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';}
function csvLine(values){return values.map(cell).join(',');}
async function getReport(env){
  await Promise.all([ensurePostFileStatsV1(env),ensurePostLinkSchema(env),ensureOwnerDownloadSchema(env)]);
  const db=env.COMMUNITY_DB;
  const now=new Date();
  const today=now.toISOString().slice(0,10);
  const day7=new Date(now.getTime()-7*86400000).toISOString();
  const day30=new Date(now.getTime()-30*86400000).toISOString();
  const queries=[
    db.prepare(`SELECT COUNT(*) total,
        COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) last7,
        COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) last30,
        COALESCE(SUM(CASE WHEN substr(created_at,1,10)=? THEN 1 ELSE 0 END),0) today,
        COUNT(DISTINCT CASE WHEN created_at>=? AND user_id IS NOT NULL THEN user_id END) accounts7,
        COUNT(DISTINCT CASE WHEN created_at>=? THEN post_id END) posts7
        FROM aio_post_file_clicks_v1`).bind(day7,day30,today,day7,day7).first(),
    db.prepare(`SELECT COUNT(*) total,
        COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) last7,
        COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) last30
        FROM aio_post_link_handoffs`).bind(day7,day30).first(),
    db.prepare(`SELECT COUNT(*) total,
        COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) last7,
        COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) last30
        FROM aio_owner_downloads WHERE source_post_id<>'' AND status_code IN (200,206)`).bind(day7,day30).first(),
    db.prepare(`SELECT kind,COUNT(*) n FROM aio_post_file_clicks_v1
        WHERE created_at>=? GROUP BY kind ORDER BY n DESC`).bind(day7).all(),
    db.prepare(`SELECT substr(created_at,1,10) day,kind,COUNT(*) n
        FROM aio_post_file_clicks_v1 WHERE created_at>=?
        GROUP BY substr(created_at,1,10),kind ORDER BY day DESC,kind`).bind(day30).all(),
    db.prepare(`SELECT c.post_id,COALESCE(p.title,'Post usunięty') title,COUNT(*) n,
        COUNT(DISTINCT c.user_id) accounts
        FROM aio_post_file_clicks_v1 c LEFT JOIN community_posts p ON p.id=c.post_id
        WHERE c.created_at>=? GROUP BY c.post_id ORDER BY n DESC LIMIT 15`).bind(day30).all(),
    db.prepare(`SELECT host,file_name,kind,COUNT(*) n
        FROM aio_post_file_clicks_v1 WHERE created_at>=?
        GROUP BY host,file_name,kind ORDER BY n DESC LIMIT 20`).bind(day30).all(),
    db.prepare(`SELECT c.created_at,c.kind,c.host,c.file_name,
        COALESCE(p.title,'Post usunięty') post_title,
        CASE WHEN c.user_id IS NULL THEN 'Gość lub link informacyjny'
          ELSE COALESCE(u.display_name,'Konto usunięte') END user_name
        FROM aio_post_file_clicks_v1 c
        LEFT JOIN community_posts p ON p.id=c.post_id
        LEFT JOIN community_profiles u ON u.id=c.user_id
        ORDER BY c.created_at DESC LIMIT 100`).all()
  ];
  const [click,external,local,kinds,days,posts,files,recent]=await Promise.all(queries);
  return {
    ok:true,generated_at:now.toISOString(),period:'last_30_days',
    clicks:{total:safeN(click?.total),today:safeN(click?.today),last7:safeN(click?.last7),last30:safeN(click?.last30),accounts7:safeN(click?.accounts7),posts7:safeN(click?.posts7)},
    external:{total:safeN(external?.total),last7:safeN(external?.last7),last30:safeN(external?.last30)},
    local:{total:safeN(local?.total),last7:safeN(local?.last7),last30:safeN(local?.last30)},
    kinds:kinds.results||[],days:days.results||[],posts:posts.results||[],files:files.results||[],recent:recent.results||[],
    note:'Kliknięcie = zweryfikowane żądanie otwarcia linku z opublikowanego posta. Zewnętrzne przekazanie = wydanie URL obcego serwera; nie potwierdza pobrania. Lokalne wydanie = odpowiedź HTTP 200/206 z R2, nie potwierdza ukończenia zapisu. Statystyka kliknięć rozpoczyna się od wdrożenia V1; historyczne dzienniki pozostają bez zmian.'
  };
}
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    const data=await getReport(env);
    if(new URL(request.url).searchParams.get('format')!=='csv')return json(data,200,NO_STORE);
    const lines=[csvLine(['sekcja','data / post / plik','rodzaj','liczba','szczegóły']),
      csvLine(['podsumowanie','Kliknięcia łącznie','click',data.clicks.total,'Od wdrożenia V1 / 90 dni retencji']),
      csvLine(['podsumowanie','Kliknięcia 7 dni','click',data.clicks.last7,'']),
      csvLine(['podsumowanie','Kliknięcia 30 dni','click',data.clicks.last30,'']),
      csvLine(['podsumowanie','Zewnętrzne przekazania','handoff',data.external.total,'Historyczny dziennik']),
      csvLine(['podsumowanie','Lokalne wydania z postów','issued',data.local.total,'HTTP 200/206']),
      ...data.days.map(x=>csvLine(['dzień',x.day,x.kind,x.n,''])),
      ...data.posts.map(x=>csvLine(['post',x.title,'click',x.n,x.post_id])),
      ...data.files.map(x=>csvLine(['plik',x.file_name,x.kind,x.n,x.host]))];
    return new Response('\ufeff'+lines.join('\r\n')+'\r\n',{status:200,headers:{...NO_STORE,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="aio-post-file-stats-v1.csv"'}});
  }catch(e){
    const code=e?.status===401?401:e?.status===403?403:503;
    if(code===503)console.error('AIO post file stats:',String(e?.message||e).slice(0,160));
    return json({ok:false,error:code===503?'Nie udało się odczytać statystyk.':'Brak uprawnień właściciela.'},code,NO_STORE);
  }
}
