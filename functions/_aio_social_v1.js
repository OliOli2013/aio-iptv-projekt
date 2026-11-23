import {scanSimilarityForUser} from './_aio_account_similarity_v1.js'; // AIO_SIMILARITY_V1
/* AIO Social Registration V1: OAuth/OIDC code flow; strictly optional and fail-closed.
 * NO social identity is trusted from browser data. D1 state is one-time and expires after 10 min.
 */
import {
  ensureSchema, getSession, hashPassword, safeEqual, randomToken, sha256,
  cleanEmail, clientIp, isoNow, addDays, sessionCookie, publicProfile,
  isOwnerId, recordIp
} from './_community.js';
import {ensureUsernamePolicy, checkUsername, claimUsernameStatement, usernameRenameReview, consumeLegacyLogin} from './_aio_username_policy_v1.js';
import {gmailMailbox} from './_aio_network_prefix_v1.js';
import {registrationPreflight, registrationReviewStatement} from './_aio_multikonta_guard_v2.js';
import {checkVpnAtRegistration,checkVpnAtLogin,vpnReply} from './_aio_vpn_guard_v1.js';
import {reserveRegistrationIp, rollbackRegistrationIp, permitRegistrationStatement, checkAfterValidLogin} from './_aio_ip_one_account_v7.js';
import {strictSessionGate} from './_aio_strict_ip_v4.js';
import {emailIsBlocked} from './_aio_email_blocks.js';
import {ensureEmailVerificationSchema, sendVerificationEmail, emailVerificationStatus} from './_aio_email_verification.js';
import {logSecurity} from './_aio_security_journal.js';

const FLOW_TTL_MS = 10 * 60 * 1000;
const COOKIE_NAME = 'aio_social_state';
const DEFAULT_ORIGIN = 'https://aio-iptv-projekt.pages.dev';
const DEFAULT_FB_VERSION = 'v26.0';
const ENCODER = new TextEncoder();
const BLOCKED_MSG = 'Rejestracja wymaga weryfikacji. Nie utworzono konta. Skontaktuj się z administracją.';
const msg = (status, message, code) => Object.assign(new Error(message), {status, code});
const asString = v => String(v ?? '').trim();
const asURL = req => new URL(req.url);
const enabled = env => asString(env?.AIO_SOCIAL_LOGIN_ENABLED) === '1';
const fbVersion = env => /^v\d+\.0$/.test(asString(env?.AIO_FACEBOOK_GRAPH_VERSION)) ? asString(env.AIO_FACEBOOK_GRAPH_VERSION) : DEFAULT_FB_VERSION;
const configured = (env, p) => enabled(env) && (p === 'google'
  ? Boolean(asString(env?.AIO_GOOGLE_CLIENT_ID) && asString(env?.AIO_GOOGLE_CLIENT_SECRET))
  : p === 'facebook' && Boolean(asString(env?.AIO_FACEBOOK_APP_ID) && asString(env?.AIO_FACEBOOK_APP_SECRET)));
