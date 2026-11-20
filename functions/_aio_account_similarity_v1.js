/* AIO TunerHub — Similar Accounts Review V1 (2026-11-20).
 * Owner-only, explainable correlations; NEVER auto-ban or alter entitlements.
 * No name/email similarity constitutes proof of shared ownership.
 */
const MAX_USERS=4000, MAX_IP_ROWS=12000, MAX_PAIRS=3500, MAX_BUCKET=48;
const TABLE='aio_account_similarity_reviews_v1';
const now=()=>new Date().toISOString();
const error=(status,message)=>Object.assign(new Error(message),{status});
const key=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ł/gi,'l')
  .toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,72);
const local=email=>{
  const x=String(email||'').trim().toLowerCase(),at=x.lastIndexOf('@');
  if(at<1)return '';
  let v=x.slice(0,at),domain=x.slice(at+1);
  if(domain==='gmail.com'||domain==='googlemail.com')v=v.split('+')[0].replace(/\./g,'');
  return key(v).replace(/\d{1,3}$/,'');
};
const prefix=(a,b)=>{let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return i;};
const distance=(a,b,max=3)=>{
  if(Math.abs(a.length-b.length)>max)return max+1;
  let prior=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const curr=[i];let best=i;
    for(let j=1;j<=b.length;j++){
      const d=Math.min(curr[j-1]+1,prior[j]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));
      curr[j]=d;best=Math.min(best,d);
    }
    if(best>max)return max+1;
    prior=curr;
  }
  return prior[b.length];
};
export function evaluatePair(a,b,ipsA=[],ipsB=[]){
  if(!a?.id||!b?.id||a.id===b.id)return null;
  const n1=key(a.display_name),n2=key(b.display_name),m1=local(a.email),m2=local(b.email);
  let score=0;const signals=[];
  if(n1.length>=5&&n2.length>=5){
    if(n1===n2){score+=24;signals.push('Identyczna nazwa profilu (samodzielnie nie przesądza)');}
    else if(prefix(n1,n2)>=4 && Math.max(n1.length,n2.length)<=16){
      const d=distance(n1,n2);
      if(d<=3){score+=d<=2?36:26;signals.push('Bardzo podobne nazwy profili: wspólny początek '+prefix(n1,n2)+' znaków');}
    }
  }
  if(m1.length>=5&&m2.length>=5){
    if(m1===m2){score+=56;signals.push('Taki sam trzon części lokalnej e-mail w różnych adresach');}
    else if(prefix(m1,m2)>=4&&Math.max(m1.length,m2.length)<=18){
      const d=distance(m1,m2);
      if(d<=3){score+=d<=2?27:21;signals.push('Podobne początki adresów e-mail: '+prefix(m1,m2)+' znaków');}
    }
  }
  const set=new Set(ipsA.map(x=>String(x||'').trim()).filter(Boolean));
  if(ipsB.some(x=>set.has(String(x||'').trim())&&x)){
    score+=64;signals.push('Wspólny zapisany adres IP (może być współdzielony)');
  }
  // Deliberately no score for matching display name to OWN mailbox: it is the same clue twice.
  if(score<52)return null;
  return {score:Math.min(100,score),signals,level:score>=80?'wysoki':'do wyjaśnienia'};
}
export function buildCandidatePairs(users,ipRows=[],filterId=null){
  const byId=new Map(users.map(u=>[String(u.id),u]));
  const grouped=new Map(), ipById=new Map();
  let largeBuckets=0;
  const add=(k,id)=>{if(!k||!id)return;if(!grouped.has(k))grouped.set(k,new Set());grouped.get(k).add(id);};
  for(const u of users){
    const name=key(u.display_name),mail=local(u.email);
    if(name.length>=5)add('n:'+name.slice(0,4),String(u.id));
    if(mail.length>=5)add('m:'+mail.slice(0,4),String(u.id));
  }
  for(const row of ipRows){
    const id=String(row.user_id||''),ip=String(row.ip_address||'').trim();
    if(!byId.has(id)||!ip)continue;
    if(!ipById.has(id))ipById.set(id,new Set());
    ipById.get(id).add(ip);
    add('ip:'+ip,id);
  }
  const candidates=new Set();
  for(const [bucket,ids] of grouped){
    if(ids.size>MAX_BUCKET&&bucket.startsWith('n:')){largeBuckets++;continue;}
    if(ids.size>MAX_BUCKET&&bucket.startsWith('m:')){largeBuckets++;continue;}
    const arr=[...ids].sort();
    for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
      if(filterId&&arr[i]!==filterId&&arr[j]!==filterId)continue;
      candidates.add(arr[i]+'|'+arr[j]);
      if(candidates.size>MAX_PAIRS)return {pairs:[],candidatePairs:candidates.size,truncated:true,largeBuckets};
    }
  }
  const pairs=[];
  for(const pairKey of candidates){
    const [id1,id2]=pairKey.split('|');const r=evaluatePair(byId.get(id1),byId.get(id2),[...(ipById.get(id1)||[])],[...(ipById.get(id2)||[])]);
    if(r)pairs.push({pairKey,userA:id1,userB:id2,...r});
  }
  pairs.sort((x,y)=>y.score-x.score||x.pairKey.localeCompare(y.pairKey));
  return {pairs,candidatePairs:candidates.size,truncated:false,largeBuckets};
}

