/* AIO TunerHub — homepage maintenance support header V1.
 * Navigation only. All donation/7-day/VIP selection stays on support.html.
 * Existing file name retained for backward-compatible script loading.
 */
(function () {
  'use strict';
  function renderMaintenance() {
    if (!document.body || !document.body.classList.contains('aio-home-v2')) return;
    const row = document.querySelector('.site-header .brand-row');
    const support = row && row.querySelector('.aio-h4-support');
    if (!row || row.querySelector('.aio-h4-maintenance-banner')) return;
    row.querySelectorAll('.aio-h4-daily-tip,.aio-h4-vip-banner').forEach(el => el.remove());

    const banner = document.createElement('a');
    banner.className = 'aio-h4-maintenance-banner';
    banner.href = 'support.html#wesprzyj-projekt';
    banner.setAttribute('aria-label', 'Pomóż pokrywać koszty utrzymania AIO TunerHub — zobacz trzy sposoby wsparcia: BuyCoffee, Ko-fi i Revolut.');
    banner.innerHTML = '' +
      '<span class="aio-h4-maintenance-badge" aria-hidden="true">♥</span>' +
      '<span class="aio-h4-maintenance-copy">' +
        '<span class="aio-h4-maintenance-kicker">DOBROWOLNE WSPARCIE SERWISU</span>' +
        '<strong>Pomóż pokrywać koszty utrzymania AIO TunerHub</strong>' +
        '<small>Utrzymanie strony, plików i zaplecza technicznego wiąże się z wydatkami.</small>' +
      '</span>' +
      '<span class="aio-h4-maintenance-cta"><span class="aio-h4-maintenance-cta-full">3 sposoby wsparcia</span>' +
        '<span class="aio-h4-maintenance-cta-short">Wesprzyj</span> <span aria-hidden="true">↗</span></span>';
    row.insertBefore(banner, support || null);
    if (support) support.remove(); // Home: banner replaces the redundant side CTA.
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderMaintenance, {once: true});
  } else {
    renderMaintenance();
  }
}());
