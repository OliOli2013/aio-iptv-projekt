/* Społeczność AIO — długie wpisy, linki i bezpieczne zapisy, 2026-07-28 community10 */
(function () {
  'use strict';

  const state = { page: 0, search: '', category: '', mode: 'latest', loading: false, rows: [], pageSize: 12 };
  const selectors = {};
  let isNewsPage = false;

  function postTypeInfo(value) {
    const list = Array.isArray(AIOCommunity.config && AIOCommunity.config.postTypes) ? AIOCommunity.config.postTypes : [];
    return list.find(item => item.id === value) || list[0] || { id: 'problem', label: 'Problem / pytanie', icon: '❓' };
  }

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
    const requestedMode = new URLSearchParams(location.search).get('mode');
    const allowedModes = new Set(['latest','questions','unanswered','solved','popular','official','mine']);
    state.mode = isNewsPage ? 'official' : (allowedModes.has(requestedMode) ? requestedMode : 'latest');
    fillCategories();
    syncActiveTab();
    bind();
    setupComposeCounter();
    renderComposeState();
    renderAccessState();
    if (!AIOCommunity.backendReady) {
      AIOCommunity.showSetupError(new Error('Baza społeczności nie została jeszcze utworzona.'));
      return;
    }
    if (!isNewsPage && (!AIOCommunity.user || AIOCommunity.ipBlocked)) return;
    await Promise.all([loadFeed(true), loadStats()]);
    subscribe();
  }

  function fillCategories() {
    if (!selectors.category || !AIOCommunity.config) return;
    selectors.category.innerHTML = '<option value="">Wszystkie kategorie</option>' + AIOCommunity.config.categories.map(item => '<option value="' + AIOCommunity.escapeAttr(item.id) + '">' + AIOCommunity.escape(item.icon + ' ' + item.label) + '</option>').join('');
    const composeCategory = document.querySelector('[data-compose-category]');
    if (composeCategory) composeCategory.innerHTML = AIOCommunity.config.categories.map(item => '<option value="' + AIOCommunity.escapeAttr(item.id) + '">' + AIOCommunity.escape(item.icon + ' ' + item.label) + '</option>').join('');
  }

  function syncActiveTab() {
    document.querySelectorAll('[data-community-mode]').forEach(item => {
      item.classList.toggle('active', item.dataset.communityMode === state.mode);
    });
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
      const url = new URL(location.href);
      if (state.mode === 'latest') url.searchParams.delete('mode'); else url.searchParams.set('mode', state.mode);
      history.replaceState({}, '', url);
      loadFeed(true);
    }));
    if (selectors.more) selectors.more.addEventListener('click', () => loadFeed(false));
    document.addEventListener('aio-community-auth', async () => {
      renderComposeState();
      renderAccessState();
      if (isNewsPage || (AIOCommunity.user && !AIOCommunity.ipBlocked)) { await loadFeed(true); await loadStats(); subscribe(); }
    });
    document.addEventListener('click', handleActions);
    document.querySelectorAll('[data-compose-template]').forEach(button => button.addEventListener('click', () => applyPostTemplate(button.dataset.composeTemplate)));
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

  function applyPostTemplate(type) {
    const category = document.querySelector('[data-compose-category]');
    const postType = document.querySelector('[data-compose-post-type]');
    const content = document.querySelector('[data-compose-content]');
    const status = document.querySelector('[data-compose-template-status]');
    if (!category || !content) return;
    const templates = {
      tuner: { category: 'pomoc', postType: 'problem', text: 'Model tunera:\nSystem i wersja:\nWersja Pythona:\n\nCo nie działa:\n\nCo zostało wykonane przed wystąpieniem problemu:\n\nDokładny komunikat błędu:\n' },
      plugin: { category: 'wtyczki', postType: 'problem', text: 'Model tunera:\nSystem i wersja:\nNazwa i wersja wtyczki:\n\nOpis problemu:\n\nCzynność, przy której pojawia się błąd:\n\nTreść błędu / crashlog:\n' },
      channels: { category: 'kanaly', postType: 'problem', text: 'Model tunera:\nSystem i wersja:\nPozycje satelitarne / rodzaj listy:\n\nProblem z listą kanałów, piconami lub EPG:\n\nCo zostało już sprawdzone:\n' },
      iptv: { category: 'iptv', postType: 'problem', text: 'Model tunera:\nSystem i wersja:\nRodzaj źródła: M3U / Xtream / MAC Portal:\n\nOpis problemu:\n\nKomunikat błędu:\n\nCzy źródło działa w innej aplikacji:\n' },
      solution: { category: 'inne', postType: 'guide', text: 'Temat, którego dotyczy poradnik lub rozwiązanie:\n\nSprawdzone rozwiązanie krok po kroku:\n1. \n2. \n3. \n\nSystemy / tunery, na których rozwiązanie zostało przetestowane:\n' },
      update: { category: 'wtyczki', postType: 'update', text: 'Nazwa projektu i wersja:\nData wydania:\n\nNajważniejsze zmiany:\n✅ \n✅ \n✅ \n\nSposób instalacji lub aktualizacji:\n\nDodatkowe informacje:\n' },
      information: { category: 'inne', postType: 'information', text: 'Temat informacji:\n\nNajważniejsze szczegóły:\n\nKogo dotyczy komunikat:\n\nDodatkowe informacje lub link:\n' },
      'system-update': { category: 'systemy', postType: 'update', text: 'Nazwa systemu i wersja:\nModel tunera:\nData przygotowania:\n\nNajważniejsze elementy konfiguracji:\n✅ \n✅ \n✅ \n\nInstrukcja instalacji:\n\nLink i dodatkowe informacje:\n' }
    };
    const selected = templates[type];
    if (!selected) return;
    if (content.value.trim() && !confirm('Zastąpić obecną treść szablonem kreatora?')) return;
    category.value = selected.category;
    if (postType) postType.value = selected.postType;
    content.value = selected.text;
    content.dispatchEvent(new Event('input', { bubbles: true }));
    content.focus();
    if (status) status.textContent = 'Szablon został wstawiony. Uzupełnij pola i usuń te, które nie dotyczą Twojego wpisu.';
  }

  function setupComposeCounter() {
    const input = document.querySelector('[data-compose-content]');
    const counter = document.querySelector('[data-compose-count]');
    if (!input || !counter) return;
    const maximum = Number(AIOCommunity.config.maxPostLength || 50000);
    input.maxLength = maximum;
    const update = () => {
      counter.textContent = AIOCommunity.characterLabel(input.value.length, maximum);
      counter.classList.toggle('warning', input.value.length > maximum * 0.9);
    };
    input.addEventListener('input', update);
    update();
  }

  function renderAccessState() {
    const gate = document.querySelector('[data-community-access-gate]');
    const content = document.querySelector('[data-community-private-content]');
    const allowed = isNewsPage || Boolean(AIOCommunity.user && !AIOCommunity.ipBlocked);
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
    if (!isNewsPage && (!AIOCommunity.user || AIOCommunity.ipBlocked)) { renderAccessState(); return; }
    state.loading = true;
    if (reset) { state.page = 0; state.rows = []; selectors.feed.innerHTML = '<div class="community-loading">Ładuję wpisy…</div>'; }
    if (selectors.more) selectors.more.disabled = true;
    try {
      const start = state.page * state.pageSize;
      const end = start + state.pageSize - 1;
      const fields = 'id,author_id,kind,post_type,category,title,content,status,pinned,locked,attachments,created_at,published_at,solved,best_comment_id,solved_at,comment_count,reaction_count,edited_at,edited_by,edit_reason' + (AIOCommunity.user ? ',author:community_profiles!community_posts_author_id_fkey(id,display_name,avatar_url,tuner_model,system_name,role)' : '');
      let query = AIOCommunity.client.from('community_posts').select(fields).order('pinned', { ascending: false });
      if (state.mode === 'popular') query = query.order('reaction_count', { ascending: false }).order('comment_count', { ascending: false }).order('created_at', { ascending: false });
      else query = query.order('created_at', { ascending: false });
      query = query.range(start, end);
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
        if (state.mode === 'questions') query = query.eq('post_type', 'problem');
        if (state.mode === 'unanswered') query = query.eq('post_type', 'problem').eq('kind', 'community').eq('solved', false).eq('comment_count', 0);
        if (state.mode === 'solved') query = query.eq('post_type', 'problem').eq('kind', 'community').eq('solved', true);
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
    const reactions = await AIOCommunity.client.from('community_reactions').select(reactionFields).in('post_id', ids);
    const reactionMap = {};
    (reactions.data || []).forEach(item => {
      reactionMap[item.post_id] = reactionMap[item.post_id] || { helpful: 0, works: 0, thanks: 0, mine: '' };
      reactionMap[item.post_id][item.type] = (reactionMap[item.post_id][item.type] || 0) + 1;
      if (AIOCommunity.user && item.user_id === AIOCommunity.user.id) reactionMap[item.post_id].mine = item.type;
    });
    return rows.map(row => Object.assign({}, row, { reactions: reactionMap[row.id] || { helpful: 0, works: 0, thanks: 0, mine: '' }, comment_count: Number(row.comment_count || 0), reaction_count: Number(row.reaction_count || 0) }));
  }

  function renderFeed() {
    if (!state.rows.length) {
      const messages = { unanswered: ['Brak pytań bez odpowiedzi.', 'To dobra wiadomość — wszystkie widoczne pytania otrzymały już odpowiedź.'], solved: ['Brak rozwiązanych tematów.', 'Autor wpisu lub administrator może oznaczyć problem jako rozwiązany.'], popular: ['Brak popularnych dyskusji.', 'Dodaj komentarz lub reakcję, aby pomóc wyróżnić wartościowe wpisy.'] };
      const message = messages[state.mode] || ['Nie znaleziono wpisów.', 'Zmień filtr albo opublikuj pierwszy wpis w tej kategorii.'];
      selectors.feed.innerHTML = '<div class="community-empty"><strong>' + message[0] + '</strong><p>' + message[1] + '</p></div>';
      return;
    }
    selectors.feed.innerHTML = state.rows.map(renderCard).join('');
  }

  function renderCard(post) {
    const author = post.author || {};
    const authorName = author.display_name || (post.kind === 'official' ? 'AIO-IPTV.pl' : 'Użytkownik');
    const authorTitle = AIOCommunity.user && post.author_id ? '<a href="profile.html?id=' + AIOCommunity.escapeAttr(post.author_id) + '">' + AIOCommunity.escape(authorName) + '</a>' : '<span>' + AIOCommunity.escape(authorName) + '</span>';
    const category = AIOCommunity.category(post.category);
    const typeInfo = postTypeInfo(post.post_type || (post.kind === 'official' ? 'update' : 'problem'));
    const isProblem = typeInfo.id === 'problem';
    const official = post.kind === 'official';
    const images = Array.isArray(post.attachments) ? post.attachments.filter(item => item && item.url).slice(0, 4) : [];
    const canDelete = AIOCommunity.isOwner(post.author_id) || AIOCommunity.isAdmin();
    const previewLimit = Number(official ? (AIOCommunity.config.officialPreviewLength || 3200) : (AIOCommunity.config.postPreviewLength || 1400));
    const longPost = String(post.content || '').length > previewLimit;
    const textHtml = longPost
      ? '<div class="community-post-text" data-post-preview>' + AIOCommunity.formatText(post.content, previewLimit) + '</div><div class="community-post-text" data-post-full hidden>' + AIOCommunity.formatText(post.content) + '</div><button class="community-expand" type="button" data-toggle-post>Rozwiń cały wpis <span aria-hidden="true">↓</span></button>'
      : '<div class="community-post-text">' + AIOCommunity.formatText(post.content) + '</div>';
    return '<article class="community-post-card ' + (post.pinned ? 'pinned ' : '') + (official ? 'official' : '') + '" data-post-id="' + AIOCommunity.escapeAttr(post.id) + '">' +
      '<header class="community-post-head">' + AIOCommunity.avatarHtml(author, authorName) + '<div class="community-post-author"><strong>' + authorTitle + (author.role && author.role !== 'user' ? '<span class="community-role ' + AIOCommunity.escapeAttr(author.role) + '">' + AIOCommunity.escape(AIOCommunity.roleLabel(author.role)) + '</span>' : '') + '</strong><small>' + AIOCommunity.escape([author.tuner_model, author.system_name].filter(Boolean).join(' • ') || (official ? 'Oficjalny wpis AIO-IPTV.pl' : 'Użytkownik Społeczności AIO')) + '</small></div>' +
      '<div class="community-post-meta"><span>' + AIOCommunity.escape(AIOCommunity.timeAgo(post.created_at)) + '</span>' + (post.status !== 'published' ? '<br><span class="community-status-pill pending">Oczekuje</span>' : '') + '</div></header>' +
      '<div class="community-post-content"><div class="community-post-tags">' + (official ? '<span class="community-status-pill official">✓ Oficjalne</span>' : '') + (post.pinned ? '<span class="community-status-pill pinned">📌 Przypięte</span>' : '') + '<span class="community-status-pill post-type ' + AIOCommunity.escapeAttr(typeInfo.id) + '">' + AIOCommunity.escape(typeInfo.icon + ' ' + typeInfo.label) + '</span>' + (isProblem && post.solved ? '<span class="community-status-pill solved">✅ Rozwiązane</span>' : (isProblem && Number(post.comment_count || 0) === 0 ? '<span class="community-status-pill unanswered">❓ Bez odpowiedzi</span>' : '')) + '<span class="community-category">' + AIOCommunity.escape(category.icon + ' ' + category.label) + '</span></div>' +
      '<h2><a href="post.html?id=' + AIOCommunity.escapeAttr(post.id) + '">' + AIOCommunity.escape(post.title) + '</a></h2>' + textHtml + (post.edited_at ? '<p class="community-edit-note">✏️ Wpis edytowany przez moderację' + (post.edit_reason ? ': ' + AIOCommunity.escape(post.edit_reason) : '') + '.</p>' : '') + renderImages(images) + '</div>' +
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
    const expand = event.target.closest('[data-toggle-post]');
    if (expand) {
      event.preventDefault();
      const preview = card.querySelector('[data-post-preview]');
      const full = card.querySelector('[data-post-full]');
      if (!preview || !full) return;
      const opening = full.hidden;
      preview.hidden = opening;
      full.hidden = !opening;
      expand.innerHTML = opening ? 'Zwiń wpis <span aria-hidden="true">↑</span>' : 'Rozwiń cały wpis <span aria-hidden="true">↓</span>';
      return;
    }
    const reaction = event.target.closest('[data-reaction]');
    if (reaction) {
      event.preventDefault();
      if (!AIOCommunity.requireAuth('Zaloguj się, aby reagować na wpisy.')) return;
      const type = reaction.dataset.reaction;
      const post = state.rows.find(item => item.id === postId);
      if (!post) return;
      try {
        if (!AIOCommunity.requireWritable('Zaloguj się, aby reagować na wpisy.')) return;
        await AIOCommunity.edgeCall('write', { action: 'set_reaction', postId, type });
        await loadFeed(true);
      } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
    }
    const report = event.target.closest('[data-report-post]');
    if (report) { event.preventDefault(); reportPost(postId); }
    const del = event.target.closest('[data-delete-post]');
    if (del) {
      event.preventDefault();
      if (!confirm('Usunąć ten wpis? Tej operacji nie można cofnąć.')) return;
      try {
        await AIOCommunity.edgeCall('write', { action: 'delete_post', id: postId });
        AIOCommunity.showToast('Wpis został usunięty.', 'success');
        loadFeed(true);
      } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
    }
  }

  async function reportPost(postId) {
    if (!AIOCommunity.requireAuth('Zaloguj się, aby zgłosić wpis moderatorowi.')) return;
    const reason = prompt('Powód zgłoszenia (np. dane dostępowe, obraźliwa treść, spam):');
    if (!reason) return;
    try {
      await AIOCommunity.edgeCall('write', { action: 'report', targetType: 'post', targetId: postId, reason: reason.slice(0, 120) });
      AIOCommunity.showToast('Zgłoszenie zostało przekazane moderatorowi.', 'success');
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
  }

  function previewImages(event) {
    const preview = document.querySelector('[data-compose-preview]');
    if (!preview) return;
    const input = event.target;
    const maxCount = Number(AIOCommunity.config.maxImagesPerPost || 4);
    let files = Array.from(input.files || []);
    if (files.length > maxCount) {
      files = files.slice(0, maxCount);
      try {
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        input.files = transfer.files;
      } catch (_) {
        input.value = '';
        files = [];
      }
      AIOCommunity.showToast('Do jednego wpisu można dodać maksymalnie ' + maxCount + ' zdjęcia.', 'error');
    }
    preview.innerHTML = '';
    files.forEach(file => {
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
    if (!AIOCommunity.requireWritable()) return;
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const title = form.querySelector('[data-compose-title]').value.trim();
    const content = form.querySelector('[data-compose-content]').value.trim();
    const category = form.querySelector('[data-compose-category]').value;
    const postType = form.querySelector('[data-compose-post-type]') ? form.querySelector('[data-compose-post-type]').value : 'problem';
    const files = form.querySelector('[data-compose-images]').files;
    const allowedPostTypes = new Set((AIOCommunity.config.postTypes || []).map(item => item.id));
    if (!allowedPostTypes.has(postType)) { AIOCommunity.showToast('Wybierz prawidłowy rodzaj wpisu.', 'error'); return; }
    const maxImages = Number(AIOCommunity.config.maxImagesPerPost || 4);
    if (files.length > maxImages) { AIOCommunity.showToast('Do wpisu można dodać maksymalnie ' + maxImages + ' zdjęcia.', 'error'); return; }
    if (title.length < 6 || title.length > 140) { AIOCommunity.showToast('Tytuł powinien mieć od 6 do 140 znaków.', 'error'); return; }
    const maxPostLength = Number(AIOCommunity.config.maxPostLength || 50000);
    if (content.length < 20 || content.length > maxPostLength) { AIOCommunity.showToast('Treść powinna mieć od 20 do ' + maxPostLength.toLocaleString('pl-PL') + ' znaków.', 'error'); return; }
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
      const result = await AIOCommunity.edgeCall('write', { action: 'create_post', title, content, category, postType, attachments, kind });
      const saved = result.data || {};
      form.reset();
      document.querySelector('[data-compose-preview]').innerHTML = '';
      const counter = document.querySelector('[data-compose-count]');
      if (counter) counter.textContent = AIOCommunity.characterLabel(0, Number(AIOCommunity.config.maxPostLength || 50000));
      AIOCommunity.showToast(saved.status === 'published' ? 'Wpis został opublikowany.' : 'Wpis zapisano i przekazano do zatwierdzenia.', 'success');
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
