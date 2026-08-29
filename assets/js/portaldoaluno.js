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
  atualizacaoPendente: false,
  recompensas: [],
  opcoesEmbaralhadas: {},
  embaralharAlternativas: false,
  cargaPrincipalConcluida: false,
  falhasConsecutivasSync: 0
};

const TITULOS_ABAS = {
  perfil: "Início",
  cursos: "Meus cursos",
  catalogo: "Novos cursos",
  "solicitar-certificado": "Solicitar certificado",
  certificados: "Meus certificados",
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

function ocultarMensagemDeSincronizacao() {
  const box = document.getElementById('portalSyncNotice');
  if (!box) return;
  clearTimeout(box._timer);
  box.classList.remove('show', 'error');
}

function portalTemDadosVisiveis() {
  return Boolean(
    state.cargaPrincipalConcluida ||
    state.cursos.length ||
    state.resultados.length ||
    state.certificados.length ||
    state.pagamentos.length ||
    state.carteiraGlobal
  );
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCategory(value) {
  const text = String(value || "Formação").trim().replace(/\s+/g, " ");
  const lowerWords = new Set(["de","da","do","das","dos","e","em","para"]);
  return text.toLocaleLowerCase("pt-BR").split(" ").map((word, index) => {
    if (index > 0 && lowerWords.has(word)) return word;
    return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
  }).join(" ");
}

function categoryKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
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
  return url || "/assets/img/background portaldoaluno.jpg";
}

function imgAluno(url) {
  return url || "/assets/img/apple-touch-icon.png";
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
  const labels = {
    AGUARDANDO_HORAS: "Aguardando horas",
    AUTORIZADO_AGUARDANDO_DATA: "Aguardando data de liberação",
    AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
    PRONTO_PARA_LIBERACAO: "Pronto para liberação"
  };
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
    window.location.replace('/login/');
    return null;
  }

  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.replace('/login/');
    return null;
  }
  return data.user;
}

