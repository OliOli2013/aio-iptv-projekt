/* AIO Session Network V1 — transient, session-scoped network revalidation.
 * Only active when AIO_VPN_LOGIN_MODE=enforce. A new network is checked once,
 * then reuses a bounded decision. No permanent profile ban and no raw IP in D1.
 */
import {sha256,clientIp} from './_community.js';
import {publicNetworkIp,checkVpnAtLogin} from './_aio_vpn_guard_v1.js';

const TTL_MS=60*60*1000;
const DENIED_MESSAGE='Połączenie rozpoznano jako VPN, proxy lub Tor. Wyłącz tę usługę i spróbuj ponownie. Jeśli to pomyłka, skontaktuj się z administracją.';
const RETRY_MESSAGE='Nie można obecnie zweryfikować sieci. Spróbuj ponownie później. Konto nie zostało zablokowane.';

export function accessNetworkDecision(kind){
  if(kind==='vpn'||kind==='proxy'||kind==='tor')return {allowed:false,status:403,code:'AIO_VPN_CONNECTION',error:DENIED_MESSAGE};
  if(kind==='unknown')return {allowed:false,status:503,code:'AIO_NETWORK_RETRY',error:RETRY_MESSAGE};
  return {allowed:true,status:200,code:'AIO_NETWORK_OK'};
}

export async function checkProtectedSessionNetwork(env,request,session){
  if(String(env?.AIO_VPN_LOGIN_MODE||'').trim().toLowerCase()!=='enforce')return {allowed:true,status:200};
  if(!session?.user||session.user.is_owner===true)return {allowed:true,status:200};
  if(!session.tokenHash||session.blocked||session.banned)return {allowed:false,status:403,code:'AIO_ACCESS_RESTRICTED',error:'Dostęp do konta wymaga wyjaśnienia.'};
  const ip=publicNetworkIp(clientIp(request));
  if(!ip)return accessNetworkDecision('unknown');
  const db=env.COMMUNITY_DB;
  const original=await db.prepare('SELECT ip_address FROM community_sessions WHERE token_hash=? AND user_id=? AND datetime(expires_at)>datetime(\'now\') LIMIT 1')
    .bind(session.tokenHash,session.user.id).first();
  if(!original)return {allowed:false,status:401,code:'AIO_SESSION_EXPIRED',error:'Sesja wygasła. Zaloguj się ponownie.'};
  // A login from this same IP passed the enforce check before session creation.
  if(publicNetworkIp(original.ip_address)===ip)return {allowed:true,status:200,source:'login'};
  const networkKey=await sha256('aio-session-network-v1:'+session.tokenHash+':'+ip);
  const ms=Date.now();
  if(Math.random()<0.02)await db.prepare('DELETE FROM aio_session_network_checks_v1 WHERE expires_ms<?')
    .bind(ms).run().catch(()=>{});
  const cached=await db.prepare(`SELECT verdict FROM aio_session_network_checks_v1
    WHERE session_hash=? AND network_key=? AND expires_ms>? LIMIT 1`)
    .bind(session.tokenHash,networkKey,ms).first();
  if(cached)return {...accessNetworkDecision(cached.verdict),source:'session_cache'};
  const checked=await checkVpnAtLogin(env,request);
  const decision=accessNetworkDecision(checked.retry?'unknown':checked.kind);
  if(decision.status===503)return decision; // never cache unverifiable or provider errors
  const verdict=checked.kind;
  await db.prepare(`INSERT INTO aio_session_network_checks_v1
    (session_hash,network_key,verdict,expires_ms,checked_at)
    VALUES(?,?,?,?,?) ON CONFLICT(session_hash,network_key) DO UPDATE SET
    verdict=excluded.verdict,expires_ms=excluded.expires_ms,checked_at=excluded.checked_at`)
    .bind(session.tokenHash,networkKey,verdict,ms+TTL_MS,new Date(ms).toISOString()).run();
  return {...decision,source:'verified'};
}
