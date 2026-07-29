/* AIO-IPTV.pl — automatic PL/EN language selection, 2026-07-29
   Polish browser language keeps the original Polish site.
   Any other browser language opens an English machine-translated view.
   Optional override: append ?lang=pl or ?lang=en to any page. */
(function () {
  'use strict';

  var STORAGE_KEY = 'aio_lang';
  var GOOGLE_COOKIE = 'googtrans';

  function queryLanguage() {
    try {
      var value = new URLSearchParams(window.location.search).get('lang');
      value = String(value || '').toLowerCase();
      return value === 'pl' || value === 'en' ? value : '';
    } catch (_) {
      return '';
    }
  }

  function savedLanguage() {
    try {
      var value = String(window.localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
      return value === 'pl' || value === 'en' ? value : '';
    } catch (_) {
      return '';
    }
  }

  function browserLanguage() {
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || navigator.userLanguage || 'pl'];
    var value = String(list[0] || 'pl').toLowerCase();
    return value.indexOf('pl') === 0 ? 'pl' : 'en';
  }

  function storeLanguage(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
  }

  function cookieDomain() {
    var host = String(window.location.hostname || '');
    return host && host.indexOf('.') !== -1 && host !== 'localhost' ? '; domain=.' + host : '';
  }

  function setTranslationCookie(value) {
    var maxAge = 60 * 60 * 24 * 365;
    document.cookie = GOOGLE_COOKIE + '=' + value + '; path=/; max-age=' + maxAge + '; SameSite=Lax';
    document.cookie = GOOGLE_COOKIE + '=' + value + '; path=/; max-age=' + maxAge + '; SameSite=Lax' + cookieDomain();
  }

  function clearTranslationCookie() {
    document.cookie = GOOGLE_COOKIE + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    document.cookie = GOOGLE_COOKIE + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax' + cookieDomain();
  }

  var explicit = queryLanguage();
  if (explicit) storeLanguage(explicit);
  var target = explicit || savedLanguage() || browserLanguage();
  document.documentElement.setAttribute('lang', target);
  window.AIO_LANGUAGE = target;

  // Keep commands, paths and technical logs unchanged by machine translation.
  function protectTechnicalContent(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('pre, code, kbd, samp, .command, [data-copy]');
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].classList.add('notranslate');
      nodes[i].setAttribute('translate', 'no');
    }
  }

  window.AIOSetLanguage = function (language) {
    var next = String(language || '').toLowerCase() === 'pl' ? 'pl' : 'en';
    storeLanguage(next);
    if (next === 'pl') clearTranslationCookie();
    else setTranslationCookie('/pl/en');
    window.location.reload();
  };

  if (target === 'pl') {
    clearTranslationCookie();
    document.addEventListener('DOMContentLoaded', function () { protectTechnicalContent(document); });
    return;
  }

  setTranslationCookie('/pl/en');

  var style = document.createElement('style');
  style.textContent = [
    '#google_translate_element{display:none!important}',
    '.goog-te-banner-frame.skiptranslate,.goog-te-gadget,.goog-logo-link,#goog-gt-tt,.goog-te-balloon-frame{display:none!important}',
    'body{top:0!important}'
  ].join('');
  document.head.appendChild(style);

  window.googleTranslateElementInit = function () {
    var holder = document.getElementById('google_translate_element');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'google_translate_element';
      holder.setAttribute('aria-hidden', 'true');
      (document.body || document.documentElement).appendChild(holder);
    }
    protectTechnicalContent(document);
    if (window.google && window.google.translate && window.google.translate.TranslateElement) {
      new window.google.translate.TranslateElement({
        pageLanguage: 'pl',
        includedLanguages: 'en',
        autoDisplay: false
      }, 'google_translate_element');
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    protectTechnicalContent(document);
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        for (var j = 0; j < mutations[i].addedNodes.length; j += 1) {
          var node = mutations[i].addedNodes[j];
          if (node && node.nodeType === 1) protectTechnicalContent(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  var script = document.createElement('script');
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  script.onerror = function () {
    // The original Polish page remains fully usable if the external translation service is unavailable.
    document.documentElement.setAttribute('lang', 'pl');
  };
  document.head.appendChild(script);
}());
