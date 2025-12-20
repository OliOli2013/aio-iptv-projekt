// AI‑Chat page helper
// Ensures the floating AI drawer opens automatically when visiting ai-chat.html.
(function () {
  'use strict';

  function openByFabClick() {
    const fab = document.getElementById('ai-chat-fab');
    if (!fab) return false;
    fab.click();
    return true;
  }

  function wireInlineButton() {
    const btn = document.getElementById('openAiChatBtn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openByFabClick();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Hint for site.js (optional)
    window.__aio_ai_chat_autopen = true;

    wireInlineButton();

    let attempts = 0;
    const maxAttempts = 30;
    const timer = setInterval(() => {
      attempts += 1;
      if (openByFabClick()) {
        clearInterval(timer);
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
        // If the FAB never appeared, keep the page usable via inline button.
        const status = document.getElementById('aiChatStatus');
        if (status) {
          status.textContent = 'Nie udało się uruchomić okna czatu. Odśwież stronę lub sprawdź, czy assets/js/site.js ładuje się poprawnie.';
        }
      }
    }, 150);
  });
})();