export async function ensureSimilaritySchema(env){
  if(!env?.COMMUNITY_DB)throw error(503,'Brak bazy danych D1.');
  const db=env.COMMUNITY_DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      pair_id TEXT PRIMARY KEY,user_a TEXT NOT NULL,user_b TEXT NOT NULL,
      score INTEGER NOT NULL,signals TEXT NOT NULL,level TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','dismissed')),
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      reviewed_at TEXT,reviewed_by TEXT,review_note TEXT,
      FOREIGN KEY(user_a) REFERENCES community_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY(user_b) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_aio_similarity_queue ON ${TABLE}(status,score DESC,updated_at DESC)`)
  ]);
  return true;
}

async function loadUsers(db){
  const rows=(await db.prepare(`SELECT p.id,p.display_name,a.email,p.created_at,p.banned_until
    FROM community_profiles p JOIN community_auth a ON a.user_id=p.id
    WHERE p.role='user' ORDER BY p.id LIMIT ?`).bind(MAX_USERS+1).all()).results||[];
  if(rows.length>MAX_USERS)throw error(409,'Skan obejmuje ponad 4000 kont. Nie wykonano niepełnego audytu. Wymagane skanowanie partiami.');
  return rows;
}
async function storePairs(db,pairs){
  if(!pairs.length)return {written:0};
  const stamp=now();
  // Parameter-bound inserts. A dismissed case is reopened only if score rises by >=20 points.
  const sql=`INSERT INTO ${TABLE}(pair_id,user_a,user_b,score,signals,level,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'pending',?,?) ON CONFLICT(pair_id) DO UPDATE SET
      score=excluded.score,signals=excluded.signals,level=excluded.level,updated_at=excluded.updated_at,
      status=CASE WHEN ${TABLE}.status='dismissed' AND excluded.score>=${TABLE}.score+20 THEN 'pending' ELSE ${TABLE}.status END,
      reviewed_at=CASE WHEN ${TABLE}.status='dismissed' AND excluded.score>=${TABLE}.score+20 THEN NULL ELSE ${TABLE}.reviewed_at END,
      reviewed_by=CASE WHEN ${TABLE}.status='dismissed' AND excluded.score>=${TABLE}.score+20 THEN NULL ELSE ${TABLE}.reviewed_by END`;
  // Chunk to respect D1 batch sizes.
  for(let i=0;i<pairs.length;i+=70){
    await db.batch(pairs.slice(i,i+70).map(p=>db.prepare(sql)
      .bind(p.pairKey,p.userA,p.userB,p.score,JSON.stringify(p.signals),p.level,stamp,stamp)));
  }
  return {written:pairs.length};
}
export async function scanAccountSimilarity(env,{userId=null}={}){
  await ensureSimilaritySchema(env);
  const db=env.COMMUNITY_DB,users=await loadUsers(db);
  if(userId&&!users.some(u=>String(u.id)===String(userId)))return {accounts_scanned:users.length,candidate_pairs:0,findings:0,written:0};
  const ips=(await db.prepare(`SELECT ui.user_id,ui.ip_address FROM community_user_ips ui
    JOIN community_profiles p ON p.id=ui.user_id WHERE p.role='user' AND ui.ip_address IS NOT NULL
    ORDER BY ui.user_id LIMIT ?`).bind(MAX_IP_ROWS+1).all()).results||[];
  if(ips.length>MAX_IP_ROWS)throw error(409,'Historia IP przekracza limit skanu. Nie zapisano niepełnych ustaleń.');
  const r=buildCandidatePairs(users,ips,userId?String(userId):null);
  if(r.truncated)throw error(409,'Zbyt wiele potencjalnych par. Nie zapisano niepełnego audytu.');
  const result=await storePairs(db,r.pairs);
  return {accounts_scanned:users.length,ip_rows:ips.length,candidate_pairs:r.candidatePairs,findings:r.pairs.length,
    large_buckets:r.largeBuckets,...result,read_only_for_accounts:true};
}
export async function scanSimilarityForUser(env,id){
  // Post-registration observation only. Caller handles failure without blocking registration.
  return scanAccountSimilarity(env,{userId:id});
}
export async function listSimilarityReviews(env,{status='pending',q='',limit=50}={}){
  await ensureSimilaritySchema(env);
  const db=env.COMMUNITY_DB,allowed=['pending','confirmed','dismissed','all'];
  if(!allowed.includes(status))throw error(400,'Nieprawidłowy filtr.');
  const conditions=['1=1'],params=[];
  if(status!=='all'){conditions.push('r.status=?');params.push(status);}
  const phrase=String(q||'').trim().slice(0,80);
  if(phrase){conditions.push('(lower(a.display_name) LIKE ? OR lower(b.display_name) LIKE ? OR lower(c.email) LIKE ? OR lower(d.email) LIKE ?)');params.push(...Array(4).fill('%'+phrase.toLowerCase().replace(/[%_]/g,'')+'%'));}
  const from=`FROM ${TABLE} r JOIN community_profiles a ON a.id=r.user_a JOIN community_profiles b ON b.id=r.user_b JOIN community_auth c ON c.user_id=r.user_a JOIN community_auth d ON d.user_id=r.user_b WHERE `+conditions.join(' AND ');
  const [count,result,totals]=await Promise.all([
    db.prepare('SELECT COUNT(*) n '+from).bind(...params).first(),
    db.prepare(`SELECT r.pair_id,r.score,r.signals,r.level,r.status,r.created_at,r.updated_at,r.reviewed_at,r.review_note,
        a.display_name name_a,c.email email_a,b.display_name name_b,d.email email_b,
        a.id user_a,b.id user_b,a.banned_until ban_a,b.banned_until ban_b
        ${from} ORDER BY r.score DESC,r.updated_at DESC LIMIT ?`).bind(...params,Math.min(100,Math.max(1,Number(limit)||50))).all(),
    db.prepare(`SELECT status,COUNT(*) n FROM ${TABLE} GROUP BY status`).all()
  ]);
  return {ok:true,rows:(result.results||[]).map(r=>({...r,signals:JSON.parse(r.signals||'[]')})),total:Number(count?.n||0),
    totals:Object.fromEntries((totals.results||[]).map(r=>[r.status,Number(r.n||0)])),status,limit:Math.min(100,Math.max(1,Number(limit)||50))};
}
export async function reviewSimilarity(env,{pairId,action,ownerId,note}){
  await ensureSimilaritySchema(env);
  if(!/^[a-zA-Z0-9_-]{8,100}\|[a-zA-Z0-9_-]{8,100}$/.test(String(pairId||'')))throw error(400,'Nieprawidłowa para kont.');
  if(!['confirm','dismiss','reopen'].includes(action))throw error(400,'Nieprawidłowa decyzja.');
  const next={confirm:'confirmed',dismiss:'dismissed',reopen:'pending'}[action],clean=String(note||'').trim().slice(0,400);
  if(action!=='reopen'&&clean.length<8)throw error(400,'Podaj uzasadnienie (minimum 8 znaków).');
  const result=await env.COMMUNITY_DB.prepare(`UPDATE ${TABLE} SET status=?,reviewed_at=?,reviewed_by=?,review_note=?,updated_at=?
    WHERE pair_id=? RETURNING pair_id,status`).bind(next,action==='reopen'?null:now(),action==='reopen'?null:ownerId,clean||null,now(),pairId).first();
  if(!result)throw error(404,'Nie znaleziono tej pary kont.');
  return {ok:true,status:result.status,message:'Zapisano decyzję. Dostęp i limity kont pozostają bez zmian.'};
}
