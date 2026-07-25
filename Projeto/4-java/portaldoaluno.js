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
  movimentacoesHoras: [],
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
    .maybeSingle();

  if (error) throw new Error(error.message || "Não foi possível carregar o cadastro do aluno.");
  if (!data) throw new Error("Cadastro do aluno não encontrado. Entre novamente ou procure o atendimento.");
  state.aluno = data;

  const primeiroNome = String(data.nome || "Aluno").trim().split(/\s+/)[0].toUpperCase();
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

async function carregarAvaliacoes() {
  const { data, error } = await sb
    .from("avaliacoes_cursos")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("criado_em", { ascending: false });
  if (error) {
    console.warn("Avaliações indisponíveis:", error.message);
    state.avaliacoes = [];
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
    state.certificadosHistorico = [];
    return;
  }
  state.certificadosHistorico = data || [];
}

async function carregarCarteirasHoras() {
  const { data, error } = await sb.rpc("obter_minhas_carteiras_horas");
  if (error) {
    console.warn("Carteira de horas indisponível:", error.message);
    state.carteirasHoras = [];
    return;
  }
  state.carteirasHoras = data || [];
}

async function carregarMovimentacoesHoras() {
  const { data, error } = await sb
    .from("movimentacoes_horas")
    .select("*")
    .eq("aluno_id", state.aluno.user_id)
    .order("criado_em", { ascending: false });
  if (error) {
    console.warn("Extrato de horas indisponível:", error.message);
    state.movimentacoesHoras = [];
    return;
  }
  state.movimentacoesHoras = data || [];
}

function carteiraHorasCurso(cursoId) {
  return state.carteirasHoras.find((item) => Number(item.curso_id) === Number(cursoId)) || null;
}

