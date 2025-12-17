/* =========================================================
   AIO-IPTV Final Enhancements (GitHub Pages / static)
   - Notifications (bell) with updates.json
   - AI Chat (offline KB)
   - Knowledge Base + Tools + Systems checklists
   - PWA registration
   ========================================================= */

(function () {
  'use strict';

  const qs = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function safeText(s) { return (s ?? '').toString(); }

  function setNoScroll(on) {
    document.body.classList.toggle('no-scroll', !!on);
  }

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return await res.json();
  }


  // -----------------------------
  // Real AI via Supabase Edge Function (optional)
  // -----------------------------
  function getAIConfig() {
    const cfg = (window.AIO_SITE || window.AIO_SITE_CONFIG || {});
    const supabaseUrl = safeText(cfg.supabaseUrl || '').trim();
    const anonKey = safeText(cfg.supabaseAnonKey || '').trim();
    const fnName = safeText(cfg.aiFunctionName || 'aio-ai').trim();
    return { supabaseUrl, anonKey, fnName, enabled: !!(supabaseUrl && anonKey) };
  }

  async function callSupabaseAI(payload) {
    const { supabaseUrl, anonKey, fnName, enabled } = getAIConfig();
    if (!enabled) throw new Error('AI not configured');
    const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${encodeURIComponent(fnName)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey
      },
      body: JSON.stringify(payload || {})
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = safeText(data.error || data.message || `HTTP ${res.status}`);
      throw new Error(msg);
    }
    return data;
  }

  function clipText(s, maxLen) {
    s = safeText(s);
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + `\n\n[...obcięto do ${maxLen} znaków]`;
  }


  // -----------------------------
  // Support drawer (mobile safe)
  // -----------------------------
  function initSupportDrawerFinal() {
    const fab = qs('#support-fab');
    const drawer = qs('#support-drawer');
    const closeBtn = qs('#support-drawer-close');
    const backdrop = qs('#support-drawer-backdrop') || qs('.support-drawer__backdrop', drawer || undefined);
    const sheet = qs('.support-drawer__sheet', drawer || undefined);

    if (!fab || !drawer) return;
    if (fab.dataset.boundFinal === '1') return;
    fab.dataset.boundFinal = '1';

    let lastTouch = 0;

    const open = () => {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      drawer.style.display = 'block'; // compatibility with old code
      setNoScroll(true);
    };
    const close = () => {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.style.display = 'none';
      setNoScroll(false);
    };

    fab.addEventListener('touchend', (e) => {
      lastTouch = Date.now();
      e.preventDefault();
      e.stopPropagation();
      open();
    }, { passive: false });

    fab.addEventListener('click', (e) => {
      if (Date.now() - lastTouch < 650) return;
      e.preventDefault();
      e.stopPropagation();
      open();
    });

    if (sheet) {
      sheet.addEventListener('click', (e) => e.stopPropagation());
      sheet.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    }

    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); close(); });
    if (backdrop) {
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.addEventListener('touchend', (e) => { if (e.target === backdrop) close(); }, { passive: true });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (drawer.classList.contains('open') || drawer.style.display === 'block')) close();
    });
  }

  // -----------------------------
  // Mobile nav drawer (polished)
  // -----------------------------
  function initMobileNavFinal() {
    const toggle = qs('#navToggle');
    const drawer = qs('#mobile-nav-drawer');
    if (!toggle || !drawer) return;

    let lastTouch = 0;
    const open = () => { drawer.classList.add('open'); drawer.style.display = 'block'; setNoScroll(true); };
    const close = () => { drawer.classList.remove('open'); drawer.style.display = 'none'; setNoScroll(false); };

    toggle.addEventListener('touchend', (e) => { lastTouch = Date.now(); e.preventDefault(); open(); }, { passive: false });
    toggle.addEventListener('click', (e) => { if (Date.now() - lastTouch < 650) return; e.preventDefault(); open(); });

    qsa('[data-nav-close]', drawer).forEach((btn) => {
      btn.addEventListener('click', close);
      btn.addEventListener('touchend', close, { passive: true });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (drawer.classList.contains('open') || drawer.style.display === 'block')) close();
    });
  }

  // -----------------------------
  // Notifications (bell) + updates.json
  // -----------------------------
  const UPDATES_PATH = './data/updates.json';
  const STORAGE_LAST_READ = 'aio_updates_last_read';

  function renderNotifItem(item) {
    const date = safeText(item.date);
    const title = safeText(item.title);
    const details = safeText(item.details);

    const el = document.createElement('div');
    el.className = 'notif-item';
    el.innerHTML = `
      <div class="notif-icon">🔔</div>
      <div>
        <div><strong>${escapeHtml(title)}</strong></div>
        <div class="date">${escapeHtml(date)}</div>
        ${details ? `<div style="opacity:.85;margin-top:4px;line-height:1.35">${escapeHtml(details)}</div>` : ''}
      </div>
    `;
    return el;
  }

  function escapeHtml(str) {
    return safeText(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function initNotificationsFinal() {
    const dd = qs('#notificationsDropdown');
    const bd = qs('#notifBackdrop');
    const list = qs('#notifList');
    const closeBtn = qs('#notifCloseBtn');
    const markAll = qs('#notifMarkAll');
    const badge = qs('#notif-badge');

    if (!dd || !bd || !list || !badge) return;

    // Always wire open/close (even if JSON fails)
    function open() {
      dd.classList.add('show');
      bd.classList.add('show');
      dd.setAttribute('aria-hidden', 'false');
    }
    function close() {
      dd.classList.remove('show');
      bd.classList.remove('show');
      dd.setAttribute('aria-hidden', 'true');
    }

    window.toggleNotifications = function(forceOpen) {
      const willOpen = (typeof forceOpen === 'boolean') ? forceOpen : !dd.classList.contains('show');
      if (willOpen) open(); else close();
    };

    bd.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);

    // initial hide
    badge.style.display = 'none';

    let updates = [];
    try {
      updates = await fetchJSON(UPDATES_PATH);
    } catch (e) {
      list.innerHTML = `<div class="notif-item" style="cursor:default"><div>Nie udało się wczytać powiadomień. Sprawdź plik <strong>data/updates.json</strong>.</div></div>`;
      return;
    }

    const lastRead = Number(localStorage.getItem(STORAGE_LAST_READ) || '0');
    const unread = updates.filter(u => Date.parse(u.date) > lastRead).length;

    if (unread > 0) {
      badge.textContent = String(unread);
      badge.style.display = 'inline-block';
    } else {
      badge.textContent = '0';
      badge.style.display = 'none';
    }

    list.innerHTML = '';
    updates.slice().reverse().forEach((u) => list.appendChild(renderNotifItem(u)));

    function markAllRead() {
      const maxDate = updates
        .map(u => Date.parse(u.date))
        .filter(n => Number.isFinite(n))
        .reduce((a,b)=>Math.max(a,b), Date.now());
      localStorage.setItem(STORAGE_LAST_READ, String(maxDate));
      badge.textContent = '0';
      badge.style.display = 'none';
    }

    if (markAll) markAll.addEventListener('click', () => { markAllRead(); close(); });
  }
// -----------------------------
  // Knowledge Base (knowledge.json)
  // -----------------------------
  const KB_PATH = './data/knowledge.json';

  function initKnowledgeBaseFinal() {
    const search = qs('#kbSearch');
    const tagsWrap = qs('#kbTags');
    const list = qs('#kbList');
    const view = qs('#kbView');
    if (!search || !tagsWrap || !list || !view) return;

    fetchJSON(KB_PATH).then((items) => {
      const allItems = Array.isArray(items) ? items : [];
      const tagSet = new Set();
      allItems.forEach(i => (i.tags || []).forEach(t => tagSet.add(String(t))));
      const tags = Array.from(tagSet).sort((a,b)=>a.localeCompare(b,'pl'));

      let activeTag = '';
      let query = '';

      function renderTags() {
        tagsWrap.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'kb-tag' + (activeTag === '' ? ' active' : '');
        allBtn.textContent = 'Wszystkie';
        allBtn.addEventListener('click', () => { activeTag = ''; render(); });
        tagsWrap.appendChild(allBtn);

        tags.forEach((t) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'kb-tag' + (activeTag === t ? ' active' : '');
          b.textContent = t;
          b.addEventListener('click', () => { activeTag = (activeTag === t ? '' : t); render(); });
          tagsWrap.appendChild(b);
        });
      }

      function matches(i) {
        const inTag = !activeTag || (i.tags || []).includes(activeTag);
        if (!inTag) return false;
        if (!query) return true;

        const hay = [
          i.title, i.summary, ...(i.tags || []),
          ...(i.content || []),
          ...((i.commands || []).map(c => c.cmd)),
          ...((i.notes || []))
        ].map(safeText).join(' ').toLowerCase();

        return hay.includes(query.toLowerCase());
      }

      function renderList(filtered) {
        list.innerHTML = '';
        if (!filtered.length) {
          list.innerHTML = `<div class="kb-item"><div class="t">Brak wyników</div><div class="m">Zmień tag lub wyszukiwanie.</div></div>`;
          return;
        }
        filtered.forEach((i) => {
          const el = document.createElement('div');
          el.className = 'kb-item';
          el.innerHTML = `<div class="t">${escapeHtml(i.title)}</div><div class="m">${escapeHtml(i.summary || '')}</div>`;
          el.addEventListener('click', () => renderView(i));
          list.appendChild(el);
        });
      }

      function renderView(i) {
        const commands = (i.commands || []).map((c, idx) => {
          const cmd = safeText(c.cmd);
          const label = safeText(c.label || `Komenda ${idx+1}`);
          return `
            <div style="margin-top:10px">
              <div style="font-weight:900;margin-bottom:6px">${escapeHtml(label)}</div>
              <pre><code>${escapeHtml(cmd)}</code></pre>
              <div class="kb-actions">
                <button class="btn-copy" type="button" data-copy="${escapeHtml(cmd)}">Kopiuj komendę</button>
              </div>
            </div>
          `;
        }).join('');

        const notes = (i.notes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('');

        view.innerHTML = `
          <h3>${escapeHtml(i.title)}</h3>
          ${(i.content || []).map(p => `<p style="color:#e6edf3;line-height:1.55">${escapeHtml(p)}</p>`).join('')}
          ${commands}
          ${notes ? `<div style="margin-top:12px"><div style="font-weight:900;margin-bottom:6px">Uwagi</div><ul style="color:#9aa4b2;line-height:1.55;margin:0;padding-left:18px">${notes}</ul></div>` : ''}
        `;

        qsa('[data-copy]', view).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const t = btn.getAttribute('data-copy') || '';
            try {
              await navigator.clipboard.writeText(t);
              btn.textContent = 'Skopiowano';
              setTimeout(() => btn.textContent = 'Kopiuj komendę', 1200);
            } catch {
              // fallback
              const ta = document.createElement('textarea');
              ta.value = t;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              ta.remove();
              btn.textContent = 'Skopiowano';
              setTimeout(() => btn.textContent = 'Kopiuj komendę', 1200);
            }
          });
        });
      }

      function render() {
        query = safeText(search.value).trim();
        renderTags();
        const filtered = allItems.filter(matches);
        renderList(filtered);
        if (filtered.length === 1) renderView(filtered[0]);
        if (filtered.length !== 1) view.innerHTML = `<div class="kb-empty">Wybierz temat z listy po lewej lub wpisz wyszukiwanie.</div>`;
      }

      search.addEventListener('input', render);
      render();
    }).catch(() => {
      list.innerHTML = `<div class="kb-item"><div class="t">Nie udało się wczytać bazy wiedzy</div><div class="m">Sprawdź plik data/knowledge.json</div></div>`;
    });
  }

  // -----------------------------
  // Tools grid (tools.json)
  // -----------------------------
  const TOOLS_PATH = './data/tools.json';

  function initToolsFinal() {
    const grid = qs('#toolsGrid');
    if (!grid) return;

    fetchJSON(TOOLS_PATH).then((items) => {
      const tools = Array.isArray(items) ? items : [];
      grid.innerHTML = '';
      tools.forEach((t) => {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.innerHTML = `
          <h3>${escapeHtml(t.title || '')}</h3>
          <p>${escapeHtml(t.desc || '')}</p>
          <pre><code>${escapeHtml((t.cmds || []).join('\n'))}</code></pre>
          <button class="btn-copy" type="button" data-copy="${escapeHtml((t.cmds || []).join('\n'))}">Kopiuj</button>
        `;
        grid.appendChild(tile);
      });

      qsa('[data-copy]', grid).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const t = btn.getAttribute('data-copy') || '';
          try { await navigator.clipboard.writeText(t); } catch {}
          btn.textContent = 'Skopiowano';
          setTimeout(() => btn.textContent = 'Kopiuj', 1200);
        });
      });
    }).catch(() => {
      grid.innerHTML = `<div class="tile"><h3>Brak danych narzędzi</h3><p>Nie udało się wczytać data/tools.json</p></div>`;
    });
  }

  // -----------------------------
  // Systems (checklists) systems.json
  // -----------------------------
  const SYSTEMS_PATH = './data/systems.json';
  const STORAGE_SYSTEMS = 'aio_system_checklist';

  function initSystemsFinal() {
    const grid = qs('#systemsGrid');
    if (!grid) return;

    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_SYSTEMS) || '{}'); }
      catch { return {}; }
    })();

    fetchJSON(SYSTEMS_PATH).then((items) => {
      const systems = Array.isArray(items) ? items : [];
      grid.innerHTML = '';

      function persist() {
        localStorage.setItem(STORAGE_SYSTEMS, JSON.stringify(saved));
      }

      systems.forEach((s) => {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.innerHTML = `
          <h3>${escapeHtml(s.title || '')}</h3>
          <p>${escapeHtml(s.desc || '')}</p>
          <div class="checklist" id="cl-${escapeHtml(s.id || '')}"></div>
        `;
        grid.appendChild(tile);

        const cl = qs(`#cl-${cssEscape(s.id || '')}`, tile) || qs('.checklist', tile);
        const list = Array.isArray(s.checklist) ? s.checklist : [];
        saved[s.id] = saved[s.id] || {};

        list.forEach((item, idx) => {
          const key = String(idx);
          const row = document.createElement('label');
          row.className = 'check';
          const checked = !!saved[s.id][key];
          row.innerHTML = `
            <input type="checkbox" ${checked ? 'checked' : ''} />
            <div style="color:#e6edf3;line-height:1.35">${escapeHtml(item)}</div>
          `;
          const cb = qs('input', row);
          cb.addEventListener('change', () => {
            saved[s.id][key] = cb.checked;
            persist();
          });
          cl.appendChild(row);
        });
      });
    }).catch(() => {
      grid.innerHTML = `<div class="tile"><h3>Brak danych systemów</h3><p>Nie udało się wczytać data/systems.json</p></div>`;
    });
  }

  function cssEscape(v) {
    try { return CSS.escape(v); } catch { return v.replace(/[^a-z0-9_-]/gi, '_'); }
  }

  // -----------------------------
  // AI Chat (offline KB matching)
  // -----------------------------
  const CHAT_STORAGE = 'aio_chat_history_v1';

  function initAIChatFinal() {
    const fab = qs('#ai-chat-fab');
    const drawer = qs('#ai-chat-drawer');
    const closeBtn = qs('#ai-chat-close');
    const backdrop = qs('#ai-chat-backdrop');
    const messages = qs('#aiChatMessages');
    const form = qs('#aiChatForm');
    const input = qs('#aiChatInput');

    if (!fab || !drawer || !messages || !form || !input) return;

    let kb = [];
    let history = [];

    try {
      history = JSON.parse(localStorage.getItem(CHAT_STORAGE) || '[]');
      if (!Array.isArray(history)) history = [];
    } catch { history = []; }

    fetchJSON(KB_PATH).then((items)=>{ kb = Array.isArray(items) ? items : []; }).catch(()=>{ kb = []; });

    if (fab.dataset.boundFinal === '1') return;
    fab.dataset.boundFinal = '1';

    let lastTouch = 0;

    const open = () => {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      drawer.style.display = 'block';
      setNoScroll(true);
      renderHistory();
      setTimeout(() => input.focus(), 60);
    };
    const close = () => {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.style.display = 'none';
      setNoScroll(false);
    };

    fab.addEventListener('touchend', (e) => { lastTouch = Date.now(); e.preventDefault(); e.stopPropagation(); open(); }, { passive:false });
    fab.addEventListener('click', (e) => { if (Date.now()-lastTouch<650) return; e.preventDefault(); open(); });

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    // Chips
    qsa('.ai-chat__chips .chip', drawer).forEach((b) => {
      b.addEventListener('click', () => {
        const q = b.getAttribute('data-chip') || b.textContent || '';
        input.value = q;
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    });

    function addMsg(role, text) {
      history.push({ role, text, ts: Date.now() });
      history = history.slice(-40);
      localStorage.setItem(CHAT_STORAGE, JSON.stringify(history));
      renderHistory();
      messages.scrollTop = messages.scrollHeight;
    }

    function renderHistory() {
      messages.innerHTML = '';
      if (!history.length) {
        const w = document.createElement('div');
        w.className = 'msg';
        w.innerHTML = `<div class="meta">Wskazówka</div>Wpisz pytanie (np. „jak zainstalować softcam feed?”) lub użyj przycisków powyżej.`;
        messages.appendChild(w);
        return;
      }
      history.forEach((m) => {
        const el = document.createElement('div');
        el.className = 'msg' + (m.role === 'user' ? ' user' : '');
        el.innerHTML = `<div class="meta">${m.role === 'user' ? 'Ty' : 'AI'}</div>${formatChat(m.text)}`;
        messages.appendChild(el);
      });
    }

    function formatChat(text) {
      const t = safeText(text);
      // code blocks from lines starting with $ or commands
      const lines = t.split('\n');
      const hasCmd = lines.some(l => l.trim().startsWith('opkg') || l.trim().startsWith('wget') || l.trim().startsWith('init ') || l.trim().startsWith('passwd'));
      if (hasCmd) {
        return `<pre><code>${escapeHtml(t)}</code></pre>`;
      }
      return `<div style="line-height:1.45">${escapeHtml(t).replaceAll('\n','<br>')}</div>`;
    }

    function bestMatch(question) {
      const q = question.toLowerCase();
      let best = null;
      let score = 0;

      for (const item of kb) {
        const hay = [
          item.title, item.summary,
          ...(item.tags || []),
          ...(item.content || []),
          ...((item.commands || []).map(c => c.cmd)),
          ...((item.notes || []))
        ].map(safeText).join(' ').toLowerCase();

        let s = 0;
        // simple scoring: keywords overlap
        const tokens = q.split(/[\s,.;:!?()]+/).filter(Boolean).slice(0, 12);
        for (const tok of tokens) {
          if (tok.length < 3) continue;
          if (hay.includes(tok)) s += 2;
        }
        // tag boost
        for (const tag of (item.tags || [])) {
          if (q.includes(String(tag).toLowerCase())) s += 4;
        }

        if (s > score) { score = s; best = item; }
      }
      return { best, score };
    }

    function buildAnswer(item) {
      if (!item) return "Nie mam tego w lokalnej bazie. Spróbuj: „softcam feed”, „picony ServiceRef”, „restart GUI”, „OSCam sprawdzenie”.";
      const parts = [];
      parts.push(item.title);
      if (item.summary) parts.push(item.summary);
      if (Array.isArray(item.content) && item.content.length) parts.push(item.content.join('\n'));
      if (Array.isArray(item.commands) && item.commands.length) {
        parts.push('Komendy:');
        item.commands.forEach(c => parts.push(`- ${c.label}: ${c.cmd}`));
      }
      if (Array.isArray(item.notes) && item.notes.length) {
        parts.push('Uwagi:');
        item.notes.forEach(n => parts.push(`- ${n}`));
      }
      return parts.join('\n');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = safeText(input.value).trim();
      if (!q) return;

      input.value = '';
      addMsg('user', q);

      // optimistic placeholder
      addMsg('ai', 'Przetwarzam…');

      const setLastAI = (txt) => {
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i] && history[i].role === 'ai') {
            history[i].text = safeText(txt);
            break;
          }
        }
        localStorage.setItem(CHAT_STORAGE, JSON.stringify(history.slice(-40)));
        renderHistory();
        messages.scrollTop = messages.scrollHeight;
      };

      try {
        const cfg = getAIConfig();
        if (cfg.enabled) {
          const payload = {
            mode: 'chat',
            message: q,
            history: history.slice(-20).map(x => ({ role: x.role, text: x.text }))
          };
          const data = await callSupabaseAI(payload);
          const reply = safeText(data.reply || data.text || data.message || '');
          setLastAI(reply || 'Brak odpowiedzi z AI.');
          return;
        }
      } catch (err) {
        // fall through to offline
      }

      // Offline fallback (KB match)
      const { best, score } = bestMatch(q);
      const answer = (score >= 3)
        ? buildAnswer(best)
        : "Nie znam jeszcze odpowiedzi w trybie offline. Spróbuj użyć słów kluczowych: „picony ServiceRef”, „softcam feed OpenATV”, „init 4 init 3”.

Jeśli chcesz prawdziwe AI, skonfiguruj Supabase Edge Function (opis w README).";
      setLastAI(answer);
    });

    // ESC close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (drawer.classList.contains('open') || drawer.style.display === 'block')) close();
    });
  }

  // -----------------------------
  // PWA registration
  // -----------------------------
  function initPWA() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // -----------------------------
  

  // -----------------------------
  // Log Analyzer (paste log -> identify -> hints / fixes)
  // -----------------------------
  function escapeHtml(s){
    return safeText(s).replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function formatBlock(text){
    // lightweight formatting (code fence if looks like log)
    const t = safeText(text).trim();
    const lines = t.split(/\r?\n/);
    const short = lines.length <= 2 && t.length < 220;
    if (short) return `<p>${escapeHtml(t)}</p>`;
    return `<pre class="mono">${escapeHtml(t)}</pre>`;
  }

  function analyzeLogOffline(raw){
    const text = safeText(raw);
    const lower = text.toLowerCase();

    const findings = [];
    let kind = 'Nieznany log';
    let cause = '';
    const steps = [];

    const add = (t)=>{ if(t) findings.push(t); };

    // Crashlog / Python traceback
    if (lower.includes('traceback (most recent call last)') || lower.includes('enigma2 crashed')) {
      kind = 'Crashlog Enigma2 (Python/GUI)';
      add('Wykryto „Traceback” lub frazę „enigma2 crashed”.');
      const m1 = text.match(/File "([^"]+)".*?line (\d+)/i);
      if (m1) add(`Podejrzany plik: ${m1[1]} (linia ${m1[2]}).`);
      if (lower.includes('no module named')) {
        const mm = text.match(/No module named ([A-Za-z0-9_\.]+)/i);
        cause = mm ? `Brak modułu Python: ${mm[1]}` : 'Brak modułu Python (No module named).';
        steps.push('Zaktualizuj listę pakietów: `opkg update`.');
        steps.push('Doinstaluj brakujący moduł (jeśli znasz nazwę pakietu).');
        steps.push('Jeśli błąd dotyczy wtyczki — odinstaluj ją i zainstaluj ponownie.');
      } else if (lower.includes('skin error') || lower.includes('skin')) {
        cause = 'Błąd skina lub brak zasobu w skinie.';
        steps.push('Przełącz skin na domyślny (np. MetrixHD / DefaultHD) i zrestartuj GUI.');
        steps.push('Zaktualizuj lub przeinstaluj skin / komponenty zależne.');
      } else if (lower.includes('segmentation fault')) {
        cause = 'Segmentation fault (problem binarny / sterownik / konflikt).';
        steps.push('Zrestartuj GUI i sprawdź, czy problem się powtarza.');
        steps.push('Zaktualizuj image do najnowszej wersji i sterowniki tunerów.');
        steps.push('Wyłącz problematyczne wtyczki (szczególnie IPTV/players) i testuj po kolei.');
      } else {
        cause = 'Ogólny crash GUI — potrzebne są szczegóły (wtyczka/skin/sterownik).';
        steps.push('Sprawdź ostatnio instalowane wtyczki i odinstaluj podejrzane.');
        steps.push('Zrób restart GUI: `init 4 && sleep 2 && init 3`.');
        steps.push('Wklej więcej fragmentu logu (początek Traceback + ostatnie 30 linii).');
      }
    }

    // OSCam
    if (lower.includes('oscam') && (lower.includes('reader') || lower.includes('emm') || lower.includes('ecm'))) {
      kind = (kind === 'Nieznany log') ? 'Log OSCam' : kind;
      add('W logu widać wpisy charakterystyczne dla OSCam (ECM/EMM/Reader).');
      if (lower.includes('not found') || lower.includes('unknown')) {
        steps.push('Sprawdź konfigurację: `oscam.server`, `oscam.user`, `oscam.conf`.');
      }
      if (lower.includes('rejected') || lower.includes('invalid')) {
        steps.push('Sprawdź dane użytkownika/hasło oraz protokół (CCcam/newcamd).');
      }
    }

    // opkg / install
    if (lower.includes('opkg') || lower.includes('collected errors') || lower.includes('unknown package')) {
      kind = (kind === 'Nieznany log') ? 'Log instalacji (opkg)' : kind;
      add('Wykryto log z opkg (instalacja/aktualizacja pakietów).');
      if (lower.includes('unknown package')) {
        cause = cause || 'Pakiet nie istnieje w feedzie.';
        steps.push('Sprawdź, czy masz poprawny feed dla image (OpenATV/OpenPLi).');
        steps.push('Zrób `opkg update` i spróbuj ponownie.');
      }
      if (lower.includes('depends on')) {
        cause = cause || 'Brak zależności pakietu.';
        steps.push('Zainstaluj brakujące zależności lub użyj pełnego feedu.');
      }
    }

    if (!cause) cause = 'Brak jednoznacznej przyczyny — potrzebne są dodatkowe linie kontekstu.';
    if (!steps.length) {
      steps.push('Wklej pełniejszy fragment logu (początek + koniec).');
      steps.push('Podaj: image (OpenATV/OpenPLi/Egami), model tunera, ostatnio instalowane wtyczki.');
    }

    return { kind, findings, cause, steps };
  }

  function renderOfflineAnalysis(result){
    const { kind, findings, cause, steps } = result;
    const list = (arr)=> arr.map(x=>`<li>${escapeHtml(x)}</li>`).join('');
    return `
      <div class="log-result__section">
        <div class="log-result__title">Wykryto</div>
        <div class="log-result__pill">${escapeHtml(kind)}</div>
      </div>
      <div class="log-result__section">
        <div class="log-result__title">Co zawiera log</div>
        <ul class="log-result__list">${list(findings.length?findings:['Nie udało się jednoznacznie sklasyfikować logu.'])}</ul>
      </div>
      <div class="log-result__section">
        <div class="log-result__title">Najbardziej prawdopodobna przyczyna</div>
        <div class="log-result__text">${escapeHtml(cause)}</div>
      </div>
      <div class="log-result__section">
        <div class="log-result__title">Proponowane kroki</div>
        <ol class="log-result__list">${list(steps).replace(/<ul/,'<ol').replace(/<\/ul>/,'</ol>')}</ol>
      </div>
    `;
  }

  function initLogAnalyzerFinal(){
    const drawer = qs('#log-analyzer-drawer');
    const openBtns = qsa('.js-open-log');
    const closeBtn = qs('#log-drawer-close');
    const backdrop = qs('#log-drawer-backdrop');
    const input = qs('#log-input');
    const analyzeBtn = qs('#log-analyze-btn');
    const clearBtn = qs('#log-clear-btn');
    const resultEl = qs('#log-result');

    if (!drawer || !input || !analyzeBtn || !resultEl) return;

    const open = () => {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden','false');
      setNoScroll(true);
      setTimeout(()=>input.focus(), 80);
    };
    const close = () => {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden','true');
      setNoScroll(false);
    };

    openBtns.forEach((b)=>{
      b.addEventListener('click',(e)=>{ e.preventDefault(); open(); });
      b.addEventListener('touchend',(e)=>{ e.preventDefault(); e.stopPropagation(); open(); }, {passive:false});
    });

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);

    if (clearBtn) clearBtn.addEventListener('click', ()=>{
      input.value = '';
      resultEl.innerHTML = '<div class="log-result__empty">Wynik analizy pojawi się tutaj.</div>';
      input.focus();
    });

    analyzeBtn.addEventListener('click', async ()=>{
      const raw = safeText(input.value).trim();
      if (!raw) return;
      resultEl.innerHTML = '<div class="log-result__empty">Analizuję…</div>';

      try {
        const cfg = getAIConfig();
        if (cfg.enabled) {
          const data = await callSupabaseAI({
            mode: 'log',
            log: clipText(raw, 12000)
          });
          const reply = safeText(data.reply || data.text || data.message || '');
          resultEl.innerHTML = reply ? formatBlock(reply) : '<div class="log-result__empty">Brak odpowiedzi z AI.</div>';
          return;
        }
      } catch (e) {
        // fall back
      }

      const offline = analyzeLogOffline(raw);
      resultEl.innerHTML = renderOfflineAnalysis(offline);
    });

    // ESC close
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && drawer.classList.contains('open')) close(); });
  }

// Boot
  // -----------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initSupportDrawerFinal();
    initMobileNavFinal();
    initNotificationsFinal();
    initKnowledgeBaseFinal();
    initToolsFinal();
    initSystemsFinal();
    initAIChatFinal();
    initLogAnalyzerFinal();
    initPWA();
  });
})();
