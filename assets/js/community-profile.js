/* Społeczność AIO — profile tylko dla zalogowanych, 2026-07-26 community5 */
(function () {
  'use strict';
  let targetId = '';
  let profile = null;

  function boot() {
    if (!window.AIOCommunity) return;
    if (AIOCommunity.ready) init(); else document.addEventListener('aio-community-ready', init, { once: true });
  }

  async function init() {
    const root = document.querySelector('[data-community-profile]');
    if (!root) return;
    bind();
    if (!AIOCommunity.user || AIOCommunity.ipBlocked) {
      root.innerHTML = privateProfileGate();
      return;
    }
    targetId = AIOCommunity.queryParam('id') || AIOCommunity.user.id;
    if (!AIOCommunity.backendReady) return AIOCommunity.showSetupError(new Error('Brak bazy społeczności.'));
    await loadProfile();
  }

  function bind() {
    document.addEventListener('aio-community-auth', () => {
      const root = document.querySelector('[data-community-profile]');
      if (!AIOCommunity.user || AIOCommunity.ipBlocked) { if (root) root.innerHTML = privateProfileGate(); return; }
      targetId = AIOCommunity.queryParam('id') || AIOCommunity.user.id;
      loadProfile();
    });
    const form = document.querySelector('[data-profile-form]');
    if (form) form.addEventListener('submit', saveProfile);
    const avatar = document.querySelector('[data-profile-avatar-file]');
    if (avatar) avatar.addEventListener('change', previewAvatar);
  }

  function privateProfileGate() {
    return '<section class="community-access-gate compact"><div class="community-access-icon">👤</div><p class="eyebrow">Profile Społeczności AIO</p><h1>Zaloguj się, aby zobaczyć profile</h1><p>Dane profili, aktywność użytkowników i ich wpisy nie są udostępniane osobom niezalogowanym.</p><button class="button primary" type="button" data-community-login>Zaloguj się / utwórz konto</button></section>';
  }

  async function loadProfile() {
    const root = document.querySelector('[data-community-profile]');
    root.innerHTML = '<div class="community-loading">Ładuję profil…</div>';
    try {
      const result = await AIOCommunity.client.from('community_profiles').select('*').eq('id', targetId).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Nie znaleziono profilu użytkownika.');
      profile = await AIOCommunity.prepareProfile(result.data);
      const posts = await AIOCommunity.client.from('community_posts').select('id,title,category,status,kind,created_at').eq('author_id', targetId).order('created_at', { ascending: false }).limit(20);
      renderProfile(root, posts.data || []);
      populateForm();
      document.title = (profile.display_name || 'Profil') + ' — Społeczność AIO';
    } catch (error) {
      root.innerHTML = '<div class="community-error"><strong>Nie udało się otworzyć profilu.</strong><p>' + AIOCommunity.escape(AIOCommunity.friendlyError(error)) + '</p></div>';
    }
  }

  function renderProfile(root, posts) {
    const own = AIOCommunity.isOwner(targetId);
    const details = [profile.tuner_model, profile.system_name && profile.system_version ? profile.system_name + ' ' + profile.system_version : profile.system_name, profile.python_version ? 'Python ' + profile.python_version : ''].filter(Boolean);
    root.innerHTML = '<section class="community-panel community-profile-hero">' + AIOCommunity.avatarHtml(profile, profile.display_name, true) + '<div><p class="eyebrow">Profil Społeczności AIO</p><h1>' + AIOCommunity.escape(profile.display_name || 'Użytkownik') + '</h1><div class="community-profile-details">' + (profile.role !== 'user' ? '<span class="community-role ' + AIOCommunity.escapeAttr(profile.role) + '">' + AIOCommunity.escape(AIOCommunity.roleLabel(profile.role)) + '</span>' : '') + details.map(item => '<span>' + AIOCommunity.escape(item) + '</span>').join('<span>•</span>') + '</div><p class="community-profile-bio">' + AIOCommunity.formatText(profile.bio || 'Użytkownik nie dodał jeszcze opisu profilu.') + '</p></div>' + (own ? '<a class="button primary" href="#edycja-profilu">Edytuj profil</a>' : '') + '</section>' +
      '<div class="community-profile-grid"><aside class="community-panel community-panel-pad"><h2>Informacje</h2><div class="community-profile-list"><div><strong>Model tunera</strong><span>' + AIOCommunity.escape(profile.tuner_model || 'Nie podano') + '</span></div><div><strong>System</strong><span>' + AIOCommunity.escape([profile.system_name, profile.system_version].filter(Boolean).join(' ') || 'Nie podano') + '</span></div><div><strong>Python</strong><span>' + AIOCommunity.escape(profile.python_version || 'Nie podano') + '</span></div><div><strong>Dołączył</strong><span>' + AIOCommunity.escape(AIOCommunity.formatDate(profile.created_at)) + '</span></div></div></aside>' +
      '<section class="community-panel community-panel-pad"><h2>Ostatnie wpisy</h2><div class="community-profile-list">' + (posts.length ? posts.map(renderPostLink).join('') : '<div><strong>Brak wpisów</strong><span>Ten użytkownik nie opublikował jeszcze żadnego widocznego wpisu.</span></div>') + '</div></section></div>';
    const edit = document.querySelector('[data-profile-edit-panel]');
    if (edit) edit.hidden = !own;
  }

  function renderPostLink(item) {
    const category = AIOCommunity.category(item.category);
    return '<a href="post.html?id=' + AIOCommunity.escapeAttr(item.id) + '"><div><strong>' + AIOCommunity.escape(item.title) + '</strong><span>' + AIOCommunity.escape(category.icon + ' ' + category.label + ' • ' + AIOCommunity.timeAgo(item.created_at) + (item.status !== 'published' ? ' • oczekuje' : '')) + '</span></div></a>';
  }

  function populateForm() {
    const form = document.querySelector('[data-profile-form]');
    if (!form || !AIOCommunity.isOwner(targetId)) return;
    form.querySelector('[name="display_name"]').value = profile.display_name || '';
    form.querySelector('[name="tuner_model"]').value = profile.tuner_model || '';
    form.querySelector('[name="system_name"]').value = profile.system_name || '';
    form.querySelector('[name="system_version"]').value = profile.system_version || '';
    form.querySelector('[name="python_version"]').value = profile.python_version || '';
    form.querySelector('[name="bio"]').value = profile.bio || '';
    const preview = document.querySelector('[data-profile-avatar-preview]');
    if (preview) preview.innerHTML = AIOCommunity.avatarHtml(profile, profile.display_name, true);
  }

  function previewAvatar(event) {
    const file = event.target.files && event.target.files[0];
    const preview = document.querySelector('[data-profile-avatar-preview]');
    if (!file || !preview) return;
    const url = URL.createObjectURL(file);
    preview.innerHTML = '<img class="community-avatar large" src="' + AIOCommunity.escapeAttr(url) + '" alt="Podgląd avataru">';
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!AIOCommunity.requireWritable()) return;
    if (!AIOCommunity.isOwner(targetId)) return;
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form).entries());
    const name = String(values.display_name || '').trim();
    if (name.length < 2 || name.length > 60) { AIOCommunity.showToast('Nazwa profilu powinna mieć od 2 do 60 znaków.', 'error'); return; }
    button.disabled = true;
    try {
      let avatarUrl = profile.avatar_url || null;
      const fileInput = form.querySelector('[data-profile-avatar-file]');
      if (fileInput.files && fileInput.files[0]) {
        const uploaded = await AIOCommunity.uploadImages([fileInput.files[0]], 'avatars');
        if (uploaded[0]) avatarUrl = uploaded[0].path || uploaded[0].url;
      }
      const update = {
        display_name: name,
        avatar_url: avatarUrl,
        tuner_model: String(values.tuner_model || '').trim().slice(0, 80) || null,
        system_name: String(values.system_name || '').trim().slice(0, 50) || null,
        system_version: String(values.system_version || '').trim().slice(0, 30) || null,
        python_version: String(values.python_version || '').trim().slice(0, 20) || null,
        bio: String(values.bio || '').trim().slice(0, 600) || null
      };
      const result = await AIOCommunity.client.from('community_profiles').update(update).eq('id', targetId).select('*').single();
      if (result.error) throw result.error;
      profile = await AIOCommunity.prepareProfile(result.data);
      AIOCommunity.profile = profile;
      AIOCommunity.renderAccountBars();
      AIOCommunity.showToast('Profil został zapisany.', 'success');
      await loadProfile();
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
    finally { button.disabled = false; }
  }

  boot();
})();
