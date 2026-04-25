/* =========================================================
   PORTAL DO ALUNO - ALTITUDE
   JavaScript completo e documentado
========================================================= */

/* Cliente Supabase vem do arquivo supabase-init.js */
const sb = window.sb;

/* Atalho para buscar elemento por ID */
const $ = (id) => document.getElementById(id);

/* Estado local da página */
let alunoAtual = null;
let cursosMatriculados = [];
let cursosDisponiveis = [];
let certificados = [];
let pagamentos = [];

/* ---------------------------
   Funções utilitárias
--------------------------- */

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "—";
}

function dinheiro(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function dataBR(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR");
}

function imgCurso(url) {
  return url || "https://placehold.co/140x90?text=Curso";
}

function badge(status) {
  const s = String(status || "PENDENTE").toUpperCase();

  let cls = "neutral";
  if (["ATIVA", "PAGO", "EMITIDO", "CONCLUIDA", "RESOLVIDO"].includes(s)) cls = "ok";
  if (["PENDENTE", "EM_ANDAMENTO", "ABERTO"].includes(s)) cls = "warn";
  if (["CANCELADO", "INATIVO", "BLOQUEADO"].includes(s)) cls = "bad";

  return `<span class="status-badge ${cls}">${s}</span>`;
}

/* ---------------------------
   Controle das abas
--------------------------- */

function abrirAba(id) {
  document.querySelectorAll(".aba").forEach(sec => sec.classList.remove("ativa"));
  document.querySelectorAll(".menu-link").forEach(btn => btn.classList.remove("ativo"));

  $(id)?.classList.add("ativa");
  document.querySelector(`[data-aba="${id}"]`)?.classList.add("ativo");
}

window.abrirAba = abrirAba;

/* ---------------------------
   Autenticação
--------------------------- */

async function obterUsuarioLogado() {
  const { data, error } = await sb.auth.getUser();

  if (error || !data?.user) {
    window.location.href = "/Projeto/1-html/4-login.html";
    return null;
  }

  return data.user;
}

async function sair() {
  await sb.auth.signOut();
  window.location.href = "/Projeto/1-html/4-login.html";
}

/* ---------------------------
   Dados pessoais do aluno
--------------------------- */

async function carregarAluno(user) {
  const { data, error } = await sb
    .from("alunos")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Erro ao carregar aluno:", error);
    return;
  }

  alunoAtual = data;

  const nomeCompleto = data.nome || "Aluno";
  const primeiroNome = nomeCompleto.split(" ")[0];

  setText("nomeAluno", primeiroNome);
  setText("nomeTopoAluno", primeiroNome);
  setText("infoRA", data.ra || "—");
  setText("infoRA2", data.ra || "—");
  setText("infoCPF", data.cpf || "—");
  setText("infoEmail", data.email || user.email || "—");
  setText("infoCelular", data.telefone || "—");
}

/* ---------------------------
   Cursos matriculados
--------------------------- */

async function carregarCursosMatriculados(user) {
  const { data: matriculas, error } = await sb
    .from("matriculas")
    .select("*")
    .eq("aluno_id", user.id)
    .order("id", { ascending: false });

  if (error) {
    console.warn("Sem matrículas ou tabela bloqueada:", error.message);
    cursosMatriculados = [];
    renderCursosMatriculados();
    return;
  }

  if (!matriculas?.length) {
    cursosMatriculados = [];
    renderCursosMatriculados();
    return;
  }

  const idsCursos = matriculas.map(m => m.curso_id);

  const { data: cursos, error: erroCursos } = await sb
    .from("cursos")
    .select("*")
    .in("id", idsCursos);

  if (erroCursos) {
    console.error("Erro ao carregar cursos:", erroCursos);
    return;
  }

  cursosMatriculados = matriculas.map(m => {
    const curso = cursos.find(c => c.id === m.curso_id) || {};
    return {
      ...curso,
      matricula_id: m.id,
      status_matricula: m.status || "ATIVA",
      progresso: m.progresso || 0
    };
  });

  renderCursosMatriculados();
}

/* ---------------------------
   Cursos disponíveis
--------------------------- */

async function carregarCursosDisponiveis() {
  const { data, error } = await sb
    .from("cursos")
    .select("*")
    .eq("publicado", true)
    .order("id", { ascending: false });

  if (error) {
    console.error("Erro ao carregar cursos disponíveis:", error);
    cursosDisponiveis = [];
    renderCursosDisponiveis();
    return;
  }

  const idsMatriculados = cursosMatriculados.map(c => c.id);
  cursosDisponiveis = (data || []).filter(c => !idsMatriculados.includes(c.id));

  renderCursosDisponiveis();
}

