/* Simple i18n (PL/EN) – auto language based on browser/OS, with optional localStorage override.
   Keys are applied to elements via:
   - data-i18n="key"              -> textContent
   - data-i18n-html="key"         -> innerHTML
   - data-i18n-aria-label="key"   -> aria-label
*/
(function () {
  "use strict";

  const I18N = {
    pl: {
      cta_update_download: 'Aktualizacja <strong>AIO Panel v5.0</strong> — Pobierz teraz',
      nav_plugins: "Wtyczki Enigma2",
      nav_lists: "Listy kanałów",
      nav_channel_lists: "Listy kanałów",
      nav_guides: "Porady i instrukcje",
      nav_knowledge: "Baza wiedzy",
      nav_tools: "Narzędzia systemowe",
      nav_generator: "Generator One‑Liner",
      nav_files: "Pliki do pobrania",
      nav_contact: "Kontakt",
      nav_support: "Wsparcie projektu",
      nav_systems: "Systemy Enigma2",
      nav_comparison: "Porównywarka tunerów",
      nav_creator: "Kreator konfiguracji",
      nav_stats: "Statystyki odwiedzin",
      quick_lists_title: "Listy kanałów",
      quick_lists_desc: "Bzyk83, JakiTaki i inne – gotowe paczki do pobrania.",
      quick_guides_title: "Porady",
      quick_guides_desc: "Instrukcje, triki i rozwiązania problemów krok po kroku.",
      start_here_title: "Start tutaj",
      start_here_desc: "Najczęściej używane narzędzia i sekcje w jednym miejscu.",
      new_comments_banner: "NOWOŚĆ! System komentarzy jest już dostępny!",
      btn_view_comments: "Zobacz komentarze",
      btn_sign_up: "Zapisz się",
      footer_support_title: "Wsparcie",
      support_cta: "Wesprzyj projekt",
      support_thanks: "Dzięki!",
      mobile_menu_title: "Menu",
      aria_close: "Zamknij",
      aria_support_coffee: "Wsparcie (Postaw kawę)",
      quick_plugins_title: "Wtyczki",
      quick_plugins_desc: "Najważniejsze dodatki dla Enigma2 – zawsze aktualne.",
    },
    en: {
      cta_update_download: 'Update: <strong>AIO Panel v5.0</strong> — Download now',
      nav_plugins: "Enigma2 plugins",
      nav_lists: "Channel lists",
      nav_channel_lists: "Channel lists",
      nav_guides: "Guides & tutorials",
      nav_knowledge: "Knowledge base",
      nav_tools: "System tools",
      nav_generator: "One‑liner generator",
      nav_files: "Downloads",
      nav_contact: "Contact",
      nav_support: "Project support",
      nav_systems: "Enigma2 systems",
      nav_comparison: "Receiver comparison",
      nav_creator: "Config builder",
      nav_stats: "Visit statistics",
      quick_lists_title: "Channel lists",
      quick_lists_desc: "Bzyk83, JakiTaki and more — ready-to-download packs.",
      quick_guides_title: "Guides",
      quick_guides_desc: "Step-by-step instructions, tips and troubleshooting.",
      start_here_title: "Start here",
      start_here_desc: "Most-used tools and sections in one place.",
      new_comments_banner: "NEW! The comments system is now available!",
      btn_view_comments: "View comments",
      btn_sign_up: "Sign up",
      footer_support_title: "Support",
      support_cta: "Support the project",
      support_thanks: "Thanks!",
      mobile_menu_title: "Menu",
      aria_close: "Close",
      aria_support_coffee: "Support (Buy me a coffee)",
      quick_plugins_title: "Plugins",
      quick_plugins_desc: "Essential add-ons for Enigma2 — always up to date.",
    },
  };

  function getLang() {
    const saved = (localStorage.getItem("aio_lang") || "").toLowerCase();
    if (saved === "pl" || saved === "en") return saved;
    const nav = (navigator.language || navigator.userLanguage || "pl").toLowerCase();
    return nav.startsWith("pl") ? "pl" : "en";
  }

  function applyI18n(lang) {
    const dict = I18N[lang] || I18N.pl;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key] != null) el.textContent = dict[key];
    });

    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      if (dict[key] != null) el.innerHTML = dict[key];
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      if (dict[key] != null) el.setAttribute("aria-label", dict[key]);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyI18n(getLang());
  });
})();
