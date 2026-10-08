import { json, ensureSchema, sha256, countRows } from "../_community.js";

function warsawDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function dayKeyOffset(days) {
  return warsawDayKey(new Date(Date.now() + days * 86400000));
}

function cleanPath(value) {
  let path = String(value || "/").trim().slice(0, 220);
  if (!path.startsWith("/")) path = "/" + path;
  path = path.replace(/[\u0000-\u001f]/g, "");
  return path || "/";
}

async function bodyJson(request) {
  try { return await request.json(); }
  catch (_) { return {}; }
}

export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env);
    const body = await bodyJson(request);
    if (String(body.action || "") !== "visit") {
      return json({ ok: false, error: "Nieznana operacja." }, 400);
    }

    const visitorId = String(body.visitorId || "").trim().slice(0, 120);
    if (visitorId.length < 10) return json({ ok: false, error: "Brak identyfikatora sesji." }, 400);

    const path = cleanPath(body.path || "/");
    const day = warsawDayKey();
    const visitorHash = await sha256(visitorId);
    const now = new Date().toISOString();
    const db = env.COMMUNITY_DB;

    await db.batch([
      db.prepare(`
        INSERT INTO aio_site_page_views(day,path,views)
        VALUES(?,?,1)
        ON CONFLICT(day,path) DO UPDATE SET views=aio_site_page_views.views+1
      `).bind(day, path),
      db.prepare(`
        INSERT INTO aio_site_visitors(day,visitor_hash,first_seen_at,last_seen_at)
        VALUES(?,?,?,?)
        ON CONFLICT(day,visitor_hash) DO UPDATE SET last_seen_at=excluded.last_seen_at
      `).bind(day, visitorHash, now, now)
    ]);

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e?.message || "Błąd zapisu statystyk." }, 500);
  }
}

export async function onRequestGet({ env }) {
  try {
    await ensureSchema(env);
    const today = warsawDayKey();
    const from30 = dayKeyOffset(-29);

    const data = {
      pageviews_today: await countRows(env, `SELECT COALESCE(SUM(views),0) AS n FROM aio_site_page_views WHERE day=?`, today),
      visitors_today: await countRows(env, `SELECT COUNT(*) AS n FROM aio_site_visitors WHERE day=?`, today),
      pageviews_30d: await countRows(env, `SELECT COALESCE(SUM(views),0) AS n FROM aio_site_page_views WHERE day>=?`, from30),
      visitors_30d: await countRows(env, `SELECT COUNT(DISTINCT visitor_hash) AS n FROM aio_site_visitors WHERE day>=?`, from30),
      community_users: await countRows(env, `SELECT COUNT(*) AS n FROM community_profiles`),
      chat_messages_7d: await countRows(env, `SELECT COUNT(*) AS n FROM community_chat_messages WHERE status='published' AND datetime(created_at)>=datetime('now','-7 day')`)
    };

    return json({ ok: true, stats: data });
  } catch (e) {
    return json({ ok: false, error: e?.message || "Błąd odczytu statystyk." }, 500);
  }
}