const origin = env => {
  const value = asString(env?.AIO_SOCIAL_PUBLIC_ORIGIN || DEFAULT_ORIGIN);
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password) throw msg(503,'Nieprawidłowy adres publiczny OAuth.');
  return u.origin;
};
const callbackURL = env => origin(env) + '/api/aio-social-callback';
const ret = code => '/community.html?aio_social=' + encodeURIComponent(code);
const cookie = (value, maxAge=600) => `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/api/aio-social-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const cookieValue = req => {
  const part = (req.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE_NAME+'='));
  return part ? decodeURIComponent(part.split('=').slice(1).join('=')) : '';
};
const safeEmail = email => {const e=cleanEmail(email);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:'';};
const sameOrigin = req => {
  const value = req.headers.get('Origin');
  return (!value || value===asURL(req).origin) && req.headers.get('Sec-Fetch-Site')!=='cross-site';
};
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const decodeUrl = encoded => {
  if(!/^[A-Za-z0-9_-]+$/.test(encoded))throw msg(401,'Nieprawidłowy token dostawcy.');
  const b64=encoded.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(b64.padEnd(Math.ceil(b64.length/4)*4,'='));
  return Uint8Array.from(raw,x=>x.charCodeAt(0));
};
const hashIp = async req => sha256('aio-social-ip-v1:'+(clientIp(req)||'missing'));
const onlineJSON = async (url,options={}) => {
  const resp=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!resp.ok)throw msg(502,'Dostawca logowania jest chwilowo niedostępny.');
  return await resp.json().catch(()=>{throw msg(502,'Nieprawidłowa odpowiedź dostawcy.');});
};
const verifierChallenge = async verifier => {
  const digest = await crypto.subtle.digest('SHA-256',ENCODER.encode(verifier));
  return b64url(new Uint8Array(digest));
};

export function socialConfig(env){
  return {ok:true,enabled:enabled(env),providers:{google:configured(env,'google'),facebook:configured(env,'facebook')}};
}

export async function ensureSocialSchema(env){
  await ensureSchema(env);
  await env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_social_identities_v1 (
      provider TEXT NOT NULL CHECK(provider IN ('google','facebook')),
      subject TEXT NOT NULL,user_id TEXT NOT NULL,
      linked_at TEXT NOT NULL,last_login_at TEXT,
      PRIMARY KEY(provider,subject),UNIQUE(provider,user_id),
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_social_identity_user ON aio_social_identities_v1(user_id)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_social_flows_v1 (
      state_hash TEXT PRIMARY KEY,provider TEXT NOT NULL,mode TEXT NOT NULL,
      requested_name TEXT NOT NULL DEFAULT '',user_id TEXT,session_hash TEXT,
      nonce TEXT NOT NULL DEFAULT '',pkce_verifier TEXT NOT NULL DEFAULT '',
      ip_hash TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_social_flow_ip ON aio_social_flows_v1(ip_hash,created_at)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_social_flow_expiry ON aio_social_flows_v1(expires_at)')
  ]);
}

async function verifyTurnstile(env,req,token){
  const secret=asString(env.AIO_TURNSTILE_SECRET_KEY),site=asString(env.AIO_TURNSTILE_SITE_KEY);
  if(!secret&&!site)return true; // mirrors existing optional anti-bot configuration
  if(!secret||!site)throw msg(503,'Konfiguracja Turnstile jest niekompletna.');
  if(!token||token.length>3000)throw msg(403,'Potwierdź zabezpieczenie Turnstile.');
  const form=new URLSearchParams({secret,response:token});
  const ip=clientIp(req);if(ip)form.set('remoteip',ip);
  const result=await onlineJSON('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form.toString()});
  if(result.success!==true || (result.hostname && result.hostname!==asURL(req).hostname))throw msg(403,'Potwierdzenie Turnstile nie powiodło się.');
  return true;
}

async function linkedStatus(env,userId){
  const d=await env.COMMUNITY_DB.prepare('SELECT provider,linked_at,last_login_at FROM aio_social_identities_v1 WHERE user_id=?').bind(userId).all();
  return d.results||[];
}
export async function getSocialStatus(req,env){
  const base=socialConfig(env);
  if(!base.enabled)return {...base,authenticated:false,linked:[]};
  const s=await getSession(req,env,{touch:false,allowUnverified:true,allowRename:true});
  if(!s?.user||s.blocked||s.banned)return {...base,authenticated:false,linked:[]};
  await ensureSocialSchema(env);
  return {...base,authenticated:true,linked:await linkedStatus(env,s.user.id)};
}

async function rateLimitedLinkPassword(env,userId,password){
  // Extra protection against password guessing with a stolen session cookie.
  const db=env.COMMUNITY_DB,key='social-link:'+await sha256(userId);
  const now=Date.now(),cutoff=new Date(now-15*60*1000).toISOString();
  const row=await db.prepare('SELECT attempts,first_at,blocked_until FROM community_login_attempts WHERE key=?').bind(key).first();
  if(row?.blocked_until && Date.parse(row.blocked_until)>now)throw msg(429,'Zbyt wiele prób. Spróbuj później.');
  try{await verifyLinkPassword(env,userId,password);}
  catch(e){
    const at=isoNow(),until=new Date(now+15*60*1000).toISOString();
    await db.prepare(`INSERT INTO community_login_attempts(key,attempts,first_at,last_at,blocked_until)
      VALUES(?,1,?,?,NULL)
      ON CONFLICT(key) DO UPDATE SET
        attempts=CASE WHEN first_at<? THEN 1 ELSE attempts+1 END,
        first_at=CASE WHEN first_at<? THEN excluded.first_at ELSE first_at END,
        last_at=excluded.last_at,
        blocked_until=CASE WHEN first_at>=? AND attempts>=4 THEN ? ELSE NULL END`)
      .bind(key,at,at,cutoff,cutoff,cutoff,until).run();
    throw msg(403,'Nie można potwierdzić hasła konta AIO.');
  }
  await db.prepare('DELETE FROM community_login_attempts WHERE key=?').bind(key).run();
}

async function verifyLinkPassword(env,userId,password){
  if(typeof password!=='string'||password.length<10||password.length>200)throw msg(403,'Podaj aktualne hasło konta AIO.');
  const row=await env.COMMUNITY_DB.prepare('SELECT password_hash,password_salt,password_iterations FROM community_auth WHERE user_id=?').bind(userId).first();
  if(!row)throw msg(403,'Nie można potwierdzić konta AIO.');
  const computed=await hashPassword(password,row.password_salt,Number(row.password_iterations||100000));
  if(!safeEqual(computed.hash,row.password_hash))throw msg(403,'Nieprawidłowe hasło konta AIO.');
}

export async function startSocial(req,env,body){
  if(!sameOrigin(req))throw msg(403,'Niedozwolone źródło żądania.');
  const provider=asString(body?.provider),mode=asString(body?.mode);
  if(!configured(env,provider))throw msg(404,'Ten sposób logowania nie jest obecnie dostępny.');
  if(!['register','login','link'].includes(mode))throw msg(400,'Wybierz sposób rejestracji lub logowania.');
  if(asURL(req).origin!==origin(env))throw msg(403,'Nieprawidłowa domena logowania.');
  const s=await getSession(req,env,{touch:false,allowUnverified:true,allowRename:true});
  const hasSession=Boolean(s?.user && !s.blocked && !s.banned);
  if(s?.blocked||s?.banned)throw msg(403,'Dostęp do bieżącego konta AIO jest wstrzymany.');
  if(mode==='link'){
    if(!hasSession)throw msg(401,'Zaloguj się na istniejące konto AIO.');
    await rateLimitedLinkPassword(env,s.user.id,body.password);
  }else if(hasSession)throw msg(409,'Najpierw wyloguj się z bieżącego konta.');
  const requestedName=mode==='register'?asString(body.displayName):'';
  if(mode==='register'){
    if(requestedName.length<2||requestedName.length>60)throw msg(400,'Podaj nazwę konta od 2 do 60 znaków.');
    // Verified here; never ask provider callback to reuse a one-time Turnstile token.
    await verifyTurnstile(env,req,asString(body.turnstileToken));
  }
  await ensureSocialSchema(env);
  const db=env.COMMUNITY_DB;
  // Remove abandoned one-time state, including the associated short-lived browser/network metadata.
  await db.prepare('DELETE FROM aio_social_flows_v1 WHERE expires_at<?').bind(isoNow()).run();
  const ipHash=await hashIp(req);
  const count=await db.prepare('SELECT COUNT(*) n FROM aio_social_flows_v1 WHERE ip_hash=? AND created_at>?')
    .bind(ipHash,new Date(Date.now()-3600000).toISOString()).first();
  if(Number(count?.n||0)>=12)throw msg(429,'Zbyt wiele prób logowania. Spróbuj później.');
  const state=randomToken(),nonce=randomToken(24),pkceVerifier=randomToken(48),stateHash=await sha256(state);
  const redirect=callbackURL(env),time=isoNow();
  const url=provider==='google'
    ? new URL('https://accounts.google.com/o/oauth2/v2/auth')
    : new URL(`https://www.facebook.com/${fbVersion(env)}/dialog/oauth`);
  const client=provider==='google'?asString(env.AIO_GOOGLE_CLIENT_ID):asString(env.AIO_FACEBOOK_APP_ID);
  url.searchParams.set('client_id',client);url.searchParams.set('redirect_uri',redirect);
  url.searchParams.set('response_type','code');url.searchParams.set('state',state);
  if(provider==='google'){
    url.searchParams.set('scope','openid email profile');url.searchParams.set('nonce',nonce);
    url.searchParams.set('code_challenge_method','S256');url.searchParams.set('code_challenge',await verifierChallenge(pkceVerifier));
    url.searchParams.set('prompt','select_account');
  }else{url.searchParams.set('scope','public_profile,email');}
  await db.prepare(`INSERT INTO aio_social_flows_v1
    (state_hash,provider,mode,requested_name,user_id,session_hash,nonce,pkce_verifier,ip_hash,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(stateHash,provider,mode,requestedName,mode==='link'?s.user.id:null,mode==='link'?s.tokenHash:null,
      nonce,provider==='google'?pkceVerifier:'',ipHash,time,new Date(Date.now()+FLOW_TTL_MS).toISOString()).run();
  // Cookie is scoped to callback; no localStorage, query token, or browser-verifiable identity.
  return {url:url.toString(),stateCookie:cookie(state)};
}

export async function verifyGoogleIdToken(token,clientId,expectedNonce,fetchKeys=onlineJSON){
  if(typeof token!=='string'||token.length>12000)throw msg(401,'Błąd weryfikacji Google.');
  const parts=token.split('.');if(parts.length!==3)throw msg(401,'Nieprawidłowy token Google.');
  let header,claims;
  try{header=JSON.parse(new TextDecoder().decode(decodeUrl(parts[0])));claims=JSON.parse(new TextDecoder().decode(decodeUrl(parts[1])));}catch{throw msg(401,'Nieprawidłowy token Google.');}
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128)throw msg(401,'Nieobsługiwany podpis Google.');
  const now=Math.floor(Date.now()/1000);
  if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)
    ||claims.aud!==clientId||claims.nonce!==expectedNonce||typeof claims.sub!=='string'||!claims.sub
    ||!Number.isFinite(Number(claims.exp))||Number(claims.exp)<=now
    ||!Number.isFinite(Number(claims.iat))||Number(claims.iat)>now+60
    ||(claims.azp && claims.azp!==clientId))throw msg(401,'Nieprawidłowy odbiorca lub ważność tokena Google.');
  const jwks=await fetchKeys('https://www.googleapis.com/oauth2/v3/certs');
  const jwk=(jwks.keys||[]).find(k=>k.kid===header.kid && k.kty==='RSA' && (!k.alg||k.alg==='RS256') && (!k.use||k.use==='sig'));
  if(!jwk)throw msg(401,'Nieznany klucz podpisu Google.');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeUrl(parts[2]),ENCODER.encode(parts[0]+'.'+parts[1]));
  if(!valid || claims.email_verified!==true || !safeEmail(claims.email))throw msg(401,'Google nie potwierdził adresu e-mail.');
  return {provider:'google',subject:claims.sub,email:safeEmail(claims.email),verifiedEmail:true};
}

async function facebookIdentity(env,accessToken){
  if(typeof accessToken!=='string'||!accessToken||accessToken.length>4000)throw msg(401,'Nieprawidłowy token Facebooka.');
  const appId=asString(env.AIO_FACEBOOK_APP_ID),secret=asString(env.AIO_FACEBOOK_APP_SECRET),base=`https://graph.facebook.com/${fbVersion(env)}`;
  const debug=new URL(base+'/debug_token');
  debug.searchParams.set('input_token',accessToken);debug.searchParams.set('access_token',appId+'|'+secret);
  const verified=await onlineJSON(debug.toString());
  if(verified?.data?.is_valid!==true || String(verified.data.app_id)!==appId || !verified.data.user_id ||
     (Number(verified.data.expires_at)>0 && Number(verified.data.expires_at)<=Date.now()/1000))
    throw msg(401,'Nie udało się zweryfikować konta Facebook.');
  const proofBytes=await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',ENCODER.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),ENCODER.encode(accessToken));
  const proof=[...new Uint8Array(proofBytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const me=new URL(base+'/me');me.searchParams.set('fields','id,email');me.searchParams.set('appsecret_proof',proof);
  const profile=await onlineJSON(me.toString(),{headers:{authorization:'Bearer '+accessToken}});
  if(String(profile.id)!==String(verified.data.user_id))throw msg(401,'Niezgodność identyfikatora konta Facebook.');
  return {provider:'facebook',subject:String(profile.id),email:safeEmail(profile.email),verifiedEmail:false};
}

async function providerIdentity(env,flow,code){
  const redirect=callbackURL(env);
  if(flow.provider==='google'){
    const result=await onlineJSON('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({code,client_id:asString(env.AIO_GOOGLE_CLIENT_ID),client_secret:asString(env.AIO_GOOGLE_CLIENT_SECRET),
        redirect_uri:redirect,grant_type:'authorization_code',code_verifier:flow.pkce_verifier}).toString()});
    return verifyGoogleIdToken(result.id_token,asString(env.AIO_GOOGLE_CLIENT_ID),flow.nonce);
  }
  const tokenURL=new URL(`https://graph.facebook.com/${fbVersion(env)}/oauth/access_token`);
  tokenURL.searchParams.set('client_id',asString(env.AIO_FACEBOOK_APP_ID));
  tokenURL.searchParams.set('client_secret',asString(env.AIO_FACEBOOK_APP_SECRET));
  tokenURL.searchParams.set('redirect_uri',redirect);tokenURL.searchParams.set('code',code);
  const result=await onlineJSON(tokenURL.toString());
  return facebookIdentity(env,result.access_token);
}

