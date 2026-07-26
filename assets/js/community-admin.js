/* Społeczność AIO — zaawansowana moderacja użytkowników, treści i IP, 2026-07-26 community5 */
(function () {
  'use strict';

  let tab = 'pending';
  let bound = false;
  let initTimer = null;
  let initSequence = 0;

  function boot() {
    if (!window.AIOCommunity) return;
    document.addEventListener('aio-community-ready', scheduleInit);
    document.addEventListener('aio-community-auth', scheduleInit);
    if (AIOCommunity.ready) scheduleInit();
  }

  function scheduleInit() {
    window.clearTimeout(initTimer);
    initTimer = window.setTimeout(init, 50);
  }

  async function init() {
    const root = document.querySelector('[data-community-admin]');
    if (!root || !window.AIOCommunity) return;
    const sequence = ++initSequence;
    if (!AIOCommunity.user) {
      root.innerHTML = '<div class="community-empty"><strong>Zaloguj się jako administrator lub moderator.</strong><p>Panel moderacji nie jest dostępny publicznie.</p><button class="button primary" data-community-login>Zaloguj się</button></div>';
      return;
    }
    root.innerHTML = '<div class="community-loading">Sprawdzam uprawnienia konta…</div>';
    try {
      await AIOCommunity.ensureProfile();
      if (sequence !== initSequence) return;
      AIOCommunity.renderAccountBars();
      const role = String(AIOCommunity.profile && AIOCommunity.profile.role || '').toLowerCase();
      if (!['admin', 'moderator'].includes(role)) {
        root.innerHTML = '<div class="community-error"><strong>Brak uprawnień.</strong><p>To konto nie ma roli administratora ani moderatora.</p></div>';
        return;
      }
      bind();
      await loadTab();
    } catch (error) {
      if (sequence !== initSequence) return;
      root.innerHTML = '<div class="community-error"><strong>Nie udało się sprawdzić uprawnień.</strong><p>' + AIOCommunity.escape(AIOCommunity.friendlyError(error)) + '</p></div>';
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('[data-admin-tab]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      tab = button.dataset.adminTab;
      loadTab();
    }));
    document.addEventListener('click', handleAction);
  }

  async function adminCall(payload) {
    return AIOCommunity.edgeCall('admin', payload);
  }

  async function loadTab() {
    const root = document.querySelector('[data-community-admin]');
    if (!root) return;
    root.innerHTML = '<div class="community-loading">Ładuję dane moderacji…</div>';
    try {
      if (tab === 'pending') await loadPending(root);
      else if (tab === 'reports') await loadReports(root);
      else if (tab === 'published') await loadPublished(root);
      else if (tab === 'users') await loadUsers(root);
      else if (tab === 'ip') await loadIpBlocks(root);
      else await loadLogs(root);
      await loadAdminStats();
    } catch (error) {
      root.innerHTML = '<div class="community-error"><strong>Nie udało się pobrać danych.</strong><p>' + AIOCommunity.escape(AIOCommunity.friendlyError(error)) + '</p><p>Sprawdź, czy funkcja Edge <code>community-admin-action</code> została wdrożona.</p></div>';
    }
  }

  async function loadPending(root) {
    const result = await AIOCommunity.client.from('community_posts').select('id,author_id,title,content,category,status,created_at,author:community_profiles!community_posts_author_id_fkey(display_name,avatar_url,role)').eq('status', 'pending').order('created_at', { ascending: true }).limit(100);
    if (result.error) throw result.error;
    const rows = result.data || [];
    await Promise.all(rows.map(async item => { if (item.author) item.author = await AIOCommunity.prepareProfile(item.author); }));
    root.innerHTML = rows.length ? '<div class="community-admin-list">' + rows.map(item => adminPost(item, true)).join('') + '</div>' : '<div class="community-empty"><strong>Brak wpisów oczekujących.</strong><p>Kolejka moderacji jest pusta.</p></div>';
  }

  async function loadPublished(root) {
    const result = await AIOCommunity.client.from('community_posts').select('id,author_id,title,content,category,status,pinned,locked,kind,created_at,author:community_profiles!community_posts_author_id_fkey(display_name,avatar_url,role)').eq('status', 'published').order('created_at', { ascending: false }).limit(150);
    if (result.error) throw result.error;
    const rows = result.data || [];
    await Promise.all(rows.map(async item => { if (item.author) item.author = await AIOCommunity.prepareProfile(item.author); }));
    root.innerHTML = rows.length ? '<div class="community-admin-list">' + rows.map(item => adminPost(item, false)).join('') + '</div>' : '<div class="community-empty"><strong>Brak opublikowanych wpisów.</strong></div>';
  }

  function adminPost(item, pending) {
    const author = item.author || {};
    const preview = String(item.content || '').length > 1400
      ? AIOCommunity.formatText(item.content, 1400) + '<div><a class="community-inline-link" href="post.html?id=' + AIOCommunity.escapeAttr(item.id) + '">Czytaj pełną treść →</a></div>'
      : AIOCommunity.formatText(item.content);
    return '<article class="community-admin-item" data-admin-post="' + AIOCommunity.escapeAttr(item.id) + '"><div class="community-admin-item-head">' + AIOCommunity.avatarHtml(author, author.display_name) + '<div><strong>' + AIOCommunity.escape(item.title) + '</strong><small>' + AIOCommunity.escape((author.display_name || 'Użytkownik') + ' • ' + AIOCommunity.formatDate(item.created_at)) + '</small></div></div><div class="community-admin-preview">' + preview + '</div><div class="community-admin-actions">' + (pending ? '<button class="button primary" data-admin-action="approve">Zatwierdź</button><button class="button" data-admin-action="reject">Odrzuć</button>' : '<a class="button" href="post.html?id=' + AIOCommunity.escapeAttr(item.id) + '">Otwórz</a><button class="button" data-admin-action="official">' + (item.kind === 'official' ? 'Zmień na społecznościowy' : 'Oznacz jako oficjalny') + '</button><button class="button" data-admin-action="pin">' + (item.pinned ? 'Odepnij' : 'Przypnij') + '</button><button class="button" data-admin-action="lock">' + (item.locked ? 'Odblokuj komentarze' : 'Zablokuj komentarze') + '</button><button class="button danger" data-admin-action="hide">Ukryj</button>') + '</div></article>';
  }

  async function loadReports(root) {
    const result = await AIOCommunity.client.from('community_reports').select('id,reporter_id,target_type,target_id,reason,details,status,created_at,reporter:community_profiles!community_reports_reporter_id_fkey(display_name,avatar_url)').eq('status', 'open').order('created_at', { ascending: true }).limit(100);
    if (result.error) throw result.error;
    const rows = result.data || [];
    await Promise.all(rows.map(async item => { if (item.reporter) item.reporter = await AIOCommunity.prepareProfile(item.reporter); }));
    root.innerHTML = rows.length ? '<div class="community-admin-list">' + rows.map(item => '<article class="community-admin-item" data-admin-report="' + AIOCommunity.escapeAttr(item.id) + '"><div class="community-admin-item-head">' + AIOCommunity.avatarHtml(item.reporter || {}, item.reporter && item.reporter.display_name) + '<div><strong>' + AIOCommunity.escape(item.reason) + '</strong><small>' + AIOCommunity.escape((item.reporter && item.reporter.display_name || 'Użytkownik') + ' • ' + AIOCommunity.formatDate(item.created_at)) + '</small></div></div><p>Typ: <strong>' + AIOCommunity.escape(item.target_type) + '</strong><br>ID: <code>' + AIOCommunity.escape(item.target_id) + '</code></p>' + (item.details ? '<p>' + AIOCommunity.formatText(item.details) + '</p>' : '') + '<div class="community-admin-actions">' + (item.target_type === 'post' ? '<a class="button" href="post.html?id=' + AIOCommunity.escapeAttr(item.target_id) + '">Otwórz wpis</a>' : '') + '<button class="button primary" data-report-action="resolved">Rozwiązane</button><button class="button" data-report-action="dismissed">Odrzuć zgłoszenie</button></div></article>').join('') + '</div>' : '<div class="community-empty"><strong>Brak otwartych zgłoszeń.</strong></div>';
  }

  async function loadUsers(root) {
    const result = await adminCall({ action: 'list_users' });
    let rows = result.users || [];
    rows = await Promise.all(rows.map(item => AIOCommunity.prepareProfile(item)));
    const fullAdmin = AIOCommunity.profile.role === 'admin';
    root.innerHTML = rows.length ? '<div class="community-admin-list">' + rows.map(item => renderUser(item, fullAdmin)).join('') + '</div>' : '<div class="community-empty"><strong>Brak użytkowników.</strong></div>';
  }

  function renderUser(item, fullAdmin) {
    const banned = item.banned_until && new Date(item.banned_until).getTime() > Date.now();
    const own = item.id === AIOCommunity.user.id;
    const ips = Array.isArray(item.ips) ? item.ips : [];
    const ipHtml = ips.length ? '<div class="community-ip-list">' + ips.map(ip => '<span class="community-ip-chip"><code>' + AIOCommunity.escape(ip.ip_address) + '</code><small>' + AIOCommunity.escape(AIOCommunity.formatDate(ip.last_seen_at)) + ' • ' + Number(ip.event_count || 0) + ' zdarzeń</small>' + (fullAdmin && !own ? '<button class="community-mini-danger" type="button" data-ip-action="block" data-ip="' + AIOCommunity.escapeAttr(ip.ip_address) + '">Blokuj IP</button>' : '') + '</span>').join('') + '</div>' : '<small class="community-muted">Brak zapisanego adresu IP — pojawi się po wejściu lub aktywności użytkownika.</small>';
    const banText = banned ? (new Date(item.banned_until).getFullYear() > 9000 ? 'Blokada bezterminowa' : 'Blokada do ' + AIOCommunity.formatDate(item.banned_until)) : 'Konto aktywne';
    return '<article class="community-admin-item community-user-card" data-admin-user="' + AIOCommunity.escapeAttr(item.id) + '">' +
      '<div class="community-admin-item-head">' + AIOCommunity.avatarHtml(item, item.display_name) + '<div><strong>' + AIOCommunity.escape(item.display_name || 'Użytkownik') + ' <span class="community-role ' + AIOCommunity.escapeAttr(item.role) + '">' + AIOCommunity.escape(AIOCommunity.roleLabel(item.role)) + '</span></strong><small>' + AIOCommunity.escape([item.email, item.tuner_model, item.system_name].filter(Boolean).join(' • ') || 'Brak dodatkowych danych') + '</small><small class="' + (banned ? 'community-danger-text' : 'community-success-text') + '">' + AIOCommunity.escape(banText + (item.ban_reason ? ' • ' + item.ban_reason : '')) + '</small></div></div>' +
      ipHtml +
      '<div class="community-admin-actions"><button class="button" data-user-action="trust">' + (item.trusted ? 'Cofnij zaufanie' : 'Oznacz jako zaufany') + '</button>' +
      (!own && !banned ? '<select class="community-admin-select" data-ban-duration><option value="24h">24 godziny</option><option value="7d" selected>7 dni</option><option value="30d">30 dni</option>' + (fullAdmin ? '<option value="permanent">Bezterminowo</option>' : '') + '</select><button class="button danger" data-user-action="ban">Zablokuj konto</button>' : '') +
      (!own && banned ? '<button class="button primary" data-user-action="unban">Odblokuj konto</button>' : '') +
      (!own ? '<button class="button" data-user-action="hide-content">Ukryj wszystkie treści</button>' : '') +
      (fullAdmin && !own ? '<button class="button" data-user-action="moderator">' + (item.role === 'moderator' ? 'Odbierz moderatora' : 'Nadaj moderatora') + '</button><button class="button danger strong" data-user-action="delete">Usuń konto trwale</button>' : '') + '</div></article>';
  }

  async function loadIpBlocks(root) {
    if (AIOCommunity.profile.role !== 'admin') {
      root.innerHTML = '<div class="community-empty"><strong>Blokadami IP zarządza wyłącznie administrator.</strong></div>';
      return;
    }
    const result = await adminCall({ action: 'list_ip_blocks' });
    const rows = result.blocks || [];
    root.innerHTML = rows.length ? '<div class="community-admin-list">' + rows.map(item => '<article class="community-admin-item" data-ip-block="' + AIOCommunity.escapeAttr(item.id) + '"><div class="community-admin-item-head"><span class="community-avatar">IP</span><div><strong><code>' + AIOCommunity.escape(item.ip_address) + '</code></strong><small>' + AIOCommunity.escape(item.target && item.target.display_name ? 'Powiązany użytkownik: ' + item.target.display_name : 'Brak powiązanego profilu') + '</small></div></div><p>' + AIOCommunity.escape(item.reason || 'Brak powodu') + '</p><p><strong>' + (item.active ? (item.permanent ? 'Aktywna bezterminowo' : 'Aktywna do ' + AIOCommunity.escape(AIOCommunity.formatDate(item.expires_at))) : 'Nieaktywna') + '</strong></p>' + (item.active ? '<button class="button primary" data-ip-action="unblock">Usuń blokadę</button>' : '') + '</article>').join('') + '</div>' : '<div class="community-empty"><strong>Brak blokad IP.</strong><p>Adres IP można zablokować w zakładce Użytkownicy.</p></div>';
  }

  async function loadLogs(root) {
    const result = await adminCall({ action: 'list_logs' });
    const rows = result.logs || [];
    root.innerHTML = rows.length ? '<div class="community-admin-list">' + rows.map(item => '<article class="community-admin-item"><div class="community-admin-item-head"><span class="community-avatar">LOG</span><div><strong>' + AIOCommunity.escape(item.action) + '</strong><small>' + AIOCommunity.escape((item.actor && item.actor.display_name || 'System') + ' • ' + AIOCommunity.formatDate(item.created_at)) + '</small></div></div><p>' + AIOCommunity.escape(item.reason || 'Bez dodatkowego opisu') + '</p>' + (item.ip_address ? '<code>' + AIOCommunity.escape(item.ip_address) + '</code>' : '') + '</article>').join('') + '</div>' : '<div class="community-empty"><strong>Dziennik moderacji jest pusty.</strong></div>';
  }

  async function handleAction(event) {
    const postRow = event.target.closest('[data-admin-post]');
    const postAction = event.target.closest('[data-admin-action]');
    if (postRow && postAction) {
      await runAdmin({ action: 'post_action', id: postRow.dataset.adminPost, operation: postAction.dataset.adminAction }, 'Zmiana wpisu została zapisana.');
      return;
    }
    const reportRow = event.target.closest('[data-admin-report]');
    const reportAction = event.target.closest('[data-report-action]');
    if (reportRow && reportAction) {
      await runAdmin({ action: 'report_action', id: reportRow.dataset.adminReport, status: reportAction.dataset.reportAction }, 'Zgłoszenie zostało obsłużone.');
      return;
    }
    const blockRow = event.target.closest('[data-ip-block]');
    const unblock = event.target.closest('[data-ip-action="unblock"]');
    if (blockRow && unblock) {
      if (!confirm('Usunąć tę blokadę IP?')) return;
      await runAdmin({ action: 'unblock_ip', id: blockRow.dataset.ipBlock }, 'Blokada IP została usunięta.');
      return;
    }
    const userRow = event.target.closest('[data-admin-user]');
    if (!userRow) return;
    const userId = userRow.dataset.adminUser;
    const userAction = event.target.closest('[data-user-action]');
    const ipAction = event.target.closest('[data-ip-action="block"]');
    if (ipAction) {
      const duration = prompt('Czas blokady IP: wpisz 24h, 7d, 30d lub permanent', '30d');
      if (!duration || !['24h', '7d', '30d', 'permanent'].includes(duration)) return;
      const reason = prompt('Powód blokady adresu IP:', 'Spam lub powtarzające się naruszenie zasad');
      if (!reason) return;
      await runAdmin({ action: 'block_ip', userId, ipAddress: ipAction.dataset.ip, duration, reason }, 'Adres IP został zablokowany.');
      return;
    }
    if (!userAction) return;
    const action = userAction.dataset.userAction;
    if (action === 'trust') {
      await runAdmin({ action: 'trust_user', userId, trusted: !/Cofnij/.test(userAction.textContent) }, 'Status zaufania został zmieniony.');
    } else if (action === 'moderator') {
      await runAdmin({ action: 'set_role', userId, role: /Odbierz/.test(userAction.textContent) ? 'user' : 'moderator' }, 'Rola użytkownika została zmieniona.');
    } else if (action === 'ban') {
      const select = userRow.querySelector('[data-ban-duration]');
      const duration = select ? select.value : '7d';
      const reason = prompt('Podaj powód blokady konta:', 'Naruszenie regulaminu Społeczności AIO');
      if (!reason) return;
      const hideContent = confirm('Czy jednocześnie ukryć wszystkie posty i komentarze tego użytkownika?');
      if (duration === 'permanent' && !confirm('To blokada bezterminowa. Potwierdź ponownie.')) return;
      await runAdmin({ action: 'ban_user', userId, duration, reason, hideContent }, 'Konto zostało zablokowane.');
    } else if (action === 'unban') {
      if (!confirm('Odblokować konto użytkownika?')) return;
      await runAdmin({ action: 'unban_user', userId }, 'Konto zostało odblokowane.');
    } else if (action === 'hide-content') {
      const reason = prompt('Powód ukrycia wszystkich treści:', 'Treści naruszające zasady społeczności');
      if (!reason || !confirm('Ukryć wszystkie posty i komentarze tego użytkownika?')) return;
      await runAdmin({ action: 'hide_user_content', userId, reason }, 'Wszystkie treści użytkownika zostały ukryte.');
    } else if (action === 'delete') {
      const confirmation = prompt('Ta operacja trwale usunie konto, posty, komentarze i zdjęcia. Wpisz USUŃ, aby potwierdzić:');
      if (confirmation !== 'USUŃ') return;
      const reason = prompt('Powód trwałego usunięcia konta:', 'Konto spamerskie lub prośba właściciela');
      if (!reason) return;
      await runAdmin({ action: 'delete_user', userId, reason }, 'Konto oraz jego dane zostały trwale usunięte.');
    }
  }

  async function runAdmin(payload, success) {
    try {
      await adminCall(payload);
      AIOCommunity.showToast(success, 'success');
      await loadTab();
    } catch (error) {
      AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error');
    }
  }

  async function loadAdminStats() {
    const set = (key, value) => document.querySelectorAll('[data-admin-stat="' + key + '"]').forEach(el => { el.textContent = Number(value || 0).toLocaleString('pl-PL'); });
    const [pending, reports, users] = await Promise.all([
      AIOCommunity.client.from('community_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      AIOCommunity.client.from('community_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      AIOCommunity.client.from('community_profiles').select('id', { count: 'exact', head: true })
    ]);
    set('pending', pending.count);
    set('reports', reports.count);
    set('users', users.count);
  }

  boot();
})();
