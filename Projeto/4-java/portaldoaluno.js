/* =========================================================
   PORTAL DO ALUNO - ALTITUDE
   Compatível com seu banco atual: alunos, cursos, matriculas,
   materiais, provas, questoes, resultados_provas, certificados,
   pagamentos, chamados e cupons.
========================================================= */

const sb = window.sb;
const $ = (id) => document.getElementById(id);

let usuarioLogado = null;
let alunoAtual = null;

let cursosMatriculados = [];
let cursosDisponiveis = [];
let certificados = [];
let pagamentos = [];
let resultadosProvas = [];

let cursoSolicitacaoAtual = null;
let limiteSolicitacaoAtual = 0;

const VALOR_HORA_CERTIFICADO = 5.00;
const BUCKET_FOTOS = "fotos_alunos";

/* =========================================================
   UTILITÁRIOS
========================================================= */

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
  return v ? new Date(v).toLocaleDateString("pt-BR") : "—";
}

function imgCurso(url) {
  return url || "https://placehold.co/140x90?text=Curso";
}

function imgAluno(url) {
  return url || "https://placehold.co/120x120?text=Aluno";
}

function maskCpf(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function maskPhone(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  const ddd = d.slice(0, 2);
  const p1 = d.length > 10 ? d.slice(2, 7) : d.slice(2, 6);
  const p2 = d.length > 10 ? d.slice(7, 11) : d.slice(6, 10);
  return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`;
}

function badge(status) {
  const s = String(status || "PENDENTE").toUpperCase();

  let cls = "neutral";

  if (
    ["ATIVA", "PAGO", "EMITIDO", "CONCLUIDA", "RESOLVIDO", "UTILIZADO", "APROVADO", "PRONTO PARA SOLICITAÇÃO", "PRONTO PARA EMITIR"].includes(s)
  ) cls = "ok";

  if (
    ["PENDENTE", "EM_ANDAMENTO", "ABERTO", "MEDIA", "ALTA", "BAIXA", "AGUARDANDO PAGAMENTO", "EM ANDAMENTO"].includes(s)
  ) cls = "warn";

  if (
    ["CANCELADO", "INATIVO", "BLOQUEADO", "REPROVADO"].includes(s)
  ) cls = "bad";

  return `<span class="status-badge ${cls}">${s}</span>`;
}

function diasDesde(data) {
  const inicio = new Date(data);
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24)) + 1);
}

/* =========================================================
   ABAS
========================================================= */

function abrirAba(id) {
  document.querySelectorAll(".aba").forEach(sec => sec.classList.remove("ativa"));
  document.querySelectorAll(".menu-link").forEach(btn => btn.classList.remove("ativo"));

  $(id)?.classList.add("ativa");
  document.querySelector(`[data-aba="${id}"]`)?.classList.add("ativo");
}

window.abrirAba = abrirAba;

/* =========================================================
   LOGIN
========================================================= */

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

/* =========================================================
   ALUNO / CADASTRO
========================================================= */

async function carregarAluno(user) {
  const { data, error } = await sb
    .from("alunos")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Erro ao carregar aluno:", error);
    alert("Erro ao carregar dados do aluno.");
    return;
  }

  alunoAtual = data;

  const primeiro = (data.nome || "Aluno").split(" ")[0];

  setText("nomeAluno", primeiro);
  setText("nomeTopoAluno", primeiro);
  setText("infoRA", data.ra || "—");
  setText("infoRA2", data.ra || "—");
  setText("infoCPF", maskCpf(data.cpf));
  setText("infoEmail", data.email || user.email || "—");
  setText("infoCelular", maskPhone(data.telefone || "") || "—");

  const foto = imgAluno(data.foto_url);
  if ($("avatarTopo")) $("avatarTopo").src = foto;
  if ($("previewFotoAluno")) $("previewFotoAluno").src = foto;

  preencherFormularioCadastro();
}

function preencherFormularioCadastro() {
  if (!alunoAtual) return;

  if ($("cadNome")) $("cadNome").value = alunoAtual.nome || "";
  if ($("cadEmail")) $("cadEmail").value = alunoAtual.email || usuarioLogado?.email || "";
  if ($("cadTelefone")) $("cadTelefone").value = maskPhone(alunoAtual.telefone || "");
  if ($("cadNascimento")) $("cadNascimento").value = alunoAtual.data_nascimento || "";
  if ($("cadObjetivo")) $("cadObjetivo").value = alunoAtual.objetivo || "";
  setText("cadCpfTexto", maskCpf(alunoAtual.cpf));
}

async function uploadFotoAluno(file) {
  if (!file) return alunoAtual?.foto_url || null;

  const ext = file.name.split(".").pop();
  const nomeArquivo = `${alunoAtual.user_id}-${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET_FOTOS)
    .upload(nomeArquivo, file, { upsert: true });

  if (upErr) throw upErr;

  const { data } = sb.storage
    .from(BUCKET_FOTOS)
    .getPublicUrl(nomeArquivo);

  return data.publicUrl;
}

async function salvarCadastroAluno(e) {
  e.preventDefault();

  try {
    const file = $("fotoAlunoInput")?.files?.[0] || null;
    const fotoUrl = await uploadFotoAluno(file);

    const payload = {
      nome: $("cadNome")?.value.trim(),
      email: $("cadEmail")?.value.trim().toLowerCase(),
      telefone: String($("cadTelefone")?.value || "").replace(/\D/g, ""),
      data_nascimento: $("cadNascimento")?.value || null,
      objetivo: $("cadObjetivo")?.value || null,
      foto_url: fotoUrl
    };

    const { error } = await sb
      .from("alunos")
      .update(payload)
      .eq("user_id", alunoAtual.user_id);

    if (error) throw error;

    alert("Dados atualizados com sucesso.");

    await carregarAluno(usuarioLogado);
    await renderCarteirinha();

  } catch (err) {
    console.error(err);
    alert("Erro ao salvar cadastro: " + err.message);
  }
}

function configurarCadastro() {
  $("formCadastroAluno")?.addEventListener("submit", salvarCadastroAluno);

  $("cadTelefone")?.addEventListener("input", (e) => {
    e.target.value = maskPhone(e.target.value);
  });

  $("fotoAlunoInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    if ($("previewFotoAluno")) $("previewFotoAluno").src = url;
  });
}

