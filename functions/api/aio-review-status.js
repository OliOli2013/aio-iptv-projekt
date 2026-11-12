/* AIO Review V1: wyłącznie właściciel widzi status jednorazowego wdrożenia. */
import {json,requireAdmin,errorResponse} from '../_community.js';
import {ensureRelatedReviewV1} from '../_aio_related_review_v1.js';
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    await ensureRelatedReviewV1(env);
    const [overview,rows]=await Promise.all([
      env.COMMUNITY_DB.prepare(`SELECT COUNT(*) total,
        SUM(CASE WHEN p.banned_until IS NOT NULL AND p.banned_until>? THEN 1 ELSE 0 END) active,
        SUM(CASE WHEN p.banned_until IS NULL OR p.banned_until<=? THEN 1 ELSE 0 END) released
        FROM aio_related_account_review_v1 r JOIN community_profiles p ON p.id=r.user_id`)
        .bind(new Date().toISOString(),new Date().toISOString()).first(),
      env.COMMUNITY_DB.prepare(`SELECT r.group_code,r.user_id,p.display_name,
        r.seeded_at,r.applied_at,r.decision,p.banned_until
        FROM aio_related_account_review_v1 r JOIN community_profiles p ON p.id=r.user_id
        ORDER BY r.group_code,p.created_at`).all()
    ]);
    return json({ok:true,version:'AIO_REVIEW_V1',total:Number(overview?.total||0),
      blocked:Number(overview?.active||0),released:Number(overview?.released||0),
      rows:rows.results||[],note:'Zwolnienie blokady w panelu właściciela nie jest cofane przez jednorazowy seed.'});
  }catch(e){return errorResponse(e);}
}
