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
  certificados: [],
  pagamentos: [],
  cursoAtual: null,
  modulos: [],
  moduloIndex: 0,
  prova: null,
  respostas: {},
  questaoIndex: 0,
  logoDataUrl: null
};

const TITULOS_ABAS = {
  perfil: "Início",
  cursos: "Meus cursos",
  certificados: "Certificados",
  pagamentos: "Pagamentos",
  atendimento: "Atendimento",
  cadastro: "Meu cadastro"
};

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
  const date = new Date(value);
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
  const warning = ["PENDENTE", "ABERTO", "EM_ANDAMENTO", "TRANCADA"].includes(normalized);
  const cls = success ? "success" : danger ? "danger" : warning ? "warning" : "neutral";
  return `<span class="status-pill ${cls}">${escapeHTML(normalized.replaceAll("_", " "))}</span>`;
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
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    window.location.href = "4-login.html";
    return null;
  }
  return data.user;
}

async function sair() {
  await sb.auth.signOut();
  window.location.href = "4-login.html";
}

async function carregarAluno() {
  const { data, error } = await sb
    .from("alunos")
    .select("*")
    .eq("user_id", state.user.id)
    .single();

  if (error || !data) throw new Error(error?.message || "Cadastro do aluno não encontrado.");
  state.aluno = data;

  const primeiroNome = String(data.nome || "Aluno").trim().split(/\s+/)[0];
  setText("nomeAluno", primeiroNome);
  setText("nomeTopoAluno", primeiroNome);
  setText("infoRA", data.ra || "—");
  setText("infoRA2", data.ra || "—");
  setText("infoCPF", maskCpf(data.cpf));
  setText("infoEmail", data.email || state.user.email || "—");
  setText("infoCelular", maskPhone(data.telefone) || "—");

  const photo = imgAluno(data.foto_url);
  if ($("avatarTopo")) $("avatarTopo").src = photo;
  if ($("previewFotoAluno")) $("previewFotoAluno").src = photo;

  if ($("cadNome")) $("cadNome").value = data.nome || "";
  if ($("cadEmail")) $("cadEmail").value = data.email || state.user.email || "";
  if ($("cadTelefone")) $("cadTelefone").value = maskPhone(data.telefone);
  if ($("cadNascimento")) $("cadNascimento").value = data.data_nascimento || "";
  if ($("cadObjetivo")) $("cadObjetivo").value = data.objetivo || "";
  setText("cadCpfTexto", maskCpf(data.cpf));
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

async function carregarCertificados() {
  const { data, error } = await sb
    .from("certificados")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("id", { ascending: false });
  if (error) throw error;
  state.certificados = data || [];
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

function certificadoCurso(cursoId) {
  return state.certificados.find((item) =>
    Number(item.curso_id) === Number(cursoId) && String(item.status).toUpperCase() === "EMITIDO"
  ) || null;
}

function renderDashboard() {
  const cursosAtivos = state.cursos.filter((item) => !["CANCELADA", "TRANCADA"].includes(String(item.matricula_status).toUpperCase()));
  const aprovadas = new Set(state.resultados.filter((item) => item.aprovado).map((item) => Number(item.curso_id))).size;
  const emitidos = state.certificados.filter((item) => String(item.status).toUpperCase() === "EMITIDO");
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
          <span>${Number(curso.carga_horaria || 0)}h</span>
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
    const { error } = await sb.from("matriculas").insert({
      aluno_id: state.aluno.user_id,
      curso_id: Number(cursoId),
      status: "ATIVA",
      progresso: 0
    });
    if (error) throw error;
    toast("Matrícula realizada com sucesso.", "success");
    await atualizarDadosPrincipais();
    abrirAba("cursos");
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
    const { data, error } = await sb.rpc("obter_modulos_curso", { p_curso_id: Number(cursoId) });
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
  examButton.disabled = progress < 100;
  examButton.textContent = approved ? "Ver resultado da prova" : progress >= 100 ? "Fazer prova" : "Conclua os módulos";
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

function renderModuloAtual() {
  const modulo = state.modulos[state.moduloIndex];
  if (!modulo) return;

  setText("lessonPosition", `Conteúdo ${state.moduloIndex + 1} de ${state.modulos.length}`);
  setText("lessonTitle", modulo.titulo || `Módulo ${state.moduloIndex + 1}`);
  setText("lessonDescription", modulo.descricao || "Estude os materiais abaixo e marque o conteúdo como concluído.");

  const recursos = [];
  if (modulo.video_url) recursos.push({ tipo: "VIDEO", titulo: "Videoaula do módulo", url: modulo.video_url, destaque: true });
  if (modulo.pdf_url) recursos.push({ tipo: "PDF", titulo: "Material principal do módulo", url: modulo.pdf_url });
  for (const material of modulo.materiais || []) recursos.push(material);

  const content = $("lessonContent");
  if (!recursos.length) {
    content.innerHTML = `<div class="empty-state">Este módulo ainda não possui arquivos. Leia a descrição e aguarde a publicação do material.</div>`;
  } else {
    content.innerHTML = recursos.map((resource) => {
      const url = safeUrl(resource.url);
      const embed = String(resource.tipo).toUpperCase() === "VIDEO" ? youtubeEmbed(url) : "";
      if (embed && resource.destaque) {
        return `<iframe class="video-frame" src="${escapeHTML(embed)}" title="${escapeHTML(resource.titulo)}" allowfullscreen></iframe>`;
      }
      return `<div class="lesson-resource"><span><strong>${escapeHTML(resource.titulo || "Material")}</strong><small>${escapeHTML(materialIcon(resource.tipo))}</small></span>${url ? `<a class="secondary-button" href="${escapeHTML(url)}" target="_blank" rel="noopener">Abrir</a>` : `<span class="status-pill neutral">Indisponível</span>`}</div>`;
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
      toast("Conteúdo concluído. A prova foi liberada!", "success");
    }
  } catch (error) {
    toast(`Erro ao salvar progresso: ${error.message}`, "error");
    button.disabled = false;
    button.textContent = "Marcar como concluído";
  }
}

function fecharModal(tipo) {
  const modal = tipo === "prova" ? $("modalProva") : $("modalCurso");
  modal?.setAttribute("aria-hidden", "true");
  if ($("modalCurso")?.getAttribute("aria-hidden") === "true" && $("modalProva")?.getAttribute("aria-hidden") === "true") {
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

  const options = ["A", "B", "C", "D"].map((letter) => ({ letter, text: questao[letter.toLowerCase()] }));
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
  setText("quizTitle", "Resultado da prova");
  if ($("quizProgressBar")) $("quizProgressBar").style.width = "100%";
  $("quizBody").innerHTML = `
    <div class="quiz-result ${aprovado ? "approved" : "failed"}">
      <div class="result-icon">${aprovado ? "✓" : "↻"}</div>
      <h3>${aprovado ? "Parabéns, você foi aprovado!" : "Continue estudando"}</h3>
      <strong>${Number(resultado.nota || 0)}%</strong>
      <p>${aprovado
        ? "O certificado já pode ser emitido na aba Certificados."
        : `Você acertou ${Number(resultado.acertos || 0)} de ${Number(resultado.total_questoes || 0)} questões. Revise o conteúdo e faça uma nova tentativa.`}</p>
      <button class="primary-button" type="button" onclick="${aprovado ? "irParaCertificados()" : "refazerProva()"}">${aprovado ? "Emitir certificado" : "Tentar novamente"}</button>
    </div>`;
  $("quizCounter").textContent = aprovado ? "Aprovado" : "Nova tentativa disponível";
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

function renderCertificados() {
  const list = $("listaCertificados");
  if (!list) return;
  if (!state.cursos.length) {
    list.innerHTML = `<div class="empty-state">Nenhum curso matriculado.</div>`;
    return;
  }

  list.innerHTML = state.cursos.map((curso) => {
    const progressoOk = clamp(curso.progresso) >= 100;
    const resultado = melhorResultadoCurso(curso.id);
    const provaOk = Boolean(resultado?.aprovado && Number(resultado.nota) >= 70);
    const cert = certificadoCurso(curso.id);
    const certificadoOk = Boolean(cert);

    return `
      <article class="certificate-card">
        <div class="certificate-card-top">
          <div>
            <span class="eyebrow">${escapeHTML(curso.categoria || "Certificação")}</span>
            <h3>${escapeHTML(curso.titulo || "Curso")}</h3>
            <p>${Number(curso.carga_horaria || 0)} horas · ${resultado ? `melhor nota ${Number(resultado.nota || 0)}%` : "prova pendente"}</p>
          </div>
          ${certificadoOk ? statusPill(cert.status) : statusPill(progressoOk && provaOk ? "DISPONÍVEL" : "BLOQUEADO")}
        </div>

        <div class="certificate-requirements">
          <div class="requirement ${progressoOk ? "ok" : ""}"><b>${progressoOk ? "✓" : "1"}</b><span>Conteúdo 100% concluído</span></div>
          <div class="requirement ${provaOk ? "ok" : ""}"><b>${provaOk ? "✓" : "2"}</b><span>Prova com nota mínima de 70%</span></div>
          <div class="requirement ${certificadoOk ? "ok" : ""}"><b>${certificadoOk ? "✓" : "3"}</b><span>Certificado emitido e verificável</span></div>
        </div>

        <div class="certificate-card-footer">
          <span class="certificate-code">${cert?.numero_certificado ? `Registro: ${escapeHTML(cert.numero_certificado)}` : "O número será criado no momento da emissão."}</span>
          <div class="certificate-actions">
            ${certificadoOk
              ? `<button class="secondary-button" type="button" onclick="copiarCodigoCertificado(${Number(cert.id)})">Copiar código</button><button class="primary-button" type="button" onclick="baixarCertificado(${Number(cert.id)})">Baixar PDF</button>`
              : progressoOk && provaOk
                ? `<button class="primary-button" type="button" onclick="emitirCertificado(${Number(curso.id)})">Emitir certificado</button>`
                : `<button class="secondary-button" type="button" disabled>Conclua os requisitos</button>`}
          </div>
        </div>
      </article>`;
  }).join("");
}

async function emitirCertificado(cursoId) {
  const button = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  if (button) {
    button.disabled = true;
    button.textContent = "Emitindo...";
  }
  try {
    const { data, error } = await sb.rpc("emitir_certificado_curso", { p_curso_id: Number(cursoId) });
    if (error) throw error;
    await carregarCertificados();
    renderDashboard();
    renderCertificados();
    const certificate = data?.id ? data : certificadoCurso(cursoId);
    toast("Certificado emitido com sucesso.", "success");
    if (certificate?.id) await baixarCertificado(Number(certificate.id));
  } catch (error) {
    toast(`Não foi possível emitir: ${error.message}`, "error");
    if (button) {
      button.disabled = false;
      button.textContent = "Emitir certificado";
    }
  }
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

async function baixarCertificado(certificadoId) {
  const cert = state.certificados.find((item) => Number(item.id) === Number(certificadoId));
  if (!cert) return toast("Certificado não encontrado.", "error");
  if (!cert.codigo_validacao) return toast("Execute a migração SQL para gerar o código de autenticação.", "error");
  if (!window.jspdf?.jsPDF || !window.QRCode) return toast("Bibliotecas de PDF ou QR Code não carregaram.", "error");

  try {
    toast("Preparando certificado...", "success");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const nome = cert.nome_aluno || state.aluno.nome || "Aluno";
    const curso = cert.nome_curso || state.cursos.find((item) => Number(item.id) === Number(cert.curso_id))?.titulo || "Curso";
    const hours = Number(cert.horas_emitidas || state.cursos.find((item) => Number(item.id) === Number(cert.curso_id))?.carga_horaria || 0);
    const validationUrl = `${window.location.origin}/Projeto/1-html/8-certificados.html?codigo=${encodeURIComponent(cert.codigo_validacao)}`;
    const qr = await gerarQrDataUrl(validationUrl);
    if (!state.logoDataUrl) state.logoDataUrl = await imagemParaDataURL("../3-img/LOGO.png");

    doc.setFillColor(250, 252, 253);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.setDrawColor(10, 61, 98);
    doc.setLineWidth(2.2);
    doc.roundedRect(8, 8, pageWidth - 16, pageHeight - 16, 4, 4, "S");
    doc.setDrawColor(82, 192, 217);
    doc.setLineWidth(.7);
    doc.roundedRect(12, 12, pageWidth - 24, pageHeight - 24, 3, 3, "S");

    doc.addImage(state.logoDataUrl, "PNG", 24, 20, 48, 22, undefined, "FAST");
    doc.setTextColor(10, 61, 98);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("CERTIFICADO", pageWidth / 2, 39, { align: "center" });
    doc.setFontSize(10);
    doc.setTextColor(91, 113, 127);
    doc.text("INSTITUTO DE EDUCAÇÃO E TECNOLOGIA ALTITUDE", pageWidth / 2, 47, { align: "center" });

    doc.setTextColor(23, 43, 58);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text("Certificamos que", pageWidth / 2, 68, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    const nameLines = doc.splitTextToSize(nome.toUpperCase(), 190);
    doc.text(nameLines, pageWidth / 2, 84, { align: "center" });

    const afterName = 84 + (nameLines.length - 1) * 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.text("concluiu com aproveitamento o curso", pageWidth / 2, afterName + 14, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(10, 61, 98);
    doc.setFontSize(18);
    const courseLines = doc.splitTextToSize(curso, 175);
    doc.text(courseLines, pageWidth / 2, afterName + 27, { align: "center" });

    const afterCourse = afterName + 27 + (courseLines.length - 1) * 7;
    doc.setTextColor(23, 43, 58);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`com carga horária de ${hours} horas e nota final de ${Number(cert.nota_final || 0)}%.`, pageWidth / 2, afterCourse + 14, { align: "center" });
    doc.text(`Emitido em ${dataBR(cert.emitido_em || cert.criado_em)}.`, pageWidth / 2, afterCourse + 23, { align: "center" });

    doc.addImage(qr, "PNG", pageWidth - 51, pageHeight - 51, 32, 32);
    doc.setFontSize(8);
    doc.setTextColor(91, 113, 127);
    doc.text("Escaneie para validar", pageWidth - 35, pageHeight - 15, { align: "center" });

    doc.setDrawColor(175, 193, 203);
    doc.line(28, pageHeight - 35, 102, pageHeight - 35);
    doc.setFontSize(9);
    doc.text("Instituto Altitude", 65, pageHeight - 29, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(10, 61, 98);
    doc.text(cert.numero_certificado || String(cert.codigo_validacao), pageWidth / 2, pageHeight - 23, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(91, 113, 127);
    doc.text("A autenticidade deste documento deve ser confirmada pelo QR Code ou pelo código acima.", pageWidth / 2, pageHeight - 16, { align: "center" });

    doc.save(`certificado-${slug(curso)}-${slug(nome)}.pdf`);
  } catch (error) {
    console.error(error);
    toast(`Erro ao gerar PDF: ${error.message}`, "error");
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
    list.innerHTML = `<div class="empty-state">Nenhum pagamento encontrado.</div>`;
    return;
  }
  list.innerHTML = `<table class="portal-table"><thead><tr><th>Descrição</th><th>Valor</th><th>Desconto</th><th>Total</th><th>Status</th><th>Data</th></tr></thead><tbody>${state.pagamentos.map((item) => `<tr><td>${escapeHTML(item.descricao || item.finalidade || "Pagamento")}</td><td>${dinheiro(item.valor)}</td><td>${dinheiro(item.desconto)}</td><td><strong>${dinheiro(item.valor_final || item.valor)}</strong></td><td>${statusPill(item.status)}</td><td>${dataBR(item.criado_em)}</td></tr>`).join("")}</tbody></table>`;
}

async function carregarChamados() {
  const { data, error } = await sb
    .from("chamados")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("id", { ascending: false });
  if (error) throw error;

  const chamados = data || [];
  setText("chAbertos", chamados.filter((item) => item.status === "ABERTO").length);
  setText("chAndamento", chamados.filter((item) => item.status === "EM_ANDAMENTO").length);
  setText("chResolvidos", chamados.filter((item) => item.status === "RESOLVIDO").length);

  const list = $("listaChamados");
  list.innerHTML = chamados.length ? chamados.map((item) => `
    <article class="ticket-card">
      <div><span class="eyebrow">${escapeHTML(item.protocolo || `Chamado ${item.id}`)}</span><h3>${escapeHTML(item.assunto)}</h3><p>${escapeHTML(item.mensagem || "")}</p><small>${dataBR(item.criado_em, true)}</small></div>
      ${statusPill(item.status)}
    </article>`).join("") : `<div class="empty-state">Nenhum chamado aberto.</div>`;
}

async function abrirChamado(event) {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Enviando...";
  try {
    const protocolo = `ALT-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const { error } = await sb.from("chamados").insert({
      protocolo,
      aluno_id: state.aluno.user_id,
      assunto: $("chAssunto").value.trim(),
      categoria: $("chCategoria").value,
      prioridade: $("chPrioridade").value,
      mensagem: $("chMensagem").value.trim(),
      status: "ABERTO"
    });
    if (error) throw error;
    event.currentTarget.reset();
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
  const path = `${state.aluno.user_id}/${Date.now()}.${extension}`;
  const { error } = await sb.storage.from("fotos_alunos").upload(path, file, { upsert: true });
  if (error) throw error;
  return sb.storage.from("fotos_alunos").getPublicUrl(path).data.publicUrl;
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
  box.innerHTML = `
    <div class="digital-card">
      <div class="digital-card-top"><img src="../3-img/LOGO.png" alt="Altitude"><span>${new Date().getFullYear()}</span></div>
      <div class="digital-card-body">
        <img src="${escapeHTML(imgAluno(state.aluno.foto_url))}" alt="Foto do aluno">
        <div><strong>${escapeHTML(state.aluno.nome || "Aluno")}</strong><span>Registro acadêmico: ${escapeHTML(state.aluno.ra || "—")}</span><span>Status: ${escapeHTML(state.aluno.status || "ATIVO")}</span><span>Instituto Altitude</span></div>
      </div>
    </div>`;
}

function filtrarCursos(query) {
  const normalized = String(query || "").trim().toLowerCase();
  document.querySelectorAll(".course-card").forEach((card) => {
    card.style.display = !normalized || card.dataset.search.includes(normalized) ? "flex" : "none";
  });
  if (normalized) abrirAba("cursos");
}

async function atualizarDadosPrincipais() {
  await Promise.all([carregarCursos(), carregarResultados(), carregarCertificados(), carregarPagamentos()]);
  renderDashboard();
  renderCursos();
  renderCertificados();
  renderPagamentos();
}

function configurarEventos() {
  document.querySelectorAll(".menu-link[data-aba]").forEach((button) => button.addEventListener("click", () => abrirAba(button.dataset.aba)));
  document.querySelectorAll("[data-abrir-aba]").forEach((button) => button.addEventListener("click", () => abrirAba(button.dataset.abrirAba)));
  $("btnMenuMobile")?.addEventListener("click", abrirMenuMobile);
  $("sidebarOverlay")?.addEventListener("click", fecharMenuMobile);
  $("btnSair")?.addEventListener("click", sair);
  $("buscaPortalAluno")?.addEventListener("input", (event) => filtrarCursos(event.target.value));
  $("formCadastroAluno")?.addEventListener("submit", salvarCadastro);
  $("formChamado")?.addEventListener("submit", abrirChamado);
  $("cadTelefone")?.addEventListener("input", (event) => { event.target.value = maskPhone(event.target.value); });
  $("fotoAlunoInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file && $("previewFotoAluno")) $("previewFotoAluno").src = URL.createObjectURL(file);
  });
  $("btnModuloAnterior")?.addEventListener("click", () => selecionarModulo(state.moduloIndex - 1));
  $("btnProximoModulo")?.addEventListener("click", () => selecionarModulo(state.moduloIndex + 1));
  $("btnConcluirModulo")?.addEventListener("click", concluirModuloAtual);
  $("btnAbrirProva")?.addEventListener("click", abrirProva);
  $("btnQuestaoAnterior")?.addEventListener("click", questaoAnterior);
  $("btnQuestaoProxima")?.addEventListener("click", questaoProxima);
  document.querySelectorAll("[data-fechar-modal]").forEach((button) => button.addEventListener("click", () => fecharModal(button.dataset.fecharModal)));
  document.querySelectorAll(".modal").forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target === modal) fecharModal(modal.id === "modalProva" ? "prova" : "curso");
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      fecharModal("prova");
      fecharModal("curso");
      fecharMenuMobile();
    }
  });
}

async function iniciarPortal() {
  configurarEventos();
  try {
    state.user = await obterUsuarioLogado();
    if (!state.user) return;
    await carregarAluno();
    await atualizarDadosPrincipais();
    await carregarChamados();
  } catch (error) {
    console.error(error);
    toast(`Erro ao carregar o portal: ${error.message}`, "error");
  }
}

window.abrirCurso = abrirCurso;
window.selecionarModulo = selecionarModulo;
window.matricularCurso = matricularCurso;
window.emitirCertificado = emitirCertificado;
window.baixarCertificado = baixarCertificado;
window.copiarCodigoCertificado = copiarCodigoCertificado;
window.refazerProva = refazerProva;
window.irParaCertificados = irParaCertificados;

iniciarPortal();
