/* AIO Anti-Abuse V1: correlate recent server-side security events at signup.
 * No fingerprint from browser JS, no IP reservation, no automatic profile ban.
 * A weak signal is observation only. The existing Multikonta review owns access.
 */
const WINDOW_MS=30*60*1000;
const norm=value=>String(value||'').replace(/ł/g,'l').replace(/Ł/g,'L')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,100);
function stem(value){const n=norm(value);return n.replace(/\d{1,8}$/,'');}
export function similarAccountName(a,b){
  const x=stem(a),y=stem(b);
  return x.length>=4 && y.length>=4 && x===y;
}
export function assessRecentAccountSignals(rows,displayName){
  let best=null;
  for(const row of rows||[]){
    if(!row.user_id)continue;
    const flags=[];
    if(row.event==='login_review_blocked')flags.push('anti_abuse_recent_restricted_login');
    else if(row.event==='login_failed' && Number(row.profile_blocked)===1)flags.push('anti_abuse_recent_failed_blocked_login');
    else if(row.event==='download_denied' && /^limit\b/i.test(String(row.detail||'')))flags.push('anti_abuse_recent_quota_denial');
    else continue;
    const matching=similarAccountName(displayName,row.display_name);
    if(matching)flags.push('anti_abuse_similar_name');
    // A restricted sign-in with a valid password or an authenticated quota denial
    // is stronger than an unauthenticated wrong-password event.
    const authenticatedSignal=row.event==='login_review_blocked'||row.event==='download_denied';
    const candidate={score:(matching||authenticatedSignal)?5:3,flags,peer:row.user_id};
    if(!best||candidate.score>best.score)best=candidate;
  }
  return best||{score:0,flags:[],peer:null};
}
export const RECENT_SQL=`SELECT j.user_id,j.event,j.detail,j.created_at,p.display_name,
  CASE WHEN p.banned_until IS NOT NULL AND datetime(p.banned_until)>datetime(?) THEN 1 ELSE 0 END AS profile_blocked
  FROM aio_security_journal j JOIN community_profiles p ON p.id=j.user_id
  WHERE j.ip_fingerprint=? AND j.created_at>=? AND j.created_at<=? AND p.role='user'
    AND (j.event='login_review_blocked' OR
      (j.event='login_failed' AND datetime(p.banned_until)>datetime(?)) OR
      (j.event='download_denied' AND lower(j.detail) LIKE 'limit%'))
  ORDER BY j.created_at DESC,j.id DESC LIMIT 100`;
export async function recentAccountSignal(db,fingerprint,displayName,now=Date.now()){
  if(!fingerprint)return {score:0,flags:[],peer:null};
  const end=new Date(now).toISOString(),start=new Date(now-WINDOW_MS).toISOString();
  const result=await db.prepare(RECENT_SQL).bind(end,fingerprint,start,end,end).all();
  return assessRecentAccountSignals(result.results||[],displayName);
}
