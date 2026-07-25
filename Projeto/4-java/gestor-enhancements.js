/* ALTITUDE — melhorias do Portal de Gestão
   Complementa o arquivo legado sem alterar a configuração do Supabase. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const MATERIAL_BUCKET = 'materiais_cursos';
  const state = { modulo: null, curso: null };

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function toast(message, type = 'ok') {
    let el = $('#gestorToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gestorToast';
      el.className = 'gestor-toast';
      document.body.appendChild(el);
    }
    el.className = `gestor-toast ${type}`;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3800);
  }

  function setLoading(button, loading, label = 'Processando...') {
    if (!button) return;
    if (loading) {
      button.dataset.original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="mini-spinner"></span>${label}`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.original || button.innerHTML;
    }
  }

  function pageTitle(tab) {
    return ({
      dashboard: 'Visão geral', cursos: 'Cursos e conteúdos', 'curso-ia': 'Assistente acadêmico',
      alunos: 'Gestão de alunos', 'certificados-gestao': 'Certificados', usuarios: 'Equipe e acessos', chamados: 'Atendimento'
    })[tab] || 'Portal de Gestão';
  }

  const originalAbrirAba = window.abrirAba;
  window.abrirAba = function abrirAbaMelhorada(id) {
    $$('.aba').forEach(section => section.classList.remove('ativa'));
    $(`#${id}`)?.classList.add('ativa');
    $$('.nav-item').forEach(btn => btn.classList.toggle('ativa', btn.dataset.tab === id));
    const title = $('#gestorPageTitle');
    if (title) title.textContent = pageTitle(id);
    $('#gestorSidebar')?.classList.remove('open');
    $('#gestorSidebarOverlay')?.classList.remove('show');

    if (id === 'dashboard') carregarDashboard();
    else if (typeof originalAbrirAba === 'function') originalAbrirAba(id);
  };

  async function countRows(table, queryBuilder) {
    try {
      let q = sb.from(table).select('*', { count: 'exact', head: true });
      if (queryBuilder) q = queryBuilder(q);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.warn(`Contagem ${table}:`, error.message);
      return 0;
    }
  }

  async function carregarDashboard() {
    if (!window.sb) return;
    const [cursos, matriculas, certificados, certPendentes, chamados] = await Promise.all([
      countRows('cursos', q => q.eq('publicado', true)),
      countRows('matriculas', q => q.eq('status', 'ATIVA')),
      countRows('certificados', q => q.eq('status', 'EMITIDO')),
      countRows('certificados', q => q.eq('status', 'PENDENTE')),
      countRows('chamados', q => q.in('status', ['ABERTO', 'EM_ANDAMENTO']))
    ]);
    if ($('#dashCursos')) $('#dashCursos').textContent = cursos;
    if ($('#dashMatriculas')) $('#dashMatriculas').textContent = matriculas;
    if ($('#dashCertificados')) $('#dashCertificados').textContent = certificados;
    if ($('#dashCertPendentes')) $('#dashCertPendentes').textContent = certPendentes;
    if ($('#dashChamados')) $('#dashChamados').textContent = chamados;

    try {
      const { data = [], error } = await sb.from('cursos')
        .select('id,titulo,categoria,carga_horaria,capa_url,publicado,criado_em')
        .order('criado_em', { ascending: false }).limit(5);
      if (error) throw error;
      const list = $('#dashListaCursos');
      if (list) list.innerHTML = data.length ? data.map(c => `
        <button type="button" onclick="abrirAba('cursos')">
          <img src="${escapeHtml(c.capa_url || '../3-img/LOGO.png')}" alt="">
          <span><strong>${escapeHtml(c.titulo)}</strong><small>${escapeHtml(c.categoria || 'SEM CATEGORIA')} · ${c.carga_horaria || 0}h</small></span>
          <em class="${c.publicado ? 'live' : ''}">${c.publicado ? 'Publicado' : 'Rascunho'}</em>
        </button>`).join('') : '<p class="empty-state">Nenhum curso criado ainda.</p>';

      const courseIds = data.map(c => c.id);
      let modules = [], tests = [], materials = [];
      if (courseIds.length) {
        const [m, p, mt] = await Promise.all([
          sb.from('modulos').select('curso_id').in('curso_id', courseIds),
          sb.from('provas').select('curso_id').in('curso_id', courseIds),
          sb.from('materiais').select('curso_id').in('curso_id', courseIds)
        ]);
        modules = m.data || []; tests = p.data || []; materials = mt.data || [];
      }
      const pending = [];
      data.filter(c => !c.publicado).forEach(c => {
        const hasModules = modules.some(m => m.curso_id === c.id);
        const hasTest = tests.some(p => p.curso_id === c.id);
        const hasMaterial = materials.some(m => m.curso_id === c.id);
        if (!c.capa_url) pending.push(`${c.titulo}: adicionar capa`);
        if (!hasModules) pending.push(`${c.titulo}: criar módulos`);
        else if (!hasMaterial) pending.push(`${c.titulo}: anexar conteúdo/PDF`);
        if (!hasTest) pending.push(`${c.titulo}: criar prova`);
      });
      const box = $('#dashPendencias');
      if (box) box.innerHTML = pending.length ? pending.slice(0, 6).map(text => `<button onclick="abrirAba('cursos')"><span>!</span>${escapeHtml(text)}</button>`).join('') : '<div class="all-good">✓ Nenhuma pendência nos cursos recentes.</div>';
    } catch (error) {
      console.warn('Dashboard:', error.message);
    }
  }

  // ---------- Materiais ----------
  async function carregarMateriais() {
    const tbody = $('#tabMateriais tbody');
    if (!tbody || !state.modulo) return;
    tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
    const { data = [], error } = await sb.from('materiais')
      .select('*').eq('modulo_id', state.modulo.id).order('criado_em', { ascending: false });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    tbody.innerHTML = data.length ? data.map(item => `
      <tr>
        <td><span class="material-type">${escapeHtml(item.tipo)}</span></td>
        <td><strong>${escapeHtml(item.titulo)}</strong></td>
        <td><a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener">Abrir material ↗</a></td>
        <td><button type="button" class="btn-mini material-delete" data-id="${item.id}">Excluir</button></td>
      </tr>`).join('') : '<tr><td colspan="4" class="empty-state">Nenhum material neste módulo.</td></tr>';
  }

  function atualizarCampoMaterial() {
    const tipo = $('#fMatTipo')?.value;
    const usaUrl = ['VIDEO', 'LINK'].includes(tipo);
    $('#wrapUrl')?.classList.toggle('hidden', !usaUrl);
    $('#wrapArquivo')?.classList.toggle('hidden', usaUrl);
    if ($('#fMatArquivo')) $('#fMatArquivo').required = !usaUrl;
    if ($('#fMatUrl')) $('#fMatUrl').required = usaUrl;
  }

  async function uploadMaterial(file, cursoId, moduloId) {
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${cursoId}/${moduloId}/${Date.now()}-${safeName}`;
    const { error } = await sb.storage.from(MATERIAL_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return sb.storage.from(MATERIAL_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  window.abrirGestaoMateriais = async function abrirGestaoMateriais(moduloId, moduloTitulo) {
    $('#modalSelecao')?.remove();
    const { data: modulo, error } = await sb.from('modulos').select('id,curso_id,titulo').eq('id', moduloId).single();
    if (error) return toast(`Não foi possível abrir os materiais: ${error.message}`, 'error');
    state.modulo = modulo;
    state.curso = { id: modulo.curso_id };
    if ($('#matModuloTitulo')) $('#matModuloTitulo').textContent = moduloTitulo || modulo.titulo;
    $('#modalMateriais')?.setAttribute('aria-hidden', 'false');
    atualizarCampoMaterial();
    await carregarMateriais();
  };

  async function salvarMaterial(event) {
    event.preventDefault();
    if (!state.modulo) return;
    const button = event.submitter || $('#formMaterial button[type="submit"]');
    const tipo = $('#fMatTipo').value;
    const titulo = $('#fMatNome').value.trim();
    if (!titulo) return toast('Informe o título do material.', 'error');
    setLoading(button, true, 'Enviando...');
    try {
      let url;
      if (['VIDEO', 'LINK'].includes(tipo)) {
        url = $('#fMatUrl').value.trim();
        if (!/^https:\/\//i.test(url)) throw new Error('Use um endereço seguro começando com https://');
      } else {
        const file = $('#fMatArquivo').files[0];
        if (!file) throw new Error('Selecione o arquivo.');
        url = await uploadMaterial(file, state.modulo.curso_id, state.modulo.id);
      }
      const { error } = await sb.from('materiais').insert({
        curso_id: state.modulo.curso_id, modulo_id: state.modulo.id,
        tipo, titulo, url, criado_em: new Date().toISOString()
      });
      if (error) throw error;
      $('#formMaterial').reset();
      atualizarCampoMaterial();
      await carregarMateriais();
      toast('Material adicionado ao módulo.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  async function excluirMaterial(id) {
    if (!confirm('Excluir este material do módulo?')) return;
    const { error } = await sb.from('materiais').delete().eq('id', id);
    if (error) return toast(error.message, 'error');
    await carregarMateriais();
    toast('Material excluído.');
  }

  // ---------- PDF do conteúdo escrito ----------
  async function gerarPdfModulo() {
    const moduloId = Number($('#editar-id')?.value);
    const cursoId = Number($('#editar-course-id')?.value);
    const titulo = $('#editar-titulo')?.value.trim();
    const conteudo = $('#editar-conteudo')?.value.trim();
    if (!moduloId || !cursoId || !titulo || !conteudo) return toast('Preencha o título e o conteúdo do módulo.', 'error');
    if (!window.jspdf?.jsPDF) return toast('Gerador de PDF não carregado.', 'error');
    const button = $('#btnGerarPdfModulo');
    setLoading(button, true, 'Gerando PDF...');
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 18, width = 174;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('INSTITUIÇÃO ALTITUDE', margin, 18);
      doc.setFontSize(15); doc.text(titulo, margin, 30, { maxWidth: width });
      doc.setDrawColor(14, 165, 163); doc.line(margin, 35, 192, 35);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
      const paragraphs = conteudo.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      let y = 44;
      paragraphs.forEach(paragraph => {
        const lines = doc.splitTextToSize(paragraph, width);
        if (y + lines.length * 5.5 > 280) { doc.addPage(); y = 20; }
        doc.text(lines, margin, y); y += lines.length * 5.5 + 4;
      });
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(100);
        doc.text(`Altitude · ${titulo} · Página ${i}/${pages}`, margin, 291);
      }
      const blob = doc.output('blob');
      const file = new File([blob], `${titulo.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`, { type: 'application/pdf' });
      const url = await uploadMaterial(file, cursoId, moduloId);
      const { error: moduleError } = await sb.from('modulos').update({ pdf_url: url, updated_at: new Date().toISOString() }).eq('id', moduloId);
      if (moduleError) throw moduleError;
      const { data: existing } = await sb.from('materiais').select('id').eq('modulo_id', moduloId).eq('tipo', 'PDF').ilike('titulo', `%${titulo}%`).limit(1);
      if (existing?.length) await sb.from('materiais').update({ url, titulo: `Apostila — ${titulo}` }).eq('id', existing[0].id);
      else await sb.from('materiais').insert({ curso_id: cursoId, modulo_id: moduloId, tipo: 'PDF', titulo: `Apostila — ${titulo}`, url });
      $('#editar-pdf-url').value = url;
      toast('PDF gerado e anexado ao módulo.');
    } catch (error) {
      toast(`Erro ao gerar PDF: ${error.message}`, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  // ---------- Publicação com revisão ----------
  async function alternarPublicacaoCurso(courseId, button) {
    setLoading(button, true, 'Verificando...');
    try {
      const [courseRes, modulesRes, testsRes, materialsRes] = await Promise.all([
        sb.from('cursos').select('*').eq('id', courseId).single(),
        sb.from('modulos').select('id,titulo,publicado,conteudo,pdf_url').eq('curso_id', courseId).order('ordem'),
        sb.from('provas').select('id,titulo,modulo_id').eq('curso_id', courseId),
        sb.from('materiais').select('id,modulo_id,tipo').eq('curso_id', courseId)
      ]);

      if (courseRes.error) throw courseRes.error;
      if (modulesRes.error) throw modulesRes.error;
      if (testsRes.error) throw testsRes.error;
      if (materialsRes.error) throw materialsRes.error;

      const course = courseRes.data;
      const modules = modulesRes.data || [];
      const tests = testsRes.data || [];
      const materials = materialsRes.data || [];
      let questionCount = 0;

      if (tests.length) {
        const questionRes = await sb.from('questoes').select('id').in('prova_id', tests.map(test => test.id));
        if (questionRes.error) throw questionRes.error;
        questionCount = questionRes.data?.length || 0;
      }

      if (!course.publicado) {
        const missing = [];
        const modulesWithoutContent = modules.filter(module => {
          const hasWrittenContent = String(module.conteudo || '').trim().length >= 80;
          const hasPdf = Boolean(module.pdf_url) || materials.some(material => material.modulo_id === module.id && material.tipo === 'PDF');
          return !hasWrittenContent && !hasPdf;
        });

        if (!String(course.titulo || '').trim()) missing.push('nome do curso');
        if (!String(course.descricao || '').trim()) missing.push('descrição');
        if (!Number(course.carga_horaria)) missing.push('carga horária');
        if (!course.capa_url) missing.push('foto de capa');
        if (!modules.length) missing.push('ao menos um módulo');
        if (modulesWithoutContent.length) missing.push(`conteúdo ou PDF em ${modulesWithoutContent.length} módulo(s)`);
        if (!materials.length) missing.push('ao menos um material');
        if (!tests.length) missing.push('prova vinculada ao curso');
        if (tests.length && !questionCount) missing.push('questões da prova');

        if (missing.length) {
          throw new Error(`Curso ainda não está pronto. Complete: ${missing.join(', ')}.`);
        }

        const checklist = [
          `✓ ${modules.length} módulo(s)`,
          `✓ ${materials.length} material(is)`,
          `✓ ${tests.length} prova(s)`,
          `✓ ${questionCount} questão(ões)`,
          `✓ ${course.carga_horaria}h de carga horária`
        ].join('\n');

        if (!confirm(`Publicar “${course.titulo}” em Cursos Profissionais?\n\n${checklist}\n\nOs módulos também serão liberados para os alunos matriculados.`)) return;

        const { error: moduleError } = await sb.from('modulos')
          .update({ publicado: true, updated_at: new Date().toISOString() })
          .eq('curso_id', courseId);
        if (moduleError) throw moduleError;

        const { error: proofLinkError } = await sb.from('provas')
          .update({ curso_id: courseId })
          .in('id', tests.map(test => test.id));
        if (proofLinkError) throw proofLinkError;
      } else if (!confirm(`Retirar “${course.titulo}” do catálogo público?\n\nOs alunos já matriculados continuarão com o histórico do curso.`)) {
        return;
      }

      const next = !course.publicado;
      const now = new Date().toISOString();
      const { error } = await sb.from('cursos').update({
        publicado: next,
        publicado_em: next ? now : null,
        revisado_em: next ? now : course.revisado_em
      }).eq('id', courseId);
      if (error) throw error;

      toast(next
        ? 'Curso publicado. Ele já pode aparecer em Cursos Profissionais.'
        : 'Curso retirado do catálogo público.');
      await carregarDashboard();
      window.abrirAba('cursos');
    } catch (error) {
      console.error('Publicação do curso:', error);
      toast(error.message || 'Não foi possível alterar a publicação.', 'error');
    } finally {
      setLoading(button, false);
    }
  }

  // ---------- IA ----------
  async function gerarCursoIA(event) {
    event.preventDefault();
    const button = $('#btnGerarCursoIA');
    const prompt = $('#iaPrompt').value.trim();
    if (!prompt) return;
    setLoading(button, true, 'Criando curso...');
    const resultBox = $('#iaResultado');
    resultBox?.classList.add('hidden');
    try {
      const { data, error } = await sb.functions.invoke('criar-curso-ia', {
        body: {
          prompt,
          carga_horaria: Number($('#iaCarga').value),
          nivel: $('#iaNivel').value,
          quantidade_modulos: Number($('#iaModulos').value),
          quantidade_questoes: Number($('#iaQuestoes').value),
          categoria: $('#iaCategoria').value,
          tipo_curso: $('#iaTipoCurso')?.value || 'PROFISSIONAL',
          gerar_capa: $('#iaGerarCapa').checked
        }
      });
      if (error) throw error;
      if (!data?.curso_id) throw new Error(data?.error || 'A função não retornou o curso criado.');
      if (resultBox) {
        resultBox.innerHTML = `
          <strong>✓ Curso criado como rascunho</strong>
          <p>${escapeHtml(data.titulo || 'Curso')} foi salvo para sua revisão.</p>
          <div class="ia-result-stats">
            <span><b>${Number(data.modulos_criados || data.modulos || 0)}</b> módulos</span>
            <span><b>${Number(data.questoes_criadas || data.questoes || 0)}</b> questões</span>
            <span><b>${data.capa_url ? '✓' : '—'}</b> capa</span>
          </div>
          <small>Revise o texto, os PDFs, a prova e a capa antes de clicar em Publicar.</small>
          <button type="button" id="iaAbrirCurso">Revisar curso agora</button>`;
        resultBox.classList.remove('hidden');
        $('#iaAbrirCurso')?.addEventListener('click', () => window.abrirAba('cursos'));
      }
      toast('Curso criado pela IA e salvo como rascunho.');
    } catch (error) {
      console.error(error);
      const message = error?.message || 'Falha ao gerar o curso.';
      if (resultBox) {
        resultBox.innerHTML = `<strong>Não foi possível usar a IA agora</strong><p>${escapeHtml(message)}</p><small>Você pode continuar sem custo usando “Importar curso por JSON” ou criar o curso manualmente.</small>`;
        resultBox.classList.remove('hidden');
      }
      toast(`IA indisponível: ${message}`, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  async function gerarSomenteCapaIA(courseId = null) {
    const cursoId = Number(courseId || document.querySelector('#modalCurso')?.dataset?.courseId || 0);
    const titulo = document.querySelector('#fCursoNome')?.value?.trim() || document.querySelector('#iaPrompt')?.value?.trim();
    const categoria = document.querySelector('#fCursoArea')?.value || document.querySelector('#iaCategoria')?.value || 'FORMAÇÃO';
    if (!titulo) return toast('Informe primeiro o nome ou tema do curso.', 'error');
    const button = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setLoading(button, true, 'Gerando capa...');
    try {
      const { data, error } = await sb.functions.invoke('criar-curso-ia', {
        body: { modo: 'CAPA_APENAS', curso_id: cursoId || null, titulo, categoria, usar_logo_altitude: true }
      });
      if (error) throw error;
      if (!data?.capa_url) throw new Error(data?.error || 'A função não retornou a imagem da capa.');
      if (document.querySelector('#cursoCapaPreview')) document.querySelector('#cursoCapaPreview').innerHTML = `<img src="${escapeHtml(data.capa_url)}" alt="Capa gerada pela IA">`;
      if (cursoId) await sb.from('cursos').update({ capa_url: data.capa_url }).eq('id', cursoId);
      toast('Capa gerada. Revise a imagem antes de publicar.');
      if (typeof window.carregarCursosCompleto === 'function') await window.carregarCursosCompleto();
    } catch (error) {
      toast(`Não foi possível gerar a capa: ${error.message}. Você pode continuar enviando uma imagem manual.`, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  function validarCursoJson(raw) {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') throw new Error('JSON inválido.');
    if (!String(data.titulo || '').trim()) throw new Error('O JSON precisa conter o campo titulo.');
    if (!Array.isArray(data.modulos) || !data.modulos.length) throw new Error('O JSON precisa conter ao menos um módulo.');
    return data;
  }

  async function importarCursoJson() {
    const input = document.querySelector('#cursoJsonInput');
    const message = document.querySelector('#cursoJsonMensagem');
    const button = document.querySelector('#confirmarImportarCursoJson');
    setLoading(button, true, 'Importando...');
    try {
      const payload = validarCursoJson(input?.value || '');
      const carga = Math.max(5, Math.min(200, Math.round(Number(payload.carga_horaria || 20) / 5) * 5));
      const { data: course, error: courseError } = await sb.from('cursos').insert({
        titulo: String(payload.titulo).trim(),
        descricao: String(payload.descricao || '').trim(),
        categoria: String(payload.categoria || 'FORMAÇÃO').trim().toUpperCase(),
        tipo_curso: String(payload.tipo_curso || 'PROFISSIONAL').trim().toUpperCase(),
        carga_horaria: carga,
        nivel: String(payload.nivel || 'BASICO').toUpperCase(),
        nota_minima: Number(payload.nota_minima || 70),
        capa_url: payload.capa_url || null,
        publicado: false,
        criado_em: new Date().toISOString()
      }).select().single();
      if (courseError) throw courseError;

      const moduleIdMap = [];
      for (let index = 0; index < payload.modulos.length; index += 1) {
        const module = payload.modulos[index] || {};
        const { data: created, error } = await sb.from('modulos').insert({
          curso_id: course.id,
          titulo: String(module.titulo || `Módulo ${index + 1}`).trim(),
          descricao: String(module.descricao || '').trim(),
          conteudo: String(module.conteudo || '').trim(),
          ordem: Number(module.ordem || index + 1),
          pdf_url: module.pdf_url || null,
          video_url: module.video_url || null,
          publicado: false,
          created_at: new Date().toISOString()
        }).select().single();
        if (error) throw error;
        moduleIdMap.push(created.id);
      }

      const prova = payload.prova || {};
      if (Array.isArray(prova.questoes) && prova.questoes.length) {
        const { data: test, error: testError } = await sb.from('provas').insert({
          curso_id: course.id,
          modulo_id: moduleIdMap[moduleIdMap.length - 1] || null,
          titulo: String(prova.titulo || `Avaliação final — ${course.titulo}`),
          criado_em: new Date().toISOString()
        }).select().single();
        if (testError) throw testError;
        const questions = prova.questoes.slice(0, 30).map((q) => ({
          prova_id: test.id,
          enunciado: String(q.enunciado || q.pergunta || '').trim(),
          a: String(q.a || '').trim(), b: String(q.b || '').trim(), c: String(q.c || '').trim(), d: String(q.d || '').trim(),
          correta: String(q.correta || 'A').trim().toUpperCase(),
          explicacao: String(q.explicacao || '').trim() || null
        })).filter((q) => q.enunciado && q.a && q.b && q.c && q.d && ['A','B','C','D'].includes(q.correta));
        if (questions.length) {
          const { error: qError } = await sb.from('questoes').insert(questions);
          if (qError) throw qError;
        }
      }

      if (message) { message.hidden = false; message.textContent = `Curso “${course.titulo}” importado como rascunho com ${moduleIdMap.length} módulo(s).`; }
      toast('Curso importado. Agora revise e publique.');
      if (typeof window.carregarCursosCompleto === 'function') await window.carregarCursosCompleto();
      setTimeout(() => { document.querySelector('#modalImportarCursoJson')?.setAttribute('aria-hidden', 'true'); window.abrirAba('cursos'); }, 900);
    } catch (error) {
      if (message) { message.hidden = false; message.textContent = error.message; }
      toast(`Importação: ${error.message}`, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  function configurarAtualizacaoPeriodicaGestor() {
    if (window.__altitudePollingGestor) return;
    window.__altitudePollingGestor = true;
    let running = false;
    const refresh = async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        const active = document.querySelector('.aba.ativa')?.id;
        if (active === 'cursos' && typeof window.carregarCursosCompleto === 'function') await window.carregarCursosCompleto();
        if (active === 'dashboard') await carregarDashboard();
        if (active === 'alunos' && typeof window.carregarAlunosDoSupabase === 'function') await window.carregarAlunosDoSupabase();
        if (active === 'certificados-gestao') document.querySelector('#btnAtualizarCertificados')?.click();
        if (active === 'chamados') document.querySelector('#chAtualizarLista')?.click();
      } catch (error) {
        console.warn('Atualização periódica da gestão:', error.message);
      } finally {
        running = false;
      }
    };
    window.setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('focus', refresh);
  }

  function configurarTempoRealGestor() {
    if (!window.sb || window.__altitudeRealtimeGestor) return;
    window.__altitudeRealtimeGestor = true;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const active = document.querySelector('.aba.ativa')?.id;
        if (active === 'cursos' && typeof window.carregarCursosCompleto === 'function') await window.carregarCursosCompleto();
        if (active === 'dashboard') await carregarDashboard();
        if (active === 'alunos' && typeof window.carregarAlunosDoSupabase === 'function') await window.carregarAlunosDoSupabase();
        if (active === 'certificados-gestao') document.querySelector('#btnAtualizarCertificados')?.click();
        if (active === 'chamados') document.querySelector('#chAtualizarLista')?.click();
      }, 350);
    };
    const tables = ['cursos','modulos','materiais','provas','questoes','matriculas','alunos','certificados','carteiras_horas_curso','chamados','chamado_interacoes','avaliacoes_cursos'];
    const channel = sb.channel('altitude-gestor-tempo-real');
    tables.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
    channel.subscribe((status) => {
      const indicator = document.querySelector('.status-dot');
      if (indicator) indicator.title = status === 'SUBSCRIBED' ? 'Atualizações em tempo real ativas' : 'Conectando atualizações em tempo real';
    });
  }

  async function wire() {
    const profile = await window.GESTOR_AUTH_READY;
    if (!profile) return;
    const managerName = String(profile.nome || 'GESTOR ALTITUDE').trim().toUpperCase();
    if ($('#gestorNomeAtual')) $('#gestorNomeAtual').textContent = managerName;
    if ($('#gestorIdAtual')) $('#gestorIdAtual').textContent = String(profile.gestor_id || '—').toUpperCase();
    $('#gestorHoje').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());
    if (typeof window.carregarAlunos === 'function') window.carregarAlunos();
    $('#btnMenuGestor')?.addEventListener('click', () => {
      const sidebar = $('#gestorSidebar');
      const opened = !sidebar?.classList.contains('open');
      sidebar?.classList.toggle('open', opened);
      $('#gestorSidebarOverlay')?.classList.toggle('show', opened);
    });
    $('#gestorSidebarOverlay')?.addEventListener('click', () => {
      $('#gestorSidebar')?.classList.remove('open');
      $('#gestorSidebarOverlay')?.classList.remove('show');
    });
    $('#btnSairGestor')?.addEventListener('click', async () => { await sb.auth.signOut(); location.href = '14-login-gestor.html'; });
    $$('.quick-hours button').forEach(btn => btn.addEventListener('click', () => { $('#fCursoHoras').value = btn.dataset.hours; }));
    $('#fCursoCapa')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      const preview = $('#cursoCapaPreview');
      if (!preview || !file) return;
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="Prévia da capa">`;
    });
    $('#fMatTipo')?.addEventListener('change', atualizarCampoMaterial);
    $('#formMaterial')?.addEventListener('submit', salvarMaterial);
    $('#fecharMateriais')?.addEventListener('click', () => $('#modalMateriais')?.setAttribute('aria-hidden', 'true'));
    $('#tabMateriais')?.addEventListener('click', event => {
      const btn = event.target.closest('.material-delete');
      if (btn) excluirMaterial(Number(btn.dataset.id));
    });
    $('#btnGerarPdfModulo')?.addEventListener('click', gerarPdfModulo);
    $('#formCursoIA')?.addEventListener('submit', gerarCursoIA);
    $('#btnGerarSomenteCapaIA')?.addEventListener('click', () => gerarSomenteCapaIA(Number(document.querySelector('#modalCurso')?.dataset?.courseId || 0)));
    $('#btnGerarCapaIAAvulsa')?.addEventListener('click', () => gerarSomenteCapaIA());
    $('#btnImportarCursoJson')?.addEventListener('click', () => $('#modalImportarCursoJson')?.setAttribute('aria-hidden', 'false'));
    $('#fecharImportarCursoJson')?.addEventListener('click', () => $('#modalImportarCursoJson')?.setAttribute('aria-hidden', 'true'));
    $('#confirmarImportarCursoJson')?.addEventListener('click', importarCursoJson);
    document.addEventListener('click', event => {
      const btn = event.target.closest('.gc-publish');
      if (!btn) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const tr = btn.closest('tr[data-id]');
      if (tr) alternarPublicacaoCurso(Number(tr.dataset.id), btn);
    }, true);
    configurarTempoRealGestor();
    carregarDashboard();
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
