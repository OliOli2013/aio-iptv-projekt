(function () {
  'use strict';

  const SUPPORT_LINKS = {
    revolut: 'https://revolut.me/pawelz75',
    buycoffee: 'https://buycoffee.to/pawelpawelek/rozwoj-strony-aio-iptv-pl-i-darmowych-projektow-enigma2',
    kofi: 'https://ko-fi.com/pawelpawlek'
  };
  const FLOW_PREFIX = 'aio_access_flow_v21_';
  const DAILY_UNLOCK_KEY = 'aio_download_support_unlock_v1';
  const DAILY_UNLOCK_COOKIE = 'aio_support_unlock_v21';
  const MIN_EXTERNAL_MS = 35 * 1000;

  const $ = id => document.getElementById(id);
  const title = $('accessTitle');
  const lead = $('accessLead');
  const fileBox = $('accessFile');
  const fileName = $('accessFileName');
  const steps = $('accessSteps');
  const provider = $('accessProvider');
  const providerName = $('accessProviderName');
  const openPayment = $('accessOpenPayment');
  const progress = $('accessProgress');
  const progressText = $('accessProgressText');
  const timer = $('accessTimer');
  const progressBar = $('accessProgressBar');
  const confirmWrap = $('accessConfirmWrap');
  const confirm = $('accessConfirm');
  const unlock = $('accessUnlock');
  const back = $('accessBack');
  const status = $('accessStatus');
  $('accessYear').textContent = new Date().getFullYear();

  const params = new URLSearchParams(location.search);
  const token = params.get('flow') || '';
  const methodFromUrl = params.get('method') || '';
  let flow = null;
  let tickHandle = null;
  let paymentWindow = null;

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function methodLabel(method) {
    return ({ revolut: 'Revolut', buycoffee: 'BuyCoffee', kofi: 'Ko-fi' })[method] || 'Nieznana metoda';
  }

  function loadFlow() {
    if (!token) return invalid('Brak aktywnej sesji AIO Access. Otwórz plik z normalnej strony AIO-IPTV.pl.');
    try { flow = JSON.parse(sessionStorage.getItem(FLOW_PREFIX + token) || 'null'); }
    catch (error) { flow = null; }
    if (!flow || flow.token !== token || flow.v !== 21) return invalid('Ta sesja nie istnieje albo została już zakończona. Wróć do wybranego pliku i rozpocznij ponownie.');
    if (Date.now() > Number(flow.expiresAt || 0)) return invalid('Sesja AIO Access wygasła. Ze względów bezpieczeństwa rozpocznij pobieranie jeszcze raz.');
    if (flow.day !== localDateKey()) return invalid('Sesja pochodzi z innego dnia. Rozpocznij pobieranie ponownie.');
    if (!SUPPORT_LINKS[flow.method] || (methodFromUrl && methodFromUrl !== flow.method)) return invalid('Metoda wsparcia w tej sesji jest nieprawidłowa.');
    renderFlow();
  }

  function invalid(message) {
    title.textContent = 'Brak prawidłowej sesji';
    lead.textContent = message;
    status.textContent = 'Bez sesji utworzonej przy konkretnym pobraniu ta strona niczego nie odblokowuje.';
    status.classList.add('is-error');
    back.href = 'downloads.html';
  }

  function renderFlow() {
    title.textContent = flow.kind === 'community' ? 'Dokończ ścieżkę wsparcia i otwórz link' : 'Dokończ ścieżkę wsparcia i pobierz plik';
    lead.textContent = 'Sesja jest przypisana do konkretnego elementu. Otwórz wybraną metodę wsparcia w nowej karcie, dokończ proces, a następnie wróć tutaj.';
    fileBox.hidden = false; fileName.textContent = flow.label || safeFileName(flow.href);
    steps.hidden = false; provider.hidden = false; progress.hidden = false; unlock.hidden = false;
    providerName.textContent = methodLabel(flow.method);
    back.href = flow.returnUrl || 'downloads.html';
    restoreState();
    updateUi();
    tickHandle = window.setInterval(updateUi, 500);
  }

  function restoreState() {
    flow.externalOpenedAt = Number(flow.externalOpenedAt || 0);
    flow.hiddenAfterOpen = Boolean(flow.hiddenAfterOpen);
    flow.returnedAfterOpen = Boolean(flow.returnedAfterOpen);
    flow.completed = Boolean(flow.completed);
  }

  function saveFlow() {
    try { sessionStorage.setItem(FLOW_PREFIX + token, JSON.stringify(flow)); } catch (error) {}
  }

  openPayment?.addEventListener('click', () => {
    if (!flow) return;
    flow.externalOpenedAt = Date.now();
    flow.hiddenAfterOpen = false;
    flow.returnedAfterOpen = false;
    saveFlow();
    setStep(1, 'done'); setStep(2, 'active');
    progressText.textContent = 'Proces wsparcia został rozpoczęty. Dokończ go w nowej karcie i wróć tutaj.';
    const paymentLink = document.createElement('a');
    paymentLink.href = SUPPORT_LINKS[flow.method];
    paymentLink.target = '_blank';
    paymentLink.rel = 'noopener noreferrer';
    paymentLink.style.display = 'none';
    document.body.appendChild(paymentLink);
    paymentLink.click();
    paymentLink.remove();
    status.textContent = 'Metoda wsparcia została otwarta w nowej karcie. Jeśli jej nie widzisz, zezwól przeglądarce na otwieranie nowych kart dla AIO-IPTV.pl.';
    status.classList.remove('is-error');
    updateUi();
  });

  document.addEventListener('visibilitychange', () => {
    if (!flow || !flow.externalOpenedAt) return;
    if (document.hidden) {
      flow.hiddenAfterOpen = true;
      saveFlow();
    } else if (flow.hiddenAfterOpen) {
      flow.returnedAfterOpen = true;
      saveFlow();
      setStep(2, 'done'); setStep(3, 'active');
      updateUi();
    }
  });

  window.addEventListener('focus', () => {
    if (!flow || !flow.externalOpenedAt || !flow.hiddenAfterOpen) return;
    flow.returnedAfterOpen = true;
    saveFlow();
    setStep(2, 'done'); setStep(3, 'active');
    updateUi();
  });

  confirm?.addEventListener('change', updateUi);
  unlock?.addEventListener('click', finishFlow);

  function eligible() {
    if (!flow || !flow.externalOpenedAt || !flow.hiddenAfterOpen || !flow.returnedAfterOpen) return false;
    return Date.now() - flow.externalOpenedAt >= MIN_EXTERNAL_MS;
  }

  function updateUi() {
    if (!flow) return;
    const elapsed = flow.externalOpenedAt ? Math.max(0, Date.now() - flow.externalOpenedAt) : 0;
    const seconds = Math.floor(elapsed / 1000);
    timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
    progressBar.style.width = `${Math.min(100, Math.round(elapsed / MIN_EXTERNAL_MS * 100))}%`;

    if (!flow.externalOpenedAt) {
      progressText.textContent = 'Oczekiwanie na rozpoczęcie procesu wsparcia.';
      confirmWrap.hidden = true; unlock.disabled = true;
      return;
    }
    if (!flow.hiddenAfterOpen) {
      progressText.textContent = 'Otwarta została metoda wsparcia. Przejdź do nowej karty.';
      confirmWrap.hidden = true; unlock.disabled = true;
      return;
    }
    if (!flow.returnedAfterOpen) {
      progressText.textContent = 'Proces trwa poza AIO-IPTV.pl. Wróć po jego zakończeniu.';
      confirmWrap.hidden = true; unlock.disabled = true;
      return;
    }
    const remaining = Math.max(0, Math.ceil((MIN_EXTERNAL_MS - elapsed) / 1000));
    if (remaining > 0) {
      progressText.textContent = `Powrót wykryty. Kontrola ścieżki potrwa jeszcze ${remaining} s.`;
      confirmWrap.hidden = true; unlock.disabled = true;
      return;
    }
    progressText.textContent = 'Pełna ścieżka i powrót zostały wykryte.';
    confirmWrap.hidden = false;
    unlock.disabled = !confirm.checked;
    status.textContent = confirm.checked ? 'Możesz teraz odblokować wybrany element do końca dzisiejszego dnia.' : 'Zaznacz potwierdzenie, aby kontynuować.';
    status.classList.remove('is-error');
  }

  function finishFlow() {
    if (!flow || !eligible() || !confirm.checked) {
      status.textContent = 'Ścieżka nie została jeszcze zakończona.';
      status.classList.add('is-error');
      return;
    }
    const today = localDateKey();
    try { localStorage.setItem(DAILY_UNLOCK_KEY, today); } catch (error) {}
    document.cookie = `${DAILY_UNLOCK_COOKIE}=${encodeURIComponent(today)}; Path=/; Max-Age=${60*60*24*3}; SameSite=Lax`;
    flow.completed = true; flow.completedAt = Date.now(); saveFlow();
    setStep(3, 'done');
    title.textContent = 'Dostęp aktywny';
    lead.textContent = 'AIO Access odblokował kolejne pobrania do końca dzisiejszego dnia w tej przeglądarce.';
    status.textContent = flow.kind === 'community' ? 'Otwieram wybrany link…' : 'Uruchamiam pobieranie…';
    unlock.disabled = true; unlock.textContent = 'Dostęp aktywny ✓';
    openTarget();
    window.setTimeout(() => { try { sessionStorage.removeItem(FLOW_PREFIX + token); } catch (error) {} }, 45000);
  }

  function openTarget() {
    const a = document.createElement('a');
    a.href = flow.href;
    a.dataset.supportBypass = 'true';
    if (flow.download) a.setAttribute('download', flow.download);
    if (flow.kind === 'community') a.target = flow.target || '_blank';
    else if (flow.target) a.target = flow.target;
    if (a.target === '_blank') a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function setStep(number, state) {
    const el = document.querySelector(`[data-step="${number}"]`);
    if (!el) return;
    el.classList.remove('is-active','is-done');
    if (state === 'active') el.classList.add('is-active');
    if (state === 'done') el.classList.add('is-done');
  }

  function safeFileName(href) {
    try { return decodeURIComponent(new URL(href, location.href).pathname.split('/').pop() || 'Wybrany element'); }
    catch (error) { return 'Wybrany element'; }
  }

  loadFlow();
}());
