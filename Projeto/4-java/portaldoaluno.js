/* =========================================================
   PORTAL DO ALUNO - ALTITUDE
   Cursos, certificados, pagamento manual, cupons e chamados.
========================================================= */

const sb = window.sb;
const $ = (id) => document.getElementById(id);

let alunoAtual = null;
let cursosMatriculados = [];
let cursosDisponiveis = [];
let certificados = [];
let pagamentos = [];

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value ?? "—";
}

function dinheiro(v){
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function dataBR(v){
  return v ? new Date(v).toLocaleDateString("pt-BR") : "—";
}

function imgCurso(url){
  return url || "https://placehold.co/140x90?text=Curso";
}

function badge(status){
  const s = String(status || "PENDENTE").toUpperCase();

  let cls = "neutral";
  if(["ATIVA","PAGO","EMITIDO","CONCLUIDA","RESOLVIDO","UTILIZADO","APROVADO"].includes(s)) cls = "ok";
  if(["PENDENTE","EM_ANDAMENTO","ABERTO","MEDIA","ALTA","BAIXA"].includes(s)) cls = "warn";
  if(["CANCELADO","INATIVO","BLOQUEADO","REPROVADO"].includes(s)) cls = "bad";

  return `<span class="status-badge ${cls}">${s}</span>`;
}

/* Abas principais */
function abrirAba(id){
  document.querySelectorAll(".aba").forEach(sec => sec.classList.remove("ativa"));
  document.querySelectorAll(".menu-link").forEach(btn => btn.classList.remove("ativo"));

  $(id)?.classList.add("ativa");
  document.querySelector(`[data-aba="${id}"]`)?.classList.add("ativo");
}
window.abrirAba = abrirAba;

/* Login obrigatório */
async function obterUsuarioLogado(){
  const { data, error } = await sb.auth.getUser();

  if(error || !data?.user){
    window.location.href = "/Projeto/1-html/4-login.html";
    return null;
  }

  return data.user;
}

async function sair(){
  await sb.auth.signOut();
  window.location.href = "/Projeto/1-html/4-login.html";
}

/* Dados pessoais */
async function carregarAluno(user){
  const { data, error } = await sb
    .from("alunos")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if(error){
    console.error("Erro ao carregar aluno:", error);
    return;
  }

  alunoAtual = data;

  const primeiro = (data.nome || "Aluno").split(" ")[0];

  setText("nomeAluno", primeiro);
  setText("nomeTopoAluno", primeiro);
  setText("infoRA", data.ra || "—");
  setText("infoRA2", data.ra || "—");
  setText("infoCPF", data.cpf || "—");
  setText("infoEmail", data.email || user.email || "—");
  setText("infoCelular", data.telefone || "—");
}

/* Cursos matriculados */
async function carregarCursosMatriculados(){
  const { data: matriculas, error } = await sb
    .from("matriculas")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id)
    .order("id", { ascending:false });

  if(error || !matriculas?.length){
    cursosMatriculados = [];
    renderCursosMatriculados();
    return;
  }

  const ids = matriculas.map(m => m.curso_id);

  const { data: cursos, error: erroCursos } = await sb
    .from("cursos")
    .select("*")
    .in("id", ids);

  if(erroCursos){
    console.error("Erro ao carregar cursos:", erroCursos);
    return;
  }

  cursosMatriculados = matriculas.map(m => {
    const c = (cursos || []).find(x => x.id === m.curso_id) || {};
    return {
      ...c,
      matricula_id: m.id,
      criada_em: m.criada_em || m.criado_em || new Date().toISOString(),
      status_matricula: m.status || "ATIVA",
      progresso: m.progresso || 0
    };
  });

  renderCursosMatriculados();
}

/* Cursos disponíveis */
async function carregarCursosDisponiveis(){
  const { data, error } = await sb
    .from("cursos")
    .select("*")
    .eq("publicado", true)
    .order("id", { ascending:false });

  if(error){
    console.error("Erro ao carregar cursos disponíveis:", error);
    cursosDisponiveis = [];
    renderCursosDisponiveis();
    return;
  }

  const idsMatriculados = cursosMatriculados.map(c => c.id);
  cursosDisponiveis = (data || []).filter(c => !idsMatriculados.includes(c.id));

  renderCursosDisponiveis();
}