async function existingEmailAccount(env,email){
  const db=env.COMMUNITY_DB;
  const direct=await db.prepare('SELECT user_id FROM community_auth WHERE email=? LIMIT 1').bind(email).first();
  if(direct)return direct.user_id;
  const mailbox=gmailMailbox(email);
  if(!mailbox)return null;
  const candidates=await db.prepare("SELECT user_id,email FROM community_auth WHERE email LIKE '%@gmail.com' OR email LIKE '%@googlemail.com' LIMIT 10000").all();
  return (candidates.results||[]).find(x=>gmailMailbox(x.email)===mailbox)?.user_id||null;
}

async function blockLoginByPolicy(env,req,account){
  const id=account.user_id,ip=clientIp(req);
  if(await emailIsBlocked(env,account.email))throw msg(403,'Konto wymaga kontaktu z administracją.');
  if(account.banned_until&&Date.parse(account.banned_until)>Date.now())throw msg(403,'Dostęp do konta został wstrzymany.');
  if(!await isOwnerId(env,id,account.role)){
    if(await strictSessionGate(env,id,ip))throw msg(403,'Dostęp do konta wymaga weryfikacji.');
    if(await checkAfterValidLogin(env,req,id,account.role))throw msg(403,'Dostęp do konta wymaga weryfikacji.');
    if(ip){
      const b=await env.COMMUNITY_DB.prepare(`SELECT 1 yes FROM community_ip_blocks WHERE ip_address=? AND active=1
        AND (permanent=1 OR expires_at IS NULL OR datetime(expires_at)>datetime('now')) LIMIT 1`).bind(ip).first();
      if(b)throw msg(403,'Dostęp do konta wymaga weryfikacji.');
    }
    // AIO_USERNAME_POLICY_V1_4_20261120 — social login uses the same chosen-user gate.
    // Normal features remain guarded by getSession until any required rename finishes.
    const network=await checkVpnAtLogin(env,req),response=vpnReply(network,'login');
    if(response)throw msg(response.status,response.body.error,response.body.code);
    const review=await usernameRenameReview(env,id,account.display_name,account.role,{fullScan:true,assignOnLogin:true});
    if(review)await consumeLegacyLogin(env,id); // audit first use; never lock a repeat sign-in
    return network.warning;
  }
}