async function sair() {
  await sb.auth.signOut();
  window.location.href = "/login/";
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
      window.location.replace('/login/?motivo=sessao');
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

async function carregarRecompensas() {
  try {
    const { data, error } = await sb.from("recompensas_niveis_v39").select("*").eq("ativo", true).order("ordem").order("cursos_necessarios");
    if (error) throw error;
    state.recompensas = data || [];
  } catch (error) {
    console.warn("Recompensas V39 indisponíveis:", error.message);
    state.recompensas = [];
  }
}

function tipoRecompensaCurso(curso) {
  const raw = String(curso?.tipo_curso || "PROFISSIONAL").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (raw.includes("POS")) return "POS_GRADUACAO";
  if (raw.includes("SUPERIOR") || raw.includes("GRADUACAO")) return "SUPERIOR";
  if (raw.includes("TECN")) return "TECNICO";
  return "PROFISSIONAL";
}

function renderRecompensasAluno() {
  const box = $("studentRewardBox");
  if (!box) return;
  const concluidos = state.cursos.filter(cursoConcluido);
  const contagem = concluidos.reduce((acc, curso) => {
    const tipo = tipoRecompensaCurso(curso);
    acc[tipo] = (acc[tipo] || 0) + 1;
    return acc;
  }, {});
  const prioridade = ["POS_GRADUACAO", "SUPERIOR", "TECNICO", "PROFISSIONAL"];
  const configurados = state.recompensas.length ? state.recompensas : [
    { tipo_curso:"PROFISSIONAL", faixa:"Bronze", nivel:"I", cursos_necessarios:1, ordem:10 },
    { tipo_curso:"TECNICO", faixa:"Prata", nivel:"I", cursos_necessarios:1, ordem:20 },
    { tipo_curso:"SUPERIOR", faixa:"Ouro", nivel:"I", cursos_necessarios:1, ordem:30 },
    { tipo_curso:"POS_GRADUACAO", faixa:"Diamante", nivel:"I", cursos_necessarios:1, ordem:40 }
  ];
  let atual = null, proximo = null, tipoAtual = "PROFISSIONAL", nivelConquistado = true;
  for (const tipo of prioridade) {
    const qtd = Number(contagem[tipo] || 0);
    if (!qtd) continue;
    const niveis = configurados.filter(x => String(x.tipo_curso).toUpperCase() === tipo).sort((a,b)=>Number(a.cursos_necessarios)-Number(b.cursos_necessarios));
    const elegiveis = niveis.filter(x => qtd >= Number(x.cursos_necessarios || 0));
    if (elegiveis.length) { atual = elegiveis[elegiveis.length-1]; proximo = niveis.find(x => Number(x.cursos_necessarios) > qtd) || null; tipoAtual = tipo; break; }
  }
  if (!atual) {
    const base = configurados.filter(x => String(x.tipo_curso).toUpperCase() === "PROFISSIONAL").sort((a,b)=>Number(a.cursos_necessarios)-Number(b.cursos_necessarios))[0];
    atual = base || { faixa:"Bronze", nivel:"I", cursos_necessarios:1, tipo_curso:"PROFISSIONAL" };
    proximo = atual; tipoAtual = "PROFISSIONAL"; nivelConquistado = false;
  }
  const qtd = Number(contagem[tipoAtual] || 0);
  const alvo = Number(proximo?.cursos_necessarios || atual.cursos_necessarios || 1);
  const falta = Math.max(0, alvo - qtd);
  const classe = String(atual.faixa || "Bronze").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  box.innerHTML = `<div class="reward-coin reward-${escapeHTML(classe)}"><span>${escapeHTML(atual.nivel || "I")}</span></div>
    <div class="reward-copy"><small>${nivelConquistado ? "Recompensa atual" : "Próxima recompensa"}</small><strong>${escapeHTML(atual.nome || `${atual.faixa || "Bronze"} ${atual.nivel || "I"}`)}</strong>
    <span>${qtd} ${qtd === 1 ? "curso concluído" : "cursos concluídos"}${falta ? ` · faltam ${falta} para o próximo nível` : ""}</span></div>`;
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

function opcoesHorasDisponiveis(_saldo) {
  // A carga pode ser escolhida mesmo antes de todo o crédito estar disponível.
  // O banco calcula a data futura, respeitando 8h/dia e o teto de 200h por certificado.
  const values = [];
  for (let horas = 5; horas <= 200; horas += 5) values.push(horas);
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

function cursoConcluido(curso) {
  // V37: a aprovação na prova final encerra o curso para fins de listagem.
  // O aluno só consegue fazer a prova depois de concluir o conteúdo.
  const resultado = melhorResultadoCurso(curso.id);
  return Boolean(resultado?.aprovado);
}

function cursoEmAndamento(curso) {
  const status = String(curso.matricula_status || "ATIVA").toUpperCase();
  const ativo = !["CANCELADA", "CANCELADO", "TRANCADA"].includes(status);
  return ativo && !cursoConcluido(curso);
}

function renderDashboard() {
  const cursosAtivos = state.cursos.filter(cursoEmAndamento);
  const aprovadas = state.cursos.filter(cursoConcluido).length;
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
  renderRecompensasAluno();

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
          <span class="eyebrow">${escapeHTML(formatCategory(continuar.categoria || "Curso"))}</span>
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

function cursoRelacionado(curso) {
  const categoriasDoAluno = new Set(state.cursos.map((item) => categoryKey(item.categoria)).filter(Boolean));
  return categoriasDoAluno.has(categoryKey(curso.categoria));
}

function courseCard(curso, compact = false) {
  const resultado = melhorResultadoCurso(curso.id);
  const progresso = clamp(curso.progresso);
  const concluido = !compact && cursoConcluido(curso);
  const status = concluido ? "Concluído" : progresso > 0 ? "Em andamento" : "Não iniciado";
  const statusClass = status === "Concluído" ? "success" : status === "Em andamento" ? "warning" : "neutral";
  const relacionado = compact && cursoRelacionado(curso);

  return `
    <article class="course-card${relacionado ? " related-course" : ""}" data-search="${escapeHTML(`${curso.titulo || ""} ${curso.categoria || ""}`.toLowerCase())}" data-category="${escapeHTML(categoryKey(curso.categoria))}">
      <div class="course-cover">
        <img src="${escapeHTML(imgCurso(curso.capa_url))}" alt="Capa do curso ${escapeHTML(curso.titulo)}">
        ${compact ? (relacionado ? '<span class="course-status status-pill success">Relacionado</span>' : '') : `<span class="course-status status-pill ${statusClass}">${status}</span>`}
      </div>
      <div class="course-card-body">
        <span class="eyebrow">${escapeHTML(formatCategory(curso.categoria || "Formação"))}</span>
        <h3>${escapeHTML(curso.titulo || "Curso")}</h3>
        <p>${escapeHTML(curso.descricao || "Conteúdo disponível na plataforma Altitude.")}</p>
        <div class="course-meta">
          ${compact ? `<span>${relacionado ? "Recomendado para você" : "Disponível para matrícula"}</span>` : (resultado ? `<span>Melhor nota: ${Number(resultado.nota || 0)}%</span>` : `<span>Prova pendente</span>`)}
        </div>
        ${compact ? "" : `<div class="progress-line"><div class="progress-track"><div style="width:${progresso}%"></div></div><strong>${progresso}%</strong></div>`}
        <div class="course-card-footer">
          ${compact
            ? `<button class="course-button" type="button" onclick="matricularCurso(${Number(curso.id)})">Matricular</button>`
            : `<button class="course-button" type="button" onclick="abrirCurso(${Number(curso.id)})">${concluido ? "Rever curso" : progresso ? "Continuar" : "Iniciar"}</button>`}
        </div>
      </div>
    </article>`;
}

function renderCatalogoCursos() {
  const list = $("listaCursosDisponiveis");
  if (!list) return;
  const query = String($("catalogoBusca")?.value || "").trim().toLocaleLowerCase("pt-BR");
  const area = String($("catalogoArea")?.value || "TODAS");
  const areas = [...new Map(state.cursosDisponiveis.map((curso) => [categoryKey(curso.categoria), formatCategory(curso.categoria)])).values()]
    .sort((a,b) => a.localeCompare(b, "pt-BR"));
  const areaSelect = $("catalogoArea");
  if (areaSelect) {
    const atual = areaSelect.value || area;
    areaSelect.innerHTML = '<option value="TODAS">Todas as áreas</option>' + areas.map((item) => `<option value="${escapeHTML(categoryKey(item))}">${escapeHTML(item)}</option>`).join("");
    if ([...areaSelect.options].some((option) => option.value === atual)) areaSelect.value = atual;
  }
  const filtered = [...state.cursosDisponiveis]
    .filter((curso) => !query || `${curso.titulo || ""} ${curso.categoria || ""}`.toLocaleLowerCase("pt-BR").includes(query))
    .filter((curso) => area === "TODAS" || categoryKey(curso.categoria) === area)
    .sort((a,b) => Number(cursoRelacionado(b)) - Number(cursoRelacionado(a)) || String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR"));
  setText("contadorCursosDisponiveis", `${filtered.length} ${filtered.length === 1 ? "disponível" : "disponíveis"}`);
  setText("catalogoResumo", filtered.some(cursoRelacionado) ? "Cursos relacionados ao que você já estuda aparecem primeiro." : "Explore os cursos disponíveis e escolha sua próxima formação.");
  list.innerHTML = filtered.length ? filtered.map((curso) => courseCard(curso, true)).join("") : `<div class="empty-state">Nenhum curso encontrado com este filtro.</div>`;
}

function renderCursos() {
  const andamento = state.cursos.filter(cursoEmAndamento);
  const concluidos = state.cursos.filter(cursoConcluido);
  setText("contadorCursosMatriculados", `${andamento.length} ${andamento.length === 1 ? "curso" : "cursos"}`);
  setText("contadorCursosConcluidos", `${concluidos.length} ${concluidos.length === 1 ? "concluído" : "concluídos"}`);
  const lista = $("listaCursos");
  if (lista) lista.innerHTML = andamento.length
    ? andamento.map((curso) => courseCard(curso)).join("")
    : `<div class="empty-state">Nenhum curso em andamento.</div>`;
  const listaConcluidos = $("listaCursosConcluidos");
  if (listaConcluidos) listaConcluidos.innerHTML = concluidos.length
    ? concluidos.map((curso) => courseCard(curso)).join("")
    : `<div class="empty-state">Você ainda não concluiu nenhum curso.</div>`;
  renderCatalogoCursos();
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
    let { data, error } = await sb.rpc("obter_modulos_curso_v41", { p_curso_id: Number(cursoId) });
    if (error && /obter_modulos_curso_v41|function/i.test(error.message || "")) {
      ({ data, error } = await sb.rpc("obter_modulos_curso_v12", { p_curso_id: Number(cursoId) }));
    }
    if (error && /obter_modulos_curso_v12|function/i.test(error.message || "")) {
      ({ data, error } = await sb.rpc("obter_modulos_curso", { p_curso_id: Number(cursoId) }));
    }
    if (error) throw error;
    state.modulos = (data || []).map((modulo, index) => ({
      ...modulo,
      ordem: Number(modulo.ordem || index + 1),
      conteudo_latex: modulo.conteudo_latex || modulo.conteudo || "",
      materiais: Array.isArray(modulo.materiais) ? modulo.materiais : [],
      concluido: Boolean(modulo.concluido)
    })).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
    renderSalaEstudo();
    window.altitudeAnalyticsV41?.send?.("study_open", curso.titulo || "Curso", { curso_id:Number(curso.id), modulos:state.modulos.length });
  } catch (error) {
    console.error(error);
    $("studyModuleList").innerHTML = `<div class="empty-state">Não foi possível abrir o conteúdo. Execute a migração SQL mais recente no Supabase.<br><small>${escapeHTML(error.message)}</small></div>`;
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

  list.innerHTML = state.modulos.map((modulo, index) => {
    const numero = Number(modulo.ordem || index + 1);
    return `<button type="button" class="module-item ${index === state.moduloIndex ? "ativo" : ""} ${modulo.concluido ? "concluido" : ""}" onclick="selecionarModulo(${index})">
      <span class="module-number">${modulo.concluido ? "✓" : numero}</span>
      <span><strong>${escapeHTML(modulo.titulo || `Módulo ${numero}`)}</strong><small>Módulo ${numero} · ${modulo.concluido ? "Concluído" : "Pendente"}</small></span>
    </button>`;
  }).join("");

  renderModuloAtual();
  const resultado = melhorResultadoCurso(curso.id);
  const approved = Boolean(resultado?.aprovado);
  const avaliacao = avaliacaoDoCurso(curso.id);
  const examButton = $("btnAbrirProva");
  if (examButton) {
    examButton.disabled = progress < 100;
    examButton.textContent = approved ? "Ver resultado da prova" : progress >= 100 ? "Fazer prova" : "Conclua os módulos";
  }

  const finishPanel = $("courseCompletionPanel");
  if (!finishPanel) return;
  finishPanel.hidden = progress < 100;
  if (progress < 100) return;

  if (!approved) {
    finishPanel.innerHTML = `<div><span class="eyebrow">Conteúdo finalizado</span><strong>Você concluiu os estudos deste curso.</strong><small>Agora faça a prova para concluir esta etapa.</small></div>
      <div class="course-completion-actions"><button type="button" class="primary-button" onclick="abrirProva()">Fazer prova agora</button></div>`;
    return;
  }

  if (!avaliacao) {
    finishPanel.innerHTML = `<div><span class="eyebrow">Prova aprovada</span><strong>Você foi aprovado neste curso.</strong><small>Avalie o curso para liberar a etapa do certificado.</small></div>
      <div class="course-completion-actions"><button type="button" class="primary-button" onclick="avaliarCurso(${Number(curso.id)})">Avaliar curso</button><button type="button" class="secondary-button" onclick="abrirProva()">Ver resultado da prova</button></div>`;
    return;
  }

  finishPanel.innerHTML = `<div><span class="eyebrow">Curso concluído</span><strong>Parabéns! Você concluiu o curso, foi aprovado e já realizou a avaliação.</strong><small>Escolha se deseja solicitar o certificado agora ou continuar estudando.</small></div>
    <div class="course-completion-actions final-actions"><button type="button" class="primary-button" onclick="solicitarCertificadoCursoAtual()">Solicitar certificado</button><button type="button" class="secondary-button" onclick="continuarEstudando()">Continuar estudando</button></div>`;
}

function selecionarModulo(index) {
  if (index < 0 || index >= state.modulos.length) return;
  state.moduloIndex = index;
  renderSalaEstudo();
  const modulo = state.modulos[index];
  window.altitudeAnalyticsV41?.send?.("module_open", modulo?.titulo || `Módulo ${index + 1}`, { curso_id:Number(state.cursoAtual?.id || 0), modulo_id:modulo?.modulo_id || null, ordem:Number(modulo?.ordem || index + 1) });
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


function latexImageWidthPercent(options = "") {
  const raw = String(options || "");
  const width = /width\s*=\s*([^,\]]+)/i.exec(raw)?.[1]?.trim() || "";
  if (!width) return 88;
  const ratio = /([0-9]+(?:[.,][0-9]+)?)\s*\\(?:textwidth|linewidth)/i.exec(width);
  if (ratio) return Math.max(20, Math.min(100, Number(ratio[1].replace(",", ".")) * 100));
  if (/\\(?:textwidth|linewidth)/i.test(width)) return 100;
  const pct = /([0-9]+(?:[.,][0-9]+)?)\s*%/.exec(width);
  if (pct) return Math.max(20, Math.min(100, Number(pct[1].replace(",", "."))));
  return 88;
}

function latexInlineHtml(value = "") {
  let html = escapeHTML(String(value || "")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/\\_/g, "_")
    .replace(/~/g, " "));
  for (let pass = 0; pass < 4; pass += 1) {
    html = html
      .replace(/\\textbf\{([^{}]*)\}/gi, "<strong>$1</strong>")
      .replace(/\\(?:textit|emph)\{([^{}]*)\}/gi, "<em>$1</em>")
      .replace(/\\underline\{([^{}]*)\}/gi, "<u>$1</u>")
      .replace(/\\textcolor\{[^{}]*\}\{([^{}]*)\}/gi, "$1");
  }
  html = html
    .replace(/\\(?:Large|LARGE|large|small|normalsize|bfseries|itshape|selectfont)\b/gi, "")
    .replace(/\\(?:label|ref|cite)\{[^{}]*\}/gi, "")
    .replace(/\\\\/g, '<span class="latex-inline-break"></span>')
    .replace(/\$([^$\n]+)\$/g, '<span class="latex-inline-math">$1</span>')
    .replace(/[{}]/g, "");
  return html.trim();
}

function studentContentHtml(value) {
  let source = String(value || "").replace(/\r/g, "");
  if (!source.trim()) return "";

  const protectedHtml = [];
  const protect = (html) => {
    const token = `@@ALTITUDE_HTML_${protectedHtml.length}@@`;
    protectedHtml.push(html);
    return `\n${token}\n`;
  };
  const figureHtml = (body = "") => {
    const image = /\\includegraphics(?:\[([^\]]*)\])?\{([^{}]+)\}/i.exec(body);
    if (!image) return "";
    const url = safeUrl(String(image[2] || "").trim());
    if (!url) return "";
    const caption = /\\caption\{([^{}]*)\}/i.exec(body)?.[1] || "";
    const width = latexImageWidthPercent(image[1] || "");
    return `<figure class="lesson-latex-figure" style="width:min(${width}%,100%)"><img src="${escapeHTML(url)}" alt="${escapeHTML(caption || "Imagem do módulo")}" loading="lazy"><figcaption${caption ? "" : " hidden"}>${latexInlineHtml(caption)}</figcaption></figure>`;
  };

  // Imagens remotas via LaTeX. O arquivo não precisa ser importado para o site.
  source = source.replace(/\\begin\{figure\*?\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\*?\}/gi, (_, body) => protect(figureHtml(body)));
  source = source.replace(/\\includegraphics(?:\[([^\]]*)\])?\{([^{}]+)\}/gi, (_, options, rawUrl) => {
    const url = safeUrl(String(rawUrl || "").trim());
    if (!url) return "";
    const width = latexImageWidthPercent(options || "");
    return protect(`<figure class="lesson-latex-figure" style="width:min(${width}%,100%)"><img src="${escapeHTML(url)}" alt="Imagem do módulo" loading="lazy"><figcaption hidden></figcaption></figure>`);
  });

  source = source
    .replace(/^[\s\S]*?\\begin\{document\}/i, "")
    .replace(/\\end\{document\}[\s\S]*$/i, "")
    .replace(/\\(?:documentclass|usepackage|geometry|definecolor|titleformat|titlespacing|setlength|pagestyle|fancyhf|fancyhead|fancyfoot|renewcommand|onehalfspacing|Justifying)\*?(?:\[[^\]]*\])?\{[^{}]*\}/gi, "")
    .replace(/\\(?:vspace|hspace)\*?\{[^{}]*\}/gi, "")
    .replace(/\\begin\{itemize\}(\[[^\]]*\])?/gi, (_, options = "") => `\n@@LIST:${/leftmargin\s*=\s*([^,\]]+)/i.exec(options)?.[1]?.trim() || ""}@@\n`)
    .replace(/\\begin\{enumerate\}(\[[^\]]*\])?/gi, (_, options = "") => `\n@@OLIST:${/leftmargin\s*=\s*([^,\]]+)/i.exec(options)?.[1]?.trim() || ""}@@\n`)
    .replace(/\\end\{(?:itemize|enumerate)\}/gi, "\n@@ENDLIST@@\n")
    .replace(/\\begin\{tcolorbox\}(?:\[[\s\S]*?\])?/gi, "\n@@BOXOPEN@@\n")
    .replace(/\\end\{tcolorbox\}/gi, "\n@@BOXCLOSE@@\n")
    .replace(/\\begin\{center\}/gi, "\n@@CENTEROPEN@@\n")
    .replace(/\\end\{center\}/gi, "\n@@CENTERCL@@\n")
    .replace(/\\begin\{flushright\}/gi, "\n@@RIGHTOPEN@@\n")
    .replace(/\\end\{flushright\}/gi, "\n@@RIGHTCL@@\n")
    .replace(/\\begin\{flushleft\}/gi, "\n@@LEFTOPEN@@\n")
    .replace(/\\end\{flushleft\}/gi, "\n@@LEFTCL@@\n")
    .replace(/\\begin\{(?:tabularx|tabular)\}(?:\{[^{}]*\}){0,2}/gi, "\n")
    .replace(/\\end\{(?:tabularx|tabular)\}/gi, "\n")
    .replace(/^\s*\[[^\]\n]*(?:colback|colframe|boxrule|arc|left|right|top|bottom)[^\]\n]*\]\s*$/gim, "")
    .replace(/\\section\*?\{([^{}]+)\}/gi, "\n## $1\n")
    .replace(/\\subsection\*?\{([^{}]+)\}/gi, "\n### $1\n")
    .replace(/\\subsubsection\*?\{([^{}]+)\}/gi, "\n#### $1\n")
    .replace(/\\paragraph\{([^{}]+)\}/gi, "\n#### $1\n")
    .replace(/\\item\s*/gi, "\n- ")
    .replace(/\\color\{[^{}]*\}/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = source.split("\n");
  const out = [];
  let paragraph = [];
  let list = [];
  let listType = "ul";
  let listMargin = "";
  const safeCssDimension = (raw) => /^\d+(?:[.,]\d+)?(?:cm|mm|pt|px|em|rem|in)$/i.test(String(raw || "").trim()) ? String(raw).trim().replace(",", ".") : "";
  const flushParagraph = () => {
    const joined = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (joined) out.push(`<p>${latexInlineHtml(joined)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) {
      const margin = safeCssDimension(listMargin);
      out.push(`<${listType} class="latex-list${margin ? " has-custom-leftmargin" : ""}"${margin ? ` style="margin-left:${margin}"` : ""}>${list.map((item) => `<li>${latexInlineHtml(item)}</li>`).join("")}</${listType}>`);
    }
    list = []; listMargin = ""; listType = "ul";
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushParagraph(); return; }
    if (/^@@ALTITUDE_HTML_\d+@@$/.test(line)) { flushParagraph(); flushList(); out.push(line); return; }
    const open = /^@@(O?LIST):([^@]*)@@$/.exec(line);
    if (open) { flushParagraph(); flushList(); listType = open[1] === "OLIST" ? "ol" : "ul"; listMargin = open[2] || ""; return; }
    if (line === "@@ENDLIST@@") { flushParagraph(); flushList(); return; }
    if (line === "@@BOXOPEN@@") { flushParagraph(); flushList(); out.push('<aside class="latex-info-box">'); return; }
    if (line === "@@BOXCLOSE@@") { flushParagraph(); flushList(); out.push('</aside>'); return; }
    if (line === "@@CENTEROPEN@@") { flushParagraph(); out.push('<div class="latex-align-center">'); return; }
    if (line === "@@CENTERCL@@") { flushParagraph(); out.push('</div>'); return; }
    if (line === "@@RIGHTOPEN@@") { flushParagraph(); out.push('<div class="latex-align-right">'); return; }
    if (line === "@@RIGHTCL@@") { flushParagraph(); out.push('</div>'); return; }
    if (line === "@@LEFTOPEN@@") { flushParagraph(); out.push('<div class="latex-align-left">'); return; }
    if (line === "@@LEFTCL@@") { flushParagraph(); out.push('</div>'); return; }
    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); const level = heading[1].length <= 2 ? 3 : 4; out.push(`<h${level} class="latex-heading">${latexInlineHtml(heading[2])}</h${level}>`); return; }
    if (/^-\s+/.test(line)) { flushParagraph(); list.push(line.replace(/^-\s+/, "")); return; }
    paragraph.push(line);
  });
  flushParagraph(); flushList();

  let html = out.join("\n");
  protectedHtml.forEach((valueHtml, index) => { html = html.replaceAll(`@@ALTITUDE_HTML_${index}@@`, valueHtml); });
  return html;
}

function cleanLatexForStudent(value) {
  const html = studentContentHtml(value);
  if (!html) return "";
  const node = document.createElement("div");
  node.innerHTML = html;
  return String(node.textContent || "").replace(/\s+/g, " ").trim();
}

function latexBlocksForStudentPdf(value) {
  let source = String(value || "").replace(/\r/g, "");
  const images = [];
  const makeImageToken = (options, rawUrl, caption = "") => {
    const url = safeUrl(String(rawUrl || "").trim());
    if (!url) return "";
    const index = images.push({ url, caption:String(caption || "").trim(), widthPercent:latexImageWidthPercent(options || "") }) - 1;
    return `\n@@IMG:${index}@@\n`;
  };
  source = source.replace(/\\begin\{figure\*?\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\*?\}/gi, (_, body) => {
    const img = /\\includegraphics(?:\[([^\]]*)\])?\{([^{}]+)\}/i.exec(body);
    if (!img) return "";
    const caption = /\\caption\{([^{}]*)\}/i.exec(body)?.[1] || "";
    return makeImageToken(img[1], img[2], caption);
  });
  source = source.replace(/\\includegraphics(?:\[([^\]]*)\])?\{([^{}]+)\}/gi, (_, options, url) => makeImageToken(options, url));
  source = source
    .replace(/^[\s\S]*?\\begin\{document\}/i, "").replace(/\\end\{document\}[\s\S]*$/i, "")
    .replace(/\\begin\{(itemize|enumerate)\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{\1\}/gi, (_, type, body) => String(body).split(/\\item\s*/).slice(1).map((item, i) => `\n@@LI@@${type.toLowerCase()==="enumerate" ? `${i+1}. ` : "• "}${item.trim()}\n`).join(""))
    .replace(/\\section\*?\{([^{}]*)\}/gi, "\n@@H2@@$1\n")
    .replace(/\\subsection\*?\{([^{}]*)\}/gi, "\n@@H3@@$1\n")
    .replace(/\\subsubsection\*?\{([^{}]*)\}/gi, "\n@@H4@@$1\n")
    .replace(/\\paragraph\{([^{}]*)\}/gi, "\n@@H4@@$1\n")
    .replace(/\\item\s*/gi, "\n@@LI@@• ")
    .replace(/\\(?:textbf|textit|emph|underline)\{([^{}]*)\}/gi, "$1")
    .replace(/\\textcolor\{[^{}]*\}\{([^{}]*)\}/gi, "$1")
    .replace(/\\(?:label|ref|cite)\{[^{}]*\}/gi, "")
    .replace(/\\(?:begin|end)\{[^{}]+\}(?:\[[^\]]*\])?/gi, "\n")
    .replace(/\\(?:vspace|hspace)\*?\{[^{}]*\}/gi, "")
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, "")
    .replace(/\\\\/g, "\n").replace(/~/g, " ").replace(/\$+/g, "").replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n");
  return source.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    if (line.startsWith("@@H2@@")) return { type:"h2", text:line.slice(6).trim() };
    if (line.startsWith("@@H3@@")) return { type:"h3", text:line.slice(6).trim() };
    if (line.startsWith("@@H4@@")) return { type:"h4", text:line.slice(6).trim() };
    if (line.startsWith("@@LI@@")) return { type:"li", text:line.slice(6).trim() };
    const imageMatch = /^@@IMG:(\d+)@@$/.exec(line);
    if (imageMatch) return { type:"image", ...images[Number(imageMatch[1])] };
    return { type:"p", text:line.replace(/\s+/g, " ").trim() };
  });
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

async function carregarImagemRemotaParaPdf(url) {
  const safe = safeUrl(url);
  if (!safe) throw new Error("URL de imagem inválida.");
  const response = await fetch(safe, { mode:"cors", cache:"force-cache" });
  if (!response.ok) throw new Error(`Imagem indisponível (${response.status}).`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.src = objectUrl;
    });
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl:canvas.toDataURL("image/jpeg", .90), width:canvas.width, height:canvas.height };
  } finally { URL.revokeObjectURL(objectUrl); }
}

async function baixarMaterialCompletoCurso() {
  if (!state.cursoAtual || !state.modulos.length) return toast("Nenhum material disponível.", "error");
  if (!window.jspdf?.jsPDF) return toast("Gerador de PDF não carregado.", "error");

  const button = $("btnCursoMaterialCompleto");
  const original = button?.textContent || "Baixar material completo";
  if (button) { button.disabled = true; button.textContent = "Gerando material..."; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4", compress:true });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 18;
    const contentWidth = width - margin * 2;
    let y = 20;
    let logo = null;
    try {
      const response = await fetch(new URL('/assets/img/LOGO.png', location.href));
      const blob = await response.blob();
      logo = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    } catch (_) {}

    const addPage = () => { doc.addPage(); y = 20; };
    const ensure = (needed = 12) => { if (y + needed > height - 18) addPage(); };
    const writeLines = (text, size = 10, bold = false, spacing = 5, indent = 0, justify = false, color = [45,61,75]) => {
      const value = String(text || "").trim(); if (!value) return;
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
      const maxWidth = contentWidth - indent;
      const lines = doc.splitTextToSize(value, maxWidth);
      lines.forEach((line, index) => {
        ensure(spacing + 2);
        const opts = justify && !bold && lines.length > 1 && index < lines.length - 1 ? { maxWidth, align:"justify" } : undefined;
        doc.text(line, margin + indent, y, opts); y += spacing;
      });
      y += bold ? 2 : 1.2;
    };
    const drawRemoteImage = async (block) => {
      try {
        const image = await carregarImagemRemotaParaPdf(block.url);
        let imageWidth = contentWidth * Math.max(.2, Math.min(1, Number(block.widthPercent || 88) / 100));
        let imageHeight = imageWidth * (image.height / image.width);
        const maxHeight = 125;
        if (imageHeight > maxHeight) { const ratio = maxHeight / imageHeight; imageHeight *= ratio; imageWidth *= ratio; }
        ensure(imageHeight + (block.caption ? 12 : 6));
        const x = (width - imageWidth) / 2;
        doc.addImage(image.dataUrl, "JPEG", x, y, imageWidth, imageHeight, undefined, "FAST"); y += imageHeight + 4;
        if (block.caption) { doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(90,108,120); const lines=doc.splitTextToSize(String(block.caption),contentWidth*.85); doc.text(lines,width/2,y,{align:"center"}); y += lines.length*4+3; }
      } catch (error) {
        console.warn("Imagem do material não pôde ser incorporada ao PDF:", block.url, error.message);
        writeLines(`Imagem indisponível no PDF: ${block.caption || block.url}`, 8.5, false, 4, 0, false, [105,120,132]);
      }
    };

    // Capa institucional.
    if (logo) doc.addImage(logo, 'PNG', (width - 66) / 2, 20, 66, 18, undefined, 'FAST');
    doc.setTextColor(17,168,182); doc.setFont('helvetica','bold'); doc.setFontSize(11.5); doc.text('Material de estudo', width/2, 47, {align:'center'});
    doc.setTextColor(7,59,90); doc.setFontSize(18);
    const coverLines = doc.splitTextToSize(`Curso de ${state.cursoAtual.titulo || 'Curso'}`, width - 50); doc.text(coverLines, width/2, 60, {align:'center'});
    const coverBottom = 60 + Math.max(0, coverLines.length - 1) * 8;
    doc.setDrawColor(207,220,229); doc.setLineWidth(.35); doc.line(margin, coverBottom + 12, width - margin, coverBottom + 12);
    y = coverBottom + 27;
    writeLines(`Curso: ${state.cursoAtual.titulo || 'Curso'}`, 10.5, true, 6);
    writeLines(`Área de formação: ${state.cursoAtual.categoria || 'Formação profissional'}`, 10, false, 6);
    writeLines('Finalidade: apoiar o estudo teórico e servir de base para a avaliação de aprendizagem.', 10, false, 6);

    const modules = [...state.modulos].sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0));
    for (let index = 0; index < modules.length; index += 1) {
      const modulo = modules[index];
      const numero = Number(modulo.ordem || index + 1);
      addPage();
      writeLines(`Módulo ${numero} — ${modulo.titulo || `Conteúdo ${numero}`}`, 16, true, 8, 0, false, [7,59,90]);
      const descricao = cleanLatexForStudent(modulo.descricao || "");
      if (descricao) writeLines(descricao, 9.5, false, 5, 0, true, [96,116,130]);
      const blocks = latexBlocksForStudentPdf(modulo.conteudo_latex || modulo.conteudo || "");
      for (const block of blocks) {
        if (block.type === "image") { await drawRemoteImage(block); continue; }
        if (block.type === "h2") writeLines(block.text, 13.5, true, 7, 0, false, [7,59,90]);
        else if (block.type === "h3") writeLines(block.text, 12, true, 6, 0, false, [13,67,99]);
        else if (block.type === "h4") writeLines(block.text, 11, true, 5.5, 0, false, [20,77,105]);
        else if (block.type === "li") writeLines(block.text, 10, false, 5, 5, true);
        else writeLines(block.text, 10, false, 5, 0, true);
      }
    }

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100,115,128);
      doc.text(`Altitude Centro Universitário - ${page} de ${totalPages}`, width / 2, height - 9, { align:"center" });
    }
    const filename = `material-${String(state.cursoAtual.titulo || "curso").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.pdf`;
    doc.save(filename);
    window.altitudeAnalyticsV41?.send?.("material_completo", state.cursoAtual.titulo || "Curso", { curso_id:Number(state.cursoAtual.id), modulos:modules.length });
  } catch (error) {
    console.error("Material completo:", error); toast(`Não foi possível gerar o material: ${error.message}`, "error");
  } finally { if (button) { button.disabled = false; button.textContent = original; } }
}

function renderModuloAtual() {
  const modulo = state.modulos[state.moduloIndex];
  if (!modulo) return;

  const numeroModulo = Number(modulo.ordem || state.moduloIndex + 1);
  setText("lessonPosition", `Módulo ${numeroModulo} de ${state.modulos.length}`);
  setText("lessonTitle", modulo.titulo || `Módulo ${numeroModulo}`);
  setText("lessonDescription", cleanLatexForStudent(modulo.descricao) || "Estude os materiais abaixo e marque o conteúdo como concluído.");

  const recursos = uniqueModuleResources(modulo);
  const content = $("lessonContent");
  const blocoTextoHtml = studentContentHtml(modulo.conteudo_latex || modulo.conteudo || "");
  const blocoTexto = blocoTextoHtml ? `<article class="lesson-written-content"><span class="lesson-module-order">Módulo ${numeroModulo}</span><h3>Conteúdo do módulo</h3>${blocoTextoHtml}</article>` : "";

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
    const avaliacao = avaliacaoDoCurso(state.cursoAtual.id);
    if (!avaliacao) {
      abrirAvaliacaoCurso(state.cursoAtual.id, { obrigatoria: true, resultadoProva: resultado });
    } else {
      mostrarResultadoProva(resultado);
    }
    return;
  }

  try {
    const { data, error } = await sb.rpc("obter_prova_aluno", { p_curso_id: Number(state.cursoAtual.id) });
    if (error) throw error;
    if (!data?.encontrada) return toast(data?.mensagem || "Prova não encontrada.", "error");
    if (!Array.isArray(data.questoes) || !data.questoes.length) return toast("A prova ainda não possui questões.", "error");

    state.prova = data;
    state.respostas = {};
    state.opcoesEmbaralhadas = {};
    state.embaralharAlternativas = state.resultados.some((item) => Number(item.curso_id) === Number(state.cursoAtual?.id));
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

  let options = ["A", "B", "C", "D", "E"]
    .map((letter) => ({ originalLetter: letter, text: questao[letter.toLowerCase()] }))
    .filter((option) => String(option.text || "").trim());
  if (state.embaralharAlternativas) {
    if (!state.opcoesEmbaralhadas[questao.id]) {
      const shuffled = [...options];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      state.opcoesEmbaralhadas[questao.id] = shuffled;
    }
    options = state.opcoesEmbaralhadas[questao.id];
  }
  const selected = state.respostas[questao.id];
  $("quizBody").innerHTML = `
    <div class="quiz-question">
      <span class="quiz-question-number">Questão ${state.questaoIndex + 1}</span>
      <h3>${escapeHTML(questao.enunciado)}</h3>
      <div class="quiz-options">
        ${options.map((option, index) => {
          const displayLetter = String.fromCharCode(65 + index);
          return `<button type="button" class="quiz-option ${selected === option.originalLetter ? "selected" : ""}" data-quiz-answer="${escapeHTML(option.originalLetter)}" aria-pressed="${selected === option.originalLetter}"><b>${displayLetter}</b><span>${escapeHTML(option.text)}</span></button>`;
        }).join("")}
      </div>
    </div>`;

  document.querySelectorAll('[data-quiz-answer]').forEach((button) => {
    button.addEventListener("click", () => {
      state.respostas[questao.id] = button.dataset.quizAnswer;
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
    const cursoId = Number(state.cursoAtual?.id || state.prova?.curso_id || 0);
    const avaliacaoExistente = cursoId ? avaliacaoDoCurso(cursoId) : null;
    if (cursoId && !avaliacaoExistente) {
      abrirAvaliacaoCurso(cursoId, { obrigatoria: true, resultadoProva: data });
    } else {
      mostrarResultadoProva(data);
    }
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

function irParaCertificados(cursoId = null) {
  const id = Number(cursoId || state.cursoAtual?.id || 0);
  fecharModal("prova");
  fecharModal("curso");
  abrirAba("solicitar-certificado");
  window.setTimeout(() => {
    const target = id ? document.querySelector(`[data-curso-certificado="${id}"]`) : document.querySelector('#listaSolicitacaoCertificados .certificate-card');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function solicitarCertificadoCursoAtual() {
  const id = Number(state.cursoAtual?.id || 0);
  if (!id) return;
  irParaCertificados(id);
}

function continuarEstudando() {
  fecharModal("prova");
  fecharModal("curso");
  abrirAba("cursos");
}

function statusEfetivoCertificado(certificado) {
  const original = String(certificado?.status || "PENDENTE").toUpperCase();
  if (["CANCELADO","BLOQUEADO","EMITIDO"].includes(original)) return original;
  const faltam = Math.max(0, Number(certificado?.horas_faltantes || 0));
  if (faltam > 0) return "AGUARDANDO_HORAS";
  const pagamento = String(certificado?.pagamento_status || "").toUpperCase();
  if (pagamento && !["PAGO","ISENTO"].includes(pagamento)) return "AGUARDANDO_PAGAMENTO";
  if (original === "AUTORIZADO_AGUARDANDO_DATA") return original;
  if (certificado?.autorizado_em && (certificado?.previsao_liberacao || certificado?.data_final_prevista || certificado?.periodo_fim || certificado?.liberar_em)) return "AUTORIZADO_AGUARDANDO_DATA";
  if (["PENDENTE","REABERTO"].includes(original) && ["PAGO","ISENTO"].includes(pagamento)) return "PRONTO_PARA_LIBERACAO";
  return original;
}

function rotuloAcaoCertificado(acao) {
  return ({
    SOLICITADO: "Solicitação enviada", LIBERADO: "Certificado liberado", EMITIDO: "Certificado emitido",
    BLOQUEADO: "Certificado bloqueado", AGUARDANDO_HORAS: "Certificado aguardando horas", AUTORIZADO_AGUARDANDO_DATA: "Certificado aguardando a data", CANCELADO: "Certificado cancelado", REABERTO: "Solicitação reaberta",
    IMPORTADO: "Registro importado", CRIADO: "Registro criado", ATUALIZADO: "Registro atualizado"
  })[String(acao || "").toUpperCase()] || String(acao || "Atualização").replaceAll("_", " ");
}

function mensagemPublicaHistoricoCertificado(item, certificado) {
  const statusHistorico = String(item?.status_novo || "").toUpperCase();
  const status = certificado ? statusEfetivoCertificado(certificado) : statusHistorico;

  if (status === "AGUARDANDO_HORAS") {
    const faltam = Number(certificado?.horas_faltantes || 0);
    const previsao = certificado?.previsao_liberacao || certificado?.data_final_prevista || certificado?.periodo_fim;
    return `${faltam > 0 ? `Faltam ${faltam}h para completar a carga solicitada.` : "Aguardando completar as horas solicitadas."}${previsao ? ` Previsão estimada: ${dataBR(previsao)}.` : ""}`;
  }
  if (status === "AUTORIZADO_AGUARDANDO_DATA" || (String(certificado?.status || "").toUpperCase() === "EMITIDO" && !certificadoEstaLiberado(certificado))) {
    const previsao = certificado?.previsao_liberacao || certificado?.data_final_prevista || certificado?.periodo_fim || certificado?.liberar_em;
    return previsao ? `Aguardando a data de liberação: ${dataBR(previsao)}.` : "Aguardando a data de liberação do certificado.";
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
  const boxes = [$("resumoCarteiraHoras"), $("resumoCarteiraHorasSolicitacao")].filter(Boolean);
  if (!boxes.length) return;
  const totais = state.carteirasHoras.reduce((acc, item) => {
    acc.validadas += Number(item.horas_validadas || 0);
    acc.reservadas += Number(item.horas_reservadas || 0);
    acc.utilizadas += Number(item.horas_utilizadas || 0);
    acc.disponiveis += Number(item.saldo_disponivel || 0);
    return acc;
  }, { validadas: 0, reservadas: 0, utilizadas: 0, disponiveis: 0 });
  const html = `
    <article><span>Horas acumuladas</span><strong>${totais.validadas}h</strong></article>
    <article><span>Saldo disponível</span><strong>${totais.disponiveis}h</strong></article>
    <article><span>Em análise</span><strong>${totais.reservadas}h</strong></article>
    <article><span>Já certificadas</span><strong>${totais.utilizadas}h</strong></article>`;
  boxes.forEach((box) => { box.innerHTML = html; });
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
        <a class="secondary-button certificate-validate-link" target="_blank" href="/certificados/?codigo=${encodeURIComponent(codigo)}">Validar</a>
        <button class="primary-button" type="button" onclick="baixarCertificado(${Number(cert.id)})">Baixar PDF</button>
      </div>
    </article>`;
  }).join("");
}

function certificadoEmitidoDoCurso(cursoId) {
  return certificadosDoCurso(cursoId).find((item) => String(item.status || "").toUpperCase() === "EMITIDO") || null;
}

function certificadoPendenteDoCurso(cursoId) {
  return certificadosDoCurso(cursoId).find((item) => ["PENDENTE","AGUARDANDO_HORAS","AUTORIZADO_AGUARDANDO_DATA"].includes(String(item.status || "").toUpperCase())) || null;
}

function certificadoBloqueadoDoCurso(cursoId) {
  return certificadosDoCurso(cursoId).find((item) => String(item.status || "").toUpperCase() === "BLOQUEADO") || null;
}

function cardSolicitacaoCertificado(curso) {
  const progressoOk = clamp(curso.progresso) >= 100;
  const resultado = melhorResultadoCurso(curso.id);
  const provaOk = Boolean(resultado?.aprovado);
  // V42: a nota mínima pertence à configuração do curso/prova. Nunca use
  // uma variável global solta, pois isso gerava “notaMinima is not defined”.
  const notaMinima = Number(curso?.nota_minima ?? state?.prova?.nota_minima ?? 70);
  const carteira = carteiraHorasCurso(curso.id);
  const saldo = Number(carteira?.saldo_disponivel || 0);
  const ativo = certificadoPendenteDoCurso(curso.id);
  const bloqueado = certificadoBloqueadoDoCurso(curso.id);
  const avaliacao = avaliacaoDoCurso(curso.id);
  const pronto = provaOk && Boolean(avaliacao);
  const options = opcoesHorasDisponiveis(saldo);

  let actions = `<button class="secondary-button" type="button" disabled>Aguardando aprovação</button>`;
  let help = "A solicitação fica disponível depois da aprovação na prova.";
  let statusVisual = "BLOQUEADO";

  if (ativo) {
    const status = statusEfetivoCertificado(ativo);
    const previsao = ativo.previsao_liberacao || ativo.data_final_prevista || ativo.periodo_fim || ativo.liberar_em;
    statusVisual = status;
    if (status === "AGUARDANDO_HORAS") {
      const faltam = Number(ativo.horas_faltantes || 0);
      help = `${faltam > 0 ? `Faltam ${faltam}h para completar as ${Number(ativo.horas_solicitadas || 0)}h solicitadas.` : "Aguardando completar as horas solicitadas."}${previsao ? ` Previsão estimada: ${dataBR(previsao)}.` : ""}`;
      actions = `<button class="secondary-button" type="button" disabled>Aguardando horas</button>`;
    } else if (status === "AGUARDANDO_PAGAMENTO") {
      statusVisual = "AGUARDANDO_PAGAMENTO";
      help = "A solicitação está aguardando a confirmação do pagamento.";
      actions = `<button class="secondary-button" type="button" disabled>Aguardando pagamento</button>`;
    } else if (status === "AUTORIZADO_AGUARDANDO_DATA") {
      help = previsao ? `Horas completas e emissão autorizada. Aguardando a data de liberação: ${dataBR(previsao)}.` : "Horas completas. Aguardando a data de liberação.";
      actions = `<button class="secondary-button" type="button" disabled>Aguardando data</button>`;
    } else {
      statusVisual = "PRONTO_PARA_LIBERACAO";
      help = "Horas e pagamento conferidos. A solicitação está pronta para liberação pela gestão.";
      actions = `<button class="secondary-button" type="button" disabled>Pronto para liberação</button>`;
    }
  } else if (bloqueado) {
    statusVisual = "BLOQUEADO";
    help = "A solicitação está temporariamente indisponível.";
    actions = `<button class="secondary-button" type="button" disabled>Solicitação bloqueada</button>`;
  } else if (provaOk && !avaliacao) {
    statusVisual = "AVALIAÇÃO PENDENTE";
    help = "Você foi aprovado. Avalie o curso para liberar a solicitação do certificado.";
    actions = `<button class="course-review-button primary-button" type="button" onclick="avaliarCurso(${Number(curso.id)})">Avaliar curso e continuar</button>`;
  } else if (pronto) {
    statusVisual = "DISPONÍVEL";
    help = "Escolha até 200 horas. A previsão será calculada automaticamente, aproveitando o saldo anterior sem criar lacunas nem sobrepor datas.";
    const defaultHours = options.includes(50) ? 50 : options[0];
    actions = `<div class="hours-request-control">
      <label for="horasSolicitadas-${Number(curso.id)}">Horas deste certificado</label>
      <select id="horasSolicitadas-${Number(curso.id)}">${options.map((h) => `<option value="${h}"${h === defaultHours ? " selected" : ""}>${h} horas</option>`).join("")}</select>
      <label for="cupomSolicitacao-${Number(curso.id)}">Cupom de desconto <small>(opcional)</small></label>
      <input id="cupomSolicitacao-${Number(curso.id)}" class="certificate-coupon-before-request" type="text" maxlength="30" autocomplete="off" placeholder="Digite o cupom antes de solicitar">
      <small class="coupon-request-help">Após solicitar, o portal abrirá o WhatsApp com a mensagem de pagamento preenchida. Cupom integral pode zerar o pagamento.</small>
      <button class="primary-button request-certificate-main-action" type="button" onclick="solicitarCertificado(${Number(curso.id)})">Solicitar certificado</button>
    </div>`;
  }

  const avaliacaoHtml = provaOk && avaliacao
    ? `<div class="course-review-done"><span class="review-stars-static">${"★".repeat(Number(avaliacao.nota || 0))}${"☆".repeat(5 - Number(avaliacao.nota || 0))}</span><strong>Curso avaliado</strong></div>`
    : "";

  return `<article class="certificate-card hours-wallet-card" data-curso-certificado="${Number(curso.id)}">
    <div class="certificate-card-top">
      <div><span class="eyebrow">${escapeHTML(curso.categoria || "Certificação")}</span><h3>${escapeHTML(curso.titulo || "Curso")}</h3><p>${resultado ? `Melhor nota: ${Number(resultado.nota || 0)}%` : "Prova pendente"}</p></div>
      ${statusPill(statusVisual)}
    </div>
    <div class="certificate-requirements">
      <div class="requirement ${progressoOk ? "ok" : ""}"><b>${progressoOk ? "✓" : "1"}</b><span>Conteúdo 100% concluído</span></div>
      <div class="requirement ${provaOk ? "ok" : ""}"><b>${provaOk ? "✓" : "2"}</b><span>Prova aprovada (mínimo ${notaMinima}%)</span></div>
      <div class="requirement ${avaliacao ? "ok" : ""}"><b>${avaliacao ? "✓" : "3"}</b><span>Avaliação do curso</span></div>
    </div>
    <div class="certificate-card-footer"><span class="certificate-code">${escapeHTML(help)}</span><div class="certificate-actions">${actions}</div></div>
    ${avaliacaoHtml}
  </article>`;
}

function cursoAptoParaSolicitarCertificado(curso) {
  // V42: só entra nesta etapa quem realmente concluiu/aprovou a prova e ainda
  // não possui certificado emitido nem solicitação ativa. Curso apenas
  // matriculado/em andamento nunca incrementa o contador.
  if (!cursoConcluido(curso)) return false;
  if (certificadoEmitidoDoCurso(curso.id)) return false;
  if (certificadoPendenteDoCurso(curso.id)) return false;
  if (certificadoBloqueadoDoCurso(curso.id)) return false;
  return true;
}

function atualizarMenuSolicitarCertificado() {
  const menu = $("menuSolicitarCertificado");
  const badge = $("badgeSolicitarCertificado");
  const section = $("secaoCursosAptosCertificado");
  if (!menu) return;
  const pendentes = state.cursos.filter(cursoAptoParaSolicitarCertificado);
  const count = pendentes.length;
  menu.hidden = count === 0;
  if (section) section.hidden = count === 0;
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
  setText("contadorSolicitacoesCertificado", `${count} ${count === 1 ? "curso" : "cursos"}`);
}

function renderSolicitacoesCertificado() {
  const list = $("listaSolicitacaoCertificados");
  if (!list) return;
  const section = $("secaoCursosAptosCertificado");
  const cursos = state.cursos.filter(cursoAptoParaSolicitarCertificado);
  setText("contadorSolicitacoesCertificado", `${cursos.length} ${cursos.length === 1 ? "curso" : "cursos"}`);
  if (!cursos.length) {
    list.innerHTML = "";
    if (section) section.hidden = true;
    atualizarMenuSolicitarCertificado();
    return;
  }
  if (section) section.hidden = false;
  list.innerHTML = cursos.map(cardSolicitacaoCertificado).join("");
  atualizarMenuSolicitarCertificado();
}

function renderCertificados() {
  const list = $("listaCertificados");
  renderResumoCarteiraHoras();
  renderCertificadosEmitidos();
  atualizarMenuSolicitarCertificado();
  renderSolicitacoesCertificado();

  if (list) {
    const cursosComSolicitacao = state.cursos.filter((curso) => certificadoPendenteDoCurso(curso.id) || certificadoBloqueadoDoCurso(curso.id));
    list.innerHTML = cursosComSolicitacao.length
      ? cursosComSolicitacao.map(cardSolicitacaoCertificado).join("")
      : `<div class="empty-state">Nenhuma solicitação em andamento. Depois de ser aprovado, use a aba <b>Solicitar certificado</b>.</div>`;
  }
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
      <span class="eyebrow">Avaliação do curso</span>
      <h3 id="reviewModalTitle">Avalie este curso</h3>
      <p>Selecione de 1 a 5 estrelas.</p>
      <div class="review-star-picker" role="radiogroup" aria-label="Nota do curso">
        ${[1,2,3,4,5].map((n) => `<button type="button" data-review-star="${n}" role="radio" aria-checked="false" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</button>`).join("")}
      </div>
      <p class="review-success-message" hidden>Avaliação registrada com sucesso!</p>
      <p class="review-error-message" hidden></p>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-review-star]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (modal.dataset.salvando === "true") return;
      const nota = Number(button.dataset.reviewStar || 0);
      const cursoId = Number(modal.dataset.cursoId || 0);
      if (!nota || !cursoId) return;

      modal.dataset.nota = String(nota);
      modal.querySelectorAll("[data-review-star]").forEach((star) => {
        const active = Number(star.dataset.reviewStar) <= nota;
        star.classList.toggle("selected", active);
        star.setAttribute("aria-checked", String(Number(star.dataset.reviewStar) === nota));
      });

      await registrarAvaliacaoImediata(modal, cursoId, nota);
    });
  });

  return modal;
}

