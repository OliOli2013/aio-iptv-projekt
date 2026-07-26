/* Społeczność AIO — prywatne wpisy i publiczne komunikaty, 2026-07-26 community4 */
(function () {
  'use strict';
  let postId = '';
  let post = null;
  let comments = [];
  let replyTo = null;

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
    if (!AIOCommunity.backendReady) {
      AIOCommunity.showSetupError(new Error('Baza społeczności nie została jeszcze uruchomiona.'));
      return;
    }
    await loadAll();
    subscribe();
  }

  function bind() {
    document.addEventListener('aio-community-auth', () => { renderCommentForm(); loadAll(); });
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
    });
    const form = document.querySelector('[data-comment-form]');
    if (form) form.addEventListener('submit', submitComment);
  }

  async function loadAll() {
    const root = document.querySelector('[data-community-post]');
    root.innerHTML = '<div class="community-loading">Ładuję wpis…</div>';
    try {
      const fields = 'id,author_id,kind,category,title,content,status,pinned,locked,attachments,created_at,published_at' + (AIOCommunity.user ? ',author:community_profiles!community_posts_author_id_fkey(id,display_name,avatar_url,tuner_model,system_name,role)' : '');
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
    const images = Array.isArray(post.attachments) ? post.attachments.filter(item => item && item.url) : [];
    const canDelete = AIOCommunity.isOwner(post.author_id) || AIOCommunity.isAdmin();
    root.innerHTML = '<article class="community-post-card ' + (post.pinned ? 'pinned ' : '') + (post.kind === 'official' ? 'official' : '') + '">' +
      '<header class="community-post-head">' + AIOCommunity.avatarHtml(author, authorName) + '<div class="community-post-author"><strong>' + authorTitle + (author.role && author.role !== 'user' ? '<span class="community-role ' + AIOCommunity.escapeAttr(author.role) + '">' + AIOCommunity.escape(AIOCommunity.roleLabel(author.role)) + '</span>' : '') + '</strong><small>' + AIOCommunity.escape([author.tuner_model, author.system_name].filter(Boolean).join(' • ') || 'Społeczność AIO') + '</small></div><div class="community-post-meta">' + AIOCommunity.escape(AIOCommunity.formatDate(post.created_at)) + '</div></header>' +
      '<div class="community-post-content"><div class="community-post-tags">' + (post.kind === 'official' ? '<span class="community-status-pill official">✓ Oficjalne</span>' : '') + (post.pinned ? '<span class="community-status-pill pinned">📌 Przypięte</span>' : '') + (post.status !== 'published' ? '<span class="community-status-pill pending">Oczekuje na zatwierdzenie</span>' : '') + '<span class="community-category">' + AIOCommunity.escape(category.icon + ' ' + category.label) + '</span></div><h1>' + AIOCommunity.escape(post.title) + '</h1><div class="community-post-text">' + AIOCommunity.formatText(post.content) + '</div>' + renderImages(images) + '</div>' +
      '<footer class="community-post-footer">' + reactionButton('helpful', '👍 Pomocne') + reactionButton('works', '✅ Działa') + reactionButton('thanks', '❤️ Dziękuję') + '<button class="community-action" type="button" data-follow-post>' + (post.following ? '🔔 Obserwujesz' : '🔕 Obserwuj') + '</button><button class="community-action" type="button" data-report-current-post>⚑ Zgłoś</button>' + (canDelete ? '<button class="community-action danger" type="button" data-delete-current-post>Usuń wpis</button>' : '') + '</footer></article>';
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
    const parents = visible.filter(item => !item.parent_id);
    const children = visible.filter(item => item.parent_id);
    root.innerHTML = parents.map(parent => renderComment(parent) + children.filter(child => child.parent_id === parent.id).map(child => renderComment(child, true)).join('')).join('') + children.filter(child => !visible.some(parent => parent.id === child.parent_id)).map(child => renderComment(child, true)).join('');
  }

  function renderComment(comment, reply) {
    const author = comment.author || {};
    const canDelete = AIOCommunity.isOwner(comment.author_id) || AIOCommunity.isAdmin();
    return '<article class="community-comment ' + (reply ? 'reply' : '') + '" id="comment-' + AIOCommunity.escapeAttr(comment.id) + '"><header class="community-comment-head">' + AIOCommunity.avatarHtml(author, author.display_name) + '<div><strong><a href="profile.html?id=' + AIOCommunity.escapeAttr(comment.author_id) + '">' + AIOCommunity.escape(author.display_name || 'Użytkownik') + '</a></strong><small>' + AIOCommunity.escape(AIOCommunity.timeAgo(comment.created_at)) + (comment.status !== 'published' ? ' • oczekuje' : '') + '</small></div></header><div class="community-comment-body">' + AIOCommunity.formatText(comment.content) + '</div><div class="community-comment-actions"><button class="community-action" type="button" data-comment-reply="' + AIOCommunity.escapeAttr(comment.id) + '">Odpowiedz</button><button class="community-action" type="button" data-report-comment="' + AIOCommunity.escapeAttr(comment.id) + '">Zgłoś</button>' + (canDelete ? '<button class="community-action danger" type="button" data-delete-comment="' + AIOCommunity.escapeAttr(comment.id) + '">Usuń</button>' : '') + '</div></article>';
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
    if (!AIOCommunity.requireAuth()) return;
    const form = event.currentTarget;
    const input = form.querySelector('[data-comment-content]');
    const content = input.value.trim();
    if (content.length < 2 || content.length > 3000) { AIOCommunity.showToast('Komentarz powinien mieć od 2 do 3000 znaków.', 'error'); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await AIOCommunity.client.from('community_comments').insert({ post_id: postId, author_id: AIOCommunity.user.id, parent_id: replyTo ? replyTo.id : null, content }).select('id').single();
      if (result.error) throw result.error;
      input.value = '';
      replyTo = null;
      AIOCommunity.showToast('Odpowiedź została dodana.', 'success');
      await loadAll();
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
    finally { button.disabled = false; }
  }

  async function toggleReaction(type) {
    if (!AIOCommunity.requireAuth('Zaloguj się, aby reagować.')) return;
    try {
      if (post.reactions.mine === type) {
        const result = await AIOCommunity.client.from('community_reactions').delete().eq('post_id', postId).eq('user_id', AIOCommunity.user.id);
        if (result.error) throw result.error;
      } else {
        const result = await AIOCommunity.client.from('community_reactions').upsert({ post_id: postId, user_id: AIOCommunity.user.id, type }, { onConflict: 'post_id,user_id' });
        if (result.error) throw result.error;
      }
      await loadAll();
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
  }

  async function toggleFollow(button) {
    if (!AIOCommunity.requireAuth('Zaloguj się, aby obserwować wpis.')) return;
    button.disabled = true;
    try {
      if (post.following) {
        const result = await AIOCommunity.client.from('community_subscriptions').delete().eq('post_id', postId).eq('user_id', AIOCommunity.user.id);
        if (result.error) throw result.error;
        post.following = false;
      } else {
        const result = await AIOCommunity.client.from('community_subscriptions').upsert({ post_id: postId, user_id: AIOCommunity.user.id }, { onConflict: 'post_id,user_id' });
        if (result.error) throw result.error;
        post.following = true;
      }
      button.textContent = post.following ? '🔔 Obserwujesz' : '🔕 Obserwuj';
    } catch (error) { AIOCommunity.showToast(AIOCommunity.friendlyError(error), 'error'); }
    finally { button.disabled = false; }
  }

  async function report(type, id) {
    if (!AIOCommunity.requireAuth('Zaloguj się, aby wysłać zgłoszenie.')) return;
    const reason = prompt('Podaj krótki powód zgłoszenia:');
    if (!reason) return;
    const result = await AIOCommunity.client.from('community_reports').insert({ reporter_id: AIOCommunity.user.id, target_type: type, target_id: id, reason: reason.slice(0, 120) });
    if (result.error) AIOCommunity.showToast(AIOCommunity.friendlyError(result.error), 'error'); else AIOCommunity.showToast('Zgłoszenie zostało wysłane.', 'success');
  }

  async function deleteCurrentPost() {
    if (!confirm('Na pewno usunąć ten wpis wraz z komentarzami?')) return;
    const result = await AIOCommunity.client.from('community_posts').delete().eq('id', postId);
    if (result.error) AIOCommunity.showToast(AIOCommunity.friendlyError(result.error), 'error'); else location.href = 'community.html';
  }

  async function deleteCurrentComment(id) {
    if (!confirm('Usunąć ten komentarz?')) return;
    const result = await AIOCommunity.client.from('community_comments').delete().eq('id', id);
    if (result.error) AIOCommunity.showToast(AIOCommunity.friendlyError(result.error), 'error'); else loadAll();
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
