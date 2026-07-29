/* Portal do Aluno ALTITUDE
 * Fluxo: módulos -> prova segura no Supabase -> certificado PDF com QR Code.
 */

const sb = window.sb;
const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  aluno: null,
  cursos: [],
  cursosDisponiveis: [],
  resultados: [],
  avaliacoes: [],
  certificados: [],
  certificadosHistorico: [],
  carteirasHoras: [],
  carteiraGlobal: null,
  movimentacoesHoras: [],
  promocoesV34: [],
  promocoesAlunoV34: [],
  pagamentos: [],
  chamados: [],
  chamadoAtual: null,
  cursoAtual: null,
  modulos: [],
  moduloIndex: 0,
  prova: null,
  respostas: {},
  questaoIndex: 0,
  logoDataUrl: null,
  atualizandoDados: false,
  atualizacaoPendente: false
};

const TITULOS_ABAS = {
  perfil: "Início",
  cursos: "Meus cursos",
  certificados: "Certificados",
  pagamentos: "Pagamentos",
  novidades: "Promoções",
  atendimento: "Atendimento",
  cadastro: "Meu cadastro"
};

const esperar = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function tentarNovamente(operacao, tentativas = 4, atrasoInicial = 250) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      return await operacao(tentativa);
    } catch (error) {
      ultimoErro = error;
      if (tentativa < tentativas) await esperar(atrasoInicial * tentativa);
    }
  }
  throw ultimoErro;
}

function mensagemDeSincronizacao(message, error = false) {
  let box = document.getElementById('portalSyncNotice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'portalSyncNotice';
    box.className = 'portal-sync-notice';
    box.innerHTML = '<span></span><button type="button">Tentar novamente</button>';
    document.body.appendChild(box);
    box.querySelector('button')?.addEventListener('click', async () => {
      box.classList.remove('show');
      try { await atualizarDadosPrincipais(); } catch (_) {}
    });
  }
  box.querySelector('span').textContent = message;
  box.classList.toggle('error', Boolean(error));
  box.classList.add('show');
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.remove('show'), error ? 7000 : 3500);
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "—";
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function dinheiro(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function dataBR(value, comHora = false) {
  if (!value) return "—";
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", comHora
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" });
}

function maskCpf(cpf) {
  const digits = String(cpf || "").replace(/\D/g, "");
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : cpf || "—";
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  const ddd = digits.slice(0, 2);
  const first = digits.length > 10 ? digits.slice(2, 7) : digits.slice(2, 6);
  const last = digits.length > 10 ? digits.slice(7) : digits.slice(6);
  return `(${ddd}) ${first}${last ? `-${last}` : ""}`;
}

function slug(value) {
  return String(value || "certificado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function imgCurso(url) {
  return url || "../3-img/background portaldoaluno.jpg";
}

function imgAluno(url) {
  return url || "../3-img/apple-touch-icon.png";
}

function safeUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value, window.location.href);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function statusPill(status) {
  const normalized = String(status || "PENDENTE").toUpperCase();
  const success = ["ATIVA", "CONCLUIDA", "PAGO", "EMITIDO", "RESOLVIDO", "APROVADO", "VÁLIDO"].includes(normalized);
  const danger = ["CANCELADA", "CANCELADO", "BLOQUEADO", "INATIVO", "REPROVADO", "ESTORNADO"].includes(normalized);
  const warning = ["PENDENTE", "AGUARDANDO_HORAS", "AUTORIZADO_AGUARDANDO_DATA", "ABERTO", "EM_ANDAMENTO", "TRANCADA"].includes(normalized);
  const cls = success ? "success" : danger ? "danger" : warning ? "warning" : "neutral";
  const labels = { AGUARDANDO_HORAS: "Aguardando a data de liberação", AUTORIZADO_AGUARDANDO_DATA: "Autorizado - aguardando a data" };
  const label = labels[normalized] || normalized.replaceAll("_", " ").toLocaleLowerCase("pt-BR").replace(/^./, (c) => c.toUpperCase());
  return `<span class="status-pill ${cls}">${escapeHTML(label)}</span>`;
}

let toastTimer;
function toast(message, type = "") {
  const el = $("globalToast");
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = message;
  el.className = `toast show ${type}`.trim();
  toastTimer = setTimeout(() => { el.className = "toast"; }, 3500);
}

function abrirAba(id) {
  document.querySelectorAll(".aba").forEach((el) => el.classList.remove("ativa"));
  document.querySelectorAll(".menu-link").forEach((el) => el.classList.remove("ativo"));
  $(id)?.classList.add("ativa");
  document.querySelector(`.menu-link[data-aba="${id}"]`)?.classList.add("ativo");
  setText("tituloAbaAtual", TITULOS_ABAS[id] || "Portal do aluno");
  fecharMenuMobile();
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.dispatchEvent(new CustomEvent("altitude:aba-aluno", { detail: { id } }));
}

function abrirMenuMobile() {
  $("portalSidebar")?.classList.add("open");
  $("sidebarOverlay")?.classList.add("show");
}

function fecharMenuMobile() {
  $("portalSidebar")?.classList.remove("open");
  $("sidebarOverlay")?.classList.remove("show");
}

async function obterUsuarioLogado() {
  const session = await tentarNovamente(async () => {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }, 4, 300);

  if (!session?.user) {
    window.location.replace('4-login.html');
    return null;
  }

  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.replace('4-login.html');
    return null;
  }
  return data.user;
}

async function sair() {
  await sb.auth.signOut();
  window.location.href = "4-login.html";
}

async function carregarAluno() {
  const data = await tentarNovamente(async () => {
    const { data: aluno, error } = await sb
      .from('alunos')
      .select('*')
      .eq('user_id', state.user.id)
      .limit(1);
    if (error) throw error;
    if (!Array.isArray(aluno) || !aluno.length) {
      const erro = new Error('PROFILE_NOT_FOUND');
      erro.code = 'PROFILE_NOT_FOUND';
      throw erro;
    }
    return aluno[0];
  }, 5, 350).catch(async (error) => {
    if (error?.code === 'PROFILE_NOT_FOUND' || error?.message === 'PROFILE_NOT_FOUND') {
      sessionStorage.setItem('altitude_login_aviso', 'Sua sessão anterior foi encerrada para proteger os dados. Entre novamente.');
      await sb.auth.signOut({ scope: 'local' }).catch(() => {});
      window.location.replace('4-login.html?motivo=sessao');
      return null;
    }
    throw error;
  });

  if (!data) return;
  state.aluno = data;

  const primeiroNome = String(data.nome || 'Aluno').trim().split(/\s+/)[0].toUpperCase();
  setText('nomeAluno', primeiroNome);
  setText('nomeTopoAluno', primeiroNome);
  setText('infoRA', data.ra || '—');
  setText('infoRA2', data.ra || '—');
  setText('infoCPF', maskCpf(data.cpf));
  setText('infoEmail', data.email || state.user.email || '—');
  setText('infoCelular', maskPhone(data.telefone) || '—');

  const photo = imgAluno(data.foto_url);
  if ($('avatarTopo')) $('avatarTopo').src = photo;
  if ($('previewFotoAluno')) $('previewFotoAluno').src = photo;

  if ($('cadNome')) $('cadNome').value = data.nome || '';
  if ($('cadEmail')) $('cadEmail').value = data.email || state.user.email || '';
  if ($('cadTelefone')) $('cadTelefone').value = maskPhone(data.telefone);
  if ($('cadNascimento')) $('cadNascimento').value = data.data_nascimento || '';
  if ($('cadObjetivo')) $('cadObjetivo').value = data.objetivo || '';
  setText('cadCpfTexto', maskCpf(data.cpf));
  renderCarteirinha();
}

async function carregarCursos() {
  const { data: matriculas, error: matriculasError } = await sb
    .from("matriculas")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("criada_em", { ascending: false });

  if (matriculasError) throw matriculasError;

  const ids = [...new Set((matriculas || []).map((item) => Number(item.curso_id)))];
  let cursos = [];
  if (ids.length) {
    const { data, error } = await sb.from("cursos").select("*").in("id", ids);
    if (error) throw error;
    cursos = data || [];
  }

  state.cursos = (matriculas || []).map((matricula) => {
    const curso = cursos.find((item) => Number(item.id) === Number(matricula.curso_id)) || {};
    return {
      ...curso,
      matricula_id: matricula.id,
      matricula_status: matricula.status,
      matricula_criada_em: matricula.criada_em,
      progresso: clamp(matricula.progresso)
    };
  });

  const { data: publicados, error: publicadosError } = await sb
    .from("cursos")
    .select("*")
    .eq("publicado", true)
    .order("criado_em", { ascending: false });

  if (publicadosError) throw publicadosError;
  const matriculadosIds = new Set(state.cursos.map((item) => Number(item.id)));
  state.cursosDisponiveis = (publicados || []).filter((item) => !matriculadosIds.has(Number(item.id)));
}

async function carregarResultados() {
  const { data, error } = await sb
    .from("resultados_provas")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  state.resultados = data || [];
}

async function carregarAvaliacoes() {
  const { data, error } = await sb
    .from("avaliacoes_cursos")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("criado_em", { ascending: false });
  if (error) {
    console.warn("Avaliações indisponíveis:", error.message);
    return;
  }
  state.avaliacoes = data || [];
}

function avaliacaoDoCurso(cursoId) {
  return state.avaliacoes.find((item) => Number(item.curso_id) === Number(cursoId)) || null;
}

function alunoPodeTerCarteirinha() {
  return state.cursos.some((curso) => {
    const resultado = melhorResultadoCurso(curso.id);
    return clamp(curso.progresso) >= 100 && Boolean(resultado?.aprovado);
  });
}

async function carregarCertificados() {
  const { data, error } = await sb
    .from("certificados")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("id", { ascending: false });
  if (error) throw error;
  state.certificados = data || [];
}

async function carregarHistoricoCertificados() {
  const { data, error } = await sb
    .from("certificados_historico")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("criado_em", { ascending: false });
  if (error) {
    console.warn("Histórico de certificados indisponível:", error.message);
    return;
  }
  state.certificadosHistorico = data || [];
}

async function carregarCarteirasHoras() {
  const { data, error } = await sb.rpc("obter_minha_carteira_horas_v34");
  if (error) {
    console.warn("Carteira global de horas indisponível:", error.message);
    return;
  }
  state.carteiraGlobal = data || null;
  state.carteirasHoras = data ? [data] : [];
}

async function carregarMovimentacoesHoras() {
  const { data, error } = await sb
    .from("movimentacoes_horas_aluno_v34")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("criado_em", { ascending: false });
  if (error) {
    console.warn("Extrato global de horas indisponível:", error.message);
    return;
  }
  state.movimentacoesHoras = data || [];
}

function carteiraHorasCurso(_cursoId) {
  return state.carteiraGlobal || state.carteirasHoras[0] || null;
}

function opcoesHorasDisponiveis(saldo) {
  // O aluno informa a carga desejada mesmo antes de possuir todo o crédito.
  // A data futura será calculada pelo banco com o limite global de 8h/dia.
  const saldoArredondado = Math.max(5, Math.floor(Number(saldo || 0) / 5) * 5);
  const limite = Math.max(500, saldoArredondado);
  const values = [];
  for (let horas = 5; horas <= limite; horas += 5) values.push(horas);
  return values;
}

async function carregarPagamentos() {
  const { data, error } = await sb
    .from("pagamentos")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("id", { ascending: false });
  if (error) throw error;
  state.pagamentos = data || [];
}

function melhorResultadoCurso(cursoId) {
  const resultados = state.resultados.filter((item) => Number(item.curso_id) === Number(cursoId));
  if (!resultados.length) return null;
  return resultados.sort((a, b) => {
    if (Boolean(a.aprovado) !== Boolean(b.aprovado)) return Number(b.aprovado) - Number(a.aprovado);
    if (Number(a.nota) !== Number(b.nota)) return Number(b.nota) - Number(a.nota);
    return new Date(b.criado_em) - new Date(a.criado_em);
  })[0];
}

