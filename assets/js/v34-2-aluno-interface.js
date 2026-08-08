(() => {
  'use strict';

  function setupStudyMobileToggle() {
    const body = document.querySelector('#modalCurso .study-body');
    const sidebar = body?.querySelector('.module-sidebar');
    if (!body || !sidebar || document.getElementById('studyModulesToggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'studyModulesToggle';
    button.className = 'study-mobile-toggle';
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span>Módulos do curso</span><b aria-hidden="true">▾</b>';
    body.insertBefore(button, sidebar);
    const setOpen = (open) => {
      body.classList.toggle('modules-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.querySelector('b').textContent = open ? '▴' : '▾';
    };
    button.addEventListener('click', () => setOpen(!body.classList.contains('modules-open')));
    sidebar.addEventListener('click', (event) => {
      if (event.target.closest('button') && matchMedia('(max-width:600px)').matches) setOpen(false);
    });
    window.addEventListener('resize', () => { if (!matchMedia('(max-width:600px)').matches) setOpen(false); });
  }

  function keepQuizFooterVisible() {
    const modal = document.getElementById('modalProva');
    if (!modal) return;
    const observer = new MutationObserver(() => {
      if (modal.getAttribute('aria-hidden') === 'false' && matchMedia('(max-width:600px)').matches) {
        const body = document.getElementById('quizBody');
        if (body) body.scrollTop = 0;
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['aria-hidden'] });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupStudyMobileToggle();
    keepQuizFooterVisible();
  });
})();
