/* Społeczność AIO — moderacja, 2026-07-25 community1 */
(function () {
  'use strict';
  let tab = 'pending';

  function boot() {
    if (!window.AIOCommunity) return;
    if (AIOCommunity.ready) init(); else document.addEventListener('aio-community-ready', init, { once: true });
  }

  async function init() {
    const root = document.querySelector('[data-community-admin]');
    if (!root) return;
    if (!AIOCommunity.user) {
      root.innerHTML = '<div class="community-empty"><strong>Zaloguj się jako administrator lub moderator.</strong><p>Panel moderacji nie jest dostępny publicznie.</p><button class="button primary" data-community-login>Zaloguj się</button></div>';
      return;
    }
    if (!AIOCommunity.isAdmin()) {
      root.innerHTML = '<div class="community-error"><strong>Brak uprawnień.</strong><p>To konto nie ma roli administratora ani moderatora.</p></div>';
      return;
    }
    bind();
    loadTab();
  }

  function bind() {
    document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('[data-admin-tab]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      tab = button.dataset.adminTab;
      loadTab();
    }));
    document.addEventListener('click', handleAction);
  }

  async function loadTab() {
    const root = document.querySelector('[data-community-admin]');
    root.innerHTML = '<div class="community-loading">Ładuję dane moderacji…</div>';
    try {
      if (tab === 'pending') await loadPending(root);
      else if (tab === 'reports') await loadReports(root);
      else if (tab === 'users') await loadUsers(root);
      else await loadPublished(root);
      loadAdminStats();
    } catch (error) {
      root.innerHTML = '<div class="community-error">' + AIOCommunity.escape(AIOCommunity.friendlyError(error)) + '</div>';
    }
  }

  async function loadPending(root) {
    const result = await AIOCommunity.client.from('community_posts').select('id,author_id,title,content,category,status,created_at,author:community_profiles!community_posts_author_id_fkey(display_name,avatar_url,role)').eq('status', 'pending').order('created_at', { ascending: true }).limit(100);
    if (result.error) throw result.error;
    const rows = result.data || [];
    root.innerHTML = rows.length ? '<div class="community-admin-list">' + rows.map(item => adminPost(item, true)).join('') + '</div>' : '<div class="community-empty"><strong>Brak wpisów oczekujących.</strong><p>Kolejka moderacji jest pusta.</p></div>';
  }

  async function loadPublished(root) {
    const result = await AIOCommunity.client.from('community_posts').select('id,author_id,title,content,category,status,pinned,locked,kind,created_at,author:community_profiles!community_posts_author_id_fkey(display_name,avatar_url,role)').eq('status', 'published').order('created_at', { ascending: false }).limit(100);
    if (result.error) throw result.error;
    const rows = result.data || [];
    root.innerHTML = '<div class="community-admin-list">' + rows.map(item => adminPost(item, false)).join('') + '</div>';
  }

  function adminPost(item, pending) {
    const author = item.author || {};
    return '<article class="community-admin-item" data-admin-post="' + AIOCommunity.escapeAttr(item.id) + '"><div class="community-admin-item-head">' + AIOCommunity.avatarHtml(author, author.display_name) + '<div><strong>' + AIOCommunity.escape(item.title) + '</strong><small>' + AIOCommunity.escape((author.display_name || 'Użytkownik') + ' • ' + AIOCommunity.formatDate(item.created_at)) + '</small></div></div><p>' + AIOCommunity.formatText(item.content, 450) + '</p><div class="community-admin-actions">' + (pending ? '<button class="button primary" data-admin-action="approve">Zatwierdź</button><button class="button" data-admin-action="reject">Odrzuć</button>' : '<a class="button" href="post.html?id=' + AIOCommunity.escapeAttr(item.id) + '">Otwórz</a><button class="button" data-admin-action="official">' + (item.kind === 'official' ? 'Zmień na społecznościowy' : 'Oznacz jako oficjalny') + '</button><button class="button" data-admin-action="pin">' + (item.pinned ? 'Odepnij' : 'Przypnij') + '</button><button class="button" data-admin-action="lock">' + (item.locked ? 'Odblokuj komentarze' : 'Zablokuj komentarze') + '</button><button class="button danger" data-admin-action="hide">Ukryj</button>') + '</div></article>';
  }

  async function loadReports(root) {
    const result = await AIOCommunity.client.from('community_reports').select('id,reporter_id,target_type,target_id,reason,details,status,created_at,reporter:community_profiles!community_reports_reporter_id_fkey(display_name,avatar_url)').eq('status', 'open').order('created_at', { ascending: true }).limit(100);
    if (result.error) throw result.error;
    const rows = result.data || [];
    root.innerHTML = rows.length ? '<div class="community-admin-list">' + rows.map(item => '<article class="community-admin-item" data-admin-report="' + AIOCommunity.escapeAttr(item.id) + '"><div class="community-admin-item-head">' + AIOCommunity.avatarHtml(item.reporter || {}, item.reporter && item.reporter.display_name) + '<div><strong>' + AIOCommunity.escape(item.reason) + '</strong><small>' + AIOCommunity.escape((item.reporter && item.reporter.display_name || 'Użytkownik') + ' • ' + AIOCommunity.formatDate(item.created_at)) + '</small></div></div><p>Typ: <strong>' + AIOCommunity.escape(item.target_type) + '</strong><br>ID: <code>' + AIOCommunity.escape(item.target_id) + '</code></p><div class="community-admin-actions">' + (item.target_type === 'post' ? '<a class="button" href="post.html?id=' + AIOCommunity.escapeAttr(item.target_id) + '">Otwórz wpis</a>' : '') + '<button class="button primary" data-report-action="resolved">Rozwiązane</button><button class="button" data-report-action="dismissed">Odrzuć zgłoszenie</button></div></article>').join('') + '</div>' : '<div class="community-empty"><strong>Brak otwartych zgłoszeń.</strong></div>';
  }

  async function loadUsers(root) {
    const result = await AIOCommunity.client.from('community_profiles').select('*').order('created_at', { ascending: false }).limit(200);
    if (result.error) throw result.error;
    const rows = result.data || [];
    root.innerHTML = '<div class="community-admin-list">' + rows.map(item => '<article class="community-admin-item community-user-row" data-admin-user="' + AIOCommunity.escapeAttr(item.id) + '">' + AIOCommunity.avatarHtml(item, item.display_name) + '<div><strong>' + AIOCommunity.escape(item.display_name || 'Użytkownik') + ' <span class="community-role ' + AIOCommunity.escapeAttr(item.role) + '">' + AIOCommunity.escape(AIOCommunity.roleLabel(item.role)) + '</span></strong><small>' + AIOCommunity.escape([item.tuner_model, item.system_name, item.banned_until && new Date(item.banned_until) > new Date() ? 'blokada do ' + AIOCommunity.formatDate(item.banned_until) : ''].filter(Boolean).join(' • ') || 'Brak dodatkowych danych') + '</small></div><div class="community-admin-actions"><button class="button" data-user-action="trust">' + (item.trusted ? 'Cofnij zaufanie' : 'Oznacz jako zaufany') + '</button><button class="button" data-user-action="ban">' + (item.banned_until && new Date(item.banned_until) > new Date() ? 'Odblokuj' : 'Zablokuj 7 dni') + '</button>' + (AIOCommunity.profile.role === 'admin' && item.id !== AIOCommunity.user.id ? '<button class="button" data-user-action="moderator">' + (item.role === 'moderator' ? 'Odbierz moderatora' : 'Nadaj moderatora') + '</button>' : '') + '</div></article>').join('') + '</div>';
  }

  async function handleAction(event) {
    const postRow = event.target.closest('[data-admin-post]');
    const postAction = event.target.closest('[data-admin-action]');
    if (postRow && postAction) {
      const id = postRow.dataset.adminPost;
      const action = postAction.dataset.adminAction;
      let patch = {};
      if (action === 'approve') patch = { status: 'published', published_at: new Date().toISOString() };
      if (action === 'reject') patch = { status: 'rejected' };
      if (action === 'hide') patch = { status: 'hidden' };
      if (action === 'official') patch = { kind: /Zmień na społecznościowy/.test(postAction.textContent) ? 'community' : 'official' };
      if (action === 'pin') patch = { pinned: !/Odepnij/.test(postAction.textContent) };
      if (action === 'lock') patch = { locked: !/Odblokuj/.test(postAction.textContent) };
      const result = await AIOCommunity.client.from('community_posts').update(patch).eq('id', id);
      if (result.error) AIOCommunity.showToast(AIOCommunity.friendlyError(result.error), 'error'); else { AIOCommunity.showToast('Zmiana została zapisana.', 'success'); loadTab(); }
    }
    const reportRow = event.target.closest('[data-admin-report]');
    const reportAction = event.target.closest('[data-report-action]');
    if (reportRow && reportAction) {
      const result = await AIOCommunity.client.from('community_reports').update({ status: reportAction.dataset.reportAction, reviewed_by: AIOCommunity.user.id, reviewed_at: new Date().toISOString() }).eq('id', reportRow.dataset.adminReport);
      if (result.error) AIOCommunity.showToast(AIOCommunity.friendlyError(result.error), 'error'); else loadTab();
    }
    const userRow = event.target.closest('[data-admin-user]');
    const userAction = event.target.closest('[data-user-action]');
    if (userRow && userAction) {
      const id = userRow.dataset.adminUser;
      const action = userAction.dataset.userAction;
      const currentText = userAction.textContent;
      let patch = {};
      if (action === 'trust') patch.trusted = /Cofnij/.test(currentText) ? false : true;
      if (action === 'ban') patch.banned_until = /Odblokuj/.test(currentText) ? null : new Date(Date.now() + 7 * 86400000).toISOString();
      if (action === 'moderator') patch.role = /Odbierz/.test(currentText) ? 'user' : 'moderator';
      const result = await AIOCommunity.client.from('community_profiles').update(patch).eq('id', id);
      if (result.error) AIOCommunity.showToast(AIOCommunity.friendlyError(result.error), 'error'); else { AIOCommunity.showToast('Profil użytkownika został zaktualizowany.', 'success'); loadTab(); }
    }
  }

  async function loadAdminStats() {
    const set = (key, value) => document.querySelectorAll('[data-admin-stat="' + key + '"]').forEach(el => { el.textContent = Number(value || 0).toLocaleString('pl-PL'); });
    const [pending, reports, users] = await Promise.all([
      AIOCommunity.client.from('community_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      AIOCommunity.client.from('community_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      AIOCommunity.client.from('community_profiles').select('id', { count: 'exact', head: true })
    ]);
    set('pending', pending.count); set('reports', reports.count); set('users', users.count);
  }

  boot();
})();
