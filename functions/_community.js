
const enc = new TextEncoder();

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

export async function ensureSchema(env) {
  const db = env.COMMUNITY_DB;
  if (!db) throw new Error("Brak bindingu COMMUNITY_DB.");
  const sql = [
    `CREATE TABLE IF NOT EXISTS community_auth (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL DEFAULT 100000,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS community_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user ON community_sessions(user_id, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_email ON community_auth(email)`,
    `CREATE TABLE IF NOT EXISTS community_login_attempts (
      key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      first_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      blocked_until TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS community_password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      requested_ip TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_password_resets_user ON community_password_resets(user_id, expires_at)`,
    `CREATE TABLE IF NOT EXISTS community_password_reset_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email_snapshot TEXT NOT NULL,
      requested_ip TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      code_hash TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at TEXT,
      approved_by TEXT,
      used_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status ON community_password_reset_requests(status, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user ON community_password_reset_requests(user_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS community_chat_messages (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      attachments TEXT NOT NULL DEFAULT '[]',
      reply_to TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      edited_at TEXT,
      deleted_at TEXT,
      deleted_by TEXT,
      FOREIGN KEY(author_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON community_chat_messages(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_author ON community_chat_messages(author_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS community_chat_reactions (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(message_id,user_id,type),
      FOREIGN KEY(message_id) REFERENCES community_chat_messages(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON community_chat_reactions(message_id)`
  ];
  await db.batch(sql.map(q => db.prepare(q)));
}

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const raw = atob(s);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64(a);
}
export async function sha256(value) {
  const data = typeof value === "string" ? enc.encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return b64(digest);
}
export async function hashPassword(password, saltB64 = null, iterations = 100000) {
  // Cloudflare Workers WebCrypto currently accepts PBKDF2 up to 100000 iterations.
  // Clamp defensively so a stale database value or future config typo cannot crash auth.
  iterations = Math.max(1, Math.min(100000, Number(iterations || 100000)));
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  ));
  return { hash: b64(bits), salt: b64(salt), iterations };
}
export function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i=0;i<a.length;i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const parts = cookie.split(";").map(x => x.trim());
  for (const part of parts) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return "";
}
export function sessionCookie(token, maxAge = 2592000) {
  return `aio_community_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function clearSessionCookie() {
  return "aio_community_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

export function cleanEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 254);
}
export function cleanText(value, max = 50000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}
export function boolInt(value) {
  return value ? 1 : 0;
}
export function isoNow() { return new Date().toISOString(); }
export function addDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

export async function getSession(request, env, {touch=true} = {}) {
  await ensureSchema(env);
  const token = cookieValue(request, "aio_community_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.COMMUNITY_DB.prepare(`
    SELECT s.token_hash, s.user_id, s.expires_at,
           p.id, p.display_name, p.avatar_url, p.avatar_key,
           p.tuner_model, p.system_name, p.system_version, p.python_version,
           p.bio, p.role, p.trusted, p.banned_until, p.ban_reason,
           p.created_at, p.updated_at
    FROM community_sessions s
    JOIN community_profiles p ON p.id = s.user_id
    WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first();
  if (!row) return null;

  const ip = clientIp(request);
  if (ip) {
    const block = await env.COMMUNITY_DB.prepare(`
      SELECT id, reason, permanent, expires_at
      FROM community_ip_blocks
      WHERE ip_address = ? AND active = 1
        AND (permanent = 1 OR expires_at IS NULL OR datetime(expires_at) > datetime('now'))
      LIMIT 1
    `).bind(ip).first();
    if (block) return { blocked: true, block, tokenHash, user: publicProfile(row) };
  }
  if (row.banned_until && Date.parse(row.banned_until) > Date.now()) {
    return { banned: true, tokenHash, user: publicProfile(row) };
  }

  if (touch) {
    env.COMMUNITY_DB.prepare(`UPDATE community_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?`)
      .bind(tokenHash).run().catch(()=>{});
    recordIp(env, row.user_id, ip, "access").catch(()=>{});
  }
  return { tokenHash, user: publicProfile(row) };
}

