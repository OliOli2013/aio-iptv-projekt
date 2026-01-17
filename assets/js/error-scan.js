/*
  error-scan.js — Professional Enigma2 error intake (Image OCR + Text) -> AI‑Chat Enigma2

  Features:
  - Image: upload / drag&drop / paste (Ctrl+V)
  - OCR (local, in-browser) with lightweight preprocessing (contrast/threshold)
  - Text: paste or type crashlog/traceback
  - One-click: send text to built‑in AI‑Chat drawer (injected by assets/js/site.js)

  Privacy:
  - Images never leave the browser.
  - Only text is sent to AI‑Chat (and only if user clicks Send / enables auto-send).

  Integration contract (provided by assets/js/site.js):
  - #ai-chat-fab (button to open drawer)
  - #aiChatInput (input)
  - #aiChatForm  (form submit handler)
*/
(function () {
  'use strict';

  // ----------------------------
  // Language helpers
  // ----------------------------
  function getLang() {
    const saved = (localStorage.getItem('aio_lang') || '').toLowerCase();
    if (saved === 'pl' || saved === 'en') return saved;
    const nav = (navigator.language || navigator.userLanguage || 'pl').toLowerCase();
    return nav.startsWith('pl') ? 'pl' : 'en';
  }

  const I18N = {
    pl: {
      ocrBtn: 'Odczytaj tekst (OCR)',
      ocrWorking: 'Trwa OCR…',
      ocrEmpty: 'OCR nie wykrył tekstu. Spróbuj wyraźniejszego zrzutu lub wklej crashlog.',
      noText: 'Brak tekstu. Wklej crashlog/komunikat albo wykonaj OCR z obrazu.',
      sent: 'Wysłano do AI‑Chat. Sprawdź odpowiedź w oknie czatu.',
      aiMissing: 'Nie wykryto modułu AI‑Chat na tej stronie. Upewnij się, że ładuje się assets/js/site.js.',
      copyOk: 'Skopiowano.',
      prepOk: 'Tekst przygotowany. Teraz kliknij „Diagnozuj w AI‑Chat”.',
      hint: 'Wskazówka: najlepsze wyniki daje 20–80 linii crashloga z tracebackiem.',
    },
    en: {
      ocrBtn: 'Read text (OCR)',
      ocrWorking: 'OCR running…',
      ocrEmpty: 'OCR did not detect text. Try a clearer screenshot or paste a crashlog.',
      noText: 'No text provided. Paste an error/crashlog or run OCR on an image.',
      sent: 'Sent to AI‑Chat. Check the chat drawer for the reply.',
      aiMissing: 'AI‑Chat module not found on this page. Ensure assets/js/site.js is loaded.',
      copyOk: 'Copied.',
      prepOk: 'Text prepared. Now click “Diagnose in AI‑Chat”.',
      hint: 'Tip: best results come from 20–80 lines of crashlog including traceback.',
    },
  };

  function t(key) {
    const lang = getLang();
    return (I18N[lang] && I18N[lang][key]) || (I18N.pl && I18N.pl[key]) || '';
  }

  // ----------------------------
  // DOM helpers
  // ----------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return (s || '')
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setResult(html) {
    const el = $('result');
    if (!el) return;
    el.innerHTML = html;
  }

  function setProgress(show, pct) {
    const wrap = $('scanProgress');
    const pctEl = $('scanPct');
    const bar = $('scanBar');
    if (!wrap || !pctEl || !bar) return;
    wrap.style.display = show ? 'block' : 'none';
    if (show) {
      const p = Math.max(0, Math.min(100, Number(pct || 0)));
      pctEl.textContent = p + '%';
      bar.style.width = p + '%';
    }
  }

  // ----------------------------
  // AI-Chat integration
  // ----------------------------
  function aiChatAvailable() {
    return !!($('ai-chat-fab') && $('aiChatInput') && $('aiChatForm'));
  }

  function buildPrompt(rawText) {
    const lang = getLang();
    const text = (rawText || '').trim();

    if (lang === 'pl') {
      return (
        'Przeanalizuj błąd Enigma2 na podstawie poniższego tekstu (crashlog / traceback / OCR).\n' +
        'Podaj: 1) prawdopodobną przyczynę, 2) konkretne kroki naprawy, 3) komendy weryfikacyjne, 4) co jeszcze wkleić z logów, jeśli brakuje danych.\n\n' +
        '--- TEXT START ---\n' +
        text +
        '\n--- TEXT END ---'
      );
    }

    return (
      'Analyze this Enigma2 error based on the text below (crashlog / traceback / OCR).\n' +
      'Provide: 1) most likely root cause, 2) concrete fix steps, 3) verification commands, 4) what additional log lines are needed if data is missing.\n\n' +
      '--- TEXT START ---\n' +
      text +
      '\n--- TEXT END ---'
    );
  }

  function openAndSendToAIChat(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      setResult('<div style="color:var(--muted)">' + escapeHtml(t('noText')) + '</div>');
      return false;
    }

    if (!aiChatAvailable()) {
      setResult('<div style="color:var(--muted)">' + escapeHtml(t('aiMissing')) + '</div>');
      return false;
    }

    // Open drawer
    try {
      $('ai-chat-fab').click();
    } catch (_) {}

    // Fill & submit
    const prompt = buildPrompt(trimmed);
    setTimeout(function () {
      try {
        const input = $('aiChatInput');
        const form = $('aiChatForm');
        if (!input || !form) return;
        input.value = prompt;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        setResult(
          '<div style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap">' +
            '<div style="font-weight:800">OK</div>' +
            '<div style="color:var(--muted)">' +
            escapeHtml(t('sent')) +
            '</div>' +
          '</div>' +
          '<div style="margin-top:10px; color:var(--muted)">' + escapeHtml(t('hint')) + '</div>'
        );
      } catch (_) {
        setResult('<div style="color:var(--muted)">' + escapeHtml(t('aiMissing')) + '</div>');
      }
    }, 120);

    return true;
  }

  // ----------------------------
  // Image handling + OCR
  // ----------------------------
  function fileToDataURL(file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () {
        resolve(String(r.result || ''));
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function loadPreviewFromFile(file) {
    const previewWrap = $('imagePreview');
    const previewImg = $('previewImg');
    const scanBtn = $('scanBtn');
    const clearBtn = $('clearBtn');

    if (!file || !previewImg) return;

    const url = await fileToDataURL(file);
    previewImg.src = url;
    if (previewWrap) previewWrap.style.display = 'block';
    if (scanBtn) scanBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;

    // enable AI button depending on text
    syncButtons();
  }

  function preprocessToCanvas(img) {
    // Preprocessing for screenshots: scale up + grayscale + contrast + simple threshold
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    // Scale up small images for better OCR
    const scale = w < 900 ? Math.min(2.0, 900 / Math.max(1, w)) : 1.0;
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Compute mean luminance
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
      sum += y;
    }
    const mean = sum / (data.length / 4);

    // Threshold around mean, with a small bias towards darker text
    const thr = Math.max(60, Math.min(200, mean * 0.92));

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Contrast boost (simple)
      y = (y - mean) * 1.35 + mean;

      const v = y < thr ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  async function runOcrFromPreview() {
    const previewImg = $('previewImg');
    const textArea = $('e2Text');
    const scanBtn = $('scanBtn');
    const autoSendAi = $('autoSendAi');

    if (!previewImg || !previewImg.src) return;
    if (!window.Tesseract) {
      setResult('<div style="color:var(--muted)">Tesseract.js is not loaded.</div>');
      return;
    }

    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.textContent = t('ocrWorking');
    }

    setProgress(true, 0);

    try {
      // Ensure image is loaded
      if (!previewImg.complete) {
        await new Promise(function (res) {
          previewImg.onload = res;
          previewImg.onerror = res;
        });
      }

      const canvas = preprocessToCanvas(previewImg);
      const lang = getLang() === 'pl' ? 'pol+eng' : 'eng';

      const out = await window.Tesseract.recognize(canvas, lang, {
        logger: function (m) {
          if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(true, Math.round(m.progress * 100));
          }
        },
      });

      const text = (out && out.data && out.data.text ? out.data.text : '').trim();

      if (!text) {
        setResult('<div style="color:var(--muted)">' + escapeHtml(t('ocrEmpty')) + '</div>');
        if (textArea) textArea.value = '';
      } else {
        if (textArea) textArea.value = text;
        setResult('<div style="color:var(--muted)">' + escapeHtml(t('prepOk')) + '</div>');
        if (autoSendAi && autoSendAi.checked) {
          openAndSendToAIChat(text);
        }
      }

      syncButtons();
    } catch (e) {
      setResult('<div style="color:var(--muted)">' + escapeHtml(t('ocrEmpty')) + '</div>');
    } finally {
      setProgress(false, 0);
      if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.textContent = t('ocrBtn');
      }
    }
  }

  // ----------------------------
  // Text utilities
  // ----------------------------
  function getTextValue() {
    const ta = $('e2Text');
    return (ta && ta.value ? ta.value : '').trim();
  }

  function syncButtons() {
    const txt = getTextValue();
    const sendAiBtn = $('sendAiBtn');
    const sendAiFromTextBtn = $('sendAiFromTextBtn');
    const copyTextBtn = $('copyTextBtn');
    const clearBtn = $('clearBtn');

    const hasText = !!txt;

    if (sendAiBtn) sendAiBtn.disabled = !hasText;
    if (sendAiFromTextBtn) sendAiFromTextBtn.disabled = !hasText;
    if (copyTextBtn) copyTextBtn.disabled = !hasText;

    // Clear button is enabled if either image or text present
    const img = $('previewImg');
    const hasImg = !!(img && img.src);
    if (clearBtn) clearBtn.disabled = !(hasText || hasImg);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      setResult('<div style="color:var(--muted)">' + escapeHtml(t('copyOk')) + '</div>');
    } catch (_) {
      // ignore
    }
  }

  function clearAll() {
    const fileInput = $('e2Image');
    const previewWrap = $('imagePreview');
    const previewImg = $('previewImg');
    const textArea = $('e2Text');
    const scanBtn = $('scanBtn');

    if (fileInput) fileInput.value = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (textArea) textArea.value = '';
    if (scanBtn) scanBtn.disabled = true;

    setResult(
      '<div style="color:var(--muted)">1) Wczytaj obraz lub wklej tekst. 2) Odczytaj OCR (jeśli to obraz). 3) Kliknij „Diagnozuj w AI‑Chat”.</div>'
    );

    syncButtons();
  }

  // ----------------------------
  // Drag&Drop + Paste
  // ----------------------------
  function isImageFile(f) {
    return f && f.type && f.type.startsWith('image/');
  }

  function handleFile(file) {
    if (!isImageFile(file)) return;
    loadPreviewFromFile(file);
  }

  function initDropZone() {
    const dz = $('dropZone');
    const fileInput = $('e2Image');
    if (!dz) return;

    // Click opens file picker
    dz.addEventListener('click', function (ev) {
      // avoid focusing when clicking on input/button inside
      const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'button' || tag === 'label') return;
      fileInput && fileInput.click();
    });

    function prevent(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function (evt) {
      dz.addEventListener(evt, prevent);
    });

    dz.addEventListener('dragenter', function () {
      dz.style.borderColor = 'rgba(255,255,255,.42)';
      dz.style.background = 'rgba(0,0,0,.26)';
    });

    dz.addEventListener('dragleave', function () {
      dz.style.borderColor = 'rgba(255,255,255,.22)';
      dz.style.background = 'rgba(0,0,0,.18)';
    });

    dz.addEventListener('drop', function (e) {
      dz.style.borderColor = 'rgba(255,255,255,.22)';
      dz.style.background = 'rgba(0,0,0,.18)';
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      handleFile(dt.files[0]);
    });

    // Paste image from clipboard
    document.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it && it.kind === 'file') {
          const f = it.getAsFile && it.getAsFile();
          if (isImageFile(f)) {
            handleFile(f);
            return;
          }
        }
      }
    });
  }

  // ----------------------------
  // Boot
  // ----------------------------
  document.addEventListener('DOMContentLoaded', function () {
    // Ensure OCR button has correct label
    const scanBtn = $('scanBtn');
    if (scanBtn) scanBtn.textContent = t('ocrBtn');

    const fileInput = $('e2Image');
    const clearBtn = $('clearBtn');
    const analyzeTextBtn = $('analyzeTextBtn');
    const sendAiBtn = $('sendAiBtn');
    const sendAiFromTextBtn = $('sendAiFromTextBtn');
    const copyTextBtn = $('copyTextBtn');
    const textArea = $('e2Text');

    initDropZone();

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        const f = fileInput.files && fileInput.files[0];
        if (!f) {
          syncButtons();
          return;
        }
        handleFile(f);
      });
    }

    if (scanBtn) {
      scanBtn.addEventListener('click', function () {
        runOcrFromPreview();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', clearAll);
    }

    if (textArea) {
      textArea.addEventListener('input', function () {
        syncButtons();
      });
    }

    if (analyzeTextBtn) {
      analyzeTextBtn.addEventListener('click', function () {
        const txt = getTextValue();
        if (!txt) {
          setResult('<div style="color:var(--muted)">' + escapeHtml(t('noText')) + '</div>');
          syncButtons();
          return;
        }
        setResult('<div style="color:var(--muted)">' + escapeHtml(t('prepOk')) + '</div>');
        syncButtons();
      });
    }

    if (sendAiBtn) {
      sendAiBtn.addEventListener('click', function () {
        openAndSendToAIChat(getTextValue());
      });
    }

    if (sendAiFromTextBtn) {
      sendAiFromTextBtn.addEventListener('click', function () {
        openAndSendToAIChat(getTextValue());
      });
    }

    if (copyTextBtn) {
      copyTextBtn.addEventListener('click', function () {
        const txt = getTextValue();
        if (!txt) return;
        copyToClipboard(txt);
      });
    }

    // Initial state
    syncButtons();
  });
})();
