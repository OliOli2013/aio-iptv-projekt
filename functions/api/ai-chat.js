/* AIO-IPTV.pl — Cloudflare Pages Function /api/ai-chat
 * Primary backend for AI Chat. Supabase remains only as browser-side fallback.
 * Required secret for OpenAI:
 *   OPENAI_API_KEY
 * Optional:
 *   OPENAI_MODEL (default: gpt-6-luna)
 *   AI_PROVIDER=openai|deepseek|compatible
 *   DEEPSEEK_API_KEY / DEEPSEEK_MODEL
 *   AI_API_KEY / AI_BASE_URL / AI_MODEL
 */
const SYSTEM_PROMPT = `Jesteś technicznym asystentem AIO-IPTV.pl przygotowanym przez Pawła Pawełka.
Odpowiadasz po polsku, jasno i konkretnie. Specjalizujesz się w Enigma2, OpenATV, OpenPLi,
OpenViX, Egami, tunerach Zgemma i Octagon, listach kanałów, piconach, EPG, OSCam,
softcamach, IPTV, M3U, Xtream Codes, portalach MAC, OpenWebif, FTP/SSH i projektach AIO-IPTV.pl.
Nie wymyślaj poleceń ani parametrów. Gdy brakuje danych, wskaż dokładnie, czego potrzeba.
Nie proś użytkownika o publikowanie haseł, tokenów, kluczy API ani pełnych danych dostępowych.`;

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 24;
const buckets = new Map();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });
}

function providerInfo(env) {
  const explicit = String(env.AI_PROVIDER || "").trim().toLowerCase();
  const provider = explicit ||
    (env.OPENAI_API_KEY ? "openai" :
      env.DEEPSEEK_API_KEY ? "deepseek" :
        env.AI_BASE_URL ? "compatible" : "openai");

  if (provider === "openai") {
    const key = env.OPENAI_API_KEY || env.AI_API_KEY || "";
    return {
      provider,
      configured: Boolean(key),
      model: String(env.OPENAI_MODEL || env.AI_MODEL || "gpt-6-luna"),
      key
    };
  }
  if (provider === "deepseek") {
    const key = env.DEEPSEEK_API_KEY || env.AI_API_KEY || "";
    return {
      provider,
      configured: Boolean(key),
      model: String(env.DEEPSEEK_MODEL || env.AI_MODEL || "deepseek-chat"),
      key,
      base: "https://api.deepseek.com"
    };
  }
  if (provider === "compatible") {
    const key = env.AI_API_KEY || "";
    const base = String(env.AI_BASE_URL || "").replace(/\/+$/, "");
    const model = String(env.AI_MODEL || "");
    return { provider, configured: Boolean(key && base && model), model, key, base };
  }
  return { provider, configured: false, model: "" };
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return origin === new URL(request.url).origin;
  } catch (_) {
    return false;
  }
}

function clientKey(request) {
  return request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
}

function allowRequest(request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = buckets.get(key);
  if (!current || now - current.started >= WINDOW_MS) {
    buckets.set(key, { started: now, count: 1 });
    return { ok: true, remaining: MAX_PER_WINDOW - 1 };
  }
  current.count += 1;
  if (current.count > MAX_PER_WINDOW) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - current.started)) / 1000)) };
  }
  return { ok: true, remaining: Math.max(0, MAX_PER_WINDOW - current.count) };
}

function textFromResponses(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      const value = content?.text || content?.output_text;
      if (typeof value === "string" && value.trim()) parts.push(value.trim());
    }
  }
  return parts.join("\n").trim();
}

async function callOpenAI(query, info) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${info.key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: info.model,
      instructions: SYSTEM_PROMPT,
      input: query,
      max_output_tokens: 1200
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `OpenAI HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  const reply = textFromResponses(payload);
  if (!reply) throw new Error("OpenAI zwrócił pustą odpowiedź.");
  return { reply, model: info.model };
}

async function callCompatible(query, info) {
  const response = await fetch(`${info.base}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${info.key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: info.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query }
      ],
      temperature: 0.2,
      max_tokens: 1200
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `${info.provider} HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  const reply = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!reply) throw new Error(`${info.provider} zwrócił pustą odpowiedź.`);
  return { reply, model: info.model };
}

export async function onRequestGet({ env }) {
  const info = providerInfo(env);
  return json({
    ok: true,
    backend: "cloudflare-pages",
    configured: info.configured,
    provider: info.provider,
    model: info.model || null
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "allow": "GET, POST, OPTIONS",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, error: "Niedozwolone źródło żądania." }, 403);

  const limit = allowRequest(request);
  if (!limit.ok) {
    return json(
      { ok: false, error: "Zbyt wiele pytań w krótkim czasie. Spróbuj ponownie za kilka minut.", code: "RATE_LIMIT" },
      429,
      { "retry-after": String(limit.retryAfter || 60) }
    );
  }

  const info = providerInfo(env);
  if (!info.configured) {
    return json({
      ok: false,
      error: "Backend AI Cloudflare nie ma jeszcze skonfigurowanego klucza dostawcy.",
      code: "AI_NOT_CONFIGURED",
      provider: info.provider,
      expectedSecret: info.provider === "deepseek" ? "DEEPSEEK_API_KEY" :
        info.provider === "compatible" ? "AI_API_KEY" : "OPENAI_API_KEY"
    }, 503);
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: false, error: "Nieprawidłowy JSON." }, 400);
  }

  const query = String(body?.query || body?.message || "").trim();
  if (!query) return json({ ok: false, error: "Brak pola query." }, 400);
  if (query.length > 6000) return json({ ok: false, error: "Pytanie jest zbyt długie.", code: "QUERY_TOO_LONG" }, 413);

  try {
    const result = info.provider === "openai"
      ? await callOpenAI(query, info)
      : await callCompatible(query, info);

    return json({
      ok: true,
      reply: result.reply,
      backend: "cloudflare-pages",
      provider: info.provider,
      model: result.model
    });
  } catch (error) {
    const status = Number(error?.status || 502);
    console.error("[AIO ai-chat]", info.provider, error?.message || error);
    return json({
      ok: false,
      error: String(error?.message || "Błąd dostawcy AI."),
      code: "PROVIDER_ERROR",
      provider: info.provider
    }, status >= 400 && status <= 599 ? status : 502);
  }
}
