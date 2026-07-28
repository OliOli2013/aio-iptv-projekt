/* Społeczność AIO — pełne długie wpisy, linki i bezpieczne zapisy, 2026-07-28 community10 */
(function () {
  'use strict';
  let postId = '';
  let post = null;
  let comments = [];
  let replyTo = null;

  function postTypeInfo(value) {
    const list = Array.isArray(AIOCommunity.config && AIOCommunity.config.postTypes) ? AIOCommunity.config.postTypes : [];
    return list.find(item => item.id === value) || list[0] || { id: 'problem', label: 'Problem / pytanie', icon: '❓' };
  }

  function boot() {
    if (!window.AIOCommunity) return;
    if (AIOCommunity.ready) init(); else document.addEventListener('aio-community-ready', init, { once: true });
  }

  async function init() {
    const root = document.querySelector('[data-community-post]');
    if (!root) return;
    postId = AIOCommunity.queryParam('id') || '';
    if (!postId) {
      root.innerHTML = '<div class="community-error">Brak identyfikatora wpisu.</div>';
      return;
    }
    bind();
    setupCommentCounter();
    if (AIOCommunity.ipBlocked) { renderBlocked(root); return; }
    if (!AIOCommunity.backendReady) {
      AIOCommunity.showSetupError(new Error('Baza społeczności nie została jeszcze uruchomiona.'));
      return;
    }
    await loadAll();
    subscribe();
  }

  function bind() {
    document.addEventListener('aio-community-auth', () => {
      renderCommentForm();
      const root = document.querySelector('[data-community-post]');
      if (AIOCommunity.ipBlocked) renderBlocked(root); else loadAll();
    });
    document.addEventListener('click', async event => {
      const reaction = event.target.closest('[data-post-reaction]');
      if (reaction) { event.preventDefault(); await toggleReaction(reaction.dataset.postReaction); }
      const reply = event.target.closest('[data-comment-reply]');
      if (reply) {
        event.preventDefault();
        replyTo = comments.find(item => item.id === reply.dataset.commentReply) || null;
        renderReplyIndicator();
        const input = document.querySelector('[data-comment-content]');
        if (input) input.focus();
      }
      const cancelReply = event.target.closest('[data-cancel-reply]');
      if (cancelReply) { replyTo = null; renderReplyIndicator(); }
      const reportPost = event.target.closest('[data-report-current-post]');
      if (reportPost) report('post', postId);
      const reportComment = event.target.closest('[data-report-comment]');
      if (reportComment) report('comment', reportComment.dataset.reportComment);
      const deletePost = event.target.closest('[data-delete-current-post]');
      if (deletePost) deleteCurrentPost();
      const deleteComment = event.target.closest('[data-delete-comment]');
      if (deleteComment) deleteCurrentComment(deleteComment.dataset.deleteComment);
      const follow = event.target.closest('[data-follow-post]');
      if (follow) toggleFollow(follow);
      const solved = event.target.closest('[data-toggle-solved]');
      if (solved) toggleSolved();
      const best = event.target.closest('[data-best-answer]');
      if (best) setBestAnswer(best.dataset.bestAnswer);
    });
    const form = document.querySelector('[data-comment-form]');
    if (form) form.addEventListener('submit', submitComment);
  }

  function setupCommentCounter() {
    const input = document.querySelector('[data-comment-content]');
    const counter = document.querySelector('[data-comment-count]');
    if (!input || !counter) return;
    const maximum = Number(AIOCommunity.config.maxCommentLength || 10000);
    input.maxLength = maximum;
    const update = () => {
      counter.textContent = AIOCommunity.characterLabel(input.value.length, maximum);
      counter.classList.toggle('warning', input.value.length > maximum * 0.9);
    };
    input.addEventListener('input', update);
    update();
  }

  function renderBlocked(root) {
    post = null;
    if (!root) return;
    root.innerHTML = '<section class="community-access-gate compact"><div class="community-access-icon">⛔</div><p class="eyebrow">Dostęp zablokowany</p><h1>Ten adres IP nie ma dostępu do Społeczności AIO</h1><p>Blokada została nałożona przez administrację w celu ochrony użytkowników i treści.</p><a class="button" href="contact.html">Kontakt z administratorem</a></section>';
    const commentsRoot = document.querySelector('[data-community-comments]');
    if (commentsRoot) commentsRoot.innerHTML = '';
    renderCommentForm();
  }

  async function loadAll() {
    const root = document.querySelector('[data-community-post]');
    root.innerHTML = '<div class="community-loading">Ładuję wpis…</div>';
    try {
      const fields = 'id,author_id,kind,post_type,category,title,content,status,pinned,locked,attachments,created_at,published_at,solved,best_comment_id,solved_at,solved_by,comment_count,reaction_count,edited_at,edited_by,edit_reason' + (AIOCommunity.user ? ',author:community_profiles!community_posts_author_id_fkey(id,display_name,avatar_url,tuner_model,system_name,role)' : '');
      const result = await AIOCommunity.client.from('community_posts').select(fields).eq('id', postId).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        if (!AIOCommunity.user) return renderPrivateGate(root);
        throw new Error('Wpis nie istnieje albo nie masz dostępu do jego treści.');
      }
      post = result.data;
      await AIOCommunity.preparePostMedia(post);
      const [reactionResult, commentResult, followResult] = await Promise.all([
        AIOCommunity.client.from('community_reactions').select(AIOCommunity.user ? 'type,user_id' : 'type').eq('post_id', postId),
        AIOCommunity.user ? AIOCommunity.client.from('community_comments').select('id,post_id,author_id,parent_id,content,status,created_at,updated_at,author:community_profiles!community_comments_author_id_fkey(id,display_name,avatar_url,tuner_model,system_name,role)').eq('post_id', postId).order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
        AIOCommunity.user ? AIOCommunity.client.from('community_subscriptions').select('post_id').eq('post_id', postId).eq('user_id', AIOCommunity.user.id).maybeSingle() : Promise.resolve({ data: null })
      ]);
      post.reactions = { helpful: 0, works: 0, thanks: 0, mine: '' };
      (reactionResult.data || []).forEach(item => {
        post.reactions[item.type] = (post.reactions[item.type] || 0) + 1;
        if (AIOCommunity.user && item.user_id === AIOCommunity.user.id) post.reactions.mine = item.type;
      });
      post.following = Boolean(followResult.data);
      comments = commentResult.data || [];
      await Promise.all(comments.map(async item => { if (item.author) item.author = await AIOCommunity.prepareProfile(item.author); }));
      renderPost();
      renderComments();
      renderCommentForm();
      document.title = post.title + ' — Społeczność AIO';
    } catch (error) {
      root.innerHTML = '<div class="community-error"><strong>Nie udało się otworzyć wpisu.</strong><p>' + AIOCommunity.escape(AIOCommunity.friendlyError(error)) + '</p><a class="button" href="community.html">Wróć do społeczności</a></div>';
    }
  }

  function renderPrivateGate(root) {
    post = null;
    const commentsRoot = document.querySelector('[data-community-comments]');
    if (commentsRoot) commentsRoot.innerHTML = '<div class="community-private-note"><strong>Komentarze są dostępne po zalogowaniu.</strong></div>';
    root.innerHTML = '<section class="community-access-gate compact"><div class="community-access-icon">🔒</div><p class="eyebrow">Treść dla członków społeczności</p><h1>Zaloguj się, aby przeczytać ten wpis</h1><p>Posty użytkowników, komentarze, profile i zdjęcia są dostępne wyłącznie dla zalogowanych osób.</p><div class="community-hero-actions"><button class="button primary" type="button" data-community-login>Zaloguj się / utwórz konto</button><a class="button" href="news.html">Publiczne aktualności AIO</a></div></section>';
    renderCommentForm();
  }

  function renderPost() {
    const root = document.querySelector('[data-community-post]');
    const author = post.author || {};
    const authorName = author.display_name || (post.kind === 'official' ? 'AIO-IPTV.pl' : 'Użytkownik');
    const authorTitle = AIOCommunity.user && post.author_id ? '<a href="profile.html?id=' + AIOCommunity.escapeAttr(post.author_id) + '">' + AIOCommunity.escape(authorName) + '</a>' : '<span>' + AIOCommunity.escape(authorName) + '</span>';
    const category = AIOCommunity.category(post.category);
    const typeInfo = postTypeInfo(post.post_type || (post.kind === 'official' ? 'update' : 'problem'));
    const isProblem = typeInfo.id === 'problem';
    const images = Array.isArray(post.attachments) ? post.attachments.filter(item => item && item.url).slice(0, 4) : [];
    const canDelete = AIOCommunity.isOwner(post.author_id) || AIOCommunity.isAdmin();
    const canManageSolution = isProblem && (AIOCommunity.isOwner(post.author_id) || AIOCommunity.isAdmin());
    root.innerHTML = '<article class="community-post-card ' + (post.pinned ? 'pinned ' : '') + (post.kind === 'official' ? 'official' : '') + '">' +
      '<header class="community-post-head">' + AIOCommunity.avatarHtml(author, authorName) + '<div class="community-post-author"><strong>' + authorTitle + (author.role && author.role !== 'user' ? '<span class="community-role ' + AIOCommunity.escapeAttr(author.role) + '">' + AIOCommunity.escape(AIOCommunity.roleLabel(author.role)) + '</span>' : '') + '</strong><small>' + AIOCommunity.escape([author.tuner_model, author.system_name].filter(Boolean).join(' • ') || 'Społeczność AIO') + '</small></div><div class="community-post-meta">' + AIOCommunity.escape(AIOCommunity.formatDate(post.created_at)) + '</div></header>' +
      '<div class="community-post-content"><div class="community-post-tags">' + (post.kind === 'official' ? '<span class="community-status-pill official">✓ Oficjalne</span>' : '') + (post.pinned ? '<span class="community-status-pill pinned">📌 Przypięte</span>' : '') + (post.status !== 'published' ? '<span class="community-status-pill pending">Oczekuje na zatwierdzenie</span>' : '') + '<span class="community-status-pill post-type ' + AIOCommunity.escapeAttr(typeInfo.id) + '">' + AIOCommunity.escape(typeInfo.icon + ' ' + typeInfo.label) + '</span>' + (isProblem ? (post.solved ? '<span class="community-status-pill solved">✅ Problem rozwiązany</span>' : '<span class="community-status-pill unanswered">❓ Oczekuje na rozwiązanie</span>') : '') + '<span class="community-category">' + AIOCommunity.escape(category.icon + ' ' + category.label) + '</span></div><h1>' + AIOCommunity.escape(post.title) + '</h1>' + (isProblem && post.solved ? '<div class="community-solution-banner"><strong>✅ Temat rozwiązany</strong><span>' + (post.best_comment_id ? 'Najlepsza odpowiedź została wyróżniona poniżej.' : 'Autor oznaczył problem jako rozwiązany.') + '</span></div>' : '') + '<div class="community-post-text">' + AIOCommunity.formatText(post.content) + '</div>' + (post.edited_at ? '<p class="community-edit-note">✏️ Wpis został edytowany przez moderację' + (post.edit_reason ? ': ' + AIOCommunity.escape(post.edit_reason) : '') + '.</p>' : '') + renderImages(images) + '</div>' +
      '<footer class="community-post-footer">' + reactionButton('helpful', '👍 Pomocne') + reactionButton('works', '✅ Działa') + reactionButton('thanks', '❤️ Dziękuję') + (canManageSolution ? '<button class="community-action solution-action" type="button" data-toggle-solved>' + (post.solved ? '↩ Otwórz ponownie' : '✅ Oznacz jako rozwiązane') + '</button>' : '') + '<button class="community-action" type="button" data-follow-post>' + (post.following ? '🔔 Obserwujesz' : '🔕 Obserwuj') + '</button><button class="community-action" type="button" data-report-current-post>⚑ Zgłoś</button>' + (canDelete ? '<button class="community-action danger" type="button" data-delete-current-post>Usuń wpis</button>' : '') + '</footer></article>';
  }

  function renderImages(images) {
    if (!images.length) return '';
    return '<div class="community-media-grid ' + (images.length === 1 ? 'one' : '') + '">' + images.map(item => '<img src="' + AIOCommunity.escapeAttr(item.url) + '" alt="Zdjęcie do wpisu" loading="lazy" data-community-image>').join('') + '</div>';
  }

  function reactionButton(type, label) {
    return '<button class="community-reaction ' + (post.reactions.mine === type ? 'active' : '') + '" type="button" data-post-reaction="' + type + '">' + label + ' <span>' + Number(post.reactions[type] || 0) + '</span></button>';
  }

  function renderComments() {
    const root = document.querySelector('[data-community-comments]');
    if (!root) return;
    if (!AIOCommunity.user) {
      root.innerHTML = '<div class="community-access-gate compact"><div class="community-access-icon">💬</div><h2>Zaloguj się, aby zobaczyć komentarze</h2><p>Dyskusja i profile uczestników są dostępne tylko dla członków Społeczności AIO.</p><button class="button primary" type="button" data-community-login>Zaloguj się</button></div>';
      return;
    }
    const visible = comments.filter(item => item.status === 'published' || AIOCommunity.isOwner(item.author_id) || AIOCommunity.isAdmin());
    if (!visible.length) {
      root.innerHTML = '<div class="community-empty"><strong>Brak odpowiedzi.</strong><p>Dodaj pierwszy komentarz do tego wpisu.</p></div>';
      return;
    }
    const parents = visible.filter(item => !item.parent_id).sort((a, b) => Number(b.id === post.best_comment_id) - Number(a.id === post.best_comment_id));
    const children = visible.filter(item => item.parent_id);
    root.innerHTML = parents.map(parent => renderComment(parent) + children.filter(child => child.parent_id === parent.id).map(child => renderComment(child, true)).join('')).join('') + children.filter(child => !visible.some(parent => parent.id === child.parent_id)).map(child => renderComment(child, true)).join('');
  }

  function renderComment(comment, reply) {
    const author = comment.author || {};
    const canDelete = AIOCommunity.isOwner(comment.author_id) || AIOCommunity.isAdmin();
    const canChooseBest = Boolean(post && postTypeInfo(post.post_type || 'problem').id === 'problem' && (AIOCommunity.isOwner(post.author_id) || AIOCommunity.isAdmin()) && comment.status === 'published');
    const isBest = Boolean(post && post.best_comment_id === comment.id);
    return '<article class="community-comment ' + (reply ? 'reply ' : '') + (isBest ? 'best-answer' : '') + '" id="comment-' + AIOCommunity.escapeAttr(comment.id) + '">' + (isBest ? '<div class="community-best-answer-badge">✅ Najlepsza odpowiedź</div>' : '') + '<header class="community-comment-head">' + AIOCommunity.avatarHtml(author, author.display_name) + '<div><strong><a href="profile.html?id=' + AIOCommunity.escapeAttr(comment.author_id) + '">' + AIOCommunity.escape(author.display_name || 'Użytkownik') + '</a></strong><small>' + AIOCommunity.escape(AIOCommunity.timeAgo(comment.created_at)) + (comment.status !== 'published' ? ' • oczekuje' : '') + '</small></div></header><div class="community-comment-body">' + AIOCommunity.formatText(comment.content) + '</div><div class="community-comment-actions"><button class="community-action" type="button" data-comment-reply="' + AIOCommunity.escapeAttr(comment.id) + '">Odpowiedz</button>' + (canChooseBest && !isBest ? '<button class="community-action solution-action" type="button" data-best-answer="' + AIOCommunity.escapeAttr(comment.id) + '">✅ Oznacz jako rozwiązanie</button>' : '') + '<button class="community-action" type="button" data-report-comment="' + AIOCommunity.escapeAttr(comment.id) + '">Zgłoś</button>' + (canDelete ? '<button class="community-action danger" type="button" data-delete-comment="' + AIOCommunity.escapeAttr(comment.id) + '">Usuń</button>' : '') + '</div></article>';
  }

  function renderCommentForm() {
    const guest = document.querySelector('[data-comment-guest]');
    const form = document.querySelector('[data-comment-form]');
    if (guest) guest.hidden = Boolean(AIOCommunity.user);
    if (form) form.hidden = !AIOCommunity.user || Boolean(post && post.locked);
    const locked = document.querySelector('[data-comment-locked]');
    if (locked) locked.hidden = !(post && post.locked);
    renderReplyIndicator();
  }

  function renderReplyIndicator() {
    const box = document.querySelector('[data-reply-indicator]');
    if (!box) return;
    box.classList.toggle('active', Boolean(replyTo));
    box.innerHTML = replyTo ? '<span>Odpowiadasz użytkownikowi <strong>' + AIOCommunity.escape(replyTo.author && replyTo.author.display_name || 'Użytkownik') + '</strong></span><button class="community-action" type="button" data-cancel-reply>Anuluj</button>' : '';
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!AIOCommunity.requireWritable()) return;
    const form = event.currentTarget;
    const input = form.querySelector('[data-comment-content]');
    const content = input.value.trim();
    const maxCommentLength = Number(AIOCommunity.config.maxCommentLength || 10000);
    if (content.length < 2 || content.length > maxCommentLength) { AIOCommunity.showToast('Komentarz powinien mieć od 2 do ' + maxCommentLength.toLocaleString('pl-PL') + ' znaków.', 'error'); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await AIOCommunity.edgeCall('write', { action: 'create_comment', postId, parentId: replyTo ? replyTo.id : null, content });
      input.value = '';
      const counter = document.querySelector('[data-comment-count]');
      if (counter) counter.textContent = AIOCommunity.characterLabel(0, Number(AIOCommunity.config.maxCommentLength || 10000));
      replyTo = null;
      AIOCommunity.showToast('Odpowiedź została dodana.', 'success');
      await loadAll();
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
    finally { button.disabled = false; }
  }

  async function toggleReaction(type) {
    if (!AIOCommunity.requireAuth('Zaloguj się, aby reagować.')) return;
    try {
      if (!AIOCommunity.requireWritable('Zaloguj się, aby reagować.')) return;
      await AIOCommunity.edgeCall('write', { action: 'set_reaction', postId, type });
      await loadAll();
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
  }

  async function toggleFollow(button) {
    if (!AIOCommunity.requireWritable('Zaloguj się, aby obserwować wpis.')) return;
    button.disabled = true;
    try {
      const result = await AIOCommunity.edgeCall('write', { action: 'toggle_follow', postId });
      post.following = Boolean(result.following);
      button.textContent = post.following ? '🔔 Obserwujesz' : '🔕 Obserwuj';
      AIOCommunity.showToast(post.following ? 'Wpis został dodany do obserwowanych.' : 'Wyłączono obserwowanie wpisu.', 'success');
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
    finally { button.disabled = false; }
  }

  async function toggleSolved() {
    if (!post || !(AIOCommunity.isOwner(post.author_id) || AIOCommunity.isAdmin())) return;
    try {
      await AIOCommunity.edgeCall('write', { action: 'set_solution', postId, solved: !post.solved, commentId: null });
      AIOCommunity.showToast(post.solved ? 'Temat został ponownie otwarty.' : 'Temat został oznaczony jako rozwiązany.', 'success');
      await loadAll();
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
  }

  async function setBestAnswer(commentId) {
    if (!post || !(AIOCommunity.isOwner(post.author_id) || AIOCommunity.isAdmin())) return;
    try {
      await AIOCommunity.edgeCall('write', { action: 'set_solution', postId, solved: true, commentId });
      AIOCommunity.showToast('Odpowiedź została oznaczona jako rozwiązanie.', 'success');
      await loadAll();
      const target = document.getElementById('comment-' + commentId);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
  }

  async function report(type, id) {
    if (!AIOCommunity.requireAuth('Zaloguj się, aby wysłać zgłoszenie.')) return;
    const reason = prompt('Podaj krótki powód zgłoszenia:');
    if (!reason) return;
    try {
      await AIOCommunity.edgeCall('write', { action: 'report', targetType: type, targetId: id, reason: reason.slice(0, 120) });
      AIOCommunity.showToast('Zgłoszenie zostało wysłane.', 'success');
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
  }

  async function deleteCurrentPost() {
    if (!confirm('Na pewno usunąć ten wpis wraz z komentarzami?')) return;
    try {
      await AIOCommunity.edgeCall('write', { action: 'delete_post', id: postId });
      location.href = 'community.html';
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
  }

  async function deleteCurrentComment(id) {
    if (!confirm('Usunąć ten komentarz?')) return;
    try {
      await AIOCommunity.edgeCall('write', { action: 'delete_comment', id });
      loadAll();
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
  }

  function subscribe() {
    if (!AIOCommunity.user) return;
    AIOCommunity.client.channel('community-post-' + postId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_comments', filter: 'post_id=eq.' + postId }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_reactions', filter: 'post_id=eq.' + postId }, () => loadAll())
      .subscribe();
  }

  boot();
})();
