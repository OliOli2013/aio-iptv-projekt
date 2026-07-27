import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGINS = new Set([
  "https://olioli2013.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const CATEGORIES = new Set(["pomoc", "aio-panel", "iptv", "kanaly", "picony", "oscam", "systemy", "wtyczki", "aplikacje", "testy", "inne"]);
const REACTIONS = new Set(["helpful", "works", "thanks"]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://olioli2013.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, x-aio-community, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function cleanIp(value: string | null): string {
  let ip = String(value || "").split(",")[0].trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, "");
  return ip.slice(0, 64);
}

function clientIp(req: Request): string {
  return cleanIp(
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

function authToken(req: Request): string {
  const header = req.headers.get("authorization") || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

function isActiveDate(value: unknown): boolean {
  if (!value) return false;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) && time > Date.now();
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return String(error || "Nieznany błąd");
}

async function authenticatedUser(admin: ReturnType<typeof createClient>, jwt: string) {
  const result = await admin.auth.getUser(jwt);
  if (result.error || !result.data.user) {
    console.warn("Nie udało się potwierdzić sesji użytkownika:", result.error?.message || "brak użytkownika");
    return null;
  }
  return result.data.user;
}

async function recordIp(admin: ReturnType<typeof createClient>, userId: string, ip: string, event: string) {
  if (!ip) return;
  const existing = await admin.from("community_user_ips")
    .select("id,event_count")
    .eq("user_id", userId)
    .eq("ip_address", ip)
    .maybeSingle();
  if (existing.data) {
    await admin.from("community_user_ips").update({
      last_seen_at: new Date().toISOString(),
      event_count: Number(existing.data.event_count || 0) + 1,
      last_event: event,
    }).eq("id", existing.data.id);
  } else {
    await admin.from("community_user_ips").insert({
      user_id: userId,
      ip_address: ip,
      last_event: event,
    });
  }
}

async function getAccess(admin: ReturnType<typeof createClient>, userId: string, ip: string) {
  const profileResult = await admin.from("community_profiles")
    .select("id,display_name,role,trusted,banned_until,ban_reason")
    .eq("id", userId)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) throw new Error("Nie znaleziono profilu użytkownika.");
  const profile = profileResult.data;
  const staff = ["admin", "moderator"].includes(String(profile.role || ""));
  let ipBlock: Record<string, unknown> | null = null;
  if (ip && !staff) {
    const blockResult = await admin.from("community_ip_blocks")
      .select("id,reason,permanent,expires_at,active")
      .eq("ip_address", ip)
      .eq("active", true)
      .maybeSingle();
    if (blockResult.error) throw blockResult.error;
    const block = blockResult.data;
    if (block && (block.permanent || !block.expires_at || isActiveDate(block.expires_at))) ipBlock = block;
  }
  const accountBanned = isActiveDate(profile.banned_until);
  return { profile, staff, accountBanned, ipBlock };
}

function validateAttachments(items: unknown, userId: string) {
  const list = Array.isArray(items) ? items : [];
  if (list.length > 4) throw new Error("Można dodać maksymalnie 4 zdjęcia.");
  for (const item of list) {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const path = String(row.path || row.url || "");
    const type = String(row.type || "");
    if (!path.startsWith(userId + "/") || !type.startsWith("image/")) {
      throw new Error("Nieprawidłowy załącznik.");
    }
  }
  return list;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { error: "Brak konfiguracji funkcji Edge." }, 500);

  try {
    const token = authToken(req);
    if (!token) return json(req, { error: "Zaloguj się do Społeczności AIO." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const user = await authenticatedUser(admin, token);
    if (!user) return json(req, { error: "Sesja wygasła albo token został odrzucony. Odśwież stronę i spróbuj ponownie.", code: "INVALID_SESSION" }, 401);

    const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(payload.action || "check_access");
    const ip = clientIp(req);
    const access = await getAccess(admin, user.id, ip);

    const eventMap: Record<string, string> = {
      check_access: "access",
      create_post: "post",
      create_comment: "comment",
      set_reaction: "reaction",
      report: "report",
      delete_post: "delete",
      delete_comment: "delete",
      toggle_follow: "reaction",
      set_solution: "comment",
    };
    try {
      await recordIp(admin, user.id, ip, eventMap[action] || "access");
    } catch (ipError) {
      // Historia IP jest dodatkiem bezpieczeństwa. Jej błąd nie może blokować
      // publikowania, komentarzy, reakcji ani obserwowania wpisów.
      console.warn("Nie udało się zapisać historii IP:", message(ipError));
    }

    if (access.accountBanned) {
      return json(req, {
        error: "Konto zostało zablokowane.",
        code: "ACCOUNT_BANNED",
        until: access.profile.banned_until,
        reason: access.profile.ban_reason || "Naruszenie zasad społeczności",
      }, 403);
    }
    if (access.ipBlock) {
      return json(req, {
        error: "Dostęp z tego adresu IP został zablokowany.",
        code: "IP_BLOCKED",
        reason: access.ipBlock.reason,
        until: access.ipBlock.expires_at,
        permanent: access.ipBlock.permanent,
      }, 403);
    }

    if (action === "check_access") {
      return json(req, { ok: true, allowed: true, ipRecorded: Boolean(ip), version: "community9" });
    }

    if (action === "create_post") {
      const title = String(payload.title || "").trim();
      const content = String(payload.content || "").trim();
      const category = CATEGORIES.has(String(payload.category || "")) ? String(payload.category) : "inne";
      if (title.length < 6 || title.length > 140) throw new Error("Tytuł powinien mieć od 6 do 140 znaków.");
      if (content.length < 20 || content.length > 50000) throw new Error("Treść powinna mieć od 20 do 50 000 znaków.");
      if (!access.staff) {
        const since = new Date(Date.now() - 3600000).toISOString();
        const count = await admin.from("community_posts").select("id", { count: "exact", head: true }).eq("author_id", user.id).gte("created_at", since);
        if (Number(count.count || 0) >= 5) throw new Error("Limit: maksymalnie 5 nowych wpisów na godzinę.");
      }
      const kind = access.staff && payload.kind === "official" ? "official" : "community";
      const status = access.staff || access.profile.trusted ? "published" : "pending";
      const attachments = validateAttachments(payload.attachments, user.id);
      const result = await admin.from("community_posts").insert({
        author_id: user.id,
        title,
        content,
        category,
        attachments,
        kind,
        status,
        published_at: status === "published" ? new Date().toISOString() : null,
      }).select("id,status").single();
      if (result.error) throw result.error;
      return json(req, { ok: true, data: result.data });
    }

    if (action === "create_comment") {
      const postId = String(payload.postId || "");
      const parentId = payload.parentId ? String(payload.parentId) : null;
      const content = String(payload.content || "").trim();
      if (content.length < 2 || content.length > 10000) throw new Error("Komentarz powinien mieć od 2 do 10 000 znaków.");
      if (!access.staff) {
        const since = new Date(Date.now() - 3600000).toISOString();
        const count = await admin.from("community_comments").select("id", { count: "exact", head: true }).eq("author_id", user.id).gte("created_at", since);
        if (Number(count.count || 0) >= 30) throw new Error("Limit: maksymalnie 30 komentarzy na godzinę.");
      }
      const postResult = await admin.from("community_posts").select("id,locked,status").eq("id", postId).maybeSingle();
      if (postResult.error || !postResult.data) throw new Error("Wpis nie istnieje.");
      if (postResult.data.status !== "published" && !access.staff) throw new Error("Nie można komentować tego wpisu.");
      if (postResult.data.locked && !access.staff) throw new Error("Komentarze do tego wpisu są zablokowane.");
      const result = await admin.from("community_comments").insert({
        post_id: postId,
        author_id: user.id,
        parent_id: parentId,
        content,
        status: "published",
      }).select("id").single();
      if (result.error) throw result.error;
      return json(req, { ok: true, data: result.data });
    }

    if (action === "set_reaction") {
      const postId = String(payload.postId || "");
      const type = String(payload.type || "");
      if (!REACTIONS.has(type)) throw new Error("Nieprawidłowy typ reakcji.");
      const existing = await admin.from("community_reactions").select("type").eq("post_id", postId).eq("user_id", user.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data && existing.data.type === type) {
        const remove = await admin.from("community_reactions").delete().eq("post_id", postId).eq("user_id", user.id);
        if (remove.error) throw remove.error;
        return json(req, { ok: true, removed: true });
      }
      const result = await admin.from("community_reactions").upsert({ post_id: postId, user_id: user.id, type }, { onConflict: "post_id,user_id" });
      if (result.error) throw result.error;
      return json(req, { ok: true, removed: false });
    }

    if (action === "toggle_follow") {
      const postId = String(payload.postId || "");
      if (!postId) throw new Error("Brak identyfikatora wpisu.");
      const existing = await admin.from("community_subscriptions")
        .select("post_id")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        const removed = await admin.from("community_subscriptions").delete().eq("post_id", postId).eq("user_id", user.id);
        if (removed.error) throw removed.error;
        return json(req, { ok: true, following: false });
      }
      const added = await admin.from("community_subscriptions").insert({ post_id: postId, user_id: user.id });
      if (added.error) throw added.error;
      return json(req, { ok: true, following: true });
    }

    if (action === "set_solution") {
      const postId = String(payload.postId || "");
      const solved = payload.solved !== false;
      const commentId = solved && payload.commentId ? String(payload.commentId) : null;
      if (!postId) throw new Error("Brak identyfikatora wpisu.");
      const postResult = await admin.from("community_posts")
        .select("id,author_id,status,best_comment_id")
        .eq("id", postId)
        .maybeSingle();
      if (postResult.error || !postResult.data) throw new Error("Wpis nie istnieje.");
      if (postResult.data.author_id !== user.id && !access.staff) return json(req, { error: "Tylko autor wpisu lub administrator może oznaczyć rozwiązanie." }, 403);
      if (commentId) {
        const commentResult = await admin.from("community_comments")
          .select("id,post_id,status")
          .eq("id", commentId)
          .maybeSingle();
        if (commentResult.error || !commentResult.data || commentResult.data.post_id !== postId || commentResult.data.status !== "published") {
          throw new Error("Wybrana odpowiedź nie istnieje albo nie należy do tego wpisu.");
        }
      }
      const updated = await admin.from("community_posts").update({
        solved,
        best_comment_id: solved ? commentId : null,
        solved_at: solved ? new Date().toISOString() : null,
        solved_by: solved ? user.id : null,
      }).eq("id", postId).select("id,solved,best_comment_id,solved_at").single();
      if (updated.error) throw updated.error;
      return json(req, { ok: true, data: updated.data });
    }

    if (action === "report") {
      const targetType = String(payload.targetType || "");
      const targetId = String(payload.targetId || "");
      const reason = String(payload.reason || "").trim().slice(0, 120);
      const details = String(payload.details || "").trim().slice(0, 1200) || null;
      if (!new Set(["post", "comment", "profile"]).has(targetType)) throw new Error("Nieprawidłowy typ zgłoszenia.");
      if (reason.length < 3) throw new Error("Podaj krótki powód zgłoszenia.");
      const result = await admin.from("community_reports").insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reason,
        details,
      }).select("id").single();
      if (result.error) throw result.error;
      return json(req, { ok: true, data: result.data });
    }

    if (action === "delete_post") {
      const id = String(payload.id || "");
      const current = await admin.from("community_posts").select("id,author_id,title").eq("id", id).maybeSingle();
      if (current.error || !current.data) throw new Error("Wpis nie istnieje.");
      if (current.data.author_id !== user.id && !access.staff) return json(req, { error: "Brak uprawnień." }, 403);
      const result = await admin.from("community_posts").delete().eq("id", id);
      if (result.error) throw result.error;
      return json(req, { ok: true });
    }

    if (action === "delete_comment") {
      const id = String(payload.id || "");
      const current = await admin.from("community_comments").select("id,author_id,post_id").eq("id", id).maybeSingle();
      if (current.error || !current.data) throw new Error("Komentarz nie istnieje.");
      if (current.data.author_id !== user.id && !access.staff) return json(req, { error: "Brak uprawnień." }, 403);
      const best = await admin.from("community_posts").select("id,best_comment_id").eq("id", current.data.post_id).maybeSingle();
      const result = await admin.from("community_comments").delete().eq("id", id);
      if (result.error) throw result.error;
      if (best.data && best.data.best_comment_id === id) {
        await admin.from("community_posts").update({ solved: false, best_comment_id: null, solved_at: null, solved_by: null }).eq("id", current.data.post_id);
      }
      return json(req, { ok: true });
    }

    return json(req, { error: "Nieobsługiwana operacja." }, 400);
  } catch (error) {
    console.error("community-write:", error);
    return json(req, { error: message(error), code: "COMMUNITY_WRITE_ERROR" }, 400);
  }
});
