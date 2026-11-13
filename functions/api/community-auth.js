import {registrationPreflight,registrationReviewStatement} from '../_aio_multikonta_guard_v2.js';
import {strictSessionGate,strictGlobalHold} from '../_aio_strict_ip_v4.js'; // V4.2 GLOBAL
import {ACCOUNT_RESTRICTED,REGISTRATION_RESTRICTED} from '../_aio_public_notices_v1.js';
import {ensureRelatedReviewV1,isRelatedReviewTarget} from '../_aio_related_review_v1.js';
/* aioSameOriginWrite: reject cross-site browser mutation requests. */
function aioSameOriginWrite(request) {
  const origin=request.headers.get('Origin');
  if (origin) {
    try { if (origin !== new URL(request.url).origin) return false; }
    catch (_) { return false; }
  }
  const site=request.headers.get('Sec-Fetch-Site');
  return site!=='cross-site';
}

import {
  json, ensureSchema, hashPassword, safeEqual, randomToken, sha256,
  cleanEmail, cleanText, sessionCookie, clearSessionCookie,
  clientIp, isoNow, addDays, getSession, publicProfile, errorResponse, recordIp, isOwnerId
} from "../_community.js";
import {emailSendingReady,sendVerificationEmail,emailVerificationStatus} from "../_aio_email_verification.js";
import {automaticResetEnabled,verifyResetChallenge,sendAutomaticPasswordReset,queueManualPasswordReset} from '../_aio_password_reset_auto_v1.js'; // AIO_AUTO_RESET_WP_V1
import {logSecurity,reviewSharedIpAtLogin,activeSharedHold,reviewPaidSessionSharing} from "../_aio_security_journal.js";
import {reserveRegistrationIp,rollbackRegistrationIp,permitRegistrationStatement,checkAfterValidLogin,NOTICE as IP_POLICY_NOTICE} from '../_aio_ip_one_account_v7.js';
import {getStatus} from "../_aio_account_access.js";

function validPassword(p) {
  return typeof p === "string" && p.length >= 10 && p.length <= 200;
}
/* Owner Security V4: hashed e-mail denylist shared by sign-in and sign-up. */
import {emailIsBlocked} from '../_aio_email_blocks.js';
async function throttle(env, key, request) {
  const row = await env.COMMUNITY_DB.prepare(
    `SELECT attempts, blocked_until FROM community_login_attempts WHERE key=?`
  ).bind(key).first();
  if (row?.blocked_until && Date.parse(row.blocked_until) > Date.now()) {
    await logSecurity(env,request,"login_throttled",null,"Limit błędnych prób");
    throw Object.assign(new Error("Za dużo prób. Spróbuj ponownie później."), {status:429});
  }
}
async function failAttempt(env, key) {
  // Single atomic UPSERT: parallel wrong-password attempts cannot overwrite each other.
  // After 15 minutes (or an expired penalty) the counter starts at ONE, not old+1.
  const now=isoNow(),cutoff=new Date(Date.now()-15*60*1000).toISOString();
  const until=new Date(Date.now()+15*60*1000).toISOString();
  await env.COMMUNITY_DB.prepare(`
    INSERT INTO community_login_attempts(key,attempts,first_at,last_at,blocked_until)
    VALUES(?,1,?,?,NULL)
    ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN community_login_attempts.first_at<=? OR
        (community_login_attempts.blocked_until IS NOT NULL AND community_login_attempts.blocked_until<=?)
        THEN 1 ELSE community_login_attempts.attempts+1 END,
      first_at=CASE WHEN community_login_attempts.first_at<=? OR
        (community_login_attempts.blocked_until IS NOT NULL AND community_login_attempts.blocked_until<=?)
        THEN excluded.first_at ELSE community_login_attempts.first_at END,
      last_at=excluded.last_at,
      blocked_until=CASE WHEN community_login_attempts.first_at<=? OR
        (community_login_attempts.blocked_until IS NOT NULL AND community_login_attempts.blocked_until<=?)
        THEN NULL WHEN community_login_attempts.attempts+1>=8 THEN ? ELSE NULL END
  `).bind(key,now,now,cutoff,now,cutoff,now,cutoff,now,until).run();
}
async function clearAttempt(env, key) {
  await env.COMMUNITY_DB.prepare(`DELETE FROM community_login_attempts WHERE key=?`).bind(key).run();
}

