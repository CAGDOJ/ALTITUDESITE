function abrirAba(id) {
  document.querySelectorAll('.aba').forEach(a => a.classList.remove('ativa'));
  document.getElementById(id).classList.add('ativa');
}

// Mock alunos
const alunos = [
  { ra: '2025001', nome: 'Carlos Júnior', status: 'Ativo' },
  { ra: '2025002', nome: 'Maria Souza', status: 'Inativo' },
  { ra: '2025003', nome: 'João Silva', status: 'Ativo' }
];

function carregarAlunos() {
  const tbody = document.getElementById('tabelaAlunos');
  alunos.forEach(al => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${al.ra}</td><td>${al.nome}</td><td>${al.status}</td>`;
    tbody.appendChild(tr);
  });
}

// Mock despesas
let despesas = [];
function registrarDespesa(e) {
  e.preventDefault();
  const desc = document.getElementById('descDespesa').value;
  const valor = parseFloat(document.getElementById('valorDespesa').value);
  despesas.push({ desc, valor });
  atualizarListaDespesas();
}

function atualizarListaDespesas() {
  const ul = document.getElementById('listaDespesas');
  ul.innerHTML = '';
  despesas.forEach(d => {
    const li = document.createElement('li');
    li.textContent = `${d.desc} - R$ ${d.valor.toFixed(2)}`;
    ul.appendChild(li);
  });
}

// Gráfico receita
function carregarGrafico() {
  const ctx = document.getElementById('graficoReceita');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Jan', 'Fev', 'Mar', 'Abr'],
      datasets: [
        { label: 'Receitas', data: [5000, 6000, 7000, 8000], backgroundColor: '#00509e' },
        { label: 'Despesas', data: [3000, 2500, 4000, 3500], backgroundColor: '#ff4d4d' }
      ]
    }
  });
}

window.onload = () => {
  carregarAlunos();
  carregarGrafico();
};

// Matrículas por Mês
new Chart(document.getElementById('graficoMatriculas'), {
  type: 'line',
  data: {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
    datasets: [{
      label: 'Matrículas',
      data: [120, 150, 180, 170, 200, 210],
      borderColor: '#003366',
      backgroundColor: 'rgba(0,51,102,0.2)',
      fill: true
    }]
  }
});


// Receita x Despesa
new Chart(document.getElementById('graficoFinanceiro'), {
  type: 'bar',
  data: {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
    datasets: [
      { label: 'Receita', data: [45000, 47000, 49000, 51000, 52000, 54000], backgroundColor: '#0077cc' },
      { label: 'Despesa', data: [25000, 26000, 27000, 28000, 30000, 32000], backgroundColor: '#ff9933' }
    ]
  },
  options: { responsive: true }
});


// Cursos Mais Procurados
new Chart(document.getElementById('graficoCursos'), {
  type: 'pie',
  data: {
    labels: ['Engenharia', 'Direito', 'ADM', 'TI', 'Saúde'],
    datasets: [{
      data: [45, 25, 15, 10, 5],
      backgroundColor: ['#003366', '#0077cc', '#00aaff', '#66ccff', '#99ddff']
    }]
  }
});

// -------------------- INDICADOR DE QUALIDADE --------------------
const avaliacoes = [5, 4, 5, 3, 4, 5, 5, 4]; // notas de exemplo
const media = (avaliacoes.reduce((a, b) => a + b, 0) / avaliacoes.length).toFixed(1);

document.querySelector('.card.qualidade h3').textContent = `${media} / 5`;
document.querySelector('.card.qualidade p').textContent = "Qualidade Média";


// -------------------- INDICADOR DE CHAMADOS --------------------
const chamados = {
  abertos: 15,
  andamento: 8,
  fechados: 12
};

const totalChamados = chamados.abertos + chamados.andamento + chamados.fechados;

document.querySelector('.card.chamados h3').textContent = totalChamados;
document.querySelector('.card.chamados .detalhes-chamados').innerHTML = `
  <p>📂 Abertos: ${chamados.abertos}</p>
  <p>🔄 Em Andamento: ${chamados.andamento}</p>
  <p>✅ Fechados: ${chamados.fechados}</p>
`;


