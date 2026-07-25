/* ALTITUDE — acabamento compartilhado sem dependências */
(() => {
  'use strict';
  const upper = (value) => String(value || '').trim().toUpperCase();
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-uppercase], .student-name-cell, #gestorNomeAtual')
      .forEach((element) => { if (element.textContent) element.textContent = upper(element.textContent); });

    document.querySelectorAll('a[href="https://w.app/Altitude"]')
      .forEach((link) => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener');
      });
  });
})();
