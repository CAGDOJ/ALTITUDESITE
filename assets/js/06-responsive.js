(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 1120px)';
  const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

  function updateViewportUnit() {
    document.documentElement.style.setProperty('--app-vh', `${window.innerHeight * 0.01}px`);
  }

  function closeStudentMenu() {
    document.getElementById('portalSidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('show');
  }

  function closeManagerMenu() {
    document.getElementById('gestorSidebar')?.classList.remove('open');
    document.getElementById('gestorSidebarOverlay')?.classList.remove('show');
    document.querySelector('[data-gestor-menu-toggle], #gestorMenuToggle, #btnMenuGestor')?.setAttribute('aria-expanded', 'false');
  }

  function wrapTables() {
    document.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.classList.contains('responsive-table-shell')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'responsive-table-shell';
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', table.getAttribute('aria-label') || 'Tabela com rolagem horizontal');
      wrapper.tabIndex = 0;
      table.parentNode?.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  function updateBodyScrollLock() {
    const sidebarOpen = document.querySelector('.student-sidebar.open, #gestorSidebar.open');
    const modalOpen = document.querySelector('.modal[aria-hidden="false"], .catalog-modal[aria-hidden="false"]');
    document.documentElement.classList.toggle('mobile-overlay-open', Boolean(isMobile() && (sidebarOpen || modalOpen)));
  }

  function observeOverlays() {
    const observer = new MutationObserver(updateBodyScrollLock);
    document.querySelectorAll('.modal, .catalog-modal, .student-sidebar, #gestorSidebar').forEach((node) => {
      observer.observe(node, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    });
    updateBodyScrollLock();
  }

  function wireNavigation() {
    document.querySelectorAll('.student-menu .menu-link, .gestor-nav .nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        if (!isMobile()) return;
        window.setTimeout(() => {
          closeStudentMenu();
          closeManagerMenu();
          updateBodyScrollLock();
        }, 0);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeStudentMenu();
      closeManagerMenu();
      updateBodyScrollLock();
    });
  }

  function handleResize() {
    updateViewportUnit();
    if (!isMobile()) {
      closeStudentMenu();
      closeManagerMenu();
      document.documentElement.classList.remove('mobile-overlay-open');
    } else {
      updateBodyScrollLock();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateViewportUnit();
    wrapTables();
    wireNavigation();
    observeOverlays();
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });
  });
})();
