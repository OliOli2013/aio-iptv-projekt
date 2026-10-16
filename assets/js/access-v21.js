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
  /* AIO ACCESS 7D V1 — rolling 168-hour unlock, legacy day kept */
  const SUPPORT_UNLOCK_MS = 7 * 24 * 60 * 60 * 1000;

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

  function accessTrack(eventType){if(!flow)return;let visitorId='';try{visitorId=localStorage.getItem('aio_site_visitor_v1')||'';}catch(error){}try{fetch('/api/access-activity',{method:'POST',credentials:'include',cache:'no-store',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({event:eventType,kind:flow.kind||'download',target:flow.label||safeFileName(flow.href),method:flow.method||'',path:location.pathname,visitorId})}).catch(()=>{});}catch(error){}}

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
    // Bez odliczania. Wysłanie zgłoszenia NIE przyznaje uprawnienia.
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
    if(flow.serverFlowId) fetch('/api/aio-account-access',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({action:'opened',flow_id:flow.serverFlowId})}).catch(()=>{});
    flow.externalOpenedAt = Date.now();
    accessTrack('support_provider_opened');
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
    return !!(flow && flow.serverFlowId && flow.externalOpenedAt && !flow.completed);
  }

  function updateUi() {
    if (!flow) return;
    if (!flow.externalOpenedAt) {
      progressText.textContent = 'Otwórz stronę wsparcia, a po dokonaniu wpłaty wróć i wyślij zgłoszenie do administratora.';
      confirmWrap.hidden = true;
      unlock.disabled = true;
      return;
    }
    progressText.textContent = 'Jeżeli wpłata została wykonana, zaznacz potwierdzenie i wyślij prośbę o weryfikację. Samo zgłoszenie nie odblokowuje plików.';
    confirmWrap.hidden = false;
    unlock.disabled = flow.completed || !confirm.checked;
    unlock.textContent = 'Wyślij zgłoszenie do weryfikacji';
    status.textContent = flow.completed ? 'Zgłoszenie zapisane — oczekuje na administratora.' :
      'Po potwierdzeniu wpłaty przez właściciela otrzymasz 7 dni dostępu przypisane do konta.';
    status.classList.remove('is-error');
  }

  async function finishFlow() {
    if (!eligible() || !confirm.checked) {
      status.textContent = 'Najpierw otwórz stronę wsparcia, a następnie zaznacz zgodę na weryfikację.';
      status.classList.add('is-error');return;
    }
    unlock.disabled = true;
    try {
      // This API MUST return pending_confirmation. Any other response fails closed.
      const r=await fetch('/api/aio-account-access',{
        method:'POST',credentials:'include',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'complete',flow_id:flow.serverFlowId})
      });
      const d=await r.json();
      if(!r.ok || d.ok!==true || d.pending_confirmation!==true || !d.request_id)
        throw new Error(d.error || 'Nie otrzymano potwierdzenia zapisania zgłoszenia do kolejki. Dostęp nie został odblokowany.');
      flow.completed = true;
      flow.completedAt = Date.now();
      saveFlow();
      setStep(3,'done');
      title.textContent='Zgłoszenie oczekuje na weryfikację';
      lead.textContent='Dziękujemy za wsparcie strony i projektów AIO. Administrator sprawdzi wpłatę i podejmie decyzję. Samo wysłanie zgłoszenia nie odblokowuje pobierania.';
      progressText.textContent='Zgłoszenie zapisano. Standardowo staramy się je rozpatrywać w ciągu 1–2 godzin, gdy administrator jest dostępny. Termin jest orientacyjny.';
      confirmWrap.hidden=true;
      status.textContent='Oczekuje na akceptację właściciela. Możesz poprosić o szybszą weryfikację w oknie poniżej.';
      status.classList.remove('is-error');
      unlock.disabled=true;
      unlock.textContent='Oczekuje na akceptację';
      back.href='downloads.html';back.textContent='Wróć do pobierania';
      window.dispatchEvent(new CustomEvent('aio-access-pending-approval',{detail:{id:d.request_id}}));
    }catch(e){
      status.textContent='AIO Access: '+String(e?.message||e);
      status.classList.add('is-error');
      unlock.disabled=false;
    }
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
