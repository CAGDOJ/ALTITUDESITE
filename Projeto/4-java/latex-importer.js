(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const state = { parsedContent: null, parsedProof: null, previewUrl: null, previewBlob: null, busy: false };
  const esc = (value = '') => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const slug = (value) => String(value || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arquivo';

  const CONTENT_TEMPLATE = String.raw`\documentclass[12pt,a4paper]{article}

% ==================================================
% DADOS GERAIS DO CURSO
% ==================================================
\titulocurso{Digite o título do curso}
\areacurso{Digite a área do curso}
\nivelcurso{BASICO}
\notaminima{70}
\descricaoCurso{Digite uma descrição breve do curso.}

\begin{document}

% ==================================================
% MÓDULO 1
% Duplique este bloco para criar novos módulos.
% ==================================================
\begin{altitudemodulo}{Digite o nome do módulo}{1}
\descricaoModulo{Digite uma descrição breve do módulo.}
% Vídeo opcional: remova o símbolo % da linha abaixo e informe o endereço.
% \videoModulo{https://www.youtube.com/watch?v=...}

\begin{conteudo}
% ==================================================
% TÍTULO
% ==================================================
\section{Digite o título}

Digite o conteúdo de desenvolvimento aqui.

% ==================================================
% SUBTÍTULO
% ==================================================
\subsection{Digite o subtítulo}

Continue o conteúdo aqui.

% ==================================================
% LISTA
% ==================================================
\begin{itemize}[leftmargin=1.1cm]
  \item Primeiro item;
  \item Segundo item;
\end{itemize}
\end{conteudo}
\end{altitudemodulo}

\end{document}`;

  const PROOF_TEMPLATE = String.raw`\documentclass{article}
\begin{document}

% ==================================================
% PROVA DO MÓDULO 1
% Repita altitudequestao para adicionar outras questões.
% Repita altitudeprova para criar a prova de outro módulo.
% ==================================================

\begin{altitudeprova}{1}

\begin{altitudequestao}{1}
\enunciado{Digite o enunciado da questão.}
\alternativa{A}{Alternativa A.}
\alternativa{B}{Alternativa B.}
\alternativa{C}{Alternativa C.}
\alternativa{D}{Alternativa D.}
\alternativa{E}{Alternativa E.}
\gabarito{A}
\resolucao{Explique de forma objetiva por que a alternativa está correta.}
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

  function latexTableToHtml(raw) {
    const rows = String(raw || '')
      .replace(/\\(?:hline|toprule|midrule|bottomrule)\b/g, '')
      .split(/\\\\/)
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => row.split('&').map((cell) => String(cell || '')
        .replace(/\\(?:textbf|textit|emph|multicolumn)\*?(?:\{[^}]*\})?/g, '')
        .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, '')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim()));
    if (!rows.length) return '';
    return `<div class="latex-table-wrap"><table class="latex-table"><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }


  function parseDimensionToCss(value, fallback = '1.1cm') {
    const raw = String(value || '').trim();
    if (!raw || raw === '*') return fallback;
    const match = raw.match(/^(-?\d+(?:[.,]\d+)?)\s*(cm|mm|pt|px|em|rem|in)$/i);
    if (!match) return fallback;
    const amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount)) return fallback;
    return `${Math.max(0, amount)}${match[2].toLowerCase()}`;
  }

  function listOptions(rawOptions = '') {
    const options = String(rawOptions || '').replace(/^\[|\]$/g, '');
    const left = /(?:^|,)\s*leftmargin\s*=\s*([^,]+)/i.exec(options)?.[1]?.trim();
    const itemSep = /(?:^|,)\s*itemsep\s*=\s*([^,]+)/i.exec(options)?.[1]?.trim();
    return {
      leftMargin: left ? parseDimensionToCss(left) : '',
      itemSep: itemSep ? parseDimensionToCss(itemSep, '0.25rem') : ''
    };
  }

  function listOpenHtml(tagName, rawOptions = '') {
    const opts = listOptions(rawOptions);
    const styles = [];
    if (opts.leftMargin) styles.push(`margin-left:${opts.leftMargin}`);
    if (opts.itemSep) styles.push(`--altitude-list-item-gap:${opts.itemSep}`);
    return `<${tagName} class="latex-list${opts.leftMargin ? ' has-custom-leftmargin' : ''}"${styles.length ? ` style="${styles.join(';')}"` : ''}>`;
  }

  function dimensionToMm(value, fallback = 11) {
    const raw = String(value || '').trim();
    if (!raw || raw === '*') return fallback;
    const match = raw.match(/^(-?\d+(?:[.,]\d+)?)\s*(cm|mm|pt|px|em|rem|in)$/i);
    if (!match) return fallback;
    const n = Math.max(0, Number(match[1].replace(',', '.')));
    const unit = match[2].toLowerCase();
    const factors = { mm: 1, cm: 10, pt: 25.4 / 72, px: 25.4 / 96, in: 25.4, em: 4.2, rem: 4.2 };
    return n * (factors[unit] || 1);
  }

  function listMarginMm(rawOptions = '') {
    const options = String(rawOptions || '').replace(/^\[|\]$/g, '');
    const left = /(?:^|,)\s*leftmargin\s*=\s*([^,]+)/i.exec(options)?.[1]?.trim();
    return left ? dimensionToMm(left, 11) : 4;
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
      .replace(/\\begin\{tabularx\}\{[^}]*\}\{[^}]*\}([\s\S]*?)\\end\{tabularx\}/g, (_, body) => protect(latexTableToHtml(body)))
      .replace(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, (_, body) => protect(latexTableToHtml(body)))
      .replace(/\\begin\{tcolorbox\}(?:\[[\s\S]*?\])?/g, () => protect('<aside class="latex-info-box">'))
      .replace(/\\end\{tcolorbox\}/g, () => protect('</aside>'))
      .replace(/\\begin\{center\}/g, () => protect('<div class="latex-align-center">'))
      .replace(/\\end\{center\}/g, () => protect('</div>'))
      .replace(/\\begin\{flushright\}/g, () => protect('<div class="latex-align-right">'))
      .replace(/\\end\{flushright\}/g, () => protect('</div>'))
      .replace(/\\begin\{flushleft\}/g, () => protect('<div class="latex-align-left">'))
      .replace(/\\end\{flushleft\}/g, () => protect('</div>'))
      .replace(/\\begin\{itemize\}(\[[^\]]*\])?/g, (_, options = '') => protect(listOpenHtml('ul', options)))
      .replace(/\\end\{itemize\}/g, () => protect('</ul>'))
      .replace(/\\begin\{enumerate\}(\[[^\]]*\])?/g, (_, options = '') => protect(listOpenHtml('ol', options)))
      .replace(/\\end\{enumerate\}/g, () => protect('</ol>'))
      .replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, '')
      .replace(/\\(?:small|footnotesize|large|Large|LARGE|normalsize)\b/g, '')
      .replace(/\\textcolor\{[^}]*\}\{([^{}]*)\}/g, '$1')
      .replace(/\\color\{[^}]*\}/g, '');
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
    source = source
      .replace(/<p>\s*(<aside class="latex-info-box">)\s*<\/p>/g, '$1')
      .replace(/<p>\s*(<(?:ul|ol) class="latex-list[^"]*"[^>]*>)\s*<\/p>/g, '$1')
      .replace(/<p>\s*(<\/(?:ul|ol)>)\s*<\/p>/g, '$1')
      .replace(/<p>\s*(<\/aside>)\s*<\/p>/g, '$1')
      .replace(/<p>\s*(<div class="latex-align-(?:center|right|left)">)\s*<\/p>/g, '$1')
      .replace(/<p>\s*(<\/div>)\s*<\/p>/g, '$1')
      .replace(/\?\s*,/g, '? ')
      .replace(/!\s*,/g, '! ')
      .replace(/\s+([,.;:!?])/g, '$1');
    return source;
  }

  function latexToPlain(raw) {
    const node = document.createElement('div');
    node.innerHTML = latexToHtml(raw);
    return (node.textContent || '').replace(/\?\s*,/g, '? ').replace(/!\s*,/g, '! ').replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
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

    const targetCount = sections.length < 2 ? 1 : (sections.length >= 9 ? 3 : 2);
    const firstSection = sections[0].index;
    const usefulBody = body.slice(firstSection);
    const adjusted = sections.map((section) => ({ ...section, index: section.index - firstSection }));
    const modules = [];

    for (let group = 0; group < targetCount; group += 1) {
      const startSection = Math.floor((group * adjusted.length) / targetCount);
      const endSection = Math.floor(((group + 1) * adjusted.length) / targetCount);
      const start = adjusted[startSection].index;
      const end = endSection < adjusted.length ? adjusted[endSection].index : usefulBody.length;
      const latex = usefulBody.slice(start, end).trim();
      const names = adjusted.slice(startSection, endSection).map((item) => item.title);
      const plain = latexToPlain(latex);
      modules.push({
        titulo: groupModuleTitle(names, group),
        ordem: group + 1,
        carga_horaria: 0,
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
        carga_horaria: null,
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
      carga_horaria: null,
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
        carga_horaria: 0,
        descricao: latexToPlain(firstCommand(block.body, 'descricaoModulo')) || plain.slice(0, 220),
        conteudo: plain,
        conteudo_latex: content,
        conteudo_html: latexToHtml(content),
        video_url: firstCommand(block.body, 'videoModulo') || null,
        questoes: []
      };
    }).sort((a, b) => a.ordem - b.ordem);

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
    box.innerHTML = `
      <article><span>Curso</span><strong>${esc(title)}</strong></article>
      <article><span>Módulos</span><strong>${content.modulos.length}</strong></article>
      <article><span>Questões</span><strong>${proof?.totalQuestions || 0}</strong></article>`;
  }

  function buildMaterialNode(content) {
    const courseTitle = content.curso.titulo || $('#modalModulos')?.dataset.courseTitle || 'Curso Altitude';
    const area = content.curso.categoria || 'Formação Profissional';
    const node = document.createElement('article');
    node.className = 'altitude-material-pdf';
    node.innerHTML = `
      <div class="pdf-running-head"><span>ALTITUDE CENTRO UNIVERSITÁRIO</span><span>${esc(courseTitle)}</span></div>
      <section class="pdf-cover">
        <img src="../3-img/LOGO.png" alt="ALTITUDE CENTRO UNIVERSITÁRIO">
        <div class="institution">ALTITUDE CENTRO UNIVERSITÁRIO</div>
        <div class="material">Material de Estudo</div>
        <h1>Curso de ${esc(courseTitle)}</h1>
      </section>
      <section class="pdf-info-box">
        <b>Curso:</b><span>${esc(courseTitle)}</span>
        <b>Área de formação:</b><span>${esc(area)}</span>
        <b>Finalidade do material:</b><span>Apoiar o estudo teórico do aluno e servir de base para avaliação de aprendizagem ao final do curso.</span>
      </section>
      ${content.modulos.map((module, index) => `
        <section class="pdf-module ${index === 0 ? 'first' : ''}">
          <div class="pdf-running-head"><span>ALTITUDE CENTRO UNIVERSITÁRIO</span><span>${esc(courseTitle)}</span></div>
          <h2>${index + 1}. ${esc(module.titulo)}</h2>
          ${module.conteudo_html}
          <div class="pdf-footer">ALTITUDE CENTRO UNIVERSITÁRIO | Material de Estudo | ${esc(courseTitle)}</div>
        </section>`).join('')}
      <div class="pdf-orientation"><strong>Orientação ao aluno:</strong> recomenda-se a leitura integral deste material antes da avaliação.</div>`;
    document.body.appendChild(node);
    return node;
  }

  function pdfTextBlocks(raw) {
    let source = removeComments(raw || '')
      .replace(/\\begin\{document\}|\\end\{document\}/g, '')
      .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/g, '');

    // Converte os ambientes de lista antes de remover comandos. O leftmargin passa a
    // produzir recuo real tanto no HTML quanto no PDF, em vez de ser descartado.
    source = source.replace(/\\begin\{(itemize|enumerate)\}(\[[^\]]*\])?([\s\S]*?)\\end\{\1\}/g,
      (_, type, options = '', body = '') => {
        const indent = listMarginMm(options);
        let index = 0;
        return String(body).split(/\\item\s*/).slice(1).map((item) => {
          index += 1;
          const prefix = type === 'enumerate' ? `${index}. ` : '• ';
          return `\n@@LI:${indent.toFixed(2)}@@${prefix}${item.trim()}\n`;
        }).join('');
      });

    source = source
      .replace(/\\section\*?\{([^{}]*)\}/g, '\n@@H2@@$1\n')
      .replace(/\\subsection\*?\{([^{}]*)\}/g, '\n@@H3@@$1\n')
      .replace(/\\subsubsection\*?\{([^{}]*)\}/g, '\n@@H4@@$1\n')
      .replace(/\\paragraph\{([^{}]*)\}/g, '\n@@H4@@$1\n')
      .replace(/\\item\s*/g, '\n@@LI:4.00@@• ')
      .replace(/\\begin\{(?:itemize|enumerate)\}(?:\[[^\]]*\])?|\\end\{(?:itemize|enumerate)\}/g, '\n')
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
      if (line.startsWith('@@LI:')) {
        const match = /^@@LI:([0-9.]+)@@([\s\S]*)$/.exec(line);
        return { type: 'li', indentMm: Number(match?.[1] || 4), text: String(match?.[2] || '').trim() };
      }
      if (line.startsWith('@@EQ@@')) return { type: 'eq', text: line.slice(6).trim() };
      return { type: 'p', text: line.replace(/\s+/g, ' ').trim() };
    });
  }

  function cp1252Octal(value) {
    const map = { '€':128, '‚':130, 'ƒ':131, '„':132, '…':133, '†':134, '‡':135, 'ˆ':136, '‰':137, 'Š':138, '‹':139, 'Œ':140, 'Ž':142, '‘':145, '’':146, '“':147, '”':148, '•':149, '–':150, '—':151, '˜':152, '™':153, 'š':154, '›':155, 'œ':156, 'ž':158, 'Ÿ':159 };
    let result = '';
    for (const character of String(value || '')) {
      let code = character.codePointAt(0);
      if (map[character] !== undefined) code = map[character];
      else if (code > 255) code = 63;
      if (code === 40 || code === 41 || code === 92 || code < 32 || code > 126) result += `\\${code.toString(8).padStart(3, '0')}`;
      else result += String.fromCharCode(code);
    }
    return result;
  }

  function wrapPdfText(value, maxChars = 88) {
    const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) { lines.push(line); line = word; }
      else line = candidate;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function simplePdfBlobFromContent(content) {
    const courseTitle = content.curso.titulo || $('#modalModulos')?.dataset.courseTitle || 'Curso Altitude';
    const area = content.curso.categoria || $('#modalModulos')?.dataset.courseCategory || 'Formação Profissional';
    const pages = [];
    const cover = [
      { text: 'ALTITUDE CENTRO UNIVERSITÁRIO', size: 22, bold: true, color: '0.05 0.04 0.24', gap: 28 },
      { text: 'Material de Estudo', size: 16, bold: true, color: '0.12 0.44 0.67', gap: 24 },
      { text: `Curso de ${courseTitle}`, size: 20, bold: true, color: '0.05 0.04 0.24', gap: 34 },
      { text: `Área de formação: ${area}`, size: 11, gap: 18 },
      { text: 'Finalidade: apoiar o estudo teórico e servir de base para a avaliação de aprendizagem.', size: 11, gap: 18 }
    ];
    pages.push(cover);
    content.modulos.forEach((module, moduleIndex) => {
      const blocks = pdfTextBlocks(module.conteudo_latex || module.conteudo || '');
      let current = [
        { text: `${moduleIndex + 1}. ${module.titulo}`, size: 18, bold: true, color: '0.12 0.44 0.67', gap: 24 },
      ];
      let used = 90;
      const pushPage = () => { pages.push(current); current = []; used = 35; };
      blocks.forEach((block) => {
        const size = block.type === 'h2' ? 15 : block.type === 'h3' ? 13 : block.type === 'h4' ? 11.5 : 10.5;
        const bold = ['h2','h3','h4'].includes(block.type);
        const prefix = block.type === 'li' ? '• ' : '';
        const lines = wrapPdfText(`${prefix}${block.text}`, block.type === 'h2' ? 62 : 88);
        const needed = lines.length * (size + 3) + (bold ? 8 : 4);
        if (used + needed > 730 && current.length) pushPage();
        current.push({ text: lines.join('\n'), size, bold, indentPt: block.type === 'li' ? Number(block.indentMm || 4) * 2.83465 : 0, color: block.type === 'h2' ? '0.12 0.44 0.67' : '0.10 0.19 0.28', gap: bold ? 18 : 14 });
        used += needed;
      });
      if (current.length) pages.push(current);
    });

    const objects = [];
    const addObject = (value) => { objects.push(value); return objects.length; };
    const catalogId = addObject('');
    const pagesId = addObject('');
    const fontRegularId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds = [];

    pages.forEach((items, index) => {
      let y = 785;
      const commands = ['0.95 0.97 0.98 rg 42 742 511 64 re f'];
      commands.push('BT');
      items.forEach((item) => {
        const lines = String(item.text || '').split('\n');
        commands.push(`/${item.bold ? 'F2' : 'F1'} ${item.size || 10.5} Tf`);
        commands.push(`${item.color || '0.10 0.19 0.28'} rg`);
        lines.forEach((line) => {
          commands.push(`1 0 0 1 ${(58 + Number(item.indentPt || 0)).toFixed(1)} ${y.toFixed(1)} Tm (${cp1252Octal(line)}) Tj`);
          y -= (item.size || 10.5) + 3.2;
        });
        y -= Math.max(2, (item.gap || 14) - (item.size || 10.5));
      });
      commands.push('/F1 8 Tf 0.35 0.40 0.45 rg');
      commands.push(`1 0 0 1 58 28 Tm (${cp1252Octal(`ALTITUDE CENTRO UNIVERSITÁRIO | ${courseTitle}`)}) Tj`);
      commands.push(`1 0 0 1 520 28 Tm (${index + 1}) Tj`);
      commands.push('ET');
      const stream = commands.join('\n');
      const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    });
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let pdf = '%PDF-1.4\n%ALTITUDE\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([new TextEncoder().encode(pdf)], { type: 'application/pdf' });
  }

  function jsPdfConstructor() {
    return window.jspdf?.jsPDF || window.jsPDF || null;
  }

  async function pdfBlobFromContent(content) {
    const JsPDF = jsPdfConstructor();
    if (!JsPDF) return simplePdfBlobFromContent(content);

    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 20;
    const marginRight = 20;
    const contentWidth = pageWidth - marginLeft - marginRight;
    const bottomLimit = pageHeight - 20;
    const courseTitle = content.curso.titulo || $('#modalModulos')?.dataset.courseTitle || 'Curso Altitude';
    const area = content.curso.categoria || $('#modalModulos')?.dataset.courseCategory || 'Formação Profissional';
    let logoDataUrl = null;
    try {
      logoDataUrl = await new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            canvas.getContext('2d').drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch (_) { resolve(null); }
        };
        image.onerror = () => resolve(null);
        image.src = new URL('../3-img/LOGO.png', location.href).href;
      });
    } catch (_) {}
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
      doc.text('ALTITUDE CENTRO UNIVERSITÁRIO', marginLeft, 10);
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
    doc.roundedRect(20, 30, pageWidth - 40, 76, 4, 4, 'F');
    if (logoDataUrl) {
      const logoWidth = 74;
      const logoHeight = 20;
      doc.addImage(logoDataUrl, 'PNG', (pageWidth - logoWidth) / 2, 38, logoWidth, logoHeight, undefined, 'FAST');
    } else {
      setColor('#0D3553'); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
      doc.text('ALTITUDE', pageWidth / 2, 52, { align: 'center' });
    }
    setColor('#0EA5B7');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Material de Estudo', pageWidth / 2, 67, { align: 'center' });
    setColor('#0D3553');
    doc.setFontSize(20);
    const coverTitle = doc.splitTextToSize(`Curso de ${courseTitle}`, pageWidth - 60);
    doc.text(coverTitle, pageWidth / 2, 84, { align: 'center' });

    doc.setDrawColor(31, 112, 171);
    doc.setFillColor(247, 251, 254);
    doc.roundedRect(20, 116, pageWidth - 40, 52, 3, 3, 'FD');
    y = 128;
    writeWrapped(`Curso: ${courseTitle}`, { bold: true, size: 11, after: 2 });
    writeWrapped(`Área de formação: ${area}`, { size: 10.5, after: 2 });
    writeWrapped('Finalidade: apoiar o estudo teórico e servir de base para a avaliação de aprendizagem.', { size: 10.5, after: 2 });
    drawHeaderFooter();

    content.modulos.forEach((module, moduleIndex) => {
      doc.addPage();
      pageNumber += 1;
      y = 24;
      writeWrapped(`${moduleIndex + 1}. ${module.titulo}`, { size: 18, bold: true, color: '#1F70AB', after: 4 });
      const blocks = pdfTextBlocks(module.conteudo_latex || module.conteudo || '');
      blocks.forEach((block) => {
        if (block.type === 'h2') writeWrapped(block.text, { size: 15, bold: true, color: '#1F70AB', after: 3 });
        else if (block.type === 'h3') writeWrapped(block.text, { size: 12.5, bold: true, color: '#0D0A3C', after: 2 });
        else if (block.type === 'h4') writeWrapped(block.text, { size: 11.5, bold: true, color: '#0D0A3C', after: 2 });
        else if (block.type === 'li') writeWrapped(block.text, { size: 10.5, indent: Number(block.indentMm || 4), after: 1.5 });
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
    const openButton = $('#latexOpenPdf');
    const downloadButton = $('#latexDownloadPdf');
    try {
      const parsed = parseContent(source);
      state.parsedContent = parsed;
      renderSummary(parsed);
      if (placeholder) { placeholder.hidden = false; placeholder.innerHTML = '<b>Gerando o PDF institucional…</b><br>Aguarde alguns segundos.'; }
      if (openButton) openButton.disabled = true;
      if (downloadButton) downloadButton.disabled = true;
      const blob = await Promise.race([
        pdfBlobFromContent(parsed),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('A geração do PDF demorou mais que o esperado. Clique novamente em “Gerar prévia do PDF”.')), 15000))
      ]);
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewBlob = blob;
      state.previewUrl = URL.createObjectURL(blob);
      if (frame) {
        frame.removeAttribute('hidden');
        frame.src = `${state.previewUrl}#toolbar=1&navpanes=0&view=FitH`;
      }
      if (placeholder) placeholder.hidden = true;
      if (openButton) openButton.disabled = false;
      if (downloadButton) downloadButton.disabled = false;
      showPreviewPane('pdf');
    } catch (error) {
      state.parsedContent = null;
      state.previewBlob = null;
      if (openButton) openButton.disabled = true;
      if (downloadButton) downloadButton.disabled = true;
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
    const pdf = $('#latexPreviewPdfPane');
    const questions = $('#latexPreviewQuestionsPane');
    if (pdf) pdf.hidden = false;
    if (questions) questions.hidden = false;
  }

  async function uploadPdf(blob, courseId, module) {
    const path = `${courseId}/latex/${Date.now()}-${module.ordem}-${slug(module.titulo)}.pdf`;
    const { error } = await window.sb.storage.from('materiais_cursos').upload(path, blob, { upsert: false, contentType: 'application/pdf', cacheControl: '3600' });
    if (error) throw error;
    return window.sb.storage.from('materiais_cursos').getPublicUrl(path).data.publicUrl;
  }

  async function insertOne(table, payload, optionalFields = []) {
    let current = { ...payload };
    for (let attempt = 0; attempt <= optionalFields.length; attempt += 1) {
      const { data, error } = await window.sb.from(table).insert(current).select().single();
      if (!error) return data;
      const message = String(error.message || error.details || '');
      const field = optionalFields.find((name) => Object.prototype.hasOwnProperty.call(current, name) && (message.includes(`'${name}'`) || message.includes(`\"${name}\"`) || message.includes(` ${name} `)));
      if (!field) throw error;
      delete current[field];
    }
    throw new Error(`Não foi possível salvar em ${table}.`);
  }

  async function removeCurrentStructure(courseId) {
    const { data: proofs, error: proofReadError } = await window.sb.from('provas').select('id').eq('curso_id', courseId);
    if (proofReadError) throw proofReadError;
    const proofIds = (proofs || []).map((item) => item.id);
    if (proofIds.length) {
      const { error: questionDeleteError } = await window.sb.from('questoes').delete().in('prova_id', proofIds);
      if (questionDeleteError) throw questionDeleteError;
    }
    const { error: proofDeleteError } = await window.sb.from('provas').delete().eq('curso_id', courseId);
    if (proofDeleteError) throw proofDeleteError;
    const { error: materialDeleteError } = await window.sb.from('materiais').delete().eq('curso_id', courseId);
    if (materialDeleteError) throw materialDeleteError;
    const { error: moduleDeleteError } = await window.sb.from('modulos').delete().eq('curso_id', courseId);
    if (moduleDeleteError) throw moduleDeleteError;
  }

  async function saveImportedCourseDirect(courseId, parsed, options = {}) {
    if (options.replace) await removeCurrentStructure(courseId);
    if (options.updateCourse) {
      const coursePayload = {};
      if (parsed.curso.titulo) coursePayload.titulo = parsed.curso.titulo;
      if (parsed.curso.categoria) coursePayload.categoria = String(parsed.curso.categoria).toUpperCase();
      if (parsed.curso.descricao) coursePayload.descricao = parsed.curso.descricao;
      if (Object.keys(coursePayload).length) {
        const { error: courseError } = await window.sb.from('cursos').update(coursePayload).eq('id', courseId);
        if (courseError) throw courseError;
      }
    }

    let moduleCount = 0;
    let questionCount = 0;
    for (const module of parsed.modulos) {
      const savedModule = await insertOne('modulos', {
        curso_id: courseId,
        titulo: module.titulo,
        descricao: module.descricao || null,
        conteudo: module.conteudo || null,
        conteudo_latex: module.conteudo_latex || null,
        ordem: Number(module.ordem || moduleCount + 1),
        carga_horaria: Number(module.carga_horaria || 0),
        pdf_url: module.pdf_url || null,
        video_url: module.video_url || null,
        publicado: Boolean(options.publishModules)
      }, ['conteudo_latex', 'carga_horaria', 'pdf_url', 'video_url']);
      moduleCount += 1;

      if (module.pdf_url) {
        await insertOne('materiais', {
          curso_id: courseId,
          modulo_id: savedModule.id,
          tipo: 'PDF',
          titulo: `Apostila — ${module.titulo}`,
          url: module.pdf_url
        });
      }

      if (Array.isArray(module.questoes) && module.questoes.length) {
        const proof = await insertOne('provas', {
          curso_id: courseId,
          modulo_id: savedModule.id,
          titulo: `${module.titulo} — Avaliação`
        }, ['modulo_id']);
        const rows = module.questoes.map((question, index) => ({
          prova_id: proof.id,
          enunciado: question.enunciado,
          enunciado_latex: question.enunciado_latex || null,
          a: question.a,
          b: question.b,
          c: question.c,
          d: question.d,
          e: question.e || null,
          correta: question.correta,
          resolucao: question.resolucao || null,
          ordem: Number(question.ordem || index + 1)
        }));
        let { error: questionError } = await window.sb.from('questoes').insert(rows);
        if (questionError && /enunciado_latex|resolucao|ordem|\be\b/i.test(String(questionError.message || ''))) {
          const compatibleRows = rows.map(({ enunciado_latex, resolucao, ordem, e, ...row }) => row);
          ({ error: questionError } = await window.sb.from('questoes').insert(compatibleRows));
        }
        if (questionError) throw questionError;
        questionCount += rows.length;
      }
    }
    return { modulos_importados: moduleCount, questoes_importadas: questionCount };
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
      if (progress) progress.textContent = 'Salvando módulos, prova, gabarito e resoluções…';
      const data = await saveImportedCourseDirect(courseId, parsed, {
        replace,
        publishModules: options.publishAfter || Boolean($('#latexPublishModules')?.checked),
        updateCourse: Boolean($('#latexUpdateCourse')?.checked)
      });
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
    $('#latexBuilderPanel').hidden = normal;
    const status = $('#builderHeaderMode');
    if (status) status.textContent = normal ? 'Inserção normal' : 'Inserção em LaTeX';
    document.querySelectorAll('[data-builder-mode]').forEach((button) => {
      const active = button.dataset.builderMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelector('.builder-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (!normal && !state.parsedContent) {
      window.setTimeout(() => {
        updateContentPreview();
        try { updateProofPreview(); } catch (_) {}
      }, 80);
    }
  }

  async function readFileInto(input, target) {
    const file = input.files?.[0];
    if (!file) return;
    target.value = await file.text();
  }

  function bind() {
    document.querySelectorAll('[data-builder-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.builderMode)));
    $('#latexContentTemplate')?.addEventListener('click', () => { $('#latexContentSource').value = CONTENT_TEMPLATE; updateContentPreview(); });
    $('#latexProofTemplate')?.addEventListener('click', () => { $('#latexProofSource').value = PROOF_TEMPLATE; updateProofPreview(); });
    $('#latexValidateContent')?.addEventListener('click', updateContentPreview);
    $('#latexValidateProof')?.addEventListener('click', updateProofPreview);
    $('#latexOpenPdf')?.addEventListener('click', () => {
      if (state.previewUrl) window.open(state.previewUrl, '_blank', 'noopener');
    });
    $('#latexDownloadPdf')?.addEventListener('click', () => {
      if (!state.previewUrl) return;
      const link = document.createElement('a');
      link.href = state.previewUrl;
      link.download = `${slug($('#modalModulos')?.dataset.courseTitle || 'curso-altitude')}-previa.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
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
    createPdfBlob: pdfBlobFromContent,
    createModulePdfBlob: modulePdfBlob,
    importCourse
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try { await window.GESTOR_AUTH_READY; } catch (_) {}
    bind();
  });
})();
