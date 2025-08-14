/* ======================================================
   PORTAL DO ALUNO - JavaScript Principal
   Autor: Carlos Alberto G. O. Júnior
   Descrição: Controle de abas, cursos, fórum, pagamentos,
              certificados e métricas integrados.
   ====================================================== */

// ==== CONFIGURAÇÕES GERAIS ====
const STORAGE_KEY = "portalAlunoData";
let alunoData = {
  nome: "",
  ra: "",
  foto: "",
  cursos: [],
  progressoCursos: {},
  creditos: 0,
  horasEstudo: 0,
  mediaGeral: 0,
  provas: {},
  forumChamados: [],
  ultimaAtividade: Date.now()
};

// Carregar dados salvos
function carregarDados() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) alunoData = JSON.parse(data);
}
function salvarDados() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alunoData));
}
carregarDados();

// ==== CONTROLE DE ABAS ====
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const tab = btn.dataset.tab;
    document.querySelectorAll("section").forEach(sec => sec.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
  });
});

// ==== TIMER DE ESTUDO ====
let timerInterval;
function iniciarTimer() {
  timerInterval = setInterval(() => {
    alunoData.horasEstudo += 1 / 3600; // 1 segundo
    atualizarMetricas();
    salvarDados();
  }, 1000);
}
function pararTimer() {
  clearInterval(timerInterval);
}
function monitorarInatividade() {
  let timeout;
  function reset() {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      pararTimer();
      console.log("Sessão pausada por inatividade");
    }, 5 * 60 * 1000); // 5 minutos
  }
  ["mousemove", "keydown", "click"].forEach(ev => document.addEventListener(ev, reset));
  reset();
}
iniciarTimer();
monitorarInatividade();

// ==== CURSOS DISPONÍVEIS ====
const cursosDisponiveis = [
  {
    id: 1,
    titulo: "Curso de Lógica de Programação",
    imagem: "https://via.placeholder.com/300x180",
    inscritos: 15,
    estrelas: 4.5
  },
  {
    id: 2,
    titulo: "HTML, CSS e JavaScript",
    imagem: "https://via.placeholder.com/300x180",
    inscritos: 8,
    estrelas: 5
  }
];
function renderCursosInscricoes() {
  const grid = document.getElementById("grid-catalogo");
  grid.innerHTML = "";
  cursosDisponiveis.forEach(curso => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${curso.imagem}" style="width:100%;border-radius:12px 12px 0 0">
      <div class="body">
        <h4>${curso.titulo}</h4>
        <p>${curso.inscritos} inscritos • ⭐ ${curso.estrelas}</p>
        <button class="btn primary" data-id="${curso.id}">Inscrever-se</button>
      </div>
    `;
    grid.appendChild(card);
  });
  document.querySelectorAll("#grid-catalogo .btn.primary").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id);
      if (!alunoData.cursos.includes(id)) {
        alunoData.cursos.push(id);
        salvarDados();
        renderMeusCursos();
        alert("Inscrição realizada com sucesso!");
      }
    });
  });
}

// ==== MEUS CURSOS ====
function renderMeusCursos() {
  const grid = document.getElementById("grid-cursos");
  grid.innerHTML = "";
  alunoData.cursos.forEach(id => {
    const curso = cursosDisponiveis.find(c => c.id === id);
    if (curso) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <img src="${curso.imagem}" style="width:100%;border-radius:12px 12px 0 0">
        <div class="body">
          <h4>${curso.titulo}</h4>
          <p>${curso.inscritos} inscritos • ⭐ ${curso.estrelas}</p>
          <button class="btn" data-id="${curso.id}">Acessar Curso</button>
        </div>
      `;
      grid.appendChild(card);
    }
  });
}

// ==== FORUM ====
function gerarNumeroChamado() {
  const ano = new Date().getFullYear();
  const chamadosAno = alunoData.forumChamados.filter(c => c.ano === ano);
  const numero = chamadosAno.length + 1;
  return `${String(numero).padStart(3, "0")}/${ano}`;
}
function abrirChamado(titulo, descricao) {
  alunoData.forumChamados.push({
    numero: gerarNumeroChamado(),
    ano: new Date().getFullYear(),
    titulo,
    descricao,
    status: "Em análise",
    data: new Date().toLocaleString()
  });
  salvarDados();
  renderForum();
}
function renderForum() {
  const lista = document.getElementById("lista-chamados");
  if (!lista) return;
  lista.innerHTML = "";
  alunoData.forumChamados.forEach(ch => {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `<strong>${ch.numero}</strong> - ${ch.titulo} <span>${ch.status}</span>`;
    lista.appendChild(div);
  });
}

// ==== MÉTRICAS ====
function atualizarMetricas() {
  document.getElementById("metric-cursos").textContent = alunoData.cursos.length;
  document.getElementById("metric-horas").textContent = `${alunoData.horasEstudo.toFixed(1)}h`;
  document.getElementById("metric-media").textContent = alunoData.mediaGeral.toFixed(1);
}

// ==== INICIALIZAÇÃO ====
document.addEventListener("DOMContentLoaded", () => {
  renderCursosInscricoes();
  renderMeusCursos();
  renderForum();
  atualizarMetricas();
});
