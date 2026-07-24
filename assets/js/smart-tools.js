/* AIO-IPTV Smart Tools 2026-07-24 */
(function () {
  'use strict';

  const PROFILE_KEY = 'aio_tuner_profile_v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener('DOMContentLoaded', () => {
    initSmartNavigation();
    initProfileForm();
    initRecommendationAssistant();
    initStatusDashboard();
    initQrStudio();
    initGlobalQrButtons();
    initLogAnalyzer();
  });

  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function readProfile() {
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (error) {
      return {};
    }
  }

  function saveProfile(profile) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() })); }
    catch (error) { /* localStorage may be blocked */ }
    document.dispatchEvent(new CustomEvent('aio:profile-updated', { detail: profile }));
  }

  function initSmartNavigation() {
    const utility = $('.pro-utility-links');
    if (utility && !utility.querySelector('a[href="assistant.html"]')) {
      utility.insertAdjacentHTML('afterbegin', [
        '<a href="assistant.html">🧭 Asystent doboru</a>',
        '<a href="my-tuner.html">📡 Mój tuner</a>',
        '<a href="status.html">🟢 Status</a>',
        '<a href="qr-install.html">▦ QR instalacji</a>',
        '<a href="log-analyzer.html">🔎 Analizator logów</a>',
        '<a href="studio.html">🧰 Studio</a>'
      ].join(''));
    }

    const profile = readProfile();
    const actions = $('.pro-utility-actions');
    if (actions && !actions.querySelector('.profile-mini-link')) {
      const link = document.createElement('a');
      link.className = 'profile-mini-link';
      link.href = 'my-tuner.html';
      link.textContent = profile.model ? `📡 ${profile.model}` : '📡 Ustaw mój tuner';
      actions.prepend(link);
      document.addEventListener('aio:profile-updated', event => {
        link.textContent = event.detail?.model ? `📡 ${event.detail.model}` : '📡 Ustaw mój tuner';
      });
    }
  }

  async function loadTuners() {
    try {
      const response = await fetch('data/tuners.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      return Array.isArray(data) ? data : (data.tuners || []);
    } catch (error) {
      return [];
    }
  }

  async function populateTunerSelect(select, selectedValue) {
    if (!select) return;
    const tuners = await loadTuners();
    const groups = new Map();
    tuners.forEach(tuner => {
      const brand = tuner.brand || 'Inne';
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand).push(tuner);
    });
    Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'pl')).forEach(brand => {
      const group = document.createElement('optgroup');
      group.label = brand;
      groups.get(brand).sort((a, b) => String(a.model).localeCompare(String(b.model), 'pl')).forEach(tuner => {
        const option = document.createElement('option');
        option.value = `${tuner.brand} ${tuner.model}`.trim();
        option.textContent = option.value;
        option.dataset.tunerId = tuner.id || '';
        option.dataset.cpu = tuner.cpu || '';
        option.dataset.ram = tuner.ram || '';
        option.dataset.flash = tuner.flash || '';
        option.dataset.resolution = tuner.resolution || '';
        if (selectedValue && option.value === selectedValue) option.selected = true;
        group.appendChild(option);
      });
      select.appendChild(group);
    });
    if (selectedValue && !Array.from(select.options).some(option => option.value === selectedValue)) {
      const custom = document.createElement('option');
      custom.value = selectedValue;
      custom.textContent = selectedValue;
      custom.selected = true;
      select.appendChild(custom);
    }
  }

  function profileFromForm(form) {
    const data = new FormData(form);
    return {
      model: String(data.get('model') || '').trim(),
      system: String(data.get('system') || '').trim(),
      systemVersion: String(data.get('systemVersion') || '').trim(),
      python: String(data.get('python') || '').trim(),
      satellites: String(data.get('satellites') || '').trim(),
      connection: String(data.get('connection') || '').trim()
    };
  }

  function fillProfileForm(form, profile) {
    Object.entries(profile || {}).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field && value != null) field.value = value;
    });
  }

  function renderProfileSummary(target, profile) {
    if (!target) return;
    const entries = [
      ['Tuner', profile.model || 'nie ustawiono'],
      ['System', [profile.system, profile.systemVersion].filter(Boolean).join(' ') || 'nie ustawiono'],
      ['Python', profile.python || 'nie ustawiono'],
      ['Satelity', profile.satellites || 'nie ustawiono'],
      ['Połączenie', profile.connection || 'nie ustawiono']
    ];
    target.innerHTML = entries.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }

  async function initProfileForm() {
    const form = $('#tunerProfileForm');
    if (!form) return;
    const profile = readProfile();
    const select = form.elements.namedItem('model');
    await populateTunerSelect(select, profile.model);
    fillProfileForm(form, profile);
    renderProfileSummary($('#profileSummary'), profile);

    select?.addEventListener('change', () => {
      const option = select.selectedOptions[0];
      const hardware = $('#profileHardware');
      if (!hardware || !option) return;
      const rows = [
        ['Procesor', option.dataset.cpu],
        ['RAM', option.dataset.ram],
        ['Flash', option.dataset.flash],
        ['Obraz', option.dataset.resolution]
      ].filter(([, value]) => value);
      hardware.innerHTML = rows.length ? rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('') : '<p>Brak dodatkowych danych dla wybranego modelu.</p>';
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const updated = profileFromForm(form);
      saveProfile(updated);
      renderProfileSummary($('#profileSummary'), updated);
      const status = $('#profileSaveStatus');
      if (status) {
        status.textContent = 'Profil został zapisany lokalnie w tej przeglądarce.';
        setTimeout(() => { status.textContent = ''; }, 3500);
      }
    });

    $('#profileReset')?.addEventListener('click', () => {
      try { localStorage.removeItem(PROFILE_KEY); } catch (error) {}
      form.reset();
      renderProfileSummary($('#profileSummary'), {});
      document.dispatchEvent(new CustomEvent('aio:profile-updated', { detail: {} }));
    });
  }

  const PROJECTS = {
    aio: {
      title: 'AIO Panel 14.0.1', url: 'plugin-aio-panel.html', kind: 'Wtyczka Enigma2', python: ['2', '3'], icon: '🧩',
      summary: 'Listy kanałów, picony, Softcam, OSCam, narzędzia i Super Konfigurator.'
    },
    doctor: {
      title: 'E2 Doctor 2.3', url: 'plugin-e2-doctor.html', kind: 'Diagnostyka', python: ['3'], icon: '🩺',
      summary: 'Kontrola kondycji tunera i naprawy powiązane z wykrytym problemem.'
    },
    sync: {
      title: 'PP Channel Sync 2.1.1', url: 'plugin-pp-channel-sync.html', kind: 'Listy kanałów', python: ['2', '3'], icon: '📡',
      summary: 'Synchronizacja kanałów bez utraty kolejności i własnego układu bukietów.'
    },
    iptv: {
      title: 'IPTV Dream 7.0.0', url: 'plugin-iptv-dream.html', kind: 'IPTV', python: ['3'], icon: '📺',
      summary: 'M3U, Xtream Codes, portale MAC, EPG, picony i eksport bukietów.'
    },
    remote: {
      title: 'AIO Panel Remote 1.4.6', url: 'app-aio-panel-remote.html', kind: 'Android', python: ['2', '3'], icon: '📱',
      summary: 'Pilot, EPG, listy kanałów, picony i streaming przez LAN, ZeroTier lub VPN.'
    },
    cambridge: {
      title: 'CamBridge PL', url: 'app-cambridge-android.html', kind: 'Android / Windows', python: ['2', '3'], icon: '🔐',
      summary: 'Offline konwerter linii CCcam do konfiguracji OSCam lub NCam.'
    },
    systems: {
      title: 'Systemy Multi-Click', url: 'systems.html', kind: 'Systemy', python: ['2', '3'], icon: '💿',
      summary: 'Gotowe systemy z instrukcjami instalacji dopasowanymi do modeli tunerów.'
    },
    lists: {
      title: 'Aktualne listy kanałów', url: 'channel-lists.html', kind: 'Listy', python: ['2', '3'], icon: '🗂️',
      summary: 'Listy satelitarne i IPTV pobierane z aktualnego manifestu.'
    },
    qr: {
      title: 'QR instalacji', url: 'qr-install.html', kind: 'Narzędzie', python: ['2', '3'], icon: '▦',
      summary: 'Przenieś link lub komendę instalacyjną na telefon za pomocą kodu QR.'
    },
    analyzer: {
      title: 'Analizator logów', url: 'log-analyzer.html', kind: 'Narzędzie', python: ['2', '3'], icon: '🔎',
      summary: 'Lokalna analiza crashlogów, błędów instalacji, sieci i zgodności Pythona.'
    }
  };

  const GOAL_MAP = {
    aio: ['aio'],
    diagnostics: ['doctor', 'analyzer'],
    channels: ['sync', 'lists', 'aio'],
    iptv: ['iptv', 'aio'],
    remote: ['remote'],
    oscam: ['cambridge', 'aio'],
    system: ['systems'],
    picons: ['aio', 'lists'],
    unknown: ['aio', 'doctor', 'analyzer']
  };

  async function initRecommendationAssistant() {
    const form = $('#assistantForm');
    if (!form) return;
    const profile = readProfile();
    const modelSelect = form.elements.namedItem('model');
    await populateTunerSelect(modelSelect, profile.model);
    fillProfileForm(form, profile);

    $('#assistantUseProfile')?.addEventListener('click', () => fillProfileForm(form, readProfile()));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = profileFromForm(form);
      data.goal = String(new FormData(form).get('goal') || 'unknown');
      if ($('#assistantSaveProfile')?.checked) saveProfile(data);
      renderRecommendations(data);
    });

    if (profile.model || profile.system || profile.python) renderRecommendations({ ...profile, goal: 'unknown' });
  }

  function pythonNumber(value) {
    const normalized = normalize(value);
    if (/python\s*2|\bpy2\b|^2$/.test(normalized)) return '2';
    if (/python\s*3|\bpy3\b|^3$/.test(normalized)) return '3';
    return '';
  }

  function renderRecommendations(data) {
    const output = $('#assistantResults');
    if (!output) return;
    const keys = GOAL_MAP[data.goal] || GOAL_MAP.unknown;
    const selectedPython = pythonNumber(data.python);
    const model = data.model || 'wybrany tuner';
    const system = [data.system, data.systemVersion].filter(Boolean).join(' ') || 'wybrany system';
    const cards = keys.map((key, index) => {
      const project = PROJECTS[key];
      const compatible = !selectedPython || project.python.includes(selectedPython);
      const badge = compatible ? (index === 0 ? 'NAJLEPSZY WYBÓR' : 'ZGODNE') : 'UWAGA';
      const reason = compatible
        ? `Pasuje do profilu: ${model}, ${system}${selectedPython ? `, Python ${selectedPython}` : ''}.`
        : `Projekt wymaga Python ${project.python.join(' lub ')}, a w profilu wybrano Python ${selectedPython}.`;
      return `<article class="recommend-card ${compatible ? '' : 'is-warning'}">
        <div class="recommend-icon">${project.icon}</div>
        <div><span class="recommend-badge">${badge}</span><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.summary)}</p><small>${escapeHtml(reason)}</small><div class="recommend-actions"><a class="button ${index === 0 && compatible ? 'primary' : ''}" href="${escapeHtml(project.url)}">Otwórz projekt</a><button class="button qr-recommend" type="button" data-qr-text="${escapeHtml(new URL(project.url, location.href).href)}" data-qr-label="${escapeHtml(project.title)}">QR</button></div></div>
      </article>`;
    });
    output.innerHTML = `<div class="assistant-result-head"><div><p class="eyebrow">Wynik doboru</p><h2>Rekomendacje dla Twojego profilu</h2></div><a href="my-tuner.html">Edytuj profil tunera →</a></div><div class="recommend-grid">${cards.join('')}</div>`;
    output.hidden = false;
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });
    initInlineQrButtons(output);
  }

  async function initStatusDashboard() {
    const container = $('#statusDashboard');
    if (!container) return;
    const updated = $('#statusUpdated');
    const summary = $('#statusSummary');
    const filter = $('#statusFilter');
    let payload;
    try {
      const response = await fetch('data/status.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      payload = await response.json();
    } catch (error) {
      payload = { generatedAt: '', items: [] };
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (updated) updated.textContent = payload.generatedAt ? new Date(payload.generatedAt).toLocaleString('pl-PL') : 'oczekuje na pierwszy test GitHub Actions';

    function render() {
      const category = filter?.value || '';
      const visible = items.filter(item => !category || item.category === category);
      const counts = visible.reduce((acc, item) => {
        const key = item.status || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      if (summary) summary.innerHTML = [
        ['online', 'Działa', counts.online || 0],
        ['warning', 'Ostrzeżenie', counts.warning || 0],
        ['offline', 'Niedostępne', counts.offline || 0],
        ['unknown', 'Oczekuje', counts.unknown || 0]
      ].map(([status, label, count]) => `<div class="status-summary ${status}"><strong>${count}</strong><span>${label}</span></div>`).join('');
      container.innerHTML = visible.map(item => {
        const status = item.status || 'unknown';
        const statusLabel = { online: 'DZIAŁA', warning: 'OSTRZEŻENIE', offline: 'NIEDOSTĘPNE', unknown: 'OCZEKUJE' }[status] || 'OCZEKUJE';
        return `<article class="service-card status-${status}">
          <div class="service-dot" aria-hidden="true"></div>
          <div><span class="service-category">${escapeHtml(item.category || 'Usługa')}</span><h3>${escapeHtml(item.name || item.id)}</h3><p>${escapeHtml(item.message || 'Brak danych z testu.')}</p><small>${item.checkedAt ? `Test: ${escapeHtml(new Date(item.checkedAt).toLocaleString('pl-PL'))}` : 'Test zostanie wykonany automatycznie.'}</small></div>
          <div class="service-meta"><strong>${statusLabel}</strong>${item.httpStatus ? `<span>HTTP ${escapeHtml(item.httpStatus)}</span>` : ''}${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" data-support-bypass="true">Otwórz</a>` : ''}</div>
        </article>`;
      }).join('') || '<div class="empty-state">Brak pozycji dla wybranego filtra.</div>';
    }
    filter?.addEventListener('change', render);
    render();
  }

  let qrLibraryPromise = null;
  function loadQrLibrary() {
    if (window.QRCode) return Promise.resolve();
    if (qrLibraryPromise) return qrLibraryPromise;
    qrLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/qrcode.min.js?v=1.0.0';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Nie udało się załadować generatora QR.'));
      document.head.appendChild(script);
    });
    return qrLibraryPromise;
  }

  function drawQr(target, text, size = 280) {
    target.innerHTML = '';
    return loadQrLibrary().then(() => {
      new window.QRCode(target, {
        text,
        width: size,
        height: size,
        colorDark: '#06141c',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      target.dataset.qrText = text;
    });
  }

  async function initQrStudio() {
    const form = $('#qrForm');
    if (!form) return;
    const select = $('#qrPreset');
    const input = $('#qrText');
    const output = $('#qrOutput');
    const label = $('#qrCurrentLabel');
    try {
      const response = await fetch('data/qr-presets.json', { cache: 'no-store' });
      const presets = await response.json();
      presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.value;
        option.textContent = preset.label;
        select.appendChild(option);
      });
    } catch (error) { /* custom field still works */ }

    select?.addEventListener('change', () => {
      if (select.value) input.value = select.value;
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      try {
        await drawQr(output, text, 300);
        if (label) label.textContent = select?.selectedOptions[0]?.textContent || 'Własny kod QR';
        $('#qrResult')?.removeAttribute('hidden');
        const empty = $('#qrEmpty'); if (empty) empty.hidden = true;
      } catch (error) {
        output.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`;
      }
    });

    $('#qrCopy')?.addEventListener('click', () => copyText(input.value.trim(), $('#qrCopy')));
    $('#qrDownload')?.addEventListener('click', () => downloadQr(output, 'aio-iptv-qr.png'));
  }

  function initGlobalQrButtons() {
    initInlineQrButtons(document);
    decorateDownloadLinks(document);
    ensureQrModal();
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        initInlineQrButtons(node);
        decorateDownloadLinks(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function decorateDownloadLinks(root) {
    const selector = 'a[href*=".ipk"],a[href*=".apk"],a[href*=".exe"],a[href*=".zip"],a[href*=".pdf"],a[href*="id_attachment="]';
    $$(selector, root).forEach(anchor => {
      if (anchor.dataset.qrDecorated === 'true' || anchor.closest('.support-gate-modal') || anchor.closest('.qr-global-modal')) return;
      if (anchor.closest('a') !== anchor || anchor.parentElement?.tagName === 'A') return;
      anchor.dataset.qrDecorated = 'true';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inline-qr-button download-qr-button';
      button.textContent = 'QR';
      button.setAttribute('aria-label', 'Pokaż kod QR dla tego pobrania');
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const label = (anchor.textContent || 'Pobieranie').replace(/\s+/g, ' ').trim();
        openQrModal(anchor.href, label);
      });
      anchor.insertAdjacentElement('afterend', button);
    });
  }

  function initInlineQrButtons(root) {
    $$('[data-qr-text]', root).forEach(button => {
      if (button.dataset.qrReady === 'true') return;
      button.dataset.qrReady = 'true';
      button.addEventListener('click', event => {
        event.preventDefault();
        openQrModal(button.dataset.qrText, button.dataset.qrLabel || 'Kod QR');
      });
    });

    $$('[data-copy]', root).forEach(copyButton => {
      if (copyButton.parentElement?.querySelector('.inline-qr-button')) return;
      const qrButton = document.createElement('button');
      qrButton.type = 'button';
      qrButton.className = 'inline-qr-button';
      qrButton.textContent = 'QR';
      qrButton.setAttribute('aria-label', 'Pokaż kod QR dla tej komendy');
      qrButton.addEventListener('click', () => openQrModal(copyButton.getAttribute('data-copy') || '', 'Komenda instalacyjna'));
      copyButton.insertAdjacentElement('afterend', qrButton);
    });
  }

  function ensureQrModal() {
    if ($('#globalQrModal')) return;
    const modal = document.createElement('div');
    modal.id = 'globalQrModal';
    modal.className = 'qr-global-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<div class="qr-global-backdrop" data-qr-close></div><section class="qr-global-dialog" role="dialog" aria-modal="true" aria-labelledby="globalQrTitle"><button type="button" class="qr-global-x" data-qr-close aria-label="Zamknij">×</button><p class="eyebrow">Skanuj telefonem</p><h2 id="globalQrTitle">Kod QR</h2><div id="globalQrCanvas" class="qr-canvas"></div><p id="globalQrText" class="qr-text-preview"></p><div class="action-row"><button type="button" class="button primary" id="globalQrDownload">Pobierz PNG</button><button type="button" class="button" id="globalQrCopy">Kopiuj treść</button><button type="button" class="button" data-qr-close>Zamknij</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-qr-close]').forEach(element => element.addEventListener('click', closeQrModal));
    modal.addEventListener('click', event => { if (event.target.classList.contains('qr-global-backdrop')) closeQrModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('is-open')) closeQrModal(); });
    $('#globalQrDownload')?.addEventListener('click', () => downloadQr($('#globalQrCanvas'), 'aio-iptv-qr.png'));
    $('#globalQrCopy')?.addEventListener('click', () => copyText($('#globalQrCanvas')?.dataset.qrText || '', $('#globalQrCopy')));
  }

  function openQrModal(text, title) {
    if (!text) return;
    ensureQrModal();
    const modal = $('#globalQrModal');
    $('#globalQrTitle').textContent = title || 'Kod QR';
    $('#globalQrText').textContent = text.length > 180 ? `${text.slice(0, 177)}…` : text;
    drawQr($('#globalQrCanvas'), text, 280).then(() => {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('qr-modal-open');
      modal.querySelector('[data-qr-close]')?.focus();
    }).catch(error => alert(error.message));
  }

  function closeQrModal() {
    const modal = $('#globalQrModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('qr-modal-open');
  }

  function downloadQr(target, filename) {
    const canvas = target?.querySelector('canvas');
    const image = target?.querySelector('img');
    const source = canvas?.toDataURL('image/png') || image?.src;
    if (!source) return;
    const link = document.createElement('a');
    link.href = source;
    link.download = filename;
    link.dataset.supportBypass = 'true';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function copyText(text, button) {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    if (button) {
      const original = button.textContent;
      button.textContent = 'Skopiowano ✓';
      setTimeout(() => { button.textContent = original; }, 1500);
    }
  }

  const LOG_RULES = [
    { id: 'space', severity: 'critical', title: 'Brak wolnego miejsca', regex: /no space left on device|errno\s*28|enospc|write error.*space/i, advice: 'Usuń zbędne paczki i crashlogi, sprawdź /tmp oraz wolne miejsce we flashu. Przed kasowaniem wykonaj kopię ustawień.', command: 'df -h && du -h /usr/lib/enigma2/python/Plugins 2>/dev/null | sort -h | tail -20' },
    { id: 'memory', severity: 'critical', title: 'Brak pamięci RAM / OOM', regex: /out of memory|oom-killer|cannot allocate memory|memoryerror/i, advice: 'Zamknij ciężkie procesy, wyłącz zbędne wtyczki startowe i sprawdź użycie RAM oraz SWAP.', command: 'free -m && ps aux --sort=-%mem | head -15' },
    { id: 'module', severity: 'high', title: 'Brak modułu Pythona', regex: /modulenotfounderror|no module named|importerror:\s*cannot import/i, advice: 'Sprawdź zgodność Python 2/3 i doinstaluj brakującą zależność z feedu systemu. Nie instaluj losowych paczek z innego obrazu.', command: 'python --version 2>&1; python3 --version 2>&1' },
    { id: 'syntax', severity: 'high', title: 'Błąd składni lub niezgodna wersja Pythona', regex: /syntaxerror|invalid syntax|missing parentheses in call to ['"]print/i, advice: 'Plik może być przygotowany dla innej wersji Pythona. Zainstaluj wydanie zgodne z obrazem tunera.', command: 'python --version 2>&1; python3 --version 2>&1' },
    { id: 'permission', severity: 'high', title: 'Brak uprawnień', regex: /permission denied|errno\s*13|eacces/i, advice: 'Sprawdź właściciela i prawa pliku. Skrypty instalacyjne zwykle wymagają chmod 755.', command: 'ls -la /usr/lib/enigma2/python/Plugins/Extensions' },
    { id: 'readonly', severity: 'critical', title: 'System plików tylko do odczytu', regex: /read-only file system|erofs/i, advice: 'Nie wymuszaj zapisu. Wykonaj kopię danych i sprawdź stan nośnika lub obraz systemu.', command: 'mount | grep " / " && dmesg | tail -80' },
    { id: 'opkg', severity: 'high', title: 'Błąd OPKG / instalacji pakietu', regex: /collected errors|opkg_install_cmd|cannot satisfy the following dependencies|package architecture incompatible|md5sum mismatch/i, advice: 'Odśwież feed, sprawdź architekturę tunera i usuń niedokończony pakiet przed ponowną instalacją.', command: 'opkg update && opkg list-installed | tail -30' },
    { id: 'network', severity: 'medium', title: 'Problem z siecią lub DNS', regex: /name or service not known|temporary failure in name resolution|network is unreachable|connection refused|nodename nor servname/i, advice: 'Sprawdź adres IP, bramę, DNS i dostęp do internetu z tunera.', command: 'ip addr; ip route; ping -c 3 1.1.1.1; ping -c 3 github.com' },
    { id: 'timeout', severity: 'medium', title: 'Przekroczony czas połączenia', regex: /timed out|timeout|readtimeout|connecttimeout|operation timed out/i, advice: 'Serwer może odpowiadać zbyt wolno. Sprawdź połączenie, URL oraz spróbuj ponownie po kilku minutach.', command: 'wget -S --spider "ADRES_URL" 2>&1 | head -40' },
    { id: 'remote', severity: 'medium', title: 'Zerwane połączenie z serwerem', regex: /remotedisconnected|remote end closed connection|connection reset by peer|broken pipe/i, advice: 'Serwer przerwał sesję. Zweryfikuj dane dostępu, limit połączeń i dostępność usługi u dostawcy.', command: '' },
    { id: 'ssl', severity: 'medium', title: 'Błąd certyfikatu SSL', regex: /certificate verify failed|sslerror|tlsv1|wrong version number/i, advice: 'Sprawdź datę systemową, pakiet certyfikatów oraz poprawność adresu HTTPS.', command: 'date; opkg list-installed | grep -E "ca-certificates|openssl"' },
    { id: 'httpauth', severity: 'medium', title: 'Odmowa dostępu HTTP', regex: /http[^\n]*(401|403)|status(?: code)?[^\n]*(401|403)|forbidden|unauthorized/i, advice: 'Sprawdź login, hasło, token, adres serwera oraz ewentualną blokadę IP.', command: '' },
    { id: 'httpnotfound', severity: 'medium', title: 'Plik lub endpoint nie istnieje', regex: /http[^\n]*404|status(?: code)?[^\n]*404|not found/i, advice: 'Adres mógł wygasnąć albo zmieniła się ścieżka po stronie serwera.', command: '' },
    { id: 'server', severity: 'medium', title: 'Błąd serwera zdalnego', regex: /http[^\n]*(500|502|503|504|884)|status(?: code)?[^\n]*(500|502|503|504|884)|bad gateway|service unavailable/i, advice: 'To zwykle problem po stronie serwera. Sprawdź usługę później lub skontaktuj się z dostawcą.', command: '' },
    { id: 'lamedb', severity: 'high', title: 'Problem z bazą kanałów lamedb', regex: /lamedb5?|malformed service reference|invalid service reference|bouquet.*corrupt|services.*corrupt/i, advice: 'Wykonaj kopię /etc/enigma2, sprawdź wpisy #SERVICE i przywróć ostatnią poprawną kopię listy.', command: 'tar -czf /tmp/enigma2-backup.tar.gz /etc/enigma2 2>/dev/null' },
    { id: 'skin', severity: 'high', title: 'Błąd skina lub definicji ekranu', regex: /skinerror|skin error|screen .* was not found|font .* not found|pixmap .* not found/i, advice: 'Przełącz na domyślny skin albo usuń wadliwy ekran/skórkę. Sprawdź ścieżki grafik i nazwy widgetów.', command: '' },
    { id: 'attribute', severity: 'high', title: 'Błąd wykonania wtyczki', regex: /attributeerror|typeerror|keyerror|indexerror|valueerror/i, advice: 'To błąd kodu lub nieobsłużonych danych. Zapisz pełny traceback i zgłoś wersję systemu, Pythona oraz wtyczki.', command: '' },
    { id: 'segfault', severity: 'critical', title: 'Awaria procesu / Segmentation fault', regex: /segmentation fault|segfault|signal 11|fatal signal/i, advice: 'Możliwy problem biblioteki binarnej, sterownika lub pamięci. Sprawdź dmesg i ostatnio instalowane komponenty.', command: 'dmesg | tail -120' },
    { id: 'twisted', severity: 'high', title: 'Problem Twisted / połączeń sieciowych', regex: /twisted\.internet|defer\.failure|connectionlost|connectiondone/i, advice: 'Zapisz pełny traceback. Sprawdź zależności Twisted, timeouty i odpowiedź serwera.', command: '' }
  ];

  function sanitizeLog(text) {
    return String(text || '')
      .replace(/(password|passwd|pwd|token|apikey|api_key|secret)(\s*[:=]\s*)([^\s,;]+)/gi, '$1$2***')
      .replace(/(https?:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, '$1***:***@')
      .replace(/(C:\s+\S+\s+\d+\s+)(\S+)(\s+)(\S+)/gi, '$1***$3***');
  }

  function initLogAnalyzer() {
    const form = $('#logAnalyzerForm');
    if (!form) return;
    const textarea = $('#logInput');
    const fileInput = $('#logFile');
    const output = $('#logResults');
    const cleanButton = $('#logSanitize');

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert('Plik jest większy niż 2 MB. Wklej najważniejszy fragment logu.');
        fileInput.value = '';
        return;
      }
      textarea.value = await file.text();
    });

    cleanButton?.addEventListener('click', () => {
      textarea.value = sanitizeLog(textarea.value);
      cleanButton.textContent = 'Dane wrażliwe zamaskowane ✓';
      setTimeout(() => { cleanButton.textContent = 'Maskuj dane wrażliwe'; }, 1800);
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text) return;
      const findings = LOG_RULES.filter(rule => rule.regex.test(text));
      const pluginPaths = Array.from(new Set((text.match(/\/usr\/lib\/enigma2\/python\/Plugins\/[^\s"']+/g) || []).map(path => path.replace(/[),:]$/, '')))).slice(0, 6);
      const traceback = /traceback \(most recent call last\):/i.test(text);
      const report = [];
      if (pluginPaths.length) report.push(`<div class="log-context"><strong>Wykryte ścieżki wtyczek</strong>${pluginPaths.map(path => `<code>${escapeHtml(path)}</code>`).join('')}</div>`);
      if (traceback) report.push('<div class="log-context"><strong>Wykryto pełny traceback Pythona</strong><span>Zachowaj wszystkie linie od „Traceback” do końcowego typu błędu.</span></div>');
      if (!findings.length) {
        report.push('<div class="empty-state"><h3>Brak jednoznacznego wzorca</h3><p>Nie oznacza to, że log jest poprawny. Do zgłoszenia dołącz model tunera, system, wersję Pythona, nazwę wtyczki i pełny fragment tracebacku.</p><a class="button" href="report-error.html">Otwórz generator zgłoszenia</a></div>');
      } else {
        report.push(`<div class="log-findings">${findings.map(rule => `<article class="log-finding severity-${rule.severity}"><div><span>${severityLabel(rule.severity)}</span><h3>${escapeHtml(rule.title)}</h3><p>${escapeHtml(rule.advice)}</p>${rule.command ? `<pre><code>${escapeHtml(rule.command)}</code></pre>` : ''}<div class="action-row"><a class="button" href="errors.html#error-${escapeHtml(rule.id)}">Otwórz w bazie błędów</a></div></div></article>`).join('')}</div>`);
      }
      const safe = sanitizeLog(text);
      output.innerHTML = `<div class="assistant-result-head"><div><p class="eyebrow">Analiza lokalna</p><h2>Wykryto ${findings.length} możliwych problemów</h2></div><span>Treść nie została wysłana na serwer</span></div>${report.join('')}<div class="action-row"><button class="button primary" type="button" id="copyLogAnalysis">Kopiuj podsumowanie</button><a class="button" href="errors.html">Baza błędów</a><a class="button" href="report-error.html">Utwórz zgłoszenie</a></div>`;
      output.hidden = false;
      $('#copyLogAnalysis')?.addEventListener('click', () => {
        const plain = findings.length
          ? findings.map(rule => `${severityLabel(rule.severity)} — ${rule.title}\n${rule.advice}${rule.command ? `\nKomenda: ${rule.command}` : ''}`).join('\n\n')
          : 'Brak jednoznacznego wzorca. Potrzebna jest ręczna analiza pełnego tracebacku.';
        copyText(`ANALIZA LOGU AIO-IPTV.pl\n\n${plain}\n\nOCZYSZCZONY FRAGMENT LOGU:\n${safe.slice(0, 8000)}`, $('#copyLogAnalysis'));
      });
      output.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function severityLabel(severity) {
    return { critical: 'KRYTYCZNE', high: 'WAŻNE', medium: 'SPRAWDŹ', low: 'INFORMACJA' }[severity] || 'SPRAWDŹ';
  }
})();