async function newSocialAccount(env,req,flow,person){
  const email=person.email;
  if(!email)throw msg(403,'Dostawca nie udostępnił e-maila. Użyj rejestracji tradycyjnej.');
  if(await emailIsBlocked(env,email))throw msg(403,BLOCKED_MSG);
  if(await existingEmailAccount(env,email))throw msg(409,'Konto AIO już istnieje. Zaloguj się do niego i połącz dostawcę w Moim Koncie.');
  await ensureUsernamePolicy(env);
  const checked=await checkUsername(env,flow.requested_name,'',false);
  if(!checked.ok)throw msg(409,checked.error);
  // Turnstile was server-verified at start; only the one-time D1 state can carry that assurance.
  const risk=await registrationPreflight(env,req,{email,displayName:flow.requested_name,turnstileToken:'',turnstileAlreadyVerified:true});
  if(risk?.hold || Number(risk?.score||0)>=5)throw msg(409,BLOCKED_MSG);
  const vpn=await checkVpnAtRegistration(env,req);
  const response=vpnReply(vpn,'register');
  if(response)throw msg(response.status,response.body.error,response.body.code);
  if(email===cleanEmail(env.COMMUNITY_OWNER_EMAIL||''))throw msg(409,BLOCKED_MSG);
  await ensureEmailVerificationSchema(env);
  const id=crypto.randomUUID(),db=env.COMMUNITY_DB,ip=clientIp(req),at=isoNow();
  const password=await hashPassword(randomToken(64)); // unguessable; not the Google/Facebook password
  const lease=await reserveRegistrationIp(env,req,id);
  try{
    // Fail closed if email/provider ID/username is claimed concurrently. Batch is atomic.
    await db.batch([
      db.prepare(`INSERT INTO community_profiles(id,email,display_name,role,trusted,created_at,updated_at)
        VALUES(?,?,?,'user',0,?,?)`).bind(id,email,checked.name,at,at),
      db.prepare(`INSERT INTO community_auth(user_id,email,password_hash,password_salt,password_iterations,created_at)
        VALUES(?,?,?,?,?,?)`).bind(id,email,password.hash,password.salt,password.iterations,at),
      claimUsernameStatement(env,id,checked.key),
      db.prepare('INSERT INTO aio_social_identities_v1(provider,subject,user_id,linked_at) VALUES(?,?,?,?)')
        .bind(person.provider,person.subject,id,at),
      db.prepare(`INSERT INTO aio_email_verifications(user_id,verified_at,created_at)
        VALUES(?,?,?)`).bind(id,person.verifiedEmail?at:null,at),
      permitRegistrationStatement(env,lease,id),
      registrationReviewStatement(env,id,risk)
    ].filter(Boolean));
  }catch(error){await rollbackRegistrationIp(env,lease,id);throw error;}
  await recordIp(env,id,ip,'access').catch(()=>{});
  await scanSimilarityForUser(env,id).catch(e=>console.error('[AIO similarity social signup]',String(e?.message||e).slice(0,120)));
  await logSecurity(env,req,'register_ok',id,'social:'+person.provider).catch(()=>{});
  if(!person.verifiedEmail){
    try{await sendVerificationEmail(env,id,email);}catch(e){console.error('AIO Social: email verification send failed',Number(e.status||500));}
  }
  return {userId:id,code:(person.verifiedEmail?'registered':'verify_email')+(vpn.warning?'_vpn':'')};
}