function renderCursosMatriculados(){
  setText("kpiCursos", cursosMatriculados.length);

  const lista = $("listaCursos");
  const continuar = $("continuarEstudoBox");

  if(!cursosMatriculados.length){
    if(lista) lista.innerHTML = `<div class="empty-state">Você ainda não possui cursos matriculados.</div>`;
    if(continuar) continuar.innerHTML = `<div class="empty-state">Nenhum curso disponível para continuar.</div>`;
    atualizarProgresso();
    return;
  }

  const html = cursosMatriculados.map(c => `
    <div class="card-curso-aluno">
      <img class="curso-thumb" src="${imgCurso(c.capa_url)}" alt="Capa do curso">
      <div class="curso-conteudo">
        <h4>${c.titulo || "Curso"}</h4>
        <p>${c.categoria || "—"} · até ${c.carga_horaria || 0}h</p>
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

  if(lista) lista.innerHTML = html;

  const primeiro = cursosMatriculados[0];

  if(continuar){
    continuar.innerHTML = `
      <div class="curso-destaque">
        <img class="curso-thumb" src="${imgCurso(primeiro.capa_url)}" alt="Curso">
        <div class="curso-conteudo">
          <h3>${primeiro.titulo}</h3>
          <p>${primeiro.categoria || "—"} · até ${primeiro.carga_horaria || 0}h</p>
          <button onclick="abrirCurso(${primeiro.id})">Iniciar estudo</button>
        </div>
      </div>
    `;
  }

  atualizarProgresso();
}

function renderCursosDisponiveis(){
  const lista = $("listaCursosDisponiveis");
  if(!lista) return;

  if(!cursosDisponiveis.length){
    lista.innerHTML = `<div class="empty-state">Nenhum curso novo disponível no momento.</div>`;
    return;
  }

  lista.innerHTML = cursosDisponiveis.map(c => `
    <div class="card-curso-aluno">
      <img class="curso-thumb" src="${imgCurso(c.capa_url)}" alt="Capa do curso">

      <div class="curso-conteudo">
        <h4>${c.titulo}</h4>
        <p>${c.categoria || "—"} · até ${c.carga_horaria || 0}h</p>

        <div class="curso-acoes">
          <button onclick="matricularCurso(${c.id})">Matricular</button>
          <button class="secundario" onclick="visualizarCurso(${c.id})">Detalhes</button>
        </div>
      </div>
    </div>
  `).join("");
}

async function matricularCurso(cursoId){
  const { error } = await sb
    .from("matriculas")
    .insert({
      aluno_id: alunoAtual.user_id,
      curso_id: cursoId,
      status: "ATIVA",
      progresso: 0
    });

  if(error){
    alert("Erro ao matricular: " + error.message);
    return;
  }

  alert("Matrícula realizada com sucesso!");
  await carregarTudo();
}
window.matricularCurso = matricularCurso;

/* Banco de horas: 8h por dia, limitado à carga máxima do curso */
function diasDesde(data){
  const inicio = new Date(data);
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24)) + 1);
}

async function calcularBancoHorasDoCurso(curso){
  const cargaMaxima = Number(curso.carga_horaria || 0);
  const dias = diasDesde(curso.criada_em);
  const horasLiberadas = Math.min(dias * 8, cargaMaxima);

  const { data: certs } = await sb
    .from("certificados")
    .select("horas_emitidas")
    .eq("aluno_id", alunoAtual.user_id)
    .eq("curso_id", curso.id);

  const horasUsadas = (certs || []).reduce((acc,c) => acc + Number(c.horas_emitidas || 0), 0);
  const saldo = Math.max(0, horasLiberadas - horasUsadas);

  return { cargaMaxima, dias, horasLiberadas, horasUsadas, saldo };
}

/* Certificados */
async function carregarCertificados(){
  const { data } = await sb
    .from("certificados")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id);

  certificados = data || [];

  const emitidos = certificados.filter(c => String(c.status).toUpperCase() === "EMITIDO").length;

  setText("kpiCertEmitidos", emitidos);
  setText("kpiCertPendentes", Math.max(0, cursosMatriculados.length - emitidos));

  await renderCertificados();
}

async function renderCertificados(){
  const lista = $("listaCertificados");
  if(!lista) return;

  if(!cursosMatriculados.length){
    lista.innerHTML = `<div class="empty-state">Nenhum curso matriculado para emissão de certificado.</div>`;
    return;
  }

  const cards = [];

  for(const curso of cursosMatriculados){
    const h = await calcularBancoHorasDoCurso(curso);

    const { data: pend } = await sb
      .from("pagamentos")
      .select("*")
      .eq("aluno_id", alunoAtual.user_id)
      .eq("curso_id", curso.id)
      .eq("status", "PENDENTE")
      .order("id", { ascending:false })
      .limit(1);

    const { data: pagos } = await sb
      .from("pagamentos")
      .select("*")
      .eq("aluno_id", alunoAtual.user_id)
      .eq("curso_id", curso.id)
      .eq("status", "PAGO")
      .order("id", { ascending:false })
      .limit(1);

    const pagamentoPendente = pend?.[0];
    const pagamentoPago = pagos?.[0];

    cards.push(`
      <div class="cert-card">
        <div class="cert-top">
          <div>
            <h3>${curso.titulo}</h3>
            <p>${curso.categoria || "—"} · máximo certificável: ${h.cargaMaxima}h</p>
          </div>
          ${badge(curso.status_matricula)}
        </div>

        <div class="horas-grid">
          <div><strong>${h.horasLiberadas}h</strong><span>Liberadas</span></div>
          <div><strong>${h.horasUsadas}h</strong><span>Já emitidas</span></div>
          <div><strong>${h.saldo}h</strong><span>Saldo</span></div>
        </div>

        <div class="cert-actions">
          <input id="horas-cert-${curso.id}" type="number" min="1" max="${h.saldo}" placeholder="Horas">
          <input id="cupom-cert-${curso.id}" type="text" placeholder="Cupom">
          <button onclick="solicitarPagamentoCertificado(${curso.id}, ${h.saldo})">Gerar pagamento</button>
        </div>

        ${pagamentoPendente ? `
          <div class="alerta-pagamento">
            Pagamento pendente: ${dinheiro(pagamentoPendente.valor_final)}.
            Confirme o pagamento com a instituição para liberar a emissão.
          </div>
        ` : ""}

        ${pagamentoPago ? `
          <button class="btn-emitir" onclick="emitirCertificadoPago(${curso.id}, ${pagamentoPago.id}, ${pagamentoPago.horas_solicitadas})">
            Emitir certificado de ${pagamentoPago.horas_solicitadas}h
          </button>
        ` : ""}
      </div>
    `);
  }

  lista.innerHTML = cards.join("");
}

/* Gera pagamento pendente no banco. O gestor confirma depois. */
async function solicitarPagamentoCertificado(cursoId, saldo){
  const horas = Number($("horas-cert-" + cursoId)?.value || 0);
  const cupom = ($("cupom-cert-" + cursoId)?.value || "").trim().toUpperCase();

  if(!horas || horas < 1){
    alert("Informe a quantidade de horas.");
    return;
  }

  if(horas > saldo){
    alert("Você não possui saldo suficiente de horas.");
    return;
  }

  const curso = cursosMatriculados.find(c => c.id === cursoId);
  const valorHora = 5.00;

  let valor = horas * valorHora;
  let desconto = 0;

  if(cupom){
    const { data: cup } = await sb
      .from("cupons")
      .select("*")
      .eq("codigo", cupom)
      .eq("ativo", true)
      .single();

    if(cup){
      desconto = cup.tipo === "PERCENTUAL"
        ? valor * (Number(cup.valor) / 100)
        : Number(cup.valor);
    }
  }

  const valorFinal = Math.max(0, valor - desconto);
  const orderNsu = `ALT-${alunoAtual.ra || alunoAtual.user_id}-${cursoId}-${Date.now()}`;

  const { error } = await sb
    .from("pagamentos")
    .insert({
      aluno_id: alunoAtual.user_id,
      curso_id: cursoId,
      finalidade: "CERTIFICADO",
      horas_solicitadas: horas,
      descricao: `Certificado ${curso.titulo} - ${horas}h`,
      valor,
      desconto,
      valor_final: valorFinal,
      cupom_codigo: cupom || null,
      order_nsu: orderNsu,
      status: "PENDENTE",
      metodo: "INFINITEPAY_MANUAL"
    });

  if(error){
    alert("Erro ao criar pagamento: " + error.message);
    return;
  }

  alert(
    `Pagamento gerado!\n\n` +
    `Curso: ${curso.titulo}\n` +
    `Horas: ${horas}h\n` +
    `Valor: ${dinheiro(valorFinal)}\n\n` +
    `Pague via InfinitePay/PIX e aguarde a confirmação da instituição.`
  );

  await carregarPagamentos();
  await carregarCertificados();
}
window.solicitarPagamentoCertificado = solicitarPagamentoCertificado;

/* Após gestor confirmar pagamento como PAGO, aluno emite */
async function emitirCertificadoPago(cursoId, pagamentoId, horas){
  const { data: pagamento } = await sb
    .from("pagamentos")
    .select("*")
    .eq("id", pagamentoId)
    .eq("status", "PAGO")
    .single();

  if(!pagamento){
    alert("Pagamento ainda não confirmado.");
    return;
  }

  const { error } = await sb
    .from("certificados")
    .insert({
      aluno_id: alunoAtual.user_id,
      curso_id: cursoId,
      status: "EMITIDO",
      horas_emitidas: horas,
      emitido_em: new Date().toISOString()
    });

  if(error){
    alert("Erro ao emitir certificado: " + error.message);
    return;
  }

  await sb
    .from("pagamentos")
    .update({ status: "UTILIZADO" })
    .eq("id", pagamentoId);

  alert("Certificado emitido com sucesso!");

  await carregarPagamentos();
  await carregarCertificados();
}
window.emitirCertificadoPago = emitirCertificadoPago;

/* Pagamentos */
async function carregarPagamentos(){
  const lista = $("listaPagamentos");
  if(!lista) return;

  const { data, error } = await sb
    .from("pagamentos")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id)
    .order("id", { ascending:false });

  if(error){
    lista.innerHTML = `<div class="empty-state">Erro ao carregar pagamentos.</div>`;
    return;
  }

  pagamentos = data || [];

  if(!pagamentos.length){
    lista.innerHTML = `<div class="empty-state">Nenhum pagamento encontrado.</div>`;
    return;
  }

  lista.innerHTML = `
    <table class="table-portal">
      <thead>
        <tr>
          <th>Descrição</th>
          <th>Valor</th>
          <th>Desconto</th>
          <th>Final</th>
          <th>Status</th>
          <th>Criado em</th>
        </tr>
      </thead>
      <tbody>
        ${pagamentos.map(p => `
          <tr>
            <td>${p.descricao || "Pagamento"}</td>
            <td>${dinheiro(p.valor)}</td>
            <td>${dinheiro(p.desconto)}</td>
            <td>${dinheiro(p.valor_final)}</td>
            <td>${badge(p.status)}</td>
            <td>${dataBR(p.criado_em)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* Atendimento */
async function abrirChamadoAluno(){
  const assunto = $("chAssunto")?.value.trim();
  const categoria = $("chCategoria")?.value;
  const prioridade = $("chPrioridade")?.value;
  const mensagem = $("chMensagem")?.value.trim();

  if(!assunto || !mensagem){
    alert("Informe assunto e mensagem.");
    return;
  }

  const protocolo = `ALT-${Date.now()}`;

  const { error } = await sb
    .from("chamados")
    .insert({
      protocolo,
      aluno_id: alunoAtual.user_id,
      assunto,
      categoria,
      prioridade,
      mensagem,
      status: "ABERTO"
    });

  if(error){
    alert("Erro ao abrir chamado: " + error.message);
    return;
  }

  alert("Chamado aberto. Protocolo: " + protocolo);

  $("chAssunto").value = "";
  $("chMensagem").value = "";

  await carregarChamados();
}
window.abrirChamadoAluno = abrirChamadoAluno;

async function carregarChamados(){
  const lista = $("listaChamados");
  if(!lista) return;

  const { data, error } = await sb
    .from("chamados")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id)
    .order("id", { ascending:false });

  if(error){
    lista.innerHTML = `<div class="empty-state">Erro ao carregar chamados.</div>`;
    return;
  }

  const chamados = data || [];

  setText("chAbertos", chamados.filter(c => c.status === "ABERTO").length);
  setText("chAndamento", chamados.filter(c => c.status === "EM_ANDAMENTO").length);
  setText("chResolvidos", chamados.filter(c => c.status === "RESOLVIDO").length);

  if(!chamados.length){
    lista.innerHTML = `<div class="empty-state">Nenhum chamado registrado.</div>`;
    return;
  }

  lista.innerHTML = `
    <table class="table-portal">
      <thead>
        <tr>
          <th>Protocolo</th>
          <th>Assunto</th>
          <th>Categoria</th>
          <th>Prioridade</th>
          <th>Status</th>
          <th>Aberto em</th>
        </tr>
      </thead>
      <tbody>
        ${chamados.map(c => `
          <tr>
            <td>${c.protocolo}</td>
            <td>${c.assunto}</td>
            <td>${c.categoria}</td>
            <td>${badge(c.prioridade)}</td>
            <td>${badge(c.status)}</td>
            <td>${dataBR(c.criado_em)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* Progresso */
function atualizarProgresso(){
  const media = cursosMatriculados.length
    ? Math.round(cursosMatriculados.reduce((acc,c) => acc + Number(c.progresso || 0), 0) / cursosMatriculados.length)
    : 0;

  setText("progressoGeralTexto", `${media}%`);

  const circulo = $("progressoGeral");
  if(circulo){
    circulo.style.background = `conic-gradient(#3f7ee8 ${media * 3.6}deg,#e8edf7 0deg)`;
  }

  let nivel = "Bronze";
  if(media >= 50) nivel = "Prata";
  if(media >= 90) nivel = "Ouro";

  setText("nivelAlunoNome", nivel);
}

/* Modal do curso */
async function abrirCurso(id){
  const curso = cursosMatriculados.find(c => c.id === id);
  if(!curso) return;

  const box = $("cursoDetalheConteudo");
  const modal = $("modalCurso");

  box.innerHTML = `
    <h2>${curso.titulo}</h2>
    <p>${curso.categoria || "—"} · até ${curso.carga_horaria || 0}h</p>

    <div class="tabs-internas">
      <button class="ativo" data-painel="visao">Visão geral</button>
      <button data-painel="materiais">Materiais</button>
      <button data-painel="prova">Prova</button>
      <button data-painel="certificadoCurso">Certificado</button>
    </div>

    <div id="painel-visao" class="painel-interno ativo">
      <p>${curso.descricao || "Curso disponível para estudo."}</p>
    </div>

    <div id="painel-materiais" class="painel-interno">
      <div id="materiaisCurso">Carregando materiais...</div>
    </div>

    <div id="painel-prova" class="painel-interno">
      <div id="provaCurso">Carregando prova...</div>
    </div>

    <div id="painel-certificadoCurso" class="painel-interno">
      <p>A emissão do certificado é feita na aba <strong>Certificados</strong>, conforme saldo de horas e pagamento confirmado.</p>
    </div>
  `;

  modal.setAttribute("aria-hidden", "false");

  document.querySelectorAll(".tabs-internas button").forEach(btn => {
    btn.addEventListener("click", () => abrirPainelCurso(btn.dataset.painel, btn));
  });

  await carregarMateriaisCurso(id);
  await carregarProvaCurso(id);
}
window.abrirCurso = abrirCurso;

function fecharCurso(){
  $("modalCurso")?.setAttribute("aria-hidden", "true");
}
window.fecharCurso = fecharCurso;

function abrirPainelCurso(id, btn){
  document.querySelectorAll(".painel-interno").forEach(p => p.classList.remove("ativo"));
  document.querySelectorAll(".tabs-internas button").forEach(b => b.classList.remove("ativo"));

  $("painel-" + id)?.classList.add("ativo");
  btn?.classList.add("ativo");
}

async function carregarMateriaisCurso(cursoId){
  const el = $("materiaisCurso");
  if(!el) return;

  const { data, error } = await sb
    .from("materiais")
    .select("*")
    .eq("curso_id", cursoId)
    .order("id");

  if(error || !data?.length){
    el.innerHTML = `<div class="empty-state">Nenhum material disponível.</div>`;
    return;
  }

  el.innerHTML = data.map(m => `
    <div class="cert-card">
      <h3>${m.titulo || m.nome || "Material"}</h3>
      <p>Tipo: ${m.tipo || "Material"}</p>
      ${m.url ? `<a href="${m.url}" target="_blank">Abrir material</a>` : ""}
    </div>
  `).join("");
}

async function carregarProvaCurso(cursoId){
  const el = $("provaCurso");
  if(!el) return;

  const { data: provas } = await sb
    .from("provas")
    .select("*")
    .eq("curso_id", cursoId)
    .limit(1);

  const prova = provas?.[0];

  if(!prova){
    el.innerHTML = `<div class="empty-state">Nenhuma prova disponível.</div>`;
    return;
  }

  const { data: questoes } = await sb
    .from("questoes")
    .select("*")
    .eq("prova_id", prova.id)
    .order("id");

  if(!questoes?.length){
    el.innerHTML = `<div class="empty-state">Prova sem questões.</div>`;
    return;
  }

  el.innerHTML = `
    <h3>${prova.titulo}</h3>
    ${questoes.map((q,i) => `
      <div class="cert-card">
        <strong>${i+1}. ${q.enunciado}</strong>
        <label class="prova-opcao"><input type="radio" name="q${q.id}" value="A"> ${q.a}</label>
        <label class="prova-opcao"><input type="radio" name="q${q.id}" value="B"> ${q.b}</label>
        <label class="prova-opcao"><input type="radio" name="q${q.id}" value="C"> ${q.c}</label>
        <label class="prova-opcao"><input type="radio" name="q${q.id}" value="D"> ${q.d}</label>
      </div>
    `).join("")}
    <button onclick="corrigirProva(${prova.id})">Finalizar prova</button>
  `;
}

function corrigirProva(provaId){
  alert("Correção da prova será gravada na próxima etapa. Prova ID: " + provaId);
}
window.corrigirProva = corrigirProva;

function visualizarCurso(id){
  alert("Detalhes do curso ID: " + id);
}
window.visualizarCurso = visualizarCurso;

/* Busca interna */
function configurarBusca(){
  const input = $("buscaPortalAluno");
  if(!input) return;

  input.addEventListener("input", () => {
    const termo = input.value.toLowerCase();

    document.querySelectorAll(".card-curso-aluno,.cert-card,.table-portal tr").forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(termo) ? "" : "none";
    });
  });
}

/* Carregamento geral */
async function carregarTudo(){
  await carregarCursosMatriculados();
  await carregarCursosDisponiveis();
  await carregarCertificados();
  await carregarPagamentos();
  await carregarChamados();
}

/* Inicialização */
document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".menu-link").forEach(btn => {
    btn.addEventListener("click", () => abrirAba(btn.dataset.aba));
  });

  $("btnSair")?.addEventListener("click", sair);

  configurarBusca();

  const user = await obterUsuarioLogado();
  if(!user) return;

  await carregarAluno(user);
  await carregarTudo();
});