/* AIO-IPTV.pl — AI Chat Cloudflare-first 2026-10-10
 * 1. Cloudflare Pages Function /api/ai-chat
 * 2. Supabase Edge Function fallback
 * 3. lokalna baza wiedzy
 */
(function () {
  'use strict';

  window.__AIO_DEDICATED_AI_CHAT__ = true;

  const CONFIG_URL = 'data/aichat_config.json';
  const KNOWLEDGE_URL = 'data/knowledge.json';
  const DEFAULT_TIMEOUT = 60000;
  const DEFAULT_FALLBACK_TIMEOUT = 25000;
  const state = {
    config: null,
    knowledge: [],
    busy: false,
    supportTimer: null,
    supportShown: false,
    cloudflareProbe: null
  };

  const SUPPORT_DELAY_MS = 45000;
  const SUPPORT_LINKS = {
    revolut: 'https://revolut.me/pawelz75',
    buycoffee: 'https://buycoffee.to/pawelpawelek',
    kofi: 'https://ko-fi.com/pawelpawlek'
  };

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

  function clearSupportTimer() {
    if (state.supportTimer) {
      window.clearTimeout(state.supportTimer);
      state.supportTimer = null;
    }
  }

  function appendSupportReminder() {
    if (state.supportShown) return;
    const box = byId('chatMessages');
    if (!box) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'bot';
    wrapper.setAttribute('role', 'note');
    wrapper.style.display = 'block';

    const title = document.createElement('strong');
    title.textContent = 'Dziękuję za rozmowę z Asystentem AIO Panel.';
    wrapper.appendChild(title);

    const text = document.createElement('span');
    text.style.display = 'block';
    text.style.marginTop = '6px';
    text.textContent = 'Jeżeli odpowiedź była pomocna, możesz dobrowolnie wesprzeć rozwój AIO Panel, bezpłatnych wtyczek, poradników i aktualizacji.';
    wrapper.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'action-row';
    actions.style.marginTop = '10px';

    [
      ['Revolut', SUPPORT_LINKS.revolut],
      ['BuyCoffee', SUPPORT_LINKS.buycoffee],
      ['Ko-fi', SUPPORT_LINKS.kofi]
    ].forEach(([label, href], index) => {
      const link = document.createElement('a');
      link.className = 'button small' + (index === 0 ? ' primary' : '');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = label;
      actions.appendChild(link);
    });

    wrapper.appendChild(actions);
    box.appendChild(wrapper);
    box.scrollTop = box.scrollHeight;
    state.supportShown = true;
  }

  function scheduleSupportReminder() {
    clearSupportTimer();
    if (state.supportShown) return;
    state.supportTimer = window.setTimeout(function () {
      if (!state.busy) appendSupportReminder();
    }, SUPPORT_DELAY_MS);
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

  function timeoutFetch(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => window.clearTimeout(timer));
  }

  async function readPayload(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { error: text }; }
  }

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/g, 'l')
      .replace(/[^a-z0-9\s.-]/g, ' ');
  }

  function configCloudflare() {
    const primary = state.config && state.config.primary;
    if (primary && primary.type === 'cloudflare') {
      return { endpoint: String(primary.endpoint || '/api/ai-chat') };
    }
    return { endpoint: '/api/ai-chat' };
  }

  function configSupabase() {
    const old = state.config && state.config.supabase;
    const newer = state.config && state.config.supabaseFallback;
    const source = newer || old || {};
    const enabled = newer ? newer.enabled !== false : Boolean(old);
    const functions = Array.isArray(source.functions)
      ? source.functions
      : [source.function || 'ai-chat'].concat(Array.isArray(source.fallbackFunctions) ? source.fallbackFunctions : []);
    return {
      enabled,
      url: String(source.url || ''),
      anonKey: String(source.anonKey || ''),
      functions: functions.map(x => String(x || '').trim()).filter(Boolean)
    };
  }

  async function probeCloudflare() {
    const cf = configCloudflare();
    try {
      const response = await timeoutFetch(cf.endpoint, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'accept': 'application/json' }
      }, 8000);
      const data = await readPayload(response);
      if (!response.ok) throw new Error(data.error || ('HTTP ' + response.status));
      return data;
    } catch (error) {
      return { ok: false, configured: false, error: String(error && error.message || error) };
    }
  }

  async function callCloudflare(query) {
    const cf = configCloudflare();
    const timeoutMs = Number(state.config && state.config.requestTimeoutMs) || DEFAULT_TIMEOUT;
    let response;
    try {
      response = await timeoutFetch(cf.endpoint, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({ query })
      }, timeoutMs);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        const e = new Error('Cloudflare AI: przekroczono czas oczekiwania.');
        e.backend = 'cloudflare';
        e.retryable = true;
        throw e;
      }
      const e = new Error('Cloudflare AI: brak połączenia z /api/ai-chat.');
      e.backend = 'cloudflare';
      e.retryable = true;
      throw e;
    }

    const data = await readPayload(response);
    if (!response.ok) {
      const e = new Error('Cloudflare AI: ' + String(data.error || ('HTTP ' + response.status)));
      e.status = response.status;
      e.code = data.code || '';
      e.backend = 'cloudflare';
      e.retryable = response.status >= 500 || response.status === 404;
      throw e;
    }

    const reply = String(data.reply || data.answer || data.text || '').trim();
    if (!reply) {
      const e = new Error('Cloudflare AI odpowiedział bez treści.');
      e.backend = 'cloudflare';
      e.retryable = true;
      throw e;
    }
    return {
      reply,
      backend: 'Cloudflare',
      provider: data.provider || '',
      model: data.model || ''
    };
  }

  async function callSupabaseFunction(functionName, query) {
    const supa = configSupabase();
    if (!supa.enabled || !supa.url || !supa.anonKey) {
      const e = new Error('Zapasowy backend Supabase nie jest skonfigurowany.');
      e.retryable = false;
      throw e;
    }

    const endpoint = supa.url.replace(/\/+$/, '') + '/functions/v1/' + encodeURIComponent(functionName);
    const timeoutMs = Number(state.config && state.config.fallbackTimeoutMs) || DEFAULT_FALLBACK_TIMEOUT;

    let response;
    try {
      response = await timeoutFetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'apikey': supa.anonKey,
          'authorization': 'Bearer ' + supa.anonKey,
          'x-client-info': 'aio-iptv-ai-chat/cloudflare-fallback'
        },
        body: JSON.stringify({ query })
      }, timeoutMs);
    } catch (error) {
      const e = new Error(
        error && error.name === 'AbortError'
          ? `Supabase „${functionName}”: przekroczono czas oczekiwania.`
          : `Supabase „${functionName}”: brak połączenia.`
      );
      e.backend = 'supabase';
      e.retryable = true;
      throw e;
    }

    const data = await readPayload(response);
    if (!response.ok) {
      const e = new Error(`Supabase „${functionName}”: ${String(data.error || data.message || ('HTTP ' + response.status))}`);
      e.status = response.status;
      e.backend = 'supabase';
      e.retryable = response.status >= 500 || response.status === 404;
      throw e;
    }

    const reply = String(
      data.reply || data.answer || data.text || data.message ||
      (data.data && (data.data.reply || data.data.answer || data.data.text || data.data.message)) || ''
    ).trim();

    if (!reply) {
      const e = new Error(`Supabase „${functionName}” odpowiedział bez treści.`);
      e.backend = 'supabase';
      e.retryable = true;
      throw e;
    }

    return {
      reply,
      backend: 'Supabase',
      provider: data.provider || '',
      model: data.model || '',
      functionName
    };
  }

  async function callSupabase(query) {
    const supa = configSupabase();
    let last = null;
    for (const name of supa.functions) {
      try {
        return await callSupabaseFunction(name, query);
      } catch (error) {
        last = error;
        if (error && error.status && !error.retryable) break;
      }
    }
    throw last || new Error('Zapasowy backend Supabase nie odpowiedział.');
  }

  async function sendQuestion(query) {
    let cloudflareError = null;

    try {
      return await callCloudflare(query);
    } catch (error) {
      cloudflareError = error;
      if (error && (error.status === 429 || error.status === 400 || error.status === 413 || error.status === 403)) {
        throw error;
      }
    }

    try {
      return await callSupabase(query);
    } catch (supabaseError) {
      const e = new Error(
        'Cloudflare: ' + String(cloudflareError && cloudflareError.message || 'niedostępny') +
        '\nSupabase fallback: ' + String(supabaseError && supabaseError.message || 'niedostępny')
      );
      e.cloudflare = cloudflareError;
      e.supabase = supabaseError;
      throw e;
    }
  }

  function localFallback(query) {
    const words = normalize(query).split(/\s+/).filter(word => word.length > 2);
    let best = null;
    let bestScore = 0;

    state.knowledge.forEach(item => {
      const title = normalize(item.title);
      const summary = normalize(item.summary);
      const tags = normalize((item.tags || []).join(' '));
      const commands = normalize((item.commands || []).join(' '));
      let score = 0;
      words.forEach(word => {
        if (title.includes(word)) score += 4;
        if (tags.includes(word)) score += 3;
        if (summary.includes(word)) score += 2;
        if (commands.includes(word)) score += 1;
      });
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });

    if (best && bestScore > 0) {
      let text = 'Tryb lokalny — ' + best.title + ': ' + (best.summary || '');
      if (Array.isArray(best.commands) && best.commands.length) {
        text += '\n\nKomenda:\n' + best.commands[0];
      }
      if (best.link) text += '\n\nWięcej: ' + best.link;
      return text;
    }

    return [
      'Tryb lokalny: backend AI jest chwilowo niedostępny i lokalna baza nie ma dokładnej odpowiedzi.',
      '',
      'Możesz od razu użyć:',
      '• Analizator logów: log-analyzer.html',
      '• Baza błędów: errors.html',
      '• Asystent doboru: assistant.html',
      '• Społeczność AIO: community.html'
    ].join('\n');
  }

  async function initialise() {
    const form = byId('inlineAiForm');
    const input = byId('inlineAiInput');
    if (!form || !input) return;

    setStatus('Sprawdzanie backendu Asystenta AIO Panel…', 'loading');

    try {
      state.config = await fetchJsonNoCache(CONFIG_URL);
    } catch (error) {
      state.config = {};
      setStatus('Błąd konfiguracji AI — działa tylko tryb lokalny.', 'offline');
      console.error('[AIO AI Chat] Config:', error);
    }

    try {
      const kb = await fetchJsonNoCache(KNOWLEDGE_URL);
      state.knowledge = Array.isArray(kb) ? kb : [];
    } catch (_) {
      state.knowledge = [];
    }

    state.cloudflareProbe = await probeCloudflare();
    const supa = configSupabase();

    if (state.cloudflareProbe && state.cloudflareProbe.configured) {
      const model = state.cloudflareProbe.model ? ' • ' + state.cloudflareProbe.model : '';
      setStatus('Asystent AIO Panel ONLINE — Cloudflare' + model, 'online');
    } else if (supa.enabled && supa.url && supa.anonKey) {
      setStatus('Cloudflare AI czeka na konfigurację — Supabase działa jako backend zapasowy.', 'info');
    } else {
      setStatus('Asystent AIO Panel OFFLINE — dostępny jest tylko tryb lokalny.', 'offline');
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
      clearSupportTimer();

      appendMessage('user', query);
      const waiting = appendMessage('bot', 'Asystent AIO Panel analizuje pytanie i przygotowuje odpowiedź…', true);
      setStatus('Asystent AIO Panel pracuje nad odpowiedzią…', 'loading');

      try {
        const result = await sendQuestion(query);
        if (waiting) waiting.remove();
        appendMessage('bot', result.reply);
        const suffix = [result.backend, result.provider, result.model].filter(Boolean).join(' • ');
        setStatus('Asystent AIO Panel ONLINE' + (suffix ? ' — ' + suffix : ''), 'online');
        scheduleSupportReminder();
      } catch (error) {
        if (waiting) waiting.remove();
        const reason = String(error && error.message || error || 'Nieznany błąd');
        appendMessage(
          'bot',
          'Backend AI nie odpowiedział.\n\n' +
          reason +
          '\n\n' +
          localFallback(query)
        );
        setStatus('Backend AI niedostępny — uruchomiono tryb lokalny.', 'offline');
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
