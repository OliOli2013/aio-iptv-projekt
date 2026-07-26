import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGINS = new Set([
  "https://olioli2013.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://olioli2013.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) }); }
function token(req: Request) { return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim(); }
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return String(error || "Nieznany błąd");
}
function durationValues(value: string) {
  const now = Date.now();
  if (value === "24h") return { until: new Date(now + 86400000).toISOString(), auth: "24h", permanent: false };
  if (value === "7d") return { until: new Date(now + 7 * 86400000).toISOString(), auth: "168h", permanent: false };
  if (value === "30d") return { until: new Date(now + 30 * 86400000).toISOString(), auth: "720h", permanent: false };
  return { until: "9999-12-31T23:59:59.000Z", auth: "876000h", permanent: true };
}
async function logAction(admin: ReturnType<typeof createClient>, actorId: string, action: string, data: Record<string, unknown> = {}) {
  await admin.from("community_moderation_log").insert({
    actor_id: actorId,
    target_user_id: data.targetUserId || null,
    target_type: data.targetType || "user",
    target_id: data.targetId ? String(data.targetId) : null,
    action,
    reason: data.reason ? String(data.reason).slice(0, 1000) : null,
    ip_address: data.ipAddress || null,
    metadata: data.metadata || {},
  });
}
async function removeUserMedia(admin: ReturnType<typeof createClient>, userId: string) {
  const bucket = admin.storage.from("community-media");
  const paths: string[] = [];
  async function walk(folder: string, depth = 0) {
    if (depth > 4) return;
    const listed = await bucket.list(folder, { limit: 1000 });
    if (listed.error || !listed.data) return;
    for (const item of listed.data) {
      const path = folder ? `${folder}/${item.name}` : item.name;
      if (item.id) paths.push(path); else await walk(path, depth + 1);
    }
  }
  await walk(userId);
  for (let index = 0; index < paths.length; index += 100) await bucket.remove(paths.slice(index, index + 100));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    const jwt = token(req);
    if (!jwt) return json(req, { error: "Zaloguj się jako administrator." }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = await admin.auth.getUser(jwt);
    const actor = auth.data.user;
    if (auth.error || !actor) return json(req, { error: "Sesja wygasła." }, 401);
    const actorProfileResult = await admin.from("community_profiles").select("id,role,banned_until").eq("id", actor.id).maybeSingle();
    const actorProfile = actorProfileResult.data;
    if (!actorProfile || !["admin", "moderator"].includes(actorProfile.role)) return json(req, { error: "Brak uprawnień administratora lub moderatora." }, 403);
    const fullAdmin = actorProfile.role === "admin";
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "list_users") {
      const profiles = await admin.from("community_profiles").select("*").order("created_at", { ascending: false }).limit(500);
      if (profiles.error) throw profiles.error;
      const ips = await admin.from("community_user_ips").select("user_id,ip_address,first_seen_at,last_seen_at,event_count,last_event").order("last_seen_at", { ascending: false }).limit(3000);
      if (ips.error) throw ips.error;
      const authUsers = fullAdmin ? await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }) : null;
      const emailMap = new Map<string, string>();
      for (const user of authUsers?.data?.users || []) emailMap.set(user.id, user.email || "");
      const ipMap = new Map<string, unknown[]>();
      for (const row of ips.data || []) {
        const list = ipMap.get(row.user_id) || [];
        if (list.length < 8) list.push(row);
        ipMap.set(row.user_id, list);
      }
      return json(req, { ok: true, users: (profiles.data || []).map(row => ({ ...row, email: emailMap.get(row.id) || "", ips: ipMap.get(row.id) || [] })) });
    }

    if (action === "list_ip_blocks") {
      const result = await admin.from("community_ip_blocks").select("*,target:community_profiles!community_ip_blocks_target_user_id_fkey(display_name)").order("created_at", { ascending: false }).limit(500);
      if (result.error) throw result.error;
      return json(req, { ok: true, blocks: result.data || [] });
    }

    if (action === "list_logs") {
      const result = await admin.from("community_moderation_log").select("*,actor:community_profiles!community_moderation_log_actor_id_fkey(display_name)").order("created_at", { ascending: false }).limit(300);
      if (result.error) throw result.error;
      return json(req, { ok: true, logs: result.data || [] });
    }

    if (action === "post_action") {
      const id = String(body.id || "");
      const operation = String(body.operation || "");
      const current = await admin.from("community_posts").select("id,title,status,kind,pinned,locked,author_id").eq("id", id).maybeSingle();
      if (current.error || !current.data) throw new Error("Wpis nie istnieje.");
      const patch: Record<string, unknown> = {};
      if (operation === "approve") Object.assign(patch, { status: "published", published_at: new Date().toISOString() });
      else if (operation === "reject") patch.status = "rejected";
      else if (operation === "hide") patch.status = "hidden";
      else if (operation === "official") patch.kind = current.data.kind === "official" ? "community" : "official";
      else if (operation === "pin") patch.pinned = !current.data.pinned;
      else if (operation === "lock") patch.locked = !current.data.locked;
      else throw new Error("Nieprawidłowa operacja na wpisie.");
      const update = await admin.from("community_posts").update(patch).eq("id", id);
      if (update.error) throw update.error;
      await logAction(admin, actor.id, `post_${operation}`, { targetType: "post", targetId: id, targetUserId: current.data.author_id, metadata: { title: current.data.title } });
      return json(req, { ok: true });
    }

    if (action === "report_action") {
      const id = String(body.id || "");
      const status = String(body.status || "");
      if (!["resolved", "dismissed"].includes(status)) throw new Error("Nieprawidłowy status zgłoszenia.");
      const update = await admin.from("community_reports").update({ status, reviewed_by: actor.id, reviewed_at: new Date().toISOString() }).eq("id", id);
      if (update.error) throw update.error;
      await logAction(admin, actor.id, `report_${status}`, { targetType: "report", targetId: id });
      return json(req, { ok: true });
    }

    const targetUserId = String(body.userId || "");
    const targetResult = targetUserId ? await admin.from("community_profiles").select("id,display_name,role,trusted,banned_until").eq("id", targetUserId).maybeSingle() : { data: null, error: null };
    if (targetResult.error) throw targetResult.error;
    const target = targetResult.data;
    if (targetUserId && !target) throw new Error("Użytkownik nie istnieje.");
    if (targetUserId === actor.id && ["ban_user", "delete_user", "set_role", "hide_user_content"].includes(action)) throw new Error("Nie możesz wykonać tej operacji na własnym koncie.");
    if (!fullAdmin && target && target.role === "admin") throw new Error("Moderator nie może modyfikować konta administratora.");

    if (action === "trust_user") {
      const trusted = Boolean(body.trusted);
      const update = await admin.from("community_profiles").update({ trusted }).eq("id", targetUserId);
      if (update.error) throw update.error;
      await logAction(admin, actor.id, trusted ? "user_trusted" : "user_untrusted", { targetUserId });
      return json(req, { ok: true });
    }

    if (action === "set_role") {
      if (!fullAdmin) return json(req, { error: "Tylko administrator może nadawać role." }, 403);
      const role = String(body.role || "user");
      if (!["user", "moderator"].includes(role)) throw new Error("Nieprawidłowa rola.");
      const update = await admin.from("community_profiles").update({ role }).eq("id", targetUserId);
      if (update.error) throw update.error;
      await logAction(admin, actor.id, "user_role_changed", { targetUserId, metadata: { role } });
      return json(req, { ok: true });
    }

    if (action === "ban_user") {
      const duration = String(body.duration || "7d");
      const reason = String(body.reason || "Naruszenie zasad społeczności").trim().slice(0, 500);
      if (!fullAdmin && duration === "permanent") return json(req, { error: "Tylko administrator może nakładać blokadę bezterminową." }, 403);
      const values = durationValues(duration);
      const update = await admin.from("community_profiles").update({
        banned_until: values.until,
        ban_reason: reason,
        banned_by: actor.id,
        banned_at: new Date().toISOString(),
        trusted: false,
      }).eq("id", targetUserId);
      if (update.error) throw update.error;
      await admin.auth.admin.updateUserById(targetUserId, { ban_duration: values.auth });
      if (body.hideContent) {
        await admin.from("community_posts").update({ status: "hidden" }).eq("author_id", targetUserId);
        await admin.from("community_comments").update({ status: "hidden" }).eq("author_id", targetUserId);
      }
      await logAction(admin, actor.id, values.permanent ? "user_banned_permanently" : "user_banned", { targetUserId, reason, metadata: { duration, hideContent: Boolean(body.hideContent) } });
      return json(req, { ok: true });
    }

    if (action === "unban_user") {
      const update = await admin.from("community_profiles").update({ banned_until: null, ban_reason: null, banned_by: null, banned_at: null }).eq("id", targetUserId);
      if (update.error) throw update.error;
      await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
      await logAction(admin, actor.id, "user_unbanned", { targetUserId });
      return json(req, { ok: true });
    }

    if (action === "hide_user_content") {
      const reason = String(body.reason || "Treści ukryte przez moderację").trim().slice(0, 500);
      const posts = await admin.from("community_posts").update({ status: "hidden" }).eq("author_id", targetUserId);
      const comments = await admin.from("community_comments").update({ status: "hidden" }).eq("author_id", targetUserId);
      if (posts.error) throw posts.error;
      if (comments.error) throw comments.error;
      await logAction(admin, actor.id, "user_content_hidden", { targetUserId, reason });
      return json(req, { ok: true });
    }

    if (action === "block_ip") {
      if (!fullAdmin) return json(req, { error: "Tylko administrator może blokować adresy IP." }, 403);
      const ipAddress = String(body.ipAddress || "").trim();
      const duration = String(body.duration || "30d");
      const reason = String(body.reason || "Naruszenie zasad społeczności").trim().slice(0, 500);
      if (!ipAddress) throw new Error("Brak adresu IP.");
      if (targetUserId) {
        const known = await admin.from("community_user_ips").select("id").eq("user_id", targetUserId).eq("ip_address", ipAddress).maybeSingle();
        if (!known.data) throw new Error("Ten adres IP nie znajduje się w historii użytkownika.");
      }
      const values = durationValues(duration);
      const upsert = await admin.from("community_ip_blocks").upsert({
        ip_address: ipAddress,
        reason,
        permanent: values.permanent,
        expires_at: values.permanent ? null : values.until,
        active: true,
        target_user_id: targetUserId || null,
        created_by: actor.id,
      }, { onConflict: "ip_address" });
      if (upsert.error) throw upsert.error;
      await logAction(admin, actor.id, values.permanent ? "ip_blocked_permanently" : "ip_blocked", { targetUserId: targetUserId || null, targetType: "ip", targetId: ipAddress, ipAddress, reason, metadata: { duration } });
      return json(req, { ok: true });
    }

    if (action === "unblock_ip") {
      if (!fullAdmin) return json(req, { error: "Tylko administrator może usuwać blokady IP." }, 403);
      const id = String(body.id || "");
      const current = await admin.from("community_ip_blocks").select("id,ip_address,target_user_id").eq("id", id).maybeSingle();
      if (current.error || !current.data) throw new Error("Blokada nie istnieje.");
      const update = await admin.from("community_ip_blocks").update({ active: false }).eq("id", id);
      if (update.error) throw update.error;
      await logAction(admin, actor.id, "ip_unblocked", { targetUserId: current.data.target_user_id, targetType: "ip", targetId: current.data.ip_address, ipAddress: current.data.ip_address });
      return json(req, { ok: true });
    }

    if (action === "delete_user") {
      if (!fullAdmin) return json(req, { error: "Tylko administrator może trwale usuwać konta." }, 403);
      const reason = String(body.reason || "Trwałe usunięcie konta").trim().slice(0, 500);
      const authUser = await admin.auth.admin.getUserById(targetUserId);
      await logAction(admin, actor.id, "user_deleted_permanently", {
        targetUserId,
        reason,
        metadata: { displayName: target?.display_name || "", email: authUser.data.user?.email || "" },
      });
      await removeUserMedia(admin, targetUserId);
      const deleted = await admin.auth.admin.deleteUser(targetUserId, false);
      if (deleted.error) throw deleted.error;
      return json(req, { ok: true });
    }

    return json(req, { error: "Nieobsługiwana operacja administracyjna." }, 400);
  } catch (error) {
    console.error("community-admin-action:", error);
    return json(req, { error: errorMessage(error) }, 400);
  }
});
