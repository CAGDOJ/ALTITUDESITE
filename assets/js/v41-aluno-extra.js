(() => {
  'use strict';

  let studyStartedAt = 0;
  let lastCourseId = null;

  const send = (type, name, meta = {}) => window.altitudeAnalyticsV41?.send?.(type, name, meta);

  function repairEligibleCourses() {
    const list = document.getElementById('listaSolicitacaoCertificados');
    const counter = document.getElementById('contadorSolicitacoesCertificado');
    if (!list || !counter) return;
    const amount = Number((counter.textContent || '').match(/\d+/)?.[0] || 0);
    if (amount > 0 && !list.querySelector('.certificate-card')) {
      try { window.renderSolicitacoesCertificado?.(); } catch (error) { console.warn('V41 cursos aptos:', error); }
    }
  }

  function markBrokenImage(target) {
    const figure = target?.closest?.('.lesson-latex-figure');
    if (!figure) return;
    figure.classList.add('image-error');
    const caption = figure.querySelector('figcaption');
    if (caption && !caption.textContent.trim()) caption.textContent = 'Imagem indisponível';
  }

  function observeStudyModal() {
    const modal = document.getElementById('modalCurso');
    if (!modal) return;
    const update = () => {
      const open = modal.getAttribute('aria-hidden') === 'false';
      const courseId = Number(window.state?.cursoAtual?.id || 0) || null;
      if (open && !studyStartedAt) {
        studyStartedAt = Date.now();
        lastCourseId = courseId;
      } else if (!open && studyStartedAt) {
        const seconds = Math.max(1, Math.round((Date.now() - studyStartedAt) / 1000));
        send('study_session', 'Sala de estudo', { curso_id:lastCourseId, seconds });
        studyStartedAt = 0;
        lastCourseId = null;
      }
    };
    new MutationObserver(update).observe(modal, { attributes:true, attributeFilter:['aria-hidden'] });
    update();
  }

  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.closest('.lesson-latex-figure')) markBrokenImage(event.target);
  }, true);

  document.addEventListener('altitude:aba-aluno', (event) => {
    if (event.detail?.id === 'solicitar-certificado') window.setTimeout(repairEligibleCourses, 30);
    send('student_tab', event.detail?.id || 'aba');
  });

  document.addEventListener('click', (event) => {
    const complete = event.target.closest('#btnConcluirModulo');
    if (complete) send('module_complete_click', document.getElementById('lessonTitle')?.textContent || 'Módulo');
    const exam = event.target.closest('#btnAbrirProva,#btnIrParaProva,[onclick*="abrirProva"]');
    if (exam) send('exam_open', document.getElementById('studyCourseTitle')?.textContent || 'Curso');
    const certificate = event.target.closest('.request-certificate-main-action,[onclick*="solicitarCertificado"]');
    if (certificate) send('certificate_request_click', document.getElementById('studyCourseTitle')?.textContent || 'Curso');
  });

  document.addEventListener('DOMContentLoaded', () => {
    observeStudyModal();
    window.setTimeout(repairEligibleCourses, 500);
  });

  window.addEventListener('beforeunload', () => {
    if (!studyStartedAt) return;
    const seconds = Math.max(1, Math.round((Date.now() - studyStartedAt) / 1000));
    send('study_session', 'Sala de estudo', { curso_id:lastCourseId, seconds });
  });
})();
