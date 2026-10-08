
import {
  json, ensureSchema, hashPassword, safeEqual, randomToken, sha256,
  cleanEmail, cleanText, sessionCookie, clearSessionCookie,
  clientIp, isoNow, addDays, getSession, publicProfile, errorResponse, recordIp
} from "../_community.js";

function validPassword(p) {
  return typeof p === "string" && p.length >= 10 && p.length <= 200;
}
async function throttle(env, key) {
  const row = await env.COMMUNITY_DB.prepare(
    `SELECT attempts, blocked_until FROM community_login_attempts WHERE key=?`
  ).bind(key).first();
  if (row?.blocked_until && Date.parse(row.blocked_until) > Date.now()) {
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


export async function onRequestGet({request, env}) {
  try {
    await ensureSchema(env);
    const session = await getSession(request, env);
    if (!session || session.blocked || session.banned) {
      return json({ok:true, authenticated:false});
    }
    return json({ok:true, authenticated:true, user:session.user, profile:session.user});
  } catch (e) { return errorResponse(e); }
}

export async function onRequestPost({request, env}) {
  try {
    await ensureSchema(env);
    const body = await request.json().catch(()=>({}));
    const action = String(body.action || "");
    const db = env.COMMUNITY_DB;
    const ip = clientIp(request);

    if (action === "logout") {
      const session = await getSession(request, env, {touch:false});
      if (session?.tokenHash) {
        await db.prepare(`DELETE FROM community_sessions WHERE token_hash=?`).bind(session.tokenHash).run();
      }
      return json({ok:true}, 200, {"Set-Cookie": clearSessionCookie()});
    }

    if (action === "request_reset") {
      const email = cleanEmail(body.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ok:false,error:"Podaj poprawny adres e-mail."},400);
      }

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

      if (!existing) {
        await db.prepare(`
          INSERT INTO community_password_reset_requests
            (id,user_id,email_snapshot,requested_ip,status,created_at)
          VALUES(?,?,?,?, 'pending', ?)
        `).bind(crypto.randomUUID(),auth.user_id,auth.email,ip,isoNow()).run();
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
    await throttle(env, throttleKey);

    if (action === "register") {
      const exists = await db.prepare(`SELECT user_id FROM community_auth WHERE email=?`).bind(email).first();
      if (exists) return json({ok:false,error:"Konto z tym adresem już istnieje."}, 409);

      const profiles = await db.prepare(`SELECT COUNT(*) AS n FROM community_profiles`).first();
      const firstAccount = Number(profiles?.n || 0) === 0;
      const id = crypto.randomUUID();
      const displayName = cleanText(body.displayName || email.split("@")[0], 60);
      if (displayName.length < 2) return json({ok:false,error:"Nazwa użytkownika jest za krótka."}, 400);

      const pw = await hashPassword(password);
      await db.batch([
        db.prepare(`
          INSERT INTO community_profiles
          (id,email,display_name,role,trusted,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?)
        `).bind(id,email,displayName,firstAccount ? "admin" : "user", firstAccount ? 1 : 0, isoNow(), isoNow()),
        db.prepare(`
          INSERT INTO community_auth
          (user_id,email,password_hash,password_salt,password_iterations,created_at)
          VALUES(?,?,?,?,?,?)
        `).bind(id,email,pw.hash,pw.salt,pw.iterations,isoNow())
      ]);

      const token = randomToken();
      const tokenHash = await sha256(token);
      const expires = addDays(30);
      await db.prepare(`
        INSERT INTO community_sessions(token_hash,user_id,expires_at,created_at,last_seen_at,ip_address,user_agent)
        VALUES(?,?,?,?,?,?,?)
      `).bind(tokenHash,id,expires,isoNow(),isoNow(),ip,request.headers.get("user-agent")||"").run();
      await recordIp(env,id,ip,"access");
      const profile = await db.prepare(`SELECT * FROM community_profiles WHERE id=?`).bind(id).first();
      return json(
        {ok:true,authenticated:true,user:publicProfile(profile),firstAccount},
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
      return json({ok:false,error:"Nieprawidłowy e-mail lub hasło."}, 401);
    }
    const calc = await hashPassword(password, auth.password_salt, Number(auth.password_iterations || 100000));
    if (!safeEqual(calc.hash, auth.password_hash)) {
      await failAttempt(env, throttleKey);
      return json({ok:false,error:"Nieprawidłowy e-mail lub hasło."}, 401);
    }
    if (auth.banned_until && Date.parse(auth.banned_until) > Date.now()) {
      return json({ok:false,error:"Konto jest zablokowane."}, 403);
    }

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
    return json(
      {ok:true,authenticated:true,user:publicProfile(auth)},
      200,
      {"Set-Cookie":sessionCookie(token)}
    );
  } catch (e) { return errorResponse(e); }
}