function opcoesHorasDisponiveis(saldo) {
  const limite = Math.max(0, Math.floor(Number(saldo || 0) / 5) * 5);
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

function certificadoCurso(cursoId) {
  return certificadosDoCurso(cursoId).find((item) => String(item.status).toUpperCase() === "EMITIDO") || null;
}

function certificadoAtualCurso(cursoId) {
  return certificadosDoCurso(cursoId)[0] || null;
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
  const textoModulo = String(modulo.conteudo || "").trim();
  const blocoTexto = textoModulo
    ? `<article class="lesson-written-content"><h3>Conteúdo do módulo</h3>${textoModulo.split(/\n{2,}/).map((paragrafo) => `<p>${escapeHTML(paragrafo).replaceAll("\n", "<br>")}</p>`).join("")}</article>`
    : "";

  if (!recursos.length && !textoModulo) {
    content.innerHTML = `<div class="empty-state">Este módulo ainda não possui conteúdo publicado.</div>`;
  } else {
    content.innerHTML = blocoTexto + recursos.map((resource) => {
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
      toast("Conteúdo concluído. Abrindo a avaliação...", "success");
      setTimeout(() => abrirProva(), 650);
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
        ? "Você já pode solicitar o certificado na aba Certificados. Após a liberação da gestão, o PDF ficará disponível."
        : `Você acertou ${Number(resultado.acertos || 0)} de ${Number(resultado.total_questoes || 0)} questões. Revise o conteúdo e faça uma nova tentativa.`}</p>
      <button class="primary-button" type="button" onclick="${aprovado ? "irParaCertificados()" : "refazerProva()"}">${aprovado ? "Solicitar certificado" : "Tentar novamente"}</button>
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

function rotuloAcaoCertificado(acao) {
  return ({
    SOLICITADO: "Solicitação enviada", LIBERADO: "Certificado liberado", EMITIDO: "Certificado emitido",
    BLOQUEADO: "Certificado bloqueado", CANCELADO: "Certificado cancelado", REABERTO: "Solicitação reaberta",
    IMPORTADO: "Registro importado", CRIADO: "Registro criado", ATUALIZADO: "Registro atualizado"
  })[String(acao || "").toUpperCase()] || String(acao || "Atualização").replaceAll("_", " ");
}

function renderHistoricoCertificados() {
  const list = $("historicoCertificados");
  if (!list) return;
  const historico = [...state.certificadosHistorico].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  setText("contadorHistoricoCertificados", `${historico.length} ${historico.length === 1 ? "registro" : "registros"}`);
  if (!historico.length) {
    list.innerHTML = `<div class="empty-state">Nenhuma movimentação de certificado registrada.</div>`;
    return;
  }
  list.innerHTML = historico.map((item) => {
    const cert = state.certificados.find((c) => Number(c.id) === Number(item.certificado_id));
    const curso = state.cursos.find((c) => Number(c.id) === Number(item.curso_id));
    return `<article class="certificate-history-item">
      <div class="history-icon">${String(item.status_novo).toUpperCase() === "EMITIDO" ? "✓" : "•"}</div>
      <div><strong>${escapeHTML(rotuloAcaoCertificado(item.acao))}</strong><span>${escapeHTML(cert?.nome_curso || curso?.titulo || "Curso")}</span>${item.observacao ? `<small>${escapeHTML(item.observacao)}</small>` : ""}</div>
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
    <article><span>Horas validadas</span><strong>${totais.validadas}h</strong></article>
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
      <div><strong>${escapeHTML(rotuloMovimentoHoras(item.tipo))}</strong><span>${escapeHTML(curso?.titulo || "Curso")}</span>${item.observacao ? `<small>${escapeHTML(item.observacao)}</small>` : ""}</div>
      <div class="hours-history-value"><b>${sinal}${Number(item.horas || 0)}h</b><small>${dataBR(item.criado_em, true)}</small></div>
    </article>`;
  }).join("");
}

function renderCertificadosEmitidos() {
  const list = $("listaCertificadosEmitidos");
  if (!list) return;
  const emitidos = state.certificados
    .filter((cert) => String(cert.status || "").toUpperCase() === "EMITIDO")
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
    const validadas = Number(carteira?.horas_validadas || 0);
    const reservadas = Number(carteira?.horas_reservadas || 0);
    const utilizadas = Number(carteira?.horas_utilizadas || 0);
    const pendente = certificadosDoCurso(curso.id).find((item) => String(item.status).toUpperCase() === "PENDENTE");
    const bloqueado = certificadosDoCurso(curso.id).find((item) => String(item.status).toUpperCase() === "BLOQUEADO");
    const pronto = progressoOk && provaOk;
    const options = opcoesHorasDisponiveis(saldo);

    let actions = `<button class="secondary-button" type="button" disabled>Conclua os requisitos</button>`;
    let help = "Conclua o conteúdo e a prova para solicitar horas.";
    let statusVisual = "BLOQUEADO";

    if (pendente) {
      statusVisual = "PENDENTE";
      help = `${Number(pendente.horas_solicitadas || 0)}h reservadas. Aguardando a liberação da gestão; o PDF ainda não está disponível.`;
      actions = `<button class="secondary-button" type="button" disabled>Aguardando liberação</button>`;
    } else if (pronto && saldo >= 5) {
      statusVisual = "DISPONÍVEL";
      help = `Você pode escolher de 5h até ${saldo}h. O restante permanecerá na carteira para outra emissão.`;
      actions = `<div class="hours-request-control">
        <label for="horasSolicitadas-${Number(curso.id)}">Horas deste certificado</label>
        <select id="horasSolicitadas-${Number(curso.id)}">${options.map((h) => `<option value="${h}"${h === Math.min(20, saldo) ? " selected" : ""}>${h} horas</option>`).join("")}</select>
        <button class="primary-button" type="button" onclick="solicitarCertificado(${Number(curso.id)})">Solicitar análise</button>
      </div>`;
    } else if (pronto && validadas === 0) {
      statusVisual = "PENDENTE";
      help = "Curso concluído e prova aprovada. Aguarde a gestão validar suas horas.";
      actions = `<button class="secondary-button" type="button" disabled>Aguardando crédito de horas</button>`;
    } else if (pronto && saldo < 5) {
      statusVisual = utilizadas > 0 ? "CONCLUÍDO" : "PENDENTE";
      help = reservadas > 0
        ? `${reservadas}h estão reservadas em uma solicitação.`
        : "Não há saldo disponível neste curso. As horas já foram utilizadas ou ainda dependem de ajuste da gestão.";
      actions = `<button class="secondary-button" type="button" disabled>Sem saldo disponível</button>`;
    } else if (bloqueado) {
      statusVisual = "BLOQUEADO";
      help = bloqueado.observacao_gestor || "Uma solicitação foi bloqueada. O saldo devolvido pode ser usado em nova solicitação quando disponível.";
    }

    const avaliacao = avaliacaoDoCurso(curso.id);
    const avaliacaoHtml = pronto
      ? (avaliacao
        ? `<div class="course-review-done"><span class="review-stars-static">${"★".repeat(Number(avaliacao.nota || 0))}${"☆".repeat(5 - Number(avaliacao.nota || 0))}</span><strong>Sua avaliação</strong></div>`
        : `<button class="course-review-button" type="button" onclick="avaliarCurso(${Number(curso.id)})">Avaliar este curso</button>`)
      : "";

    return `<article class="certificate-card hours-wallet-card">
      <div class="certificate-card-top">
        <div><span class="eyebrow">${escapeHTML(curso.categoria || "Certificação")}</span><h3>${escapeHTML(curso.titulo || "Curso")}</h3><p>Carga máxima do curso: ${Number(curso.carga_horaria || 0)}h · ${resultado ? `melhor nota ${Number(resultado.nota || 0)}%` : "prova pendente"}</p></div>
        ${statusPill(statusVisual)}
      </div>
      <div class="wallet-balance-grid">
        <div><span>Validadas</span><strong>${validadas}h</strong></div>
        <div><span>Disponíveis</span><strong>${saldo}h</strong></div>
        <div><span>Em análise</span><strong>${reservadas}h</strong></div>
        <div><span>Já usadas</span><strong>${utilizadas}h</strong></div>
      </div>
      <div class="certificate-requirements">
        <div class="requirement ${progressoOk ? "ok" : ""}"><b>${progressoOk ? "✓" : "1"}</b><span>Conteúdo 100% concluído</span></div>
        <div class="requirement ${provaOk ? "ok" : ""}"><b>${provaOk ? "✓" : "2"}</b><span>Prova com nota mínima de ${notaMinima}%</span></div>
        <div class="requirement ${validadas > 0 ? "ok" : ""}"><b>${validadas > 0 ? "✓" : "3"}</b><span>Horas validadas pela gestão</span></div>
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
  const horas = Number(select?.value || 0);
  if (!horas) return toast("Escolha a quantidade de horas do certificado.", "error");
  const carteira = carteiraHorasCurso(cursoId);
  const saldo = Number(carteira?.saldo_disponivel || 0);
  if (horas > saldo) return toast(`Saldo insuficiente. Você possui ${saldo}h disponíveis.`, "error");
  if (!window.confirm(`Solicitar um certificado de ${horas} horas? O saldo restante será de ${saldo - horas} horas. O PDF só será liberado após a aprovação da gestão.`)) return;

  const button = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  if (button) { button.disabled = true; button.textContent = "Enviando..."; }
  try {
    const { data, error } = await sb.rpc("solicitar_certificado_curso", {
      p_curso_id: Number(cursoId),
      p_horas: horas
    });
    if (error) throw error;
    await Promise.all([carregarCertificados(), carregarHistoricoCertificados(), carregarCarteirasHoras()]);
    renderDashboard();
    renderCertificados();
    toast(`Solicitação de ${horas}h enviada. Restam ${Number(data?.saldo_disponivel ?? saldo - horas)}h disponíveis.`, "success");
  } catch (error) {
    toast(`Não foi possível solicitar: ${error.message}`, "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Solicitar análise"; }
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
  let data = null;
  let error = null;
  ({ data, error } = await sb.from("modulos").select("id,titulo,ordem,carga_horaria").eq("curso_id", Number(cursoId)).order("ordem"));
  if (error) ({ data, error } = await sb.from("modulos").select("id,titulo,ordem").eq("curso_id", Number(cursoId)).order("ordem"));
  if (error) throw error;
  const modules = data || [];
  if (!modules.length) return [{ titulo: "Conteúdo programático do curso", horas: Number(totalHoras || 0) }];
  const explicit = modules.reduce((sum, item) => sum + Math.max(0, Number(item.carga_horaria || 0)), 0);
  const missing = modules.filter((item) => !Number(item.carga_horaria)).length;
  let remaining = Math.max(0, Number(totalHoras || 0) - explicit);
  const base = missing ? Math.floor(remaining / missing) : 0;
  return modules.map((item, index) => {
    let hours = Math.max(0, Number(item.carga_horaria || 0));
    if (!hours && missing) {
      hours = base;
      remaining -= base;
      const missingAfter = modules.slice(index + 1).filter((m) => !Number(m.carga_horaria)).length;
      if (!missingAfter) hours += remaining;
    }
    return { titulo: item.titulo || `Módulo ${index + 1}`, horas };
  });
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
  if (String(cert.status).toUpperCase() !== "EMITIDO") return toast("O certificado ainda não foi liberado pela gestão.", "error");
  if (!cert.codigo_validacao) return toast("Código de autenticação não encontrado.", "error");
  if (!window.jspdf?.jsPDF || !window.QRCode) return toast("Bibliotecas de PDF ou QR Code não carregaram.", "error");

  try {
    toast("Preparando certificado em duas páginas...", "success");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const nome = cert.nome_aluno || state.aluno.nome || "Aluno";
    const courseData = state.cursos.find((item) => Number(item.id) === Number(cert.curso_id));
    const curso = cert.nome_curso || courseData?.titulo || "Curso";
    const hours = Number(cert.horas_emitidas || courseData?.carga_horaria || 0);
    const validationUrl = `${window.location.origin}/Projeto/1-html/8-certificados.html?codigo=${encodeURIComponent(cert.codigo_validacao)}`;
    const qr = await gerarQrDataUrl(validationUrl);
    const modules = await carregarConteudoProgramatico(cert.curso_id, hours);
    if (!state.logoDataUrl) state.logoDataUrl = await imagemParaDataURL("../3-img/LOGO.png");

    // PÁGINA 1 - FRENTE
    desenharMolduraCertificado(doc, pageWidth, pageHeight);
    doc.addImage(state.logoDataUrl, "PNG", pageWidth - 79, 23, 60, 9, undefined, "FAST");
    doc.setTextColor(81, 58, 44);
    doc.setFont("times", "bold");
    doc.setFontSize(34);
    doc.text("Certificado", pageWidth / 2, 39, { align: "center" });
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text("DE CONCLUSÃO E APROVEITAMENTO", pageWidth / 2, 48, { align: "center" });

    doc.setTextColor(27, 42, 56);
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    doc.text("O Instituto de Educação e Tecnologia Altitude certifica que", pageWidth / 2, 70, { align: "center" });

    doc.setFont("times", "italic");
    doc.setFontSize(nome.length > 48 ? 24 : 29);
    const nameLines = doc.splitTextToSize(nome, 225);
    doc.text(nameLines, pageWidth / 2, 91, { align: "center" });
    const afterName = 91 + (nameLines.length - 1) * 10;

    doc.setFont("times", "normal");
    doc.setFontSize(12.5);
    doc.text("concluiu com aproveitamento o curso", pageWidth / 2, afterName + 15, { align: "center" });
    doc.setFont("times", "bold");
    doc.setTextColor(7, 49, 79);
    doc.setFontSize(20);
    const courseLines = doc.splitTextToSize(curso, 200);
    doc.text(courseLines, pageWidth / 2, afterName + 28, { align: "center" });
    const afterCourse = afterName + 28 + (courseLines.length - 1) * 8;

    const inicio = cert.periodo_inicio ? dataBR(cert.periodo_inicio) : (courseData?.matricula_criada_em ? dataBR(courseData.matricula_criada_em) : "data registrada na plataforma");
    const fim = cert.periodo_fim ? dataBR(cert.periodo_fim) : dataBR(cert.emitido_em);
    doc.setFont("times", "normal");
    doc.setTextColor(27, 42, 56);
    doc.setFontSize(11.5);
    doc.text(`com carga horária total de ${hours} horas e nota final de ${Number(cert.nota_final || 0)}%.`, pageWidth / 2, afterCourse + 13, { align: "center" });
    doc.text(`Período acadêmico: ${inicio} a ${fim}.`, pageWidth / 2, afterCourse + 21, { align: "center" });

    const signY = pageHeight - 36;
    doc.setDrawColor(92, 103, 112);
    doc.line(34, signY, 102, signY);
    doc.line(119, signY, 187, signY);
    doc.setFontSize(9);
    doc.setTextColor(50, 60, 70);
    doc.text("DIREÇÃO DO INSTITUTO ALTITUDE", 68, signY + 6, { align: "center" });
    doc.text("CONCLUINTE", 153, signY + 6, { align: "center" });

    doc.addImage(qr, "PNG", pageWidth - 52, pageHeight - 62, 25, 25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(7, 49, 79);
    doc.text("ESCANEIE PARA VALIDAR", pageWidth - 39.5, pageHeight - 66, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.text(cert.numero_certificado || String(cert.codigo_validacao), pageWidth / 2, pageHeight - 16, { align: "center" });

    // PÁGINA 2 - CONTEÚDO PROGRAMÁTICO
    doc.addPage("a4", "landscape");
    desenharMolduraCertificado(doc, pageWidth, pageHeight);
    doc.addImage(state.logoDataUrl, "PNG", pageWidth - 79, 23, 60, 9, undefined, "FAST");
    doc.setTextColor(27, 42, 56);
    doc.setFont("times", "bold");
    doc.setFontSize(25);
    doc.text("CONTEÚDO PROGRAMÁTICO", 45, 39);
    doc.setDrawColor(176, 143, 102);
    doc.setLineWidth(.7);
    doc.line(45, 44, 148, 44);

    const half = Math.ceil(modules.length / 2);
    const columns = [modules.slice(0, half), modules.slice(half)];
    const xs = [28, 116];
    columns.forEach((items, col) => {
      let y = 60;
      items.forEach((item, idx) => {
        doc.setFont("times", "bold");
        doc.setFontSize(9.4);
        doc.setTextColor(7, 49, 79);
        doc.text(`${col * half + idx + 1}.`, xs[col], y);
        doc.setFont("times", "normal");
        doc.setTextColor(30, 42, 54);
        const label = `${item.titulo}${item.horas ? ` (${item.horas} horas)` : ""}`;
        const lines = doc.splitTextToSize(label, 82);
        doc.text(lines, xs[col] + 8, y);
        y += 7.5 + (lines.length - 1) * 4.5;
      });
    });

    doc.setFillColor(238, 247, 249);
    doc.roundedRect(pageWidth - 77, 54, 56, 89, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(7, 49, 79);
    doc.setFontSize(10);
    doc.text("REGISTRO ACADÊMICO", pageWidth - 49, 67, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const legal = [
      `RA: ${state.aluno?.ra || "—"}`,
      `Carga horária certificada: ${hours} horas`,
      `Nota final: ${Number(cert.nota_final || 0)}%`,
      `Emissão: ${dataBR(cert.emitido_em)}`,
      "Curso livre de qualificação e atualização.",
      "Base legal institucional informada:",
      "LDB nº 9.394/96, art. 41, e Decreto nº 5.154/04.",
      "CNPJ: 45.628.030/0001-85"
    ];
    let legalY = 78;
    legal.forEach((line) => {
      const lines = doc.splitTextToSize(line, 48);
      doc.text(lines, pageWidth - 49, legalY, { align: "center" });
      legalY += 7 + (lines.length - 1) * 4;
    });
    doc.addImage(qr, "PNG", pageWidth - 60, 147, 23, 23);
    doc.setFontSize(7);
    doc.text("Autenticidade pelo QR Code", pageWidth - 49, 175, { align: "center" });

    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(27, 42, 56);
    doc.text(`TOTAL CERTIFICADO: ${hours} HORAS`, 29, pageHeight - 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(92, 103, 112);
    doc.text(`Documento nº ${cert.numero_certificado || cert.codigo_validacao} - confirme a autenticidade no Portal Altitude.`, pageWidth / 2, pageHeight - 16, { align: "center" });

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
        <div class="digital-card-data"><strong class="student-card-name">${escapeHTML(String(state.aluno.nome || "Aluno").toUpperCase())}</strong><span class="student-card-ra"><b>RA</b> ${escapeHTML(state.aluno.ra || "—")}</span><span>Status: ${escapeHTML(state.aluno.status || "ATIVO")}</span><span>Instituto de Educação e Tecnologia Altitude</span></div>
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
    doc.text("INSTITUTO ALTITUDE", 28, infoY + 8);

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
  await Promise.all([carregarCursos(), carregarResultados(), carregarAvaliacoes(), carregarCertificados(), carregarHistoricoCertificados(), carregarCarteirasHoras(), carregarPagamentos()]);
  renderCarteirinha();
  renderDashboard();
  renderCursos();
  renderCertificados();
  renderPagamentos();
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
  $("btnBaixarCarteirinha")?.addEventListener("click", baixarCarteirinhaPDF);
  $("cadTelefone")?.addEventListener("input", (event) => { event.target.value = maskPhone(event.target.value); });
  $("fotoAlunoInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file && $("previewFotoAluno")) $("previewFotoAluno").src = URL.createObjectURL(file);
  });
  $("btnModuloAnterior")?.addEventListener("click", () => selecionarModulo(state.moduloIndex - 1));
  $("btnProximoModulo")?.addEventListener("click", () => selecionarModulo(state.moduloIndex + 1));
  $("btnConcluirModulo")?.addEventListener("click", concluirModuloAtual);
  $("btnAbrirProva")?.addEventListener("click", abrirProva);
  $("btnIrParaProva")?.addEventListener("click", abrirProva);
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

function configurarAtualizacaoPeriodicaAluno() {
  if (window.__altitudePollingAluno) return;
  window.__altitudePollingAluno = true;
  let emExecucao = false;
  const atualizar = async () => {
    if (document.hidden || emExecucao || !state.aluno?.user_id) return;
    emExecucao = true;
    try {
      await atualizarDadosPrincipais();
      await carregarChamados();
      renderCarteirinha();
    } catch (error) {
      console.warn("Atualização periódica do portal:", error.message);
    } finally {
      emExecucao = false;
    }
  };
  window.setInterval(atualizar, 5000);
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
    }, 450);
  };
  const channel = sb.channel(`altitude-aluno-${state.aluno.user_id}`);
  ['cursos','modulos','materiais','provas','questoes','matriculas','resultados_provas','certificados','certificados_historico','carteiras_horas_curso','chamados','chamado_interacoes','avaliacoes_cursos']
    .forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
  channel.subscribe();
}

async function iniciarPortal() {
  configurarEventos();
  try {
    state.user = await obterUsuarioLogado();
    if (!state.user) return;
    await carregarAluno();
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
    toast(`Erro ao carregar o portal: ${error.message}`, "error");
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

iniciarPortal();