function fecharModalAvaliacao(modal) {
  modal.setAttribute("aria-hidden", "true");
  modal.dataset.salvando = "false";
  modal.querySelector(".review-star-picker")?.classList.remove("is-saving");
  if ($("modalCurso")?.getAttribute("aria-hidden") === "true"
      && $("modalProva")?.getAttribute("aria-hidden") === "true"
      && $("modalChamadoAluno")?.getAttribute("aria-hidden") === "true") {
    document.body.style.overflow = "";
  }
}

async function registrarAvaliacaoImediata(modal, cursoId, nota) {
  const picker = modal.querySelector(".review-star-picker");
  const success = modal.querySelector(".review-success-message");
  const failure = modal.querySelector(".review-error-message");
  const obrigatoria = modal.dataset.obrigatoria === "true";
  let resultadoProva = null;
  try {
    resultadoProva = modal.dataset.resultadoProva ? JSON.parse(modal.dataset.resultadoProva) : null;
  } catch (_) {
    resultadoProva = null;
  }

  modal.dataset.salvando = "true";
  picker?.classList.add("is-saving");
  if (success) success.hidden = true;
  if (failure) failure.hidden = true;

  try {
    const { error } = await sb.rpc("avaliar_curso", {
      p_curso_id: Number(cursoId),
      p_nota: Number(nota),
      p_comentario: null
    });
    if (error) throw error;

    await Promise.all([carregarAvaliacoes(), carregarCursos()]);
    renderDashboard();
    renderCursos();
    renderCertificados();
    if (success) success.hidden = false;

    window.setTimeout(() => {
      fecharModalAvaliacao(modal);
      renderSalaEstudo();
      renderSolicitacoesCertificado();
      toast(obrigatoria && resultadoProva
        ? "Avaliação registrada. Curso concluído — escolha solicitar o certificado ou continuar estudando."
        : "Avaliação registrada. O curso está concluído.", "success");
    }, 500);
  } catch (error) {
    modal.dataset.salvando = "false";
    picker?.classList.remove("is-saving");
    const message = error?.message || "Não foi possível registrar a avaliação. Toque novamente em uma estrela.";
    if (failure) {
      failure.textContent = message;
      failure.hidden = false;
    }
    toast(`Não foi possível avaliar: ${message}`, "error");
  }
}