/* ---------------------------
   Renderização dos cursos
--------------------------- */

function renderCursosMatriculados() {
  setText("kpiCursos", cursosMatriculados.length);

  const lista = $("listaCursos");
  const continuar = $("continuarEstudoBox");

  if (!cursosMatriculados.length) {
    if (lista) lista.innerHTML = `<div class="empty-state">Você ainda não possui cursos matriculados.</div>`;
    if (continuar) continuar.innerHTML = `<div class="empty-state">Nenhum curso disponível para continuar.</div>`;
    atualizarProgresso();
    return;
  }

  const html = cursosMatriculados.map(c => `
    <div class="card-curso-aluno">
      <img class="curso-thumb" src="${imgCurso(c.capa_url)}" alt="Capa do curso">

      <div class="curso-conteudo">
        <h4>${c.titulo || "Curso"}</h4>
        <p>${c.categoria || "—"} · ${c.carga_horaria || 0}h</p>
        <p>Matrícula: ${badge(c.status_matricula)}</p>

        <div class="progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Number(c.progresso || 0)}%"></div>
          </div>
          <span>${Number(c.progresso || 0)}%</span>
        </div>

        <div class="curso-acoes">
          <button onclick="abrirCurso(${c.id})">Continuar</button>
        </div>
      </div>
    </div>
  `).join("");

  if (lista) lista.innerHTML = html;

  const primeiro = cursosMatriculados[0];
  if (continuar) {
    continuar.innerHTML = `
      <div class="curso-destaque">
        <img class="curso-thumb" src="${imgCurso(primeiro.capa_url)}" alt="Curso">
        <div class="curso-conteudo">
          <h3>${primeiro.titulo}</h3>
          <p>${primeiro.categoria || "—"} · ${primeiro.carga_horaria || 0}h</p>
          <button onclick="abrirCurso(${primeiro.id})">Iniciar estudo</button>
        </div>
      </div>
    `;
  }

  atualizarProgresso();
}

function renderCursosDisponiveis() {
  const lista = $("listaCursosDisponiveis");
  if (!lista) return;

  if (!cursosDisponiveis.length) {
    lista.innerHTML = `<div class="empty-state">Nenhum curso novo disponível no momento.</div>`;
    return;
  }

  lista.innerHTML = cursosDisponiveis.map(c => `
    <div class="card-curso-aluno">
      <img class="curso-thumb" src="${imgCurso(c.capa_url)}" alt="Capa do curso">

      <div class="curso-conteudo">
        <h4>${c.titulo}</h4>
        <p>${c.categoria || "—"} · ${c.carga_horaria || 0}h</p>

        <div class="curso-acoes">
          <button onclick="matricularCurso(${c.id})">Matricular</button>
          <button class="secundario" onclick="visualizarCurso(${c.id})">Detalhes</button>
        </div>
      </div>
    </div>
  `).join("");
}

/* ---------------------------
   Certificados
--------------------------- */

async function carregarCertificados(user) {
  const { data, error } = await sb
    .from("certificados")
    .select("*")
    .eq("aluno_id", user.id)
    .order("id", { ascending: false });

  if (error) {
    console.warn("Erro ao carregar certificados:", error.message);
    certificados = [];
  } else {
    certificados = data || [];
  }

  renderCertificados();
}

