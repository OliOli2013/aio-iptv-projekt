
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function resetMailConfigured(env) {
  return Boolean(String(env.RESEND_API_KEY || "").trim() && String(env.COMMUNITY_RESET_FROM || "").trim());
}
async function sendResetEmail(env, email, resetUrl) {
  const response = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{"authorization":`Bearer ${String(env.RESEND_API_KEY||"").trim()}`,"content-type":"application/json"},
    body:JSON.stringify({
      from:String(env.COMMUNITY_RESET_FROM||"").trim(),
      to:[email],
      subject:"Reset hasła — Społeczność AIO",
      text:`Otrzymaliśmy prośbę o ustawienie nowego hasła do Społeczności AIO.\n\nOtwórz link:\n${resetUrl}\n\nLink jest jednorazowy i wygasa po 30 minutach.\nJeżeli to nie Ty wysłałeś prośbę, zignoruj tę wiadomość.`,
      html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17242b"><h2>Reset hasła — Społeczność AIO</h2><p>Otrzymaliśmy prośbę o ustawienie nowego hasła.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#0d7897;color:#fff;text-decoration:none;border-radius:8px">Ustaw nowe hasło</a></p><p>Link jest jednorazowy i wygasa po <strong>30 minutach</strong>.</p><p style="color:#63747c">Jeżeli to nie Ty wysłałeś prośbę, zignoruj tę wiadomość.</p></div>`
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(()=>"");
    console.error("Resend password reset error:", response.status, detail.slice(0,500));
    throw Object.assign(new Error("Nie udało się wysłać wiadomości resetującej. Spróbuj ponownie później."), {status:503});
  }
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
      if (!resetMailConfigured(env)) return json({ok:false,error:"Odzyskiwanie hasła nie jest jeszcze skonfigurowane przez administratora."},503);
      const email = cleanEmail(body.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ok:false,error:"Podaj poprawny adres e-mail."},400);
      const resetThrottleKey = `reset:${ip || "noip"}:${email}`;
      await throttle(env, resetThrottleKey);
      const auth = await db.prepare(`SELECT user_id,email FROM community_auth WHERE email=? LIMIT 1`).bind(email).first();
      if (!auth) { await failAttempt(env, resetThrottleKey); return json({ok:true,message:"Jeżeli konto istnieje, wiadomość z linkiem została wysłana."}); }
      await clearAttempt(env, resetThrottleKey);
      const token = randomToken(32);
      const tokenHash = await sha256(token);
      const expires = new Date(Date.now()+30*60*1000).toISOString();
      await db.batch([
        db.prepare(`DELETE FROM community_password_resets WHERE user_id=? OR datetime(expires_at) <= datetime('now')`).bind(auth.user_id),
        db.prepare(`INSERT INTO community_password_resets (token_hash,user_id,expires_at,created_at,requested_ip) VALUES(?,?,?,?,?)`).bind(tokenHash,auth.user_id,expires,isoNow(),ip)
      ]);
      const resetUrl = `${new URL(request.url).origin}/community.html?reset=${encodeURIComponent(token)}`;
      try { await sendResetEmail(env, auth.email, resetUrl); }
      catch (error) { await db.prepare(`DELETE FROM community_password_resets WHERE token_hash=?`).bind(tokenHash).run().catch(()=>{}); throw error; }
      return json({ok:true,message:"Jeżeli konto istnieje, wiadomość z linkiem została wysłana."});
    }

    if (action === "reset_password") {
      const token = String(body.token || "").trim();
      const password = String(body.password || "");
      if (token.length < 20) return json({ok:false,error:"Link resetujący jest nieprawidłowy lub wygasł."},400);
      if (!validPassword(password)) return json({ok:false,error:"Nowe hasło musi mieć co najmniej 10 znaków."},400);
      const tokenHash = await sha256(token);
      const reset = await db.prepare(`SELECT token_hash,user_id,expires_at,used_at FROM community_password_resets WHERE token_hash=? LIMIT 1`).bind(tokenHash).first();
      if (!reset || reset.used_at || Date.parse(reset.expires_at) <= Date.now()) return json({ok:false,error:"Link resetujący jest nieprawidłowy, wykorzystany lub wygasł."},400);
      const pw = await hashPassword(password);
      const now = isoNow();
      await db.batch([
        db.prepare(`UPDATE community_auth SET password_hash=?,password_salt=?,password_iterations=? WHERE user_id=?`).bind(pw.hash,pw.salt,pw.iterations,reset.user_id),
        db.prepare(`UPDATE community_password_resets SET used_at=? WHERE token_hash=?`).bind(now,tokenHash),
        db.prepare(`DELETE FROM community_sessions WHERE user_id=?`).bind(reset.user_id)
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