async function linkExisting(env,req,flow,person){
  const s=await getSession(req,env,{touch:false,allowUnverified:true,allowRename:true});
  if(!s?.user||s.blocked||s.banned||s.user.id!==flow.user_id||s.tokenHash!==flow.session_hash)
    throw msg(403,'Sesja AIO zmieniła się. Powtórz łączenie kont.');
  const db=env.COMMUNITY_DB,existing=await db.prepare('SELECT user_id FROM aio_social_identities_v1 WHERE provider=? AND subject=?')
    .bind(person.provider,person.subject).first();
  if(existing){if(existing.user_id===s.user.id)return {code:'already_linked'};throw msg(409,'To konto dostawcy jest już połączone z innym kontem AIO.');}
  const other=await db.prepare('SELECT subject FROM aio_social_identities_v1 WHERE provider=? AND user_id=?')
    .bind(person.provider,s.user.id).first();
  if(other)throw msg(409,'To konto AIO ma już połączony profil tego dostawcy.');
  await db.prepare('INSERT INTO aio_social_identities_v1(provider,subject,user_id,linked_at) VALUES(?,?,?,?)')
    .bind(person.provider,person.subject,s.user.id,isoNow()).run();
  await logSecurity(env,req,'social_link',s.user.id,person.provider).catch(()=>{});
  return {code:'linked'};
}

