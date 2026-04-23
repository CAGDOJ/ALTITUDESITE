/* =========================================================
   PORTAL DO ALUNO - ALTITUDE
   JS completo para colar
   Requer:
   - sb (Supabase client global já inicializado)
   - views/tabelas já criadas no banco
   ========================================================= */

/* ---------------------------
   Utilidades
--------------------------- */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

function setText(id, value, fallback = "—") {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? fallback;
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function getStatusBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  if (["EMITIDO", "PAGO", "CONCLUIDA", "ATIVA", "RESOLVIDO"].includes(s)) return "ok";
  if (["PENDENTE", "EM_ANDAMENTO", "BLOQUEADO"].includes(s)) return "warn";
  if (["CANCELADO", "INATIVO", "TRANCADA"].includes(s)) return "bad";
  return "neutral";
}

function statusBadge(status) {
  return `<span class="status-badge ${getStatusBadgeClass(status)}">${status || "—"}</span>`;
}

function safeImage(url, fallback = "https://placehold.co/120x70?text=Curso") {
  return url || fallback;
}

/* ---------------------------
   Navegação entre abas
   Usa data-aba nos botões/menu
   e ids das seções
--------------------------- */
function abrirAba(id) {
  $$(".aba").forEach(sec => sec.classList.remove("ativa"));
  const alvo = document.getElementById(id);
  if (alvo) alvo.classList.add("ativa");

  $$(".menu-link").forEach(btn => btn.classList.remove("ativo"));
  const link = document.querySelector(`[data-aba="${id}"]`);
  if (link) link.classList.add("ativo");
}

window.abrirAba = abrirAba;

/* ---------------------------
   Estado global
--------------------------- */
let ALUNO_ATUAL = null;
let CURSOS_ALUNO = [];
let CERTIFICADOS_ALUNO = [];
let PAGAMENTOS_ALUNO = [];
let CHAMADOS_ALUNO = [];

/* ---------------------------
   Auth / usuário atual
--------------------------- */
async function obterUsuarioAtual() {
  if (typeof sb === "undefined" || !sb) {
    console.error("Supabase client não encontrado.");
    return null;
  }

  const { data, error } = await sb.auth.getUser();
  if (error) {
    console.error("Erro ao obter usuário autenticado:", error);
    return null;
  }

  return data?.user || null;
}

/* ---------------------------
   Carregar dados pessoais do aluno
--------------------------- */
async function carregarDadosAluno() {
  const user = await obterUsuarioAtual();
  if (!user) return null;

  const { data, error } = await sb
    .from("alunos")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Erro ao carregar dados do aluno:", error);
    return null;
  }

  ALUNO_ATUAL = data;

  setText("nomeAluno", data.nome || "Aluno");
  setText("nomeTopoAluno", data.nome || "Aluno");
  setText("infoRA", data.ra || "—");
  setText("infoCPF", data.cpf || "—");
  setText("infoEmail", data.email || user.email || "—");
  setText("infoCelular", data.telefone || "—");

  return data;
}

/* ---------------------------
   Dashboard resumido do aluno
   Requer view: v_aluno_dashboard
--------------------------- */
async function carregarDashboardAluno() {
  const user = await obterUsuarioAtual();
  if (!user) return;

  const { data, error } = await sb
    .from("v_aluno_dashboard")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Erro ao carregar dashboard do aluno:", error);
    return;
  }

  setText("kpiCursos", data.total_cursos || 0);
  setText("kpiCertEmitidos", data.certificados_emitidos || 0);
  setText("kpiCertPendentes", data.certificados_pendentes || 0);

  // resumo em outros cards, se existirem
  setText("resumoTotalCursos", data.total_cursos || 0);
  setText("resumoCertEmitidos", data.certificados_emitidos || 0);
  setText("resumoCertPendentes", data.certificados_pendentes || 0);
}

/* ---------------------------
   Cursos do aluno
   Requer view: v_aluno_cursos
--------------------------- */
async function carregarCursosAluno() {
  const user = await obterUsuarioAtual();
  if (!user) return;

  const { data, error } = await sb
    .from("v_aluno_cursos")
    .select("*")
    .eq("aluno_id", user.id)
    .order("curso_id", { ascending: false });

  if (error) {
    console.error("Erro ao carregar cursos do aluno:", error);
    return;
  }

  CURSOS_ALUNO = data || [];

  renderCursosAluno();
  renderContinuarEstudo();
  atualizarProgressoGeral();
}

