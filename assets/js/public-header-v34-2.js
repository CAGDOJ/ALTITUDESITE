(() => {
  'use strict';

  const normalizePath = (value) => {
    try {
      const url = new URL(value, location.href);
      let path = url.pathname.replace(/\/+$/, '') || '/';
      if (path.endsWith('/index.html')) path = path.slice(0, -10) || '/';
      return path.toLowerCase();
    } catch (_) { return ''; }
  };

  function standardizePublicHeader() {
    const desktop = document.querySelector('body > .old-header');
    const mobile = document.querySelector('body > .new-header');
    if (!desktop || !mobile) return;

    const logoDesktop = desktop.querySelector('.institution-logo img');
    const logoMobile = mobile.querySelector('.logo img');
    [logoDesktop, logoMobile].forEach((img) => {
      if (!img) return;
      img.src = '/assets/img/LOGO.png';
      img.alt = 'Altitude Centro Universitário';
      img.removeAttribute('width');
      img.removeAttribute('height');
    });

    const links = [
      ['/', 'Início'],
      ['/cursos/', 'Cursos'],
      ['/certificados/', 'Certificados'],
      ['/sobrenos/', 'Sobre Nós'],
      ['/ajuda/', 'Ajuda']
    ];

    const desktopList = desktop.querySelector('.navbar ul');
    if (desktopList) desktopList.innerHTML = links.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('');

    const mobileList = mobile.querySelector('.dropdown-menu ul');
    if (mobileList) {
      mobileList.innerHTML = links.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('') +
        '<li class="mobile-menu-divider" aria-hidden="true"></li>' +
        '<li class="mobile-auth-link"><a href="/login/">Entrar</a></li>' +
        '<li class="mobile-auth-link mobile-auth-primary"><a href="/cadastro/">Criar conta</a></li>';
    }

    const buttons = desktop.querySelector('.header-buttons');
    if (buttons) buttons.innerHTML = '<a href="/login/" class="btn-outline">Acessar</a><a href="/cadastro/" class="btn-primary">Cadastrar</a>';

    const current = normalizePath(location.pathname);
    [...desktop.querySelectorAll('.navbar a'), ...mobile.querySelectorAll('.dropdown-menu a')].forEach((anchor) => {
      const active = normalizePath(anchor.href) === current;
      anchor.classList.toggle('active', active);
      if (active) anchor.setAttribute('aria-current', 'page'); else anchor.removeAttribute('aria-current');
    });

    const titleMap = new Map([
      ['/', 'Início - Altitude'],
      ['/', 'Início - Altitude'],
      ['/cursos/', 'Cursos - Altitude'],
      ['/certificados/', 'Certificados - Altitude'],
      ['/sobrenos/', 'Sobre Nós - Altitude'],
      ['/ajuda/', 'Ajuda - Altitude'],
      ['/login/', 'Acessar - Altitude'],
      ['/cadastro/', 'Cadastrar - Altitude']
    ]);
    if (titleMap.has(current)) document.title = titleMap.get(current);
  }

  document.addEventListener('DOMContentLoaded', standardizePublicHeader);
})();
