/* Enigma2 error scanner (client-side):
   - Optional OCR via Tesseract.js (loaded on error-scan.html)
   - Pattern-based classification with practical suggestions.

   Notes:
   - No uploads are sent to any server.
   - Keep this file self-contained to avoid impacting other site functions.
*/
(function () {
  "use strict";

  function getLang() {
    const saved = (localStorage.getItem("aio_lang") || "").toLowerCase();
    if (saved === "pl" || saved === "en") return saved;
    const nav = (navigator.language || navigator.userLanguage || "pl").toLowerCase();
    return nav.startsWith("pl") ? "pl" : "en";
  }

  const L = {
    pl: {
      none: "Nie rozpoznano jednoznacznego błędu. Poniżej znajdziesz kilka kroków diagnostycznych, które zwykle prowadzą do rozwiązania.",
      stepsTitle: "Sugerowane kroki",
      foundTitle: "Rozpoznany problem",
      evidence: "Wykryte frazy",
      rawTitle: "Tekst do analizy",
      copy: "Kopiuj",
      copied: "Skopiowano",
      tips: [
        "Jeśli to zielony ekran: sprawdź najnowszy crashlog (zwykle /home/root/logs/ lub /media/hdd/).",
        "Wyłącz/odinstaluj ostatnio dodaną wtyczkę/skórkę i uruchom GUI ponownie.",
        "Zweryfikuj wersję Pythona w image (Python 2 vs 3) i dopasuj wtyczki do systemu.",
      ],
      ocrFail: "OCR nie powiódł się. Spróbuj wgrać wyraźniejszy obraz lub wklej fragment crashloga w polu tekstowym.",
      noText: "Brak tekstu do analizy. Wgraj obraz lub wklej crashlog.",
    },
    en: {
      none: "No clear error signature detected. Below are troubleshooting steps that usually lead to a fix.",
      stepsTitle: "Suggested steps",
      foundTitle: "Detected issue",
      evidence: "Matched phrases",
      rawTitle: "Analyzed text",
      copy: "Copy",
      copied: "Copied",
      tips: [
        "If this is a green screen: check the latest crashlog (often /home/root/logs/ or /media/hdd/).",
        "Disable/uninstall the last added plugin/skin and restart the GUI.",
        "Verify your image Python version (Python 2 vs 3) and match plugins accordingly.",
      ],
      ocrFail: "OCR failed. Try a clearer image or paste a crashlog excerpt into the text box.",
      noText: "No text to analyze. Upload an image or paste a crashlog.",
    },
  };

  function t(key) {
    const lang = getLang();
    return (L[lang] && L[lang][key]) || L.pl[key] || "";
  }

  // Pattern library (keep small & practical; can be extended later).
  function getRules() {
    const lang = getLang();

    const PL = {
      modalOpen: {
        title: "RuntimeError: Modal open",
        desc: "Wtyczka próbuje otworzyć nowe okno (session.open) gdy inne okno modalne jest już aktywne.",
        steps: [
          "Zrób restart GUI (Menu → Standby/Restart → Restart GUI).",
          "Zaktualizuj wtyczkę do wersji zgodnej z Twoim image (często poprawka polega na użyciu session.openWithCallback / zabezpieczeniu wielokrotnego otwierania okien).",
          "Jeśli błąd pojawia się po wejściu do konkretnej sekcji: usuń/wyłącz ostatnio dodaną wtyczkę i sprawdź ponownie.",
        ],
      },
      noModule: {
        title: "Brak modułu / ImportError",
        desc: "Wtyczka lub skrypt nie znajduje wymaganego modułu albo jest niezgodny z wersją Pythona.",
        steps: [
          "Sprawdź, czy używasz Pythona 2 czy 3 w Twoim image. Wtyczki muszą być skompilowane/pod ten sam Python.",
          "Doinstaluj wymagane pakiety (opkg) lub użyj wersji wtyczki dedykowanej Twojemu systemowi.",
          "Jeśli w crashlogu widać konkretną nazwę modułu: wyszukaj ją w feedzie (Menu → Pobierz wtyczki) lub w dokumentacji wtyczki.",
        ],
      },
      skin: {
        title: "Błąd skina (SkinError)",
        desc: "System nie może wczytać elementu skórki (brak widgetu/komponentu lub konflikt definicji XML).",
        steps: [
          "Przełącz skórkę na domyślną (jeśli GUI się uruchamia) i uruchom GUI ponownie.",
          "Zaktualizuj/ponownie zainstaluj skina. Często problemem jest niezgodność z wersją Enigma2.",
          "Jeśli błąd dotyczy konkretnego pliku skin.xml: przywróć kopię zapasową albo usuń ostatnie modyfikacje.",
        ],
      },
      segv: {
        title: "Błąd krytyczny (Segmentation fault / signal 11)",
        desc: "Awaria na poziomie natywnym (biblioteki/C++), często związana ze sterownikami, bibliotekami lub niestabilną wtyczką.",
        steps: [
          "Zaktualizuj image / sterowniki i wykonaj restart GUI.",
          "Odinstaluj ostatnio dodane wtyczki (zwłaszcza te z binarnymi bibliotekami) i przetestuj ponownie.",
          "Sprawdź wolne miejsce/RAM (zbyt mało pamięci również bywa przyczyną niestabilności).",
        ],
      },
      network: {
        title: "Problem z siecią/SSL",
        desc: "Błąd pobierania (wget/curl) lub handshake SSL/TLS. Często wynika z braku certyfikatów, złej daty systemowej lub blokady DNS.",
        steps: [
          "Sprawdź datę i czas w tunerze (błędna data powoduje problemy z SSL).",
          "Zainstaluj/odśwież certyfikaty CA (np. pakiet ca-certificates) i uruchom GUI ponownie.",
          "Zweryfikuj DNS (np. ustaw 1.1.1.1 / 8.8.8.8) i przetestuj ping.",
        ],
      },
      busyboxOpkg: {
        title: "Problem z opkg (feed/konflikty)",
        desc: "Instalacja pakietu nie powiodła się (zależności, konflikty, brak miejsca).",
        steps: [
          "Wykonaj: opkg update, a następnie spróbuj ponownie instalacji.",
          "Sprawdź wolne miejsce na / (df -h) i usuń niepotrzebne pakiety.",
          "Jeśli komunikat mówi o konflikcie: odinstaluj poprzednią wersję wtyczki/pakietu i zainstaluj na czysto.",
        ],
      },
      fileNotFound: {
        title: "Brak pliku/ścieżki (Errno 2)",
        desc: "Wtyczka odwołuje się do pliku, którego nie ma w systemie (zła ścieżka, brak uprawnień, brak montowania HDD/USB).",
        steps: [
          "Upewnij się, że dysk (HDD/USB) jest zamontowany (mount) i ma prawidłową ścieżkę.",
          "Jeśli to plik wtyczki: zainstaluj ją ponownie lub przywróć brakujący plik.",
          "Sprawdź uprawnienia katalogu (chmod/chown) – szczególnie w /tmp, /usr, /etc.",
        ],
      },
    };

    const EN = {
      modalOpen: {
        title: "RuntimeError: Modal open",
        desc: "A plugin tries to open a new screen (session.open) while another modal screen is already active.",
        steps: [
          "Restart the GUI (Menu → Standby/Restart → Restart GUI).",
          "Update the plugin to a version compatible with your image (common fix: use session.openWithCallback / guard against multiple opens).",
          "If it happens when entering a specific section: uninstall/disable the last installed plugin and test again.",
        ],
      },
      noModule: {
        title: "Missing module / ImportError",
        desc: "A plugin or script cannot import a required module or is incompatible with your Python version.",
        steps: [
          "Check whether your image uses Python 2 or Python 3. Plugins must match the same Python version.",
          "Install missing dependencies (opkg) or use the plugin build dedicated to your system.",
          "If the crashlog shows the exact module name: look it up in your feed (Download plugins) or the plugin documentation.",
        ],
      },
      skin: {
        title: "Skin error (SkinError)",
        desc: "Enigma2 cannot load a skin element (missing widget/component or XML definition conflict).",
        steps: [
          "Switch to the default skin (if the GUI boots) and restart the GUI.",
          "Update/reinstall the skin (often a version mismatch with your Enigma2 build).",
          "If the crash mentions skin.xml: restore a backup or revert recent edits.",
        ],
      },
      segv: {
        title: "Critical crash (Segmentation fault / signal 11)",
        desc: "Native-level crash (C++/libraries), often driver/library related or caused by an unstable binary plugin.",
        steps: [
          "Update your image/drivers and restart the GUI.",
          "Remove recently installed plugins (especially those shipping binary libs) and test again.",
          "Check free storage/RAM (low memory can also cause instability).",
        ],
      },
      network: {
        title: "Network / SSL issue",
        desc: "Download errors (wget/curl) or SSL/TLS handshake failures, often due to missing CA certs, wrong system time, or DNS blocking.",
        steps: [
          "Verify receiver date/time (wrong time breaks SSL validation).",
          "Install/refresh CA certificates (e.g., ca-certificates) and restart the GUI.",
          "Verify DNS (e.g., 1.1.1.1 / 8.8.8.8) and test ping.",
        ],
      },
      busyboxOpkg: {
        title: "opkg problem (feed/conflicts)",
        desc: "Package install failed (dependencies, conflicts, insufficient space).",
        steps: [
          "Run: opkg update, then retry installation.",
          "Check free space on / (df -h) and remove unused packages.",
          "If it mentions a conflict: remove the older package/plugin and install cleanly.",
        ],
      },
      fileNotFound: {
        title: "Missing file/path (Errno 2)",
        desc: "A plugin references a file that does not exist (wrong path, permissions, or missing HDD/USB mount).",
        steps: [
          "Make sure the drive (HDD/USB) is mounted (mount) and the path is correct.",
          "If it is a plugin file: reinstall the plugin or restore the missing file.",
          "Check directory permissions (chmod/chown) — especially /tmp, /usr, /etc.",
        ],
      },
    };

    const R = lang === "en" ? EN : PL;

    return [
      {
        id: "modalOpen",
        score: 10,
        patterns: ["runtimeerror: modal open", "modal open"],
        data: R.modalOpen,
      },
      {
        id: "skin",
        score: 9,
        patterns: ["skinerror", "error loading skin", "skin\u0020error"],
        data: R.skin,
      },
      {
        id: "noModule",
        score: 8,
        patterns: ["no module named", "importerror", "cannot import name"],
        data: R.noModule,
      },
      {
        id: "segv",
        score: 7,
        patterns: ["segmentation fault", "signal 11", "sigsegv"],
        data: R.segv,
      },
      {
        id: "network",
        score: 6,
        patterns: ["ssl", "tls", "certificate verify failed", "handshake", "wget:"],
        data: R.network,
      },
      {
        id: "busyboxOpkg",
        score: 5,
        patterns: ["opkg", "cannot satisfy the following dependencies", "unknown package", "collected errors"],
        data: R.busyboxOpkg,
      },
      {
        id: "fileNotFound",
        score: 4,
        patterns: ["errno 2", "no such file or directory"],
        data: R.fileNotFound,
      },
    ];
  }

  function normalize(text) {
    return (text || "")
      .toString()
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .toLowerCase();
  }

  function analyze(text) {
    const norm = normalize(text);
    const rules = getRules();
    const hits = [];

    for (const rule of rules) {
      const matched = [];
      for (const p of rule.patterns) {
        try {
          const re = new RegExp(p, "i");
          if (re.test(norm)) matched.push(p);
        } catch (_) {
          if (norm.indexOf(p.toLowerCase()) !== -1) matched.push(p);
        }
      }
      if (matched.length) {
        hits.push({
          id: rule.id,
          score: rule.score + matched.length,
          matched,
          data: rule.data,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return { norm, hits };
  }

  function escapeHtml(s) {
    return (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderResult(text) {
    const el = document.getElementById("result");
    if (!el) return;

    const { hits } = analyze(text);

    const lang = getLang();
    const baseTips = (L[lang] && L[lang].tips) || L.pl.tips;

    let html = "";

    if (hits.length) {
      const best = hits[0];
      html += `
        <div style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap">
          <div style="font-weight:800">${escapeHtml(t("foundTitle"))}:</div>
          <div style="font-weight:800">${escapeHtml(best.data.title)}</div>
        </div>
        <div style="margin-top:10px; color:var(--muted)">${escapeHtml(best.data.desc)}</div>
      `;
      html += `
        <div style="margin-top:14px; font-weight:800">${escapeHtml(t("stepsTitle"))}</div>
        <ol style="margin-top:10px; padding-left: 18px">
          ${best.data.steps.map((s) => `<li style="margin: 6px 0">${escapeHtml(s)}</li>`).join("")}
        </ol>
      `;

      const evidence = [...new Set(hits.flatMap((h) => h.matched))].slice(0, 10);
      if (evidence.length) {
        html += `
          <div style="margin-top:14px; color:var(--muted)">
            <span style="font-weight:700">${escapeHtml(t("evidence"))}:</span>
            <span>${escapeHtml(evidence.join(", "))}</span>
          </div>
        `;
      }
    } else {
      html += `<div style="color:var(--muted)">${escapeHtml(t("none"))}</div>`;
      html += `
        <div style="margin-top:14px; font-weight:800">${escapeHtml(t("stepsTitle"))}</div>
        <ol style="margin-top:10px; padding-left: 18px">
          ${baseTips.map((s) => `<li style="margin: 6px 0">${escapeHtml(s)}</li>`).join("")}
        </ol>
      `;
    }

    const trimmed = (text || "").trim();
    if (trimmed) {
      html += `
        <div style="margin-top:16px; display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap">
          <div style="font-weight:800">${escapeHtml(t("rawTitle"))}</div>
          <button id="copyRaw" class="btn" type="button">${escapeHtml(t("copy"))}</button>
        </div>
        <pre style="margin-top:10px; padding:12px 14px; border-radius:16px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.2); overflow:auto; max-height: 260px;">${escapeHtml(trimmed)}</pre>
      `;
    }

    el.innerHTML = html;

    const copyBtn = document.getElementById("copyRaw");
    if (copyBtn && trimmed) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(trimmed);
          const old = copyBtn.textContent;
          copyBtn.textContent = t("copied");
          setTimeout(() => (copyBtn.textContent = old), 1200);
        } catch (_) {
          // silently ignore
        }
      });
    }
  }

  async function runOcr(imgEl) {
    if (!window.Tesseract || !imgEl) throw new Error("tesseract_missing");

    const progressWrap = document.getElementById("scanProgress");
    const pctEl = document.getElementById("scanPct");
    const barEl = document.getElementById("scanBar");
    if (progressWrap) progressWrap.style.display = "block";
    if (pctEl) pctEl.textContent = "0%";
    if (barEl) barEl.style.width = "0%";

    const { data } = await window.Tesseract.recognize(imgEl, "eng", {
      logger: (m) => {
        if (m && m.status === "recognizing text" && typeof m.progress === "number") {
          const p = Math.max(0, Math.min(1, m.progress));
          const pct = Math.round(p * 100);
          if (pctEl) pctEl.textContent = pct + "%";
          if (barEl) barEl.style.width = pct + "%";
        }
      },
    });

    if (progressWrap) progressWrap.style.display = "none";
    return (data && data.text) || "";
  }

  function setButtons(enabled) {
    const scanBtn = document.getElementById("scanBtn");
    const clearBtn = document.getElementById("clearBtn");
    if (scanBtn) scanBtn.disabled = !enabled;
    if (clearBtn) clearBtn.disabled = !enabled;
  }

  function clearAll() {
    const file = document.getElementById("e2Image");
    const txt = document.getElementById("e2Text");
    const preview = document.getElementById("imagePreview");
    const img = document.getElementById("previewImg");
    if (file) file.value = "";
    if (txt) txt.value = "";
    if (preview) preview.style.display = "none";
    if (img) img.src = "";
    setButtons(false);
    const el = document.getElementById("result");
    if (el) {
      el.innerHTML = `<div style="color:var(--muted)">${escapeHtml(t("noText"))}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const fileInput = document.getElementById("e2Image");
    const scanBtn = document.getElementById("scanBtn");
    const clearBtn = document.getElementById("clearBtn");
    const previewWrap = document.getElementById("imagePreview");
    const previewImg = document.getElementById("previewImg");
    const textArea = document.getElementById("e2Text");
    const analyzeTextBtn = document.getElementById("analyzeTextBtn");

    if (fileInput) {
      fileInput.addEventListener("change", () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) {
          setButtons(false);
          if (previewWrap) previewWrap.style.display = "none";
          return;
        }
        setButtons(true);

        // Preview
        try {
          const url = URL.createObjectURL(f);
          if (previewImg) previewImg.src = url;
          if (previewWrap) previewWrap.style.display = "block";
        } catch (_) {
          // ignore preview failures
        }
      });
    }

    if (scanBtn) {
      scanBtn.addEventListener("click", async () => {
        if (!previewImg || !previewImg.src) return;
        scanBtn.disabled = true;
        try {
          const txt = await runOcr(previewImg);
          const cleaned = (txt || "").trim();
          if (!cleaned) {
            renderResult(t("ocrFail"));
          } else {
            if (textArea) textArea.value = cleaned;
            renderResult(cleaned);
          }
        } catch (_) {
          renderResult(t("ocrFail"));
        } finally {
          scanBtn.disabled = false;
        }
      });
    }

    if (analyzeTextBtn) {
      analyzeTextBtn.addEventListener("click", () => {
        const txt = (textArea && textArea.value) || "";
        if (!txt.trim()) {
          renderResult(t("noText"));
          return;
        }
        renderResult(txt);
        setButtons(true);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", clearAll);
    }

    // Initial state
    setButtons(false);
  });
})();
