// AI-Chat page helper:
// - Opens the AI-Chat drawer automatically on page load
// - Provides minimal page copy in PL/EN (auto by device language)
(function () {
  'use strict';

  function detectLang() {
    try {
      var l = String(navigator.language || 'pl').toLowerCase();
      return l.indexOf('pl') === 0 ? 'pl' : 'en';
    } catch (e) {
      return 'pl';
    }
  }

  function applyLocalCopy() {
    var lang = detectLang();
    var title = document.getElementById('aiChatPageTitle');
    var hint = document.getElementById('aiChatPageHint');
    var loading = document.getElementById('aiChatPageLoading');
    var btn = document.getElementById('openAiChatBtn');

    if (lang === 'en') {
      if (title) title.textContent = 'AI‑Chat Enigma2';
      if (hint) hint.textContent = 'The chat window should open automatically. If you do not see it, use the “AI Chat” button in the bottom-right corner.';
      if (loading) loading.textContent = 'Launching AI‑Chat…';
      if (btn) btn.textContent = 'Open AI‑Chat';
    } else {
      // PL (default)
      if (title) title.textContent = 'AI‑Chat Enigma2';
      if (hint) hint.textContent = 'Okno czatu powinno otworzyć się automatycznie. Jeśli nie widzisz okna, użyj przycisku „AI Chat” w prawym dolnym rogu.';
      if (loading) loading.textContent = 'Uruchamiam AI‑Chat…';
      if (btn) btn.textContent = 'Otwórz AI‑Chat';
    }
  }

  function openDrawerWithRetry(maxMs) {
    var start = Date.now();
    (function tick() {
      var fab = document.getElementById('ai-chat-fab');
      if (fab) {
        fab.click();
        return;
      }
      if (Date.now() - start < maxMs) {
        setTimeout(tick, 80);
      }
    })();
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyLocalCopy();

    var btn = document.getElementById('openAiChatBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        openDrawerWithRetry(2000);
      });
    }

    // Auto-open on page load
    openDrawerWithRetry(2000);
  });
})();
