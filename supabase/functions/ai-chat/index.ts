// AIO-IPTV.pl — Supabase Edge Function: ai-chat
// Prywatne klucze ustaw w Supabase: Project Settings / Edge Functions / Secrets.
// Obsługiwane sekrety:
//   AI_PROVIDER=openai | deepseek | compatible   (opcjonalne)
//   OPENAI_API_KEY=...                           (dla OpenAI)
//   OPENAI_MODEL=gpt-5.6-luna                    (opcjonalne)
//   DEEPSEEK_API_KEY=...                         (dla DeepSeek)
//   DEEPSEEK_MODEL=deepseek-chat                 (opcjonalne)
//   AI_API_KEY / AI_BASE_URL / AI_MODEL          (API zgodne z OpenAI Chat Completions)

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8',
};

const systemPrompt = `Jesteś technicznym asystentem AIO-IPTV.pl przygotowanym przez Pawła Pawełka.
Odpowiadasz po polsku, jasno i konkretnie. Specjalizujesz się w Enigma2, OpenATV, OpenPLi,
OpenViX, Egami, tunerach Zgemma i Octagon, listach kanałów, piconach, EPG, OSCam,
softcamach, IPTV, M3U, Xtream Codes, portalach MAC, OpenWebif, FTP/SSH i wtyczkach AIO-IPTV.pl.
Nie wymyślaj poleceń ani parametrów. Gdy brakuje danych, wskaż dokładnie, czego potrzeba.
Nie proś użytkownika o publikowanie haseł, tokenów, kluczy API ani pełnych danych dostępowych.`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function getTextFromOpenAI(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const output of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      const text = content?.text || content?.output_text;
      if (typeof text === 'string' && text.trim()) parts.push(text.trim());
    }
  }
  return parts.join('\n').trim();
}

async function callOpenAI(query: string): Promise<{ reply: string; model: string }> {
  const key = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('AI_API_KEY');
  if (!key) throw new Error('Brak sekretu OPENAI_API_KEY w Supabase Edge Function Secrets.');
  const model = Deno.env.get('OPENAI_MODEL') || Deno.env.get('AI_MODEL') || 'gpt-5.6-luna';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: systemPrompt,
      input: query,
      max_output_tokens: 1200,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `OpenAI HTTP ${response.status}`;
    throw new Error(message);
  }
  const reply = getTextFromOpenAI(payload);
  if (!reply) throw new Error('OpenAI zwrócił pustą odpowiedź.');
  return { reply, model };
}

async function callCompatible(query: string, provider: string): Promise<{ reply: string; model: string }> {
  const deepseek = provider === 'deepseek';
  const key = deepseek
    ? (Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('AI_API_KEY'))
    : Deno.env.get('AI_API_KEY');
  if (!key) throw new Error(deepseek ? 'Brak sekretu DEEPSEEK_API_KEY.' : 'Brak sekretu AI_API_KEY.');

  const base = (deepseek ? 'https://api.deepseek.com' : Deno.env.get('AI_BASE_URL') || '').replace(/\/+$/, '');
  if (!base) throw new Error('Brak sekretu AI_BASE_URL dla dostawcy zgodnego z OpenAI.');
  const model = deepseek
    ? (Deno.env.get('DEEPSEEK_MODEL') || Deno.env.get('AI_MODEL') || 'deepseek-chat')
    : (Deno.env.get('AI_MODEL') || '');
  if (!model) throw new Error('Brak sekretu AI_MODEL.');

  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `${provider} HTTP ${response.status}`;
    throw new Error(message);
  }
  const reply = String(payload?.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error(`${provider} zwrócił pustą odpowiedź.`);
  return { reply, model };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Dozwolona jest tylko metoda POST.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || body?.message || '').trim();
    if (!query) return json({ error: 'Brak pola query w żądaniu.' }, 400);
    if (query.length > 6000) return json({ error: 'Pytanie jest zbyt długie.' }, 413);

    const provider = String(
      Deno.env.get('AI_PROVIDER') ||
      (Deno.env.get('OPENAI_API_KEY') ? 'openai' : '') ||
      (Deno.env.get('DEEPSEEK_API_KEY') ? 'deepseek' : '') ||
      (Deno.env.get('AI_BASE_URL') ? 'compatible' : 'openai')
    ).toLowerCase();

    const result = provider === 'openai'
      ? await callOpenAI(query)
      : await callCompatible(query, provider);

    return json({ reply: result.reply, provider, model: result.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ai-chat]', message);
    return json({ error: message, details: 'Sprawdź Edge Functions → ai-chat → Logs oraz Secrets.' }, 500);
  }
});
