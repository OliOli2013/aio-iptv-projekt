(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('aio-js');

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('.site-header');

  const setHeaderState = () => {
    if (!header) return;
    header.classList.toggle('aio-header-scrolled', window.scrollY > 24);
  };
  setHeaderState();
  window.addEventListener('scroll', setHeaderState, { passive: true });

  if (!reduced && window.matchMedia('(pointer:fine)').matches) {
    let frame = 0;
    window.addEventListener('pointermove', (event) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--aio-pointer-x', `${event.clientX}px`);
        root.style.setProperty('--aio-pointer-y', `${event.clientY}px`);
        frame = 0;
      });
    }, { passive: true });
  }

  const revealTargets = document.querySelectorAll(
    '.aio-home > section, .module, .hero-compact, .pro-hero, .download-card, .system-card, .choice-card, .community-panel'
  );
  revealTargets.forEach((el) => el.classList.add('aio-reveal'));

  if (reduced || !('IntersectionObserver' in window)) {
    revealTargets.forEach((el) => el.classList.add('aio-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('aio-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -35px 0px' });
    revealTargets.forEach((el) => observer.observe(el));
  }
})();

/* ========================================================================
   AIO-IPTV.pl — optymalizacja transferu Supabase / Community Egress Guard
   2026-10-07, v1
   - trwały cache podpisanych URL-i w przeglądarce,
   - miniatury dla listy wpisów i strony głównej,
   - kompresja nowych zdjęć przed wysłaniem,
   - pełne zdjęcia dopiero na stronie konkretnego wpisu,
   - przyjazna obsługa przekroczenia limitu egress.
   Nie zmienia treści postów, komentarzy, profili ani uprawnień RLS.
   ======================================================================== */