function renderCertificados() {
  const emitidos = certificados.filter(c => String(c.status).toUpperCase() === "EMITIDO").length;
  const pendentes = certificados.length - emitidos;

  setText("kpiCertEmitidos", emitidos);
  setText("kpiCertPendentes", pendentes);

  const lista = $("listaCertificados");
  if (!lista) return;

  if (!certificados.length) {
    lista.innerHTML = `<div class="empty-state">Nenhum certificado encontrado.</div>`;
    return;
  }

  lista.innerHTML = `
    <table class="table-portal">
      <thead>
        <tr>
          <th>Curso</th>
          <th>Status</th>
          <th>Emitido em</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${certificados.map(c => {
          const curso = cursosMatriculados.find(x => x.id === c.curso_id);
          const emitido = String(c.status).toUpperCase() === "EMITIDO";

          return `
            <tr>
              <td>${curso?.titulo || "Curso"}</td>
              <td>${badge(c.status)}</td>
              <td>${dataBR(c.emitido_em)}</td>
              <td>${emitido ? `<button onclick="baixarCertificado(${c.id})">Baixar</button>` : `<button disabled>Pendente</button>`}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

/* ---------------------------
   Pagamentos
--------------------------- */

async function carregarPagamentos(user) {
  try {
    const { data, error } = await sb
      .from("pagamentos")
      .select("*")
      .eq("aluno_id", user.id)
      .order("id", { ascending: false });

    if (error) throw error;
    pagamentos = data || [];
  } catch (err) {
    pagamentos = [];
  }

  renderPagamentos();
}

function renderPagamentos() {
  const lista = $("listaPagamentos");
  if (!lista) return;

  if (!pagamentos.length) {
    lista.innerHTML = `<div class="empty-state">Nenhum pagamento encontrado.</div>`;
    return;
  }

  lista.innerHTML = `
    <table class="table-portal">
      <thead>
        <tr>
          <th>Descrição</th>
          <th>Valor</th>
          <th>Status</th>
          <th>Vencimento</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${pagamentos.map(p => {
          const pendente = String(p.status).toUpperCase() === "PENDENTE";
          return `
            <tr>
              <td>${p.descricao || "Pagamento"}</td>
              <td>${dinheiro(p.valor)}</td>
              <td>${badge(p.status)}</td>
              <td>${dataBR(p.vencimento)}</td>
              <td>${pendente ? `<button onclick="pagar(${p.id})">Pagar</button>` : `<button disabled>Pago</button>`}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

/* ---------------------------
   Chamados
--------------------------- */

async function carregarChamados(user) {
  const lista = $("listaChamados");
  if (!lista) return;

  const { data, error } = await sb
    .from("chamados")
    .select("*")
    .eq("aluno_id", user.id)
    .order("id", { ascending: false });

  if (error || !data?.length) {
    lista.innerHTML = `<div class="empty-state">Nenhum chamado registrado.</div>`;
    return;
  }

  lista.innerHTML = `
    <table class="table-portal">
      <thead>
        <tr>
          <th>Protocolo</th>
          <th>Assunto</th>
          <th>Status</th>
          <th>Prioridade</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(c => `
          <tr>
            <td>${c.protocolo || "—"}</td>
            <td>${c.assunto || "—"}</td>
            <td>${badge(c.status)}</td>
            <td>${badge(c.prioridade)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* ---------------------------
   Progresso e nível
--------------------------- */

function atualizarProgresso() {
  const media = cursosMatriculados.length
    ? Math.round(cursosMatriculados.reduce((acc, c) => acc + Number(c.progresso || 0), 0) / cursosMatriculados.length)
    : 0;

  setText("progressoGeralTexto", `${media}%`);

  const circulo = $("progressoGeral");
  if (circulo) {
    circulo.style.background = `conic-gradient(#3f7ee8 ${media * 3.6}deg, #e8edf7 0deg)`;
  }

  let nivel = "Bronze";
  if (media >= 50) nivel = "Prata";
  if (media >= 90) nivel = "Ouro";

  setText("nivelAlunoNome", nivel);
}

/* ---------------------------
   Ações
--------------------------- */

async function matricularCurso(cursoId) {
  if (!alunoAtual) return;

  const { error } = await sb.from("matriculas").insert({
    aluno_id: alunoAtual.user_id,
    curso_id: cursoId,
    status: "ATIVA"
  });

  if (error) {
    alert("Erro ao matricular: " + error.message);
    return;
  }

  alert("Matrícula realizada com sucesso!");
  location.reload();
}

function abrirCurso(id) {
  alert("Abrir ambiente do curso ID: " + id);
}

function visualizarCurso(id) {
  alert("Visualizar detalhes do curso ID: " + id);
}

function baixarCertificado(id) {
  alert("Baixar certificado ID: " + id);
}

function pagar(id) {
  alert("Integração de pagamento ID: " + id);
}

window.matricularCurso = matricularCurso;
window.abrirCurso = abrirCurso;
window.visualizarCurso = visualizarCurso;
window.baixarCertificado = baixarCertificado;
window.pagar = pagar;

/* ---------------------------
   Busca interna
--------------------------- */

function configurarBusca() {
  const input = $("buscaPortalAluno");
  if (!input) return;

  input.addEventListener("input", () => {
    const termo = input.value.toLowerCase();

    document.querySelectorAll(".card-curso-aluno").forEach(card => {
      const texto = card.textContent.toLowerCase();
      card.style.display = texto.includes(termo) ? "flex" : "none";
    });
  });
}

/* ---------------------------
   Inicialização da página
--------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".menu-link").forEach(btn => {
    btn.addEventListener("click", () => abrirAba(btn.dataset.aba));
  });

  $("btnSair")?.addEventListener("click", sair);

  configurarBusca();

  const user = await obterUsuarioLogado();
  if (!user) return;

  await carregarAluno(user);
  await carregarCursosMatriculados(user);
  await carregarCursosDisponiveis();
  await carregarCertificados(user);
  await carregarPagamentos(user);
  await carregarChamados(user);
});