/* AIO VIP TOPBAR V1 FIX — replaces dynamic daily tip on the homepage. */
(function () {
  'use strict';
  function renderVip() {
    if (!document.body || !document.body.classList.contains('aio-home-v2')) return;
    const row = document.querySelector('.site-header .brand-row');
    const support = row && row.querySelector('.aio-h4-support');
    if (!row || !support || row.querySelector('.aio-h4-vip-banner')) return;
    row.querySelectorAll('.aio-h4-daily-tip').forEach(el => el.remove());

    const banner = document.createElement('a');
    banner.className = 'aio-h4-vip-banner';
    banner.href = 'contact.html';
    banner.setAttribute('aria-label', 'Konto VIP — miesiąc nielimitowanego pobierania. Zapytaj administratora o szczegóły.');
    banner.innerHTML = '' +
      '<span class="aio-h4-vip-badge" aria-hidden="true">VIP</span>' +
      '<span class="aio-h4-vip-copy">' +
        '<span class="aio-h4-vip-kicker">NOWOŚĆ • KONTO VIP</span>' +
        '<strong>Miesiąc nielimitowanego pobierania</strong>' +
        '<small>Zbiory AIO na stronie i po uzgodnieniu także poza nią</small>' +
      '</span>' +
      '<span class="aio-h4-vip-cta"><span class="aio-h4-vip-cta-full">Zapytaj o VIP</span>' +
        '<span class="aio-h4-vip-cta-short">Zapytaj</span> <span aria-hidden="true">↗</span></span>';
    row.insertBefore(banner, support);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderVip, {once: true});
  } else {
    renderVip();
  }
}());
