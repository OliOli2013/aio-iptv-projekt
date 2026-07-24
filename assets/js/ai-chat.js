/* AIO-IPTV.pl — AI Chat Enigma2
 * Samodzielny klient strony ai-chat.html.
 * Konfiguracja: data/aichat_config.json
 */
(function () {
  'use strict';

  const CONFIG_URL = 'data/aichat_config.json';
  const KNOWLEDGE_URL = 'data/knowledge.json';
  const REQUEST_TIMEOUT_MS = 60000;

  const state = {
    client: null,
    knowledge: [],
    busy: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(text, kind) {
    const status = byId('aiChatStatus');
    if (!status) return;
    status.textContent = text;
    status.dataset.state = kind || 'info';
  }

  function appendMessage(role, text, temporary) {
    const messages = byId('chatMessages');
    if (!messages) return null;
    const item = document.createElement('p');
    item.className = role === 'user' ? 'user' : 'bot';
    item.textContent = text;
    if (temporary) item.dataset.temporary = '1';
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function normaliseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function createClient(config) {
    if (!config || String(config.mode || '').toLowerCase() !== 'online') {
      return null;
    }

    if (config.supabase && config.supabase.url && config.supabase.anonKey) {
      const base = normaliseUrl(config.supabase.url);
      const fn = String(config.supabase.function || 'ai-chat').trim();
      const key = String(config.supabase.anonKey).trim();
      return {
        endpoint: base + '/functions/v1/' + encodeURIComponent(fn),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'apikey': key,
          'Authorization': 'Bearer ' + key
        },
        provider: 'Supabase Edge Function'
      };
    }

    if (config.endpoint) {
      return {
        endpoint: String(config.endpoint).trim(),
        headers: Object.assign({
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }, config.headers || {}),
        provider: 'API'
      };
    }

    return null;
  }

  async function fetchJsonNoCache(url) {
    const separator = url.indexOf('?') === -1 ? '?' : '&';
    const response = await fetch(url + separator + 'v=' + Date.now(), {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' podczas pobierania konfiguracji');
    }
    return response.json();
  }

  function extractReply(payload) {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload.trim();

    const candidates = [
      payload.reply,
      payload.answer,
      payload.text,
      payload.message,
      payload.output,
      payload.content,
      payload.result,
      payload.data && payload.data.reply,
      payload.data && payload.data.answer,
      payload.data && payload.data.text,
      payload.data && payload.data.message
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    if (Array.isArray(payload.choices) && payload.choices.length) {
      const choice = payload.choices[0] || {};
      const text = choice.text || (choice.message && choice.message.content);
      if (typeof text === 'string' && text.trim()) return text.trim();
    }

    return '';
  }

  function localFallback(query) {
    const words = String(query || '')
      .toLowerCase()
      .replace(/[^a-ząćęłńóśźż0-9\s-]/gi, ' ')
      .split(/\s+/)
      .filter(function (word) { return word.length > 2; });

    let best = null;
    let bestScore = 0;
    state.knowledge.forEach(function (item) {
      const haystack = [item.title, item.summary, (item.tags || []).join(' ')]
        .join(' ')
        .toLowerCase();
      let score = 0;
      words.forEach(function (word) {
        if (haystack.indexOf(word) !== -1) score += 1;
      });
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });

    if (!best || bestScore === 0) {
      return 'Połączenie z usługą AI nie powiodło się. Sprawdź status funkcji „ai-chat” w Supabase oraz aktywność wykupionego dostawcy AI.';
    }

    let text = 'Tryb awaryjny — ' + best.title + ': ' + (best.summary || '');
    if (best.link) text += ' Więcej: ' + best.link;
    if (Array.isArray(best.commands) && best.commands.length) {
      text += '\n\nPolecenie:\n' + best.commands[0];
    }
    return text;
  }

  async function readResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('application/json') !== -1) {
      return response.json();
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  async function sendQuestion(question) {
    if (!state.client) {
      throw new Error('Brak aktywnej konfiguracji ONLINE');
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(state.client.endpoint, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        headers: state.client.headers,
        signal: controller.signal,
        body: JSON.stringify({
          query: question,
          question: question,
          message: question,
          prompt: question,
          source: 'aio-iptv',
          locale: 'pl',
          page: window.location.href
        })
      });

      const payload = await readResponse(response);
      if (!response.ok) {
        const details = extractReply(payload) || ('HTTP ' + response.status);
        throw new Error(details);
      }

      const reply = extractReply(payload);
      if (!reply) {
        throw new Error('Serwer odpowiedział, ale nie zwrócił treści odpowiedzi');
      }
      return reply;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function initialise() {
    const form = byId('inlineAiForm');
    const input = byId('inlineAiInput');
    if (!form || !input) return;

    setStatus('Ładowanie konfiguracji AI Chat…', 'loading');

    try {
      const config = await fetchJsonNoCache(CONFIG_URL);
      state.client = createClient(config);
      if (!state.client) {
        setStatus('AI Chat OFFLINE — konfiguracja ONLINE nie jest aktywna.', 'offline');
      } else {
        setStatus('AI Chat ONLINE — konfiguracja Supabase została załadowana.', 'online');
      }
    } catch (error) {
      state.client = null;
      setStatus('AI Chat OFFLINE — nie można odczytać data/aichat_config.json.', 'offline');
      console.error('[AIO AI Chat] Config error:', error);
    }

    try {
      const kb = await fetchJsonNoCache(KNOWLEDGE_URL);
      state.knowledge = Array.isArray(kb) ? kb : [];
    } catch (_) {
      state.knowledge = [];
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (state.busy) return;

      const question = String(input.value || '').trim();
      if (!question) {
        input.focus();
        return;
      }

      state.busy = true;
      input.value = '';
      input.disabled = true;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;

      appendMessage('user', question);
      const waiting = appendMessage('bot', 'Łączenie z AI Chat…', true);
      setStatus('Wysyłanie pytania do AI…', 'loading');

      try {
        const reply = await sendQuestion(question);
        if (waiting) waiting.remove();
        appendMessage('bot', reply);
        setStatus('AI Chat ONLINE — odpowiedź odebrana poprawnie.', 'online');
      } catch (error) {
        if (waiting) waiting.remove();
        const reason = error && error.name === 'AbortError'
          ? 'Przekroczono czas oczekiwania na odpowiedź.'
          : String((error && error.message) || error || 'Nieznany błąd');
        appendMessage('bot', 'Nie udało się połączyć z płatnym AI Chat. ' + reason + '\n\n' + localFallback(question));
        setStatus('AI Chat OFFLINE — błąd po stronie funkcji lub dostawcy AI.', 'offline');
        console.error('[AIO AI Chat] Request error:', error);
      } finally {
        state.busy = false;
        input.disabled = false;
        if (button) button.disabled = false;
        input.focus();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initialise);
})();
