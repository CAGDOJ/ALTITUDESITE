(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const esc = (value = '') => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const dateBR = (value, withTime = false) => {
    if (!value) return '—';
    const text = String(value);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' });
  };
  const normal = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const num = (value) => Math.max(0, Number(value || 0));

  const store = {
    certificados: [],
    carteiras: [],
    alunos: new Map(),
    cursos: new Map(),
    filtro: 'TODOS',
    busca: '',
    atual: null,
    carteiraAtual: null
  };

  function badge(status) {
    const value = String(status || 'PENDENTE').toUpperCase();
    const cls = value === 'EMITIDO' ? 'resolvido'
      : value === 'PENDENTE' ? 'media'
      : value === 'BLOQUEADO' ? 'urgente'
      : 'cancelado';
    const label = value === 'PENDENTE' ? 'AGUARDANDO' : value;
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }

  function toast(message, error = false) {
    let node = document.querySelector('.gestor-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'gestor-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.className = `gestor-toast show${error ? ' error' : ''}`;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.className = 'gestor-toast'; }, 3800);
  }

  function carteiraKey(alunoId, cursoId) {
    return `${alunoId}:${Number(cursoId)}`;
  }

  function mapaCarteiras() {
    return new Map(store.carteiras.map((item) => [carteiraKey(item.aluno_id, item.curso_id), item]));
  }

  async function carregarCertificadosGestao() {
    const certBody = byId('tabCertificadosGestao')?.querySelector('tbody');
    const walletBody = byId('tabCarteirasHorasGestao')?.querySelector('tbody');
    if (certBody) certBody.innerHTML = '<tr><td colspan="7">Carregando solicitações...</td></tr>';
    if (walletBody) walletBody.innerHTML = '<tr><td colspan="8">Carregando carteiras...</td></tr>';

    try {
      const [certRes, walletRes] = await Promise.all([
        sb.from('certificados').select('*').order('id', { ascending: false }),
        sb.rpc('obter_carteiras_horas_gestao')
      ]);
      if (certRes.error) throw certRes.error;
      if (walletRes.error) throw walletRes.error;

      store.certificados = certRes.data || [];
      store.carteiras = walletRes.data || [];

      const alunoIds = [...new Set([
        ...store.certificados.map((x) => x.aluno_id),
        ...store.carteiras.map((x) => x.aluno_id)
      ].filter(Boolean))];
      const cursoIds = [...new Set([
        ...store.certificados.map((x) => Number(x.curso_id)),
        ...store.carteiras.map((x) => Number(x.curso_id))
      ].filter(Boolean))];

      const [alunosRes, cursosRes] = await Promise.all([
        alunoIds.length
          ? sb.from('alunos').select('user_id,nome,email,ra').in('user_id', alunoIds)
          : Promise.resolve({ data: [], error: null }),
        cursoIds.length
          ? sb.from('cursos').select('id,titulo,carga_horaria,categoria').in('id', cursoIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      if (alunosRes.error) throw alunosRes.error;
      if (cursosRes.error) throw cursosRes.error;

      store.alunos = new Map((alunosRes.data || []).map((x) => [x.user_id, x]));
      store.cursos = new Map((cursosRes.data || []).map((x) => [Number(x.id), x]));
      renderCarteirasGestao();
      renderCertificadosGestao();
    } catch (error) {
      console.error(error);
      if (certBody) certBody.innerHTML = `<tr><td colspan="7">Erro ao carregar: ${esc(error.message)}</td></tr>`;
      if (walletBody) walletBody.innerHTML = `<tr><td colspan="8">Erro ao carregar: ${esc(error.message)}</td></tr>`;
      toast(`Erro ao carregar certificados: ${error.message}`, true);
    }
  }

  function bateBusca(item, aluno = {}, curso = {}) {
    if (!store.busca) return true;
    const haystack = normal([
      item.aluno_nome, item.aluno_email, item.aluno_ra,
      aluno.nome, aluno.email, aluno.ra,
      item.curso_titulo, curso.titulo,
      item.numero_certificado, item.codigo_validacao
    ].join(' '));
    return haystack.includes(normal(store.busca));
  }

  function renderCarteirasGestao() {
    const tbody = byId('tabCarteirasHorasGestao')?.querySelector('tbody');
    if (!tbody) return;
    const rows = store.carteiras.filter((item) => bateBusca(item));
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8">Nenhum aluno com curso concluído e prova aprovada.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((item) => {
      const exceptional = item.liberacao_excepcional
        ? '<span class="badge urgente">EXCEPCIONAL</span>'
        : '';
      return `<tr>
        <td><div class="cert-admin-student"><strong>${esc(item.aluno_nome || 'Aluno')}</strong><small>RA ${esc(item.aluno_ra || '—')} · ${esc(item.aluno_email || '')}</small></div></td>
        <td><div class="cert-admin-course"><strong>${esc(item.curso_titulo || 'Curso')}</strong><small>Matrícula: ${dateBR(item.matricula_em)}</small></div></td>
        <td><strong>${num(item.horas_automaticas)}h</strong><small class="table-subline">8h por dia útil</small></td>
        <td><strong>${num(item.horas_validadas)}h</strong> ${exceptional}</td>
        <td>${num(item.horas_reservadas)}h</td>
        <td>${num(item.horas_utilizadas)}h</td>
        <td><strong>${num(item.saldo_disponivel)}h</strong></td>
        <td><button type="button" data-wallet-manage="${esc(item.aluno_id)}" data-course-id="${Number(item.curso_id)}">Gerenciar horas</button></td>
      </tr>`;
    }).join('');
  }

  function certificadosFiltrados() {
    return store.certificados.filter((cert) => {
      if (store.filtro !== 'TODOS' && String(cert.status).toUpperCase() !== store.filtro) return false;
      const aluno = store.alunos.get(cert.aluno_id) || {};
      const curso = store.cursos.get(Number(cert.curso_id)) || {};
      return bateBusca(cert, aluno, curso);
    });
  }

  function renderCertificadosGestao() {
    const tbody = byId('tabCertificadosGestao')?.querySelector('tbody');
    if (!tbody) return;
    const all = store.certificados;
    const count = (status) => all.filter((x) => String(x.status).toUpperCase() === status).length;
    if (byId('certKpiPendente')) byId('certKpiPendente').textContent = count('PENDENTE');
    if (byId('certKpiEmitido')) byId('certKpiEmitido').textContent = count('EMITIDO');
    if (byId('certKpiBloqueado')) byId('certKpiBloqueado').textContent = count('BLOQUEADO');
    if (byId('certKpiCancelado')) byId('certKpiCancelado').textContent = count('CANCELADO');
    if (byId('dashCertPendentes')) byId('dashCertPendentes').textContent = count('PENDENTE');

    const rows = certificadosFiltrados();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">Nenhum certificado encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((cert) => {
      const aluno = store.alunos.get(cert.aluno_id) || {};
      const curso = store.cursos.get(Number(cert.curso_id)) || {};
      const status = String(cert.status || 'PENDENTE').toUpperCase();
      const hours = status === 'EMITIDO' ? num(cert.horas_emitidas) : num(cert.horas_solicitadas || cert.horas_emitidas);
      const release = ['PENDENTE', 'BLOQUEADO'].includes(status)
        ? `<button class="release" data-cert-action="LIBERAR" data-id="${cert.id}">${status === 'BLOQUEADO' ? 'Validar e liberar' : `Liberar ${hours}h`}</button>`
        : '';
      const block = status === 'EMITIDO' || status === 'PENDENTE'
        ? `<button class="block" data-cert-action="BLOQUEAR" data-id="${cert.id}">Bloquear</button>`
        : '';
      const reopen = status === 'BLOQUEADO' || status === 'CANCELADO'
        ? `<button data-cert-action="REABRIR" data-id="${cert.id}">Reabrir</button>`
        : '';
      const cancel = status !== 'CANCELADO'
        ? `<button class="cancel" data-cert-action="CANCELAR" data-id="${cert.id}">Cancelar</button>`
        : '';
      const remove = status !== 'EMITIDO'
        ? `<button class="delete-request" data-cert-delete="${cert.id}">Excluir solicitação</button>`
        : '';
      return `<tr>
        <td><div class="cert-admin-student"><strong>${esc(aluno.nome || cert.nome_aluno || 'Aluno')}</strong><small>RA ${esc(aluno.ra || '—')} · ${esc(aluno.email || '')}</small></div></td>
        <td><div class="cert-admin-course"><strong>${esc(curso.titulo || cert.nome_curso || 'Curso')}</strong><small>${esc(cert.numero_certificado || 'Número após a liberação')}</small></div></td>
        <td><strong>${hours}h</strong></td>
        <td>${num(cert.nota_final)}%</td>
        <td>${dateBR(cert.solicitado_em || cert.criado_em)}</td>
        <td>${badge(status)}</td>
        <td><div class="cert-admin-actions"><button data-cert-detail="${cert.id}">Detalhes</button>${release}${block}${reopen}${cancel}${remove}</div></td>
      </tr>`;
    }).join('');
  }

  function preencherOpcoesHoras(select, max, selected) {
    if (!select) return;
    const limit = Math.max(0, Math.floor(num(max) / 5) * 5);
    const current = Math.max(0, Math.floor(num(selected) / 5) * 5);
    const values = [];
    for (let h = 0; h <= limit; h += 5) values.push(h);
    select.innerHTML = values.map((h) => `<option value="${h}"${h === current ? ' selected' : ''}>${h} horas</option>`).join('');
  }

  function atualizarAlertaHoras() {
    const item = store.carteiraAtual;
    const box = byId('horasGestaoAlerta');
    if (!item || !box) return;
    const total = num(byId('horasGestaoTotal')?.value);
    const auto = num(item.horas_automaticas);
    const minimum = num(item.horas_reservadas) + num(item.horas_utilizadas);
    const exceptional = Boolean(byId('horasGestaoExcepcional')?.checked);
    if (total < minimum) {
      box.className = 'hours-manager-alert error';
      box.textContent = `O mínimo atual é ${minimum}h, pois já existem horas reservadas ou utilizadas.`;
    } else if (total > auto && !exceptional) {
      box.className = 'hours-manager-alert warning';
      box.textContent = `O limite automático é ${auto}h. Marque a liberação excepcional e informe a justificativa.`;
    } else if (total > auto) {
      box.className = 'hours-manager-alert warning';
      box.textContent = `Liberação excepcional de ${total}h. A justificativa ficará registrada no histórico.`;
    } else {
      box.className = 'hours-manager-alert ok';
      box.textContent = `Liberação dentro do período acadêmico: até ${auto}h disponíveis pelo cálculo de 8h/dia útil.`;
    }
  }

  function abrirGerenciaHoras(alunoId, cursoId) {
    const item = store.carteiras.find((row) => row.aluno_id === alunoId && Number(row.curso_id) === Number(cursoId));
    if (!item) return toast('Carteira não encontrada.', true);
    store.carteiraAtual = item;
    byId('horasModalTitulo').textContent = `${item.aluno_nome} — ${item.curso_titulo}`;
    byId('horasModalResumo').innerHTML = `
      <article><span>Carga do curso</span><strong>${num(item.carga_curso)}h</strong></article>
      <article><span>Limite automático atual</span><strong>${num(item.horas_automaticas)}h</strong></article>
      <article><span>Horas reservadas</span><strong>${num(item.horas_reservadas)}h</strong></article>
      <article><span>Horas utilizadas</span><strong>${num(item.horas_utilizadas)}h</strong></article>
      <article><span>Saldo disponível</span><strong>${num(item.saldo_disponivel)}h</strong></article>
      <article><span>Matrícula</span><strong>${dateBR(item.matricula_em)}</strong></article>`;
    preencherOpcoesHoras(byId('horasGestaoTotal'), item.carga_curso, item.horas_validadas);
    byId('horasGestaoExcepcional').checked = Boolean(item.liberacao_excepcional);
    byId('horasGestaoJustificativa').value = item.justificativa_gestor || '';
    atualizarAlertaHoras();
    byId('modalHorasGestao').setAttribute('aria-hidden', 'false');
  }

  async function salvarGerenciaHoras(event) {
    event.preventDefault();
    const item = store.carteiraAtual;
    if (!item) return;
    const total = num(byId('horasGestaoTotal').value);
    const exceptional = byId('horasGestaoExcepcional').checked;
    const justification = byId('horasGestaoJustificativa').value.trim();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Salvando...';
    try {
      const { error } = await sb.rpc('gestor_definir_horas_curso', {
        p_aluno_id: item.aluno_id,
        p_curso_id: Number(item.curso_id),
        p_horas_validadas: total,
        p_excepcional: exceptional,
        p_justificativa: justification || null
      });
      if (error) throw error;
      toast(`${total}h validadas para ${item.aluno_nome}.`);
      fecharModalHoras();
      await carregarCertificadosGestao();
    } catch (error) {
      toast(`Não foi possível salvar as horas: ${error.message}`, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Salvar horas';
    }
  }

  async function decidirCertificado(id, action) {
    const cert = store.certificados.find((x) => Number(x.id) === Number(id));
    if (!cert) return;
    const hours = num(cert.horas_solicitadas || cert.horas_emitidas);
    const labels = { LIBERAR: `liberar o certificado de ${hours}h`, BLOQUEAR: 'bloquear', CANCELAR: 'cancelar', REABRIR: 'reabrir' };
    const verb = labels[action] || action.toLowerCase();
    if (!confirm(`Confirma ${verb}?`)) return;
    let observation = '';
    if (action !== 'LIBERAR') observation = prompt('Informe o motivo ou observação para o histórico:', cert.observacao_gestor || '') || '';
    try {
      let result;
      if (action === 'LIBERAR') {
        const wallet = mapaCarteiras().get(carteiraKey(cert.aluno_id, cert.curso_id));
        if (wallet) {
          const automatic = num(wallet.horas_automaticas);
          const requiredTotal = num(wallet.horas_utilizadas) + Math.max(num(wallet.horas_reservadas), hours);
          if (requiredTotal > automatic && !wallet.liberacao_excepcional) {
            if (!confirm(`A carga solicitada ultrapassa o limite automático atual de ${automatic}h. Deseja credenciar excepcionalmente ${requiredTotal}h e liberar este certificado?`)) return;
            const justification = prompt('Informe a justificativa para a liberação excepcional (mínimo 10 caracteres):', 'Carga horária credenciada pela gestão da instituição.') || '';
            if (justification.trim().length < 10) throw new Error('Informe uma justificativa com pelo menos 10 caracteres.');
            const credit = await sb.rpc('gestor_definir_horas_curso', {
              p_aluno_id: cert.aluno_id,
              p_curso_id: Number(cert.curso_id),
              p_horas_validadas: requiredTotal,
              p_excepcional: true,
              p_justificativa: justification.trim()
            });
            if (credit.error) throw credit.error;
          }
        }
        result = await sb.rpc('gestor_liberar_certificado_v14', {
          p_certificado_id: Number(id),
          p_observacao: observation || null
        });
        if (result.error && /gestor_liberar_certificado_v14|function/i.test(result.error.message || '')) {
          result = await sb.rpc('gestor_liberar_certificado_v13', {
            p_certificado_id: Number(id),
            p_observacao: observation || null
          });
        }
      } else {
        result = await sb.rpc('gestor_decidir_certificado', {
          p_certificado_id: Number(id),
          p_acao: action,
          p_observacao: observation || null
        });
      }
      if (result.error) throw result.error;
      if (action === 'LIBERAR') {
        const updated = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!updated || String(updated.status || '').toUpperCase() !== 'EMITIDO') {
          throw new Error('A liberação não confirmou o status EMITIDO no banco. Execute o SQL da V14 e tente novamente.');
        }
        const position = store.certificados.findIndex((item) => Number(item.id) === Number(id));
        if (position >= 0) {
          store.certificados[position] = { ...store.certificados[position], ...updated, status: 'EMITIDO' };
          renderCertificadosGestao();
        }
      }
      toast(action === 'LIBERAR'
        ? `Certificado de ${hours}h liberado. O PDF já está disponível para o aluno.`
        : `Certificado atualizado: ${verb}.`);
      await carregarCertificadosGestao();
      if (action === 'LIBERAR') setTimeout(carregarCertificadosGestao, 900);
      if (byId('modalCertificadoGestao')?.getAttribute('aria-hidden') === 'false') await abrirDetalhesCertificado(id);
    } catch (error) {
      const message = String(error.message || error);
      toast(`Não foi possível ${verb}: ${message}`, true);
      if (/valide primeiro as horas|saldo insuficiente|limite automático|período disponível/i.test(message)) {
        abrirGerenciaHoras(cert.aluno_id, cert.curso_id);
      }
    }
  }

  async function excluirSolicitacao(id) {
    const cert = store.certificados.find((item) => Number(item.id) === Number(id));
    if (!cert) return;
    if (String(cert.status || '').toUpperCase() === 'EMITIDO') {
      return toast('Certificados já emitidos não podem ser excluídos. Use bloquear ou cancelar para manter o histórico.', true);
    }

    const aluno = store.alunos.get(cert.aluno_id) || {};
    const curso = store.cursos.get(Number(cert.curso_id)) || {};
    const horas = num(cert.horas_solicitadas || cert.horas_emitidas);
    const nome = aluno.nome || cert.nome_aluno || 'Aluno';
    const titulo = curso.titulo || cert.nome_curso || 'Curso';
    const motivo = prompt(`Informe o motivo da exclusão da solicitação de ${horas}h de ${nome} no curso ${titulo}:`, 'Solicitação excluída pela gestão.');
    if (motivo === null) return;
    if (!motivo.trim()) return toast('Informe o motivo da exclusão para o registro administrativo.', true);
    if (!confirm('Excluir definitivamente esta solicitação? Se houver horas reservadas, elas voltarão ao saldo do aluno.')) return;

    try {
      const { data, error } = await sb.rpc('gestor_excluir_solicitacao_certificado', {
        p_certificado_id: Number(id),
        p_motivo: motivo.trim()
      });
      if (error) throw error;
      fecharModalCertificado();
      toast(`${data?.horas_devolvidas || 0}h devolvidas ao saldo. Solicitação excluída.`);
      await carregarCertificadosGestao();
    } catch (error) {
      toast(`Não foi possível excluir a solicitação: ${error.message}`, true);
    }
  }

  async function abrirDetalhesCertificado(id) {
    const cert = store.certificados.find((x) => Number(x.id) === Number(id));
    if (!cert) return;
    store.atual = cert;
    const aluno = store.alunos.get(cert.aluno_id) || {};
    const curso = store.cursos.get(Number(cert.curso_id)) || {};
    const wallet = mapaCarteiras().get(carteiraKey(cert.aluno_id, cert.curso_id)) || {};
    const requested = num(cert.horas_solicitadas || cert.horas_emitidas);
    byId('certModalTitulo').textContent = `${aluno.nome || cert.nome_aluno || 'Aluno'} — ${curso.titulo || cert.nome_curso || 'Curso'}`;
    byId('certModalResumo').innerHTML = `
      <article><span>Status</span><strong>${badge(cert.status)}</strong></article>
      <article><span>RA</span><strong>${esc(aluno.ra || '—')}</strong></article>
      <article><span>Horas solicitadas</span><strong>${requested} horas</strong></article>
      <article><span>Horas emitidas</span><strong>${num(cert.horas_emitidas)} horas</strong></article>
      <article><span>Saldo disponível</span><strong>${num(wallet.saldo_disponivel)} horas</strong></article>
      <article><span>Nota final</span><strong>${num(cert.nota_final)}%</strong></article>
      <article><span>Solicitação</span><strong>${dateBR(cert.solicitado_em || cert.criado_em, true)}</strong></article>
      <article><span>Emissão</span><strong>${dateBR(cert.emitido_em, true)}</strong></article>
      <article><span>Período</span><strong>${cert.periodo_inicio ? `${dateBR(cert.periodo_inicio)} a ${dateBR(cert.periodo_fim)}` : 'Definido na liberação'}</strong></article>
      <article><span>Número</span><strong>${esc(cert.numero_certificado || 'Aguardando emissão')}</strong></article>
      <article><span>Código</span><strong>${esc(cert.codigo_validacao || 'Aguardando emissão')}</strong></article>
      <article><span>Observação</span><strong>${esc(cert.observacao_gestor || '—')}</strong></article>`;

    const status = String(cert.status).toUpperCase();
    byId('certModalAcoes').innerHTML = `
      ${['PENDENTE', 'BLOQUEADO'].includes(status) ? `<button class="release" data-cert-action="LIBERAR" data-id="${cert.id}">${status === 'BLOQUEADO' ? 'Validar e liberar certificado' : `Liberar certificado de ${requested}h`}</button>` : ''}
      ${status === 'PENDENTE' || status === 'EMITIDO' ? `<button class="block" data-cert-action="BLOQUEAR" data-id="${cert.id}">Bloquear</button>` : ''}
      ${status === 'BLOQUEADO' || status === 'CANCELADO' ? `<button data-cert-action="REABRIR" data-id="${cert.id}">Reabrir</button>` : ''}
      ${status !== 'CANCELADO' ? `<button class="cancel" data-cert-action="CANCELAR" data-id="${cert.id}">Cancelar</button>` : ''}
      ${status !== 'EMITIDO' ? `<button class="delete-request" data-cert-delete="${cert.id}">Excluir solicitação</button>` : ''}
      ${cert.codigo_validacao ? `<a class="topbar-link" href="8-certificados.html?codigo=${encodeURIComponent(cert.codigo_validacao)}" target="_blank">Abrir validação pública</a>` : ''}`;

    const { data, error } = await sb.from('certificados_historico').select('*').eq('certificado_id', Number(id)).order('criado_em', { ascending: false });
    byId('certModalHistorico').innerHTML = error
      ? `<div class="empty-state">${esc(error.message)}</div>`
      : (data || []).map((item) => `
        <div class="cert-history-row"><span class="cert-history-dot"></span><div><strong>${esc(String(item.acao || 'ATUALIZAÇÃO').replaceAll('_', ' '))}</strong><span>${esc(item.status_anterior || '—')} → ${esc(item.status_novo || '—')}${item.observacao ? ` · ${esc(item.observacao)}` : ''}</span></div><small>${dateBR(item.criado_em, true)}</small></div>`).join('') || '<div class="empty-state">Sem histórico.</div>';
    byId('modalCertificadoGestao').setAttribute('aria-hidden', 'false');
  }

  function fecharModalCertificado() {
    byId('modalCertificadoGestao')?.setAttribute('aria-hidden', 'true');
  }

  function fecharModalHoras() {
    byId('modalHorasGestao')?.setAttribute('aria-hidden', 'true');
    store.carteiraAtual = null;
  }

  async function wire() {
    const profile = await window.GESTOR_AUTH_READY;
    if (!profile || Number(profile.nivel_acesso || 1) < 2) return;

    const previous = window.abrirAba;
    window.abrirAba = function abrirAbaComCertificados(id) {
      previous?.(id);
      if (id === 'certificados-gestao') carregarCertificadosGestao();
    };

    byId('certBusca')?.addEventListener('input', (event) => {
      store.busca = event.target.value;
      renderCarteirasGestao();
      renderCertificadosGestao();
    });
    byId('certFiltroStatus')?.addEventListener('change', (event) => {
      store.filtro = event.target.value;
      renderCertificadosGestao();
    });
    byId('btnAtualizarCertificados')?.addEventListener('click', carregarCertificadosGestao);
    byId('certFecharModal')?.addEventListener('click', fecharModalCertificado);
    byId('horasFecharModal')?.addEventListener('click', fecharModalHoras);
    byId('horasCancelar')?.addEventListener('click', fecharModalHoras);
    byId('formGerenciarHoras')?.addEventListener('submit', salvarGerenciaHoras);
    byId('horasGestaoTotal')?.addEventListener('change', atualizarAlertaHoras);
    byId('horasGestaoExcepcional')?.addEventListener('change', atualizarAlertaHoras);
    byId('modalCertificadoGestao')?.addEventListener('click', (event) => {
      if (event.target.id === 'modalCertificadoGestao') fecharModalCertificado();
    });
    byId('modalHorasGestao')?.addEventListener('click', (event) => {
      if (event.target.id === 'modalHorasGestao') fecharModalHoras();
    });

    document.addEventListener('click', (event) => {
      const detail = event.target.closest('[data-cert-detail]');
      if (detail) abrirDetalhesCertificado(Number(detail.dataset.certDetail));
      const action = event.target.closest('[data-cert-action]');
      if (action) decidirCertificado(Number(action.dataset.id), action.dataset.certAction);
      const remove = event.target.closest('[data-cert-delete]');
      if (remove) excluirSolicitacao(Number(remove.dataset.certDelete));
      const wallet = event.target.closest('[data-wallet-manage]');
      if (wallet) abrirGerenciaHoras(wallet.dataset.walletManage, Number(wallet.dataset.courseId));
    });

    carregarCertificadosGestao();
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