function renderCursosAluno() {
  const lista = document.getElementById("listaCursos");
  if (!lista) return;

  if (!CURSOS_ALUNO.length) {
    lista.innerHTML = `<div class="empty-state">Nenhum curso matriculado ainda.</div>`;
    return;
  }

  lista.innerHTML = CURSOS_ALUNO.map(item => `
    <div class="card-curso-aluno">
      <img class="curso-thumb" src="${safeImage(item.capa_url)}" alt="Capa do curso">
      <div class="curso-conteudo">
        <h4>${item.titulo || "Curso"}</h4>
        <p>${item.categoria || "—"} · ${item.carga_horaria || 0}h</p>
        <p>Status matrícula: ${statusBadge(item.status_matricula)}</p>
        <p>Status certificado: ${statusBadge(item.status_certificado)}</p>
        <p>Status pagamento: ${statusBadge(item.status_pagamento)}</p>
        <div class="progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Number(item.progresso || 0)}%"></div>
          </div>
          <span>${Number(item.progresso || 0)}%</span>
        </div>
        <div class="curso-acoes">
          <button onclick="abrirCurso(${item.curso_id})">Continuar</button>
          ${String(item.status_pagamento || "").toUpperCase() !== "PAGO"
            ? `<button onclick="pagarCurso(${item.curso_id})">Pagar</button>`
            : ``}
        </div>
      </div>
    </div>
  `).join("");
}

function renderContinuarEstudo() {
  const box = document.getElementById("continuarEstudoBox");
  if (!box) return;

  if (!CURSOS_ALUNO.length) {
    box.innerHTML = `<div class="empty-state">Nenhum curso disponível para continuar.</div>`;
    return;
  }

  const curso = [...CURSOS_ALUNO]
    .sort((a, b) => Number(b.progresso || 0) - Number(a.progresso || 0))
    .find(c => String(c.status_matricula || "").toUpperCase() === "ATIVA")
    || CURSOS_ALUNO[0];

  box.innerHTML = `
    <div class="curso-destaque">
      <img class="curso-thumb destaque" src="${safeImage(curso.capa_url)}" alt="Curso">
      <div class="curso-conteudo">
        <h3>${curso.titulo}</h3>
        <p>${curso.categoria || "—"} · ${curso.carga_horaria || 0}h</p>
        <p>Progresso atual: ${Number(curso.progresso || 0)}%</p>
        <button onclick="abrirCurso(${curso.curso_id})">Iniciar Estudo</button>
      </div>
    </div>
  `;
}

function atualizarProgressoGeral() {
  const progressoEl = document.getElementById("progressoGeral");
  const progressoTxt = document.getElementById("progressoGeralTexto");
  if (!progressoEl && !progressoTxt) return;

  let media = 0;
  if (CURSOS_ALUNO.length) {
    media = CURSOS_ALUNO.reduce((acc, item) => acc + Number(item.progresso || 0), 0) / CURSOS_ALUNO.length;
  }
  media = Math.round(media);

  if (progressoTxt) progressoTxt.textContent = `${media}%`;

  // para círculo CSS via conic-gradient
  if (progressoEl) {
    progressoEl.style.background = `conic-gradient(#4e8df5 ${media * 3.6}deg, #e8edf7 0deg)`;
  }
}

/* ---------------------------
   Certificados
--------------------------- */
async function carregarCertificadosAluno() {
  const user = await obterUsuarioAtual();
  if (!user) return;

  const { data, error } = await sb
    .from("certificados")
    .select(`
      id,
      curso_id,
      status,
      emitido_em,
      cursos (
        titulo
      )
    `)
    .eq("aluno_id", user.id)
    .order("id", { ascending: false });

  if (error) {
    console.error("Erro ao carregar certificados:", error);
    return;
  }

  CERTIFICADOS_ALUNO = data || [];
  renderCertificadosAluno();
}

