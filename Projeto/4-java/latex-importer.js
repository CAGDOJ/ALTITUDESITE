(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const state = { parsedContent: null, parsedProof: null, previewUrl: null, busy: false };
  const esc = (value = '') => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const slug = (value) => String(value || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arquivo';

  const CONTENT_TEMPLATE = String.raw`\documentclass[12pt,a4paper]{article}

% DADOS DO CURSO
\titulocurso{Auxiliar Administrativo}
\areacurso{Área Administrativa}
\cargahoraria{20}
\nivelcurso{BASICO}
\notaminima{70}
\descricaoCurso{Formação introdutória para atuação em rotinas administrativas.}

\begin{document}

\begin{altitudemodulo}{Fundamentos e Rotinas Administrativas}{1}
\horasModulo{10}
\descricaoModulo{Conceitos básicos, organização, documentos e rotinas do setor administrativo.}
\videoModulo{https://www.youtube.com/}

\begin{conteudo}
\section{Apresentação}
O auxiliar administrativo presta apoio às atividades internas de uma organização.

\section{Fundamentos da Administração}
Administração é o processo de organizar recursos, pessoas, informações e atividades para alcançar objetivos.

\subsection{Funções básicas}
\begin{itemize}
  \item \textbf{Planejar}: definir objetivos;
  \item \textbf{Organizar}: distribuir tarefas e informações;
  \item \textbf{Controlar}: acompanhar os resultados.
\end{itemize}
\end{conteudo}
\end{altitudemodulo}

\begin{altitudemodulo}{Atendimento, Comunicação e Informática}{2}
\horasModulo{10}
\descricaoModulo{Atendimento profissional, comunicação, informática e ética no trabalho.}

\begin{conteudo}
\section{Atendimento Profissional}
Atender bem significa acolher a pessoa com respeito, compreender sua necessidade e encaminhar corretamente sua demanda.

\section{Informática Aplicada}
O profissional utiliza editor de texto, planilhas, e-mail e sistemas de cadastro.

\section{Ética Profissional}
Agir com ética envolve honestidade, responsabilidade, respeito e sigilo.
\end{conteudo}
\end{altitudemodulo}

\end{document}`;

  const PROOF_TEMPLATE = String.raw`\documentclass{article}
\begin{document}

% A prova fica separada do conteúdo. O número abaixo corresponde à ordem do módulo.
\begin{altitudeprova}{1}

\begin{altitudequestao}{1}
\enunciado{Qual ação corresponde à função administrativa de planejar?}
\alternativa{A}{Definir previamente objetivos e ações.}
\alternativa{B}{Excluir todos os documentos.}
\alternativa{C}{Ignorar os prazos.}
\alternativa{D}{Evitar o atendimento ao público.}
\alternativa{E}{Substituir todos os procedimentos.}
\gabarito{A}
\resolucao{Planejar significa definir objetivos e organizar previamente as ações necessárias.}
\end{altitudequestao}

\begin{altitudequestao}{2}
\enunciado{Qual característica é adequada ao auxiliar administrativo?}
\alternativa{A}{Desorganização.}
\alternativa{B}{Falta de responsabilidade.}
\alternativa{C}{Atenção aos detalhes.}
\alternativa{D}{Divulgação de informações sigilosas.}
\alternativa{E}{Descumprimento de prazos.}
\gabarito{C}
\resolucao{A atenção aos detalhes reduz erros e melhora a qualidade das rotinas administrativas.}
\end{altitudequestao}

\end{altitudeprova}

\begin{altitudeprova}{2}
\begin{altitudequestao}{3}
\enunciado{Qual ferramenta é comum no setor administrativo?}
\alternativa{A}{Editor de texto.}
\alternativa{B}{Somente jogos eletrônicos.}
\alternativa{C}{Apenas redes sociais.}
\alternativa{D}{Nenhum recurso digital.}
\alternativa{E}{Somente equipamentos industriais.}
\gabarito{A}
\resolucao{Editores de texto, planilhas, e-mail e sistemas de cadastro fazem parte das rotinas administrativas.}
\end{altitudequestao}
\end{altitudeprova}

\end{document}`;

  function notify(message, error = false) {
    if (window.AltitudeDialog?.alert) {
      window.AltitudeDialog.alert({
        title: error ? 'Verifique o curso' : 'Portal Altitude',
        message,
        danger: error,
        confirmText: 'Entendi'
      });
    } else window.alert(message);
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
      let depth = 1;
      let searchAt = contentStart;
      let end = -1;
      while (depth > 0) {
        const nextBegin = source.indexOf(beginToken, searchAt);
        const nextEnd = source.indexOf(endToken, searchAt);
        if (nextEnd < 0) throw new Error(`Falta \\end{${environment}}.`);
        if (nextBegin >= 0 && nextBegin < nextEnd) {
          depth += 1;
          searchAt = nextBegin + beginToken.length;
        } else {
          depth -= 1;
          if (depth === 0) end = nextEnd;
          searchAt = nextEnd + endToken.length;
        }
      }
      blocks.push({ args, body: source.slice(contentStart, end).trim(), start, end: end + endToken.length });
      cursor = end + endToken.length;
    }
    return blocks;
  }

  function mathHtml(expression, displayMode) {
    const value = String(expression || '').trim();
    if (!value) return '';
    try {
      if (window.katex?.renderToString) return window.katex.renderToString(value, { displayMode, throwOnError: false, strict: 'ignore' });
    } catch (_) {}
    return displayMode ? `<div class="latex-equation">${esc(value)}</div>` : `<span class="latex-inline-math">${esc(value)}</span>`;
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
    source = esc(source)
      .replace(/\\section\*?\{([^{}]*)\}/g, '<h2>$1</h2>')
      .replace(/\\subsection\*?\{([^{}]*)\}/g, '<h3>$1</h3>')
      .replace(/\\subsubsection\*?\{([^{}]*)\}/g, '<h4>$1</h4>')
      .replace(/\\paragraph\{([^{}]*)\}/g, '<h4>$1</h4>')
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
    source = source.replace(/<li>([\s\S]*?)(?=<li>|<\/ul>|<\/ol>)/g, '<li>$1</li>');
    source = source.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean).map((block) => {
      if (/^<(h[2-5]|ul|ol|div|table|blockquote)/.test(block)) return block.replaceAll('\n', ' ');
      return `<p>${block.replaceAll('\n', '<br>')}</p>`;
    }).join('\n');
    protectedValues.forEach((html, index) => { source = source.replaceAll(`@@ALTITUDE_TOKEN_${index}@@`, html); });
    return source;
  }

  function latexToPlain(raw) {
    const node = document.createElement('div');
    node.innerHTML = latexToHtml(raw);
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function standardMetadata(source, label) {
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const table = new RegExp(`${escaped}\\s*:\\s*&\\s*([^\\\\\\n]+)\\s*\\\\\\\\`, 'i').exec(source)?.[1];
    return table ? latexToPlain(table) : '';
  }

  function standardCourseTitle(source) {
    return standardMetadata(source, 'Curso')
      || latexToPlain(/\\LARGE\\bfseries\s+Curso\s+de\s+([^}\n\\]+)/i.exec(source)?.[1] || '')
      || latexToPlain(/\\fancyhead\[R\]\{[^}]*Curso\s+de\s+([^}]+)\}/i.exec(source)?.[1] || '')
      || $('#modalModulos')?.dataset.courseTitle
      || 'Curso Altitude';
  }

  function uniqueStandardTitles(values) {
    const seen = new Set();
    return values.map((value) => latexToPlain(value)).filter((value) => {
      const key = value.toLocaleLowerCase('pt-BR');
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function groupModuleTitle(names, index) {
    const clean = uniqueStandardTitles(names);
    const useful = clean.filter((name) => !/(^apresenta|^objetiv|^síntese|^conclus)/i.test(name));
    const list = useful.length ? useful : clean;
    if (!list.length) return `Módulo ${index + 1}`;
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} e ${list[1]}`;
    return `${list[0]}, ${list[1]} e ${list[list.length - 1]}`;
  }

  function parseStandardContent(clean) {
    const documentMatch = /\\begin\{document\}([\s\S]*?)\\end\{document\}/i.exec(clean);
    const body = documentMatch?.[1] || clean;
    const sectionRegex = /\\section\*?\{([^{}]+)\}/g;
    const sections = [];
    let match;
    while ((match = sectionRegex.exec(body))) sections.push({ title: match[1], index: match.index });
    if (!sections.length) throw new Error('Nenhuma seção foi encontrada no material. Use \\section{Título} ou o modelo Altitude.');

    const currentHours = Math.max(0, Math.min(200, Number($('#modalModulos')?.dataset.courseHours || 0)));
    const commandHours = Math.max(0, Math.min(200, Number(firstCommand(clean, 'cargahoraria')) || 0));
    const totalHours = commandHours || currentHours;
    const targetCount = sections.length < 2
      ? 1
      : totalHours > 0
        ? Math.min(sections.length, totalHours >= 40 ? 3 : 2)
        : (sections.length >= 9 ? 3 : 2);
    const firstSection = sections[0].index;
    const usefulBody = body.slice(firstSection);
    const adjusted = sections.map((section) => ({ ...section, index: section.index - firstSection }));
    const modules = [];
    let remainingHours = totalHours;

    for (let group = 0; group < targetCount; group += 1) {
      const startSection = Math.floor((group * adjusted.length) / targetCount);
      const endSection = Math.floor(((group + 1) * adjusted.length) / targetCount);
      const start = adjusted[startSection].index;
      const end = endSection < adjusted.length ? adjusted[endSection].index : usefulBody.length;
      const latex = usefulBody.slice(start, end).trim();
      const names = adjusted.slice(startSection, endSection).map((item) => item.title);
      const groupsLeft = targetCount - group;
      const hours = totalHours > 0 ? (groupsLeft === 1 ? remainingHours : Math.floor(remainingHours / groupsLeft)) : 0;
      remainingHours -= hours;
      const plain = latexToPlain(latex);
      modules.push({
        titulo: groupModuleTitle(names, group),
        ordem: group + 1,
        carga_horaria: hours,
        descricao: plain.slice(0, 220),
        conteudo: plain,
        conteudo_latex: latex,
        conteudo_html: latexToHtml(latex),
        video_url: null,
        questoes: []
      });
    }

    const courseTitle = firstCommand(clean, 'titulocurso')
      ? latexToPlain(firstCommand(clean, 'titulocurso'))
      : standardCourseTitle(clean);
    const category = latexToPlain(firstCommand(clean, 'areacurso'))
      || standardMetadata(clean, 'Área de formação')
      || $('#modalModulos')?.dataset.courseCategory
      || 'FORMAÇÃO PROFISSIONAL';
    const description = latexToPlain(firstCommand(clean, 'descricaoCurso'))
      || $('#modalModulos')?.dataset.courseDescription
      || modules[0]?.descricao
      || '';
    return {
      curso: {
        codigo: firstCommand(clean, 'codigocurso'),
        titulo: courseTitle,
        categoria: String(category).toUpperCase(),
        carga_horaria: totalHours || null,
        descricao: description,
        nivel: firstCommand(clean, 'nivelcurso', 'BASICO').toUpperCase(),
        nota_minima: Math.min(100, Math.max(0, Number(firstCommand(clean, 'notaminima')) || 70))
      },
      modulos: modules,
      source: clean
    };
  }

  function parseContent(source) {
    const clean = removeComments(source);
    const blocks = environmentBlocks(clean, 'altitudemodulo', 2);
    if (!blocks.length) return parseStandardContent(clean);
    const course = {
      codigo: firstCommand(clean, 'codigocurso'),
      titulo: latexToPlain(firstCommand(clean, 'titulocurso')),
      categoria: latexToPlain(firstCommand(clean, 'areacurso')).toUpperCase(),
      carga_horaria: Math.min(200, Math.max(0, Number(firstCommand(clean, 'cargahoraria')) || Number($('#modalModulos')?.dataset.courseHours || 0))) || null,
      descricao: latexToPlain(firstCommand(clean, 'descricaoCurso')),
      nivel: firstCommand(clean, 'nivelcurso', 'BASICO').toUpperCase(),
      nota_minima: Math.min(100, Math.max(0, Number(firstCommand(clean, 'notaminima')) || 70))
    };
    let modules = blocks.map((block, index) => {
      const content = environmentBlocks(block.body, 'conteudo', 0)[0]?.body || '';
      const plain = latexToPlain(content);
      if (!plain) throw new Error(`O módulo “${block.args[0] || index + 1}” não possui conteúdo no ambiente conteudo.`);
      return {
        titulo: latexToPlain(block.args[0]) || `Módulo ${index + 1}`,
        ordem: Number(block.args[1]) || index + 1,
        carga_horaria: Math.max(0, Number(firstCommand(block.body, 'horasModulo')) || 0),
        descricao: latexToPlain(firstCommand(block.body, 'descricaoModulo')) || plain.slice(0, 220),
        conteudo: plain,
        conteudo_latex: content,
        conteudo_html: latexToHtml(content),
        video_url: firstCommand(block.body, 'videoModulo') || null,
        questoes: []
      };
    }).sort((a, b) => a.ordem - b.ordem);

    const total = Number(course.carga_horaria || 0);
    const explicit = modules.reduce((sum, module) => sum + Number(module.carga_horaria || 0), 0);
    const missing = modules.filter((module) => !Number(module.carga_horaria)).length;
    if (total > 0 && missing) {
      let remaining = Math.max(0, total - explicit);
      modules = modules.map((module, index) => {
        if (module.carga_horaria) return module;
        const missingAfter = modules.slice(index + 1).filter((item) => !Number(item.carga_horaria)).length;
        const hours = missingAfter ? Math.floor(remaining / (missingAfter + 1)) : remaining;
        remaining -= hours;
        return { ...module, carga_horaria: hours };
      });
    }
    return { curso: course, modulos: modules, source: clean };
  }

  function parseQuestionBlocks(source) {
    return environmentBlocks(source, 'altitudequestao', 1).map((block, index) => {
      const alternatives = {};
      commandValues(block.body, 'alternativa', 2).forEach(({ args }) => {
        const letter = String(args[0] || '').trim().toUpperCase();
        if (['A', 'B', 'C', 'D', 'E'].includes(letter)) alternatives[letter] = latexToPlain(args[1]);
      });
      const correct = firstCommand(block.body, 'gabarito').toUpperCase();
      const statementLatex = firstCommand(block.body, 'enunciado');
      const resolutionLatex = firstCommand(block.body, 'resolucao');
      if (!statementLatex) throw new Error(`A questão ${index + 1} não possui \\enunciado{...}.`);
      ['A', 'B', 'C', 'D'].forEach((letter) => {
        if (!alternatives[letter]) throw new Error(`A questão ${index + 1} não possui a alternativa ${letter}.`);
      });
      if (!['A', 'B', 'C', 'D', 'E'].includes(correct)) throw new Error(`O gabarito da questão ${index + 1} precisa ser A, B, C, D ou E.`);
      if (correct === 'E' && !alternatives.E) throw new Error(`A questão ${index + 1} usa gabarito E, mas não possui alternativa E.`);
      return {
        ordem: Number(block.args[0]) || index + 1,
        enunciado: latexToPlain(statementLatex),
        enunciado_latex: statementLatex,
        a: alternatives.A, b: alternatives.B, c: alternatives.C, d: alternatives.D, e: alternatives.E || null,
        correta: correct,
        resolucao: latexToPlain(resolutionLatex) || 'Resolução não cadastrada.'
      };
    });
  }

  function parseProof(source) {
    const clean = removeComments(source);
    let groups = environmentBlocks(clean, 'altitudeprova', 1).map((block) => ({
      modulo_ref: String(block.args[0] || '1').trim(),
      questoes: parseQuestionBlocks(block.body)
    }));
    if (!groups.length) {
      groups = environmentBlocks(clean, 'altitudemodulo', 2).map((block) => ({
        modulo_ref: String(block.args[1] || block.args[0] || '1').trim(),
        questoes: parseQuestionBlocks(block.body)
      }));
    }
    if (!groups.length) {
      const questions = parseQuestionBlocks(clean);
      if (questions.length) groups = [{ modulo_ref: '1', questoes: questions }];
    }
    const totalQuestions = groups.reduce((sum, group) => sum + group.questoes.length, 0);
    if (!totalQuestions) throw new Error('Nenhuma questão encontrada. Use altitudeprova e altitudequestao.');
    return { grupos: groups, totalQuestions, source: clean };
  }

  function mergeCourse(content, proof) {
    const modules = content.modulos.map((module) => ({ ...module, questoes: [] }));
    proof.grupos.forEach((group) => {
      const numeric = Number(group.modulo_ref);
      const target = modules.find((module) => Number(module.ordem) === numeric)
        || modules.find((module) => module.titulo.toLocaleLowerCase('pt-BR') === String(group.modulo_ref).toLocaleLowerCase('pt-BR'))
        || modules[0];
      target.questoes.push(...group.questoes);
    });
    return { curso: content.curso, modulos: modules, totalQuestions: proof.totalQuestions };
  }

  function renderSummary(content, proof = state.parsedProof) {
    const box = $('#latexPreviewSummary');
    if (!box || !content) return;
    const title = content.curso.titulo || $('#modalModulos')?.dataset.courseTitle || 'Curso atual';
    const hours = content.modulos.reduce((sum, item) => sum + Number(item.carga_horaria || 0), 0) || content.curso.carga_horaria || 0;
    box.innerHTML = `
      <article><span>Curso</span><strong>${esc(title)}</strong></article>
      <article><span>Módulos</span><strong>${content.modulos.length}</strong></article>
      <article><span>Questões</span><strong>${proof?.totalQuestions || 0}</strong></article>
      <article><span>Carga</span><strong>${hours || '—'}h</strong></article>`;
  }

  function buildMaterialNode(content) {
    const courseTitle = content.curso.titulo || $('#modalModulos')?.dataset.courseTitle || 'Curso Altitude';
    const area = content.curso.categoria || 'Formação Profissional';
    const hours = content.modulos.reduce((sum, item) => sum + Number(item.carga_horaria || 0), 0) || content.curso.carga_horaria || 0;
    const node = document.createElement('article');
    node.className = 'altitude-material-pdf';
    node.innerHTML = `
      <div class="pdf-running-head"><span>Instituição Altitude</span><span>${esc(courseTitle)}</span></div>
      <section class="pdf-cover">
        <img src="../3-img/LOGO.png" alt="Instituição Altitude">
        <div class="institution">Instituição Altitude</div>
        <div class="material">Material de Estudo</div>
        <h1>Curso de ${esc(courseTitle)}</h1>
      </section>
      <section class="pdf-info-box">
        <b>Curso:</b><span>${esc(courseTitle)}</span>
        <b>Área de formação:</b><span>${esc(area)}</span>
        <b>Modalidade:</b><span>EAD / Semipresencial</span>
        <b>Carga horária:</b><span>${hours} horas</span>
        <b>Finalidade do material:</b><span>Apoiar o estudo teórico do aluno e servir de base para avaliação de aprendizagem ao final do curso.</span>
      </section>
      ${content.modulos.map((module, index) => `
        <section class="pdf-module ${index === 0 ? 'first' : ''}">
          <div class="pdf-running-head"><span>Instituição Altitude</span><span>${esc(courseTitle)}</span></div>
          <h2>${index + 1}. ${esc(module.titulo)}</h2>
          <div class="pdf-info-box"><b>Carga do módulo:</b><span>${Number(module.carga_horaria || 0)} horas</span><b>Descrição:</b><span>${esc(module.descricao || '')}</span></div>
          ${module.conteudo_html}
          <div class="pdf-footer">Instituição Altitude | Material de Estudo | ${esc(courseTitle)}</div>
        </section>`).join('')}
      <div class="pdf-orientation"><strong>Orientação ao aluno:</strong> recomenda-se a leitura integral deste material antes da avaliação.</div>`;
    document.body.appendChild(node);
    return node;
  }

  function pdfTextBlocks(raw) {
    let source = removeComments(raw || '')
      .replace(/\\begin\{document\}|\\end\{document\}/g, '')
      .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/g, '')
      .replace(/\\section\*?\{([^{}]*)\}/g, '\n@@H2@@$1\n')
      .replace(/\\subsection\*?\{([^{}]*)\}/g, '\n@@H3@@$1\n')
      .replace(/\\subsubsection\*?\{([^{}]*)\}/g, '\n@@H4@@$1\n')
      .replace(/\\paragraph\{([^{}]*)\}/g, '\n@@H4@@$1\n')
      .replace(/\\item\s*/g, '\n@@LI@@')
      .replace(/\\begin\{(?:itemize|enumerate)\}|\\end\{(?:itemize|enumerate)\}/g, '\n')
      .replace(/\\\[([\s\S]*?)\\\]/g, '\n@@EQ@@$1\n')
      .replace(/\$\$([\s\S]*?)\$\$/g, '\n@@EQ@@$1\n')
      .replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, '\n@@EQ@@$1\n')
      .replace(/\\textbf\{([^{}]*)\}/g, '$1')
      .replace(/\\(?:textit|emph|underline)\{([^{}]*)\}/g, '$1')
      .replace(/\\(?:label|ref|cite)\{[^{}]*\}/g, '')
      .replace(/\\\\/g, '\n')
      .replace(/~/g, ' ')
      .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, '')
      .replace(/[{}]/g, '')
      .replace(/\r/g, '');

    return source.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
      if (line.startsWith('@@H2@@')) return { type: 'h2', text: line.slice(6).trim() };
      if (line.startsWith('@@H3@@')) return { type: 'h3', text: line.slice(6).trim() };
      if (line.startsWith('@@H4@@')) return { type: 'h4', text: line.slice(6).trim() };
      if (line.startsWith('@@LI@@')) return { type: 'li', text: line.slice(6).trim() };
      if (line.startsWith('@@EQ@@')) return { type: 'eq', text: line.slice(6).trim() };
      return { type: 'p', text: line.replace(/\s+/g, ' ').trim() };
    });
  }

  function jsPdfConstructor() {
    return window.jspdf?.jsPDF || window.jsPDF || null;
  }

  async function pdfBlobFromContent(content) {
    const JsPDF = jsPdfConstructor();
    if (!JsPDF) throw new Error('O gerador de PDF ainda não terminou de carregar. Aguarde alguns segundos, atualize a página e tente novamente.');

    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 20;
    const marginRight = 20;
    const contentWidth = pageWidth - marginLeft - marginRight;
    const bottomLimit = pageHeight - 20;
    const courseTitle = content.curso.titulo || $('#modalModulos')?.dataset.courseTitle || 'Curso Altitude';
    const area = content.curso.categoria || $('#modalModulos')?.dataset.courseCategory || 'Formação Profissional';
    const hours = content.modulos.reduce((sum, item) => sum + Number(item.carga_horaria || 0), 0) || content.curso.carga_horaria || 0;
    let y = 24;
    let pageNumber = 1;

    const setColor = (hex) => {
      const value = String(hex).replace('#', '');
      doc.setTextColor(parseInt(value.slice(0,2),16), parseInt(value.slice(2,4),16), parseInt(value.slice(4,6),16));
    };
    const drawHeaderFooter = () => {
      doc.setDrawColor(200, 211, 220);
      doc.setLineWidth(0.25);
      doc.line(marginLeft, 13, pageWidth - marginRight, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(85, 85, 85);
      doc.text('Instituição Altitude', marginLeft, 10);
      doc.text(courseTitle, pageWidth - marginRight, 10, { align: 'right', maxWidth: 95 });
      doc.line(marginLeft, pageHeight - 14, pageWidth - marginRight, pageHeight - 14);
      doc.text(`${pageNumber}`, pageWidth / 2, pageHeight - 9, { align: 'center' });
    };
    const newPage = () => {
      drawHeaderFooter();
      doc.addPage();
      pageNumber += 1;
      y = 22;
    };
    const ensure = (needed = 12) => {
      if (y + needed > bottomLimit) newPage();
    };
    const writeWrapped = (text, options = {}) => {
      const value = String(text || '').trim();
      if (!value) return;
      const size = options.size || 11;
      const lineHeight = options.lineHeight || size * 0.46;
      const indent = options.indent || 0;
      const maxWidth = contentWidth - indent;
      doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      setColor(options.color || '#263746');
      const lines = doc.splitTextToSize(value, maxWidth);
      lines.forEach((line) => {
        ensure(lineHeight + 1);
        doc.text(line, marginLeft + indent, y, { align: options.align || 'left', maxWidth });
        y += lineHeight;
      });
      y += options.after ?? 2.5;
    };

    // Capa institucional.
    doc.setFillColor(234, 244, 251);
    doc.roundedRect(20, 38, pageWidth - 40, 62, 4, 4, 'F');
    setColor('#0D0A3C');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(25);
    doc.text('ALTITUDE', pageWidth / 2, 55, { align: 'center' });
    setColor('#1F70AB');
    doc.setFontSize(16);
    doc.text('Material de Estudo', pageWidth / 2, 68, { align: 'center' });
    setColor('#0D0A3C');
    doc.setFontSize(21);
    const coverTitle = doc.splitTextToSize(`Curso de ${courseTitle}`, pageWidth - 60);
    doc.text(coverTitle, pageWidth / 2, 82, { align: 'center' });

    doc.setDrawColor(31, 112, 171);
    doc.setFillColor(247, 251, 254);
    doc.roundedRect(20, 113, pageWidth - 40, 60, 3, 3, 'FD');
    y = 125;
    writeWrapped(`Curso: ${courseTitle}`, { bold: true, size: 11, after: 2 });
    writeWrapped(`Área de formação: ${area}`, { size: 10.5, after: 2 });
    writeWrapped('Modalidade: EAD / Semipresencial', { size: 10.5, after: 2 });
    writeWrapped(`Carga horária: ${hours} horas`, { size: 10.5, after: 2 });
    writeWrapped('Finalidade: apoiar o estudo teórico e servir de base para a avaliação de aprendizagem.', { size: 10.5, after: 2 });
    drawHeaderFooter();

    content.modulos.forEach((module, moduleIndex) => {
      doc.addPage();
      pageNumber += 1;
      y = 24;
      writeWrapped(`${moduleIndex + 1}. ${module.titulo}`, { size: 18, bold: true, color: '#1F70AB', after: 4 });
      doc.setFillColor(234, 244, 251);
      doc.setDrawColor(31, 112, 171);
      const boxHeight = 25;
      doc.roundedRect(marginLeft, y, contentWidth, boxHeight, 2, 2, 'FD');
      const boxStart = y;
      y += 8;
      writeWrapped(`Carga do módulo: ${Number(module.carga_horaria || 0)} horas`, { size: 9.5, bold: true, after: 1 });
      writeWrapped(`Descrição: ${module.descricao || 'Conteúdo programático do módulo.'}`, { size: 9, after: 1 });
      y = Math.max(y, boxStart + boxHeight + 7);

      const blocks = pdfTextBlocks(module.conteudo_latex || module.conteudo || '');
      blocks.forEach((block) => {
        if (block.type === 'h2') writeWrapped(block.text, { size: 15, bold: true, color: '#1F70AB', after: 3 });
        else if (block.type === 'h3') writeWrapped(block.text, { size: 12.5, bold: true, color: '#0D0A3C', after: 2 });
        else if (block.type === 'h4') writeWrapped(block.text, { size: 11.5, bold: true, color: '#0D0A3C', after: 2 });
        else if (block.type === 'li') writeWrapped(`• ${block.text}`, { size: 10.5, indent: 4, after: 1.5 });
        else if (block.type === 'eq') writeWrapped(block.text, { size: 10.5, align: 'center', color: '#0D0A3C', after: 3 });
        else writeWrapped(block.text, { size: 10.5, after: 3 });
      });
      drawHeaderFooter();
    });

    return doc.output('blob');
  }

  async function modulePdfBlob(module, course) {
    return pdfBlobFromContent({ curso: course, modulos: [module] });
  }

  async function updateContentPreview() {
    const source = $('#latexContentSource')?.value || '';
    const placeholder = $('#latexPdfPlaceholder');
    const frame = $('#latexPdfPreviewFrame');
    try {
      const parsed = parseContent(source);
      state.parsedContent = parsed;
      renderSummary(parsed);
      if (placeholder) { placeholder.hidden = false; placeholder.innerHTML = 'Gerando a prévia do PDF institucional…'; }
      const blob = await pdfBlobFromContent(parsed);
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(blob);
      frame.src = state.previewUrl;
      if (placeholder) placeholder.hidden = true;
      showPreviewPane('pdf');
    } catch (error) {
      state.parsedContent = null;
      if (placeholder) { placeholder.hidden = false; placeholder.innerHTML = `<b>Não foi possível gerar a prévia.</b><br>${esc(error.message)}`; }
      notify(error.message, true);
    }
  }

  function updateProofPreview() {
    const box = $('#latexQuestionsPreview');
    try {
      const parsed = parseProof($('#latexProofSource')?.value || '');
      state.parsedProof = parsed;
      renderSummary(state.parsedContent, parsed);
      let number = 0;
      box.innerHTML = parsed.grupos.map((group) => `
        <section class="latex-proof-group">
          <h4>Questões do módulo ${esc(group.modulo_ref)}</h4>
          ${group.questoes.map((question) => {
            number += 1;
            const alternatives = ['A','B','C','D','E'].filter((letter) => question[letter.toLowerCase()]);
            return `<article class="latex-question-card">
              <header><strong>Questão ${number}</strong><span>Gabarito: ${question.correta}</span></header>
              <p>${esc(question.enunciado)}</p>
              <ul>${alternatives.map((letter) => `<li class="${question.correta === letter ? 'correct' : ''}"><b>${letter})</b> ${esc(question[letter.toLowerCase()])}</li>`).join('')}</ul>
              <div class="resolution"><b>Resolução:</b> ${esc(question.resolucao)}</div>
            </article>`;
          }).join('')}
        </section>`).join('');
      showPreviewPane('questions');
    } catch (error) {
      state.parsedProof = null;
      box.innerHTML = `<div class="latex-preview-placeholder"><b>Revise o LaTeX da prova.</b><br>${esc(error.message)}</div>`;
      notify(error.message, true);
    }
  }

  function showPreviewPane(name) {
    document.querySelectorAll('[data-latex-preview]').forEach((button) => button.classList.toggle('active', button.dataset.latexPreview === name));
    const pdf = $('#latexPreviewPdfPane');
    const questions = $('#latexPreviewQuestionsPane');
    if (pdf) pdf.hidden = name !== 'pdf';
    if (questions) questions.hidden = name !== 'questions';
  }

  async function uploadPdf(blob, courseId, module) {
    const path = `${courseId}/latex/${Date.now()}-${module.ordem}-${slug(module.titulo)}.pdf`;
    const { error } = await window.sb.storage.from('materiais_cursos').upload(path, blob, { upsert: false, contentType: 'application/pdf', cacheControl: '3600' });
    if (error) throw error;
    return window.sb.storage.from('materiais_cursos').getPublicUrl(path).data.publicUrl;
  }

  async function importCourse(options = {}) {
    if (state.busy) return;
    const courseId = Number($('#modalModulos')?.dataset.courseId || 0);
    if (!courseId) return notify('Abra um curso em “Montar curso” antes de importar.', true);
    let content;
    let proof;
    try {
      content = parseContent($('#latexContentSource')?.value || '');
      const proofSource = $('#latexProofSource')?.value?.trim() || '';
      proof = proofSource ? parseProof(proofSource) : { grupos: [], totalQuestions: 0, source: '' };
      if (options.publishAfter && !proof.totalQuestions) throw new Error('Cadastre a prova em LaTeX antes de publicar o curso.');
    } catch (error) { return notify(error.message, true); }
    const parsed = mergeCourse(content, proof);
    const replace = Boolean($('#latexReplaceExisting')?.checked);
    if (replace) {
      const confirmed = window.AltitudeDialog?.confirm
        ? await window.AltitudeDialog.confirm({
            title: 'Substituir a estrutura atual?',
            message: 'Os módulos, materiais e provas atuais deste curso serão removidos e substituídos pelo conteúdo revisado na prévia.',
            confirmText: 'Substituir e importar',
            danger: true
          })
        : window.confirm('Substituir módulos, materiais e provas atuais?');
      if (!confirmed) return;
    }
    state.busy = true;
    const draftButton = $('#latexImportConfirm');
    const publishButton = $('#latexImportPublish');
    const button = options.publishAfter ? publishButton : draftButton;
    const progress = $('#latexImportProgress');
    if (draftButton) draftButton.disabled = true;
    if (publishButton) publishButton.disabled = true;
    try {
      const courseTitle = parsed.curso.titulo || $('#modalModulos')?.dataset.courseTitle || 'Curso Altitude';
      for (let i = 0; i < parsed.modulos.length; i += 1) {
        const module = parsed.modulos[i];
        if (progress) progress.textContent = `Gerando PDF ${i + 1}/${parsed.modulos.length}: ${module.titulo}`;
        const blob = await modulePdfBlob(module, { ...parsed.curso, titulo: courseTitle });
        module.pdf_url = await uploadPdf(blob, courseId, module);
      }
      if (progress) progress.textContent = 'Salvando módulos, horas, prova, gabarito e resoluções…';
      const payload = { curso: parsed.curso, modulos: parsed.modulos.map(({ conteudo_html, ...module }) => module) };
      const { data, error } = await window.sb.rpc('gestor_importar_curso_latex', {
        p_curso_id: courseId,
        p_payload: payload,
        p_substituir: replace,
        p_publicar_modulos: Boolean($('#latexPublishModules')?.checked),
        p_atualizar_curso: Boolean($('#latexUpdateCourse')?.checked)
      });
      if (error) throw error;
      if (progress) progress.textContent = '';
      if (window.carregarModulosCursoAtual) await window.carregarModulosCursoAtual();
      if (window.carregarCursosCompleto) await window.carregarCursosCompleto();
      setMode('latex');
      const importedModules = Number(data?.modulos_importados || parsed.modulos.length);
      const importedQuestions = Number(data?.questoes_importadas || parsed.totalQuestions);
      if (options.publishAfter) {
        if (progress) progress.textContent = 'Revisando e publicando o curso…';
        if (typeof window.altitudeAlternarPublicacaoCurso !== 'function') throw new Error('A publicação ainda não terminou de carregar. Aguarde alguns segundos e tente novamente.');
        await window.altitudeAlternarPublicacaoCurso(courseId, publishButton, { forcePublish: true, throwOnError: true });
        if (progress) progress.textContent = '';
        notify(`Curso salvo e publicado: ${importedModules} módulo(s) e ${importedQuestions} questão(ões).`);
        document.getElementById('fecharModulos')?.click();
      } else {
        notify(`Curso salvo como rascunho: ${importedModules} módulo(s) e ${importedQuestions} questão(ões). Agora você pode revisar ou publicar nesta mesma tela.`);
      }
    } catch (error) {
      console.error('Importação LaTeX:', error);
      if (progress) progress.textContent = '';
      notify(`Não foi possível importar: ${error.message}`, true);
    } finally {
      state.busy = false;
      if (draftButton) draftButton.disabled = false;
      if (publishButton) publishButton.disabled = false;
    }
  }

  function setMode(mode) {
    const normal = mode !== 'latex';
    $('#normalBuilderPanel').hidden = !normal;
    $('#normalBuilderFooter').hidden = !normal;
    $('#latexBuilderPanel').hidden = normal;
    document.querySelectorAll('[data-builder-mode]').forEach((button) => {
      const active = button.dataset.builderMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (!normal && !state.parsedContent) {
      window.setTimeout(() => {
        updateContentPreview();
        try { updateProofPreview(); } catch (_) {}
      }, 30);
    }
  }

  async function readFileInto(input, target) {
    const file = input.files?.[0];
    if (!file) return;
    target.value = await file.text();
  }

  function bind() {
    document.querySelectorAll('[data-builder-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.builderMode)));
    document.querySelectorAll('[data-latex-preview]').forEach((button) => button.addEventListener('click', () => showPreviewPane(button.dataset.latexPreview)));
    $('#latexContentTemplate')?.addEventListener('click', () => { $('#latexContentSource').value = CONTENT_TEMPLATE; updateContentPreview(); });
    $('#latexProofTemplate')?.addEventListener('click', () => { $('#latexProofSource').value = PROOF_TEMPLATE; updateProofPreview(); });
    $('#latexValidateContent')?.addEventListener('click', updateContentPreview);
    $('#latexValidateProof')?.addEventListener('click', updateProofPreview);
    $('#latexImportConfirm')?.addEventListener('click', () => importCourse({ publishAfter: false }));
    $('#latexImportPublish')?.addEventListener('click', () => importCourse({ publishAfter: true }));
    $('#latexContentFile')?.addEventListener('change', async (event) => { await readFileInto(event.currentTarget, $('#latexContentSource')); updateContentPreview(); });
    $('#latexProofFile')?.addEventListener('change', async (event) => { await readFileInto(event.currentTarget, $('#latexProofSource')); updateProofPreview(); });
    if ($('#latexContentSource') && !$('#latexContentSource').value.trim()) $('#latexContentSource').value = CONTENT_TEMPLATE;
    if ($('#latexProofSource') && !$('#latexProofSource').value.trim()) $('#latexProofSource').value = PROOF_TEMPLATE;
    setMode('normal');
  }

  window.AltitudeLatexImporter = Object.freeze({
    parseContent,
    parseProof,
    mergeCourse,
    latexToHtml,
    contentTemplate: CONTENT_TEMPLATE,
    proofTemplate: PROOF_TEMPLATE,
    previewContent: updateContentPreview,
    importCourse
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try { await window.GESTOR_AUTH_READY; } catch (_) {}
    bind();
  });
})();
