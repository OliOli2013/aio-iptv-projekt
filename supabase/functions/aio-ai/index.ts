// Supabase Edge Function: aio-ai
// Purpose: server-side gateway to Real AI (OpenAI) for GitHub Pages frontend.
// Stores OPENAI_API_KEY as a secret in Supabase (never expose keys in browser).
//
// Deploy:
//   supabase functions deploy aio-ai
// Set secrets:
//   supabase secrets set OPENAI_API_KEY=... 
// Optional:
//   supabase secrets set AI_MODEL=gpt-4o-mini
//
// Frontend (GitHub Pages) calls:
//   POST {SUPABASE_URL}/functions/v1/aio-ai
//   Headers: Authorization: Bearer <ANON_KEY>, apikey: <ANON_KEY>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clip(s: string, max = 12000) {
  if (!s) return "";
  return s.length > max ? (s.slice(0, max) + `\n\n[...obcięto do ${max} znaków]`) : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
    if (!OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY secret in Supabase." }, 500);

    const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "chat");
    const message = String(body.message || "");
    const history = Array.isArray(body.history) ? body.history : [];
    const log = String(body.log || "");

    const systemBase =
      "Jesteś asystentem technicznym Enigma2 dla strony AIO-IPTV.pl. " +
      "Odpowiadasz po polsku, konkretnie i praktycznie. " +
      "Jeśli proponujesz komendy, podawaj je w blokach kodu. " +
      "Nie sugeruj łamania prawa.";

    let userPrompt = "";

    if (mode === "log") {
      userPrompt =
        "Przeanalizuj wklejony log.\n" +
        "1) Rozpoznaj typ (Enigma2 crashlog / OSCam / opkg / inne).\n" +
        "2) Wypisz najważniejsze sygnały z logu.\n" +
        "3) Podaj najbardziej prawdopodobną przyczynę.\n" +
        "4) Zaproponuj konkretne kroki naprawy (punktami).\n\n" +
        "LOG:\n" + clip(log, 12000);
    } else {
      // chat
      userPrompt =
        "Użytkownik pyta: " + message + "\n\n" +
        "Jeśli brakuje danych, poproś o: image (OpenATV/OpenPLi/Egami), model tunera, co było robione przed problemem.";
    }

    // Convert history to chat format
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemBase },
    ];

    for (const h of history.slice(-20)) {
      const r = String(h.role || "");
      const t = String(h.text || "");
      if (!t) continue;
      if (r === "user") messages.push({ role: "user", content: t });
      else if (r === "ai" || r === "assistant") messages.push({ role: "assistant", content: t });
    }

    messages.push({ role: "user", content: userPrompt });

    // Chat Completions API (simple + reliable)
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data?.error?.message || `OpenAI HTTP ${res.status}`;
      return json({ error: errMsg }, 502);
    }

    const reply = data?.choices?.[0]?.message?.content || "";
    return json({ reply: String(reply || "") });

  } catch (e) {
    return json({ error: (e as Error)?.message || "Unknown error" }, 500);
  }
});