function certificadosDoCurso(cursoId) {
  return state.certificados
    .filter((item) => Number(item.curso_id) === Number(cursoId))
    .sort((a, b) => Number(b.id) - Number(a.id));
}

function certificadoEstaLiberado(certificado) {
  if (!certificado || String(certificado.status || "").toUpperCase() !== "EMITIDO") return false;

  const liberarEm = certificado.liberar_em ? new Date(certificado.liberar_em).getTime() : null;
  const horarioValido = liberarEm !== null && Number.isFinite(liberarEm);

  if (certificado.liberado_em) return true;
  if (String(certificado.modo_liberacao || "").toUpperCase() === "IMEDIATO") return true;
  if (horarioValido && Date.now() < liberarEm) return false;

  // Registros antigos podem não possuir modo_liberacao/liberado_em.
  return !horarioValido || Date.now() >= liberarEm;
}

function certificadoAguardandoPrazo(certificado) {
  const status = String(certificado?.status || "").toUpperCase();
  return ['AGUARDANDO_HORAS','AUTORIZADO_AGUARDANDO_DATA'].includes(status) || (status === "EMITIDO" && !certificadoEstaLiberado(certificado));
}

function certificadoCurso(cursoId) {
  return certificadosDoCurso(cursoId).find(certificadoEstaLiberado) || null;
}

function certificadoAtualCurso(cursoId) {
  return certificadosDoCurso(cursoId)[0] || null;
}

function renderDashboard() {
  const cursosAtivos = state.cursos.filter((item) => !["CANCELADA", "TRANCADA"].includes(String(item.matricula_status).toUpperCase()));
  const aprovadas = new Set(state.resultados.filter((item) => item.aprovado).map((item) => Number(item.curso_id))).size;
  const emitidos = state.certificados.filter(certificadoEstaLiberado);
  const horas = emitidos.reduce((total, item) => total + Number(item.horas_emitidas || 0), 0);
  const progressoGeral = cursosAtivos.length
    ? Math.round(cursosAtivos.reduce((total, item) => total + clamp(item.progresso), 0) / cursosAtivos.length)
    : 0;

  setText("kpiCursos", cursosAtivos.length);
  setText("kpiProvasAprovadas", aprovadas);
  setText("kpiCertEmitidos", emitidos.length);
  setText("kpiHorasEmitidas", `${horas} horas certificadas`);
  setText("progressoGeralTexto", `${progressoGeral}%`);
  if ($("progressoGeralBarra")) $("progressoGeralBarra").style.width = `${progressoGeral}%`;

  const continuar = cursosAtivos
    .filter((item) => clamp(item.progresso) < 100 || !melhorResultadoCurso(item.id)?.aprovado)
    .sort((a, b) => Number(b.progresso) - Number(a.progresso))[0] || cursosAtivos[0];

  const continuarBox = $("continuarEstudoBox");
  if (continuarBox) {
    continuarBox.classList.toggle("empty-state", !continuar);
    continuarBox.innerHTML = continuar ? `
      <div class="continue-course">
        <img src="${escapeHTML(imgCurso(continuar.capa_url))}" alt="Capa de ${escapeHTML(continuar.titulo)}">
        <div>
          <span class="eyebrow">${escapeHTML(continuar.categoria || "Curso")}</span>
          <h3>${escapeHTML(continuar.titulo || "Curso")}</h3>
          <p>${escapeHTML(continuar.descricao || "Continue seus estudos no ponto em que parou.")}</p>
          <div class="progress-line">
            <div class="progress-track"><div style="width:${clamp(continuar.progresso)}%"></div></div>
            <span>${clamp(continuar.progresso)}%</span>
          </div>
          <button class="course-button" type="button" onclick="abrirCurso(${Number(continuar.id)})">Continuar estudo</button>
        </div>
      </div>
    ` : "Nenhum curso disponível para continuar.";
  }

  const atividades = $("ultimasAtividades");
  if (atividades) {
    const recentes = [...state.resultados].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0, 4);
    atividades.classList.toggle("empty-state", !recentes.length);
    atividades.innerHTML = recentes.length ? `<div class="activity-list">${recentes.map((item) => {
      const curso = state.cursos.find((c) => Number(c.id) === Number(item.curso_id));
      return `<div class="activity-item"><span><strong>${escapeHTML(curso?.titulo || "Prova realizada")}</strong><small>${dataBR(item.criado_em, true)} · ${item.aprovado ? "Aprovado" : "Nova tentativa disponível"}</small></span><b class="activity-score">${Number(item.nota || 0)}%</b></div>`;
    }).join("")}</div>` : "Nenhuma atividade recente.";
  }
}

function courseCard(curso, compact = false) {
  const resultado = melhorResultadoCurso(curso.id);
  const progresso = clamp(curso.progresso);
  const status = progresso >= 100 && resultado?.aprovado ? "Concluído" : progresso > 0 ? "Em andamento" : "Não iniciado";
  const statusClass = status === "Concluído" ? "success" : status === "Em andamento" ? "warning" : "neutral";

  return `
    <article class="course-card" data-search="${escapeHTML(`${curso.titulo || ""} ${curso.categoria || ""}`.toLowerCase())}">
      <div class="course-cover">
        <img src="${escapeHTML(imgCurso(curso.capa_url))}" alt="Capa do curso ${escapeHTML(curso.titulo)}">
        ${compact ? "" : `<span class="course-status status-pill ${statusClass}">${status}</span>`}
      </div>
      <div class="course-card-body">
        <span class="eyebrow">${escapeHTML(curso.categoria || "Formação")}</span>
        <h3>${escapeHTML(curso.titulo || "Curso")}</h3>
        <p>${escapeHTML(curso.descricao || "Conteúdo disponível na plataforma Altitude.")}</p>
        <div class="course-meta">
          ${resultado ? `<span>Melhor nota: ${Number(resultado.nota || 0)}%</span>` : `<span>Prova pendente</span>`}
        </div>
        ${compact ? "" : `<div class="progress-line"><div class="progress-track"><div style="width:${progresso}%"></div></div><strong>${progresso}%</strong></div>`}
        <div class="course-card-footer">
          ${compact
            ? `<button class="course-button" type="button" onclick="matricularCurso(${Number(curso.id)})">Matricular</button>`
            : `<button class="course-button" type="button" onclick="abrirCurso(${Number(curso.id)})">${progresso ? "Continuar" : "Iniciar"}</button>`}
        </div>
      </div>
    </article>`;
}

function renderCursos() {
  setText("contadorCursosMatriculados", `${state.cursos.length} ${state.cursos.length === 1 ? "curso" : "cursos"}`);
  const lista = $("listaCursos");
  if (lista) lista.innerHTML = state.cursos.length
    ? state.cursos.map((curso) => courseCard(curso)).join("")
    : `<div class="empty-state">Você ainda não possui cursos matriculados.</div>`;

  const disponiveis = $("listaCursosDisponiveis");
  if (disponiveis) disponiveis.innerHTML = state.cursosDisponiveis.length
    ? state.cursosDisponiveis.map((curso) => courseCard(curso, true)).join("")
    : `<div class="empty-state">Nenhum novo curso disponível no momento.</div>`;
}

