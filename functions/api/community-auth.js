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
  const now = isoNow();
  const row = await env.COMMUNITY_DB.prepare(
    `SELECT attempts, first_at FROM community_login_attempts WHERE key=?`
  ).bind(key).first();
  const old = Number(row?.attempts || 0);
  const attempts = old + 1;
  const blockedUntil = attempts >= 8 ? new Date(Date.now()+15*60*1000).toISOString() : null;
  await env.COMMUNITY_DB.prepare(`
    INSERT INTO community_login_attempts(key,attempts,first_at,last_at,blocked_until)
    VALUES(?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,last_at=excluded.last_at,blocked_until=excluded.blocked_until
  `).bind(key, attempts, row?.first_at || now, now, blockedUntil).run();
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
    return json({ok:true, authenticated:true, user:session.user, profile:session.user, email_verified:ev.verified, email_verification_required:ev.required, security_warning:hold?.message||null});
  } catch (e) { return errorResponse(e); }
}

export async function onRequestPost({request, env}) {
  if (!aioSameOriginWrite(request)) return new Response(JSON.stringify({ok:false,error:"Niedozwolone źródło żądania."}),
    {status:403,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  try {
    await ensureSchema(env);
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

      const resetIpKey = `reset-ip:${ip || "noip"}`;
      await consumeWindowLimit(env, resetIpKey, 8, 15 * 60 * 1000);

      const resetThrottleKey = `reset:${ip || "noip"}:${email}`;
      await throttle(env, resetThrottleKey);

      const auth = await db.prepare(
        `SELECT user_id,email FROM community_auth WHERE email=? LIMIT 1`
      ).bind(email).first();

      if (!auth) {
        await failAttempt(env, resetThrottleKey);
        return json({ok:true,message:"Jeżeli konto istnieje, prośba o reset została przekazana administratorowi."});
      }

      await clearAttempt(env, resetThrottleKey);

      const existing = await db.prepare(`
        SELECT id FROM community_password_reset_requests
        WHERE user_id=? AND status IN ('pending','approved')
        ORDER BY created_at DESC LIMIT 1
      `).bind(auth.user_id).first();

      /* aio-reset-optional-mail-v1 */
      if (!existing) {
        const requestId = crypto.randomUUID();
        await db.prepare(`
          INSERT INTO community_password_reset_requests
            (id,user_id,email_snapshot,requested_ip,status,created_at)
          VALUES(?,?,?,?, 'pending', ?)
        `).bind(requestId,auth.user_id,auth.email,ip,isoNow()).run();

        // Optional: Resend API (verified sender domain required).
        // Without configured secrets the existing owner-approved reset remains active.
        // Never expose the token in an HTTP response or a log.
        const apiKey=String(env.RESEND_API_KEY||'').trim();
        const from=String(env.AIO_RESET_FROM_EMAIL||'').trim();
        if(apiKey && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
          const token=randomToken();
          const codeHash=await sha256(token);
          const expiresAt=new Date(Date.now()+60*60*1000).toISOString();
          try {
            const response=await fetch('https://api.resend.com/emails',{
              method:'POST',
              headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
              body:JSON.stringify({
                from,
                to:[auth.email],
                subject:'AIO-IPTV.pl — jednorazowy kod resetowania hasla',
                text:'Otrzymalismy prosbe o reset hasla. Jezeli to Ty, otworz https://aio-iptv-projekt.pages.dev/community.html i wybierz „Mam kod resetu”.\n\nKod: '+token+'\n\nKod wygasa za 60 minut. Jezeli nie skladales prosby, zignoruj wiadomosc.'
              })
            });
            if(response.ok) {
              await db.prepare(`
                UPDATE community_password_reset_requests
                SET status='approved', code_hash=?, expires_at=?, approved_at=?
                WHERE id=? AND status='pending'
              `).bind(codeHash,expiresAt,isoNow(),requestId).run();
            }
            // On mail failure leave the pending request for owner approval.
          } catch(_) { /* Keep pending request; never leak email credentials. */ }
        }
      }

      return json({ok:true,message:"Jeżeli konto istnieje, prośba o reset została przekazana administratorowi."});
    }

    if (action === "reset_password") {
      const code = String(body.code || "").trim();
      const password = String(body.password || "");

      if (code.length < 8 || code.length > 80) {
        return json({ok:false,error:"Kod resetu jest nieprawidłowy."},400);
      }
      if (!validPassword(password)) {
        return json({ok:false,error:"Nowe hasło musi mieć co najmniej 10 znaków."},400);
      }

      const codeHash = await sha256(code);
      const reset = await db.prepare(`
        SELECT id,user_id,expires_at,status
        FROM community_password_reset_requests
        WHERE code_hash=? AND status='approved'
        ORDER BY approved_at DESC LIMIT 1
      `).bind(codeHash).first();

      if (!reset || !reset.expires_at || Date.parse(reset.expires_at) <= Date.now()) {
        return json({ok:false,error:"Kod resetu jest nieprawidłowy albo wygasł."},400);
      }

      const pw = await hashPassword(password);
      const now = isoNow();

      await db.batch([
        db.prepare(`
          UPDATE community_auth
          SET password_hash=?,password_salt=?,password_iterations=?
          WHERE user_id=?
        `).bind(pw.hash,pw.salt,pw.iterations,reset.user_id),
        db.prepare(`
          UPDATE community_password_reset_requests
          SET status='used',used_at=?
          WHERE id=?
        `).bind(now,reset.id),
        db.prepare(`DELETE FROM community_sessions WHERE user_id=?`).bind(reset.user_id),
        db.prepare(`
          UPDATE community_password_reset_requests
          SET status='cancelled',cancelled_at=?
          WHERE user_id=? AND status IN ('pending','approved') AND id<>?
        `).bind(now,reset.user_id,reset.id)
      ]);

      await logSecurity(env,request,"password_reset_ok",reset.user_id);
      return json({ok:true,message:"Hasło zostało zmienione. Możesz się zalogować."});
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
      await logSecurity(env,request,'login_throttled',null,'Adres zablokowany administracyjnie');
      return json({ok:false,error:'Ten adres e-mail został zablokowany przez administratora.'},403);
    }

    if (action === "register") {
      // No fake-email registration while outbound verification is unavailable.
      if(!emailSendingReady(env))return json({ok:false,error:"Rejestracja jest chwilowo wstrzymana: administrator konfiguruje potwierdzenia e-mail."},503);
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
        permitRegistrationStatement(env,lease,id)
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
      const securityHold=null; // V7 checks IP before registration; no temporary shared-IP hold.
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
    if (auth.banned_until && Date.parse(auth.banned_until) > Date.now()) {
      await logSecurity(env,request,"login_throttled",auth.user_id,"Konto zablokowane");
      return json({ok:false,error:"Konto zostało zablokowane. Jeśli uważasz to za pomyłkę, skontaktuj się z administracją: /contact.html"}, 403);
    }

    // Executed only after a valid password and the existing V6 ban check.
    const ipRestriction=await checkAfterValidLogin(env,request,auth.user_id,auth.role);
    if(ipRestriction)return json({ok:false,code:'AIO_IP_POLICY',error:ipRestriction.reason+' Kontakt: /contact.html?topic=account-security'},403);
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
        email_verification_required:verification.required,security_warning:(paidHold||securityHold)?.message||null},
      200,
      {"Set-Cookie":sessionCookie(token)}
    );
  } catch (e) {
    // Registration denied because this IP has no free additional-account permit.
    // No profile, session or successful login is created in this branch.
    if(e?.status===409 && e?.message===IP_POLICY_NOTICE)
      return json({ok:false,code:'AIO_IP_POLICY',error:IP_POLICY_NOTICE,
        contact:'/contact.html?topic=account-security'},409);
    return errorResponse(e);
  }
}
