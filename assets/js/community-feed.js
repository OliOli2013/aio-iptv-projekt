/* Społeczność AIO — prywatna tablica i publiczne aktualności, 2026-07-26 community4 */
(function () {
  'use strict';

  const state = { page: 0, search: '', category: '', mode: 'latest', loading: false, rows: [], pageSize: 12 };
  const selectors = {};
  let isNewsPage = false;

  function boot() {
    if (!window.AIOCommunity) return;
    if (AIOCommunity.ready) init(); else document.addEventListener('aio-community-ready', init, { once: true });
  }

  async function init() {
    const feed = document.querySelector('[data-community-feed]');
    if (!feed) return;
    selectors.feed = feed;
    selectors.search = document.querySelector('[data-community-search]');
    selectors.category = document.querySelector('[data-community-category]');
    selectors.more = document.querySelector('[data-community-more]');
    selectors.compose = document.querySelector('[data-community-compose]');
    state.pageSize = Number(AIOCommunity.config && AIOCommunity.config.postsPerPage || 12);
    isNewsPage = document.body.dataset.communityPage === 'news';
    state.mode = isNewsPage ? 'official' : 'latest';
    fillCategories();
    bind();
    renderComposeState();
    renderAccessState();
    if (!AIOCommunity.backendReady) {
      AIOCommunity.showSetupError(new Error('Baza społeczności nie została jeszcze utworzona.'));
      return;
    }
    if (!isNewsPage && !AIOCommunity.user) return;
    await Promise.all([loadFeed(true), loadStats()]);
    subscribe();
  }

  function fillCategories() {
    if (!selectors.category || !AIOCommunity.config) return;
    selectors.category.innerHTML = '<option value="">Wszystkie kategorie</option>' + AIOCommunity.config.categories.map(item => '<option value="' + AIOCommunity.escapeAttr(item.id) + '">' + AIOCommunity.escape(item.icon + ' ' + item.label) + '</option>').join('');
    const composeCategory = document.querySelector('[data-compose-category]');
    if (composeCategory) composeCategory.innerHTML = AIOCommunity.config.categories.map(item => '<option value="' + AIOCommunity.escapeAttr(item.id) + '">' + AIOCommunity.escape(item.icon + ' ' + item.label) + '</option>').join('');
  }

  function bind() {
    if (selectors.search) {
      let timer;
      selectors.search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.search = selectors.search.value.trim(); loadFeed(true); }, 320);
      });
    }
    if (selectors.category) selectors.category.addEventListener('change', () => { state.category = selectors.category.value; loadFeed(true); });
    document.querySelectorAll('[data-community-mode]').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('[data-community-mode]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      state.mode = button.dataset.communityMode;
      loadFeed(true);
    }));
    if (selectors.more) selectors.more.addEventListener('click', () => loadFeed(false));
    document.addEventListener('aio-community-auth', async () => {
      renderComposeState();
      renderAccessState();
      if (isNewsPage || AIOCommunity.user) { await loadFeed(true); await loadStats(); subscribe(); }
    });
    document.addEventListener('click', handleActions);
    const form = document.querySelector('[data-compose-form]');
    if (form) form.addEventListener('submit', submitPost);
    const images = document.querySelector('[data-compose-images]');
    if (images) images.addEventListener('change', previewImages);
    const open = document.querySelector('[data-open-compose]');
    if (open) open.addEventListener('click', () => {
      if (!AIOCommunity.requireAuth('Zaloguj się, aby opublikować pytanie lub wpis.')) return;
      document.querySelector('[data-compose-title]').focus();
      selectors.compose.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderAccessState() {
    const gate = document.querySelector('[data-community-access-gate]');
    const content = document.querySelector('[data-community-private-content]');
    const allowed = isNewsPage || Boolean(AIOCommunity.user);
    if (gate) gate.hidden = allowed;
    if (content) content.hidden = !allowed;
    if (!allowed && selectors.feed) selectors.feed.innerHTML = '';
  }

  function renderComposeState() {
    if (!selectors.compose) return;
    const guest = selectors.compose.querySelector('[data-compose-guest]');
    const form = selectors.compose.querySelector('[data-compose-form]');
    if (guest) guest.hidden = Boolean(AIOCommunity.user);
    if (form) form.hidden = !AIOCommunity.user;
    const pending = selectors.compose.querySelector('[data-compose-approval]');
    if (pending && AIOCommunity.profile) {
      pending.textContent = AIOCommunity.profile.trusted || AIOCommunity.isAdmin()
        ? 'Twój wpis zostanie opublikowany od razu.'
        : 'Pierwsze wpisy nowych użytkowników wymagają zatwierdzenia przez moderatora.';
    }
    const officialWrap = selectors.compose.querySelector('[data-compose-official-wrap]');
    if (officialWrap) officialWrap.hidden = !AIOCommunity.isAdmin();
  }

  async function loadFeed(reset) {
    if (state.loading || !AIOCommunity.client) return;
    if (!isNewsPage && !AIOCommunity.user) { renderAccessState(); return; }
    state.loading = true;
    if (reset) { state.page = 0; state.rows = []; selectors.feed.innerHTML = '<div class="community-loading">Ładuję wpisy…</div>'; }
    if (selectors.more) selectors.more.disabled = true;
    try {
      const start = state.page * state.pageSize;
      const end = start + state.pageSize - 1;
      const fields = 'id,author_id,kind,category,title,content,status,pinned,locked,attachments,created_at,published_at' + (AIOCommunity.user ? ',author:community_profiles!community_posts_author_id_fkey(id,display_name,avatar_url,tuner_model,system_name,role)' : '');
      let query = AIOCommunity.client.from('community_posts').select(fields).order('pinned', { ascending: false }).order('created_at', { ascending: false }).range(start, end);
      if (state.mode === 'official') query = query.eq('kind', 'official').eq('status', 'published');
      else if (state.mode === 'mine') {
        if (!AIOCommunity.user) {
          AIOCommunity.openAuth('Zaloguj się, aby wyświetlić własne wpisy.');
          state.mode = 'latest';
          selectors.feed.innerHTML = '<div class="community-empty"><strong>Zaloguj się, aby zobaczyć własne wpisy.</strong></div>';
          return;
        }
        query = query.eq('author_id', AIOCommunity.user.id);
      } else {
        query = query.eq('status', 'published');
        if (state.mode === 'questions') query = query.in('category', ['pomoc', 'oscam', 'iptv', 'systemy']);
        if (state.mode === 'popular') query = query.order('created_at', { ascending: false });
      }
      if (state.category) query = query.eq('category', state.category);
      if (state.search) {
        const term = state.search.replace(/[,%()]/g, ' ').slice(0, 80);
        query = query.or('title.ilike.%' + term + '%,content.ilike.%' + term + '%');
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];
      await Promise.all(rows.map(row => AIOCommunity.preparePostMedia(row)));
      const enriched = await enrich(rows);
      state.rows = reset ? enriched : state.rows.concat(enriched);
      renderFeed();
      if (rows.length === state.pageSize) {
        state.page += 1;
        if (selectors.more) selectors.more.hidden = false;
      } else if (selectors.more) selectors.more.hidden = true;
    } catch (error) {
      selectors.feed.innerHTML = '<div class="community-error"><strong>Nie udało się pobrać wpisów.</strong><p>' + AIOCommunity.escape(AIOCommunity.friendlyError(error)) + '</p></div>';
    } finally {
      state.loading = false;
      if (selectors.more) selectors.more.disabled = false;
    }
  }

  async function enrich(rows) {
    if (!rows.length) return rows;
    const ids = rows.map(row => row.id);
    const reactionFields = AIOCommunity.user ? 'post_id,type,user_id' : 'post_id,type';
    const [reactions, comments] = await Promise.all([
      AIOCommunity.client.from('community_reactions').select(reactionFields).in('post_id', ids),
      AIOCommunity.user ? AIOCommunity.client.from('community_comments').select('post_id').in('post_id', ids).eq('status', 'published') : Promise.resolve({ data: [] })
    ]);
    const reactionMap = {};
    (reactions.data || []).forEach(item => {
      reactionMap[item.post_id] = reactionMap[item.post_id] || { helpful: 0, works: 0, thanks: 0, mine: '' };
      reactionMap[item.post_id][item.type] = (reactionMap[item.post_id][item.type] || 0) + 1;
      if (AIOCommunity.user && item.user_id === AIOCommunity.user.id) reactionMap[item.post_id].mine = item.type;
    });
    const commentMap = {};
    (comments.data || []).forEach(item => { commentMap[item.post_id] = (commentMap[item.post_id] || 0) + 1; });
    return rows.map(row => Object.assign({}, row, { reactions: reactionMap[row.id] || { helpful: 0, works: 0, thanks: 0, mine: '' }, comment_count: commentMap[row.id] || 0 }));
  }

  function renderFeed() {
    if (!state.rows.length) {
      selectors.feed.innerHTML = '<div class="community-empty"><strong>Nie znaleziono wpisów.</strong><p>Zmień filtr albo opublikuj pierwszy wpis w tej kategorii.</p></div>';
      return;
    }
    selectors.feed.innerHTML = state.rows.map(renderCard).join('');
  }

  function renderCard(post) {
    const author = post.author || {};
    const authorName = author.display_name || (post.kind === 'official' ? 'AIO-IPTV.pl' : 'Użytkownik');
    const authorTitle = AIOCommunity.user && post.author_id ? '<a href="profile.html?id=' + AIOCommunity.escapeAttr(post.author_id) + '">' + AIOCommunity.escape(authorName) + '</a>' : '<span>' + AIOCommunity.escape(authorName) + '</span>';
    const category = AIOCommunity.category(post.category);
    const official = post.kind === 'official';
    const images = Array.isArray(post.attachments) ? post.attachments.filter(item => item && item.url).slice(0, 4) : [];
    const canDelete = AIOCommunity.isOwner(post.author_id) || AIOCommunity.isAdmin();
    return '<article class="community-post-card ' + (post.pinned ? 'pinned ' : '') + (official ? 'official' : '') + '" data-post-id="' + AIOCommunity.escapeAttr(post.id) + '">' +
      '<header class="community-post-head">' + AIOCommunity.avatarHtml(author, authorName) + '<div class="community-post-author"><strong>' + authorTitle + (author.role && author.role !== 'user' ? '<span class="community-role ' + AIOCommunity.escapeAttr(author.role) + '">' + AIOCommunity.escape(AIOCommunity.roleLabel(author.role)) + '</span>' : '') + '</strong><small>' + AIOCommunity.escape([author.tuner_model, author.system_name].filter(Boolean).join(' • ') || (official ? 'Oficjalny wpis AIO-IPTV.pl' : 'Użytkownik Społeczności AIO')) + '</small></div>' +
      '<div class="community-post-meta"><span>' + AIOCommunity.escape(AIOCommunity.timeAgo(post.created_at)) + '</span>' + (post.status !== 'published' ? '<br><span class="community-status-pill pending">Oczekuje</span>' : '') + '</div></header>' +
      '<div class="community-post-content"><div class="community-post-tags">' + (official ? '<span class="community-status-pill official">✓ Oficjalne</span>' : '') + (post.pinned ? '<span class="community-status-pill pinned">📌 Przypięte</span>' : '') + '<span class="community-category">' + AIOCommunity.escape(category.icon + ' ' + category.label) + '</span></div>' +
      '<h2><a href="post.html?id=' + AIOCommunity.escapeAttr(post.id) + '">' + AIOCommunity.escape(post.title) + '</a></h2><div class="community-post-text">' + AIOCommunity.formatText(post.content, 700) + '</div>' + renderImages(images) + '</div>' +
      '<footer class="community-post-footer">' + reactionButton(post, 'helpful', '👍 Pomocne') + reactionButton(post, 'works', '✅ Działa') + reactionButton(post, 'thanks', '❤️ Dziękuję') +
      '<a class="community-action community-open" href="post.html?id=' + AIOCommunity.escapeAttr(post.id) + '">' + (AIOCommunity.user ? '💬 ' + Number(post.comment_count || 0) + ' odpowiedzi' : '🔐 Dyskusja po zalogowaniu') + '</a><button class="community-action" type="button" data-report-post>⚑ Zgłoś</button>' + (canDelete ? '<button class="community-action danger" type="button" data-delete-post>Usuń</button>' : '') + '</footer></article>';
  }

  function renderImages(images) {
    if (!images.length) return '';
    return '<div class="community-media-grid ' + (images.length === 1 ? 'one' : '') + '">' + images.map(item => '<img src="' + AIOCommunity.escapeAttr(item.url) + '" alt="Zdjęcie do wpisu" loading="lazy" data-community-image>').join('') + '</div>';
  }

  function reactionButton(post, type, label) {
    const reactions = post.reactions || {};
    return '<button class="community-reaction ' + (reactions.mine === type ? 'active' : '') + '" type="button" data-reaction="' + type + '">' + label + ' <span>' + Number(reactions[type] || 0) + '</span></button>';
  }

  async function handleActions(event) {
    const card = event.target.closest('[data-post-id]');
    if (!card) return;
    const postId = card.dataset.postId;
    const reaction = event.target.closest('[data-reaction]');
    if (reaction) {
      event.preventDefault();
      if (!AIOCommunity.requireAuth('Zaloguj się, aby reagować na wpisy.')) return;
      const type = reaction.dataset.reaction;
      const post = state.rows.find(item => item.id === postId);
      if (!post) return;
      try {
        if (post.reactions.mine === type) {
          const result = await AIOCommunity.client.from('community_reactions').delete().eq('post_id', postId).eq('user_id', AIOCommunity.user.id);
          if (result.error) throw result.error;
        } else {
          const result = await AIOCommunity.client.from('community_reactions').upsert({ post_id: postId, user_id: AIOCommunity.user.id, type: type }, { onConflict: 'post_id,user_id' });
          if (result.error) throw result.error;
        }
        await loadFeed(true);
      } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
    }
    const report = event.target.closest('[data-report-post]');
    if (report) { event.preventDefault(); reportPost(postId); }
    const del = event.target.closest('[data-delete-post]');
    if (del) {
      event.preventDefault();
      if (!confirm('Usunąć ten wpis? Tej operacji nie można cofnąć.')) return;
      const result = await AIOCommunity.client.from('community_posts').delete().eq('id', postId);
      if (result.error) AIOCommunity.showToast(AIOCommunity.friendlyError(result.error), 'error');
      else { AIOCommunity.showToast('Wpis został usunięty.', 'success'); loadFeed(true); }
    }
  }

  async function reportPost(postId) {
    if (!AIOCommunity.requireAuth('Zaloguj się, aby zgłosić wpis moderatorowi.')) return;
    const reason = prompt('Powód zgłoszenia (np. dane dostępowe, obraźliwa treść, spam):');
    if (!reason) return;
    const result = await AIOCommunity.client.from('community_reports').insert({ reporter_id: AIOCommunity.user.id, target_type: 'post', target_id: postId, reason: reason.slice(0, 120) });
    if (result.error) AIOCommunity.showToast(AIOCommunity.friendlyError(result.error), 'error'); else AIOCommunity.showToast('Zgłoszenie zostało przekazane moderatorowi.', 'success');
  }

  function previewImages(event) {
    const preview = document.querySelector('[data-compose-preview]');
    if (!preview) return;
    preview.innerHTML = '';
    Array.from(event.target.files || []).slice(0, Number(AIOCommunity.config.maxImagesPerPost || 4)).forEach(file => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = URL.createObjectURL(file);
      image.alt = file.name;
      image.onload = () => URL.revokeObjectURL(image.src);
      figure.appendChild(image);
      preview.appendChild(figure);
    });
  }

  async function submitPost(event) {
    event.preventDefault();
    if (!AIOCommunity.requireAuth()) return;
    if (AIOCommunity.isBanned()) { AIOCommunity.showToast('Publikowanie z tego konta jest czasowo zablokowane.', 'error'); return; }
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const title = form.querySelector('[data-compose-title]').value.trim();
    const content = form.querySelector('[data-compose-content]').value.trim();
    const category = form.querySelector('[data-compose-category]').value;
    const files = form.querySelector('[data-compose-images]').files;
    if (title.length < 6 || title.length > 140) { AIOCommunity.showToast('Tytuł powinien mieć od 6 do 140 znaków.', 'error'); return; }
    if (content.length < 20 || content.length > 6000) { AIOCommunity.showToast('Treść powinna mieć od 20 do 6000 znaków.', 'error'); return; }
    if (/cccam:\/\/[^\s]+:[^\s]+@|\b(?:user|username|login|password|pass)\s*[=:]\s*\S+/i.test(content)) {
      const proceed = confirm('Treść może zawierać dane dostępowe. Nigdy nie publikuj loginów, haseł ani aktywnych linii. Czy na pewno treść jest bezpieczna?');
      if (!proceed) return;
    }
    button.disabled = true;
    button.textContent = 'Publikuję…';
    try {
      const attachments = await AIOCommunity.uploadImages(files, 'posts');
      const officialInput = form.querySelector('[data-compose-official]');
      const kind = AIOCommunity.isAdmin() && officialInput && officialInput.checked ? 'official' : 'community';
      const result = await AIOCommunity.client.from('community_posts').insert({ author_id: AIOCommunity.user.id, title, content, category, attachments, kind }).select('id,status').single();
      if (result.error) throw result.error;
      form.reset();
      document.querySelector('[data-compose-preview]').innerHTML = '';
      AIOCommunity.showToast(result.data.status === 'published' ? 'Wpis został opublikowany.' : 'Wpis zapisano i przekazano do zatwierdzenia.', 'success');
      loadFeed(true);
      window.setTimeout(() => document.querySelector('[data-community-feed]').scrollIntoView({ behavior: 'smooth' }), 200);
    } catch (error) {
      AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Opublikuj wpis';
    }
  }

  async function loadStats() {
    if (!AIOCommunity.user) return;
    const set = (key, value) => document.querySelectorAll('[data-community-stat="' + key + '"]').forEach(el => { el.textContent = Number(value || 0).toLocaleString('pl-PL'); });
    const [posts, comments, users] = await Promise.all([
      AIOCommunity.client.from('community_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      AIOCommunity.client.from('community_comments').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      AIOCommunity.client.from('community_profiles').select('id', { count: 'exact', head: true })
    ]);
    set('posts', posts.count); set('comments', comments.count); set('users', users.count);
  }

  function subscribe() {
    if (state.subscribed) return;
    state.subscribed = true;
    AIOCommunity.client.channel('community-feed-public')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts' }, () => loadFeed(true))
      .subscribe();
  }

  boot();
})();