async function matricularCurso(cursoId) {
  const button = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  if (button) button.disabled = true;
  try {
    const { error } = await sb.rpc("matricular_em_curso", { p_curso_id: Number(cursoId) });
    if (error) throw error;
    toast("Matrícula realizada com sucesso.", "success");
    await atualizarDadosPrincipais();
    abrirAba("cursos");
    await abrirCurso(Number(cursoId));
  } catch (error) {
    toast(`Não foi possível realizar a matrícula: ${error.message}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function abrirCurso(cursoId) {
  const curso = state.cursos.find((item) => Number(item.id) === Number(cursoId));
  if (!curso) return toast("Curso não encontrado em suas matrículas.", "error");

  state.cursoAtual = curso;
  state.moduloIndex = 0;
  setText("studyCourseTitle", curso.titulo || "Curso");
  $("modalCurso")?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  $("studyModuleList").innerHTML = `<div class="empty-state">Carregando conteúdo...</div>`;
  $("lessonContent").innerHTML = "";

  try {
    let { data, error } = await sb.rpc("obter_modulos_curso_v12", { p_curso_id: Number(cursoId) });
    if (error && /obter_modulos_curso_v12|function/i.test(error.message || "")) {
      ({ data, error } = await sb.rpc("obter_modulos_curso", { p_curso_id: Number(cursoId) }));
    }
    if (error) throw error;
    state.modulos = (data || []).map((modulo) => ({
      ...modulo,
      materiais: Array.isArray(modulo.materiais) ? modulo.materiais : [],
      concluido: Boolean(modulo.concluido)
    }));
    renderSalaEstudo();
  } catch (error) {
    console.error(error);
    $("studyModuleList").innerHTML = `<div class="empty-state">Não foi possível abrir o conteúdo. Execute a migração SQL incluída no projeto.<br><small>${escapeHTML(error.message)}</small></div>`;
    toast("O banco ainda precisa receber a atualização do portal.", "error");
  }
}

function renderSalaEstudo() {
  const curso = state.cursoAtual;
  if (!curso) return;
  const progress = clamp(curso.progresso);
  if ($("studyProgressBar")) $("studyProgressBar").style.width = `${progress}%`;
  setText("studyProgressText", `${progress}% concluído`);

  const list = $("studyModuleList");
  if (!state.modulos.length) {
    list.innerHTML = `<div class="empty-state">Nenhum módulo publicado.</div>`;
    return;
  }

  list.innerHTML = state.modulos.map((modulo, index) => `
    <button type="button" class="module-item ${index === state.moduloIndex ? "ativo" : ""} ${modulo.concluido ? "concluido" : ""}" onclick="selecionarModulo(${index})">
      <span class="module-number">${modulo.concluido ? "✓" : index + 1}</span>
      <span><strong>${escapeHTML(modulo.titulo || `Módulo ${index + 1}`)}</strong><small>${modulo.concluido ? "Concluído" : "Pendente"}</small></span>
    </button>
  `).join("");

  renderModuloAtual();
  const approved = Boolean(melhorResultadoCurso(curso.id)?.aprovado);
  const examButton = $("btnAbrirProva");
  if (examButton) {
    examButton.disabled = progress < 100;
    examButton.textContent = approved ? "Ver resultado da prova" : progress >= 100 ? "Fazer prova" : "Conclua os módulos";
  }
  const finishPanel = $("courseCompletionPanel");
  if (finishPanel) finishPanel.hidden = progress < 100;
  const finishButton = $("btnIrParaProva");
  if (finishButton) finishButton.textContent = approved ? "Ver resultado da prova" : "Fazer prova agora";
}

function selecionarModulo(index) {
  if (index < 0 || index >= state.modulos.length) return;
  state.moduloIndex = index;
  renderSalaEstudo();
}

function youtubeEmbed(url) {
  const safe = safeUrl(url);
  if (!safe) return "";
  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?]+)/, /youtube\.com\/embed\/([^?]+)/];
  const match = patterns.map((pattern) => safe.match(pattern)).find(Boolean);
  return match ? `https://www.youtube.com/embed/${match[1]}` : "";
}

function materialIcon(type) {
  const normalized = String(type || "OUTRO").toUpperCase();
  return { PDF: "PDF", VIDEO: "▶", AUDIO: "Áudio", IMAGEM: "Imagem", LINK: "Link" }[normalized] || "Arquivo";
}


function cleanLatexForStudent(value) {
  let text = String(value || "").replace(/\r/g, "");
  if (!text) return "";

  text = text
    .replace(/^[\s\S]*?\\begin\{document\}/i, "")
    .replace(/\\end\{document\}[\s\S]*$/i, "")
    .replace(/\\(?:documentclass|usepackage|geometry|definecolor|titleformat|titlespacing|setlength|pagestyle|fancyhf|fancyhead|fancyfoot|renewcommand|onehalfspacing|Justifying)\*?(?:\[[^\]]*\])?\{[^{}]*\}/gi, "")
    .replace(/\\(?:vspace|hspace)\*?\{[^{}]*\}/gi, "")
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^{}]*\}/gi, "")
    .replace(/\\begin\{itemize\}(\[[^\]]*\])?/gi, (_, options = "") => {
      const left = /leftmargin\s*=\s*([^,\]]+)/i.exec(options)?.[1]?.trim() || "";
      return `\n@@LIST:${left}@@\n`;
    })
    .replace(/\\begin\{enumerate\}(\[[^\]]*\])?/gi, (_, options = "") => {
      const left = /leftmargin\s*=\s*([^,\]]+)/i.exec(options)?.[1]?.trim() || "";
      return `\n@@OLIST:${left}@@\n`;
    })
    .replace(/\\end\{(?:itemize|enumerate)\}/gi, "\n@@ENDLIST@@\n")
    .replace(/\\begin\{(?:center|tcolorbox|tabularx|tabular)\}(?:\[[\s\S]*?\])?/gi, "\n")
    .replace(/\\end\{(?:center|tcolorbox|tabularx|tabular)\}/gi, "\n")
    .replace(/^\s*\[[^\]\n]*(?:colback|colframe|boxrule|arc|left|right|top|bottom)[^\]\n]*\]\s*$/gim, "")
    .replace(/\\section\*?\{([^{}]+)\}/gi, "\n## $1\n")
    .replace(/\\subsection\*?\{([^{}]+)\}/gi, "\n### $1\n")
    .replace(/\\subsubsection\*?\{([^{}]+)\}/gi, "\n#### $1\n")
    .replace(/\\item\s*/gi, "\n- ")
    .replace(/\\(?:textbf|textit|emph|underline)\{([^{}]*)\}/gi, "$1")
    .replace(/\\textcolor\{[^{}]*\}\{([^{}]*)\}/gi, "$1")
    .replace(/\\color\{[^{}]*\}/gi, "")
    .replace(/\\(?:Large|LARGE|large|small|normalsize|bfseries|itshape|selectfont)\b/gi, "")
    .replace(/\\\\/g, "\n")
    .replace(/\\textbar\b/gi, "|")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/~+/g, " ")
    .replace(/\$+/g, "")
    .replace(/[{}]/g, "")
    .replace(/^\s*(?:tcolorbox|center|altgray|altblue|altlight|linegray)\s*$/gim, "")
    .replace(/^\s*\d+(?:\.\d+)?cm\s*$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

function studentContentHtml(value) {
  const text = cleanLatexForStudent(value);
  if (!text) return "";
  const lines = text.split("\n");
  const out = [];
  let paragraph = [];
  let list = [];
  let listType = "ul";
  let listMargin = "";
  let orderedIndex = 0;

  const safeCssDimension = (value) => /^\d+(?:[.,]\d+)?(?:cm|mm|pt|px|em|rem|in)$/i.test(String(value || '').trim())
    ? String(value).trim().replace(',', '.') : '';
  const flushParagraph = () => {
    const joined = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (joined) out.push(`<p>${escapeHTML(joined)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) {
      const margin = safeCssDimension(listMargin);
      out.push(`<${listType} class="latex-list${margin ? ' has-custom-leftmargin' : ''}"${margin ? ` style="margin-left:${margin}"` : ''}>${list.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</${listType}>`);
    }
    list = []; listMargin = ''; orderedIndex = 0;
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushParagraph(); return; }
    const open = /^@@(O?LIST):([^@]*)@@$/.exec(line);
    if (open) { flushParagraph(); flushList(); listType = open[1] === 'OLIST' ? 'ol' : 'ul'; listMargin = open[2] || ''; return; }
    if (line === '@@ENDLIST@@') { flushParagraph(); flushList(); listType = 'ul'; return; }
    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = heading[1].length <= 2 ? 3 : 4;
      out.push(`<h${level} class="latex-heading">${escapeHTML(heading[2])}</h${level}>`);
      return;
    }
    if (/^-\s+/.test(line)) {
      flushParagraph();
      let item = line.replace(/^-\s+/, "");
      if (listType === 'ol') item = item.replace(/^\d+[.)]\s*/, '');
      list.push(item); orderedIndex += 1;
      return;
    }
    flushList();
    paragraph.push(line);
  });
  flushParagraph(); flushList();
  return out.join("");
}

function uniqueModuleResources(modulo) {
  const resources = [];
  const seen = new Set();
  const add = (resource) => {
    const url = safeUrl(resource?.url);
    if (!url) return;
    const key = `${String(resource.tipo || "OUTRO").toUpperCase()}|${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    resources.push({ ...resource, url });
  };

  if (modulo.video_url) add({ tipo: "VIDEO", titulo: "Videoaula do módulo", url: modulo.video_url, destaque: true });

  // Exibe somente um PDF por módulo, mesmo quando o mesmo arquivo foi registrado em duas tabelas.
  const pdfCandidates = [];
  if (modulo.pdf_url) pdfCandidates.push({ tipo: "PDF", titulo: "Material do módulo", url: modulo.pdf_url });
  for (const material of modulo.materiais || []) {
    if (String(material.tipo || "").toUpperCase() === "PDF") pdfCandidates.push(material);
  }
  if (pdfCandidates.length) add({ ...pdfCandidates[0], tipo: "PDF", titulo: "Material do módulo" });

  for (const material of modulo.materiais || []) {
    if (String(material.tipo || "").toUpperCase() !== "PDF") add(material);
  }
  return resources;
}

async function baixarMaterialCompletoCurso() {
  if (!state.cursoAtual || !state.modulos.length) return toast("Nenhum material disponível.", "error");
  if (!window.jspdf?.jsPDF) return toast("Gerador de PDF não carregado.", "error");

  const button = $("btnCursoMaterialCompleto");
  const original = button?.textContent || "Baixar material completo";
  if (button) { button.disabled = true; button.textContent = "Gerando material..."; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 18;
    let y = 20;
    let logo = null;
    try {
      const response = await fetch(new URL('../3-img/LOGO.png', location.href));
      const blob = await response.blob();
      logo = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    } catch (_) {}

    const newPageIfNeeded = (needed = 12) => {
      if (y + needed <= height - 18) return;
      doc.addPage(); y = 20;
    };
    const writeLines = (text, size = 10, bold = false, spacing = 5, indent = 0) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(String(text || ""), width - margin * 2 - indent);
      for (const line of lines) { newPageIfNeeded(spacing + 2); doc.text(line, margin + indent, y); y += spacing; }
    };

    // Capa minimalista: sem caixas ou molduras pesadas.
    if (logo) doc.addImage(logo,'PNG',(width-66)/2,20,66,18,undefined,'FAST');
    doc.setTextColor(17,168,182);
    doc.setFont('helvetica','bold');
    doc.setFontSize(11.5);
    doc.text('Material de estudo',width/2,47,{align:'center'});
    doc.setTextColor(7,59,90);
    doc.setFontSize(18);
    const coverLines = doc.splitTextToSize(`Curso de ${state.cursoAtual.titulo || 'Curso'}`,width-50);
    doc.text(coverLines,width/2,60,{align:'center'});
    const coverBottom = 60 + Math.max(0,coverLines.length-1)*8;
    doc.setDrawColor(207,220,229);
    doc.setLineWidth(.35);
    doc.line(margin,coverBottom+12,width-margin,coverBottom+12);
    y=coverBottom+27;
    writeLines(`Curso: ${state.cursoAtual.titulo || 'Curso'}`,10.5,true,6);
    writeLines(`Área de formação: ${state.cursoAtual.categoria || 'Formação profissional'}`,10,false,6);
    writeLines('Finalidade: apoiar o estudo teórico e servir de base para a avaliação de aprendizagem.',10,false,6);

    state.modulos.forEach((modulo, index) => {
      doc.addPage(); y=22;
      doc.setTextColor(7,59,90); writeLines(`${index + 1}. ${modulo.titulo || `Conteúdo ${index + 1}`}`,16,true,8);
      doc.setTextColor(45,61,75);
      const clean = cleanLatexForStudent(modulo.conteudo || modulo.conteudo_latex || "");
      let currentIndent = 0;
      clean.split(/\n+/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
        const open = /^@@(?:O?LIST):([^@]*)@@$/.exec(line);
        if (open) {
          const val = open[1] || '';
          const num = Number((val.match(/[\d.,]+/)||['4'])[0].replace(',','.'));
          currentIndent = /cm/i.test(val) ? num*10 : /mm/i.test(val) ? num : 4;
          return;
        }
        if (line === '@@ENDLIST@@') { currentIndent = 0; return; }
        const heading = line.match(/^#{2,4}\s+(.+)$/);
        if (heading) { doc.setTextColor(7,59,90); writeLines(heading[1],13,true,7); doc.setTextColor(45,61,75); return; }
        const item = line.replace(/^-\s*/, '• ');
        writeLines(item,10,false,5,currentIndent);
      });
    });

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100,115,128);
      doc.text(`Altitude Centro Universitário - ${page} de ${totalPages}`, width / 2, height - 9, { align: "center" });
    }
    const filename = `material-${String(state.cursoAtual.titulo || "curso").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error("Material completo:", error); toast(`Não foi possível gerar o material: ${error.message}`, "error");
  } finally { if (button) { button.disabled = false; button.textContent = original; } }
}

function renderModuloAtual() {
  const modulo = state.modulos[state.moduloIndex];
  if (!modulo) return;

  setText("lessonPosition", `Conteúdo ${state.moduloIndex + 1} de ${state.modulos.length}`);
  setText("lessonTitle", modulo.titulo || `Módulo ${state.moduloIndex + 1}`);
  setText("lessonDescription", cleanLatexForStudent(modulo.descricao) || "Estude os materiais abaixo e marque o conteúdo como concluído.");

  const recursos = uniqueModuleResources(modulo);
  const content = $("lessonContent");
  const blocoTextoHtml = studentContentHtml(modulo.conteudo || modulo.conteudo_latex || "");
  const blocoTexto = blocoTextoHtml ? `<article class="lesson-written-content"><h3>Conteúdo do módulo</h3>${blocoTextoHtml}</article>` : "";

  if (!recursos.length && !blocoTextoHtml) {
    content.innerHTML = `<div class="empty-state">Este módulo ainda não possui conteúdo publicado.</div>`;
  } else {
    content.innerHTML = blocoTexto + recursos.map((resource) => {
      const url = safeUrl(resource.url);
      const normalizedType = String(resource.tipo || "OUTRO").toUpperCase();
      const embed = normalizedType === "VIDEO" ? youtubeEmbed(url) : "";
      if (embed && resource.destaque) {
        return `<iframe class="video-frame" src="${escapeHTML(embed)}" title="${escapeHTML(resource.titulo)}" allowfullscreen></iframe>`;
      }
      if (normalizedType === "IMAGEM" && url) {
        return `<figure class="lesson-module-image"><img src="${escapeHTML(url)}" alt="${escapeHTML(resource.titulo || "Imagem do módulo")}" loading="lazy"><figcaption>${escapeHTML(resource.titulo || "Imagem do módulo")}</figcaption></figure>`;
      }
      return `<div class="lesson-resource" data-resource-kind="${escapeHTML(normalizedType)}"><span><strong>${escapeHTML(resource.titulo || "Material")}</strong><small>${escapeHTML(materialIcon(resource.tipo))}</small></span>${url ? `<a class="secondary-button" href="${escapeHTML(url)}" target="_blank" rel="noopener">${normalizedType === "PDF" ? "Abrir PDF" : "Abrir"}</a>` : `<span class="status-pill neutral">Indisponível</span>`}</div>`;
    }).join("");
  }

  $("btnModuloAnterior").disabled = state.moduloIndex === 0;
  $("btnProximoModulo").disabled = state.moduloIndex === state.modulos.length - 1;
  const concludeButton = $("btnConcluirModulo");
  concludeButton.disabled = modulo.concluido;
  concludeButton.textContent = modulo.concluido ? "Conteúdo concluído" : "Marcar como concluído";
}

async function concluirModuloAtual() {
  const modulo = state.modulos[state.moduloIndex];
  if (!modulo || modulo.concluido) return;
  const button = $("btnConcluirModulo");
  button.disabled = true;
  button.textContent = "Salvando...";

  try {
    let data;
    let error;
    if (modulo.modulo_id == null) {
      ({ data, error } = await sb.rpc("concluir_conteudo_geral", { p_curso_id: Number(state.cursoAtual.id) }));
    } else {
      ({ data, error } = await sb.rpc("marcar_modulo_concluido", { p_modulo_id: Number(modulo.modulo_id) }));
    }
    if (error) throw error;

    modulo.concluido = true;
    state.cursoAtual.progresso = clamp(data);
    const cursoState = state.cursos.find((item) => Number(item.id) === Number(state.cursoAtual.id));
    if (cursoState) cursoState.progresso = clamp(data);
    toast("Progresso salvo.", "success");
    renderSalaEstudo();
    renderCursos();
    renderDashboard();

    if (state.moduloIndex < state.modulos.length - 1) {
      setTimeout(() => selecionarModulo(state.moduloIndex + 1), 350);
    } else if (clamp(data) >= 100) {
      toast("Conteúdo concluído. A avaliação já está disponível no botão Fazer prova.", "success");
    }
  } catch (error) {
    toast(`Erro ao salvar progresso: ${error.message}`, "error");
    button.disabled = false;
    button.textContent = "Marcar como concluído";
  }
}

function fecharModal(tipo) {
  const modal = tipo === "prova" ? $("modalProva")
    : tipo === "chamado" ? $("modalChamadoAluno")
    : $("modalCurso");
  modal?.setAttribute("aria-hidden", "true");
  if (tipo === "chamado") state.chamadoAtual = null;
  if ($("modalCurso")?.getAttribute("aria-hidden") === "true"
      && $("modalProva")?.getAttribute("aria-hidden") === "true"
      && $("modalChamadoAluno")?.getAttribute("aria-hidden") === "true") {
    document.body.style.overflow = "";
  }
}

async function abrirProva() {
  if (!state.cursoAtual) return;
  const resultado = melhorResultadoCurso(state.cursoAtual.id);
  if (resultado?.aprovado) {
    mostrarResultadoProva(resultado);
    return;
  }

  try {
    const { data, error } = await sb.rpc("obter_prova_aluno", { p_curso_id: Number(state.cursoAtual.id) });
    if (error) throw error;
    if (!data?.encontrada) return toast(data?.mensagem || "Prova não encontrada.", "error");
    if (!Array.isArray(data.questoes) || !data.questoes.length) return toast("A prova ainda não possui questões.", "error");

    state.prova = data;
    state.respostas = {};
    $("btnQuestaoAnterior").style.display = "inline-flex";
    $("btnQuestaoProxima").style.display = "inline-flex";
    state.questaoIndex = 0;
    setText("quizTitle", data.titulo || "Prova do curso");
    $("modalProva")?.setAttribute("aria-hidden", "false");
    renderQuestao();
  } catch (error) {
    toast(error.message || "Não foi possível abrir a prova.", "error");
  }
}

function renderQuestao() {
  const prova = state.prova;
  const questao = prova?.questoes?.[state.questaoIndex];
  if (!questao) return;

  const total = prova.questoes.length;
  const progress = Math.round(((state.questaoIndex + 1) / total) * 100);
  if ($("quizProgressBar")) $("quizProgressBar").style.width = `${progress}%`;
  setText("quizCounter", `Questão ${state.questaoIndex + 1} de ${total}`);

  const options = ["A", "B", "C", "D", "E"]
    .map((letter) => ({ letter, text: questao[letter.toLowerCase()] }))
    .filter((option) => String(option.text || "").trim());
  const selected = state.respostas[questao.id];
  $("quizBody").innerHTML = `
    <div class="quiz-question">
      <span class="quiz-question-number">Questão ${state.questaoIndex + 1}</span>
      <h3>${escapeHTML(questao.enunciado)}</h3>
      <div class="quiz-options">
        ${options.map((option) => `
          <label class="quiz-option ${selected === option.letter ? "selected" : ""}">
            <input type="radio" name="quizOption" value="${option.letter}" ${selected === option.letter ? "checked" : ""}>
            <b>${option.letter}</b>
            <span>${escapeHTML(option.text)}</span>
          </label>
        `).join("")}
      </div>
    </div>`;

  document.querySelectorAll('input[name="quizOption"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.respostas[questao.id] = input.value;
      renderQuestao();
    });
  });

  $("btnQuestaoAnterior").disabled = state.questaoIndex === 0;
  $("btnQuestaoProxima").textContent = state.questaoIndex === total - 1 ? "Finalizar prova" : "Próxima";
}

function questaoAnterior() {
  if (state.questaoIndex > 0) {
    state.questaoIndex--;
    renderQuestao();
  }
}

async function questaoProxima() {
  const questao = state.prova?.questoes?.[state.questaoIndex];
  if (!questao) return;
  if (!state.respostas[questao.id]) return toast("Escolha uma alternativa para continuar.", "error");

  if (state.questaoIndex < state.prova.questoes.length - 1) {
    state.questaoIndex++;
    renderQuestao();
    return;
  }

  const faltantes = state.prova.questoes.filter((item) => !state.respostas[item.id]);
  if (faltantes.length) {
    state.questaoIndex = state.prova.questoes.findIndex((item) => !state.respostas[item.id]);
    renderQuestao();
    return toast(`Ainda faltam ${faltantes.length} questões.`, "error");
  }

  await finalizarProva();
}

async function finalizarProva() {
  const button = $("btnQuestaoProxima");
  button.disabled = true;
  button.textContent = "Corrigindo...";
  try {
    const respostas = state.prova.questoes.map((questao) => ({
      questao_id: Number(questao.id),
      resposta: state.respostas[questao.id]
    }));
    const { data, error } = await sb.rpc("finalizar_prova", {
      p_prova_id: Number(state.prova.id),
      p_respostas: respostas
    });
    if (error) throw error;

    await carregarResultados();
    renderDashboard();
    renderCursos();
    renderCertificados();
    mostrarResultadoProva(data);
  } catch (error) {
    toast(`Erro ao finalizar prova: ${error.message}`, "error");
    button.disabled = false;
    button.textContent = "Finalizar prova";
  }
}

function mostrarResultadoProva(resultado) {
  $("modalProva")?.setAttribute("aria-hidden", "false");
  const aprovado = Boolean(resultado.aprovado);
  const total = Number(resultado.total_questoes || state.prova?.questoes?.length || 0);
  const acertos = Number(resultado.acertos || 0);
  const erros = Math.max(0, total - acertos);
  const dataRealizacao = resultado.criado_em || resultado.realizado_em || resultado.finalizado_em;
  const notaBruta = Number(resultado.nota || 0);
  const notaFinal = notaBruta > 10 ? notaBruta / 10 : notaBruta;
  const notaTexto = notaFinal.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  setText("quizTitle", "Resultado da prova");
  if ($("quizProgressBar")) $("quizProgressBar").style.width = "100%";
  $("quizBody").innerHTML = `
    <div class="quiz-result quiz-result-minimal ${aprovado ? "approved" : "failed"}">
      <h3>Resultado da prova</h3>
      <dl class="quiz-result-summary">
        <div><dt>Nota final</dt><dd>${notaTexto}</dd></div>
        <div><dt>Acertos</dt><dd>${acertos}${total ? ` de ${total}` : ""}</dd></div>
        <div><dt>Erros</dt><dd>${erros}</dd></div>
        <div><dt>Situação</dt><dd>${aprovado ? "Aprovado" : "Reprovado"}</dd></div>
        ${dataRealizacao ? `<div><dt>Realizada em</dt><dd>${new Date(dataRealizacao).toLocaleDateString("pt-BR")}</dd></div>` : ""}
      </dl>
      <button class="primary-button" type="button" onclick="fecharModal('prova')">Fechar</button>
    </div>`;
  $("quizCounter").textContent = "Resultado";
  $("btnQuestaoAnterior").style.display = "none";
  $("btnQuestaoProxima").style.display = "none";
}

function refazerProva() {
  $("btnQuestaoAnterior").style.display = "inline-flex";
  $("btnQuestaoProxima").style.display = "inline-flex";
  abrirProva();
}

function irParaCertificados() {
  fecharModal("prova");
  fecharModal("curso");
  abrirAba("certificados");
}

function rotuloAcaoCertificado(acao) {
  return ({
    SOLICITADO: "Solicitação enviada", LIBERADO: "Certificado liberado", EMITIDO: "Certificado emitido",
    BLOQUEADO: "Certificado bloqueado", AGUARDANDO_HORAS: "Certificado aguardando a data", AUTORIZADO_AGUARDANDO_DATA: "Emissão autorizada", CANCELADO: "Certificado cancelado", REABERTO: "Solicitação reaberta",
    IMPORTADO: "Registro importado", CRIADO: "Registro criado", ATUALIZADO: "Registro atualizado"
  })[String(acao || "").toUpperCase()] || String(acao || "Atualização").replaceAll("_", " ");
}

function mensagemPublicaHistoricoCertificado(item, certificado) {
  const status = String(item?.status_novo || certificado?.status || "").toUpperCase();

  if (["AGUARDANDO_HORAS","AUTORIZADO_AGUARDANDO_DATA"].includes(status) || certificadoAguardandoPrazo(certificado)) {
    const previsao = certificado?.previsao_liberacao || certificado?.data_final_prevista || certificado?.periodo_fim || certificado?.liberar_em;
    return previsao
      ? `Previsão de liberação: ${dataBR(previsao)}.`
      : "Aguardando a data de liberação do certificado.";
  }
  if (status === "PENDENTE") return "Solicitação aguardando análise.";
  if (status === "BLOQUEADO") return "Certificado temporariamente indisponível.";
  if (status === "CANCELADO") return "Solicitação cancelada.";

  // Para EMITIDO, não mostramos justificativas ou observações internas da gestão.
  return "";
}

function renderHistoricoCertificados() {
  const list = $("historicoCertificados");
  if (!list) return;
  const acoesPublicas = new Set(["SOLICITADO", "LIBERADO", "EMITIDO", "BLOQUEADO", "CANCELADO", "REABERTO"]);
  const historicoBase = [...state.certificadosHistorico]
    .filter((item) => acoesPublicas.has(String(item.acao || "").toUpperCase()))
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  const historico = [];
  const eventosEmitidos = new Set();
  historicoBase.forEach((item) => {
    const status = String(item.status_novo || "").toUpperCase();
    if (status === "EMITIDO") {
      const minute = String(item.criado_em || "").slice(0, 16);
      const key = `${Number(item.certificado_id || 0)}|${minute}|EMITIDO`;
      if (eventosEmitidos.has(key)) return;
      eventosEmitidos.add(key);
    }
    historico.push(item);
  });
  setText("contadorHistoricoCertificados", `${historico.length} ${historico.length === 1 ? "registro" : "registros"}`);
  if (!historico.length) {
    list.innerHTML = `<div class="empty-state">Nenhuma movimentação de certificado registrada.</div>`;
    return;
  }
  list.innerHTML = historico.map((item) => {
    const cert = state.certificados.find((c) => Number(c.id) === Number(item.certificado_id));
    const curso = state.cursos.find((c) => Number(c.id) === Number(item.curso_id));
    const mensagemPublica = mensagemPublicaHistoricoCertificado(item, cert);
    return `<article class="certificate-history-item">
      <div class="history-icon">${String(item.status_novo).toUpperCase() === "EMITIDO" ? "✓" : "•"}</div>
      <div><strong>${escapeHTML(rotuloAcaoCertificado(item.acao))}</strong><span>${escapeHTML(cert?.nome_curso || curso?.titulo || "Curso")}</span>${mensagemPublica ? `<small>${escapeHTML(mensagemPublica)}</small>` : ""}</div>
      <div class="history-date">${dataBR(item.criado_em, true)}${item.status_novo ? statusPill(item.status_novo) : ""}</div>
    </article>`;
  }).join("");
}

function renderResumoCarteiraHoras() {
  const box = $("resumoCarteiraHoras");
  if (!box) return;
  const totais = state.carteirasHoras.reduce((acc, item) => {
    acc.validadas += Number(item.horas_validadas || 0);
    acc.reservadas += Number(item.horas_reservadas || 0);
    acc.utilizadas += Number(item.horas_utilizadas || 0);
    acc.disponiveis += Number(item.saldo_disponivel || 0);
    return acc;
  }, { validadas: 0, reservadas: 0, utilizadas: 0, disponiveis: 0 });
  box.innerHTML = `
    <article><span>Horas acumuladas</span><strong>${totais.validadas}h</strong></article>
    <article><span>Saldo disponível</span><strong>${totais.disponiveis}h</strong></article>
    <article><span>Em análise</span><strong>${totais.reservadas}h</strong></article>
    <article><span>Já certificadas</span><strong>${totais.utilizadas}h</strong></article>`;
}

function rotuloMovimentoHoras(tipo) {
  return ({
    CREDITO_GESTOR: "Horas liberadas pela gestão",
    CREDITO_EXCEPCIONAL: "Liberação excepcional",
    AJUSTE_GESTOR: "Ajuste de horas",
    RESERVA_SOLICITACAO: "Horas reservadas para solicitação",
    LIBERACAO_CERTIFICADO: "Certificado liberado",
    ESTORNO_RESERVA: "Horas devolvidas ao saldo",
    CANCELAMENTO: "Solicitação cancelada",
    IMPORTACAO: "Saldo anterior importado"
  })[String(tipo || "").toUpperCase()] || String(tipo || "Movimentação").replaceAll("_", " ");
}

function renderExtratoHoras() {
  const list = $("extratoHoras");
  if (!list) return;
  const rows = state.movimentacoesHoras.slice(0, 30);
  setText("contadorExtratoHoras", `${state.movimentacoesHoras.length} ${state.movimentacoesHoras.length === 1 ? "movimentação" : "movimentações"}`);
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">Nenhuma movimentação de horas registrada.</div>`;
    return;
  }
  list.innerHTML = rows.map((item) => {
    const curso = state.cursos.find((c) => Number(c.id) === Number(item.curso_id));
    const sinal = Number(item.horas || 0) > 0 ? "+" : "";
    return `<article class="hours-history-item">
      <div><strong>${escapeHTML(rotuloMovimentoHoras(item.tipo))}</strong><span>${escapeHTML(item.observacao || "Carteira global do aluno")}</span></div>
      <div class="hours-history-value"><b>${sinal}${Number(item.horas || 0)}h</b><small>${dataBR(item.criado_em, true)}</small></div>
    </article>`;
  }).join("");
}

function renderCertificadosEmitidos() {
  const list = $("listaCertificadosEmitidos");
  if (!list) return;
  const emitidos = state.certificados
    .filter(certificadoEstaLiberado)
    .sort((a, b) => new Date(b.emitido_em || b.atualizado_em || b.criado_em) - new Date(a.emitido_em || a.atualizado_em || a.criado_em));

  setText("contadorCertificadosEmitidos", `${emitidos.length} ${emitidos.length === 1 ? "emitido" : "emitidos"}`);
  if (!emitidos.length) {
    list.innerHTML = `<div class="empty-state issued-empty">Nenhum certificado foi emitido ainda. O PDF será disponibilizado somente depois da liberação da gestão.</div>`;
    return;
  }

  list.innerHTML = emitidos.map((cert) => {
    const curso = state.cursos.find((item) => Number(item.id) === Number(cert.curso_id));
    const titulo = cert.nome_curso || curso?.titulo || "Curso concluído";
    const categoria = curso?.categoria || "Certificação profissional";
    const codigo = cert.codigo_validacao || cert.numero_certificado || "";
    const periodo = cert.periodo_inicio && cert.periodo_fim
      ? `${dataBR(cert.periodo_inicio)} a ${dataBR(cert.periodo_fim)}`
      : "Período registrado na emissão";
    return `<article class="issued-certificate-card">
      <div class="issued-certificate-mark">✓</div>
      <div class="issued-certificate-content">
        <span class="eyebrow">${escapeHTML(categoria)}</span>
        <h3>${escapeHTML(titulo)}</h3>
        <div class="issued-certificate-meta">
          <span><b>${Number(cert.horas_emitidas || 0)}h</b> certificadas</span>
          <span><b>${Number(cert.nota_final || 0)}%</b> de nota final</span>
          <span>Período: <b>${escapeHTML(periodo)}</b></span>
          <span>Emitido em <b>${dataBR(cert.emitido_em)}</b></span>
        </div>
        <small>Registro ${escapeHTML(cert.numero_certificado || "—")}</small>
      </div>
      <div class="issued-certificate-actions">
        <button class="secondary-button" type="button" onclick="copiarCodigoCertificado(${Number(cert.id)})">Copiar código</button>
        <a class="secondary-button certificate-validate-link" target="_blank" href="8-certificados.html?codigo=${encodeURIComponent(codigo)}">Validar</a>
        <button class="primary-button" type="button" onclick="baixarCertificado(${Number(cert.id)})">Baixar PDF</button>
      </div>
    </article>`;
  }).join("");
}

function renderCertificados() {
  const list = $("listaCertificados");
  if (!list) return;
  renderResumoCarteiraHoras();
  renderCertificadosEmitidos();

  if (!state.cursos.length) {
    list.innerHTML = `<div class="empty-state">Nenhum curso matriculado.</div>`;
    renderHistoricoCertificados();
    return;
  }

  list.innerHTML = state.cursos.map((curso) => {
    const progressoOk = clamp(curso.progresso) >= 100;
    const resultado = melhorResultadoCurso(curso.id);
    const notaMinima = Number(curso.nota_minima || 70);
    const provaOk = Boolean(resultado?.aprovado && Number(resultado.nota) >= notaMinima);
    const carteira = carteiraHorasCurso(curso.id);
    const saldo = Number(carteira?.saldo_disponivel || 0);
    const certificadosCurso = certificadosDoCurso(curso.id);
    const emitido = certificadosCurso.find((item) => String(item.status).toUpperCase() === "EMITIDO");
    if (emitido) return "";
    const ativo = certificadosCurso.find((item) => ["PENDENTE","AGUARDANDO_HORAS","AUTORIZADO_AGUARDANDO_DATA"].includes(String(item.status).toUpperCase()));
    const bloqueado = certificadosCurso.find((item) => String(item.status).toUpperCase() === "BLOQUEADO");
    const pronto = progressoOk && provaOk;
    const options = opcoesHorasDisponiveis(saldo);

    let actions = `<button class="secondary-button" type="button" disabled>Conclua os requisitos</button>`;
    let help = "Conclua o conteúdo e a prova para solicitar o certificado.";
    let statusVisual = "BLOQUEADO";

    if (ativo) {
      const status = String(ativo.status || "").toUpperCase();
      const previsao = ativo.previsao_liberacao || ativo.data_final_prevista || ativo.periodo_fim || ativo.liberar_em;
      statusVisual = status;
      help = previsao ? `Previsão de liberação: ${dataBR(previsao)}.` : "Aguardando a previsão de liberação.";
      if (status === "AUTORIZADO_AGUARDANDO_DATA") help += " Emissão autorizada pela gestão.";
      else if (!["PAGO","ISENTO"].includes(String(ativo.pagamento_status || "").toUpperCase())) help += " Pagamento pendente.";
      else help += " Aguardando autorização da gestão.";
      actions = `<button class="secondary-button" type="button" disabled>Aguardando liberação</button>`;
    } else if (bloqueado) {
      statusVisual = "BLOQUEADO";
      help = "A solicitação está temporariamente indisponível.";
      actions = `<button class="secondary-button" type="button" disabled>Solicitação bloqueada</button>`;
    } else if (pronto) {
      statusVisual = "DISPONÍVEL";
      help = "Escolha a carga desejada. A previsão será calculada pelo limite global de 8 horas por dia.";
      const defaultHours = options.includes(50) ? 50 : options[0];
      actions = `<div class="hours-request-control">
        <label for="horasSolicitadas-${Number(curso.id)}">Horas deste certificado</label>
        <select id="horasSolicitadas-${Number(curso.id)}">${options.map((h) => `<option value="${h}"${h === defaultHours ? " selected" : ""}>${h} horas</option>`).join("")}</select>
        <label for="cupomSolicitacao-${Number(curso.id)}">Cupom de desconto <small>(opcional)</small></label>
        <input id="cupomSolicitacao-${Number(curso.id)}" class="certificate-coupon-before-request" type="text" maxlength="30" autocomplete="off" placeholder="Digite o cupom antes de solicitar">
        <small class="coupon-request-help">Cupom integral zera o pagamento. A emissão ainda aguardará a data prevista e a autorização da gestão.</small>
        <button class="primary-button" type="button" onclick="solicitarCertificado(${Number(curso.id)})">Solicitar certificado</button>
      </div>`;
    }

    const avaliacao = avaliacaoDoCurso(curso.id);
    const avaliacaoHtml = pronto
      ? (avaliacao
        ? `<div class="course-review-done"><span class="review-stars-static">${"★".repeat(Number(avaliacao.nota || 0))}${"☆".repeat(5 - Number(avaliacao.nota || 0))}</span><strong>Sua avaliação</strong></div>`
        : `<button class="course-review-button" type="button" onclick="avaliarCurso(${Number(curso.id)})">Avaliar este curso</button>`)
      : "";

    return `<article class="certificate-card hours-wallet-card">
      <div class="certificate-card-top">
        <div><span class="eyebrow">${escapeHTML(curso.categoria || "Certificação")}</span><h3>${escapeHTML(curso.titulo || "Curso")}</h3><p>${resultado ? `Melhor nota: ${Number(resultado.nota || 0)}%` : "Prova pendente"}</p></div>
        ${statusPill(statusVisual)}
      </div>
      <div class="certificate-requirements">
        <div class="requirement ${progressoOk ? "ok" : ""}"><b>${progressoOk ? "✓" : "1"}</b><span>Conteúdo 100% concluído</span></div>
        <div class="requirement ${provaOk ? "ok" : ""}"><b>${provaOk ? "✓" : "2"}</b><span>Prova com nota mínima de ${notaMinima}%</span></div>
      </div>
      <div class="certificate-card-footer"><span class="certificate-code">${escapeHTML(help)}</span><div class="certificate-actions">${actions}</div></div>
      ${avaliacaoHtml}
    </article>`;
  }).join("");
  renderHistoricoCertificados();
}

function garantirModalAvaliacao() {
  let modal = document.getElementById("modalAvaliacaoCurso");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "modalAvaliacaoCurso";
  modal.className = "review-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="review-modal-card" role="dialog" aria-modal="true" aria-labelledby="reviewModalTitle">
      <button type="button" class="review-modal-close" aria-label="Fechar">×</button>
      <span class="eyebrow">Avaliação do curso</span>
      <h3 id="reviewModalTitle">Como foi sua experiência?</h3>
      <p>Selecione de 1 a 5 estrelas.</p>
      <div class="review-star-picker" role="radiogroup" aria-label="Nota do curso">
        ${[1,2,3,4,5].map((n) => `<button type="button" data-review-star="${n}" role="radio" aria-checked="false" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</button>`).join("")}
      </div>
      <textarea id="reviewComment" rows="4" maxlength="500" placeholder="Comentário opcional"></textarea>
      <div class="review-modal-actions"><button type="button" class="secondary-button review-cancel">Cancelar</button><button type="button" class="primary-button review-save" disabled>Enviar avaliação</button></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => { modal.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; };
  modal.querySelector(".review-modal-close").addEventListener("click", close);
  modal.querySelector(".review-cancel").addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.querySelectorAll("[data-review-star]").forEach((button) => button.addEventListener("click", () => {
    modal.dataset.nota = button.dataset.reviewStar;
    const selected = Number(button.dataset.reviewStar);
    modal.querySelectorAll("[data-review-star]").forEach((star) => {
      const active = Number(star.dataset.reviewStar) <= selected;
      star.classList.toggle("selected", active);
      star.setAttribute("aria-checked", String(Number(star.dataset.reviewStar) === selected));
    });
    modal.querySelector(".review-save").disabled = false;
  }));
  modal.querySelector(".review-save").addEventListener("click", async () => {
    const nota = Number(modal.dataset.nota || 0);
    const cursoId = Number(modal.dataset.cursoId || 0);
    const comentario = modal.querySelector("#reviewComment").value.trim();
    if (!nota || !cursoId) return;
    const button = modal.querySelector(".review-save");
    button.disabled = true; button.textContent = "Enviando...";
    try {
      const { error } = await sb.rpc("avaliar_curso", { p_curso_id: cursoId, p_nota: nota, p_comentario: comentario || null });
      if (error) throw error;
      await carregarAvaliacoes();
      renderCertificados();
      close();
      toast("Avaliação registrada. Obrigado!", "success");
    } catch (error) {
      toast(`Não foi possível avaliar: ${error.message}`, "error");
    } finally {
      button.disabled = false; button.textContent = "Enviar avaliação";
    }
  });
  return modal;
}

async function avaliarCurso(cursoId) {
  const modal = garantirModalAvaliacao();
  const curso = state.cursos.find((item) => Number(item.id) === Number(cursoId));
  modal.dataset.cursoId = String(cursoId);
  modal.dataset.nota = "";
  modal.querySelector("#reviewModalTitle").textContent = curso?.titulo || "Como foi sua experiência?";
  modal.querySelector("#reviewComment").value = "";
  modal.querySelector(".review-save").disabled = true;
  modal.querySelectorAll("[data-review-star]").forEach((star) => { star.classList.remove("selected"); star.setAttribute("aria-checked", "false"); });
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

async function solicitarCertificado(cursoId) {
  const select = $(`horasSolicitadas-${Number(cursoId)}`);
  const cupomInput = $(`cupomSolicitacao-${Number(cursoId)}`);
  const horas = Number(select?.value || 0);
  const cupom = String(cupomInput?.value || "").trim().toUpperCase();
  if (!horas || horas < 5 || horas % 5 !== 0) return toast("Escolha a quantidade de horas de 5 em 5.", "error");
  const curso = state.cursos.find((item) => Number(item.id) === Number(cursoId)) || {};
  const profissional = String(curso.tipo_curso || "PROFISSIONAL").toUpperCase() !== "TECNICO";
  const confirmou = window.AltitudeDialog
    ? await window.AltitudeDialog.confirm({
        title: `Solicitar certificado de ${horas}h`,
        message: profissional
          ? `A solicitação será registrada mesmo que o saldo atual ainda não tenha todas as horas. O sistema calculará a data de liberação pelo limite global de 8 horas por dia.${cupom ? ` O cupom ${cupom} será validado antes do envio.` : ""}`
          : `Confirmar a solicitação do certificado técnico de ${horas} horas?${cupom ? ` O cupom ${cupom} será validado.` : ""}`,
        confirmText: "Enviar solicitação"
      })
    : window.confirm(`Solicitar certificado de ${horas} horas?`);
  if (!confirmou) return;
  const button = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  if (button) { button.disabled = true; button.textContent = "Enviando..."; }
  try {
    const rpc = profissional ? "solicitar_certificado_profissional_v34_3" : "solicitar_certificado_curso_v34";
    const { data, error } = await sb.rpc(rpc, {
      p_curso_id: Number(cursoId), p_horas: horas, p_cupom: cupom || null
    });
    if (error) throw error;
    await Promise.all([carregarCertificados(), carregarHistoricoCertificados(), carregarCarteirasHoras()]);
    renderDashboard(); renderCertificados(); renderPagamentos(); window.renderSolicitacoesPagamentoV34?.();
    const previsao = data?.previsao_liberacao || data?.data_final_prevista || data?.periodo_fim;
    const statusPagamento = String(data?.pagamento_status || "").toUpperCase();
    if (statusPagamento === "ISENTO") {
      toast(`Solicitação gratuita registrada.${previsao ? ` Previsão de liberação: ${dataBR(previsao)}.` : ""} Aguarda a autorização da gestão.`, "success");
      abrirAba("certificados");
    } else {
      toast(`Solicitação registrada.${previsao ? ` Previsão de liberação: ${dataBR(previsao)}.` : ""}`, "success");
      abrirAba("pagamentos");
    }
  } catch (error) {
    toast(`Não foi possível solicitar: ${error.message}`, "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Solicitar certificado"; }
  }
}

async function emitirCertificado(cursoId) {
  return solicitarCertificado(cursoId);
}

async function imagemParaDataURL(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Não foi possível carregar a logomarca.");
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function imagemCircularDataURL(src, size = 320) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

async function gerarQrDataUrl(texto) {
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-9999px";
  holder.style.top = "-9999px";
  document.body.appendChild(holder);

  try {
    new window.QRCode(holder, {
      text: texto,
      width: 360,
      height: 360,
      correctLevel: window.QRCode.CorrectLevel.H
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const canvas = holder.querySelector("canvas");
    if (canvas) return canvas.toDataURL("image/png");
    const image = holder.querySelector("img");
    if (image?.src) return image.src;
    throw new Error("Não foi possível montar o QR Code.");
  } finally {
    holder.remove();
  }
}

async function carregarConteudoProgramatico(cursoId, totalHoras) {
  const { data, error } = await sb.from("modulos").select("id,titulo,ordem").eq("curso_id", Number(cursoId)).order("ordem");
  if (error) throw error;
  const modules = data || [];
  const hoursTotal = Math.max(0, Number(totalHoras || 0));
  if (!modules.length) return [{ titulo: "Conteúdo programático do curso", horas: hoursTotal }];
  const base = Math.floor(hoursTotal / modules.length);
  const remainder = hoursTotal % modules.length;
  return modules.map((item, index) => ({
    titulo: String(item.titulo || `Módulo ${index + 1}`).replace(/^m[oó]dulo\s*\d+\s*[-–—:]?\s*/i, '').trim() || `Módulo ${index + 1}`,
    horas: base + (index < remainder ? 1 : 0)
  }));
}

function desenharMolduraCertificado(doc, pageWidth, pageHeight) {
  doc.setFillColor(248, 250, 253);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(7, 49, 79);
  doc.triangle(0, 0, 86, 0, 0, 72, "F");
  doc.setFillColor(55, 177, 203);
  doc.triangle(0, 0, 62, 0, 0, 52, "F");
  doc.setFillColor(7, 49, 79);
  doc.triangle(pageWidth, pageHeight, pageWidth - 78, pageHeight, pageWidth, pageHeight - 66, "F");
  doc.setFillColor(55, 177, 203);
  doc.triangle(pageWidth, pageHeight, pageWidth - 55, pageHeight, pageWidth, pageHeight - 46, "F");
  doc.setDrawColor(176, 143, 102);
  doc.setLineWidth(.5);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
  doc.setDrawColor(215, 224, 233);
  doc.setLineWidth(.25);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28);
}

async function baixarCertificado(certificadoId) {
  const cert = state.certificados.find((item) => Number(item.id) === Number(certificadoId));
  if (!cert) return toast("Certificado não encontrado.", "error");
  if (!certificadoEstaLiberado(cert)) return toast("O certificado ainda está aguardando liberação.", "error");
  if (!cert.codigo_validacao) return toast("Código de autenticação não encontrado.", "error");
  if (!window.AltitudeCertificatePDF) return toast("Gerador do certificado não carregou.", "error");

  const courseData = state.cursos.find((item) => Number(item.id) === Number(cert.curso_id)) || {};
  const codigo = cert.codigo_validacao || cert.numero_certificado;
  const validationUrl = `${window.location.origin}/Projeto/1-html/8-certificados.html?codigo=${encodeURIComponent(codigo)}`;

  try {
    await window.AltitudeCertificatePDF.download({
      sb,
      cert,
      aluno: state.aluno || {},
      curso: courseData,
      logoUrl: "../3-img/LOGO.png",
      validationUrl
    });
  } catch (error) {
    console.error("Certificado do aluno:", error);
    toast(`Não foi possível gerar o certificado: ${error.message}`, "error");
  }
}

async function copiarCodigoCertificado(certificadoId) {
  const cert = state.certificados.find((item) => Number(item.id) === Number(certificadoId));
  const code = cert?.numero_certificado || cert?.codigo_validacao;
  if (!code) return toast("Código ainda não disponível.", "error");
  try {
    await navigator.clipboard.writeText(String(code));
    toast("Código copiado.", "success");
  } catch {
    toast(`Código: ${code}`);
  }
}

function renderPagamentos() {
  const list = $("listaPagamentos");
  if (!list) return;
  if (!state.pagamentos.length) {
    list.innerHTML = `<div class="empty-state">Os pagamentos confirmados aparecerão aqui.</div>`;
  } else {
    list.innerHTML = `<table class="portal-table"><thead><tr><th>Descrição</th><th>Valor</th><th>Desconto</th><th>Total</th><th>Status</th><th>Data</th></tr></thead><tbody>${state.pagamentos.map((item) => `<tr><td>${escapeHTML(item.descricao || item.finalidade || "Pagamento")}</td><td>${dinheiro(item.valor)}</td><td>${dinheiro(item.desconto)}</td><td><strong>${dinheiro(item.valor_final || item.valor)}</strong></td><td>${statusPill(item.status)}</td><td>${dataBR(item.criado_em)}</td></tr>`).join("")}</tbody></table>`;
  }
  if (window.renderSolicitacoesPagamentoV34) window.renderSolicitacoesPagamentoV34();
}

async function carregarChamados() {
  const { data, error } = await sb
    .from("chamados")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("id", { ascending: false });
  if (error) throw error;

  const chamados = data || [];
  state.chamados = chamados;
  setText("chAbertos", chamados.filter((item) => item.status === "ABERTO").length);
  setText("chAndamento", chamados.filter((item) => item.status === "EM_ANDAMENTO").length);
  setText("chResolvidos", chamados.filter((item) => item.status === "RESOLVIDO").length);

  const list = $("listaChamados");
  if (!list) return;
  list.innerHTML = chamados.length ? chamados.map((item) => {
    const ultima = String(item.ultima_resposta || item.mensagem || "").trim();
    const temResposta = Boolean(String(item.ultima_resposta || "").trim());
    return `
      <article class="ticket-card ${temResposta ? "has-reply" : ""}" data-ticket-student-id="${Number(item.id)}">
        <div class="ticket-card-main">
          <div class="ticket-card-heading">
            <span class="eyebrow">${escapeHTML(item.protocolo || `Chamado ${item.id}`)}</span>
            ${statusPill(item.status)}
          </div>
          <h3>${escapeHTML(item.assunto || "Chamado")}</h3>
          <p>${escapeHTML(ultima).slice(0, 240)}${ultima.length > 240 ? "…" : ""}</p>
          <div class="ticket-card-meta">
            <small>${dataBR(item.atualizado_em || item.criado_em, true)}</small>
            ${temResposta ? '<b>Nova resposta da Equipe Altitude</b>' : '<span>Aguardando interação</span>'}
          </div>
        </div>
        <button type="button" class="secondary-button ticket-open-student" data-ticket-student-open="${Number(item.id)}">Ver conversa</button>
      </article>`;
  }).join("") : `<div class="empty-state">Nenhum chamado aberto.</div>`;

  if (state.chamadoAtual && $("modalChamadoAluno")?.getAttribute("aria-hidden") === "false") {
    const atual = chamados.find((item) => Number(item.id) === Number(state.chamadoAtual.id));
    if (atual) {
      state.chamadoAtual = atual;
      await carregarHistoricoChamadoAluno(atual.id, { silencioso: true });
    }
  }
}

function rotuloStatusChamado(status) {
  return ({ ABERTO: "Aberto", EM_ANDAMENTO: "Em andamento", RESOLVIDO: "Resolvido", CANCELADO: "Cancelado" })[String(status || "").toUpperCase()] || String(status || "—").replaceAll("_", " ");
}

function rotuloPrioridadeChamado(prioridade) {
  return ({ BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente" })[String(prioridade || "").toUpperCase()] || "Média";
}

function preencherCabecalhoChamadoAluno(item) {
  setText("alunoChamadoTitulo", item.assunto || "Chamado");
  setText("alunoChamadoProtocolo", item.protocolo || `#${item.id}`);
  setText("alunoChamadoCategoria", item.categoria || "OUTRO");
  setText("alunoChamadoPrioridade", rotuloPrioridadeChamado(item.prioridade));
  setText("alunoChamadoCriado", dataBR(item.criado_em, true));
  setText("alunoChamadoAtualizado", dataBR(item.atualizado_em || item.criado_em, true));
  const status = $("alunoChamadoStatus");
  if (status) status.innerHTML = statusPill(item.status);
  const form = $("formRespostaChamadoAluno");
  const encerrado = String(item.status || "").toUpperCase() === "CANCELADO";
  if (form) form.hidden = encerrado;
  const note = $("alunoChamadoReplyNote");
  if (note) note.textContent = String(item.status || "").toUpperCase() === "RESOLVIDO"
    ? "Ao enviar uma nova mensagem, o chamado volta para Em andamento."
    : "A Equipe Altitude receberá sua mensagem neste mesmo protocolo.";
}

function renderHistoricoChamadoAluno(item, interacoes = []) {
  const box = $("alunoChamadoHistorico");
  if (!box) return;
  const messages = [{
    id: `initial-${item.id}`,
    autor_tipo: "ALUNO",
    mensagem: item.mensagem || "",
    criado_em: item.criado_em,
    inicial: true
  }, ...interacoes];

  const temRespostaGestor = interacoes.some((interaction) => String(interaction.autor_tipo).toUpperCase() === "GESTOR");
  if (!temRespostaGestor && String(item.ultima_resposta || "").trim()) {
    messages.push({
      id: `fallback-${item.id}`,
      autor_tipo: "GESTOR",
      mensagem: item.ultima_resposta,
      criado_em: item.respondido_em || item.atualizado_em
    });
  }

  box.innerHTML = messages.map((message) => {
    const gestor = String(message.autor_tipo || "ALUNO").toUpperCase() === "GESTOR";
    return `
      <article class="student-ticket-message ${gestor ? "team" : "student"}">
        <header><strong>${gestor ? "Equipe Altitude" : "Você"}</strong><span>${dataBR(message.criado_em, true)}</span></header>
        <p>${escapeHTML(message.mensagem || "").replaceAll("\n", "<br>")}</p>
        ${message.inicial ? '<small>Mensagem de abertura do chamado</small>' : ""}
      </article>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

async function carregarHistoricoChamadoAluno(chamadoId, options = {}) {
  const box = $("alunoChamadoHistorico");
  if (!box) return;
  if (!options.silencioso) box.innerHTML = '<div class="empty-state">Carregando conversa...</div>';
  try {
    let item = state.chamados.find((ticket) => Number(ticket.id) === Number(chamadoId));
    const rpc = await sb.rpc("aluno_detalhar_chamado", { p_chamado_id: Number(chamadoId) });
    let interacoes = [];
    if (!rpc.error && rpc.data) {
      item = { ...(item || {}), ...(rpc.data.chamado || {}) };
      interacoes = rpc.data.interacoes || [];
    } else {
      const direct = await sb.from("chamado_interacoes").select("*").eq("chamado_id", Number(chamadoId)).order("criado_em");
      if (direct.error) throw rpc.error || direct.error;
      interacoes = direct.data || [];
    }
    if (!item) throw new Error("Chamado não encontrado.");
    state.chamadoAtual = item;
    preencherCabecalhoChamadoAluno(item);
    renderHistoricoChamadoAluno(item, interacoes);
  } catch (error) {
    box.innerHTML = `<div class="empty-state error-state">Não foi possível carregar as respostas: ${escapeHTML(error.message)}. Execute a atualização SQL 012 no Supabase.</div>`;
  }
}

async function abrirDetalhesChamadoAluno(chamadoId) {
  const item = state.chamados.find((ticket) => Number(ticket.id) === Number(chamadoId));
  if (!item) return toast("Chamado não encontrado. Atualize a página.", "error");
  state.chamadoAtual = item;
  preencherCabecalhoChamadoAluno(item);
  $("modalChamadoAluno")?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  await carregarHistoricoChamadoAluno(item.id);
}

function fecharChamadoAluno() {
  $("modalChamadoAluno")?.setAttribute("aria-hidden", "true");
  state.chamadoAtual = null;
  document.body.style.overflow = "";
}

async function responderChamadoAluno(event) {
  event.preventDefault();
  if (!state.chamadoAtual) return;
  const textarea = $("alunoChamadoResposta");
  const mensagem = textarea?.value?.trim() || "";
  if (mensagem.length < 2) return toast("Escreva uma mensagem.", "error");
  const button = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = "Enviando..."; }
  try {
    const { data, error } = await sb.rpc("aluno_responder_chamado", {
      p_chamado_id: Number(state.chamadoAtual.id),
      p_mensagem: mensagem
    });
    if (error) throw error;
    if (textarea) textarea.value = "";
    if (data?.chamado) state.chamadoAtual = { ...state.chamadoAtual, ...data.chamado };
    toast("Mensagem enviada para a Equipe Altitude.", "success");
    await carregarChamados();
    await carregarHistoricoChamadoAluno(state.chamadoAtual.id);
  } catch (error) {
    toast(`Não foi possível enviar: ${error.message}`, "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Enviar mensagem"; }
  }
}

async function abrirChamado(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  if (!submit) return;
  submit.disabled = true;
  submit.textContent = "Enviando...";
  try {
    const protocolo = `ALT-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const { error } = await sb.from("chamados").insert({
      protocolo,
      aluno_id: state.aluno.user_id,
      assunto: $("chAssunto").value.trim(),
      categoria: $("chCategoria").value,
      prioridade: "MEDIA",
      mensagem: $("chMensagem").value.trim(),
      status: "ABERTO"
    });
    if (error) throw error;
    form.reset();
    toast(`Chamado aberto: ${protocolo}`, "success");
    await carregarChamados();
  } catch (error) {
    toast(`Erro ao abrir chamado: ${error.message}`, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "Enviar chamado";
  }
}

async function uploadFoto(file) {
  if (!file) return state.aluno.foto_url || null;
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem válida.");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${state.aluno.user_id}/avatar.${extension}`;
  const { error } = await sb.storage.from("fotos_alunos").upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600"
  });
  if (error) throw error;
  const publicUrl = sb.storage.from("fotos_alunos").getPublicUrl(path).data.publicUrl;
  return `${publicUrl}?v=${Date.now()}`;
}

async function salvarCadastro(event) {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Salvando...";
  try {
    const fotoUrl = await uploadFoto($("fotoAlunoInput")?.files?.[0]);
    const payload = {
      nome: $("cadNome").value.trim(),
      email: $("cadEmail").value.trim().toLowerCase(),
      telefone: $("cadTelefone").value.replace(/\D/g, "") || null,
      data_nascimento: $("cadNascimento").value || null,
      objetivo: $("cadObjetivo").value || null,
      foto_url: fotoUrl
    };
    const { error } = await sb.from("alunos").update(payload).eq("user_id", state.aluno.user_id);
    if (error) throw error;
    toast("Cadastro atualizado.", "success");
    await carregarAluno();
  } catch (error) {
    toast(`Erro ao salvar cadastro: ${error.message}`, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "Salvar alterações";
  }
}

function renderCarteirinha() {
  const box = $("boxCarteirinha");
  if (!box || !state.aluno) return;
  const downloadButton = $("btnBaixarCarteirinha");
  if (!alunoPodeTerCarteirinha()) {
    box.innerHTML = `<div class="student-card-locked"><span>🔒</span><strong>Carteirinha ainda não liberada</strong><p>Conclua o conteúdo e seja aprovado em pelo menos um curso da Altitude. Depois disso, a carteirinha com QR Code ficará disponível automaticamente.</p></div>`;
    if (downloadButton) { downloadButton.disabled = true; downloadButton.textContent = "Disponível após concluir um curso"; }
    return;
  }
  if (downloadButton) { downloadButton.disabled = false; downloadButton.textContent = "Baixar carteirinha em PDF"; }
  const code = state.aluno.codigo_carteirinha || "";
  box.innerHTML = `
    <div class="digital-card">
      <div class="digital-card-top"><img src="../3-img/LOGO.png" alt="Altitude"><span>${new Date().getFullYear()}</span></div>
      <div class="digital-card-body">
        <img src="${escapeHTML(imgAluno(state.aluno.foto_url))}" alt="Foto do aluno">
        <div class="digital-card-data"><strong class="student-card-name">${escapeHTML(String(state.aluno.nome || "Aluno").toUpperCase())}</strong><span class="student-card-ra"><b>RA</b> ${escapeHTML(state.aluno.ra || "—")}</span><span>Status: ${escapeHTML(state.aluno.status || "ATIVO")}</span><span>ALTITUDE CENTRO UNIVERSITÁRIO</span></div>
      </div>
      <div class="digital-card-footer">
        <div><strong>CARTEIRINHA DIGITAL</strong><span>Documento verificável na base oficial</span></div>
        <div class="digital-card-qr"><div id="qrCarteirinha" aria-label="QR Code de validação da carteirinha"></div><small>Validar</small></div>
      </div>
    </div>`;

  const holder = $("qrCarteirinha");
  if (!holder) return;
  if (!code || !window.QRCode) {
    holder.innerHTML = '<span class="qr-pending">QR indisponível</span>';
    return;
  }
  const validationUrl = new URL(`13-validar-carteirinha.html?codigo=${encodeURIComponent(code)}`, window.location.href).href;
  holder.innerHTML = "";
  new window.QRCode(holder, {
    text: validationUrl,
    width: 78,
    height: 78,
    colorDark: "#07314f",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.H
  });
  // qrcodejs cria canvas e imagem de fallback. Mantemos somente um elemento visível.
  requestAnimationFrame(() => {
    const canvases = holder.querySelectorAll("canvas");
    const images = holder.querySelectorAll("img");
    if (canvases.length) {
      images.forEach((img) => img.remove());
      [...canvases].slice(1).forEach((canvas) => canvas.remove());
    } else {
      [...images].slice(1).forEach((img) => img.remove());
    }
  });
}

async function baixarCarteirinhaPDF() {
  if (!alunoPodeTerCarteirinha()) return toast("A carteirinha será liberada após a conclusão e aprovação em pelo menos um curso.", "error");
  if (!state.aluno?.codigo_carteirinha) return toast("Código da carteirinha indisponível. Execute a atualização 04.", "error");
  if (!window.jspdf?.jsPDF || !window.QRCode) return toast("Gerador de PDF ou QR Code não carregado.", "error");
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [54, 85.6] });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const url = new URL(`13-validar-carteirinha.html?codigo=${encodeURIComponent(state.aluno.codigo_carteirinha)}`, window.location.href).href;
    const qr = await gerarQrDataUrl(url);
    if (!state.logoDataUrl) state.logoDataUrl = await imagemParaDataURL("../3-img/LOGO.png");
    let photo = null;
    try { photo = await imagemCircularDataURL(imgAluno(state.aluno.foto_url)); } catch {}

    doc.setFillColor(255, 255, 255); doc.rect(0, 0, w, h, "F");
    doc.setFillColor(7, 49, 79); doc.roundedRect(1.5, 1.5, w - 3, h - 3, 3, 3, "F");
    doc.setFillColor(255, 255, 255); doc.roundedRect(1.5, 1.5, w - 3, 14, 3, 3, "F");
    doc.addImage(state.logoDataUrl, "PNG", 6, 5.3, 31, 4.8, undefined, "FAST");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(7, 49, 79);
    doc.text(String(new Date().getFullYear()), w - 7, 8.6, { align: "right" });

    if (photo) {
      doc.setFillColor(255,255,255); doc.circle(15, 29, 10, "F");
      doc.addImage(photo, "PNG", 5, 19, 20, 20, undefined, "FAST");
    } else { doc.setFillColor(82, 192, 217); doc.circle(15, 29, 10, "F"); }

    doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(7.2);
    const nameLines = doc.splitTextToSize(String(state.aluno.nome || "Aluno").toUpperCase(), 38);
    doc.text(nameLines.slice(0,3), 28, 21);
    const infoY = 21 + Math.min(3,nameLines.length)*4.1 + 2;
    doc.setFont("helvetica","normal"); doc.setFontSize(5.2); doc.setTextColor(210,228,241);
    doc.text(`RA: ${state.aluno.ra || "—"}`, 28, infoY);
    doc.text(`STATUS: ${state.aluno.status || "ATIVO"}`, 28, infoY + 4);
    doc.text("ALTITUDE CENTRO UNIVERSITÁRIO", 28, infoY + 8);

    doc.setFillColor(255,255,255); doc.roundedRect(w - 21, h - 21, 17, 17, 1.5, 1.5, "F");
    doc.addImage(qr, "PNG", w - 20, h - 20, 15, 15);
    doc.setFont("helvetica","bold"); doc.setFontSize(4.5); doc.setTextColor(255,255,255);
    doc.text("CARTEIRINHA DIGITAL", 6, h - 12);
    doc.setFont("helvetica","normal"); doc.setTextColor(190,218,235);
    doc.text("Escaneie o QR Code para validar", 6, h - 8.2);
    doc.save(`carteirinha-${slug(state.aluno.nome)}-${slug(state.aluno.ra)}.pdf`);
  } catch (error) {
    console.error(error);
    toast(`Erro ao gerar carteirinha: ${error.message}`, "error");
  }
}

function filtrarCursos(query) {
  const normalized = String(query || "").trim().toLowerCase();
  document.querySelectorAll(".course-card").forEach((card) => {
    card.style.display = !normalized || card.dataset.search.includes(normalized) ? "flex" : "none";
  });
  if (normalized) abrirAba("cursos");
}

async function atualizarDadosPrincipais() {
  if (!state.aluno?.user_id) return;
  if (state.atualizandoDados) {
    state.atualizacaoPendente = true;
    return;
  }
  state.atualizandoDados = true;
  try {
    try { await sb.rpc("processar_certificados_prontos_v34_3"); } catch (_) { /* migration ainda não publicada */ }
    const tarefas = [
      ['cursos', carregarCursos],
      ['resultados', carregarResultados],
      ['avaliações', carregarAvaliacoes],
      ['certificados', carregarCertificados],
      ['histórico', carregarHistoricoCertificados],
      ['carteira de horas', carregarCarteirasHoras],
      ['pagamentos', carregarPagamentos]
    ];

    const resultados = await Promise.allSettled(
      tarefas.map(([, fn]) => tentarNovamente(() => fn(), 3, 220))
    );
    const falhas = resultados
      .map((resultado, index) => ({ resultado, nome: tarefas[index][0] }))
      .filter(({ resultado }) => resultado.status === 'rejected');

    falhas.forEach(({ resultado, nome }) => console.warn(`Falha temporária em ${nome}:`, resultado.reason?.message || resultado.reason));

    // Renderiza uma única vez ao final. Como as consultas não podem mais se
    // sobrepor, os cards não apagam e voltam durante Realtime/polling.
    renderCarteirinha();
    renderDashboard();
    renderCursos();
    renderCertificados();
    renderPagamentos();

    if (falhas.length && falhas.length < tarefas.length) {
      mensagemDeSincronizacao('Algumas informações estão sendo sincronizadas. A atualização continuará automaticamente.');
    }
    if (falhas.length === tarefas.length) {
      const erro = new Error('Não foi possível sincronizar os dados agora.');
      erro.code = 'SYNC_FAILED';
      throw erro;
    }
  } finally {
    state.atualizandoDados = false;
    if (state.atualizacaoPendente) {
      state.atualizacaoPendente = false;
      window.setTimeout(atualizarDadosPrincipais, 180);
    }
  }
}

function configurarEventos() {
  document.querySelectorAll(".menu-link[data-aba]").forEach((button) => button.addEventListener("click", async () => {
    abrirAba(button.dataset.aba);
    if (["inicio", "certificados"].includes(button.dataset.aba)) {
      try { await atualizarDadosPrincipais(); } catch (error) { console.warn("Atualização da aba:", error.message); }
    }
  }));
  document.querySelectorAll("[data-abrir-aba]").forEach((button) => button.addEventListener("click", () => abrirAba(button.dataset.abrirAba)));
  $("btnMenuMobile")?.addEventListener("click", abrirMenuMobile);
  $("sidebarOverlay")?.addEventListener("click", fecharMenuMobile);
  $("btnSair")?.addEventListener("click", sair);
  $("buscaPortalAluno")?.addEventListener("input", (event) => filtrarCursos(event.target.value));
  $("formCadastroAluno")?.addEventListener("submit", salvarCadastro);
  $("formChamado")?.addEventListener("submit", abrirChamado);
  $("formRespostaChamadoAluno")?.addEventListener("submit", responderChamadoAluno);
  $("fecharChamadoAluno")?.addEventListener("click", fecharChamadoAluno);
  $("listaChamados")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ticket-student-open]");
    const card = event.target.closest("[data-ticket-student-id]");
    const id = Number(button?.dataset.ticketStudentOpen || card?.dataset.ticketStudentId || 0);
    if (id) abrirDetalhesChamadoAluno(id);
  });
  $("btnBaixarCarteirinha")?.addEventListener("click", baixarCarteirinhaPDF);
  $("cadTelefone")?.addEventListener("input", (event) => { event.target.value = maskPhone(event.target.value); });
  $("fotoAlunoInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file && $("previewFotoAluno")) $("previewFotoAluno").src = URL.createObjectURL(file);
  });
  $("btnModuloAnterior")?.addEventListener("click", () => selecionarModulo(state.moduloIndex - 1));
  $("btnProximoModulo")?.addEventListener("click", () => selecionarModulo(state.moduloIndex + 1));
  $("btnConcluirModulo")?.addEventListener("click", concluirModuloAtual);
  $("btnCursoMaterialCompleto")?.addEventListener("click", baixarMaterialCompletoCurso);
  $("btnAbrirProva")?.addEventListener("click", abrirProva);
  $("btnIrParaProva")?.addEventListener("click", abrirProva);
  $("btnQuestaoAnterior")?.addEventListener("click", questaoAnterior);
  $("btnQuestaoProxima")?.addEventListener("click", questaoProxima);
  document.querySelectorAll("[data-fechar-modal]").forEach((button) => button.addEventListener("click", () => fecharModal(button.dataset.fecharModal)));
  document.querySelectorAll(".modal").forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target !== modal) return;
    const tipo = modal.id === "modalProva" ? "prova" : modal.id === "modalChamadoAluno" ? "chamado" : "curso";
    fecharModal(tipo);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      fecharModal("prova");
      fecharModal("curso");
      fecharModal("chamado");
      fecharMenuMobile();
    }
  });
}