function abrirAvaliacaoCurso(cursoId, options = {}) {
  const modal = garantirModalAvaliacao();
  const curso = state.cursos.find((item) => Number(item.id) === Number(cursoId));
  modal.dataset.cursoId = String(cursoId);
  modal.dataset.nota = "";
  modal.dataset.salvando = "false";
  modal.dataset.obrigatoria = options.obrigatoria ? "true" : "false";
  modal.dataset.resultadoProva = options.resultadoProva ? JSON.stringify(options.resultadoProva) : "";
  modal.querySelector("#reviewModalTitle").textContent = options.obrigatoria
    ? "Avalie o curso para ver o resultado"
    : (curso?.titulo || "Avalie este curso");
  modal.querySelector(".review-success-message").hidden = true;
  const failure = modal.querySelector(".review-error-message");
  failure.hidden = true;
  failure.textContent = "";
  modal.querySelector(".review-star-picker")?.classList.remove("is-saving");
  modal.querySelectorAll("[data-review-star]").forEach((star) => {
    star.classList.remove("selected");
    star.setAttribute("aria-checked", "false");
  });
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

async function avaliarCurso(cursoId) {
  const existente = avaliacaoDoCurso(cursoId);
  if (existente) return toast("Você já avaliou este curso.", "success");
  abrirAvaliacaoCurso(cursoId, { obrigatoria: false });
}

async function solicitarCertificado(cursoId) {
  const select = $(`horasSolicitadas-${Number(cursoId)}`);
  const cupomInput = $(`cupomSolicitacao-${Number(cursoId)}`);
  const horas = Number(select?.value || 0);
  const cupom = String(cupomInput?.value || "").trim().toUpperCase();
  if (!horas || horas < 5 || horas > 200 || horas % 5 !== 0) return toast("Escolha de 5 em 5 horas, com máximo de 200h por certificado.", "error");
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
      toast(`Solicitação registrada.${previsao ? ` Previsão de liberação: ${dataBR(previsao)}.` : ""} Abrindo o WhatsApp para pagamento.`, "success");
      abrirAba("pagamentos");
      window.setTimeout(() => {
        if (typeof window.altitudeAbrirWhatsappCertificado === "function" && data?.id) {
          window.altitudeAbrirWhatsappCertificado(Number(data.id));
        }
      }, 250);
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
  const validationUrl = `${window.location.origin}/certificados/?codigo=${encodeURIComponent(codigo)}`;

  try {
    await window.AltitudeCertificatePDF.download({
      sb,
      cert,
      aluno: state.aluno || {},
      curso: courseData,
      logoUrl: "/assets/img/LOGO.png",
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
      <div class="digital-card-top"><img src="/assets/img/LOGO.png" alt="Altitude"><span>${new Date().getFullYear()}</span></div>
      <div class="digital-card-body">
        <img src="${escapeHTML(imgAluno(state.aluno.foto_url))}" alt="Foto do aluno">
        <div class="digital-card-data"><strong class="student-card-name">${escapeHTML(String(state.aluno.nome || "Aluno").toUpperCase())}</strong><span class="student-card-ra"><b>RA</b> ${escapeHTML(state.aluno.ra || "—")}</span><span><b>CPF</b> ${escapeHTML(maskCpf(state.aluno.cpf))}</span><span>Status: ${escapeHTML(state.aluno.status || "ATIVO")}</span><span>ALTITUDE CENTRO UNIVERSITÁRIO</span></div>
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
  const validationUrl = new URL(`/validar-carteirinha/?codigo=${encodeURIComponent(code)}`, window.location.href).href;
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
    const url = new URL(`/validar-carteirinha/?codigo=${encodeURIComponent(state.aluno.codigo_carteirinha)}`, window.location.href).href;
    const qr = await gerarQrDataUrl(url);
    if (!state.logoDataUrl) state.logoDataUrl = await imagemParaDataURL("/assets/img/LOGO.png");
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
    doc.text(`CPF: ${maskCpf(state.aluno.cpf)}`, 28, infoY + 3.5);
    doc.text(`STATUS: ${state.aluno.status || "ATIVO"}`, 28, infoY + 7);
    doc.text("ALTITUDE CENTRO UNIVERSITÁRIO", 28, infoY + 10.5);

    doc.setFillColor(255,255,255); doc.roundedRect(w - 21, h - 21, 17, 17, 1.5, 1.5, "F");
    doc.addImage(qr, "PNG", w - 20, h - 20, 15, 15);
    doc.setFont("helvetica","bold"); doc.setFontSize(4.5); doc.setTextColor(255,255,255);
    doc.text("CARTEIRINHA DIGITAL", 6, h - 12);
    doc.setFont("helvetica","normal"); doc.setTextColor(190,218,235);
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

async function atualizarDadosPrincipais(options = {}) {
  if (!state.aluno?.user_id) return false;
  if (state.atualizandoDados) {
    state.atualizacaoPendente = true;
    return false;
  }
  state.atualizandoDados = true;
  try {
    try { await sb.rpc("processar_certificados_prontos_v34_3"); } catch (_) { /* migration ainda não publicada */ }
    const tarefas = [
      ['cursos', carregarCursos],
      ['resultados', carregarResultados],
      ['avaliações', carregarAvaliacoes],
      ['recompensas', carregarRecompensas],
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
    const sucessos = resultados.length - falhas.length;

    falhas.forEach(({ resultado, nome }) => console.warn(`Falha temporária em ${nome}:`, resultado.reason?.message || resultado.reason));

    // Se ao menos uma fonte respondeu, preservamos o que já estava carregado e
    // renderizamos sem transformar uma falha parcial de rede em erro para o aluno.
    if (sucessos > 0) {
      state.cargaPrincipalConcluida = true;
      state.falhasConsecutivasSync = 0;

      renderCarteirinha();
      renderDashboard();
      renderCursos();
      renderCertificados();
      renderPagamentos();

      // Corrige o falso alerta: se uma primeira tentativa falhou e a repetição
      // automática funcionou, o aviso desaparece imediatamente.
      ocultarMensagemDeSincronizacao();
      return true;
    }

    state.falhasConsecutivasSync += 1;

    // Em polling/realtime ou quando já existem dados na tela, uma queda curta de
    // conexão é tratada silenciosamente. Os dados existentes NÃO são apagados.
    if (options.silent || portalTemDadosVisiveis()) {
      console.warn('Sincronização temporariamente indisponível; mantendo dados já carregados.');
      return false;
    }

    const erro = new Error('Não foi possível sincronizar os dados agora.');
    erro.code = 'SYNC_FAILED';
    throw erro;
  } finally {
    state.atualizandoDados = false;
    if (state.atualizacaoPendente) {
      state.atualizacaoPendente = false;
      window.setTimeout(() => atualizarDadosPrincipais({ silent: true }), 180);
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
  $("catalogoBusca")?.addEventListener("input", renderCatalogoCursos);
  $("catalogoArea")?.addEventListener("change", renderCatalogoCursos);
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
      await atualizarDadosPrincipais({ silent: true });
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
        await atualizarDadosPrincipais({ silent: true });
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

    // Não mostra erro imediatamente. Em celular/tablet a troca de rede, suspensão
    // da aba ou atraso do navegador pode derrubar a primeira rodada e a seguinte
    // funcionar normalmente. Tentamos novamente antes de incomodar o aluno.
    let recuperou = false;
    for (let tentativa = 1; tentativa <= 3 && !recuperou; tentativa += 1) {
      await esperar(700 * tentativa);
      try {
        if (!state.user) state.user = await obterUsuarioLogado();
        if (state.user && !state.aluno) await carregarAluno();
        if (state.aluno) recuperou = Boolean(await atualizarDadosPrincipais({ silent: true }));
      } catch (retryError) {
        console.warn(`Nova tentativa ${tentativa} do portal:`, retryError.message);
      }
    }

    if (recuperou || portalTemDadosVisiveis()) {
      ocultarMensagemDeSincronizacao();
      return;
    }

    mensagemDeSincronizacao('Não foi possível carregar os dados agora. Verifique sua conexão e tente novamente.', true);
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
window.solicitarCertificadoCursoAtual = solicitarCertificadoCursoAtual;
window.continuarEstudando = continuarEstudando;
window.baixarMaterialCompletoCurso = baixarMaterialCompletoCurso;

iniciarPortal();