async function consumeWindowLimit(env, key, limit, windowMs) {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const row = await env.COMMUNITY_DB.prepare(
    `SELECT attempts, first_at, blocked_until FROM community_login_attempts WHERE key=?`
  ).bind(key).first();

  if (row?.blocked_until && Date.parse(row.blocked_until) > nowMs) {
    throw Object.assign(new Error("Za dużo prób. Spróbuj ponownie później."), {status:429});
  }

  const firstMs = Date.parse(row?.first_at || "");
  const expired = !Number.isFinite(firstMs) || (nowMs - firstMs >= windowMs);
  const attempts = expired ? 1 : Number(row?.attempts || 0) + 1;
  const firstAt = expired ? now : row.first_at;
  const blockedUntil = attempts > limit
    ? new Date(nowMs + windowMs).toISOString()
    : null;

  await env.COMMUNITY_DB.prepare(`
    INSERT INTO community_login_attempts(key,attempts,first_at,last_at,blocked_until)
    VALUES(?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET
      attempts=excluded.attempts,
      first_at=excluded.first_at,
      last_at=excluded.last_at,
      blocked_until=excluded.blocked_until
  `).bind(key, attempts, firstAt, now, blockedUntil).run();

  if (blockedUntil) {
    throw Object.assign(new Error("Za dużo prób. Spróbuj ponownie później."), {status:429});
  }
}


export async function onRequestGet({request, env}) {
  try {
    await ensureSchema(env);
    const session = await getSession(request, env, {allowUnverified:true});
    if (!session || session.blocked || session.banned) {
      return json({ok:true, authenticated:false});
    }
    const ev=await emailVerificationStatus(env,session.user.id);
    const hold=session.user.is_owner?null:await activeSharedHold(env,request,session.user.id).catch(()=>null);
    return json({ok:true, authenticated:true, user:session.user, profile:session.user, email_verified:ev.verified, email_verification_required:ev.required, security_warning:hold?'Dostęp do części funkcji jest obecnie ograniczony. Skontaktuj się z nami.':null});
  } catch (e) { return errorResponse(e); }
}