function configurarAtualizacaoPeriodicaAluno() {
  if (window.__altitudePollingAluno) return;
  window.__altitudePollingAluno = true;
  let emExecucao = false;
  const atualizar = async () => {
    if (document.hidden || emExecucao || !state.aluno?.user_id) return;
    emExecucao = true;
    try {
      // A liberação automática é processada exclusivamente pelo Cron do Supabase.
      await atualizarDadosPrincipais();
      await carregarChamados();
      renderCarteirinha();
    } catch (error) {
      console.warn("Atualização periódica do portal:", error.message);
    } finally {
      emExecucao = false;
    }
  };
  // Realtime cuida das mudanças imediatas; este intervalo é apenas contingência.
  window.setInterval(atualizar, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) atualizar();
  });
  window.addEventListener("focus", atualizar);
}

function configurarTempoRealAluno() {
  if (!window.sb || window.__altitudeRealtimeAluno || !state.aluno?.user_id) return;
  window.__altitudeRealtimeAluno = true;
  let timer;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await atualizarDadosPrincipais();
        await carregarChamados();
        renderCarteirinha();
      } catch (error) {
        console.warn("Atualização em tempo real:", error.message);
      }
    }, 700);
  };
  const channel = sb.channel(`altitude-aluno-${state.aluno.user_id}`);
  ['cursos','matriculas','resultados_provas','certificados','certificados_historico','carteiras_horas_curso','chamados','chamado_interacoes','avaliacoes_cursos']
    .forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
  channel.subscribe();
}