async function loginExisting(env,req,person){
  const db=env.COMMUNITY_DB;
  const linked=await db.prepare('SELECT user_id FROM aio_social_identities_v1 WHERE provider=? AND subject=?').bind(person.provider,person.subject).first();
  if(!linked){
    if(person.email && await existingEmailAccount(env,person.email))throw msg(409,'Konto AIO już istnieje. Zaloguj się hasłem i połącz konto dostawcy.');
    throw msg(404,'Nie ma konta AIO powiązanego z tym dostawcą. Wybierz „Utwórz konto”.');
  }
  const account=await db.prepare(`SELECT a.*,p.* FROM community_auth a JOIN community_profiles p ON p.id=a.user_id WHERE a.user_id=?`).bind(linked.user_id).first();
  if(!account)throw msg(403,'Konto AIO jest niedostępne.');
  const networkWarning=await blockLoginByPolicy(env,req,account);
  const token=randomToken(),at=isoNow();
  await db.batch([
    db.prepare('INSERT INTO community_sessions(token_hash,user_id,expires_at,created_at,last_seen_at,ip_address,user_agent) VALUES(?,?,?,?,?,?,?)')
      .bind(await sha256(token),account.user_id,addDays(30),at,at,clientIp(req),req.headers.get('user-agent')||''),
    db.prepare('UPDATE community_auth SET last_login_at=? WHERE user_id=?').bind(at,account.user_id),
    db.prepare('UPDATE aio_social_identities_v1 SET last_login_at=? WHERE provider=? AND subject=?').bind(at,person.provider,person.subject)
  ]);
  await recordIp(env,account.user_id,clientIp(req),'access').catch(()=>{});
  await logSecurity(env,req,'login_ok',account.user_id,'social:'+person.provider).catch(()=>{});
  const ev=await emailVerificationStatus(env,account.user_id);
  return {code:(ev.required?'verify_email':'logged_in')+(networkWarning?'_vpn':''),sessionToken:token};
}