/* =========================================================
   CURSOS / MATRÍCULAS
========================================================= */

async function carregarCursosMatriculados() {
  const { data: matriculas, error } = await sb
    .from("matriculas")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id)
    .order("id", { ascending: false });

  if (error || !matriculas?.length) {
    cursosMatriculados = [];
    renderCursosMatriculados();
    return;
  }

  const ids = matriculas.map(m => m.curso_id);

  const { data: cursos, error: erroCursos } = await sb
    .from("cursos")
    .select("*")
    .in("id", ids);

  if (erroCursos) {
    console.error("Erro ao carregar cursos:", erroCursos);
    return;
  }

  cursosMatriculados = matriculas.map(m => {
    const c = (cursos || []).find(x => Number(x.id) === Number(m.curso_id)) || {};

    return {
      ...c,
      matricula_id: m.id,
      matricula_criada_em: m.criada_em,
      status_matricula: m.status || "ATIVA",
      progresso: Number(m.progresso || 0)
    };
  });

  renderCursosMatriculados();
}

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

  const idsMatriculados = cursosMatriculados.map(c => Number(c.id));
  cursosDisponiveis = (data || []).filter(c => !idsMatriculados.includes(Number(c.id)));

  renderCursosDisponiveis();
}

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

  if (lista) lista.innerHTML = html;

  const primeiro = cursosMatriculados[0];

  if (continuar) {
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
        <p>${c.categoria || "—"} · até ${c.carga_horaria || 0}h</p>

        <div class="curso-acoes">
          <button onclick="matricularCurso(${c.id})">Matricular</button>
          <button class="secundario" onclick="visualizarCurso(${c.id})">Detalhes</button>
        </div>
      </div>
    </div>
  `).join("");
}

async function matricularCurso(cursoId) {
  const { error } = await sb
    .from("matriculas")
    .insert({
      aluno_id: alunoAtual.user_id,
      curso_id: cursoId,
      status: "ATIVA",
      progresso: 0
    });

  if (error) {
    alert("Erro ao matricular: " + error.message);
    return;
  }

  alert("Matrícula realizada com sucesso.");
  await carregarTudo();
}

window.matricularCurso = matricularCurso;

/* =========================================================
   MODAL DO CURSO / MATERIAIS / PROVA
========================================================= */

async function abrirCurso(id) {
  const curso = cursosMatriculados.find(c => Number(c.id) === Number(id));

  if (!curso) {
    alert("Curso não encontrado na matrícula.");
    return;
  }

  const box = $("cursoDetalheConteudo");
  const modal = $("modalCurso");

  if (!box || !modal) {
    alert("Modal do curso não encontrado.");
    return;
  }

  const resultado = getResultadoCurso(curso.id);

  box.innerHTML = `
    <h2>${curso.titulo}</h2>
    <p class="muted">${curso.categoria || "—"} · até ${curso.carga_horaria || 0}h</p>

    <div class="tabs-internas">
      <button class="ativo" data-painel="visao">Visão geral</button>
      <button data-painel="materiais">Materiais</button>
      <button data-painel="prova">Prova</button>
      <button data-painel="certificadoCurso">Certificado</button>
    </div>

    <div id="painel-visao" class="painel-interno ativo">
      <div class="material-card">
        <h3>Resumo do curso</h3>
        <p>${curso.descricao || "Curso disponível para estudo."}</p>
        <div class="cert-meta">
          <span>Progresso: ${Number(curso.progresso || 0)}%</span>
          <span>Prova: ${resultado ? `${resultado.nota}%` : "Pendente"}</span>
        </div>
      </div>
    </div>

    <div id="painel-materiais" class="painel-interno">
      <div id="materiaisCurso">Carregando materiais...</div>
    </div>

    <div id="painel-prova" class="painel-interno">
      <div id="provaCurso">Carregando prova...</div>
    </div>

    <div id="painel-certificadoCurso" class="painel-interno">
      <div class="material-card">
        <p>A solicitação de certificado é feita na aba <strong>Certificados</strong>.</p>
        <p>Requisitos: curso 100%, prova realizada e nota mínima de 70%.</p>
      </div>
    </div>
  `;

  modal.setAttribute("aria-hidden", "false");

  document.querySelectorAll(".tabs-internas button").forEach(btn => {
    btn.addEventListener("click", () => abrirPainelCurso(btn.dataset.painel, btn));
  });

  await carregarMateriaisCurso(id);
  await carregarProvaCurso(id);
}

function fecharCurso() {
  $("modalCurso")?.setAttribute("aria-hidden", "true");
}

function abrirPainelCurso(id, btn) {
  document.querySelectorAll(".painel-interno").forEach(p => p.classList.remove("ativo"));
  document.querySelectorAll(".tabs-internas button").forEach(b => b.classList.remove("ativo"));

  $("painel-" + id)?.classList.add("ativo");
  btn?.classList.add("ativo");
}

async function carregarMateriaisCurso(cursoId) {
  const el = $("materiaisCurso");
  if (!el) return;

  const { data, error } = await sb
    .from("materiais")
    .select("*")
    .eq("curso_id", cursoId)
    .order("id", { ascending: true });

  if (error) {
    el.innerHTML = `<div class="empty-state">Erro ao carregar materiais: ${error.message}</div>`;
    return;
  }

  if (!data?.length) {
    el.innerHTML = `<div class="empty-state">Nenhum material disponível para este curso.</div>`;
    return;
  }

  el.innerHTML = data.map(m => `
    <div class="material-card">
      <h3>${m.titulo || "Material"}</h3>
      <p>Tipo: ${m.tipo || "Material"}</p>
      ${m.url ? `<a href="${m.url}" target="_blank">Abrir material</a>` : ""}
    </div>
  `).join("");
}

async function carregarProvaCurso(cursoId) {
  const el = $("provaCurso");
  if (!el) return;

  const resultadoExistente = getResultadoCurso(cursoId);

  if (resultadoExistente) {
    el.innerHTML = `
      <div class="material-card">
        <h3>Prova já realizada</h3>
        <p>Nota: <strong>${resultadoExistente.nota}%</strong></p>
        <p>Acertos: ${resultadoExistente.acertos}/${resultadoExistente.total_questoes}</p>
        <p>Status: ${resultadoExistente.aprovado ? badge("APROVADO") : badge("REPROVADO")}</p>
      </div>
    `;
    return;
  }

  const { data: provas, error: erroProva } = await sb
    .from("provas")
    .select("*")
    .eq("curso_id", cursoId)
    .limit(1);

  if (erroProva) {
    el.innerHTML = `<div class="empty-state">Erro ao carregar prova: ${erroProva.message}</div>`;
    return;
  }

  const prova = provas?.[0];

  if (!prova) {
    el.innerHTML = `<div class="empty-state">Nenhuma prova cadastrada para este curso.</div>`;
    return;
  }

  const { data: questoes, error: erroQuestoes } = await sb
    .from("questoes")
    .select("*")
    .eq("prova_id", prova.id)
    .order("id", { ascending: true });

  if (erroQuestoes) {
    el.innerHTML = `<div class="empty-state">Erro ao carregar questões: ${erroQuestoes.message}</div>`;
    return;
  }

  if (!questoes?.length) {
    el.innerHTML = `<div class="empty-state">Esta prova ainda não possui questões.</div>`;
    return;
  }

  el.innerHTML = `
    <h3>${prova.titulo || "Prova do curso"}</h3>

    ${questoes.map((q, i) => `
      <div class="material-card" data-questao-id="${q.id}" data-correta="${q.correta}">
        <strong>${i + 1}. ${q.enunciado}</strong>

        <label class="prova-opcao">
          <input type="radio" name="q${q.id}" value="A"> ${q.a}
        </label>

        <label class="prova-opcao">
          <input type="radio" name="q${q.id}" value="B"> ${q.b}
        </label>

        <label class="prova-opcao">
          <input type="radio" name="q${q.id}" value="C"> ${q.c}
        </label>

        <label class="prova-opcao">
          <input type="radio" name="q${q.id}" value="D"> ${q.d}
        </label>
      </div>
    `).join("")}

    <button onclick="corrigirProva(${prova.id}, ${cursoId})">Finalizar prova</button>
  `;
}

async function corrigirProva(provaId, cursoId) {
  const blocos = Array.from(document.querySelectorAll("#provaCurso .material-card[data-questao-id]"));

  if (!blocos.length) return;

  let acertos = 0;
  let respondidas = 0;

  blocos.forEach(bloco => {
    const correta = String(bloco.dataset.correta || "").toUpperCase();
    const marcada = bloco.querySelector("input[type='radio']:checked");

    if (marcada) {
      respondidas++;
      if (String(marcada.value).toUpperCase() === correta) acertos++;
    }
  });

  if (respondidas < blocos.length) {
    alert("Responda todas as questões antes de finalizar.");
    return;
  }

  const total = blocos.length;
  const nota = Math.round((acertos / total) * 100);
  const aprovado = nota >= 70;

  const { error } = await sb
    .from("resultados_provas")
    .insert({
      aluno_id: alunoAtual.user_id,
      curso_id: cursoId,
      prova_id: provaId,
      nota,
      total_questoes: total,
      acertos,
      aprovado
    });

  if (error) {
    alert("Erro ao salvar resultado da prova: " + error.message);
    return;
  }

  if (aprovado) {
    await sb
      .from("matriculas")
      .update({ progresso: 100 })
      .eq("id", cursosMatriculados.find(c => Number(c.id) === Number(cursoId))?.matricula_id);
  }

  alert(aprovado ? `Aprovado! Nota: ${nota}%` : `Reprovado. Nota: ${nota}%`);

  await carregarResultadosProvas();
  await carregarCursosMatriculados();
  await carregarCertificados();

  await carregarProvaCurso(cursoId);
}

function visualizarCurso(id) {
  abrirCurso(id);
}

window.abrirCurso = abrirCurso;
window.fecharCurso = fecharCurso;
window.abrirPainelCurso = abrirPainelCurso;
window.corrigirProva = corrigirProva;
window.visualizarCurso = visualizarCurso;

/* =========================================================
   RESULTADOS DE PROVA
========================================================= */

async function carregarResultadosProvas() {
  const { data, error } = await sb
    .from("resultados_provas")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id)
    .order("id", { ascending: false });

  if (error) {
    console.warn("Erro ao carregar resultados:", error.message);
    resultadosProvas = [];
    return;
  }

  resultadosProvas = data || [];
}

function getResultadoCurso(cursoId) {
  return resultadosProvas.find(r => Number(r.curso_id) === Number(cursoId)) || null;
}

/* =========================================================
   CERTIFICADOS
========================================================= */

async function carregarCertificados() {
  const { data } = await sb
    .from("certificados")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id);

  certificados = data || [];

  const emitidos = certificados.filter(c => String(c.status).toUpperCase() === "EMITIDO").length;
  const horasEmitidas = certificados.reduce((acc, c) => acc + Number(c.horas_emitidas || 0), 0);

  setText("kpiCertEmitidos", emitidos);
  setText("kpiHorasEmitidas", `${horasEmitidas}h`);
  setText("certCreditosEmitidos", `${horasEmitidas}h`);

  await renderCertificados();
  await renderCarteirinha();
}

function horasLiberadasCurso(curso) {
  const max = Number(curso.carga_horaria || 0);
  const dias = diasDesde(curso.matricula_criada_em || new Date());
  return Math.min(dias * 8, max);
}

function horasEmitidasCurso(cursoId) {
  return certificados
    .filter(c => Number(c.curso_id) === Number(cursoId))
    .reduce((acc, c) => acc + Number(c.horas_emitidas || 0), 0);
}

function creditosEstudoTotal() {
  return cursosMatriculados.reduce((acc, curso) => acc + horasLiberadasCurso(curso), 0);
}

function creditosEmitidosTotal() {
  return certificados.reduce((acc, c) => acc + Number(c.horas_emitidas || 0), 0);
}

function disponivelParaSolicitar(curso) {
  const liberadas = horasLiberadasCurso(curso);
  const emitidas = horasEmitidasCurso(curso.id);
  return Math.max(0, Math.min(Number(curso.carga_horaria || 0), liberadas) - emitidas);
}

async function renderCertificados() {
  const lista = $("listaCertificados");
  if (!lista) return;

  setText("certCreditosEstudo", `${creditosEstudoTotal()}h`);
  setText("certCreditosEmitidos", `${creditosEmitidosTotal()}h`);

  if (!cursosMatriculados.length) {
    lista.innerHTML = `<div class="empty-state">Nenhum curso matriculado.</div>`;
    return;
  }

  const cards = [];

  for (const curso of cursosMatriculados) {
    const resultado = getResultadoCurso(curso.id);
    const progresso = Number(curso.progresso || 0);
    const nota = Number(resultado?.nota || 0);
    const aprovado = !!resultado?.aprovado && nota >= 70;
    const concluido = progresso >= 100;
    const limiteCurso = Number(curso.carga_horaria || 0);
    const podeSolicitarHoras = disponivelParaSolicitar(curso);
    const emitidasCurso = horasEmitidasCurso(curso.id);

    const pagamentoPendente = pagamentos.find(p =>
      Number(p.curso_id) === Number(curso.id) &&
      String(p.status).toUpperCase() === "PENDENTE"
    );

    const pagamentoPago = pagamentos.find(p =>
      Number(p.curso_id) === Number(curso.id) &&
      String(p.status).toUpperCase() === "PAGO"
    );

    const temCertificadoEmitido = certificados.some(c =>
      Number(c.curso_id) === Number(curso.id) &&
      String(c.status).toUpperCase() === "EMITIDO"
    );

    let status = "EM ANDAMENTO";
    let acao = `<button class="btn-bloqueado" disabled>Bloqueado</button>`;
    let infoExtra = "";

    if (!concluido || !aprovado) {
      status = "BLOQUEADO";
      infoExtra = `Conclua o curso e obtenha nota mínima de 70%.`;
    } else if (pagamentoPendente) {
      status = "AGUARDANDO PAGAMENTO";
      acao = `<button class="btn-bloqueado" disabled>Aguardando confirmação</button>`;
      infoExtra = `Pagamento pendente: ${dinheiro(pagamentoPendente.valor_final)}.`;
    } else if (pagamentoPago) {
      status = "PRONTO PARA EMITIR";
      acao = `<button class="btn-emitir" onclick="emitirCertificadoPago(${curso.id}, ${pagamentoPago.id}, ${pagamentoPago.horas_solicitadas})">Emitir certificado</button>`;
      infoExtra = `Pagamento confirmado.`;
    } else if (podeSolicitarHoras > 0) {
      status = "PRONTO PARA SOLICITAÇÃO";
      acao = `<button onclick="abrirSolicitacaoCertificado(${curso.id})">Solicitar certificado</button>`;
      infoExtra = `Você possui créditos para solicitar certificado neste curso.`;
    } else if (temCertificadoEmitido && podeSolicitarHoras <= 0) {
      status = "CERTIFICADO EMITIDO";
      acao = `<button onclick="baixarCertificado(${curso.id})">Baixar certificado</button>`;
      infoExtra = `Horas já emitidas neste curso: ${emitidasCurso}h.`;
    }

    cards.push(`
      <div class="cert-card">
        <div class="cert-top">
          <div>
            <h3>${curso.titulo}</h3>
            <p>${curso.categoria || "—"} · limite do curso: até ${limiteCurso}h</p>
          </div>
          ${badge(status)}
        </div>

        <div class="cert-meta">
          <span>Progresso: ${progresso}%</span>
          <span>Prova: ${resultado ? `${nota}%` : "Pendente"}</span>
          <span>Resultado: ${resultado ? (aprovado ? "Aprovado" : "Reprovado") : "Não realizada"}</span>
        </div>

        ${infoExtra ? `<div class="alerta-pagamento">${infoExtra}</div>` : ""}

        <div class="cert-card-footer">
          <span class="muted">Certificado vinculado ao desempenho e ao pagamento.</span>
          ${acao}
        </div>
      </div>
    `);
  }

  lista.innerHTML = cards.join("");
}

function abrirSolicitacaoCertificado(cursoId) {
  const curso = cursosMatriculados.find(c => Number(c.id) === Number(cursoId));
  if (!curso) return;

  const resultado = getResultadoCurso(curso.id);
  const aprovado = !!resultado?.aprovado && Number(resultado.nota || 0) >= 70;
  const concluido = Number(curso.progresso || 0) >= 100;

  if (!concluido || !aprovado) {
    alert("Este certificado ainda não está liberado.");
    return;
  }

  const limite = disponivelParaSolicitar(curso);

  if (limite <= 0) {
    alert("Você não possui créditos disponíveis para este curso.");
    return;
  }

  cursoSolicitacaoAtual = curso;
  limiteSolicitacaoAtual = limite;

  setText("solCursoNome", curso.titulo);
  setText("solLimiteCurso", `${Number(curso.carga_horaria || 0)}h`);
  setText("solCreditosAgora", `${horasLiberadasCurso(curso)}h`);
  setText("solJaEmitidasCurso", `${horasEmitidasCurso(curso.id)}h`);
  setText("solPodeSolicitar", `${limite}h`);

  $("solCursoId").value = curso.id;
  $("solHoras").value = "";
  $("solHoras").max = limite;
  $("solCupom").value = "";
  setText("solValorPreview", dinheiro(0));

  $("modalSolicitarCertificado")?.setAttribute("aria-hidden", "false");
}

function fecharSolicitacaoCertificado() {
  $("modalSolicitarCertificado")?.setAttribute("aria-hidden", "true");
}

function atualizarValorSolicitacao() {
  const horas = Number($("solHoras")?.value || 0);
  const valor = horas * VALOR_HORA_CERTIFICADO;
  setText("solValorPreview", dinheiro(valor));
}

async function gerarPagamentoCertificado(e) {
  e.preventDefault();

  const cursoId = Number($("solCursoId")?.value);
  const horas = Number($("solHoras")?.value || 0);
  const cupom = String($("solCupom")?.value || "").trim().toUpperCase();

  const curso = cursosMatriculados.find(c => Number(c.id) === cursoId);

  if (!curso) return;

  if (!horas || horas < 1) {
    alert("Informe a quantidade de horas.");
    return;
  }

  if (horas > limiteSolicitacaoAtual) {
    alert(`Você pode solicitar no máximo ${limiteSolicitacaoAtual}h neste momento.`);
    return;
  }

  let valor = horas * VALOR_HORA_CERTIFICADO;
  let desconto = 0;

  if (cupom) {
    const { data: cup } = await sb
      .from("cupons")
      .select("*")
      .eq("codigo", cupom)
      .eq("ativo", true)
      .single();

    if (cup) {
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
      metodo: "INFINITEPAY_MANUAL",
      gateway: "INFINITEPAY"
    });

  if (error) {
    alert("Erro ao gerar pagamento: " + error.message);
    return;
  }

  alert(
    `Solicitação criada.\n\n` +
    `Horas: ${horas}h\n` +
    `Valor: ${dinheiro(valorFinal)}\n\n` +
    `Após confirmação do pagamento, o certificado será liberado.`
  );

  fecharSolicitacaoCertificado();

  await carregarPagamentos();
  await carregarCertificados();
}

async function emitirCertificadoPago(cursoId, pagamentoId, horas) {
  const { data: pagamento } = await sb
    .from("pagamentos")
    .select("*")
    .eq("id", pagamentoId)
    .eq("status", "PAGO")
    .single();

  if (!pagamento) {
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

  if (error) {
    alert("Erro ao emitir certificado: " + error.message);
    return;
  }

  await sb
    .from("pagamentos")
    .update({ status: "UTILIZADO" })
    .eq("id", pagamentoId);

  alert("Certificado emitido com sucesso.");

  await carregarPagamentos();
  await carregarCertificados();
}

function baixarCertificado(cursoId) {
  alert("Download do certificado será implementado na próxima etapa. Curso ID: " + cursoId);
}

window.abrirSolicitacaoCertificado = abrirSolicitacaoCertificado;
window.fecharSolicitacaoCertificado = fecharSolicitacaoCertificado;
window.emitirCertificadoPago = emitirCertificadoPago;
window.baixarCertificado = baixarCertificado;

/* =========================================================
   PAGAMENTOS
========================================================= */

async function carregarPagamentos() {
  const lista = $("listaPagamentos");
  if (!lista) return;

  const { data, error } = await sb
    .from("pagamentos")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id)
    .order("id", { ascending: false });

  if (error) {
    lista.innerHTML = `<div class="empty-state">Erro ao carregar pagamentos.</div>`;
    return;
  }

  pagamentos = data || [];

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

/* =========================================================
   CHAMADOS
========================================================= */

async function abrirChamadoAluno() {
  const assunto = $("chAssunto")?.value.trim();
  const categoria = $("chCategoria")?.value;
  const prioridade = $("chPrioridade")?.value;
  const mensagem = $("chMensagem")?.value.trim();

  if (!assunto || !mensagem) {
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

  if (error) {
    alert("Erro ao abrir chamado: " + error.message);
    return;
  }

  alert("Chamado aberto. Protocolo: " + protocolo);

  $("chAssunto").value = "";
  $("chMensagem").value = "";

  await carregarChamados();
}

async function carregarChamados() {
  const lista = $("listaChamados");
  if (!lista) return;

  const { data, error } = await sb
    .from("chamados")
    .select("*")
    .eq("aluno_id", alunoAtual.user_id)
    .order("id", { ascending: false });

  if (error) {
    lista.innerHTML = `<div class="empty-state">Erro ao carregar chamados.</div>`;
    return;
  }

  const chamados = data || [];

  setText("chAbertos", chamados.filter(c => c.status === "ABERTO").length);
  setText("chAndamento", chamados.filter(c => c.status === "EM_ANDAMENTO").length);
  setText("chResolvidos", chamados.filter(c => c.status === "RESOLVIDO").length);

  if (!chamados.length) {
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
            <td>${c.categoria || "—"}</td>
            <td>${badge(c.prioridade)}</td>
            <td>${badge(c.status)}</td>
            <td>${dataBR(c.criado_em)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.abrirChamadoAluno = abrirChamadoAluno;

/* =========================================================
   CARTEIRINHA
========================================================= */

async function renderCarteirinha() {
  const box = $("boxCarteirinha");
  if (!box || !alunoAtual) return;

  const temCertificadoEmitido = certificados.some(c =>
    String(c.status).toUpperCase() === "EMITIDO"
  );

  const temCursoConcluido = cursosMatriculados.some(c =>
    Number(c.progresso || 0) >= 100
  );

  const podeVer = temCertificadoEmitido && temCursoConcluido;

  if (!podeVer) {
    box.innerHTML = `
      <div class="carteira-bloqueada">
        <h3>Carteirinha ainda não liberada</h3>
        <p>Conclua pelo menos 1 curso e emita seu primeiro certificado para liberar sua carteirinha digital.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="carteirinha">
      <div class="carteira-logo">ALTITUDE</div>
      <div class="carteira-sub">INSTITUIÇÃO DE ENSINO</div>

      <img class="carteira-foto" src="${imgAluno(alunoAtual.foto_url)}" alt="Foto do aluno">

      <div class="carteira-nome">${alunoAtual.nome || "Aluno"}</div>

      <div class="carteira-dados">
        <p><span>RA</span><strong>${alunoAtual.ra || "—"}</strong></p>
        <p><span>CPF</span><strong>${maskCpf(alunoAtual.cpf)}</strong></p>
        <p><span>E-mail</span><strong>${alunoAtual.email || "—"}</strong></p>
      </div>

      <div class="carteira-status">ESTUDANTE ATIVO</div>
    </div>
  `;
}

/* =========================================================
   PROGRESSO / BUSCA
========================================================= */

function atualizarProgresso() {
  const media = cursosMatriculados.length
    ? Math.round(cursosMatriculados.reduce((acc,c) => acc + Number(c.progresso || 0), 0) / cursosMatriculados.length)
    : 0;

  setText("progressoGeralTexto", `${media}%`);

  const circulo = $("progressoGeral");
  if (circulo) {
    circulo.style.background = `conic-gradient(#3f7ee8 ${media * 3.6}deg,#e8edf7 0deg)`;
  }

  let nivel = "Bronze";
  if (media >= 50) nivel = "Prata";
  if (media >= 90) nivel = "Ouro";

  setText("nivelAlunoNome", nivel);
}

function configurarBusca() {
  const input = $("buscaPortalAluno");
  if (!input) return;

  input.addEventListener("input", () => {
    const termo = input.value.toLowerCase();

    document.querySelectorAll(".card-curso-aluno,.cert-card,.table-portal tr").forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(termo) ? "" : "none";
    });
  });
}

/* =========================================================
   CARREGAMENTO GERAL
========================================================= */

async function carregarTudo() {
  await carregarCursosMatriculados();
  await carregarCursosDisponiveis();
  await carregarResultadosProvas();
  await carregarPagamentos();
  await carregarCertificados();
  await carregarChamados();
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".menu-link").forEach(btn => {
    btn.addEventListener("click", () => abrirAba(btn.dataset.aba));
  });

  $("btnSair")?.addEventListener("click", sair);

  $("solHoras")?.addEventListener("input", atualizarValorSolicitacao);
  $("formSolicitarCertificado")?.addEventListener("submit", gerarPagamentoCertificado);

  configurarCadastro();
  configurarBusca();

  usuarioLogado = await obterUsuarioLogado();
  if (!usuarioLogado) return;

  await carregarAluno(usuarioLogado);
  await carregarTudo();
});