export function publicProfile(row) {
  if (!row) return null;
  return {
    id: row.id || row.user_id,
    display_name: row.display_name || "Użytkownik",
    avatar_url: row.avatar_key ? `/api/community-media?key=${encodeURIComponent(row.avatar_key)}` : (row.avatar_url || ""),
    avatar_key: row.avatar_key || "",
    tuner_model: row.tuner_model || "",
    system_name: row.system_name || "",
    system_version: row.system_version || "",
    python_version: row.python_version || "",
    bio: row.bio || "",
    role: row.role || "user",
    trusted: Boolean(row.trusted),
    banned_until: row.banned_until || null,
    ban_reason: row.ban_reason || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}
export function isAdmin(session) {
  return Boolean(session && session.user && ["admin","moderator"].includes(session.user.role));
}
export function isFullAdmin(session) {
  return Boolean(session && session.user && session.user.role === "admin");
}
export async function requireUser(request, env) {
  const session = await getSession(request, env);
  if (!session) throw Object.assign(new Error("Zaloguj się do Społeczności AIO."), {status:401});
  if (session.blocked) throw Object.assign(new Error(session.block?.reason || "Ten adres IP jest zablokowany."), {status:403});
  if (session.banned) throw Object.assign(new Error("Konto jest zablokowane."), {status:403});
  return session;
}
export async function requireAdmin(request, env, full = false) {
  const s = await requireUser(request, env);
  if (full ? !isFullAdmin(s) : !isAdmin(s)) {
    throw Object.assign(new Error("Brak uprawnień administratora."), {status:403});
  }
  return s;
}

export async function recordIp(env, userId, ip, event = "access") {
  if (!ip || !userId) return;
  await env.COMMUNITY_DB.prepare(`
    INSERT INTO community_user_ips
      (id,user_id,ip_address,first_seen_at,last_seen_at,event_count,last_event)
    VALUES (?,?,?,?,?,1,?)
    ON CONFLICT(user_id,ip_address) DO UPDATE SET
      last_seen_at=excluded.last_seen_at,
      event_count=community_user_ips.event_count+1,
      last_event=excluded.last_event
  `).bind(crypto.randomUUID(), userId, ip, isoNow(), isoNow(), event).run();
}

export function parseAttachments(text) {
  try {
    const arr = Array.isArray(text) ? text : JSON.parse(text || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
export function decorateAttachment(item) {
  if (!item || typeof item !== "object") return null;
  const key = String(item.key || item.path || "");
  if (!key) return null;
  return {
    key,
    path: key,
    name: cleanText(item.name || "obraz", 180),
    type: cleanText(item.type || "image/jpeg", 80),
    size: Number(item.size || 0),
    url: `/api/community-media?key=${encodeURIComponent(key)}`
  };
}
export function decoratePost(row) {
  if (!row) return null;
  const attachments = parseAttachments(row.attachments).map(decorateAttachment).filter(Boolean);
  return {
    ...row,
    pinned: Boolean(row.pinned),
    featured: Boolean(row.featured),
    locked: Boolean(row.locked),
    solved: Boolean(row.solved),
    comment_count: Number(row.comment_count || 0),
    reaction_count: Number(row.reaction_count || 0),
    attachments,
    author: row.author_display_name ? {
      id: row.author_id,
      display_name: row.author_display_name,
      avatar_url: row.author_avatar_key ? `/api/community-media?key=${encodeURIComponent(row.author_avatar_key)}` : (row.author_avatar_url || ""),
      avatar_key: row.author_avatar_key || "",
      tuner_model: row.author_tuner_model || "",
      system_name: row.author_system_name || "",
      role: row.author_role || "user"
    } : undefined
  };
}

export async function bodyJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw Object.assign(new Error("Oczekiwano danych JSON."), {status:400});
  try { return await request.json(); }
  catch { throw Object.assign(new Error("Nieprawidłowy JSON."), {status:400}); }
}

export function errorResponse(error) {
  const status = Number(error && error.status || 500);
  const message = error && error.message ? error.message : "Wystąpił błąd serwera.";
  return json({ok:false,error:message}, status >= 400 && status <= 599 ? status : 500);
}

export function allowedCategory(v) {
  return ["pomoc","aio-panel","iptv","kanaly","picony","oscam","systemy","wtyczki","aplikacje","testy","inne"].includes(v) ? v : "inne";
}
export function allowedPostType(v) {
  return ["problem","information","update","guide","discussion"].includes(v) ? v : "problem";
}
export function allowedReaction(v) {
  return ["helpful","works","thanks"].includes(v) ? v : "";
}
export function allowedTargetType(v) {
  return ["post","comment","profile"].includes(v) ? v : "";
}

export async function countRows(env, sql, ...params) {
  const row = await env.COMMUNITY_DB.prepare(sql).bind(...params).first();
  return Number(row?.n || 0);
}

export async function moderationLog(env, actorId, data = {}) {
  await env.COMMUNITY_DB.prepare(`
    INSERT INTO community_moderation_log
      (id,actor_id,target_user_id,target_type,target_id,action,reason,ip_address,metadata,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    crypto.randomUUID(), actorId || null, data.targetUserId || null, data.targetType || "user",
    data.targetId || null, data.action || "action", data.reason || null, data.ip || null,
    JSON.stringify(data.metadata || {}), isoNow()
  ).run();
}
