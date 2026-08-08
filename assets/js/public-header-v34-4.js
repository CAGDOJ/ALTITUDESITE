(() => {
  'use strict';

  const normalize = (value) => {
    const path = String(value || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    return path.toLowerCase();
  };

  const current = normalize(window.location.pathname);
  const header = document.querySelector('[data-alt-public-header]');
  if (!header) return;

  const matchesCurrentPage = (href) => {
    const target = normalize(new URL(href, window.location.origin).pathname);
    if (target === '/' || target.endsWith('/index.html') || target.endsWith('//')) {
      return current === '/' || current.endsWith('/index.html') || current.endsWith('//');
    }
    return current === target;
  };

  header.querySelectorAll('a[data-nav-link]').forEach((link) => {
    const active = matchesCurrentPage(link.getAttribute('href'));
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const toggle = header.querySelector('[data-public-menu-toggle]');
  const mobile = header.querySelector('[data-public-mobile-menu]');
  if (!toggle || !mobile) return;

  const setOpen = (open) => {
    const next = Boolean(open);
    toggle.setAttribute('aria-expanded', String(next));
    mobile.hidden = !next;
    mobile.classList.toggle('is-open', next);
    header.classList.toggle('menu-open', next);
  };

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  mobile.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!header.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      toggle.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 820) setOpen(false);
  });
})();
