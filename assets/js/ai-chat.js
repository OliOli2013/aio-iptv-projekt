/* AIO-IPTV.pl — AI Chat ONLINE v3
 * Używa oficjalnego klienta supabase-js i pokazuje rzeczywistą klasę błędu.
 * Konfiguracja publiczna: data/aichat_config.json
 * Prywatny klucz dostawcy AI pozostaje wyłącznie w Supabase Secrets.
 */
(function () {
  'use strict';

  window.__AIO_DEDICATED_AI_CHAT__ = true;

  const CONFIG_URL = 'data/aichat_config.json';
  const KNOWLEDGE_URL = 'data/knowledge.json';
  const DEFAULT_TIMEOUT = 70000;
  const state = { client: null, config: null, knowledge: [], busy: false };

  const byId = (id) => document.getElementById(id);

  function setStatus(text, kind) {
    const el = byId('aiChatStatus');
    if (!el) return;
    el.textContent = text;
    el.dataset.state = kind || 'info';
  }

  function appendMessage(role, text, temporary) {
    const box = byId('chatMessages');
    if (!box) return null;
    const p = document.createElement('p');
    p.className = role === 'user' ? 'user' : 'bot';
    p.textContent = String(text || '');
    if (temporary) p.dataset.temporary = '1';
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
    return p;
  }

  async function fetchJsonNoCache(url) {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(url + separator + 'v=' + Date.now(), {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' dla ' + url);
    return response.json();
  }

  function buildFunctionNames(config) {
    const supa = config && config.supabase ? config.supabase : {};
    const names = [String(supa.function || 'ai-chat').trim()];
    const fallbacks = Array.isArray(supa.fallbackFunctions) ? supa.fallbackFunctions : [];
    fallbacks.forEach((name) => {
      name = String(name || '').trim();
      if (name && !names.includes(name)) names.push(name);
    });
    return names.filter(Boolean);
  }

  function createSupabaseClient(config) {
    const supa = config && config.supabase ? config.supabase : null;
    if (!config || String(config.mode || '').toLowerCase() !== 'online' || !supa) return null;
    if (!supa.url || !supa.anonKey) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Nie załadowano biblioteki supabase-js');
    }
    return window.supabase.createClient(String(supa.url).replace(/\/+$/, ''), String(supa.anonKey), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-client-info': 'aio-iptv-ai-chat/3.0' } }
    });
  }

  function extractReply(payload) {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload.trim();
    const fields = [
      payload.reply, payload.answer, payload.text, payload.message,
      payload.output_text, payload.output, payload.content, payload.result,
      payload.data && payload.data.reply,
      payload.data && payload.data.answer,
      payload.data && payload.data.text,
      payload.data && payload.data.message
    ];
    for (const value of fields) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    if (Array.isArray(payload.choices) && payload.choices.length) {
      const choice = payload.choices[0] || {};
      const text = choice.text || (choice.message && choice.message.content);
      if (typeof text === 'string') return text.trim();
    }
    return '';
  }

  async function responseBody(response) {
    if (!response) return '';
    try {
      const clone = typeof response.clone === 'function' ? response.clone() : response;
      const type = clone.headers && clone.headers.get ? (clone.headers.get('content-type') || '') : '';
      if (type.includes('application/json')) return await clone.json();
      return await clone.text();
    } catch (_) {
      return '';
    }
  }

  async function describeSupabaseError(error, functionName) {
    const name = String(error && error.name || 'SupabaseError');
    const message = String(error && error.message || error || 'Nieznany błąd');

    if (name === 'FunctionsHttpError') {
      const context = error && error.context;
      const body = await responseBody(context);
      let details = '';
      if (typeof body === 'string') details = body.trim();
      else if (body && typeof body === 'object') {
        details = String(body.error || body.message || body.details || JSON.stringify(body));
      }
      const status = context && context.status ? 'HTTP ' + context.status : 'HTTP';
      return `${status} z funkcji „${functionName}”${details ? ': ' + details : ''}`;
    }

    if (name === 'FunctionsRelayError') {
      return `Błąd bramy Supabase dla funkcji „${functionName}”: ${message}`;
    }

    if (name === 'FunctionsFetchError' || /failed to fetch/i.test(message)) {
      return `Brak połączenia z funkcją „${functionName}” (FunctionsFetchError). Najczęstsza przyczyna: projekt/funkcja Supabase jest zatrzymana, funkcja nie obsługuje CORS/OPTIONS albo występuje błąd DNS/sieci.`;
    }

    return `${name}: ${message}`;
  }

  async function invokeWithTimeout(functionName, query, timeoutMs) {
    const invokePromise = state.client.functions.invoke(functionName, {
      body: { query: query }
    });
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        const e = new Error('Przekroczono czas oczekiwania na odpowiedź');
        e.name = 'TimeoutError';
        reject(e);
      }, timeoutMs);
    });
    try {
      return await Promise.race([invokePromise, timeoutPromise]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function sendQuestion(query) {
    if (!state.client) throw new Error('Brak aktywnego klienta Supabase');
    const names = buildFunctionNames(state.config);
    const timeoutMs = Number(state.config && state.config.requestTimeoutMs) || DEFAULT_TIMEOUT;
    let lastError = null;

    for (const functionName of names) {
      try {
        const result = await invokeWithTimeout(functionName, query, timeoutMs);
        if (result && result.error) {
          const description = await describeSupabaseError(result.error, functionName);
          const err = new Error(description);
          err.original = result.error;
          // 404 / brak funkcji: spróbuj zgodności ze starą nazwą aio-ai.
          if (/404|not found|function.*does not exist/i.test(description)) {
            lastError = err;
            continue;
          }
          throw err;
        }
        const reply = extractReply(result && result.data);
        if (!reply) throw new Error(`Funkcja „${functionName}” odpowiedziała, ale nie zwróciła treści.`);
        return { reply, functionName };
      } catch (error) {
        lastError = error;
        // Błąd sieci/CORS dotyczy całego projektu — kolejna nazwa funkcji nic nie zmieni.
        if (/FunctionsFetchError|Failed to fetch|Brak połączenia/i.test(String(error && error.message || error))) break;
      }
    }
    throw lastError || new Error('Nie udało się wywołać funkcji AI');
  }

  function localFallback(query) {
    const words = String(query || '').toLowerCase()
      .replace(/[^a-ząćęłńóśźż0-9\s-]/gi, ' ')
      .split(/\s+/).filter((word) => word.length > 2);
    let best = null;
    let scoreBest = 0;
    state.knowledge.forEach((item) => {
      const haystack = [item.title, item.summary, (item.tags || []).join(' ')].join(' ').toLowerCase();
      let score = 0;
      words.forEach((word) => { if (haystack.includes(word)) score += 1; });
      if (score > scoreBest) { scoreBest = score; best = item; }
    });
    if (!best || scoreBest === 0) {
      return 'Tryb awaryjny nie znalazł dopasowanego poradnika. Sprawdź Edge Functions → ai-chat → Logs w projekcie Supabase.';
    }
    let text = 'Tryb awaryjny — ' + best.title + ': ' + (best.summary || '');
    if (best.link) text += ' Więcej: ' + best.link;
    return text;
  }

  async function initialise() {
    const form = byId('inlineAiForm');
    const input = byId('inlineAiInput');
    if (!form || !input) return;

    setStatus('Ładowanie konfiguracji AI Chat…', 'loading');
    try {
      state.config = await fetchJsonNoCache(CONFIG_URL);
      state.client = createSupabaseClient(state.config);
      if (!state.client) {
        setStatus('AI Chat OFFLINE — konfiguracja ONLINE nie jest kompletna.', 'offline');
      } else {
        const names = buildFunctionNames(state.config).join(', ');
        setStatus('Konfiguracja ONLINE załadowana. Funkcja: ' + names + '. Połączenie zostanie sprawdzone po wysłaniu pytania.', 'online');
      }
    } catch (error) {
      state.client = null;
      setStatus('AI Chat OFFLINE — błąd konfiguracji: ' + String(error.message || error), 'offline');
      console.error('[AIO AI Chat] Config:', error);
    }

    try {
      const kb = await fetchJsonNoCache(KNOWLEDGE_URL);
      state.knowledge = Array.isArray(kb) ? kb : [];
    } catch (_) {
      state.knowledge = [];
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.busy) return;
      const query = String(input.value || '').trim();
      if (!query) return input.focus();

      state.busy = true;
      input.value = '';
      input.disabled = true;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      appendMessage('user', query);
      const waiting = appendMessage('bot', 'Łączenie z płatnym AI Chat…', true);
      setStatus('Wysyłanie pytania do Supabase Edge Function…', 'loading');

      try {
        const result = await sendQuestion(query);
        if (waiting) waiting.remove();
        appendMessage('bot', result.reply);
        setStatus('AI Chat ONLINE — odpowiedź z funkcji „' + result.functionName + '”.', 'online');
      } catch (error) {
        if (waiting) waiting.remove();
        const reason = String(error && error.message || error || 'Nieznany błąd');
        appendMessage('bot', 'AI Chat ONLINE nie odpowiedział.\n\nDiagnoza: ' + reason + '\n\n' + localFallback(query));
        setStatus('AI Chat OFFLINE — backend Supabase wymaga naprawy lub ponownego wdrożenia.', 'offline');
        console.error('[AIO AI Chat] Request:', error);
      } finally {
        state.busy = false;
        input.disabled = false;
        if (button) button.disabled = false;
        input.focus();
      }
    }, true);
  }

  document.addEventListener('DOMContentLoaded', initialise);
})();
