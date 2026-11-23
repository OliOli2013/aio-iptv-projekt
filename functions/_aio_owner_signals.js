// Local account evidence only: no external lookup, raw IP, email, account write or risk-based ban.
const DAY=86400000;
export const PAGE_SIZE=30;
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Owner inspection must never refresh, create or debit the user's cycle.
export async function quotaSnapshot(db,id,now=Date.now()){
  if(!UUID.test(String(id||''))||!(await db.prepare("SELECT id FROM community_profiles WHERE id=? AND role='user'").bind(id).first()))throw Object.assign(new Error('Nie znaleziono zwykłego konta.'),{status:400});
  const queries=[
    'SELECT g.used,g.resets_ms FROM aio_multikonta_quota_members_v2 m JOIN aio_multikonta_quota_groups_v2 g ON g.group_id=m.group_id WHERE m.user_id=?',
    'SELECT used,resets_ms FROM aio_access_monthly_cycles WHERE user_id=?',
    "SELECT expires_at FROM aio_vip_grants WHERE user_id=? AND status='active'",
    "SELECT expires_at FROM aio_access_account_grants WHERE user_id=? AND source IN ('verified_receipt','owner_verified_support','owner_manual_grant')"
  ];
  const [group,own,vip,grant]=await Promise.allSettled(queries.map(async sql=>db.prepare(sql).bind(id).first()));
  const row=group.status==='fulfilled'?(group.value||(own.status==='fulfilled'&&own.value)):null;
  const third=row&&Number(row.used)===3,reset=Number(row?.resets_ms)||0;
  const valid=row&&Number.isInteger(row.used)&&row.used>=0&&row.used<=3&&(!third||(reset>0&&Number.isFinite(new Date(reset).getTime())));
  const term=x=>({known:x.status==='fulfilled',until:x.status==='fulfilled'&&Date.parse(x.value?.expires_at)>now?x.value.expires_at:null});
  return {known:Boolean(valid),shared:Boolean(group.value),remaining:valid?(third&&reset<=now?3:3-row.used):null,
    resets_at:valid&&third&&reset>now?new Date(reset).toISOString():null,vip:term(vip),seven:term(grant)};
}
const error=(status,message)=>Object.assign(new Error(message),{status});
const time=(ms)=>new Date(ms).toISOString();
export function asOf(value,now=Date.now()){
  if(!value)return time(now);
  const ms=Date.parse(value);
  if(!Number.isFinite(ms)||time(ms)!==value||ms>now+1000||ms<now-30*60000)throw error(400,'Skan wygasł. Rozpocznij nowy.');
  return value;
}
export async function signalsFor(db,ids,cutoff){
  if(!ids.length)return new Map();
  const slots=ids.map(()=>'?').join(','),from=time(Date.parse(cutoff)-7*DAY);
  const log=db.prepare(`SELECT user_id, SUM(event='login_failed') failures,
    SUM(event='download_denied') limits, MAX(created_at||':'||id) last
    FROM aio_security_journal WHERE user_id IN (${slots}) AND created_at>=? AND created_at<=?
    AND (event='login_failed' OR (event='download_denied' AND detail IN ('Limit pobierania','Limit: link do pliku w poście')))
    GROUP BY user_id`).bind(...ids,from,cutoff);
  const decisions=db.prepare(`SELECT d.user_id,d.seq,d.evidence,d.decision,d.note,d.created_at
    FROM aio_owner_signal_decisions_v1 d WHERE d.user_id IN (${slots})
    AND d.seq=(SELECT MAX(x.seq) FROM aio_owner_signal_decisions_v1 x WHERE x.user_id=d.user_id)`).bind(...ids);
  const [a,b]=await db.batch([log,decisions]),reviews=new Map((b.results||[]).map(r=>[r.user_id,r]));
  return new Map((a.results||[]).filter(r=>r.failures>=5||r.limits>=3).map(r=>{
    const evidence=[r.last,r.failures,r.limits].join('|'),review=reviews.get(r.user_id);
    return [r.user_id,{id:r.user_id,failures:Number(r.failures),limits:Number(r.limits),evidence,
      previous_seq:review?.seq||0,state:review?.evidence===evidence?review.decision:'pending',
      previous:review?{note:review.note,decision:review.decision,at:review.created_at}:null}];
  }));
}
export async function scanPage(db,{after='',at},now=Date.now()){
  if(after&&!UUID.test(after))throw error(400,'Niepoprawny kursor.');
  const cutoff=asOf(at,now);
  const page=(await db.prepare(`SELECT id,display_name FROM community_profiles
    WHERE role='user' AND id>? AND created_at<=? ORDER BY id LIMIT ?`)
    .bind(after,cutoff,PAGE_SIZE+1).all()).results||[];
  const rows=page.slice(0,PAGE_SIZE),info=await signalsFor(db,rows.map(x=>x.id),cutoff);
  return {at:cutoff,checked:rows.length,next:page.length>PAGE_SIZE?rows.at(-1).id:null,
    findings:rows.filter(p=>info.has(p.id)).map(p=>({...info.get(p.id),name:p.display_name}))};
}
export async function reviewSignal(db,actor,body){
  const {id,decision,evidence,previous_seq}=body,note=String(body.note||'').trim();
  if(!UUID.test(id)||id===actor||!['watch','dismiss'].includes(decision)||typeof evidence!=='string'||evidence.length>200||
    !Number.isSafeInteger(previous_seq)||previous_seq<0||note.length<8||note.length>300)throw error(400,'Wybierz sprawę i podaj uzasadnienie (8–300 znaków).');
  const stamp=time(Date.now()),fresh=(await signalsFor(db,[id],stamp)).get(id);
  if(!fresh||fresh.evidence!==evidence||fresh.previous_seq!==previous_seq)throw error(409,'Dane lub decyzja uległy zmianie. Odśwież skan.');
  // Append only; compare-and-set also protects against concurrent owner tabs.
  const saved=await db.prepare(`INSERT INTO aio_owner_signal_decisions_v1(user_id,actor_id,evidence,decision,note,created_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM community_profiles WHERE id=? AND role='user')
    AND COALESCE((SELECT MAX(seq) FROM aio_owner_signal_decisions_v1 WHERE user_id=?),0)=? RETURNING seq`)
    .bind(id,actor,evidence,decision,note,stamp,id,id,previous_seq).first();
  if(!saved)throw error(409,'Konflikt decyzji. Odśwież skan.');
  return {seq:saved.seq,decision};
}
