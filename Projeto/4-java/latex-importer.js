(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const esc = (value = '') => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const TEMPLATE = String.raw`\documentclass{article}

% Dados opcionais do curso. Se estiver importando em um curso já criado,
% marque no portal se deseja atualizar esses dados.
\codigocurso{LGPD-001}
\titulocurso{Introdução à LGPD}
\areacurso{TECNOLOGIA}
\cargahoraria{20}
\nivelcurso{BASICO}
\notaminima{70}
\descricaoCurso{Curso introdutório sobre proteção de dados pessoais.}

\begin{document}

\begin{altitudemodulo}{Introdução à LGPD}{1}
\descricaoModulo{Conceitos iniciais, fundamentos e aplicação da LGPD.}

\begin{conteudo}
\section{O que é a LGPD?}

A Lei Geral de Proteção de Dados estabelece regras para o tratamento de dados pessoais.

\subsection{Princípios essenciais}

\begin{itemize}
  \item finalidade;
  \item necessidade;
  \item transparência;
  \item segurança.
\end{itemize}

Uma representação didática dos pilares de segurança é:
\[
P = C + I + D
\]

onde $C$ representa confidencialidade, $I$ integridade e $D$ disponibilidade.
\end{conteudo}

\begin{altitudequestao}{1}
\enunciado{Qual é o principal objetivo da LGPD?}
\alternativa{A}{Impedir completamente o uso da internet.}
\alternativa{B}{Regular o tratamento de dados pessoais.}
\alternativa{C}{Eliminar bancos de dados.}
\alternativa{D}{Proibir o armazenamento de documentos.}
\alternativa{E}{Substituir todas as normas de segurança.}
\gabarito{B}
\resolucao{A alternativa B está correta porque a LGPD estabelece regras e princípios para o tratamento de dados pessoais.}
\end{altitudequestao}

\end{altitudemodulo}

\end{document}`;

  const state = { parsed: null, busy: false };

  function toast(message, error = false) {
    if (window.AltitudeDialog?.alert) {
      window.AltitudeDialog.alert({
        title: error ? 'Importação LaTeX' : 'Portal Altitude',
        message,
        danger: error,
        confirmText: 'Entendi'
      });
      return;
    }
    window.alert(message);
  }

  function removeComments(source) {
    return String(source || '').replace(/(^|[^\\])%.*$/gm, '$1');
  }

  function skipSpaces(source, index) {
    let i = index;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    return i;
  }

  function readBraced(source, index) {
    const start = skipSpaces(source, index);
    if (source[start] !== '{') return null;
    let depth = 0;
    let escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) return { value: source.slice(start + 1, i), end: i + 1 };
      }
    }
    throw new Error('Há uma chave “{” sem fechamento no LaTeX.');
  }

  function commandValues(source, command, argCount = 1) {
    const values = [];
    const token = `\\${command}`;
    let position = 0;
    while ((position = source.indexOf(token, position)) !== -1) {
      const after = source[position + token.length];
      if (after && /[A-Za-z@]/.test(after)) { position += token.length; continue; }
      let cursor = position + token.length;
      const args = [];
      let valid = true;
      for (let i = 0; i < argCount; i += 1) {
        const arg = readBraced(source, cursor);
        if (!arg) { valid = false; break; }
        args.push(arg.value.trim());
        cursor = arg.end;
      }
      if (valid) values.push({ args, start: position, end: cursor });
      position = Math.max(cursor, position + token.length);
    }
    return values;
  }

  function firstCommand(source, command, fallback = '') {
    return commandValues(source, command, 1)[0]?.args?.[0]?.trim() || fallback;
  }

  function environmentBlocks(source, environment, beginArgs = 0) {
    const blocks = [];
    const beginToken = `\\begin{${environment}}`;
    const endToken = `\\end{${environment}}`;
    let cursor = 0;
    while (true) {
      const start = source.indexOf(beginToken, cursor);
      if (start < 0) break;
      let contentStart = start + beginToken.length;
      const args = [];
      for (let i = 0; i < beginArgs; i += 1) {
        const arg = readBraced(source, contentStart);
        if (!arg) throw new Error(`O ambiente ${environment} precisa de ${beginArgs} argumento(s).`);
        args.push(arg.value.trim());
        contentStart = arg.end;
      }
      const end = source.indexOf(endToken, contentStart);
      if (end < 0) throw new Error(`Falta \\end{${environment}}.`);
      blocks.push({ args, body: source.slice(contentStart, end).trim(), start, end: end + endToken.length });
      cursor = end + endToken.length;
    }
    return blocks;
  }

  function mathHtml(expression, displayMode) {
    const value = String(expression || '').trim();
    if (!value) return '';
    try {
      if (window.katex?.renderToString) {
        return window.katex.renderToString(value, { displayMode, throwOnError: false, strict: 'ignore' });
      }
    } catch (_) {}
    return displayMode
      ? `<div class="latex-equation">${esc(value)}</div>`
      : `<span class="latex-inline-math">${esc(value)}</span>`;
  }

  function replaceSimpleCommand(text, name, tag) {
    const token = `\\${name}`;
    let output = '';
    let cursor = 0;
    while (true) {
      const start = text.indexOf(token, cursor);
      if (start < 0) { output += text.slice(cursor); break; }
      output += text.slice(cursor, start);
      const arg = readBraced(text, start + token.length);
      if (!arg) { output += token; cursor = start + token.length; continue; }
      output += `<${tag}>${arg.value}</${tag}>`;
      cursor = arg.end;
    }
    return output;
  }

  function latexToHtml(raw) {
    let source = removeComments(raw)
      .replace(/\\begin\{document\}|\\end\{document\}/g, '')
      .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/g, '')
      .trim();

    const protectedValues = [];
    const protect = (html) => {
      const token = `@@ALTITUDE_TOKEN_${protectedValues.length}@@`;
      protectedValues.push(html);
      return token;
    };

    source = source
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, value) => protect(mathHtml(value, true)))
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, value) => protect(mathHtml(value, true)))
      .replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, value) => protect(mathHtml(value, true)))
      .replace(/(?<!\\)\$([^$\n]+)\$/g, (_, value) => protect(mathHtml(value, false)));

    source = esc(source);

    // Elementos de texto mais usados no material acadêmico.
    source = source
      .replace(/\\section\*?\{([^{}]*)\}/g, '<h2>$1</h2>')
      .replace(/\\subsection\*?\{([^{}]*)\}/g, '<h3>$1</h3>')
      .replace(/\\subsubsection\*?\{([^{}]*)\}/g, '<h4>$1</h4>')
      .replace(/\\paragraph\{([^{}]*)\}/g, '<h5>$1</h5>')
      .replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>')
      .replace(/\\textit\{([^{}]*)\}/g, '<em>$1</em>')
      .replace(/\\emph\{([^{}]*)\}/g, '<em>$1</em>')
      .replace(/\\underline\{([^{}]*)\}/g, '<u>$1</u>')
      .replace(/\\begin\{itemize\}/g, '<ul>')
      .replace(/\\end\{itemize\}/g, '</ul>')
      .replace(/\\begin\{enumerate\}/g, '<ol>')
      .replace(/\\end\{enumerate\}/g, '</ol>')
      .replace(/\\item\s*/g, '<li>')
      .replace(/\\\\/g, '<br>')
      .replace(/~+/g, ' ')
      .replace(/\\(?:label|ref|cite)\{[^{}]*\}/g, '')
      .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, '')
      .replace(/[{}]/g, '');

    // Fecha itens antes do próximo item/fim da lista.
    source = source
      .replace(/<li>([\s\S]*?)(?=<li>|<\/ul>|<\/ol>)/g, '<li>$1</li>');

    const blocks = source.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
    source = blocks.map((block) => {
      if (/^<(h[2-5]|ul|ol|div|table|blockquote)/.test(block)) return block.replaceAll('\n', ' ');
      return `<p>${block.replaceAll('\n', '<br>')}</p>`;
    }).join('\n');

    protectedValues.forEach((html, index) => {
      source = source.replaceAll(`@@ALTITUDE_TOKEN_${index}@@`, html);
    });
    return source;
  }

  function latexToPlain(raw) {
    const container = document.createElement('div');
    container.innerHTML = latexToHtml(raw);
    return (container.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function parseQuestions(moduleBody) {
    return environmentBlocks(moduleBody, 'altitudequestao', 1).map((block, index) => {
      const alternatives = {};
      commandValues(block.body, 'alternativa', 2).forEach(({ args }) => {
        const letter = String(args[0] || '').trim().toUpperCase();
        if (['A', 'B', 'C', 'D', 'E'].includes(letter)) alternatives[letter] = latexToPlain(args[1]);
      });
      const correct = firstCommand(block.body, 'gabarito').toUpperCase();
      const enunciadoLatex = firstCommand(block.body, 'enunciado');
      const resolutionLatex = firstCommand(block.body, 'resolucao');
      if (!enunciadoLatex) throw new Error(`A questão ${index + 1} não possui \\enunciado{...}.`);
      for (const required of ['A', 'B', 'C', 'D']) {
        if (!alternatives[required]) throw new Error(`A questão ${index + 1} não possui a alternativa ${required}.`);
      }
      if (!['A', 'B', 'C', 'D', 'E'].includes(correct)) {
        throw new Error(`O gabarito da questão ${index + 1} precisa ser A, B, C, D ou E.`);
      }
      if (correct === 'E' && !alternatives.E) throw new Error(`A questão ${index + 1} usa gabarito E, mas não possui alternativa E.`);
      return {
        ordem: Number(block.args[0]) || index + 1,
        enunciado: latexToPlain(enunciadoLatex),
        enunciado_latex: enunciadoLatex,
        a: alternatives.A,
        b: alternatives.B,
        c: alternatives.C,
        d: alternatives.D,
        e: alternatives.E || null,
        correta: correct,
        resolucao: latexToPlain(resolutionLatex) || 'Resolução não cadastrada.'
      };
    });
  }

  function parseLatex(source) {
    const clean = removeComments(source);
    const moduleBlocks = environmentBlocks(clean, 'altitudemodulo', 2);
    if (!moduleBlocks.length) {
      throw new Error('Nenhum módulo encontrado. Use \\begin{altitudemodulo}{Título}{1}.');
    }
    const course = {
      codigo: firstCommand(clean, 'codigocurso'),
      titulo: latexToPlain(firstCommand(clean, 'titulocurso')),
      categoria: latexToPlain(firstCommand(clean, 'areacurso')).toUpperCase(),
      carga_horaria: Number(firstCommand(clean, 'cargahoraria')) || null,
      descricao: latexToPlain(firstCommand(clean, 'descricaoCurso')),
      nivel: firstCommand(clean, 'nivelcurso', 'BASICO').toUpperCase(),
      nota_minima: Number(firstCommand(clean, 'notaminima')) || 70
    };

    const modules = moduleBlocks.map((block, index) => {
      const contentBlock = environmentBlocks(block.body, 'conteudo', 0)[0];
      const latex = contentBlock?.body || '';
      const plain = latexToPlain(latex);
      if (!plain) throw new Error(`O módulo “${block.args[0] || index + 1}” não possui conteúdo.`);
      return {
        titulo: latexToPlain(block.args[0]) || `Módulo ${index + 1}`,
        ordem: Number(block.args[1]) || index + 1,
        descricao: latexToPlain(firstCommand(block.body, 'descricaoModulo')) || plain.slice(0, 220),
        conteudo: plain,
        conteudo_latex: latex,
        conteudo_html: latexToHtml(latex),
        video_url: firstCommand(block.body, 'videoModulo') || null,
        questoes: parseQuestions(block.body)
      };
    }).sort((a, b) => a.ordem - b.ordem);

    const totalQuestions = modules.reduce((sum, module) => sum + module.questoes.length, 0);
    if (!totalQuestions) throw new Error('Nenhuma questão encontrada. Use o ambiente altitudequestao.');
    return { curso: course, modulos: modules, totalQuestions, source: clean };
  }

  function renderPreview(parsed) {
    const box = $('#latexImportPreview');
    if (!box) return;
    const courseTitle = parsed.curso.titulo || $('#modalModulos')?.dataset.courseTitle || 'Curso atual';
    box.innerHTML = `
      <div class="latex-preview-summary">
        <article><span>Curso</span><strong>${esc(courseTitle)}</strong></article>
        <article><span>Módulos</span><strong>${parsed.modulos.length}</strong></article>
        <article><span>Questões</span><strong>${parsed.totalQuestions}</strong></article>
        <article><span>Carga informada</span><strong>${parsed.curso.carga_horaria ? `${parsed.curso.carga_horaria}h` : 'Manter atual'}</strong></article>
      </div>
      <div class="latex-preview-modules">
        ${parsed.modulos.map((module) => `
          <article>
            <div><b>${module.ordem}</b><span><strong>${esc(module.titulo)}</strong><small>${module.questoes.length} questão(ões) · PDF será gerado</small></span></div>
            <p>${esc(module.descricao)}</p>
          </article>`).join('')}
      </div>`;
  }

  async function generatePdf(module, courseTitle) {
    const wrapper = document.createElement('div');
    wrapper.className = 'altitude-latex-pdf';
    wrapper.innerHTML = `
      <header><span>INSTITUTO DE EDUCAÇÃO E TECNOLOGIA ALTITUDE</span><h1>${esc(courseTitle || 'Curso')}</h1><h2>${esc(module.titulo)}</h2></header>
      <main>${module.conteudo_html}</main>
      <footer>Portal Altitude · Material acadêmico</footer>`;
    document.body.appendChild(wrapper);
    try {
      if (window.html2pdf) {
        return await window.html2pdf().set({
          margin: [12, 14, 15, 14],
          filename: `${slug(module.titulo)}.pdf`,
          image: { type: 'jpeg', quality: 0.97 },
          html2canvas: { scale: 1.7, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        }).from(wrapper).outputPdf('blob');
      }

      if (!window.jspdf?.jsPDF) throw new Error('Biblioteca de PDF não carregada.');
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 18;
      const width = 174;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(courseTitle || 'Curso', margin, 20, { maxWidth: width });
      doc.setFontSize(14); doc.text(module.titulo, margin, 31, { maxWidth: width });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      let y = 43;
      const paragraphs = module.conteudo.split(/(?<=[.!?])\s+/);
      for (const paragraph of paragraphs) {
        const lines = doc.splitTextToSize(paragraph, width);
        if (y + lines.length * 5.2 > 280) { doc.addPage(); y = 20; }
        doc.text(lines, margin, y); y += lines.length * 5.2 + 2;
      }
      return doc.output('blob');
    } finally {
      wrapper.remove();
    }
  }

  function slug(value) {
    return String(value || 'modulo').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modulo';
  }

  async function uploadPdf(blob, courseId, module) {
    const path = `${courseId}/latex/${Date.now()}-${module.ordem}-${slug(module.titulo)}.pdf`;
    const { error } = await window.sb.storage.from('materiais_cursos').upload(path, blob, {
      upsert: false,
      contentType: 'application/pdf',
      cacheControl: '3600'
    });
    if (error) throw error;
    return window.sb.storage.from('materiais_cursos').getPublicUrl(path).data.publicUrl;
  }

  async function importCourse() {
    if (state.busy) return;
    const modalCourse = $('#modalModulos');
    const courseId = Number(modalCourse?.dataset.courseId || 0);
    if (!courseId) return toast('Abra primeiro o curso em “Montar curso”.', true);
    const source = $('#latexImportSource')?.value || '';
    let parsed;
    try {
      parsed = parseLatex(source);
      state.parsed = parsed;
      renderPreview(parsed);
    } catch (error) {
      return toast(error.message, true);
    }

    const replace = Boolean($('#latexReplaceExisting')?.checked);
    if (replace) {
      const confirmed = window.AltitudeDialog?.confirm
        ? await window.AltitudeDialog.confirm({
            title: 'Substituir a estrutura atual?',
            message: 'Os módulos, materiais e provas já cadastrados neste curso serão removidos e substituídos pelo conteúdo do LaTeX.',
            confirmText: 'Substituir e importar',
            danger: true
          })
        : window.confirm('Substituir módulos, materiais e provas atuais?');
      if (!confirmed) return;
    }

    state.busy = true;
    const button = $('#latexImportConfirm');
    const progress = $('#latexImportProgress');
    button.disabled = true;
    try {
      const courseTitle = parsed.curso.titulo || modalCourse.dataset.courseTitle || 'Curso Altitude';
      for (let i = 0; i < parsed.modulos.length; i += 1) {
        const module = parsed.modulos[i];
        progress.textContent = `Gerando e enviando PDF ${i + 1} de ${parsed.modulos.length}: ${module.titulo}`;
        const blob = await generatePdf(module, courseTitle);
        module.pdf_url = await uploadPdf(blob, courseId, module);
      }

      progress.textContent = 'Gravando módulos, prova, alternativas, gabarito e resoluções...';
      const payload = {
        curso: parsed.curso,
        modulos: parsed.modulos.map(({ conteudo_html, ...module }) => module)
      };
      const { data, error } = await window.sb.rpc('gestor_importar_curso_latex', {
        p_curso_id: courseId,
        p_payload: payload,
        p_substituir: replace,
        p_publicar_modulos: Boolean($('#latexPublishModules')?.checked),
        p_atualizar_curso: Boolean($('#latexUpdateCourse')?.checked)
      });
      if (error) throw error;

      progress.textContent = '';
      closeModal();
      await window.carregarModulosCursoAtual?.();
      await window.carregarCursosCompleto?.();
      toast(`Importação concluída: ${Number(data?.modulos_importados || parsed.modulos.length)} módulo(s) e ${Number(data?.questoes_importadas || parsed.totalQuestions)} questão(ões).`);
    } catch (error) {
      console.error('Importação LaTeX:', error);
      progress.textContent = '';
      toast(`Não foi possível importar: ${error.message}`, true);
    } finally {
      state.busy = false;
      button.disabled = false;
    }
  }

  function validateSource() {
    try {
      state.parsed = parseLatex($('#latexImportSource')?.value || '');
      renderPreview(state.parsed);
      $('#latexImportConfirm').disabled = false;
    } catch (error) {
      state.parsed = null;
      $('#latexImportConfirm').disabled = true;
      $('#latexImportPreview').innerHTML = `<div class="latex-import-error"><strong>O arquivo ainda não pode ser importado.</strong><span>${esc(error.message)}</span></div>`;
    }
  }

  function openModal() {
    const courseId = Number($('#modalModulos')?.dataset.courseId || 0);
    if (!courseId) return toast('Abra um curso em “Montar curso” antes de importar.', true);
    $('#modalImportarLatex')?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    validateSource();
  }

  function closeModal() {
    $('#modalImportarLatex')?.setAttribute('aria-hidden', 'true');
    if ($('#modalModulos')?.getAttribute('aria-hidden') === 'true') document.body.style.overflow = '';
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-curso-altitude.tex';
    link.click();
    URL.revokeObjectURL(url);
  }

  function injectUi() {
    const header = $('.course-builder-header');
    if (header && !$('#btnImportarLatex')) {
      const actions = document.createElement('div');
      actions.className = 'builder-header-actions';
      actions.innerHTML = '<button type="button" id="btnImportarLatex" class="latex-import-open">Importar LaTeX</button>';
      const close = $('#fecharModulos', header);
      header.insertBefore(actions, close);
    }

    if (!$('#modalImportarLatex')) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'modalImportarLatex';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `
        <div class="modal__sheet latex-import-modal" role="dialog" aria-modal="true" aria-labelledby="latexImportTitle">
          <header class="latex-import-head">
            <div><span>IMPORTAÇÃO ACADÊMICA</span><h3 id="latexImportTitle">Transformar LaTeX em curso</h3><p>Cole um arquivo no padrão Altitude. O portal gera os PDFs, módulos, prova, alternativas, gabarito e resoluções.</p></div>
            <button type="button" id="latexImportClose" class="builder-close" aria-label="Fechar">×</button>
          </header>
          <div class="latex-import-body">
            <section class="latex-import-editor">
              <div class="latex-import-toolbar">
                <label class="latex-file-button">Abrir arquivo .tex<input id="latexImportFile" type="file" accept=".tex,text/x-tex,text/plain"></label>
                <button type="button" id="latexDownloadTemplate" class="builder-secondary-button">Baixar modelo .tex</button>
                <button type="button" id="latexValidate" class="builder-secondary-button">Validar</button>
              </div>
              <textarea id="latexImportSource" spellcheck="false" aria-label="Código LaTeX"></textarea>
              <div class="latex-import-options">
                <label><input id="latexReplaceExisting" type="checkbox" checked> Substituir módulos e provas existentes</label>
                <label><input id="latexPublishModules" type="checkbox"> Liberar os módulos após importar</label>
                <label><input id="latexUpdateCourse" type="checkbox" checked> Atualizar título, área e carga pelos comandos do LaTeX</label>
              </div>
            </section>
            <aside class="latex-import-preview"><h4>Pré-visualização</h4><div id="latexImportPreview"></div></aside>
          </div>
          <footer class="latex-import-footer">
            <span id="latexImportProgress" aria-live="polite"></span>
            <div><button type="button" id="latexImportCancel" class="builder-secondary-button">Cancelar</button><button type="button" id="latexImportConfirm" class="builder-main-button">Gerar PDFs e importar</button></div>
          </footer>
        </div>`;
      document.body.appendChild(modal);
      $('#latexImportSource').value = TEMPLATE;
    }

    $('#btnImportarLatex')?.addEventListener('click', openModal);
    $('#latexImportClose')?.addEventListener('click', closeModal);
    $('#latexImportCancel')?.addEventListener('click', closeModal);
    $('#latexValidate')?.addEventListener('click', validateSource);
    $('#latexDownloadTemplate')?.addEventListener('click', downloadTemplate);
    $('#latexImportConfirm')?.addEventListener('click', importCourse);
    $('#latexImportFile')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      $('#latexImportSource').value = await file.text();
      validateSource();
    });
    $('#modalImportarLatex')?.addEventListener('click', (event) => {
      if (event.target.id === 'modalImportarLatex') closeModal();
    });
  }

  window.AltitudeLatexImporter = Object.freeze({ parse: parseLatex, latexToHtml, template: TEMPLATE });

  document.addEventListener('DOMContentLoaded', async () => {
    try { await window.GESTOR_AUTH_READY; } catch (_) {}
    injectUi();
  });
})();