(() => {
  'use strict';

  const DEFAULTS = {
    signedUrlTtlSeconds: 21600,
    signedUrlCacheSeconds: 19800,
    previewSignedUrlTtlSeconds: 43200,
    previewSignedUrlCacheSeconds: 39600,
    feedFullImageMaxBytes: 320000,
    signedCacheMaxEntries: 260,
    uploadMaxLongEdge: 1600,
    uploadQuality: 0.82,
    previewMaxLongEdge: 640,
    previewQuality: 0.68,
    avatarMaxLongEdge: 512,
    avatarQuality: 0.80
  };

  const STORAGE_KEY = 'aio:signed-media:v1';

  function now() { return Date.now(); }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveStore(store, maxEntries) {
    try {
      const t = now();
      const rows = Object.entries(store || {})
        .filter(([, v]) => v && v.url && Number(v.expires || 0) > t + 30000)
        .sort((a, b) => Number(b[1].touched || 0) - Number(a[1].touched || 0))
        .slice(0, Math.max(40, Number(maxEntries || DEFAULTS.signedCacheMaxEntries)));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(rows)));
    } catch (_) {}
  }

  function mediaPath(raw, bucket) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');
    try {
      const url = new URL(value);
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
  }

  function settingsFor(community) {
    const cfg = community && community.config && community.config.egress ? community.config.egress : {};
    return Object.assign({}, DEFAULTS, cfg || {});
  }

  async function getSignedUrl(opts) {
    const client = opts && opts.client;
    const raw = String(opts && opts.value || '').trim();
    const bucket = String(opts && opts.bucket || 'community-media');
    if (!raw) return '';

    const path = mediaPath(raw, bucket);
    if (!path) return raw;
    if (!client || !client.storage) return '';

    const ttl = Math.max(600, Number(opts.ttl || DEFAULTS.signedUrlTtlSeconds));
    const cacheSeconds = Math.max(300, Math.min(ttl - 60, Number(opts.cacheSeconds || DEFAULTS.signedUrlCacheSeconds)));
    const scope = String(opts.userId || 'anon');
    const cacheKey = [scope, bucket, path].join(':');

    const store = readStore();
    const hit = store[cacheKey];
    if (hit && hit.url && Number(hit.expires || 0) > now() + 60000) {
      hit.touched = now();
      saveStore(store, opts.maxEntries);
      return hit.url;
    }

    const result = await client.storage.from(bucket).createSignedUrl(path, ttl);
    if (result.error || !result.data || !result.data.signedUrl) return '';

    store[cacheKey] = {
      url: result.data.signedUrl,
      expires: now() + cacheSeconds * 1000,
      touched: now()
    };
    saveStore(store, opts.maxEntries);
    return result.data.signedUrl;
  }

  function clearScope(userId) {
    if (!userId) return;
    const prefix = String(userId) + ':';
    const store = readStore();
    let changed = false;
    Object.keys(store).forEach(key => {
      if (key.startsWith(prefix)) {
        delete store[key];
        changed = true;
      }
    });
    if (changed) saveStore(store, DEFAULTS.signedCacheMaxEntries);
  }

  function safeName(name) {
    return String(name || 'image')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(-64) || 'image';
  }

  function uuid() {
    try {
      if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (_) {}
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (_) {
        try { return await createImageBitmap(file); } catch (_) {}
      }
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Nie udało się odczytać obrazu.'));
      };
      img.src = url;
    });
  }

  async function makeWebp(file, maxLongEdge, quality) {
    let image = null;
    try {
      image = await decodeImage(file);
      const width = Number(image.width || image.naturalWidth || 0);
      const height = Number(image.height || image.naturalHeight || 0);
      if (!width || !height) return null;

      const scale = Math.min(1, Number(maxLongEdge || 1600) / Math.max(width, height));
      const outW = Math.max(1, Math.round(width * scale));
      const outH = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0, outW, outH);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', Number(quality || 0.82)));
      return blob && blob.size ? blob : null;
    } catch (_) {
      return null;
    } finally {
      try { if (image && typeof image.close === 'function') image.close(); } catch (_) {}
    }
  }

  window.AIOEgress = Object.assign(window.AIOEgress || {}, {
    version: '2026.10.07-egress1',
    defaults: DEFAULTS,
    mediaPath,
    getSignedUrl,
    clearScope
  });

  const C = window.AIOCommunity;
  if (!C) return;

  C.signedMediaUrl = async function(value, expiresIn) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const path = this.mediaPath(raw);
    if (!path) return raw;

    const s = settingsFor(this);
    const isPreview = /(?:^|\/)(?:preview|thumb|thumbnail)[-_\/.]|[-_](?:preview|thumb)\./i.test(path);
    const ttl = Number(expiresIn || (isPreview ? s.previewSignedUrlTtlSeconds : s.signedUrlTtlSeconds));
    const cacheSeconds = isPreview ? s.previewSignedUrlCacheSeconds : s.signedUrlCacheSeconds;

    const cached = this.mediaUrlCache && this.mediaUrlCache.get((this.user ? this.user.id : 'anon') + ':' + path);
    if (cached && cached.expires > now() + 60000) return cached.url;

    const url = await getSignedUrl({
      client: this.client,
      userId: this.user ? this.user.id : 'anon',
      bucket: this.config && this.config.mediaBucket || 'community-media',
      value: path,
      ttl,
      cacheSeconds,
      maxEntries: s.signedCacheMaxEntries
    });

    if (url && this.mediaUrlCache) {
      this.mediaUrlCache.set((this.user ? this.user.id : 'anon') + ':' + path, {
        url,
        expires: now() + Math.max(300, Number(cacheSeconds || 3600) - 60) * 1000
      });
    }
    return url;
  };

  C.prepareAttachments = async function(items) {
    const list = Array.isArray(items) ? items : [];
    const page = document.body && document.body.dataset ? String(document.body.dataset.communityPage || '') : '';
    const feedLike = page === 'feed' || page === 'news';
    const s = settingsFor(this);

    return Promise.all(list.map(async item => {
      if (!item) return item;
      const copy = Object.assign({}, item);
      const fullPath = copy.path || this.mediaPath(copy.url);
      copy.path = fullPath;
      copy.full_path = fullPath;

      if (!feedLike) {
        copy.url = fullPath ? await this.signedMediaUrl(fullPath, s.signedUrlTtlSeconds) : String(copy.url || '');
        return copy;
      }

      const previewPath = copy.preview_path || copy.previewPath || copy.thumbnail_path || '';
      if (previewPath) {
        copy.preview_path = previewPath;
        copy.url = await this.signedMediaUrl(previewPath, s.previewSignedUrlTtlSeconds);
        return copy;
      }

      // Starsze wpisy nie mają miniatur. Nie pobieramy na liście wielomegabajtowych
      // oryginałów. Małe obrazy pozostają widoczne; duże są dostępne po otwarciu wpisu.
      const bytes = Number(copy.size || 0);
      if (fullPath && bytes > 0 && bytes <= Number(s.feedFullImageMaxBytes || DEFAULTS.feedFullImageMaxBytes)) {
        copy.url = await this.signedMediaUrl(fullPath, s.signedUrlTtlSeconds);
      } else {
        copy.url = '';
      }
      return copy;
    }));
  };

  C.uploadImages = async function(fileList, folder) {
    if (!this.requireAuth('Zaloguj się, aby dodawać zdjęcia.')) return [];
    const files = Array.from(fileList || []);
    const maxCount = Number(this.config.maxImagesPerPost || 4);
    const maxBytes = Number(this.config.maxImageSizeMb || 5) * 1024 * 1024;
    const targetFolder = String(folder || 'posts').replace(/[^a-zA-Z0-9_-]+/g, '') || 'posts';
    const s = settingsFor(this);

    if (files.length > maxCount) throw new Error('Możesz dodać maksymalnie ' + maxCount + ' zdjęcia.');

    const results = [];
    for (const file of files) {
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
        throw new Error('Dozwolone są zdjęcia JPG, PNG, WebP i GIF.');
      }
      if (file.size > maxBytes) {
        throw new Error('Plik ' + file.name + ' przekracza limit ' + this.config.maxImageSizeMb + ' MB.');
      }

      const isAvatar = targetFolder === 'avatars';
      const isGif = /^image\/gif$/i.test(file.type);
      const base = this.user.id + '/' + targetFolder + '/' + Date.now() + '-' + uuid() + '-' + safeName(file.name);

      let fullBlob = file;
      let fullExt = (String(file.name || '').match(/\.[a-zA-Z0-9]+$/) || ['.bin'])[0].toLowerCase();

      if (!isGif) {
        const compressed = await makeWebp(
          file,
          isAvatar ? s.avatarMaxLongEdge : s.uploadMaxLongEdge,
          isAvatar ? s.avatarQuality : s.uploadQuality
        );
        if (compressed && compressed.size > 0 && (compressed.size < file.size || file.size > 350000)) {
          fullBlob = compressed;
          fullExt = '.webp';
        }
      }

      const fullPath = base + '-full' + fullExt;
      const fullUpload = await this.client.storage.from(this.config.mediaBucket).upload(fullPath, fullBlob, {
        cacheControl: isAvatar ? '604800' : '21600',
        upsert: false,
        contentType: fullBlob.type || file.type
      });
      if (fullUpload.error) throw fullUpload.error;

      let previewPath = '';
      if (!isAvatar) {
        const previewBlob = await makeWebp(file, s.previewMaxLongEdge, s.previewQuality);
        if (previewBlob && previewBlob.size) {
          previewPath = base + '-preview.webp';
          const previewUpload = await this.client.storage.from(this.config.mediaBucket).upload(previewPath, previewBlob, {
            cacheControl: '604800',
            upsert: false,
            contentType: 'image/webp'
          });
          if (previewUpload.error) previewPath = '';
        }
      }

      results.push({
        url: fullPath,
        path: fullPath,
        preview_path: previewPath || undefined,
        name: file.name,
        size: fullBlob.size,
        original_size: file.size,
        type: fullBlob.type || file.type
      });
    }
    return results;
  };

  const originalFriendlyError = C.friendlyError;
  C.friendlyError = function(error) {
    const message = String(error && (error.message || error.details || error.error_description) || error || '');
    if (/exceed_egress_quota|egress exceeded|fair use policy|all services are restricted|service is restricted|payment required|status.?402|\b402\b/i.test(message)) {
      return 'Społeczność AIO jest chwilowo niedostępna, ponieważ został wyczerpany limit transferu usługi. Treść strony pozostaje dostępna; spróbuj ponownie po odnowieniu limitu.';
    }
    return originalFriendlyError.call(this, error);
  };

  const originalSignOut = C.signOut;
  C.signOut = async function() {
    const userId = this.user && this.user.id ? this.user.id : '';
    try {
      return await originalSignOut.call(this);
    } finally {
      clearScope(userId);
    }
  };
})();
