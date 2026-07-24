(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const state = {
    gestores: [],
    gestorEditando: null,
    chamados: [],
    chamadoAtual: null,
    alunos: new Map(),
    carregandoChamados: false
  };

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function toast(message, type = 'ok') {
    let el = $('#gestorToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gestorToast';
      document.body.appendChild(el);
    }
    el.className = `gestor-toast ${type} show`;
    el.textContent = message;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function showModal(selector, show = true) {
    const modal = $(selector);
    if (!modal) return;
    modal.setAttribute('aria-hidden', show ? 'false' : 'true');
    modal.classList.toggle('is-open', show);
    if (show) {
      modal.removeAttribute('inert');
      requestAnimationFrame(() => modal.querySelector('button, input, select, textarea')?.focus({ preventScroll: true }));
    } else {
      modal.setAttribute('inert', '');
    }
    document.body.classList.toggle('gestor-modal-open', Boolean($('.modal[aria-hidden="false"]')));
  }

  const dateBR = (value) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
  };

  const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const badge = (value) => {
    const safe = String(value || '—');
    return `<span class="badge ${safe.toLowerCase().replaceAll('_', '-')}">${escapeHtml(safe.replaceAll('_', ' '))}</span>`;
  };

  // ---------------------------------------------------------------------------
  // EQUIPE E ACESSOS
  // ---------------------------------------------------------------------------
  function permissions(level) {
    const map = {
      1: ['Consultar alunos e chamados atribuídos'],
      2: ['Tudo do nível 1', 'Criar e editar conteúdos e provas'],
      3: ['Tudo do nível 2', 'Publicar cursos e acompanhar certificados'],
      4: ['Acesso completo', 'Criar e bloquear usuários da equipe']
    };
    return map[Number(level)] || map[1];
  }

  function updatePermissions() {
    const list = $('#guPermissoes');
    if (!list) return;
    list.innerHTML = permissions($('#guNivel')?.value)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
  }

  async function loadManagers() {
    const { data, error } = await sb.from('gestores').select('*').order('criado_em', { ascending: false });
    if (error) {
      toast(`Equipe: ${error.message}`, 'error');
      return;
    }
    state.gestores = data || [];
    renderManagers();
  }

  function filteredManagers() {
    const q = normalize($('#guBusca')?.value);
    const role = $('#guFiltroCargo')?.value || 'TODOS';
    const status = $('#guFiltroStatus')?.value || 'TODOS';
    return state.gestores.filter((item) => {
      const hit = !q || normalize(`${item.gestor_id} ${item.nome} ${item.email}`).includes(q);
      return hit && (role === 'TODOS' || item.cargo === role) && (status === 'TODOS' || item.status === status);
    });
  }

  function renderManagers() {
    const tbody = $('#tabUsuarios tbody');
    if (!tbody) return;
    const rows = filteredManagers();
    tbody.innerHTML = rows.length ? rows.map((item) => `
      <tr data-user-id="${escapeHtml(item.user_id)}">
        <td><strong>${escapeHtml(item.gestor_id)}</strong></td>
        <td>${escapeHtml(item.nome)}</td>
        <td>${escapeHtml(item.email)}</td>
        <td>${escapeHtml(item.cargo)}</td>
        <td>${Number(item.nivel_acesso)}</td>
        <td>${badge(item.status)}</td>
        <td class="col-acoes">
          <button type="button" class="btn-mini manager-edit">Editar</button>
          <button type="button" class="btn-mini manager-toggle">${item.status === 'ATIVO' ? 'Inativar' : 'Ativar'}</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty-state">Nenhum usuário encontrado.</td></tr>';
  }

  function openNewManager() {
    state.gestorEditando = null;
    $('#formUsuario')?.reset();
    if ($('#guTitulo')) $('#guTitulo').textContent = 'Novo acesso da equipe';
    if ($('#guStatus')) $('#guStatus').value = 'ATIVO';
    if ($('#guCargo')) $('#guCargo').value = 'COLABORADOR';
    if ($('#guNivel')) $('#guNivel').value = '1';
    if ($('#guId')) $('#guId').value = '';
    if ($('#guSenha')) $('#guSenha').required = true;
    updatePermissions();
    showModal('#modalUsuario', true);
  }

  function openEditManager(item) {
    state.gestorEditando = item;
    if ($('#guTitulo')) $('#guTitulo').textContent = `Editar ${item.gestor_id}`;
    $('#guNome').value = item.nome || '';
    $('#guEmail').value = item.email || '';
    $('#guGestorId').value = item.gestor_id || '';
    $('#guSenha').value = '';
    $('#guSenha').required = false;
    $('#guTel').value = item.telefone || '';
    $('#guStatus').value = item.status || 'ATIVO';
    $('#guCargo').value = item.cargo || 'COLABORADOR';
    $('#guNivel').value = String(item.nivel_acesso || 1);
    $('#guId').value = item.user_id || '';
    if ($('#acColab')) $('#acColab').checked = Number(item.nivel_acesso) >= 1;
    if ($('#acProf')) $('#acProf').checked = Number(item.nivel_acesso) >= 2;
    if ($('#acCoord')) $('#acCoord').checked = Number(item.nivel_acesso) >= 3;
    if ($('#acGestor')) $('#acGestor').checked = Number(item.nivel_acesso) >= 4;
    updatePermissions();
    showModal('#modalUsuario', true);
  }

  async function saveManager(event) {
    event.preventDefault();
    const button = event.submitter;
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Salvando...';
    try {
      const payload = {
        acao: state.gestorEditando ? 'atualizar' : 'criar',
        user_id: state.gestorEditando?.user_id,
        gestor_id: $('#guGestorId').value.trim().toUpperCase(),
        nome: $('#guNome').value.trim(),
        email: $('#guEmail').value.trim().toLowerCase(),
        senha: $('#guSenha').value,
        telefone: $('#guTel').value.trim() || null,
        status: $('#guStatus').value,
        cargo: $('#guCargo').value,
        nivel_acesso: Number($('#guNivel').value)
      };
      const { data, error } = await sb.functions.invoke('gerenciar-gestor', { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'A operação não foi concluída.');
      showModal('#modalUsuario', false);
      toast(state.gestorEditando ? 'Acesso atualizado.' : 'Novo acesso criado.');
      await loadManagers();
    } catch (error) {
      toast(`Acesso: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Salvar';
    }
  }

  async function toggleManager(item) {
    if (item.user_id === window.GESTOR_ATUAL?.user_id && item.status === 'ATIVO') {
      toast('Você não pode inativar o próprio acesso.', 'error');
      return;
    }
    const next = item.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    const { data, error } = await sb.functions.invoke('gerenciar-gestor', {
      body: { acao: 'atualizar', ...item, user_id: item.user_id, status: next }
    });
    if (error || !data?.ok) {
      toast(data?.error || error?.message || 'Falha ao alterar acesso.', 'error');
      return;
    }
    toast(`Acesso ${next === 'ATIVO' ? 'ativado' : 'inativado'}.`);
    await loadManagers();
  }

  function exportManagers() {
    const data = filteredManagers();
    const csv = [
      'ID;Nome;E-mail;Cargo;Nível;Status',
      ...data.map((item) => [item.gestor_id, item.nome, item.email, item.cargo, item.nivel_acesso, item.status]
        .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
        .join(';'))
    ].join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'equipe-altitude.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // CHAMADOS
  // ---------------------------------------------------------------------------
  const slaHours = { URGENTE: 4, ALTA: 12, MEDIA: 24, BAIXA: 48 };

  function dueDate(item) {
    const date = new Date(item.criado_em);
    date.setHours(date.getHours() + (slaHours[item.prioridade] || 24));
    return date;
  }

  function slaLabel(item) {
    if (['RESOLVIDO', 'CANCELADO'].includes(item.status)) {
      return '<span class="sla-chip ok">Finalizado</span>';
    }
    const hours = Math.ceil((dueDate(item) - Date.now()) / 3600000);
    return hours < 0
      ? `<span class="sla-chip late">Atrasado ${Math.abs(hours)}h</span>`
      : `<span class="sla-chip">${hours}h restantes</span>`;
  }

  function normalizeRpcArray(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.chamados)) return data.chamados;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  }

  async function loadTickets() {
    if (state.carregandoChamados) return;
    state.carregandoChamados = true;
    const tbody = $('#tabChamados tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Carregando chamados...</td></tr>';

    try {
      const rpc = await sb.rpc('gestor_listar_chamados');
      if (!rpc.error) {
        state.chamados = normalizeRpcArray(rpc.data);
        state.alunos.clear();
        state.chamados.forEach((item) => {
          if (!item.aluno_id) return;
          state.alunos.set(item.aluno_id, {
            user_id: item.aluno_id,
            nome: item.aluno_nome,
            email: item.aluno_email,
            ra: item.aluno_ra
          });
        });
        renderTickets();
        return;
      }

      // Compatibilidade com bancos que ainda não receberam a atualização 08.
      const { data, error } = await sb.from('chamados').select('*').order('criado_em', { ascending: false });
      if (error) throw error;
      state.chamados = data || [];
      const ids = [...new Set(state.chamados.map((item) => item.aluno_id).filter(Boolean))];
      state.alunos.clear();
      if (ids.length) {
        const { data: students, error: studentError } = await sb
          .from('alunos')
          .select('user_id,nome,email,ra')
          .in('user_id', ids);
        if (!studentError) (students || []).forEach((student) => state.alunos.set(student.user_id, student));
      }
      renderTickets();
    } catch (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="empty-state error-state">Não foi possível carregar os chamados: ${escapeHtml(error.message)}</td></tr>`;
      toast(`Chamados: ${error.message}`, 'error');
    } finally {
      state.carregandoChamados = false;
    }
  }

  function filteredTickets() {
    const q = normalize($('#chBusca')?.value);
    const status = $('#chFiltroStatus')?.value || 'TODOS';
    const priority = $('#chFiltroPrioridade')?.value || 'TODAS';
    const days = Number($('#chPeriodo')?.value || 365);
    const cutoff = Date.now() - days * 86400000;
    return state.chamados.filter((item) => {
      const student = state.alunos.get(item.aluno_id) || {};
      const hit = !q || normalize(`${item.protocolo} ${student.nome} ${student.ra} ${item.assunto}`).includes(q);
      return hit
        && (status === 'TODOS' || item.status === status)
        && (priority === 'TODAS' || item.prioridade === priority)
        && new Date(item.criado_em).getTime() >= cutoff;
    });
  }

  function renderTickets() {
    const rows = filteredTickets();
    const tbody = $('#tabChamados tbody');
    if (!tbody) return;
    const pending = rows.filter((item) => ['ABERTO', 'EM_ANDAMENTO'].includes(item.status));
    if ($('#chPendentes')) $('#chPendentes').textContent = pending.length;
    if ($('#chResolvidos')) $('#chResolvidos').textContent = rows.filter((item) => item.status === 'RESOLVIDO').length;
    if ($('#chAtrasados')) $('#chAtrasados').textContent = pending.filter((item) => dueDate(item).getTime() < Date.now()).length;

    tbody.innerHTML = rows.length ? rows.map((item) => {
      const student = state.alunos.get(item.aluno_id) || {};
      return `
        <tr data-ticket-id="${escapeHtml(item.id)}">
          <td data-label="Protocolo"><strong>${escapeHtml(item.protocolo || `#${item.id}`)}</strong></td>
          <td data-label="Aluno">${escapeHtml(student.nome || 'Aluno')}</td>
          <td data-label="Assunto">${escapeHtml(item.assunto || 'Sem assunto')}</td>
          <td data-label="Prioridade">${badge(item.prioridade || 'MEDIA')}</td>
          <td data-label="Criado">${dateBR(item.criado_em).split(' ')[0]}</td>
          <td data-label="Prazo">${dateBR(dueDate(item)).split(' ')[0]}</td>
          <td data-label="Status">${badge(item.status || 'ABERTO')}</td>
          <td data-label="SLA">${slaLabel(item)}</td>
          <td data-label="Ações">
            <button type="button" class="btn-mini ticket-open" data-ticket-open-id="${escapeHtml(item.id)}" aria-label="Abrir chamado ${escapeHtml(item.protocolo || item.id)}">
              Abrir chamado
            </button>
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="9" class="empty-state">Nenhum chamado encontrado no período selecionado.</td></tr>';
  }

  function fillTicketModal(item) {
    const student = state.alunos.get(item.aluno_id) || {
      nome: item.aluno_nome,
      email: item.aluno_email,
      ra: item.aluno_ra
    };
    if ($('#chModalTitulo')) $('#chModalTitulo').textContent = item.assunto || 'Chamado';
    if ($('#chProto')) $('#chProto').textContent = item.protocolo || `#${item.id}`;
    if ($('#chAluno')) $('#chAluno').textContent = student.nome || 'Aluno';
    if ($('#chEmail')) $('#chEmail').textContent = student.email || student.ra || '—';
    if ($('#chAssunto')) $('#chAssunto').textContent = item.assunto || '—';
    if ($('#chCategoria')) $('#chCategoria').textContent = item.categoria || 'OUTRO';
    if ($('#chCriado')) $('#chCriado').textContent = dateBR(item.criado_em);
    if ($('#chPrazo')) $('#chPrazo').textContent = dateBR(dueDate(item));
    if ($('#chSLAChip')) $('#chSLAChip').innerHTML = slaLabel(item);
    if ($('#chDescricao')) $('#chDescricao').textContent = item.mensagem || '';
    if ($('#chPrioridadeGestor')) $('#chPrioridadeGestor').value = item.prioridade || 'MEDIA';
    if ($('#chStatusGestor')) $('#chStatusGestor').value = item.status || 'ABERTO';
  }

  async function openTicket(item) {
    if (!item) {
      toast('Chamado não encontrado. Atualize a lista e tente novamente.', 'error');
      return;
    }
    state.chamadoAtual = item;
    fillTicketModal(item);
    showModal('#modalChamado', true);
    await loadInteractions(item.id);
  }

  async function loadInteractions(ticketId) {
    const box = $('#chHistorico');
    if (!box) return;
    box.innerHTML = '<p class="empty-state">Carregando histórico...</p>';

    try {
      const rpc = await sb.rpc('gestor_detalhar_chamado', { p_chamado_id: Number(ticketId) });
      if (!rpc.error && rpc.data) {
        const detail = rpc.data;
        if (detail.chamado) {
          state.chamadoAtual = { ...state.chamadoAtual, ...detail.chamado };
          if (detail.aluno && state.chamadoAtual.aluno_id) {
            state.alunos.set(state.chamadoAtual.aluno_id, detail.aluno);
          }
          fillTicketModal(state.chamadoAtual);
        }
        renderInteractions(detail.interacoes || []);
        return;
      }

      const { data, error } = await sb
        .from('chamado_interacoes')
        .select('*')
        .eq('chamado_id', ticketId)
        .order('criado_em');
      if (error) throw error;
      renderInteractions(data || []);
    } catch (error) {
      box.innerHTML = `<p class="empty-state error-state">Não foi possível abrir o histórico: ${escapeHtml(error.message)}</p>`;
    }
  }

  function renderInteractions(interactions) {
    const box = $('#chHistorico');
    if (!box) return;
    box.innerHTML = interactions.length ? interactions.map((interaction) => {
      const authorType = String(interaction.autor_tipo || 'GESTOR').toLowerCase();
      return `
        <div class="history-message ${escapeHtml(authorType)}">
          <strong>${interaction.autor_tipo === 'GESTOR' ? 'Equipe Altitude' : 'Aluno'}</strong>
          <p>${escapeHtml(interaction.mensagem || '')}</p>
          <small>${dateBR(interaction.criado_em)}</small>
        </div>`;
    }).join('') : '<p class="empty-state">Ainda não há respostas neste chamado.</p>';
  }

  async function saveTicketClassification() {
    if (!state.chamadoAtual) return;
    const button = $('#chSalvarClassificacao');
    if (button) {
      button.disabled = true;
      button.textContent = 'Salvando...';
    }
    try {
      const payload = {
        p_chamado_id: Number(state.chamadoAtual.id),
        p_prioridade: $('#chPrioridadeGestor').value,
        p_status: $('#chStatusGestor').value
      };
      const rpc = await sb.rpc('gestor_atualizar_chamado', payload);
      if (rpc.error) {
        const fallback = await sb.from('chamados').update({
          prioridade: payload.p_prioridade,
          status: payload.p_status,
          prioridade_definida_por: window.GESTOR_ATUAL?.user_id,
          atualizado_em: new Date().toISOString(),
          resolvido_em: payload.p_status === 'RESOLVIDO' ? new Date().toISOString() : null
        }).eq('id', state.chamadoAtual.id);
        if (fallback.error) throw fallback.error;
      }
      toast('Prioridade e status atualizados.');
      await loadTickets();
      state.chamadoAtual = state.chamados.find((item) => Number(item.id) === Number(payload.p_chamado_id)) || state.chamadoAtual;
      fillTicketModal(state.chamadoAtual);
    } catch (error) {
      toast(`Chamado: ${error.message}`, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Salvar prioridade e status';
      }
    }
  }

  async function replyTicket(event) {
    event.preventDefault();
    if (!state.chamadoAtual) return;
    const message = $('#chResposta').value.trim();
    if (!message) {
      toast('Escreva uma resposta.', 'error');
      return;
    }
    const action = $('#chAcaoRapida').value;
    const button = event.submitter;
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Enviando...';

    try {
      const rpc = await sb.rpc('gestor_responder_chamado', {
        p_chamado_id: Number(state.chamadoAtual.id),
        p_mensagem: message,
        p_acao: action
      });

      if (rpc.error) {
        const status = action === 'RESP_RESOLVER'
          ? 'RESOLVIDO'
          : action === 'RESP_E_ANDAMENTO'
            ? 'EM_ANDAMENTO'
            : state.chamadoAtual.status;
        const interaction = await sb.from('chamado_interacoes').insert({
          chamado_id: state.chamadoAtual.id,
          autor_id: window.GESTOR_ATUAL?.user_id,
          autor_tipo: 'GESTOR',
          mensagem: message
        });
        if (interaction.error) throw interaction.error;
        const update = await sb.from('chamados').update({
          status,
          ultima_resposta: message,
          respondido_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
          resolvido_em: status === 'RESOLVIDO' ? new Date().toISOString() : null
        }).eq('id', state.chamadoAtual.id);
        if (update.error) throw update.error;
      }

      $('#chResposta').value = '';
      toast('Resposta registrada.');
      await loadInteractions(state.chamadoAtual.id);
      await loadTickets();
    } catch (error) {
      toast(`Resposta: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Enviar';
    }
  }

  function bindTicketEvents() {
    if (document.documentElement.dataset.ticketEventsBound === '1') return;
    document.documentElement.dataset.ticketEventsBound = '1';

    document.addEventListener('click', (event) => {
      const openButton = event.target.closest('[data-ticket-open-id], .ticket-open');
      if (openButton) {
        event.preventDefault();
        const id = Number(openButton.dataset.ticketOpenId || openButton.closest('tr[data-ticket-id]')?.dataset.ticketId);
        const item = state.chamados.find((ticket) => Number(ticket.id) === id);
        openTicket(item);
        return;
      }

      if (event.target.matches('#modalChamado[aria-hidden="false"]')) {
        showModal('#modalChamado', false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && $('#modalChamado[aria-hidden="false"]')) {
        showModal('#modalChamado', false);
      }
    });
  }

  async function wire() {
    const profile = await window.GESTOR_AUTH_READY;
    if (!profile) return;

    bindTicketEvents();

    $('#gestorSidebarOverlay')?.addEventListener('click', () => $('#gestorSidebar')?.classList.remove('open'));
    $('#guNovo')?.addEventListener('click', openNewManager);
    $('#guCancelar')?.addEventListener('click', () => showModal('#modalUsuario', false));
    $('#formUsuario')?.addEventListener('submit', saveManager);
    $('#guNivel')?.addEventListener('change', updatePermissions);
    ['guBusca', 'guFiltroCargo', 'guFiltroStatus'].forEach((id) => {
      $(id)?.addEventListener(id === 'guBusca' ? 'input' : 'change', renderManagers);
    });
    $('#guExport')?.addEventListener('click', exportManagers);
    $('#tabUsuarios')?.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-user-id]');
      if (!row) return;
      const item = state.gestores.find((manager) => manager.user_id === row.dataset.userId);
      if (!item) return;
      if (event.target.closest('.manager-edit')) openEditManager(item);
      if (event.target.closest('.manager-toggle')) toggleManager(item);
    });

    ['chBusca', 'chFiltroStatus', 'chFiltroPrioridade', 'chPeriodo'].forEach((id) => {
      $(id)?.addEventListener(id === 'chBusca' ? 'input' : 'change', renderTickets);
    });
    $('#chSalvarClassificacao')?.addEventListener('click', saveTicketClassification);
    $('#formResposta')?.addEventListener('submit', replyTicket);
    $('#chFecharModal')?.addEventListener('click', () => showModal('#modalChamado', false));
    $('#chFecharModalTopo')?.addEventListener('click', () => showModal('#modalChamado', false));
    $('#chAtualizarLista')?.addEventListener('click', loadTickets);

    await Promise.allSettled([loadManagers(), loadTickets()]);
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
