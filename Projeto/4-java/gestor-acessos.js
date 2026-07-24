(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = { gestores: [], gestorEditando: null, chamados: [], chamadoAtual: null, alunos: new Map() };
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function toast(message, type = 'ok') {
    let el = $('#gestorToast');
    if (!el) { el = document.createElement('div'); el.id = 'gestorToast'; document.body.appendChild(el); }
    el.className = `gestor-toast ${type} show`; el.textContent = message;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function showModal(id, show = true) { $(id)?.setAttribute('aria-hidden', show ? 'false' : 'true'); }
  const dateBR = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const badge = value => `<span class="badge ${String(value).toLowerCase().replaceAll('_','-')}">${escapeHtml(String(value).replaceAll('_',' '))}</span>`;

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
    const list = $('#guPermissoes'); if (!list) return;
    list.innerHTML = permissions($('#guNivel')?.value).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  }

  async function loadManagers() {
    const { data, error } = await sb.from('gestores').select('*').order('criado_em', { ascending: false });
    if (error) return toast(`Equipe: ${error.message}`, 'error');
    state.gestores = data || [];
    renderManagers();
  }

  function filteredManagers() {
    const q = normalize($('#guBusca')?.value);
    const role = $('#guFiltroCargo')?.value || 'TODOS';
    const status = $('#guFiltroStatus')?.value || 'TODOS';
    return state.gestores.filter(item => {
      const hit = !q || normalize(`${item.gestor_id} ${item.nome} ${item.email}`).includes(q);
      return hit && (role === 'TODOS' || item.cargo === role) && (status === 'TODOS' || item.status === status);
    });
  }

  function renderManagers() {
    const tbody = $('#tabUsuarios tbody'); if (!tbody) return;
    const rows = filteredManagers();
    tbody.innerHTML = rows.length ? rows.map(item => `
      <tr data-user-id="${escapeHtml(item.user_id)}">
        <td><strong>${escapeHtml(item.gestor_id)}</strong></td>
        <td>${escapeHtml(item.nome)}</td>
        <td>${escapeHtml(item.email)}</td>
        <td>${escapeHtml(item.cargo)}</td>
        <td>${Number(item.nivel_acesso)}</td>
        <td>${badge(item.status)}</td>
        <td class="col-acoes"><button type="button" class="btn-mini manager-edit">Editar</button><button type="button" class="btn-mini manager-toggle">${item.status === 'ATIVO' ? 'Inativar' : 'Ativar'}</button></td>
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
    updatePermissions(); showModal('#modalUsuario', true);
  }

  function openEditManager(item) {
    state.gestorEditando = item;
    if ($('#guTitulo')) $('#guTitulo').textContent = `Editar ${item.gestor_id}`;
    $('#guNome').value = item.nome || '';
    $('#guEmail').value = item.email || '';
    $('#guGestorId').value = item.gestor_id || '';
    $('#guSenha').value = ''; $('#guSenha').required = false;
    $('#guTel').value = item.telefone || '';
    $('#guStatus').value = item.status || 'ATIVO';
    $('#guCargo').value = item.cargo || 'COLABORADOR';
    $('#guNivel').value = String(item.nivel_acesso || 1);
    $('#guId').value = item.user_id || '';
    $('#acColab').checked = Number(item.nivel_acesso) >= 1;
    $('#acProf').checked = Number(item.nivel_acesso) >= 2;
    $('#acCoord').checked = Number(item.nivel_acesso) >= 3;
    $('#acGestor').checked = Number(item.nivel_acesso) >= 4;
    updatePermissions(); showModal('#modalUsuario', true);
  }

  async function saveManager(event) {
    event.preventDefault();
    const button = event.submitter; button.disabled = true; button.textContent = 'Salvando...';
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
      showModal('#modalUsuario', false); toast(state.gestorEditando ? 'Acesso atualizado.' : 'Novo acesso criado.');
      await loadManagers();
    } catch (error) { toast(`Acesso: ${error.message}`, 'error'); }
    finally { button.disabled = false; button.textContent = 'Salvar'; }
  }

  async function toggleManager(item) {
    if (item.user_id === window.GESTOR_ATUAL?.user_id && item.status === 'ATIVO') return toast('Você não pode inativar o próprio acesso.', 'error');
    const next = item.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    const { data, error } = await sb.functions.invoke('gerenciar-gestor', { body: { acao:'atualizar', ...item, user_id:item.user_id, status:next } });
    if (error || !data?.ok) return toast(data?.error || error?.message || 'Falha ao alterar acesso.', 'error');
    toast(`Acesso ${next === 'ATIVO' ? 'ativado' : 'inativado'}.`); await loadManagers();
  }

  function exportManagers() {
    const data = filteredManagers();
    const csv = ['ID;Nome;E-mail;Cargo;Nível;Status', ...data.map(i => [i.gestor_id,i.nome,i.email,i.cargo,i.nivel_acesso,i.status].map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(';'))].join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type:'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href=url; a.download='equipe-altitude.csv'; a.click(); URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // CHAMADOS
  // ---------------------------------------------------------------------------
  const slaHours = { URGENTE:4, ALTA:12, MEDIA:24, BAIXA:48 };
  function dueDate(item) { const d = new Date(item.criado_em); d.setHours(d.getHours() + (slaHours[item.prioridade] || 24)); return d; }
  function slaLabel(item) {
    if (['RESOLVIDO','CANCELADO'].includes(item.status)) return '<span class="sla-chip ok">Finalizado</span>';
    const hours = Math.ceil((dueDate(item)-Date.now())/3600000);
    return hours < 0 ? `<span class="sla-chip late">Atrasado ${Math.abs(hours)}h</span>` : `<span class="sla-chip">${hours}h restantes</span>`;
  }

  async function loadTickets() {
    const { data, error } = await sb.from('chamados').select('*').order('criado_em', { ascending:false });
    if (error) return toast(`Chamados: ${error.message}`, 'error');
    state.chamados = data || [];
    const ids = [...new Set(state.chamados.map(i => i.aluno_id).filter(Boolean))];
    state.alunos.clear();
    if (ids.length) {
      const { data: students } = await sb.from('alunos').select('user_id,nome,email,ra').in('user_id', ids);
      (students || []).forEach(a => state.alunos.set(a.user_id, a));
    }
    renderTickets();
  }

  function filteredTickets() {
    const q = normalize($('#chBusca')?.value);
    const status = $('#chFiltroStatus')?.value || 'TODOS';
    const priority = $('#chFiltroPrioridade')?.value || 'TODAS';
    const days = Number($('#chPeriodo')?.value || 365);
    const cutoff = Date.now() - days*86400000;
    return state.chamados.filter(item => {
      const student = state.alunos.get(item.aluno_id);
      const hit = !q || normalize(`${item.protocolo} ${student?.nome} ${student?.ra} ${item.assunto}`).includes(q);
      return hit && (status==='TODOS'||item.status===status) && (priority==='TODAS'||item.prioridade===priority) && new Date(item.criado_em).getTime() >= cutoff;
    });
  }

  function renderTickets() {
    const rows = filteredTickets();
    const tbody = $('#tabChamados tbody'); if (!tbody) return;
    const pending = rows.filter(i => ['ABERTO','EM_ANDAMENTO'].includes(i.status));
    $('#chPendentes').textContent = pending.length;
    $('#chResolvidos').textContent = rows.filter(i => i.status==='RESOLVIDO').length;
    $('#chAtrasados').textContent = pending.filter(i => dueDate(i).getTime() < Date.now()).length;
    tbody.innerHTML = rows.length ? rows.map(item => {
      const student = state.alunos.get(item.aluno_id) || {};
      return `<tr data-ticket-id="${item.id}"><td><strong>${escapeHtml(item.protocolo || `#${item.id}`)}</strong></td><td>${escapeHtml(student.nome || 'Aluno')}</td><td>${escapeHtml(item.assunto)}</td><td>${badge(item.prioridade)}</td><td>${dateBR(item.criado_em).split(' ')[0]}</td><td>${dateBR(dueDate(item)).split(' ')[0]}</td><td>${badge(item.status)}</td><td>${slaLabel(item)}</td><td><button type="button" class="btn-mini ticket-open">Abrir chamado</button></td></tr>`;
    }).join('') : '<tr><td colspan="9" class="empty-state">Nenhum chamado encontrado.</td></tr>';
  }

  async function openTicket(item) {
    state.chamadoAtual = item;
    const student = state.alunos.get(item.aluno_id) || {};
    $('#chModalTitulo').textContent = item.assunto;
    $('#chProto').textContent = item.protocolo || `#${item.id}`;
    $('#chAluno').textContent = student.nome || 'Aluno';
    $('#chEmail').textContent = student.email || student.ra || '—';
    $('#chAssunto').textContent = item.assunto;
    $('#chCategoria').textContent = item.categoria || 'OUTRO';
    $('#chCriado').textContent = dateBR(item.criado_em);
    $('#chPrazo').textContent = dateBR(dueDate(item));
    $('#chSLAChip').innerHTML = slaLabel(item);
    $('#chDescricao').textContent = item.mensagem || '';
    $('#chPrioridadeGestor').value = item.prioridade || 'MEDIA';
    $('#chStatusGestor').value = item.status || 'ABERTO';
    showModal('#modalChamado', true);
    await loadInteractions(item.id);
  }

  async function loadInteractions(ticketId) {
    const box = $('#chHistorico'); if (!box) return;
    box.innerHTML = '<p>Carregando histórico...</p>';
    const { data, error } = await sb.from('chamado_interacoes').select('*').eq('chamado_id', ticketId).order('criado_em');
    if (error) { box.innerHTML = `<p>${escapeHtml(error.message)}</p>`; return; }
    box.innerHTML = (data || []).length ? data.map(i => `<div class="history-message ${i.autor_tipo.toLowerCase()}"><strong>${i.autor_tipo === 'GESTOR' ? 'Equipe Altitude' : 'Aluno'}</strong><p>${escapeHtml(i.mensagem)}</p><small>${dateBR(i.criado_em)}</small></div>`).join('') : '<p class="empty-state">Ainda não há respostas neste chamado.</p>';
  }

  async function saveTicketClassification() {
    if (!state.chamadoAtual) return;
    const payload = {
      prioridade: $('#chPrioridadeGestor').value,
      status: $('#chStatusGestor').value,
      prioridade_definida_por: window.GESTOR_ATUAL.user_id,
      atualizado_em: new Date().toISOString(),
      resolvido_em: $('#chStatusGestor').value === 'RESOLVIDO' ? new Date().toISOString() : null
    };
    const { error } = await sb.from('chamados').update(payload).eq('id', state.chamadoAtual.id);
    if (error) return toast(error.message, 'error');
    toast('Prioridade e status atualizados.'); await loadTickets();
    state.chamadoAtual = state.chamados.find(i => i.id === state.chamadoAtual.id) || state.chamadoAtual;
  }

  async function replyTicket(event) {
    event.preventDefault(); if (!state.chamadoAtual) return;
    const message = $('#chResposta').value.trim(); if (!message) return toast('Escreva uma resposta.', 'error');
    const action = $('#chAcaoRapida').value;
    const status = action === 'RESP_RESOLVER' ? 'RESOLVIDO' : action === 'RESP_E_ANDAMENTO' ? 'EM_ANDAMENTO' : state.chamadoAtual.status;
    const button = event.submitter; button.disabled=true; button.textContent='Enviando...';
    try {
      const { error: interactionError } = await sb.from('chamado_interacoes').insert({ chamado_id:state.chamadoAtual.id, autor_id:window.GESTOR_ATUAL.user_id, autor_tipo:'GESTOR', mensagem:message });
      if (interactionError) throw interactionError;
      const { error } = await sb.from('chamados').update({ status, ultima_resposta:message, respondido_em:new Date().toISOString(), atualizado_em:new Date().toISOString(), resolvido_em:status==='RESOLVIDO'?new Date().toISOString():null }).eq('id', state.chamadoAtual.id);
      if (error) throw error;
      $('#chResposta').value=''; toast('Resposta registrada.'); await loadInteractions(state.chamadoAtual.id); await loadTickets();
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled=false; button.textContent='Enviar'; }
  }

  async function wire() {
    const profile = await window.GESTOR_AUTH_READY;
    if (!profile) return;

    $('#gestorSidebarOverlay')?.addEventListener('click', () => $('#gestorSidebar')?.classList.remove('open'));
    $('#guNovo')?.addEventListener('click', openNewManager);
    $('#guCancelar')?.addEventListener('click', () => showModal('#modalUsuario', false));
    $('#formUsuario')?.addEventListener('submit', saveManager);
    $('#guNivel')?.addEventListener('change', updatePermissions);
    ['guBusca','guFiltroCargo','guFiltroStatus'].forEach(id => $(id)?.addEventListener(id==='guBusca'?'input':'change', renderManagers));
    $('#guExport')?.addEventListener('click', exportManagers);
    $('#tabUsuarios')?.addEventListener('click', event => {
      const row = event.target.closest('tr[data-user-id]'); if (!row) return;
      const item = state.gestores.find(i => i.user_id === row.dataset.userId); if (!item) return;
      if (event.target.closest('.manager-edit')) openEditManager(item);
      if (event.target.closest('.manager-toggle')) toggleManager(item);
    });

    ['chBusca','chFiltroStatus','chFiltroPrioridade','chPeriodo'].forEach(id => $(id)?.addEventListener(id==='chBusca'?'input':'change', renderTickets));
    $('#tabChamados')?.addEventListener('click', event => {
      const row = event.target.closest('tr[data-ticket-id]'); if (!row || !event.target.closest('.ticket-open')) return;
      const item = state.chamados.find(i => Number(i.id) === Number(row.dataset.ticketId)); if (item) openTicket(item);
    });
    $('#chSalvarClassificacao')?.addEventListener('click', saveTicketClassification);
    $('#formResposta')?.addEventListener('submit', replyTicket);
    $('#chFecharModal')?.addEventListener('click', () => showModal('#modalChamado', false));

    await Promise.all([loadManagers(), loadTickets()]);
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
