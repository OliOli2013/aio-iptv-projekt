/* Owner-only D1 review and decisions; never reveal IP/account correlation publicly. */
import {requireAdmin,json,moderationLog} from '../_community.js';
import {ensureIpPolicy,listCollisionGroups,applyHistoricalGroup,grantException,allowNextSignup,reviewIpGroup,historicalPendingIpSummary} from '../_aio_ip_one_account_v7.js';
import {FIXED_IP_POLICY_EXEMPT_IDS,isIpPolicyExemptV8} from '../_aio_ip_policy_exempt_v8.js';
const respond=(x,status=200)=>json(x,status,{'Cache-Control':'private, no-store','Vary':'Cookie'});
const invalid=(status,msg)=>{throw Object.assign(new Error(msg),{status})};
const validId=s=>/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(String(s||''));
// _community.sha256() returns 43-character Base64URL, not a 64-char hex digest.
const validIpKey=s=>/^[A-Za-z0-9_-]{43}$/.test(String(s||''));
const safe=(s,limit=200)=>String(s||'').replace(/[\x00-\x1f<>]/g,' ').trim().slice(0,limit);
const excludedIds=(env,ownerId)=>[...new Set([ownerId,...FIXED_IP_POLICY_EXEMPT_IDS,
  ...String(env.AIO_IP_POLICY_EXEMPT_USER_IDS||'').split(',').map(x=>x.trim())
    .filter(x=>/^[0-9a-f-]{36}$/i.test(x))])];
