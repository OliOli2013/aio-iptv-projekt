(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('aio-js');

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('.site-header');

  const setHeaderState = () => {
    if (!header) return;
    header.classList.toggle('aio-header-scrolled', window.scrollY > 24);
  };
  setHeaderState();
  window.addEventListener('scroll', setHeaderState, { passive: true });

  if (!reduced && window.matchMedia('(pointer:fine)').matches) {
    let frame = 0;
    window.addEventListener('pointermove', (event) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--aio-pointer-x', `${event.clientX}px`);
        root.style.setProperty('--aio-pointer-y', `${event.clientY}px`);
        frame = 0;
      });
    }, { passive: true });
  }

  const revealTargets = document.querySelectorAll(
    '.aio-home > section, .module, .hero-compact, .pro-hero, .download-card, .system-card, .choice-card, .community-panel'
  );
  revealTargets.forEach((el) => el.classList.add('aio-reveal'));

  if (reduced || !('IntersectionObserver' in window)) {
    revealTargets.forEach((el) => el.classList.add('aio-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('aio-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -35px 0px' });
    revealTargets.forEach((el) => observer.observe(el));
  }
})();
