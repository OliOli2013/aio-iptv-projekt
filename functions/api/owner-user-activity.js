/* AIO TunerHub — Owner Last Activity V1 (2026-11-19)
 * Read-only, owner-only view of login, IP activity and unexpired sessions.
 * Session token hashes and complete User-Agent headers are NEVER returned.
 */
import {requireAdmin, json} from '../_community.js';

const respond = (body, status = 200) => json(body, status, {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff'
});

// D1 timestamps may be ISO UTC or SQLite UTC (YYYY-MM-DD HH:MM:SS).
function utc(value) {
  let s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  else if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(s)) s += 'Z';
  const time = Date.parse(s);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function device(userAgent) {
  const ua = String(userAgent || '');
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Macintosh|Mac OS/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'Nieustalone';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : 'Nieustalona przeglądarka';
  return os + ' / ' + browser;
}

export async function onRequestGet({request, env}) {
  try {
    // Must be checked before any account data is queried.
    await requireAdmin(request, env, true);
    const id = new URL(request.url).searchParams.get('user_id') || '';
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) {
      return respond({ok: false, error: 'Niepoprawne ID użytkownika.'}, 400);
    }
    const db = env.COMMUNITY_DB;
    if (!db) return respond({ok: false, error: 'Brak połączenia z bazą.'}, 503);

    const [person, lastIp, lastSession, count, active] = await Promise.all([
      db.prepare('SELECT a.last_login_at FROM community_auth a WHERE a.user_id=? LIMIT 1').bind(id).first(),
      db.prepare(`SELECT ip_address,first_seen_at,last_seen_at,event_count
        FROM community_user_ips WHERE user_id=?
        ORDER BY julianday(last_seen_at) DESC LIMIT 1`).bind(id).first(),
      db.prepare(`SELECT last_seen_at FROM community_sessions WHERE user_id=?
        ORDER BY julianday(last_seen_at) DESC LIMIT 1`).bind(id).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM community_sessions
        WHERE user_id=? AND julianday(expires_at)>julianday('now')`).bind(id).first(),
      db.prepare(`SELECT created_at,last_seen_at,expires_at,ip_address,user_agent
        FROM community_sessions WHERE user_id=? AND julianday(expires_at)>julianday('now')
        ORDER BY julianday(last_seen_at) DESC LIMIT 20`).bind(id).all()
    ]);
    if (!person) return respond({ok: false, error: 'Konto nie istnieje.'}, 404);
    const login = utc(person.last_login_at);
    const ipSeen = utc(lastIp?.last_seen_at);
    const sessionSeen = utc(lastSession?.last_seen_at);
    const observed = [login, ipSeen, sessionSeen].filter(Boolean).sort();
    const sessions = (active.results || []).map(s => ({
      created_at: utc(s.created_at),
      last_seen_at: utc(s.last_seen_at),
      expires_at: utc(s.expires_at),
      ip_address: s.ip_address || null,
      device: device(s.user_agent)
    }));
    return respond({
      ok: true,
      last_login_at: login,
      last_activity_at: observed.length ? observed[observed.length - 1] : null,
      last_ip: lastIp ? {address: lastIp.ip_address, seen_at: ipSeen} : null,
      last_session_activity_at: sessionSeen,
      active_sessions: Number(count?.n || 0),
      sessions,
      sessions_truncated: Number(count?.n || 0) > sessions.length
    });
  } catch (error) {
    // No raw D1 diagnostics, URLs or authentication details in the response.
    const status = [401, 403].includes(error?.status) ? error.status : 500;
    return respond({ok: false, error: status === 500
      ? 'Nie udało się odczytać aktywności konta.'
      : 'Brak uprawnień do odczytu aktywności.'}, status);
  }
}
