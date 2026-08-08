document.addEventListener('DOMContentLoaded', () => {
  /*
   * Menu móvel e dropdown desktop compartilhados.
   * O CSS é injetado por último para neutralizar regras antigas das páginas.
   */
  const style = document.createElement('style');
  style.id = 'altitude-dropdown-stability';
  style.textContent = `
    .old-header .navbar li.dropdown {
      position: relative !important;
      padding-bottom: 0 !important;
    }

    .old-header .navbar li.dropdown::after {
      content: "";
      position: absolute;
      top: 100%;
      left: -8px;
      width: calc(100% + 16px);
      height: 10px;
      background: transparent;
      pointer-events: auto;
    }

    .old-header .navbar .dropdown-content {
      display: block !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      position: absolute !important;
      top: calc(100% + 2px) !important;
      left: 50% !important;
      transform: translateX(-50%) translateY(-4px) !important;
      width: max-content !important;
      min-width: 210px !important;
      max-width: 280px !important;
      margin: 0 !important;
      padding: 6px !important;
      background: #fff !important;
      border: 1px solid #52c0d9 !important;
      border-radius: 8px !important;
      box-shadow: 0 12px 28px rgba(10, 61, 98, .18) !important;
      z-index: 5000 !important;
      transition: opacity .16s ease, transform .16s ease, visibility 0s linear .28s !important;
    }

    .old-header .navbar li.dropdown:hover > .dropdown-content,
    .old-header .navbar li.dropdown:focus-within > .dropdown-content,
    .old-header .navbar li.dropdown.dropdown-open > .dropdown-content {
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      transform: translateX(-50%) translateY(0) !important;
      transition-delay: 0s !important;
    }

    .old-header .navbar .dropdown-content a {
      display: block !important;
      width: 100% !important;
      padding: 11px 14px !important;
      white-space: nowrap !important;
      text-align: left !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      border-radius: 6px !important;
    }

    @media (max-width: 900px) {
      .old-header .navbar .dropdown-content {
        display: none !important;
      }

      .new-header .dropdown-menu {
        top: calc(100% + 2px) !important;
        right: 0 !important;
      }
    }
  `;
  document.head.appendChild(style);

  const menuIcon = document.getElementById('menu-icon');
  const dropdownMenu = document.getElementById('dropdown-menu');

  if (menuIcon && dropdownMenu) {
    const setOpen = (open) => {
      dropdownMenu.classList.toggle('active', open);
      menuIcon.setAttribute('aria-expanded', String(open));
    };

    menuIcon.setAttribute('role', 'button');
    menuIcon.setAttribute('tabindex', '0');
    menuIcon.setAttribute('aria-haspopup', 'true');
    menuIcon.setAttribute('aria-expanded', 'false');
    menuIcon.setAttribute('aria-controls', 'dropdown-menu');

    menuIcon.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!dropdownMenu.classList.contains('active'));
    });

    menuIcon.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(!dropdownMenu.classList.contains('active'));
      }
      if (event.key === 'Escape') setOpen(false);
    });

    dropdownMenu.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', () => setOpen(false));
  }

  /*
   * Dropdown desktop: mantém aberto por 450 ms depois que o ponteiro sai.
   * Isso evita que o item desapareça durante o deslocamento até a opção.
   */
  document.querySelectorAll('.old-header .navbar li.dropdown').forEach((item) => {
    const button = item.querySelector('.dropbtn');
    const content = item.querySelector('.dropdown-content');
    if (!button || !content) return;

    let closeTimer = null;
    const open = () => {
      window.clearTimeout(closeTimer);
      item.classList.add('dropdown-open');
      button.setAttribute('aria-expanded', 'true');
    };
    const close = (delay = 450) => {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        item.classList.remove('dropdown-open');
        button.setAttribute('aria-expanded', 'false');
      }, delay);
    };

    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');

    item.addEventListener('mouseenter', open);
    item.addEventListener('mouseleave', () => close());
    content.addEventListener('mouseenter', open);
    content.addEventListener('mouseleave', () => close());
    item.addEventListener('focusin', open);
    item.addEventListener('focusout', (event) => {
      if (!item.contains(event.relatedTarget)) close(120);
    });

    button.addEventListener('click', (event) => {
      const isTouchLike = window.matchMedia('(hover: none)').matches;
      if (!isTouchLike) return;
      if (!item.classList.contains('dropdown-open')) {
        event.preventDefault();
        open();
      }
    });

    item.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        window.clearTimeout(closeTimer);
        item.classList.remove('dropdown-open');
        button.setAttribute('aria-expanded', 'false');
        button.focus();
      }
    });
  });

  /*
   * Acesso móvel: garante que Entrar e Criar conta apareçam em todas as
   * páginas públicas, inclusive em versões antigas que ficaram no cache.
   */
  const mobileList = document.querySelector('.new-header #dropdown-menu ul');
  if (mobileList && !mobileList.querySelector('a[href="/login/"]')) {
    const divider = document.createElement('li');
    divider.className = 'mobile-menu-divider';
    divider.setAttribute('aria-hidden', 'true');
    const loginItem = document.createElement('li');
    loginItem.className = 'mobile-auth-link';
    loginItem.innerHTML = '<a href="/login/">Entrar</a>';
    const registerItem = document.createElement('li');
    registerItem.className = 'mobile-auth-link mobile-auth-primary';
    registerItem.innerHTML = '<a href="/cadastro/">Criar conta</a>';
    mobileList.append(divider, loginItem, registerItem);
  }

  /* Mostrar/ocultar senha: um único botão discreto dentro do campo. */
  document.querySelectorAll('.toggle-pass[data-target]').forEach((button) => {
    if (button.dataset.passwordToggleReady === '1') return;
    const input = document.getElementById(button.dataset.target);
    if (!input) return;
    button.dataset.passwordToggleReady = '1';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      const icon = button.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-eye', !show);
        icon.classList.toggle('fa-eye-slash', show);
      }
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
    });
  });

});
