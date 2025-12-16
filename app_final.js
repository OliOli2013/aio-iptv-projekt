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

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = safeText(input.value).trim();
      if (!q) return;
      input.value = '';
      addMsg('user', q);

      const { best, score } = bestMatch(q);
      const answer = (score >= 3) ? buildAnswer(best) : "Nie znalazłem dopasowania w lokalnej bazie. Spróbuj bardziej konkretnie: „picony ServiceRef”, „softcam feed OpenATV”, „init 4 init 3”.";
      addMsg('ai', answer);
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
    initPWA();
  });
})();