function renderCertificadosAluno() {
  const lista = document.getElementById("listaCertificados");
  if (!lista) return;

  if (!CERTIFICADOS_ALUNO.length) {
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
        ${CERTIFICADOS_ALUNO.map(item => `
          <tr>
            <td>${item.cursos?.titulo || "Curso"}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${formatDate(item.emitido_em)}</td>
            <td>
              ${String(item.status || "").toUpperCase() === "EMITIDO"
                ? `<button onclick="baixarCertificado(${item.id})">Baixar</button>`
                : `<button disabled>Indisponível</button>`}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* ---------------------------
   Pagamentos
--------------------------- */
async function carregarPagamentosAluno() {
  const user = await obterUsuarioAtual();
  if (!user) return;

  const { data, error } = await sb
    .from("pagamentos")
    .select(`
      id,
      curso_id,
      valor,
      status,
      vencimento,
      pago_em,
      cursos (
        titulo
      )
    `)
    .eq("aluno_id", user.id)
    .order("id", { ascending: false });

  if (error) {
    console.error("Erro ao carregar pagamentos:", error);
    return;
  }

  PAGAMENTOS_ALUNO = data || [];
  renderPagamentosAluno();
}

function renderPagamentosAluno() {
  const lista = document.getElementById("listaPagamentos");
  if (!lista) return;

  if (!PAGAMENTOS_ALUNO.length) {
    lista.innerHTML = `<div class="empty-state">Nenhum pagamento encontrado.</div>`;
    return;
  }

  lista.innerHTML = `
    <table class="table-portal">
      <thead>
        <tr>
          <th>Curso</th>
          <th>Valor</th>
          <th>Status</th>
          <th>Vencimento</th>
          <th>Pago em</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${PAGAMENTOS_ALUNO.map(item => `
          <tr>
            <td>${item.cursos?.titulo || "Curso"}</td>
            <td>${formatMoney(item.valor)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${formatDate(item.vencimento)}</td>
            <td>${formatDate(item.pago_em)}</td>
            <td>
              ${String(item.status || "").toUpperCase() === "PENDENTE"
                ? `<button onclick="pagarPagamento(${item.id})">Pagar</button>`
                : `<button disabled>Quitado</button>`}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* ---------------------------
   Chamados
--------------------------- */
async function carregarChamadosAluno() {
  const user = await obterUsuarioAtual();
  if (!user) return;

  const { data, error } = await sb
    .from("chamados")
    .select("*")
    .eq("aluno_id", user.id)
    .order("id", { ascending: false });

  if (error) {
    console.error("Erro ao carregar chamados:", error);
    return;
  }

  CHAMADOS_ALUNO = data || [];
  renderChamadosAluno();
  renderUltimasAtividades();
}

function renderChamadosAluno() {
  const lista = document.getElementById("listaChamados");
  if (!lista) return;

  if (!CHAMADOS_ALUNO.length) {
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
          <th>Criado em</th>
        </tr>
      </thead>
      <tbody>
        ${CHAMADOS_ALUNO.map(item => `
          <tr>
            <td>${item.protocolo || "—"}</td>
            <td>${item.assunto || "—"}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${statusBadge(item.prioridade)}</td>
            <td>${formatDate(item.criado_em)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderUltimasAtividades() {
  const box = document.getElementById("ultimasAtividades");
  if (!box) return;

  const atividades = [];

  CURSOS_ALUNO.slice(0, 3).forEach(c => {
    atividades.push(`Curso: ${c.titulo} · progresso ${Number(c.progresso || 0)}%`);
  });

  CHAMADOS_ALUNO.slice(0, 3).forEach(ch => {
    atividades.push(`Chamado ${ch.protocolo || ""} · ${ch.status}`);
  });

  if (!atividades.length) {
    box.innerHTML = `<div class="empty-state">Nenhuma atividade recente</div>`;
    return;
  }

  box.innerHTML = atividades.map(a => `<div class="atividade-item">${a}</div>`).join("");
}

/* ---------------------------
   Pagamento
   Hoje: placeholder funcional
   Depois: integrar checkout real
--------------------------- */
function pagarCurso(cursoId) {
  alert(`Pagamento do curso ${cursoId} ainda será integrado ao gateway.`);
}

function pagarPagamento(pagamentoId) {
  alert(`Pagamento ${pagamentoId} ainda será integrado ao gateway.`);
}

window.pagarCurso = pagarCurso;
window.pagarPagamento = pagarPagamento;

/* ---------------------------
   Curso / certificado
--------------------------- */
function abrirCurso(cursoId) {
  alert(`Abrir curso ID: ${cursoId}`);
}

function baixarCertificado(certificadoId) {
  alert(`Baixar certificado ID: ${certificadoId}`);
}

window.abrirCurso = abrirCurso;
window.baixarCertificado = baixarCertificado;

/* ---------------------------
   Nível do aluno
--------------------------- */
function atualizarNivelAluno() {
  const nivelNome = document.getElementById("nivelAlunoNome");
  if (!nivelNome) return;

  let concluidos = CURSOS_ALUNO.filter(c => String(c.status_matricula || "").toUpperCase() === "CONCLUIDA").length;

  let nivel = "Bronze";
  if (concluidos >= 3) nivel = "Prata";
  if (concluidos >= 5) nivel = "Ouro";

  nivelNome.textContent = nivel;
}

/* ---------------------------
   Busca local simples
--------------------------- */
function configurarBusca() {
  const input = document.getElementById("buscaPortalAluno");
  if (!input) return;

  input.addEventListener("input", () => {
    const termo = input.value.trim().toLowerCase();
    const cards = $$(".card-curso-aluno");

    cards.forEach(card => {
      const txt = card.textContent.toLowerCase();
      card.style.display = txt.includes(termo) ? "" : "none";
    });
  });
}

/* ---------------------------
   Boot principal
--------------------------- */
async function iniciarPortalAluno() {
  await carregarDadosAluno();
  await carregarDashboardAluno();
  await carregarCursosAluno();
  await carregarCertificadosAluno();
  await carregarPagamentosAluno();
  await carregarChamadosAluno();
  atualizarNivelAluno();
  configurarBusca();
}

/* ---------------------------
   Inicialização
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  iniciarPortalAluno();

  // liga navegação caso existam botões com data-aba
  $$(".menu-link[data-aba]").forEach(btn => {
    btn.addEventListener("click", () => abrirAba(btn.dataset.aba));
  });
});