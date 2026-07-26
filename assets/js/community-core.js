/* Społeczność AIO — rdzeń prywatnej społeczności, 2026-07-26 community4 */
(function () {
  'use strict';

  const Community = {
    config: null,
    client: null,
    session: null,
    user: null,
    profile: null,
    ready: false,
    backendReady: false,
    subscriptions: [],
    authEventSequence: 0,
    mediaUrlCache: new Map(),
    async init() {
      try {
        this.config = await this.loadConfig();
        if (!this.config || !this.config.enabled) throw new Error('Moduł społeczności jest wyłączony w konfiguracji.');
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
          throw new Error('Nie załadowano biblioteki Supabase.');
        }
        const supa = this.config.supabase || {};
        if (!supa.url || !supa.anonKey) throw new Error('Brak danych Supabase w community_config.json.');
        this.client = window.supabase.createClient(supa.url.replace(/\/+$/, ''), supa.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
          global: { headers: { 'x-aio-community': this.config.version || 'community1' } }
        });
        const result = await this.client.auth.getSession();
        this.session = result.data ? result.data.session : null;
        this.user = this.session ? this.session.user : null;
        if (this.user) await this.ensureProfile();
        // Nie wykonujemy zapytań Supabase bezpośrednio w callbacku
        // onAuthStateChange. W supabase-js może to zablokować kolejne
        // wywołania klienta (deadlock). Obsługę sesji odkładamy do
        // następnego obrotu pętli zdarzeń.
        this.client.auth.onAuthStateChange((event, session) => {
          window.setTimeout(() => {
            const sameUser = Boolean(this.user && session && session.user && this.user.id === session.user.id);
            if (event === 'INITIAL_SESSION' && sameUser && this.profile) {
              this.session = session;
              this.renderAccountBars();
              document.dispatchEvent(new CustomEvent('aio-community-auth', {
                detail: { user: this.user, profile: this.profile }
              }));
              return;
            }
            this.applyAuthSession(session);
          }, 0);
        });
        this.backendReady = await this.probeBackend();
        this.ready = true;
        this.initGlobalUi();
        this.renderAccountBars();
        this.loadNotifications();
        document.dispatchEvent(new CustomEvent('aio-community-ready', { detail: this }));
      } catch (error) {
        this.ready = true;
        this.backendReady = false;
        this.initGlobalUi();
        this.renderAccountBars(error);
        document.dispatchEvent(new CustomEvent('aio-community-ready', { detail: this }));
        this.showSetupError(error);
      }
    },

    async applyAuthSession(session) {
      const sequence = ++this.authEventSequence;
      const previousUserId = this.user ? this.user.id : null;
      const previousProfile = this.profile;
      this.session = session || null;
      this.user = session ? session.user : null;
      const sameUser = Boolean(previousUserId && this.user && previousUserId === this.user.id);
      this.profile = sameUser ? previousProfile : null;

      try {
        if (this.user) await this.ensureProfile();
        if (sequence !== this.authEventSequence) return;
        this.renderAccountBars();
        this.loadNotifications();
        document.dispatchEvent(new CustomEvent('aio-community-auth', {
          detail: { user: this.user, profile: this.profile }
        }));
      } catch (error) {
        if (sequence !== this.authEventSequence) return;
        console.error('Społeczność AIO — błąd odświeżania sesji:', error);
        this.renderAccountBars(error);
        document.dispatchEvent(new CustomEvent('aio-community-auth', {
          detail: { user: this.user, profile: this.profile, error: error }
        }));
      }
    },

    async loadConfig() {
      const response = await fetch('data/community_config.json?v=20260726-community4', { cache: 'no-store' });
      if (!response.ok) throw new Error('Nie udało się odczytać konfiguracji społeczności.');
      return response.json();
    },

    async probeBackend() {
      if (!this.client) return false;
      const { error } = await this.client.from('community_posts').select('id', { head: true, count: 'exact' }).limit(1);
      if (!error) return true;
      const text = String(error.message || error.details || '');
      if (/does not exist|schema cache|relation/i.test(text)) return false;
      return true;
    },

    async ensureProfile() {
      if (!this.client || !this.user) return null;
      let { data, error } = await this.client.from('community_profiles').select('*').eq('id', this.user.id).maybeSingle();
      if (error && !/does not exist|schema cache/i.test(String(error.message || ''))) throw error;
      if (!data && !error) {
        const fallbackName = this.user.user_metadata && (this.user.user_metadata.display_name || this.user.user_metadata.full_name)
          ? (this.user.user_metadata.display_name || this.user.user_metadata.full_name)
          : String(this.user.email || 'Użytkownik').split('@')[0];
        const insert = await this.client.from('community_profiles').upsert({
          id: this.user.id,
          display_name: String(fallbackName).slice(0, 60)
        }).select('*').single();
        if (!insert.error) data = insert.data;
      }
      this.profile = data ? await this.prepareProfile(data) : null;
      return this.profile;
    },

    async signIn(email) {
      if (!this.client) throw new Error('Brak połączenia z modułem logowania.');
      const address = String(email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(address)) throw new Error('Podaj poprawny adres e-mail.');
      const redirect = new URL('community.html', window.location.href).href.split('#')[0];
      const { error } = await this.client.auth.signInWithOtp({
        email: address,
        options: {
          emailRedirectTo: redirect,
          data: { display_name: address.split('@')[0] }
        }
      });
      if (error) throw error;
      return true;
    },

    async signOut() {
      if (!this.client) return;
      await this.client.auth.signOut();
      this.showToast('Wylogowano ze Społeczności AIO.', 'success');
    },

    isAdmin() {
      return Boolean(this.profile && ['admin', 'moderator'].includes(this.profile.role));
    },

    isOwner(id) {
      return Boolean(this.user && id && this.user.id === id);
    },

    isBanned() {
      if (!this.profile || !this.profile.banned_until) return false;
      return new Date(this.profile.banned_until).getTime() > Date.now();
    },

    requireAuth(message) {
      if (this.user) return true;
      this.openAuth(message || 'Zaloguj się, aby skorzystać z tej funkcji.');
      return false;
    },

    initGlobalUi() {
      this.ensureAuthDialog();
      this.ensureImageViewer();
      document.addEventListener('click', event => {
        const login = event.target.closest('[data-community-login]');
        if (login) { event.preventDefault(); this.openAuth(); }
        const logout = event.target.closest('[data-community-logout]');
        if (logout) { event.preventDefault(); this.signOut(); }
        const notify = event.target.closest('[data-community-notifications]');
        if (notify) { event.preventDefault(); this.toggleNotifications(notify); }
        const image = event.target.closest('[data-community-image]');
        if (image) { event.preventDefault(); this.openImage(image.getAttribute('src'), image.getAttribute('alt')); }
      });
    },

    renderAccountBars(error) {
      document.querySelectorAll('[data-community-account]').forEach(bar => {
        bar.classList.toggle('is-guest', !this.user);
        const main = bar.querySelector('[data-community-account-main]');
        const actions = bar.querySelector('[data-community-account-actions]');
        if (!main || !actions) return;
        if (this.user) {
          const name = this.profile && this.profile.display_name ? this.profile.display_name : String(this.user.email || '').split('@')[0];
          const avatar = this.avatarHtml(this.profile, name, false);
          const role = this.profile && this.profile.role && this.profile.role !== 'user'
            ? '<span class="community-role ' + this.escape(this.profile.role) + '">' + this.escape(this.roleLabel(this.profile.role)) + '</span>' : '';
          main.innerHTML = avatar + '<div class="community-account-copy"><strong>' + this.escape(name) + ' ' + role + '</strong><small>' + this.escape(this.user.email || 'Zalogowany użytkownik') + '</small></div>';
          actions.innerHTML = '<button class="button community-notification-button" type="button" data-community-notifications>🔔<span class="community-notification-count" data-community-notification-count hidden>0</span></button>' +
            '<a class="button" href="profile.html">Mój profil</a>' +
            (this.isAdmin() ? '<a class="button" href="community-admin.html">Moderacja</a>' : '') +
            '<button class="button" type="button" data-community-logout>Wyloguj</button>';
        } else {
          main.innerHTML = '<span class="community-avatar">AIO</span><div class="community-account-copy"><strong>Społeczność AIO</strong><small>' + this.escape(error ? 'Moduł wymaga konfiguracji' : 'Zaloguj się kodem wysłanym na e-mail') + '</small></div>';
          actions.innerHTML = '<button class="button primary" type="button" data-community-login>Zaloguj / utwórz konto</button>';
        }
      });
    },

    ensureAuthDialog() {
      if (document.getElementById('community-auth-dialog')) return;
      const dialog = document.createElement('dialog');
      dialog.id = 'community-auth-dialog';
      dialog.className = 'community-dialog';
      dialog.innerHTML = '<div class="community-dialog-card"><button class="community-dialog-close" type="button" aria-label="Zamknij">✕</button>' +
        '<p class="eyebrow">Bez tradycyjnego hasła</p><h2>Zaloguj się do Społeczności AIO</h2>' +
        '<p data-auth-message>Na podany adres otrzymasz bezpieczny link logowania. Konto zostanie utworzone automatycznie.</p>' +
        '<div class="community-auth-benefits"><span>Publikuj pytania</span><span>Komentuj i reaguj</span><span>Otrzymuj powiadomienia</span></div>' +
        '<form class="community-form" data-community-auth-form><div class="community-field"><label for="community-auth-email">Adres e-mail</label><input id="community-auth-email" type="email" autocomplete="email" required placeholder="twoj@email.pl"></div>' +
        '<label class="community-notice"><input type="checkbox" required> Akceptuję <a href="community-rules.html" target="_blank">regulamin społeczności</a> i zapoznałem się z <a href="privacy-community.html" target="_blank">informacją o prywatności</a>.</label>' +
        '<div class="community-form-actions"><button class="button primary" type="submit">Wyślij link logowania</button></div><p class="community-notice" data-community-auth-status hidden></p></form></div>';
      document.body.appendChild(dialog);
      const close = () => dialog.close();
      dialog.querySelector('.community-dialog-close').addEventListener('click', close);
      dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
      dialog.querySelector('[data-community-auth-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const status = dialog.querySelector('[data-community-auth-status]');
        const button = dialog.querySelector('button[type="submit"]');
        const email = dialog.querySelector('#community-auth-email').value;
        status.hidden = false;
        status.className = 'community-notice';
        status.textContent = 'Wysyłam link logowania…';
        button.disabled = true;
        try {
          await this.signIn(email);
          status.className = 'community-notice success';
          status.textContent = 'Link został wysłany. Sprawdź skrzynkę odbiorczą i folder SPAM.';
        } catch (err) {
          status.className = 'community-notice warning';
          status.textContent = this.friendlyError(err);
        } finally {
          button.disabled = false;
        }
      });
    },

    openAuth(message) {
      const dialog = document.getElementById('community-auth-dialog');
      if (!dialog) return;
      const msg = dialog.querySelector('[data-auth-message]');
      if (msg && message) msg.textContent = message;
      dialog.showModal();
      window.setTimeout(() => dialog.querySelector('input[type="email"]').focus(), 80);
    },

    ensureImageViewer() {
      if (document.getElementById('community-image-dialog')) return;
      const dialog = document.createElement('dialog');
      dialog.id = 'community-image-dialog';
      dialog.className = 'community-dialog';
      dialog.innerHTML = '<div class="community-dialog-card"><button class="community-dialog-close" type="button" aria-label="Zamknij">✕</button><img alt="Podgląd zdjęcia" style="width:100%;max-height:80vh;object-fit:contain;border-radius:12px;background:#02090d"></div>';
      document.body.appendChild(dialog);
      dialog.querySelector('.community-dialog-close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    },

    openImage(src, alt) {
      const dialog = document.getElementById('community-image-dialog');
      if (!dialog || !src) return;
      const image = dialog.querySelector('img');
      image.src = src;
      image.alt = alt || 'Zdjęcie dodane do wpisu';
      dialog.showModal();
    },

    async uploadImages(fileList, folder) {
      if (!this.requireAuth('Zaloguj się, aby dodawać zdjęcia.')) return [];
      const files = Array.from(fileList || []);
      const maxCount = Number(this.config.maxImagesPerPost || 4);
      const maxBytes = Number(this.config.maxImageSizeMb || 5) * 1024 * 1024;
      if (files.length > maxCount) throw new Error('Możesz dodać maksymalnie ' + maxCount + ' zdjęcia.');
      const results = [];
      for (const file of files) {
        if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) throw new Error('Dozwolone są zdjęcia JPG, PNG, WebP i GIF.');
        if (file.size > maxBytes) throw new Error('Plik ' + file.name + ' przekracza limit ' + this.config.maxImageSizeMb + ' MB.');
        const safe = String(file.name || 'image').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-90);
        const path = this.user.id + '/' + (folder || 'posts') + '/' + Date.now() + '-' + crypto.randomUUID() + '-' + safe;
        const upload = await this.client.storage.from(this.config.mediaBucket).upload(path, file, { cacheControl: '3600', upsert: false });
        if (upload.error) throw upload.error;
        results.push({ url: path, path: path, name: file.name, size: file.size, type: file.type });
      }
      return results;
    },

    mediaPath(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const bucket = String(this.config && this.config.mediaBucket || 'community-media');
      if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');
      try {
        const url = new URL(raw);
        const markers = [
          '/storage/v1/object/public/' + bucket + '/',
          '/storage/v1/object/sign/' + bucket + '/',
          '/storage/v1/object/authenticated/' + bucket + '/'
        ];
        for (const marker of markers) {
          const index = url.pathname.indexOf(marker);
          if (index !== -1) return decodeURIComponent(url.pathname.slice(index + marker.length));
        }
      } catch (_) {}
      return '';
    },

    async signedMediaUrl(value, expiresIn) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const path = this.mediaPath(raw);
      if (!path) return raw; // zewnętrzny avatar lub obraz
      const scope = this.user ? this.user.id : 'anon';
      const key = scope + ':' + path;
      const cached = this.mediaUrlCache.get(key);
      if (cached && cached.expires > Date.now()) return cached.url;
      const result = await this.client.storage.from(this.config.mediaBucket).createSignedUrl(path, Number(expiresIn || 3600));
      if (result.error || !result.data || !result.data.signedUrl) return '';
      const url = result.data.signedUrl;
      this.mediaUrlCache.set(key, { url: url, expires: Date.now() + Math.max(60, Number(expiresIn || 3600) - 60) * 1000 });
      return url;
    },

    async prepareProfile(profile) {
      if (!profile) return profile;
      const copy = Object.assign({}, profile);
      copy._avatar_display_url = copy.avatar_url ? await this.signedMediaUrl(copy.avatar_url, 3600) : '';
      return copy;
    },

    async prepareAttachments(items) {
      const list = Array.isArray(items) ? items : [];
      return Promise.all(list.map(async item => {
        if (!item) return item;
        const copy = Object.assign({}, item);
        copy.path = copy.path || this.mediaPath(copy.url);
        copy.url = copy.path ? await this.signedMediaUrl(copy.path, 3600) : String(copy.url || '');
        return copy;
      }));
    },

    async preparePostMedia(post) {
      if (!post) return post;
      if (post.author) post.author = await this.prepareProfile(post.author);
      post.attachments = await this.prepareAttachments(post.attachments);
      return post;
    },

    async loadNotifications() {
      if (!this.client || !this.user || !this.backendReady) return;
      const { data, error } = await this.client.from('community_notifications').select('*').order('created_at', { ascending: false }).limit(30);
      if (error) return;
      this.notifications = data || [];
      const unread = this.notifications.filter(item => !item.read_at).length;
      document.querySelectorAll('[data-community-notification-count]').forEach(el => {
        el.textContent = unread > 99 ? '99+' : String(unread);
        el.hidden = unread === 0;
      });
      if (!this.notificationChannel) {
        this.notificationChannel = this.client.channel('community-notifications-' + this.user.id)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_notifications', filter: 'user_id=eq.' + this.user.id }, payload => {
            this.notifications.unshift(payload.new);
            this.loadNotifications();
            this.showToast(payload.new.message || 'Masz nowe powiadomienie.', 'success');
            if (window.Notification && Notification.permission === 'granted') {
              new Notification('Społeczność AIO', { body: payload.new.message || 'Nowa aktywność w społeczności.', icon: 'pliki/logo.png' });
            }
          }).subscribe();
      }
    },

    toggleNotifications(button) {
      const host = button.parentElement || button;
      let panel = host.querySelector('.community-notification-panel');
      if (panel) { panel.remove(); return; }
      panel = document.createElement('div');
      panel.className = 'community-notification-panel';
      const list = this.notifications || [];
      panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 5px 9px"><strong>Powiadomienia</strong><button class="community-action" type="button" data-enable-browser-notifications>Włącz systemowe</button></div>' +
        (list.length ? list.map(item => '<a class="community-notification-item ' + (!item.read_at ? 'unread' : '') + '" href="' + this.notificationUrl(item) + '" data-notification-id="' + item.id + '">' + this.escape(item.message || 'Nowa aktywność') + '<small>' + this.escape(this.timeAgo(item.created_at)) + '</small></a>').join('') : '<p class="community-side-note">Brak nowych powiadomień.</p>');
      host.appendChild(panel);
      panel.addEventListener('click', async event => {
        event.stopPropagation();
        const enable = event.target.closest('[data-enable-browser-notifications]');
        if (enable && window.Notification) {
          const permission = await Notification.requestPermission();
          this.showToast(permission === 'granted' ? 'Powiadomienia systemowe zostały włączone.' : 'Przeglądarka nie zezwoliła na powiadomienia.', permission === 'granted' ? 'success' : 'error');
        }
        const item = event.target.closest('[data-notification-id]');
        if (item) {
          await this.client.from('community_notifications').update({ read_at: new Date().toISOString() }).eq('id', item.dataset.notificationId);
        }
      });
      window.setTimeout(() => {
        document.addEventListener('click', function closeOnce(event) {
          if (!host.contains(event.target)) panel.remove();
          document.removeEventListener('click', closeOnce);
        });
      }, 0);
    },

    notificationUrl(item) {
      if (item.post_id) return 'post.html?id=' + encodeURIComponent(item.post_id);
      return 'community.html';
    },

    avatarHtml(profile, fallback, large) {
      const name = profile && profile.display_name ? profile.display_name : (fallback || 'AIO');
      const avatarUrl = profile && (profile._avatar_display_url || (!this.mediaPath(profile.avatar_url) ? profile.avatar_url : ''));
      if (avatarUrl) {
        return '<img class="community-avatar' + (large ? ' large' : '') + '" src="' + this.escapeAttr(avatarUrl) + '" alt="Avatar ' + this.escapeAttr(name) + '" loading="lazy">';
      }
      const initials = String(name).trim().split(/\s+/).slice(0, 2).map(x => x.charAt(0).toUpperCase()).join('') || 'AIO';
      return '<span class="community-avatar' + (large ? ' large' : '') + '">' + this.escape(initials) + '</span>';
    },

    roleLabel(role) {
      return ({ admin: 'Administrator', moderator: 'Moderator', user: 'Użytkownik' })[role] || 'Użytkownik';
    },

    category(id) {
      const found = this.config && Array.isArray(this.config.categories) ? this.config.categories.find(item => item.id === id) : null;
      return found || { id: id || 'inne', label: id || 'Inne', icon: '💬' };
    },

    formatText(text, maxLength) {
      let value = String(text || '');
      if (maxLength && value.length > maxLength) value = value.slice(0, maxLength).trim() + '…';
      let safe = this.escape(value);
      safe = safe.replace(/(https?:\/\/[^\s<]+)/gi, url => '<a href="' + this.escapeAttr(url) + '" target="_blank" rel="noopener noreferrer nofollow ugc">' + this.escape(url) + '</a>');
      return safe.replace(/\n/g, '<br>');
    },

    timeAgo(value) {
      if (!value) return '';
      const date = new Date(value);
      const seconds = Math.round((Date.now() - date.getTime()) / 1000);
      if (!Number.isFinite(seconds)) return '';
      if (seconds < 45) return 'przed chwilą';
      if (seconds < 3600) return Math.floor(seconds / 60) + ' min temu';
      if (seconds < 86400) return Math.floor(seconds / 3600) + ' godz. temu';
      if (seconds < 604800) return Math.floor(seconds / 86400) + ' dni temu';
      return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    },

    formatDate(value) {
      if (!value) return '';
      return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    },

    queryParam(name) {
      return new URLSearchParams(location.search).get(name);
    },

    escape(value) {
      return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
    },

    escapeAttr(value) {
      return this.escape(value).replace(/`/g, '&#96;');
    },

    friendlyError(error) {
      const message = String(error && (error.message || error.details || error.error_description) || error || 'Nieznany błąd');
      if (/signal is aborted|AbortError|aborted without reason/i.test(message)) return 'Przerwano odczyt sesji. Zamknij dodatkowe karty Społeczności AIO i odśwież stronę.';
      if (/Failed to fetch|NetworkError/i.test(message)) return 'Nie udało się połączyć z usługą. Sprawdź Internet i konfigurację Supabase.';
      if (/rate|too many/i.test(message)) return 'Wykonano zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
      if (/row-level security|policy/i.test(message)) return 'Brak uprawnień do tej operacji. Sprawdź konfigurację RLS w Supabase.';
      if (/does not exist|schema cache|relation/i.test(message)) return 'Baza Społeczności AIO nie została jeszcze utworzona. Administrator musi uruchomić plik community_setup.sql.';
      if (/banned|zablokowane/i.test(message)) return 'To konto ma czasowo zablokowaną możliwość publikowania.';
      return message;
    },

    showToast(message, type) {
      let stack = document.querySelector('.community-toast-stack');
      if (!stack) {
        stack = document.createElement('div');
        stack.className = 'community-toast-stack';
        document.body.appendChild(stack);
      }
      const toast = document.createElement('div');
      toast.className = 'community-toast ' + (type || '');
      toast.textContent = message;
      stack.appendChild(toast);
      window.setTimeout(() => toast.remove(), 5200);
    },

    showSetupError(error) {
      document.querySelectorAll('[data-community-feed], [data-community-post], [data-community-profile], [data-community-admin]').forEach(container => {
        container.innerHTML = '<div class="community-error"><strong>Społeczność AIO wymaga jednorazowej konfiguracji Supabase.</strong><p>' + this.escape(this.friendlyError(error)) + '</p><p>W paczce znajduje się plik <code>supabase/community_setup.sql</code> oraz dokładna instrukcja uruchomienia.</p></div>';
      });
    }
  };

  window.AIOCommunity = Community;
  document.addEventListener('DOMContentLoaded', () => Community.init());
})();