export async function finishSocial(req,env){
  if(!enabled(env))throw msg(404,'Logowanie społecznościowe jest wyłączone.');
  if(asURL(req).origin!==origin(env))throw msg(403,'Niewłaściwa domena OAuth.');
  const url=asURL(req),state=url.searchParams.get('state')||'',saved=cookieValue(req);
  if(!state || state.length>200 || !saved || !safeEqual(state,saved))throw msg(403,'Nieprawidłowy stan logowania.');
  await ensureSocialSchema(env);
  const db=env.COMMUNITY_DB,stateHash=await sha256(state);
  // One-time, atomic consume. A replay can never recreate an account or login.
  const flow=await db.prepare('DELETE FROM aio_social_flows_v1 WHERE state_hash=? AND expires_at>? RETURNING *')
    .bind(stateHash,isoNow()).first();
  if(!flow)throw msg(409,'Logowanie wygasło lub zostało już wykorzystane.');
  if(!configured(env,flow.provider))throw msg(404,'Dostawca logowania jest wyłączony.');
  if(flow.ip_hash!==await hashIp(req))throw msg(403,'Adres sieci zmienił się podczas weryfikacji. Spróbuj ponownie.');
  if(url.searchParams.has('error'))throw msg(400,'Anulowano weryfikację u dostawcy.');
  const code=url.searchParams.get('code')||'';
  if(code.length<8||code.length>6000)throw msg(400,'Brak kodu uwierzytelnienia dostawcy.');
  const person=await providerIdentity(env,flow,code);
  if(!person?.subject || person.subject.length>256)throw msg(401,'Dostawca nie potwierdził identyfikatora konta.');
  if(flow.mode==='register'){
    const existing=await db.prepare('SELECT user_id FROM aio_social_identities_v1 WHERE provider=? AND subject=?')
      .bind(person.provider,person.subject).first();
    if(existing)throw msg(409,'Tożsamość ma już konto AIO. Wybierz „Zaloguj”.');
    return newSocialAccount(env,req,flow,person);
  }
  if(flow.mode==='link')return linkExisting(env,req,flow,person);
  if(flow.mode==='login')return loginExisting(env,req,person);
  throw msg(400,'Niedozwolona operacja.');
}

export function redirectSocial(code, sessionToken=null){
  const headers=new Headers({'Location':ret(code),'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  headers.append('Set-Cookie',cookie('',0));
  if(sessionToken)headers.append('Set-Cookie',sessionCookie(sessionToken));
  return new Response(null,{status:303,headers});
}

export function apiError(error){
  const status=[400,401,403,404,409,415,429].includes(error?.status)?error.status:503;
  return new Response(JSON.stringify({ok:false,error:status===503?'Usługa logowania jest chwilowo niedostępna.':String(error.message||'Błąd logowania.')}),
    {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
