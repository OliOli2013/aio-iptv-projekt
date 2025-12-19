/* Simple i18n (PL/EN) – auto language based on browser/OS, with optional localStorage override.
   Keys are applied to elements via:
   - data-i18n="key"        -> textContent
   - data-i18n-html="key"   -> innerHTML
   - data-i18n-aria-label="key" -> aria-label
*/
(function () {
  "use strict";

  const I18N = {
    pl: {
      // Top / navigation
      cta_update_download: 'Aktualizacja <strong>AIO Panel v5.0</strong> — Pobierz teraz',
      nav_plugins: "Wtyczki",
      nav_lists: "Listy",
      nav_channel_lists: "Listy kanałów",
      nav_guides: "Porady",
      nav_knowledge: "Wiedza",
      nav_tools: "Narzędzia",
      nav_generator: "Generator",
      nav_files: "Pliki",
      nav_contact: "Kontakt",
      nav_support: "Wsparcie",
      nav_systems: "Systemy",
      nav_comparison: "Porównywarka",
      nav_creator: "Kreator",
      nav_stats: "Statystyki",

      // Mobile drawer
      mobile_menu_title: "Menu",
      aria_close: "Zamknij",
      aria_support_coffee: "Wsparcie (Postaw kawę)",

      // Home quick start cards
      quick_plugins_title: "Wtyczki",
      quick_plugins_desc: "Najważniejsze dodatki dla Enigma2 – zawsze aktualne.",
      quick_lists_title: "Listy kanałów",
      quick_lists_desc: "Bzyk83, JakiTaki i inne – gotowe paczki do pobrania.",
      quick_guides_title: "Porady",
      quick_guides_desc: "Instrukcje, triki i rozwiązania problemów krok po kroku.",

      // Sections / UI
      start_here_title: "Start tutaj",
      start_here_desc: "Najczęściej używane narzędzia i sekcje w jednym miejscu.",
      new_comments_banner: "NOWOŚĆ! System komentarzy jest już dostępny!",
      btn_view_comments: "Zobacz komentarze",
      btn_sign_up: "Zapisz się",
    },

    en: {
      // Top / navigation
      cta_update_download: 'Update: <strong>AIO Panel v5.0</strong> — Download now',
      nav_plugins: "Plugins",
      nav_lists: "Lists",
      nav_channel_lists: "Channel lists",
      nav_guides: "Guides",
      nav_knowledge: "Knowledge",
      nav_tools: "Tools",
      nav_generator: "Generator",
      nav_files: "Files",
      nav_contact: "Contact",
      nav_support: "Support",
      nav_systems: "Systems",
      nav_comparison: "Comparison",
      nav_creator: "Creator",
      nav_stats: "Statistics",

      // Mobile drawer
      mobile_menu_title: "Menu",
      aria_close: "Close",
      aria_support_coffee: "Support (Buy me a coffee)",

      // Home quick start cards
      quick_plugins_title: "Plugins",
      quick_plugins_desc: "Essential add-ons for Enigma2 — always up to date.",
      quick_lists_title: "Channel lists",
      quick_lists_desc: "Bzyk83, JakiTaki and more — ready-to-download packs.",
      quick_guides_title: "Guides",
      quick_guides_desc: "Step-by-step instructions, tips and troubleshooting.",

      // Sections / UI
      start_here_title: "Start here",
      start_here_desc: "Most-used tools and sections in one place.",
      new_comments_banner: "NEW! The comments system is now available!",
      btn_view_comments: "View comments",
      btn_sign_up: "Sign up",
    },
  };

  function normalizeLang(raw) {
    const l = (raw || "").toLowerCase();
    if (l.startsWith("pl")) return "pl";
    return "en";
  }

  function detectLang() {
    // Manual override (optional)
    try {
      const saved = window.localStorage && localStorage.getItem("aio_lang");
      if (saved) return normalizeLang(saved);
    } catch (e) {}

    // Device/browser language
    const nav = window.navigator;
    const candidate = (nav.languages && nav.languages[0]) || nav.language || nav.userLanguage || "pl";
    return normalizeLang(candidate);
  }

  function applyTranslations(lang) {
    const dict = I18N[lang] || I18N.pl;

    // Update <html lang="">
    try { document.documentElement.lang = lang; } catch (e) {}

    // textContent
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const val = dict[key];
      if (typeof val === "string") el.textContent = val;
    });

    // innerHTML
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      if (!key) return;
      const val = dict[key];
      if (typeof val === "string") el.innerHTML = val;
    });

    // aria-label
    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      if (!key) return;
      const val = dict[key];
      if (typeof val === "string") el.setAttribute("aria-label", val);
    });
  }

  // Expose minimal API (optional, for later adding a language toggle)
  window.AIO_I18N = {
    setLang: function (lang) {
      const normalized = normalizeLang(lang);
      try { localStorage.setItem("aio_lang", normalized); } catch (e) {}
      applyTranslations(normalized);
    },
    getLang: function () {
      return detectLang();
    }
  };

  // Apply on ready (and once more after load to catch late-initialized UI)
  const lang = detectLang();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      applyTranslations(lang);
      window.setTimeout(function () { applyTranslations(lang); }, 250);
    });
  } else {
    applyTranslations(lang);
    window.setTimeout(function () { applyTranslations(lang); }, 250);
  }
})();