async function iniciarPortal() {
  configurarEventos();
  try {
    state.user = await obterUsuarioLogado();
    if (!state.user) return;
    await carregarAluno();
    // A liberação automática é processada exclusivamente pelo Cron do Supabase.
    await atualizarDadosPrincipais();
    await carregarChamados();
    configurarTempoRealAluno();
    configurarAtualizacaoPeriodicaAluno();
    const cursoInicial = Number(new URLSearchParams(window.location.search).get("curso"));
    if (cursoInicial && state.cursos.some((item) => Number(item.id) === cursoInicial)) {
      abrirAba("cursos");
      await abrirCurso(cursoInicial);
    }
  } catch (error) {
    console.error(error);
    if (error?.code === 'PROFILE_NOT_FOUND') return;
    mensagemDeSincronizacao('Não foi possível concluir a sincronização. O portal tentará novamente automaticamente.', true);
    window.setTimeout(async () => {
      try {
        if (!state.user) state.user = await obterUsuarioLogado();
        if (state.user && !state.aluno) await carregarAluno();
        if (state.aluno) await atualizarDadosPrincipais();
      } catch (retryError) {
        console.warn('Nova tentativa do portal:', retryError.message);
      }
    }, 2500);
  }
}

window.abrirCurso = abrirCurso;
window.selecionarModulo = selecionarModulo;
window.matricularCurso = matricularCurso;
window.emitirCertificado = emitirCertificado;
window.solicitarCertificado = solicitarCertificado;
window.avaliarCurso = avaliarCurso;
window.baixarCertificado = baixarCertificado;
window.copiarCodigoCertificado = copiarCodigoCertificado;
window.baixarCarteirinhaPDF = baixarCarteirinhaPDF;
window.refazerProva = refazerProva;
window.irParaCertificados = irParaCertificados;
window.baixarMaterialCompletoCurso = baixarMaterialCompletoCurso;

iniciarPortal();