export async function onRequestPost({request, env}) {
  if (!aioSameOriginWrite(request)) return new Response(JSON.stringify({ok:false,error:"Niedozwolone źródło żądania."}),
    {status:403,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  try {
    await ensureSchema(env);
    await ensureRelatedReviewV1(env);
    const body = await request.json().catch(()=>({}));
    const action = String(body.action || "");
    const db = env.COMMUNITY_DB;
    const ip = clientIp(request);

    if (action === "logout") {
      const session = await getSession(request, env, {touch:false,allowUnverified:true});
      if (session?.tokenHash) {
        await db.prepare(`DELETE FROM community_sessions WHERE token_hash=?`).bind(session.tokenHash).run();
      }
      await logSecurity(env,request,"logout",session?.user?.id||null);
      return json({ok:true}, 200, {"Set-Cookie": clearSessionCookie()});
    }

    if (action === "resend_verification") {
      const session=await getSession(request,env,{touch:false,allowUnverified:true});
      if(!session || session.blocked || session.banned)return json({ok:false,error:"Zaloguj się ponownie, aby potwierdzić e-mail."},401);
      const registered=await db.prepare('SELECT email FROM community_auth WHERE user_id=? LIMIT 1').bind(session.user.id).first();
      if(!registered)return json({ok:false,error:"Nie znaleziono konta."},404);
      const sent=await sendVerificationEmail(env,session.user.id,registered.email);
      return json(sent);
    }

    if (action === "request_reset") {
      const email = cleanEmail(body.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ok:false,error:"Podaj poprawny adres e-mail."},400);
      }
      const generic='Jeśli konto istnieje, a adres e-mail został potwierdzony, otrzymasz kod do zmiany hasła. W wyjątkowych przypadkach prośba trafi do administracji.';
      // The request is rate-limited before any existence check. Never enumerate accounts.
      await consumeWindowLimit(env,`reset-ip:${ip || 'noip'}`,8,15*60*1000);
      await verifyResetChallenge(env,request,body.turnstileToken);
      const auth=await db.prepare('SELECT user_id,email FROM community_auth WHERE email=? LIMIT 1')
        .bind(email).first();
      if(!auth)return json({ok:true,message:generic});
      // Do not generate codes or owner queue entries for administratively blocked email.
      if(await emailIsBlocked(env,email))return json({ok:true,message:generic});
      // Only a proven mailbox qualifies. Reset NEVER unlocks a banned account.
      const verified=await emailVerificationStatus(env,auth.user_id);
      const profile=await db.prepare('SELECT role,banned_until FROM community_profiles WHERE id=? LIMIT 1')
        .bind(auth.user_id).first();
      const isHeld=Boolean(profile?.banned_until&&Date.parse(profile.banned_until)>Date.now()) ||
        Boolean(await strictGlobalHold(env,auth.user_id));
      const canAuto=verified.verified && !isHeld && automaticResetEnabled(env);
      // AIO_RESET_REASONS_V1_1: store an internal reason only for the owner panel.
      let manualReason=isHeld?'account_blocked':
        !verified.verified?'email_unverified':
        !automaticResetEnabled(env)?'auto_unavailable':'manual_review';
      if(canAuto){
        const outcome=await sendAutomaticPasswordReset(env,auth.user_id,auth.email);
        if(outcome.state==='sent'){
          await logSecurity(env,request,'password_reset_auto_sent',auth.user_id).catch(()=>{});
          return json({ok:true,message:generic});
        }
        // Do not queue manual requests simply because user retried during cooldown.
        if(outcome.state==='limited')return json({ok:true,message:generic});
        // Sending or code activation failed; queue an exceptional manual request.
        if(outcome.state==='delivery_failed')manualReason='delivery_failed';
      }
      await queueManualPasswordReset(env,auth.user_id,auth.email,ip,manualReason);
      return json({ok:true,message:generic});
    }

    if (action === "reset_password") {
      const code=String(body.code||'').trim();
      const password=String(body.password||'');
      if(code.length<8||code.length>80)return json({ok:false,error:'Kod resetu jest nieprawidłowy.'},400);
      if(!validPassword(password))return json({ok:false,error:'Nowe hasło musi mieć co najmniej 10 znaków.'},400);
      // Limits guessing even for manually approved reset codes. No account lookup is exposed.
      await consumeWindowLimit(env,`reset-code-ip:${ip || 'noip'}`,5,15*60*1000);
      const pw=await hashPassword(password);
      const hash=await sha256(code),stamp=isoNow();
      // Atomic claim: one code can change at most one password even under concurrent requests.
      const reset=await db.prepare(`UPDATE community_password_reset_requests
        SET status='used',used_at=?
        WHERE code_hash=? AND status='approved' AND expires_at>?
        RETURNING id,user_id`).bind(stamp,hash,stamp).first();
      if(!reset)return json({ok:false,error:'Kod resetu jest nieprawidłowy albo wygasł.'},400);
      // Password and session changes are transactional. Existing bans and VIP data are untouched.
      await db.batch([
        db.prepare(`UPDATE community_auth SET password_hash=?,password_salt=?,password_iterations=?
          WHERE user_id=?`).bind(pw.hash,pw.salt,pw.iterations,reset.user_id),
        db.prepare('DELETE FROM community_sessions WHERE user_id=?').bind(reset.user_id),
        db.prepare(`UPDATE community_password_reset_requests
          SET status='cancelled',cancelled_at=?
          WHERE user_id=? AND status IN ('pending','approved') AND id<>?`)
          .bind(stamp,reset.user_id,reset.id)
      ]);
      await logSecurity(env,request,'password_reset_ok',reset.user_id).catch(()=>{});
      return json({ok:true,message:'Hasło zostało zmienione. Możesz się zalogować.'});
    }

    if (action !== "login" && action !== "register") {
      return json({ok:false,error:"Nieznana operacja logowania."}, 400);
    }

    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ok:false,error:"Podaj poprawny adres e-mail."}, 400);
    }
    if (!validPassword(password)) {
      return json({ok:false,error:"Hasło musi mieć co najmniej 10 znaków."}, 400);
    }

    const throttleKey = `${ip || "noip"}:${email}`;
    await throttle(env, throttleKey, request);
    if(await emailIsBlocked(env,email)){
      // Poprawne hasło konta objętego przeglądem może służyć WYŁĄCZNIE do odwołania.
      // Inne blokady e-mail nadal odrzucają logowanie/rejestrację.
      const identified=action==='login'?await db.prepare('SELECT user_id FROM community_auth WHERE email=? LIMIT 1').bind(email).first():null;
      if(!isRelatedReviewTarget(identified?.user_id)){
        await logSecurity(env,request,'login_throttled',null,'Adres zablokowany administracyjnie');
        return json({ok:false,error:'Nie można korzystać z tego adresu e-mail. Skontaktuj się z nami.'},403);
      }
    }

    if (action === "register") {
      // No fake-email registration while outbound verification is unavailable.
      if(!emailSendingReady(env))return json({ok:false,error:"Rejestracja jest chwilowo niedostępna. Spróbuj ponownie później."},503);
      const registerIpKey = `register-ip:${ip || "noip"}`;
      await consumeWindowLimit(env, registerIpKey, 5, 30 * 60 * 1000);

      const exists = await db.prepare(`SELECT user_id FROM community_auth WHERE email=?`).bind(email).first();
      if (exists) return json({ok:false,error:"Konto z tym adresem już istnieje."}, 409);

      const profiles = await db.prepare(`SELECT COUNT(*) AS n FROM community_profiles`).first();
      const firstAccount = Number(profiles?.n || 0) === 0;
      const configuredOwnerEmail = cleanEmail(env.COMMUNITY_OWNER_EMAIL || "");
      const ownerAccount = configuredOwnerEmail ? email === configuredOwnerEmail : firstAccount;
      const id = crypto.randomUUID();
      const displayName = cleanText(body.displayName || email.split("@")[0], 60);
      if (displayName.length < 2) return json({ok:false,error:"Nazwa użytkownika jest za krótka."}, 400);

      // AIO_MULTIKONTA_V2: kontrola sieci/e-mail i opcjonalny Turnstile przed zapisem konta.
      const netRisk=ownerAccount?null:await registrationPreflight(env,request,{email,displayName,turnstileToken:String(body.turnstileToken||'')});
      const pw = await hashPassword(password);
      // Hard gate before creating an account: prevents multiple registrations on one IP.
      const lease = await reserveRegistrationIp(env,request,id);
      try{await db.batch([
        db.prepare(`
          INSERT INTO community_profiles
          (id,email,display_name,role,trusted,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?)
        `).bind(id,email,displayName,ownerAccount ? "admin" : "user", ownerAccount ? 1 : 0, isoNow(), isoNow()),
        db.prepare(`
          INSERT INTO community_auth
          (user_id,email,password_hash,password_salt,password_iterations,created_at)
          VALUES(?,?,?,?,?,?)
        `).bind(id,email,pw.hash,pw.salt,pw.iterations,isoNow()),
        permitRegistrationStatement(env,lease,id),
        registrationReviewStatement(env,id,netRisk)
      ].filter(Boolean));}catch(e){await rollbackRegistrationIp(env,lease,id);throw e;}

      const token = randomToken();
      const tokenHash = await sha256(token);
      const expires = addDays(30);
      await db.prepare(`
        INSERT INTO community_sessions(token_hash,user_id,expires_at,created_at,last_seen_at,ip_address,user_agent)
        VALUES(?,?,?,?,?,?,?)
      `).bind(tokenHash,id,expires,isoNow(),isoNow(),ip,request.headers.get("user-agent")||"").run();
      await recordIp(env,id,ip,"access");
      await logSecurity(env,request,"register_ok",id);
      const securityHold=netRisk?.hold?{message:'Rejestracja wymaga weryfikacji. Darmowe pobieranie jest czasowo wstrzymane. Możesz skontaktować się z administratorem.'}:null;
      const profile = await db.prepare(`SELECT * FROM community_profiles WHERE id=?`).bind(id).first();
      const publicUser = publicProfile(profile);
      publicUser.is_owner = await isOwnerId(env, publicUser.id, publicUser.role);
      let emailSent=false;
      try{ await sendVerificationEmail(env,id,email); emailSent=true; }
      catch(error){ console.error('AIO registration: verification mail unavailable',Number(error?.status)||500); }
      return json(
        {ok:true,authenticated:true,user:publicUser,firstAccount,ownerAccount,
          email_verified:false,email_verification_required:true,verification_mail_sent:emailSent,security_warning:securityHold?.message||null},
        201,
        {"Set-Cookie":sessionCookie(token)}
      );
    }

    const auth = await db.prepare(`
      SELECT a.*, p.*
      FROM community_auth a JOIN community_profiles p ON p.id=a.user_id
      WHERE a.email=? LIMIT 1
    `).bind(email).first();

    if (!auth) {
      await failAttempt(env, throttleKey);
      await logSecurity(env,request,"login_failed",null,"Nieznane konto lub błędny adres e-mail");
      return json({ok:false,error:"Nieprawidłowy e-mail lub hasło."}, 401);
    }
    const calc = await hashPassword(password, auth.password_salt, Number(auth.password_iterations || 100000));
    if (!safeEqual(calc.hash, auth.password_hash)) {
      await failAttempt(env, throttleKey);
      await logSecurity(env,request,"login_failed",auth.user_id,"Błędne hasło");
      return json({ok:false,error:"Nieprawidłowy e-mail lub hasło."}, 401);
    }
    // AIO_RELATED_REVIEW_LOGIN_V1 — poprawne haslo: tylko 30-minutowa sesja do wyslania odwolania.
    if (auth.banned_until && Date.parse(auth.banned_until) > Date.now()) {
      if (isRelatedReviewTarget(auth.user_id) || await strictGlobalHold(env,auth.user_id)) {
        await clearAttempt(env,throttleKey);
        const reviewToken=randomToken(), reviewHash=await sha256(reviewToken);
        const issued=isoNow(),expires=new Date(Date.now()+30*60*1000).toISOString();
        await db.prepare(`INSERT INTO community_sessions
          (token_hash,user_id,expires_at,created_at,last_seen_at,ip_address,user_agent)
          VALUES(?,?,?,?,?,?,?)`).bind(reviewHash,auth.user_id,expires,issued,issued,ip,
          request.headers.get('user-agent')||'').run();
        await logSecurity(env,request,'login_review_blocked',auth.user_id,'Dostep tylko do odwolania');
        return json({ok:false,code:'AIO_REVIEW_BLOCK',
          error:ACCOUNT_RESTRICTED,
          contact:'/appeal.html'},403,{"Set-Cookie":sessionCookie(reviewToken)});
      }
      await logSecurity(env,request,"login_throttled",auth.user_id,"Konto zablokowane");
      return json({ok:false,error:"Twoje konto zostało zablokowane. Jeśli uważasz to za pomyłkę, skontaktuj się z nami."}, 403);
    }

    // V4.2: correct password allows ONLY an appeal session for an IP collision.
    // Rejected signups do not suspend existing accounts; only persisted collisions do.
    const multiIpHold=await strictSessionGate(env,auth.user_id,ip);
    if(multiIpHold){
      await clearAttempt(env,throttleKey);
      const token=randomToken(),tokenHash=await sha256(token),issued=isoNow();
      const expires=new Date(Date.now()+30*60000).toISOString();
      await db.prepare(`INSERT INTO community_sessions
        (token_hash,user_id,expires_at,created_at,last_seen_at,ip_address,user_agent)
        VALUES(?,?,?,?,?,?,?)`).bind(tokenHash,auth.user_id,expires,issued,issued,ip,
        request.headers.get('user-agent')||'').run();
      await logSecurity(env,request,'login_review_blocked',auth.user_id,'AIO IP V4.2 — dostęp tylko do odwołania');
      return json({ok:false,code:'AIO_REVIEW_BLOCK',error:ACCOUNT_RESTRICTED,
        contact:'/appeal.html'},403,{"Set-Cookie":sessionCookie(token)});
    }
    // Executed only after a valid password and the existing V6 ban check.
    const ipRestriction=await checkAfterValidLogin(env,request,auth.user_id,auth.role);
    if(ipRestriction)return json({ok:false,code:'AIO_ACCESS_RESTRICTED',error:ACCOUNT_RESTRICTED,contact:'/contact.html?topic=account-security'},403);
    await clearAttempt(env, throttleKey);
    const token = randomToken();
    const tokenHash = await sha256(token);
    const expires = addDays(30);
    await db.batch([
      db.prepare(`
        INSERT INTO community_sessions(token_hash,user_id,expires_at,created_at,last_seen_at,ip_address,user_agent)
        VALUES(?,?,?,?,?,?,?)
      `).bind(tokenHash,auth.user_id,expires,isoNow(),isoNow(),ip,request.headers.get("user-agent")||""),
      db.prepare(`UPDATE community_auth SET last_login_at=? WHERE user_id=?`).bind(isoNow(),auth.user_id),
      db.prepare(`DELETE FROM community_sessions WHERE datetime(expires_at) <= datetime('now')`)
    ]);
    await recordIp(env,auth.user_id,ip,"access");
    await logSecurity(env,request,"login_ok",auth.user_id);
    const securityHold=null; // Replaced by indefinite V7 hold and owner review.
    // Premium/VIP: distinct live sessions on different networks and device classes.
    const paidHold=await (async()=>{
      const access=await getStatus(env,auth.user_id);
      return reviewPaidSessionSharing(env,request,auth.user_id,access.active===true && access.owner!==true);
    })().catch(e=>{console.error('AIO paid sharing review',String(e?.message||e));return null;});
    const loginUser = publicProfile(auth);
    loginUser.is_owner = await isOwnerId(env, loginUser.id, loginUser.role);
    const verification=await emailVerificationStatus(env,loginUser.id);
    return json(
      {ok:true,authenticated:true,user:loginUser,email_verified:verification.verified,
        email_verification_required:verification.required,security_warning:(paidHold||securityHold)?'Dostęp do części funkcji jest obecnie ograniczony. Skontaktuj się z nami.':null},
      200,
      {"Set-Cookie":sessionCookie(token)}
    );
  } catch (e) {
    // Registration denied because this IP has no free additional-account permit.
    // No profile, session or successful login is created in this branch.
    if(e?.status===409 && e?.message===IP_POLICY_NOTICE)
      return json({ok:false,code:'AIO_ACCESS_RESTRICTED',error:REGISTRATION_RESTRICTED,
        contact:'/contact.html?topic=account-security'},409);
    return errorResponse(e);
  }
}