const pendingClause=(ids)=>'h.status=\'active\' AND h.user_id NOT IN ('+ids.map(()=>'?').join(',')+') AND NOT EXISTS (SELECT 1 FROM aio_ip_policy_hold_reviews_v9 r WHERE r.user_id=h.user_id AND r.ip_key=h.ip_key AND r.hold_created_at=h.created_at)';
const handleError=e=>respond({ok:false,error:[400,401,403,404,409].includes(e.status)?e.message:'Nie można obsłużyć polityki IP.'},[400,401,403,404,409].includes(e.status)?e.status:500);
export async function onRequestGet({request,env}){
  try{
    const auth=await requireAdmin(request,env,true);await ensureIpPolicy(env);
    const url=new URL(request.url),offset=Math.min(100000,Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    const db=env.COMMUNITY_DB,groups=await listCollisionGroups(env,{offset,limit:5});
    const historical=await historicalPendingIpSummary(env);
    const denied=await db.prepare(`SELECT d.ip_key,d.kind,d.attempts,d.first_at,d.last_at,d.reviewed_at,
      p.display_name last_user_name FROM aio_ip_policy_denials_v10 d
      LEFT JOIN community_profiles p ON p.id=d.last_user_id
      ORDER BY CASE WHEN d.reviewed_at IS NULL THEN 0 ELSE 1 END,d.last_at DESC LIMIT 120`).all();
    const unreadDenials=await db.prepare('SELECT COUNT(*) n FROM aio_ip_policy_denials_v10 WHERE reviewed_at IS NULL').first();
    // Pending grants only: never touch accounts, already-used permissions or account-specific exceptions.
    const permitTotals=await db.prepare('SELECT COALESCE(SUM(remaining),0) total FROM aio_ip_policy_signup_permits WHERE remaining>0').first();
    const hidden=excludedIds(env,auth.user.id);
    // Count every unread ordinary account, even beyond the currently displayed five networks.
    const pendingSql='SELECT COUNT(*) n FROM aio_ip_policy_holds_v8 h WHERE '+pendingClause(hidden);
    const unread=await db.prepare(pendingSql).bind(...hidden).first();
    const holds=await db.prepare(`SELECT h.user_id,p.display_name,COALESCE(a.email,'') email,h.ip_key,h.reason,
      h.status,h.created_at,h.released_at,h.released_by,
      CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END reviewed,r.reviewed_at
      FROM aio_ip_policy_holds_v8 h
      LEFT JOIN community_profiles p ON p.id=h.user_id LEFT JOIN community_auth a ON a.user_id=h.user_id
      LEFT JOIN aio_ip_policy_hold_reviews_v9 r ON r.user_id=h.user_id AND r.ip_key=h.ip_key AND r.hold_created_at=h.created_at
      WHERE h.status IN ('active','released')
      ORDER BY CASE WHEN h.status='active' AND r.user_id IS NULL THEN 0 WHEN h.status='active' THEN 1 ELSE 2 END,
        COALESCE(h.released_at,h.created_at) DESC LIMIT 300`).all();
    const visible=(holds.results||[]).filter(h=>h.user_id!==auth.user.id&&!isIpPolicyExemptV8(h.user_id,env));
    return respond({ok:true,offset,groups:groups.groups,has_more:groups.has_more,holds:visible,
      unreviewed_total:Number(unread?.n||0),historical_pending:historical,
      denial_attempts:denied.results||[],unread_denials:Number(unreadDenials?.n||0),
      total_signup_permits:Number(permitTotals?.total||0),
      note:'Wspólny IP to jedno łącze, nie dowód tożsamości. Blokady historyczne wymagają zatwierdzenia przez właściciela.'});
  }catch(e){console.error('[AIO IP policy GET]',String(e?.message||e).slice(0,150));return handleError(e)}
}
export async function onRequestPost({request,env}){
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return respond({ok:false,error:'Nieprawidłowe źródło żądania.'},403);
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return respond({ok:false,error:'Żądanie z innej strony odrzucone.'},403);
  if(!String(request.headers.get('content-type')||'').includes('application/json'))return respond({ok:false,error:'Wymagany JSON.'},415);
  try{
    const owner=await requireAdmin(request,env,true);await ensureIpPolicy(env);
    const data=await request.json().catch(()=>({})),action=safe(data.action,40),key=safe(data.ip_key,120);
    if(data.confirm!==true)invalid(400,'Wymagane potwierdzenie właściciela.');
    const reason=safe(data.reason,240);
    if(action==='review_denial'){
      if(!validIpKey(key)||!['register','login'].includes(data.kind))invalid(400,'Nieprawidłowy identyfikator zdarzenia.');
      const at=new Date().toISOString();
      const r=await env.COMMUNITY_DB.prepare('UPDATE aio_ip_policy_denials_v10 SET reviewed_at=?,reviewed_by=? WHERE ip_key=? AND kind=? AND reviewed_at IS NULL')
        .bind(at,owner.user.id,key,data.kind).run();
      const changed=Number(r.meta?.changes||0);
      if(changed)await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,action:'ip_policy_denial_reviewed',reason:'Przejrzano agregat '+data.kind+' dla sieci '+key.slice(0,12)+'; nie zmieniono kont ani blokad.'});
      return respond({ok:true,message:changed?'Potwierdzono próbę. Zabezpieczenia pozostają aktywne.':'To zdarzenie było już przejrzane.'});
    }
    if(action==='apply_group'){
      const ip=safe(data.ip,80);const result=await applyHistoricalGroup(env,key,ip,owner.user.id);
      await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,action:'ip_policy_group_applied',reason:'Sieć: '+key.slice(0,12)+'; zablokowano: '+result.held});
      return respond({ok:true,message:`Sprawdzono ${result.accounts} kont. Nowe blokady: ${result.held}.`,...result});
    }
    if(action==='review_all_unread'){
      const hidden=excludedIds(env,owner.user.id), clause=pendingClause(hidden);
      const at=new Date().toISOString();
      const sql=`INSERT OR IGNORE INTO aio_ip_policy_hold_reviews_v9
        (user_id,ip_key,hold_created_at,reviewed_at,reviewed_by)
        SELECT h.user_id,h.ip_key,h.created_at,?,? FROM aio_ip_policy_holds_v8 h
        WHERE ${clause}`;
      const result=await env.COMMUNITY_DB.prepare(sql).bind(at,owner.user.id,...hidden).run();
      const reviewed=Math.max(0,Number(result.meta?.changes||0));
      if(reviewed)await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,
        action:'ip_policy_unread_reviewed',reason:'Potwierdzono '+reviewed+' nowych blokad IP; bez zmiany uprawnień.'});
      return respond({ok:true,reviewed,message:reviewed
        ?'Zapoznano się z '+reviewed+' blokadami. Konta nadal są zablokowane.'
        :'Brak nowych blokad do zapoznania. Nie zmieniono żadnego konta.'});
    }
    if(action==='review_group'){
      if(!validIpKey(key))invalid(400,'Nieprawidłowy identyfikator sieci.');
      const result=await reviewIpGroup(env,key,safe(data.ip,80),owner.user.id);
      if(result.reviewed>0)await moderationLog(env,owner.user.id,{
        targetType:'user',targetId:owner.user.id,action:'ip_policy_group_reviewed',
        reason:'Przejrzano '+result.reviewed+' blokad z sieci '+key.slice(0,12)+'; bez odblokowania kont.'});
      return respond({ok:true,reviewed:result.reviewed,
        message:result.reviewed>0
          ?'Oznaczono jako przejrzane '+result.reviewed+' blokad. Konta NADAL są zablokowane na tym IP.'
          :'W tej sieci nie ma nowych blokad do przejrzenia. Żadna blokada nie została zdjęta.'});
    }
    if(action==='review_hold'){
      if(!validId(data.user_id)||!validIpKey(key))invalid(400,'Nieprawidłowe konto lub identyfikator IP.');
      const at=new Date().toISOString();
      const r=await env.COMMUNITY_DB.prepare(`INSERT OR IGNORE INTO aio_ip_policy_hold_reviews_v9
        (user_id,ip_key,hold_created_at,reviewed_at,reviewed_by)
        SELECT user_id,ip_key,created_at,?,? FROM aio_ip_policy_holds_v8
        WHERE user_id=? AND ip_key=? AND status='active'`)
        .bind(at,owner.user.id,data.user_id,key).run();
      if(Number(r.meta?.changes||0)===0){
        const exists=await env.COMMUNITY_DB.prepare(`SELECT 1 ok FROM aio_ip_policy_holds_v8 h
          LEFT JOIN aio_ip_policy_hold_reviews_v9 v ON v.user_id=h.user_id AND v.ip_key=h.ip_key AND v.hold_created_at=h.created_at
          WHERE h.user_id=? AND h.ip_key=? AND h.status='active' AND v.user_id IS NOT NULL LIMIT 1`).bind(data.user_id,key).first();
        if(!exists)invalid(409,'Blokada jest już nieaktywna lub została zmieniona. Odśwież panel.');
        return respond({ok:true,message:'To zdarzenie było już przejrzane. Blokada pozostaje aktywna.'});
      }
      await moderationLog(env,owner.user.id,{targetUserId:data.user_id,targetType:'user',targetId:data.user_id,
        action:'ip_policy_hold_reviewed',reason:'Przejrzano blokadę IP: '+key.slice(0,12)+'; dostęp pozostaje zablokowany.'});
      return respond({ok:true,message:'Oznaczono jako przejrzane. Blokada nadal obowiązuje, powiadomienie znika z licznika.'});
    }
    if(action==='approve_user'){
      if(!validId(data.user_id))invalid(400,'Nieprawidłowe ID konta.');
      if(reason.length<10)invalid(400,'Podaj przyczynę zatwierdzenia (minimum 10 znaków).');
      const hold=await env.COMMUNITY_DB.prepare("SELECT ip_key FROM aio_ip_policy_holds_v8 WHERE user_id=? AND ip_key=? AND status='active'").bind(data.user_id,key).first();
      if(!hold)invalid(409,'Brak aktywnej blokady dla tego konta i IP.');
      await grantException(env,key,data.user_id,owner.user.id,reason);
      await moderationLog(env,owner.user.id,{targetUserId:data.user_id,targetType:'user',targetId:data.user_id,action:'ip_policy_exception_approved',reason});
      return respond({ok:true,message:'Zatwierdzono wyjątek na wskazanym IP. Zdjęto blokadę duplikatu.'});
    }
    if(action==='revoke_signup_permits'){
      if(!validIpKey(key))invalid(400,'Nieprawidłowy identyfikator sieci.');
      const row=await env.COMMUNITY_DB.prepare('SELECT remaining FROM aio_ip_policy_signup_permits WHERE ip_key=?').bind(key).first();
      const count=Math.max(0,Number(row?.remaining||0));
      if(!count)return respond({ok:true,revoked:0,message:'Ta sieć nie ma niewykorzystanych zgód na nowe rejestracje.'});
      await env.COMMUNITY_DB.prepare('UPDATE aio_ip_policy_signup_permits SET remaining=0 WHERE ip_key=? AND remaining>0').bind(key).run();
      await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,
        action:'ip_policy_signup_permits_revoked',reason:'Cofnięto '+count+' niewykorzystanych zgód; sieć '+key.slice(0,12)});
      return respond({ok:true,revoked:count,message:'Cofnięto '+count+' niewykorzystanych zgód. Konta i blokady pozostały bez zmian.'});
    }
    if(action==='revoke_all_signup_permits'){
      const row=await env.COMMUNITY_DB.prepare('SELECT COALESCE(SUM(remaining),0) total FROM aio_ip_policy_signup_permits WHERE remaining>0').first();
      const count=Math.max(0,Number(row?.total||0));
      if(!count)return respond({ok:true,revoked:0,message:'Nie znaleziono niewykorzystanych zgód do cofnięcia.'});
      await env.COMMUNITY_DB.prepare('UPDATE aio_ip_policy_signup_permits SET remaining=0 WHERE remaining>0').run();
      await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,
        action:'ip_policy_all_signup_permits_revoked',reason:'Cofnięto '+count+' niewykorzystanych zgód na rejestrację.'});
      return respond({ok:true,revoked:count,message:'Cofnięto '+count+' niewykorzystanych zgód w D1. Istniejące konta, blokady i limity pozostały bez zmian.'});
    }
    if(action==='allow_next'){
      if(reason.length<10)invalid(400,'Podaj uzasadnienie (minimum 10 znaków).');
      await allowNextSignup(env,key,owner.user.id,reason,safe(data.ip,80));
      await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,action:'ip_policy_registration_exception',reason:'Dodano 1 zgodę na rejestrację, sieć: '+key.slice(0,12)});
      return respond({ok:true,message:'Jedna dodatkowa rejestracja na wskazanym IP została dopuszczona.'});
    }
    invalid(400,'Nieznane działanie.');
  }catch(e){console.error('[AIO IP policy POST]',String(e?.message||e).slice(0,150));return handleError(e)}
}
