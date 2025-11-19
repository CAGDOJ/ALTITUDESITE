/* ----------------------------------------------------------
   Navegação entre abas
-----------------------------------------------------------*/
function abrirAba(id) {
  document.querySelectorAll('.aba').forEach(a => a.classList.remove('ativa'));
  document.getElementById(id)?.classList.add('ativa');
}

/* ----------------------------------------------------------
   GESTÃO DE ALUNOS
-----------------------------------------------------------*/
let alunos = [
  { ra:'2025001', nome:'CARLOS JUNIOR', email:'carlos@example.com', telefone:'91982116890', status:'ATIVO' },
  { ra:'2025002', nome:'MARIA SOUZA',   email:'maria@example.com',  telefone:'91988887777', status:'INATIVO' },
  { ra:'2025003', nome:'JOAO SILVA',    email:'joao@example.com',   telefone:'91999998888', status:'ATIVO' },
];

const pageAln = { idx:1, size:10 };
let editIndexAln = -1;
const $ = s => document.querySelector(s);

function up(t){
  return (t||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/ç/gi,'c')
    .replace(/[^a-zA-Z\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim().toUpperCase();
}
function maskPhone(v){
  const d=(v||'').replace(/\D/g,'').slice(0,11);
  const has9=d.length>10;
  const ddd=d.slice(0,2), p1=has9?d.slice(2,7):d.slice(2,6), p2=has9?d.slice(7,11):d.slice(6,10);
  return (ddd?`(${ddd}) `:'')+p1+(p2?`-${p2}`:'');
}

function getFilteredAln(){
  const q   = ($('#alnBusca')?.value||'').trim().toUpperCase();
  const st  = $('#alnStatus')?.value || 'TODOS';
  const ord = $('#alnOrdenar')?.value || 'ra-asc';

  let data = alunos.filter(a=>{
    const hit = a.ra.includes(q) || a.nome.includes(q);
    const ok  = (st==='TODOS') || (a.status===st);
    return hit && ok;
  });

  const [campo,dir]=ord.split('-');
  data.sort((a,b)=>{
    const va=campo==='ra'?a.ra:a.nome, vb=campo==='ra'?b.ra:b.nome;
    return dir==='asc' ? (va>vb?1:-1) : (va<vb?1:-1);
  });
  return data;
}

function renderAlunos(){
  const tbody = $('#tabAlunos tbody');
  if(!tbody) return;

  const data = getFilteredAln();
  const totalPages = Math.max(1, Math.ceil(data.length / pageAln.size));
  if(pageAln.idx>totalPages) pageAln.idx = totalPages;

  const start = (pageAln.idx-1)*pageAln.size;
  const rows = data.slice(start, start+pageAln.size);

  tbody.innerHTML = rows.map((a,i)=>`
    <tr>
      <td>${a.ra}</td>
      <td>${a.nome}</td>
      <td>${a.email}</td>
      <td>${maskPhone(a.telefone)}</td>
      <td><span class="badge ${a.status==='ATIVO'?'ativo':'inativo'}">${a.status}</span></td>
      <td>
        <button class="btn-mini" data-act="edit" data-i="${start+i}">Editar</button>
        <button class="btn-mini" data-act="toggle" data-i="${start+i}">${a.status==='ATIVO'?'Inativar':'Ativar'}</button>
      </td>
    </tr>`).join('');
  $('#pgInfo') && ($('#pgInfo').textContent = `${pageAln.idx} / ${totalPages}`);
}

function openModalAln(idx=-1){
  editIndexAln = idx;
  $('#modalTitulo').textContent = idx>=0 ? 'Editar aluno' : 'Novo aluno';
  const a = idx>=0 ? alunos[idx] : { ra:'', nome:'', email:'', telefone:'', status:'ATIVO' };
  $('#fRa').value = a.ra || '';
  $('#fStatus').value = a.status || 'ATIVO';
  $('#fNome').value = a.nome || '';
  $('#fEmail').value = a.email || '';
  $('#fTel').value = maskPhone(a.telefone||'');
  $('#modalAluno').setAttribute('aria-hidden','false');
}
function closeModalAln(){ $('#modalAluno')?.setAttribute('aria-hidden','true'); }

function exportCSVAln(){
  const rows = [['RA','NOME','EMAIL','TELEFONE','STATUS']];
  getFilteredAln().forEach(a=> rows.push([a.ra,a.nome,a.email,maskPhone(a.telefone),a.status]));
  const csv = rows.map(r=>r.join(';')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='alunos.csv'; a.click();
}

function carregarAlunos(){
  if($('#alnBusca')){ // wire uma única vez
    $('#alnBusca').addEventListener('input', ()=>{ pageAln.idx=1; renderAlunos(); });
    $('#alnStatus').addEventListener('change', ()=>{ pageAln.idx=1; renderAlunos(); });
    $('#alnOrdenar').addEventListener('change', ()=>{ pageAln.idx=1; renderAlunos(); });

    $('#pgPrev').addEventListener('click', ()=>{ if(pageAln.idx>1){ pageAln.idx--; renderAlunos(); } });
    $('#pgNext').addEventListener('click', ()=>{ pageAln.idx++; renderAlunos(); });

    $('#alnExportar').addEventListener('click', exportCSVAln);
    $('#alnNovo').addEventListener('click', ()=> openModalAln(-1));
    $('#btnCancelar').addEventListener('click', closeModalAln);

    $('#tabAlunos').addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button'); if(!btn) return;
      const idx = parseInt(btn.dataset.i,10); const act = btn.dataset.act;
      if(Number.isNaN(idx)) return;
      if(act==='edit'){ openModalAln(idx); }
      if(act==='toggle'){ alunos[idx].status = alunos[idx].status==='ATIVO'?'INATIVO':'ATIVO'; renderAlunos(); }
    });

    $('#formAluno').addEventListener('submit', (e)=>{
      e.preventDefault();
      const payload = {
        ra: $('#fRa').value || gerarRaLocal(),
        nome: up($('#fNome').value),
        email: $('#fEmail').value.trim().toLowerCase(),
        telefone: ($('#fTel').value||'').replace(/\D/g,''),
        status: $('#fStatus').value
      };
      if(editIndexAln>=0){ alunos[editIndexAln] = payload; } else { alunos.push(payload); }
      closeModalAln(); renderAlunos();
    });

    $('#fTel').addEventListener('input', e=> e.target.value = maskPhone(e.target.value));
  }
  renderAlunos();
}

function gerarRaLocal(){
  const ano = new Date().getFullYear().toString();
  const max = alunos.filter(a=>a.ra.startsWith(ano))
                    .map(a=>parseInt(a.ra.slice(4),10))
                    .reduce((m,v)=>isNaN(v)?m:Math.max(m,v),0);
  return ano + String(max+1);
}

/* ----------------------------------------------------------
   DASHBOARD (gráficos + indicadores) – com guardas
-----------------------------------------------------------*/
document.addEventListener('DOMContentLoaded', ()=> {
  const gm = document.getElementById('graficoMatriculas');
  if (gm) new Chart(gm, {
    type: 'line',
    data: {
      labels: ['Jan','Fev','Mar','Abr','Mai','Jun'],
      datasets: [{
        label: 'Matrículas',
        data: [120,150,180,170,200,210],
        borderColor: '#003366',
        backgroundColor: 'rgba(0,51,102,0.2)',
        fill: true
      }]
    }
  });

  const gf = document.getElementById('graficoFinanceiro');
  if (gf) new Chart(gf, {
    type: 'bar',
    data: {
      labels: ['Jan','Fev','Mar','Abr','Mai','Jun'],
      datasets: [
        { label:'Receita', data:[45000,47000,49000,51000,52000,54000], backgroundColor:'#0077cc' },
        { label:'Despesa', data:[25000,26000,27000,28000,30000,32000], backgroundColor:'#ff9933' }
      ]
    },
    options:{ responsive:true }
  });

  const gc = document.getElementById('graficoCursos');
  if (gc) new Chart(gc, {
    type: 'pie',
    data: {
      labels: ['Engenharia','Direito','ADM','TI','Saúde'],
      datasets: [{ data:[45,25,15,10,5], backgroundColor:['#003366','#0077cc','#00aaff','#66ccff','#99ddff'] }]
    }
  });

  const cardQual = document.querySelector('.card.qualidade h3');
  const cardQualP = document.querySelector('.card.qualidade p');
  if (cardQual && cardQualP) {
    const avaliacoes = [5,4,5,3,4,5,5,4];
    const media = (avaliacoes.reduce((a,b)=>a+b,0)/avaliacoes.length).toFixed(1);
    cardQual.textContent = `${media} / 5`;
    cardQualP.textContent = 'Qualidade Média';
  }

  const cardCham = document.querySelector('.card.chamados');
  if (cardCham) {
    const chamados = { abertos:15, andamento:8, fechados:12 };
    const totalChamados = chamados.abertos + chamados.andamento + chamados.fechados;
    cardCham.querySelector('h3').textContent = totalChamados;
    cardCham.querySelector('.detalhes-chamados').innerHTML =
      `<p>📂 Abertos: ${chamados.abertos}</p>
       <p>🔄 Em Andamento: ${chamados.andamento}</p>
       <p>✅ Fechados: ${chamados.fechados}</p>`;
  }

  carregarAlunos(); // monta a aba de alunos ao carregar
});

/* ----------------------------------------------------------
   RELATÓRIOS FINANCEIROS
-----------------------------------------------------------*/
const BRL = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dSub = n => { const d = new Date(); d.setDate(d.getDate()-n); return d; };

const receitas = [
  { data:dSub( 3), origem:'Mensalidades', valor:450.00 },
  { data:dSub(15), origem:'Mensalidades', valor:900.00 },
  { data:dSub(40), origem:'Matrículas',   valor:300.00 },
  { data:dSub(55), origem:'Mensalidades', valor:450.00 },
  { data:dSub(65), origem:'Material',     valor:120.00 },
  { data:dSub(85), origem:'Mensalidades', valor:900.00 }
];
let despesasFin = [
  { data:dSub( 2), tipo:'Despesa', desc:'Energia',  valor:250.00 },
  { data:dSub(20), tipo:'Despesa', desc:'Água',     valor:140.00 },
  { data:dSub(47), tipo:'Despesa', desc:'Serviços', valor:500.00 }
];

let chartFluxo, chartReceita;

function filtrarPeriodo(dias){
  const limite = new Date(); limite.setDate(limite.getDate()-dias);
  return {
    r: receitas.filter(x => x.data >= limite),
    d: despesasFin.filter(x => x.data >= limite)
  };
}

function atualizarRelatorios(dias=30){
  const cardFluxo = document.getElementById('chartFluxo');
  const cardRecei = document.getElementById('chartReceita');
  if(!cardFluxo || !cardRecei) return; // aba não está nesta tela

  const { r, d } = filtrarPeriodo(dias);
  const totalR = r.reduce((a,b)=>a+b.valor,0);
  const totalD = d.reduce((a,b)=>a+b.valor,0);
  const saldo  = totalR - totalD;

  const inad = 0.08; // mock
  const mesAtual = (new Date()).getMonth();
  const receitaMes = r.filter(x=>x.data.getMonth()===mesAtual).reduce((a,b)=>a+b.valor,0);
  const ticket = r.length ? (receitaMes / r.length) : 0;

  // KPIs
  $('#kSaldo')       && ( $('#kSaldo').textContent      = BRL(saldo) );
  $('#kInad')        && ( $('#kInad').textContent       = (inad*100).toFixed(1)+'%' );
  $('#kReceitaMes')  && ( $('#kReceitaMes').textContent = BRL(receitaMes) );
  $('#kTicket')      && ( $('#kTicket').textContent     = BRL(ticket) );

  // Tabela
  const tbody = document.querySelector('#tabMov tbody');
  if (tbody){
    tbody.innerHTML = '';
    const linhas = [
      ...r.map(x=>({data:x.data,tipo:'Receita',desc:(x.desc||x.origem),valor:x.valor})),
      ...d
    ].sort((a,b)=>b.data - a.data);
    linhas.forEach(m=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.data.toLocaleDateString('pt-BR')}</td>
        <td>${m.tipo || 'Despesa'}</td>
        <td>${m.desc || m.origem}</td>
        <td>${BRL(m.valor)}</td>`;
      tbody.appendChild(tr);
    });
  }

  // Gráfico Fluxo (mês)
  const fmtMes = x => new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(x).replace('.','');
  const meses = [...new Set([...r,...d].map(x=>fmtMes(x.data)))];
  const recMes  = meses.map(m=> r.filter(x=>fmtMes(x.data)===m).reduce((a,b)=>a+b.valor,0));
  const despMes = meses.map(m=> d.filter(x=>fmtMes(x.data)===m).reduce((a,b)=>a+b.valor,0));

  if (chartFluxo) chartFluxo.destroy();
  chartFluxo = new Chart(cardFluxo, {
    type:'bar',
    data:{ labels: meses, datasets:[
      { label:'Receitas', data:recMes,  backgroundColor:'#16a34a' },
      { label:'Despesas', data:despMes, backgroundColor:'#ef4444' }
    ]},
    options:{ responsive:true, plugins:{ legend:{ position:'bottom' } } }
  });

  // Rosca
  const porOrigem = {};
  r.forEach(x => porOrigem[x.origem] = (porOrigem[x.origem]||0) + x.valor);
  if (chartReceita) chartReceita.destroy();
  chartReceita = new Chart(cardRecei, {
    type:'doughnut',
    data:{ labels:Object.keys(porOrigem), datasets:[{ data:Object.values(porOrigem) }] },
    options:{ plugins:{ legend:{ position:'bottom' } } }
  });
}

/* ---- Listeners da aba Relatórios (com guarda) ---- */
document.addEventListener('DOMContentLoaded', ()=>{
  const filtro = document.getElementById('filtroPeriodo');
  const fDesp  = document.getElementById('formDespesa');
  const fRec   = document.getElementById('formReceita');
  const btnExp = document.getElementById('btnExportar');

  if (filtro) filtro.addEventListener('change', e=> atualizarRelatorios(parseInt(e.target.value,10)));

  if (fDesp) fDesp.addEventListener('submit', e=>{
    e.preventDefault();
    const data  = new Date(document.getElementById('dtDespesa').value);
    const desc  = document.getElementById('descDespesa').value.trim();
    const valor = parseFloat(document.getElementById('valorDespesa').value);
    if (!isNaN(valor)) {
      despesasFin.push({ data, tipo:'Despesa', desc, valor });
      atualizarRelatorios(parseInt((filtro?.value||'30'),10));
      e.target.reset();
    }
  });

  if (fRec) fRec.addEventListener('submit', e=>{
    e.preventDefault();
    const data   = new Date(document.getElementById('dtReceita').value);
    const desc   = document.getElementById('descReceita').value.trim();
    const valor  = parseFloat(document.getElementById('valorReceita').value);
    const origem = document.getElementById('origemReceita').value;
    if (!isNaN(valor)) {
      receitas.push({ data, origem, valor, desc });
      atualizarRelatorios(parseInt((filtro?.value||'30'),10));
      e.target.reset();
    }
  });

  if (btnExp) btnExp.addEventListener('click', ()=>{
    const tbody = document.querySelector('#tabMov tbody'); if(!tbody) return;
    const rows = [['Data','Tipo','Descrição','Valor']];
    tbody.querySelectorAll('tr').forEach(tr=>{
      rows.push([...tr.children].map(td=>td.textContent));
    });
    const csv = rows.map(r=>r.join(';')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'relatorio_financeiro.csv';
    a.click();
  });

  // primeira renderização se a aba existir
  if (document.getElementById('chartFluxo')) atualizarRelatorios(30);
});

/* ======================= GESTÃO DE CURSOS (GC_) ======================= */
/*
  O que esta seção faz:

  1) Lista os cursos na tela "Gestão de Cursos" (#cursos):
      - Código, título, área, quantos materiais 📚 e provas 📝
      - Botões: Editar / Módulos / Visualizar / Duplicar / Excluir

  2) Modal de curso (novo / editar):
      - Usa o formulário já existente (#modalCurso, #formCurso, etc.)

  3) Painel de MÓDULOS do curso:
      - Abre quando clica no botão "Módulos" (botão com classe .gc-mods)
      - Lista e permite cadastrar:
          • Materiais (PDF, link, vídeo etc)
          • Provas / Questionários
          • Questões das provas (máx. 10 por prova)

  ⚠ IMPORTANTE:
  - Não muda layout, não cria HTML novo via JS.
  - Ele só manipula os elementos que JÁ existem na página.
  - Se algum ID abaixo não existir no seu HTML, esse pedaço simplesmente
    não roda (tem `if (!element) return` em tudo que é crítico).
*/

(function () {
  // ---------- Atalhos básicos ----------
  const $  = (s, sc = document) => sc.querySelector(s);
  const $$ = (s, sc = document) => Array.from(sc.querySelectorAll(s));

  // Bucket das capas no Supabase
  const BUCKET_CAPAS = 'capas_cursos';
  // Áreas fixas para o select
  const AREAS_FIXAS  = ['TECNOLOGIA', 'HUMANAS', 'SAÚDE', 'ADMINISTRAÇÃO', 'ENGENHARIA'];

  // Estado em memória (somente para a tela de cursos)
  const GC = {
    cursos: [],        // lista atual de cursos com stats
    editId: null,      // ID do curso que está sendo editado (null = novo)
    cursoAtual: null,  // curso selecionado no painel de módulos
    provaAtualId: null // id da prova que está aberta no modal de questões
  };

  // ---------- Funções utilitárias ----------
  const toUp   = (t) => (t || '').trim().toUpperCase();
  const fmtBool = (b) => (b ? 'SIM' : 'NÃO');
  const thumb   = (url) => url || 'https://via.placeholder.com/64x40?text=CAPA';

  async function uploadCapa(arquivo) {
    if (!arquivo) return null;
    const nomeArquivo = `${Date.now()}-${arquivo.name}`.replace(/\s+/g, '_');

    const { error: upErr } = await sb.storage
      .from(BUCKET_CAPAS)
      .upload(nomeArquivo, arquivo, { upsert: true });

    if (upErr) throw upErr;

    const { data } = sb.storage
      .from(BUCKET_CAPAS)
      .getPublicUrl(nomeArquivo);

    return data.publicUrl; // URL pública da capa
  }

  // ---------- Consulta cursos + contadores de materiais/provas ----------
  async function fetchCursosComStats(filtroArea = 'TODAS') {
    // 1) Cursos
    let q = sb.from('cursos')
      .select('*')
      .order('id', { ascending: false });

    if (filtroArea && filtroArea !== 'TODAS') {
      q = q.eq('categoria', filtroArea);
    }

    const { data: cursos, error } = await q;
    if (error) throw error;
    if (!cursos || !cursos.length) return [];

    // 2) Busca materiais e provas só para contar por curso
    const ids = cursos.map(c => c.id);

    let mats = [], provas = [];
    const m = await sb.from('materiais').select('id,curso_id').in('curso_id', ids);
    if (!m.error && m.data) mats = m.data;

    const p = await sb.from('provas').select('id,curso_id').in('curso_id', ids);
    if (!p.error && p.data) provas = p.data;

    const countBy = (arr) =>
      arr.reduce((acc, x) => {
        acc[x.curso_id] = (acc[x.curso_id] || 0) + 1;
        return acc;
      }, {});

    const matsCount   = countBy(mats);
    const provasCount = countBy(provas);

    return cursos.map(c => ({
      ...c,
      total_materiais: matsCount[c.id]   || 0,
      total_provas:    provasCount[c.id] || 0
    }));
  }

  // ---------- Renderização da área / selects ----------
  function renderAreasSelects() {
    // Filtro de área no topo
    const filtro = $('#curFiltroArea');
    if (filtro) {
      const atual = filtro.value || 'TODAS';
      filtro.innerHTML = ['TODAS', ...AREAS_FIXAS]
        .map(a => `<option value="${a}">${a}</option>`)
        .join('');
      filtro.value = atual;
    }

    // Select de área no formulário do curso
    const areaForm = $('#fCursoArea');
    if (areaForm) {
      areaForm.innerHTML = AREAS_FIXAS
        .map(a => `<option value="${a}">${a}</option>`)
        .join('');
    }
  }

  // ---------- Renderização da tabela de cursos ----------
  function renderTabelaCursos() {
    const tbody = $('#tabCursos tbody');
    if (!tbody) return; // tela não está presente

    tbody.innerHTML = GC.cursos.map(c => `
      <tr data-id="${c.id}">
        <!-- Código -->
        <td class="col-id">${c.id}</td>

        <!-- Curso (capa + título) -->
        <td class="col-curso">
          <div class="curso-info">
            <img src="${thumb(c.capa_url)}" class="curso-thumb" alt="Capa do curso">
            <div class="curso-textos">
              <div class="curso-titulo">${c.titulo}</div>
              <div class="curso-sub">${c.carga_horaria || 0}h · ${c.categoria || '-'}</div>
            </div>
          </div>
        </td>

        <!-- Área -->
        <td class="col-area">${c.categoria || '-'}</td>

        <!-- Módulos (resumo de materiais e provas) -->
        <td class="col-modulos">
          <span title="Materiais cadastrados">📚 ${c.total_materiais}</span>
          <span title="Provas / questionários">📝 ${c.total_provas}</span>
        </td>

        <!-- Publicado -->
        <td class="col-pub">
          <span class="badge ${c.publicado ? 'pub' : 'nop'}">
            ${fmtBool(c.publicado)}
          </span>
        </td>

        <!-- Ações -->
        <td class="col-acoes">
          <button class="btn-mini gc-edit" title="Editar curso">✏️</button>
          <button class="btn-mini gc-mods" title="Gerenciar módulos, materiais e provas">📦</button>
          <button class="btn-mini gc-prev" title="Visualizar no portal do aluno">👁️</button>
          <button class="btn-mini gc-dup"  title="Duplicar curso">📋</button>
          <button class="btn-mini gc-del"  title="Excluir curso">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  // ---------- CRUD de cursos ----------
  async function carregarCursos() {
    // se a tabela de cursos não existe nesta página, não faz nada
    if (!$('#tabCursos')) return;

    const area = $('#curFiltroArea')?.value || 'TODAS';
    try {
      GC.cursos = await fetchCursosComStats(area);
      renderTabelaCursos();
    } catch (err) {
      console.error('Erro ao carregar cursos:', err);
      alert('Erro ao carregar cursos. Veja o console para detalhes.');
    }
  }

  function abrirModalCursoNovo() {
    GC.editId = null;
    $('#tituloCurso').textContent = 'Novo curso';

    $('#fCursoNome').value  = '';
    $('#fCursoArea').value  = AREAS_FIXAS[0] || 'TECNOLOGIA';
    $('#fCursoHoras').value = '';
    $('#fCursoDesc').value  = '';
    $('#fCursoPub').value   = 'NAO';
    $('#fCursoCapa').value  = '';

    $('#modalCurso')?.setAttribute('aria-hidden', 'false');
  }

  function abrirModalCursoEditar(id) {
    const c = GC.cursos.find(x => x.id === id);
    if (!c) return;

    GC.editId = id;
    $('#tituloCurso').textContent = `Editar curso #${id}`;

    $('#fCursoNome').value  = c.titulo || '';
    $('#fCursoArea').value  = toUp(c.categoria || AREAS_FIXAS[0]);
    $('#fCursoHoras').value = c.carga_horaria || 0;
    $('#fCursoDesc').value  = c.descricao || '';
    $('#fCursoPub').value   = c.publicado ? 'SIM' : 'NAO';
    $('#fCursoCapa').value  = '';

    $('#modalCurso')?.setAttribute('aria-hidden', 'false');
  }

  async function salvarCurso(ev) {
    ev.preventDefault();

    const nome   = $('#fCursoNome')?.value?.trim();
    const area   = toUp($('#fCursoArea')?.value || 'TECNOLOGIA');
    const horas  = parseInt($('#fCursoHoras')?.value, 10) || 0;
    const desc   = $('#fCursoDesc')?.value?.trim() || '';
    const publi  = $('#fCursoPub')?.value === 'SIM';
    const arquivo= $('#fCursoCapa')?.files[0] || null;

    if (!nome) {
      alert('Informe o nome do curso.');
      return;
    }

    // Impede cursos com o mesmo título (case-insensitive),
    // mas permite o mesmo nome se for o próprio curso em edição.
    const { data: dupList, error: dupErr } = await sb
      .from('cursos')
      .select('id,titulo')
      .ilike('titulo', nome);

    if (dupErr) console.warn(dupErr);

    const existeOutro = (dupList || []).some(row =>
      row.titulo.trim().toLowerCase() === nome.toLowerCase() &&
      row.id !== GC.editId
    );
    if (existeOutro) {
      alert('Já existe um curso com esse nome. Escolha outro título.');
      return;
    }

    try {
      // upload da capa se o usuário escolheu arquivo
      let urlCapa = null;
      if (arquivo) {
        urlCapa = await uploadCapa(arquivo);
      }

      const payloadBase = {
        titulo      : nome,
        categoria   : area,
        carga_horaria: horas,
        descricao   : desc,
        publicado   : publi
      };
      if (urlCapa) payloadBase.capa_url = urlCapa;

      let salvo;
      if (GC.editId) {
        // UPDATE
        const { data, error } = await sb
          .from('cursos')
          .update(payloadBase)
          .eq('id', GC.editId)
          .select()
          .single();
        if (error) throw error;
        salvo = data;
      } else {
        // INSERT
        const payloadNew = { ...payloadBase, criado_em: new Date().toISOString() };
        const { data, error } = await sb
          .from('cursos')
          .insert(payloadNew)
          .select()
          .single();
        if (error) throw error;
        salvo = data;
      }

      alert(`✅ Curso "${salvo.titulo}" salvo com sucesso!`);
      $('#modalCurso')?.setAttribute('aria-hidden', 'true');
      $('#formCurso')?.reset();
      await carregarCursos();
    } catch (err) {
      console.error(err);
      alert('❌ Erro ao salvar curso: ' + err.message);
    }
  }

  async function excluirCurso(id) {
    const curso = GC.cursos.find(c => c.id === id);
    if (!curso) return;

    const ok = confirm(`Excluir o curso "${curso.titulo}"?\nEssa ação não pode ser desfeita.`);
    if (!ok) return;

    try {
      // Remove filhos (materiais, provas e questões)
      const { data: provas } = await sb.from('provas').select('id').eq('curso_id', id);
      if (provas && provas.length) {
        const provaIds = provas.map(p => p.id);
        await sb.from('questoes').delete().in('prova_id', provaIds);
        await sb.from('provas').delete().eq('curso_id', id);
      }
      await sb.from('materiais').delete().eq('curso_id', id);

      const { error } = await sb.from('cursos').delete().eq('id', id);
      if (error) throw error;

      alert('✅ Curso excluído com sucesso.');
      await carregarCursos();
    } catch (err) {
      console.error(err);
      alert('❌ Não foi possível excluir o curso. Veja o console para detalhes.');
    }
  }

  async function duplicarCurso(id) {
    const curso = GC.cursos.find(c => c.id === id);
    if (!curso) return;

    try {
      // 1) duplica o curso
      const base = {
        titulo       : `${curso.titulo} (CÓPIA)`,
        descricao    : curso.descricao,
        categoria    : curso.categoria,
        carga_horaria: curso.carga_horaria,
        capa_url     : curso.capa_url,
        publicado    : false,
        criado_em    : new Date().toISOString()
      };
      const { data: novoCurso, error: cErr } = await sb
        .from('cursos')
        .insert(base)
        .select()
        .single();
      if (cErr) throw cErr;

      // 2) duplica materiais
      const mats = await sb.from('materiais').select('*').eq('curso_id', id);
      if (!mats.error && mats.data && mats.data.length) {
        const novos = mats.data.map(m => ({
          curso_id: novoCurso.id,
          tipo    : m.tipo,
          titulo  : m.titulo,
          url     : m.url,
          criado_em: new Date().toISOString()
        }));
        await sb.from('materiais').insert(novos);
      }

      // 3) duplica provas + questões
      const prs = await sb.from('provas').select('*').eq('curso_id', id);
      if (!prs.error && prs.data && prs.data.length) {
        for (const p of prs.data) {
          const { data: np } = await sb
            .from('provas')
            .insert({
              curso_id: novoCurso.id,
              titulo  : p.titulo,
              criado_em: new Date().toISOString()
            })
            .select()
            .single();

          const qs = await sb.from('questoes').select('*').eq('prova_id', p.id);
          if (!qs.error && qs.data && qs.data.length) {
            const novasQ = qs.data.map(q => ({
              prova_id : np.id,
              enunciado: q.enunciado,
              a: q.a, b: q.b, c: q.c, d: q.d,
              correta  : q.correta
            }));
            await sb.from('questoes').insert(novasQ);
          }
        }
      }

      alert(`✅ Curso duplicado: "${novoCurso.titulo}"`);
      await carregarCursos();
    } catch (err) {
      console.error(err);
      alert('❌ Erro ao duplicar curso: ' + err.message);
    }
  }

  // =====================================================================
  //  PAINEL DE MÓDULOS: materiais, provas e questões
  // =====================================================================

  // --- abrir/fechar painel de módulos (curso) ---
  async function abrirPainelModulos(id) {
    const curso = GC.cursos.find(c => c.id === id);
    const modal = $('#modalModulos');
    if (!curso || !modal) {
      alert('Painel de módulos não está disponível nesta página.');
      return;
    }

    GC.cursoAtual = curso;
    $('#mmCursoNome').textContent =
      `${curso.titulo} · ${curso.categoria || 'SEM ÁREA'}`;

    await carregarMateriais();
    await carregarProvas();

    modal.setAttribute('aria-hidden', 'false');
  }

  function fecharPainelModulos() {
    $('#modalModulos')?.setAttribute('aria-hidden', 'true');
    GC.cursoAtual  = null;
    GC.provaAtualId = null;
  }

  // --- Materiais do curso ---
  async function carregarMateriais() {
    const tbody = $('#tabMateriais tbody');
    if (!tbody || !GC.cursoAtual) return;

    const { data, error } = await sb
      .from('materiais')
      .select('*')
      .eq('curso_id', GC.cursoAtual.id)
      .order('id');

    if (error) {
      console.error(error);
      return;
    }

    tbody.innerHTML = (data || []).map(m => `
      <tr data-id="${m.id}">
        <td>${m.tipo}</td>
        <td>${m.titulo || '-'}</td>
        <td>${m.url || '-'}</td>
        <td>
          <button class="btn-mini mat-del">Remover</button>
        </td>
      </tr>
    `).join('');
  }

  async function adicionarMaterial(ev) {
    ev.preventDefault();
    if (!GC.cursoAtual) return;

    const tipo   = $('#fMatTipo')?.value || 'PDF';
    const titulo = $('#fMatTitulo')?.value?.trim() || '';
    const url    = $('#fMatUrl')?.value?.trim() || '';

    if (!titulo) {
      alert('Informe o título do material.');
      return;
    }

    const { error } = await sb.from('materiais').insert({
      curso_id: GC.cursoAtual.id,
      tipo, titulo, url,
      criado_em: new Date().toISOString()
    });

    if (error) {
      alert('Erro ao adicionar material: ' + error.message);
      return;
    }

    $('#formMaterial')?.reset();
    carregarMateriais();
  }

  async function removerMaterial(id) {
    const ok = confirm('Remover este material?');
    if (!ok) return;

    await sb.from('materiais').delete().eq('id', id);
    carregarMateriais();
  }

  // --- Provas / questionários ---
  async function carregarProvas() {
    const tbody = $('#tabProvas tbody');
    if (!tbody || !GC.cursoAtual) return;

    const { data, error } = await sb
      .from('provas')
      .select('*')
      .eq('curso_id', GC.cursoAtual.id)
      .order('id');

    if (error) {
      console.error(error);
      return;
    }

    tbody.innerHTML = (data || []).map(p => `
      <tr data-id="${p.id}">
        <td>${p.id}</td>
        <td>${p.titulo}</td>
        <td>
          <button class="btn-mini prova-q">Questões</button>
          <button class="btn-mini prova-del">Excluir</button>
        </td>
      </tr>
    `).join('');
  }

  async function adicionarProva(ev) {
    ev.preventDefault();
    if (!GC.cursoAtual) return;

    const titulo = $('#fProvaTitulo')?.value?.trim();
    if (!titulo) {
      alert('Informe o título da prova.');
      return;
    }

    const { error } = await sb.from('provas').insert({
      curso_id : GC.cursoAtual.id,
      titulo   : titulo,
      criado_em: new Date().toISOString()
    });

    if (error) {
      alert('Erro ao criar prova: ' + error.message);
      return;
    }

    $('#formProva')?.reset();
    carregarProvas();
  }

  async function excluirProva(id) {
    const ok = confirm('Excluir esta prova e todas as questões?');
    if (!ok) return;

    await sb.from('questoes').delete().eq('prova_id', id);
    await sb.from('provas').delete().eq('id', id);
    carregarProvas();
  }

  // --- Questões da prova ---
  async function abrirQuestoes(provaId) {
    const modal = $('#modalQuestoes');
    if (!modal) {
      alert('Modal de questões não encontrado no HTML.');
      return;
    }

    GC.provaAtualId = provaId;

    // título da prova no modal
    const { data: prova } = await sb
      .from('provas')
      .select('titulo')
      .eq('id', provaId)
      .single();

    $('#qModuloTitulo').textContent = prova?.titulo || 'Prova';

    await carregarQuestoes();
    modal.setAttribute('aria-hidden', 'false');
  }

  function fecharQuestoes() {
    $('#modalQuestoes')?.setAttribute('aria-hidden', 'true');
    GC.provaAtualId = null;
  }

  async function carregarQuestoes() {
    const tbody = $('#tabQuestoes tbody');
    if (!tbody || !GC.provaAtualId) return;

    const { data, error } = await sb
      .from('questoes')
      .select('*')
      .eq('prova_id', GC.provaAtualId)
      .order('id');

    if (error) {
      console.error(error);
      return;
    }

    tbody.innerHTML = (data || []).map((q, idx) => `
      <tr data-id="${q.id}">
        <td>${idx + 1}</td>
        <td>${q.enunciado}</td>
        <td>${q.correta}</td>
        <td><button class="btn-mini q-del">Remover</button></td>
      </tr>
    `).join('');
  }

  async function adicionarQuestao(ev) {
    ev.preventDefault();
    if (!GC.provaAtualId) return;

    // Limite de 10 questões por prova
    const countRes = await sb
      .from('questoes')
      .select('id', { count: 'exact', head: true })
      .eq('prova_id', GC.provaAtualId);

    if ((countRes.count || 0) >= 10) {
      alert('Esta prova já possui 10 questões. Limite atingido.');
      return;
    }

    const enunciado = $('#fPergunta')?.value?.trim();
    const A = $('#fA')?.value?.trim();
    const B = $('#fB')?.value?.trim();
    const C = $('#fC')?.value?.trim();
    const D = $('#fD')?.value?.trim();
    const correta  = $('#fCorreta')?.value || 'A';

    if (!enunciado || !A || !B || !C || !D) {
      alert('Preencha a pergunta e todas as alternativas (A, B, C e D).');
      return;
    }

    const { error } = await sb.from('questoes').insert({
      prova_id : GC.provaAtualId,
      enunciado,
      a: A, b: B, c: C, d: D,
      correta
    });

    if (error) {
      alert('Erro ao salvar questão: ' + error.message);
      return;
    }

    $('#formQuestao')?.reset();
    carregarQuestoes();
  }

  async function removerQuestao(id) {
    await sb.from('questoes').delete().eq('id', id);
    carregarQuestoes();
  }

  // =====================================================================
  //  WIRING (ligando tudo nos botões da tela)
  // =====================================================================
  function wireCursosUI() {
    const wrap = $('#cursos');
    if (!wrap) return; // não está na tela de cursos

    renderAreasSelects();

    // Filtro por área
    $('#curFiltroArea')?.addEventListener('change', carregarCursos);

    // Botões de topo
    $('#btnNovoCurso')?.addEventListener('click', abrirModalCursoNovo);
    $('#fecharCurso')?.addEventListener('click', () =>
      $('#modalCurso')?.setAttribute('aria-hidden', 'true')
    );
    $('#formCurso')?.addEventListener('submit', salvarCurso);

    // Tabela de cursos (ações por linha)
    $('#tabCursos')?.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (!tr) return;
      const id = parseInt(tr.dataset.id, 10);
      if (Number.isNaN(id)) return;

      if (ev.target.classList.contains('gc-edit')) return abrirModalCursoEditar(id);
      if (ev.target.classList.contains('gc-del'))  return excluirCurso(id);
      if (ev.target.classList.contains('gc-dup'))  return duplicarCurso(id);
      if (ev.target.classList.contains('gc-prev')) return window.open(`11-portaldoaluno.html?curso=${id}`, '_blank');
      if (ev.target.classList.contains('gc-mods')) return abrirPainelModulos(id);
    });

    // Painel de módulos (curso)
    $('#fecharModulos')?.addEventListener('click', fecharPainelModulos);
    $('#formMaterial')?.addEventListener('submit', adicionarMaterial);
    $('#formProva')?.addEventListener('submit', adicionarProva);

    // Remoção de material / provas via delegação
    $('#tabMateriais')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.mat-del');
      if (!btn) return;
      const tr = btn.closest('tr[data-id]');
      const id = parseInt(tr.dataset.id, 10);
      if (!Number.isNaN(id)) removerMaterial(id);
    });

    $('#tabProvas')?.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (!tr) return;
      const id = parseInt(tr.dataset.id, 10);
      if (Number.isNaN(id)) return;

      if (ev.target.classList.contains('prova-del')) return excluirProva(id);
      if (ev.target.classList.contains('prova-q'))   return abrirQuestoes(id);
    });

    // Questões
    $('#fecharQuestoes')?.addEventListener('click', fecharQuestoes);
    $('#formQuestao')?.addEventListener('submit', adicionarQuestao);
    $('#tabQuestoes')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.q-del');
      if (!btn) return;
      const tr  = btn.closest('tr[data-id]');
      const id  = parseInt(tr.dataset.id, 10);
      if (!Number.isNaN(id)) removerQuestao(id);
    });

    // Primeira carga da tabela de cursos
    carregarCursos();
  }

  // Chama o wiring quando o DOM estiver pronto
  document.addEventListener('DOMContentLoaded', wireCursosUI);
})();
/* ===================== /GESTÃO DE CURSOS (GC_) ======================= */




/* ======================= GESTÃO DE USUÁRIOS (GU_) ======================= */
(function(){
  // Mock em memória; depois plugar no banco
  let GU_usuarios = [
    { id:'U001', nome:'ADMIN GERAL', email:'admin@altitude.com', telefone:'', cargo:'GESTOR', nivel:4, status:'ATIVO',
      acessos:{ colab:true, prof:true, coord:true, gestor:true } }
  ];
  let GU_editIdx = -1;

  const $q = s => document.querySelector(s);
  const GU_up = t => (t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ç/gi,'c').replace(/[^a-zA-Z\s]/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
  const GU_maskPhone = v => { const d=(v||'').replace(/\D/g,'').slice(0,11); const h=d.length>10; const ddd=d.slice(0,2), p1=h?d.slice(2,7):d.slice(2,6), p2=h?d.slice(7,11):d.slice(6,10); return (ddd?`(${ddd}) `:'')+p1+(p2?`-${p2}`:''); };

  const GU_cargoNivel = { COLABORADOR:1, PROFESSOR:2, COORDENADOR:3, GESTOR:4 };
  const GU_permissoesNivel = {
    1:['Matrículas: realizar novas','Matrículas: gerenciar as próprias'],
    2:['Tudo do nível 1','Cursos: criar/editar','Materiais e avaliações'],
    3:['Tudo do nível 2','Chamados: gerenciar','Solicitações: certificados/históricos/liberações'],
    4:['Tudo do nível 3','Administração global de todos os módulos']
  };
  function GU_getPermissoes(nv){ const n=Math.max(1,Math.min(4,parseInt(nv,10)||1)); const out=[]; for(let i=1;i<=n;i++) GU_permissoesNivel[i].forEach(p=>out.push(p)); return out; }
  function GU_renderPermissoes(nv){ const ul=$q('#guPermissoes'); if(!ul) return; ul.innerHTML = GU_getPermissoes(nv).map(p=>`<li>• ${p}</li>`).join(''); }

  function GU_renderUsuarios(){
    const tbody = $q('#tabUsuarios tbody'); if(!tbody) return;
    const q = ($q('#guBusca')?.value||'').trim().toUpperCase();
    const cargo = $q('#guFiltroCargo')?.value || 'TODOS';
    const status = $q('#guFiltroStatus')?.value || 'TODOS';
    const lista = GU_usuarios.filter(u=>{
      const okBusca = u.nome.includes(q) || u.email.toUpperCase().includes(q);
      const okCargo = cargo==='TODOS' || u.cargo===cargo;
      const okStatus = status==='TODOS' || u.status===status;
      return okBusca && okCargo && okStatus;
    });
    tbody.innerHTML = lista.map((u,i)=>`
      <tr>
        <td>${u.id||'-'}</td>
        <td>${u.nome}</td>
        <td>${u.email}</td>
        <td><span class="role-badge ${u.cargo}">${u.cargo}</span></td>
        <td><span class="nivel-badge">${u.nivel}</span></td>
        <td><span class="badge ${u.status==='ATIVO'?'ativo':'inativo'}">${u.status}</span></td>
        <td>
          <button class="btn-mini" data-gu="edit" data-i="${i}">Editar</button>
          <button class="btn-mini" data-gu="toggle" data-i="${i}">${u.status==='ATIVO'?'Inativar':'Ativar'}</button>
          <button class="btn-mini" data-gu="reset" data-i="${i}">Reset senha</button>
          <button class="btn-mini" data-gu="del" data-i="${i}">Excluir</button>
        </td>
      </tr>`).join('');
  }

  function GU_openModal(idx=-1){
    GU_editIdx = idx;
    $q('#guTitulo').textContent = idx>=0 ? 'Editar usuário' : 'Novo usuário';
    const u = idx>=0 ? GU_usuarios[idx] : { id:'', nome:'', email:'', telefone:'', cargo:'COLABORADOR', nivel:1, status:'ATIVO', acessos:{colab:false,prof:false,coord:false,gestor:false} };
    $q('#guId').value    = u.id || '';
    $q('#guNome').value  = u.nome || '';
    $q('#guEmail').value = u.email || '';
    $q('#guTel').value   = GU_maskPhone(u.telefone || '');
    $q('#guCargo').value = u.cargo || 'COLABORADOR';
    $q('#guNivel').value = u.nivel || GU_cargoNivel[$q('#guCargo').value] || 1;
    $q('#guStatus').value= u.status || 'ATIVO';
    $q('#acColab').checked = !!u.acessos.colab;
    $q('#acProf').checked  = !!u.acessos.prof;
    $q('#acCoord').checked = !!u.acessos.coord;
    $q('#acGestor').checked= !!u.acessos.gestor;
    GU_renderPermissoes($q('#guNivel').value);
    $q('#modalUsuario').setAttribute('aria-hidden','false');
  }
  function GU_closeModal(){ $q('#modalUsuario').setAttribute('aria-hidden','true'); }

  function GU_exportCSV(){
    const rows = [['ID','NOME','EMAIL','TELEFONE','CARGO','NIVEL','STATUS','COLAB','PROF','COORD','GESTOR']];
    GU_usuarios.forEach(u=> rows.push([u.id,u.nome,u.email,u.telefone,u.cargo,u.nivel,u.status, u.acessos.colab?'1':'0',u.acessos.prof?'1':'0',u.acessos.coord?'1':'0',u.acessos.gestor?'1':'0']));
    const csv = rows.map(r=>r.join(';')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='usuarios.csv'; a.click();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    if(!$q('#usuarios')) return;

    $q('#guBusca')?.addEventListener('input', GU_renderUsuarios);
    $q('#guFiltroCargo')?.addEventListener('change', GU_renderUsuarios);
    $q('#guFiltroStatus')?.addEventListener('change', GU_renderUsuarios);
    $q('#guExport')?.addEventListener('click', GU_exportCSV);
    $q('#guNovo')?.addEventListener('click', ()=>GU_openModal(-1));
    $q('#guCancelar')?.addEventListener('click', GU_closeModal);

    $q('#tabUsuarios')?.addEventListener('click', ev=>{
      const b = ev.target.closest('button'); if(!b) return;
      const i = parseInt(b.dataset.i,10), act=b.dataset.gu;
      if(Number.isNaN(i)) return;
      if(act==='edit'){ GU_openModal(i); }
      if(act==='toggle'){ GU_usuarios[i].status = GU_usuarios[i].status==='ATIVO'?'INATIVO':'ATIVO'; GU_renderUsuarios(); }
      if(act==='reset'){ alert('Link de redefinição enviado para: ' + GU_usuarios[i].email); }
      if(act==='del'){ if(confirm('Excluir usuário?')){ GU_usuarios.splice(i,1); GU_renderUsuarios(); } }
    });

    // Cargo → nível e sugestão de liberação
    $q('#guCargo')?.addEventListener('change', ()=>{
      const cargo = $q('#guCargo').value;
      $q('#guNivel').value = {COLABORADOR:1,PROFESSOR:2,COORDENADOR:3,GESTOR:4}[cargo] || 1;
      GU_renderPermissoes($q('#guNivel').value);
      $q('#acColab').checked = true;
      $q('#acProf').checked  = (cargo==='PROFESSOR'||cargo==='COORDENADOR'||cargo==='GESTOR');
      $q('#acCoord').checked = (cargo==='COORDENADOR'||cargo==='GESTOR');
      $q('#acGestor').checked= (cargo==='GESTOR');
    });
    $q('#guNivel')?.addEventListener('change', ()=> GU_renderPermissoes($q('#guNivel').value));
    $q('#guTel')?.addEventListener('input', e=> e.target.value = GU_maskPhone(e.target.value));

    $q('#formUsuario')?.addEventListener('submit', e=>{
      e.preventDefault();
      const payload = {
        id: ($q('#guId').value || `U${String(GU_usuarios.length+1).padStart(3,'0')}`).toUpperCase(),
        nome: GU_up($q('#guNome').value),
        email: ($q('#guEmail').value||'').trim().toLowerCase(),
        telefone: ($q('#guTel').value||'').replace(/\D/g,''),
        cargo: $q('#guCargo').value,
        nivel: parseInt($q('#guNivel').value,10)||1,
        status: $q('#guStatus').value,
        acessos: {
          colab: $q('#acColab').checked,
          prof:  $q('#acProf').checked,
          coord: $q('#acCoord').checked,
          gestor:$q('#acGestor').checked
        }
      };
      if(GU_editIdx>=0) GU_usuarios[GU_editIdx] = payload; else GU_usuarios.push(payload);
      GU_closeModal(); GU_renderUsuarios();
    });

    GU_renderPermissoes(4);
    GU_renderUsuarios();
  });
})();
/* ======================= CHAMADOS (CH_) ======================= */
(function(){
  // SLA por prioridade (horas)
  const CH_SLA_H = { URGENTE:4, ALTA:24, MEDIA:48, BAIXA:72 };

  // Mock inicial — depois plugamos no banco/portais dos alunos
  let CH_chamados = [
    novoChamado('TCK-2025-001','JOAO SILVA','joao@exemplo.com','Dificuldade para acessar o Portal','Acesso/Plataforma','Não consigo entrar no portal do aluno desde ontem.', 'ALTA', diasAtras(1)),
    novoChamado('TCK-2025-002','MARIA SOUZA','maria@exemplo.com','Boleto em duplicidade','Financeiro','Meu boleto deste mês veio em duplicidade.', 'MEDIA', diasAtras(3)),
    novoChamado('TCK-2025-003','CARLOS JUNIOR','carlos@exemplo.com','Correção de nome no histórico','Acadêmico','Meu nome saiu errado no histórico, como corrigir?', 'BAIXA', diasAtras(6)),
    // Um já resolvido
    (()=>{ const c=novoChamado('TCK-2025-004','ANA LIMA','ana@exemplo.com','Certificado não liberado','Documentos','Concluí o curso e não liberou certificado.', 'ALTA', diasAtras(10)); c.status='RESOLVIDO'; c.resolvidoEm=new Date(); c.mensagens.push(msg('ATENDENTE','Chamado resolvido e certificado liberado.')); return c; })()
  ];

  function diasAtras(n){ const d=new Date(); d.setDate(d.getDate()-n); return d; }
  function addHours(dt, h){ return new Date(dt.getTime()+h*3600*1000); }
  function fmtData(d){ return new Date(d).toLocaleDateString('pt-BR'); }
  function diffHoras(a,b){ return Math.round((a.getTime()-b.getTime())/3600000); }

  function novoChamado(protocolo, alunoNome, alunoEmail, assunto, categoria, descricao, prioridade, criadoEm=new Date()){
    const slaH = CH_SLA_H[prioridade] || CH_SLA_H.MEDIA;
    return {
      protocolo,
      aluno:{nome: alunoNome, email: alunoEmail},
      assunto, categoria, descricao,
      prioridade, // URGENTE | ALTA | MEDIA | BAIXA
      status:'ABERTO', // ABERTO | EM_ANDAMENTO | RESOLVIDO
      criadoEm, prazo: addHours(criadoEm, slaH),
      mensagens: [ msg('ALUNO', descricao) ],
      resolvidoEm: null
    };
  }
  function msg(by, texto){ return { by, data: new Date(), texto }; }
  function isAtrasado(ch){ return ch.status!=='RESOLVIDO' && new Date() > ch.prazo; }

  // ------ Renderização
  const $q = s => document.querySelector(s);

  function badgeStatus(st){ return `<span class="badge status-${st}">${st.replace('_',' ')}</span>`; }
  function badgePri(p){ return `<span class="badge pri-${p}">${p}</span>`; }

  function slaChip(ch){
    if(ch.status==='RESOLVIDO') return `<span class="sla-chip sla-ok">Concluído</span>`;
    const horas = diffHoras(ch.prazo, new Date()); // horas restantes (negativo = vencido)
    if(horas < 0) return `<span class="sla-chip sla-vencida">${Math.abs(horas)}h vencido</span>`;
    if(horas <= 6) return `<span class="sla-chip sla-alerta">${horas}h restante</span>`;
    return `<span class="sla-chip sla-ok">${horas}h restante</span>`;
  }

  function filtrosAtuais(){
    const q = ($q('#chBusca')?.value || '').trim().toUpperCase();
    const st = $q('#chFiltroStatus')?.value || 'TODOS';
    const pr = $q('#chFiltroPrioridade')?.value || 'TODAS';
    const pd = parseInt($q('#chPeriodo')?.value || '15', 10);
    const dtMin = new Date(); dtMin.setDate(dtMin.getDate()-pd);
    return { q, st, pr, dtMin };
  }

  function aplicaFiltros(lista){
    const { q, st, pr, dtMin } = filtrosAtuais();
    return lista.filter(ch=>{
      const hit = ch.protocolo.includes(q) || ch.aluno.nome.includes(q) || ch.assunto.toUpperCase().includes(q);
      const okSt = (st==='TODOS') || (ch.status===st);
      const okPr = (pr==='TODAS') || (ch.prioridade===pr);
      const okDt = ch.criadoEm >= dtMin;
      return hit && okSt && okPr && okDt;
    });
  }

  function renderKPIs(){
    const lista = aplicaFiltros(CH_chamados);
    const pendentes = lista.filter(ch => ch.status!=='RESOLVIDO').length;
    const resolvidos = lista.filter(ch => ch.status==='RESOLVIDO').length;
    const atrasados = lista.filter(ch => isAtrasado(ch)).length;
    $q('#chPendentes').textContent = pendentes;
    $q('#chResolvidos').textContent = resolvidos;
    $q('#chAtrasados').textContent = atrasados;
  }

  function renderTabela(){
    const tb = $q('#tabChamados tbody'); if(!tb) return;
    const lista = aplicaFiltros(CH_chamados)
      .sort((a,b)=> {
        // ordenar por urgência: atrasados primeiro, depois mais próximos do prazo
        const aA = isAtrasado(a), bA = isAtrasado(b);
        if(aA!==bA) return aA? -1 : 1;
        return a.prazo - b.prazo;
      });

    tb.innerHTML = lista.map((ch,i)=>`
      <tr>
        <td>${ch.protocolo}</td>
        <td>${ch.aluno.nome}</td>
        <td>${ch.assunto}</td>
        <td>${badgePri(ch.prioridade)}</td>
        <td>${fmtData(ch.criadoEm)}</td>
        <td>${fmtData(ch.prazo)}</td>
        <td>${badgeStatus(ch.status)}</td>
        <td>${slaChip(ch)}</td>
        <td>
          <button class="btn-mini" data-ch="ver" data-i="${i}">Ver</button>
          ${ch.status!=='RESOLVIDO' ? `<button class="btn-mini" data-ch="resolver" data-i="${i}">Resolver</button>` : `<button class="btn-mini" data-ch="reabrir" data-i="${i}">Reabrir</button>`}
        </td>
      </tr>
    `).join('');
  }

  function abrirModal(idx){
    const lista = aplicaFiltros(CH_chamados);
    const ch = lista[idx]; if(!ch) return;
    $q('#chModalTitulo').textContent = `${ch.protocolo} — ${ch.assunto}`;
    $q('#chProto').textContent = ch.protocolo;
    $q('#chAluno').textContent = ch.aluno.nome;
    $q('#chEmail').textContent = ch.aluno.email;
    $q('#chAssunto').textContent = ch.assunto;
    $q('#chCategoria').textContent = ch.category || ch.categoria || '-';
    $q('#chPrioridade').className = 'badge pri-'+ch.prioridade; $q('#chPrioridade').textContent = ch.prioridade;
    $q('#chStatus').className = 'badge status-'+ch.status; $q('#chStatus').textContent = ch.status.replace('_',' ');
    $q('#chCriado').textContent = fmtData(ch.criadoEm);
    $q('#chPrazo').textContent = fmtData(ch.prazo);
    $q('#chSLAChip').outerHTML = slaChip(ch); // substitui chip
    $q('#chDescricao').textContent = ch.descricao;

    const hist = $q('#chHistorico');
    hist.innerHTML = ch.mensagens.map(m=>`
      <div class="msg">
        <div class="by">${m.by} — ${new Date(m.data).toLocaleString('pt-BR')}</div>
        <div class="tx">${m.texto}</div>
      </div>
    `).join('');

    // guardar o protocolo visível no modal
    $q('#modalChamado').dataset.protocolo = ch.protocolo;
    $q('#modalChamado').setAttribute('aria-hidden','false');
  }

  function fecharModal(){ $q('#modalChamado').setAttribute('aria-hidden','true'); }

  function getChamadoByProto(proto){ return CH_chamados.find(c=>c.protocolo===proto); }

  function setStatus(ch, novo){
    ch.status = novo;
    if(novo==='RESOLVIDO') ch.resolvidoEm = new Date();
    renderKPIs(); renderTabela();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    if(!$q('#chamados')) return;

    // filtros
    $q('#chBusca')?.addEventListener('input', ()=>{ renderKPIs(); renderTabela(); });
    $q('#chFiltroStatus')?.addEventListener('change', ()=>{ renderKPIs(); renderTabela(); });
    $q('#chFiltroPrioridade')?.addEventListener('change', ()=>{ renderKPIs(); renderTabela(); });
    $q('#chPeriodo')?.addEventListener('change', ()=>{ renderKPIs(); renderTabela(); });

    // tabela ações
    $q('#tabChamados')?.addEventListener('click', (ev)=>{
      const b = ev.target.closest('button'); if(!b) return;
      const i = parseInt(b.dataset.i,10); const act=b.dataset.ch;
      const lista = aplicaFiltros(CH_chamados);
      const ch = lista[i]; if(!ch) return;

      if(act==='ver'){ abrirModal(i); }
      if(act==='resolver'){ setStatus(ch, 'RESOLVIDO'); }
      if(act==='reabrir'){  setStatus(ch, 'EM_ANDAMENTO'); }
    });

    // modal ações
    $q('#chFecharModal')?.addEventListener('click', fecharModal);
    $q('#formResposta')?.addEventListener('submit', (e)=>{
      e.preventDefault();
      const proto = $q('#modalChamado').dataset.protocolo;
      const ch = getChamadoByProto(proto); if(!ch) return;
      const texto = ($q('#chResposta').value||'').trim();
      if(texto){ ch.mensagens.push(msg('ATENDENTE', texto)); }
      const acao = $q('#chAcaoRapida').value;
      if(acao==='RESP_E_ANDAMENTO') setStatus(ch,'EM_ANDAMENTO');
      if(acao==='RESP_RESOLVER')   setStatus(ch,'RESOLVIDO');
      $q('#chResposta').value='';
      abrirModal(aplicaFiltros(CH_chamados).findIndex(c=>c.protocolo===proto)); // re-render modal
    });

    // primeira renderização
    renderKPIs(); renderTabela();
  });
})();


// 2) Helpers
function setTxt(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }
function moeda(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

// 3) Busca a view v_dashboard_kpis (uma linha só)
async function carregarKPIsDashboard() {
  if (!sb) return;

  const { data, error } = await sb.from('v_dashboard_kpis').select('*').single();
  if (error) {
    console.warn('KPIs:', error.message);
    return;
  }

  // função auxiliar pra evitar erro de undefined
  const safe = (v) => (v ?? '--');
  const safeNum = (v) => (typeof v === 'number' ? v.toFixed(1) : '0.0');

  setTxt('kpiTotalAlunos', safe(data.total_alunos));
  setTxt('kpiMatriculasAtivas', safe(data.matriculas_ativas));
  setTxt('kpiUsuariosInativos', safe(data.usuarios_inativos));
  setTxt('kpiValoresPagos', moeda(data.valores_pagos_mes || 0));
  setTxt('kpiCertificados', safe(data.certificados_emitidos));
  setTxt('kpiCertPendentes', safe(data.certificados_pendentes));
  setTxt('kpiTaxaConclusao', safeNum(data.taxa_conclusao) + '%');
}


// 4) Realtime: qualquer mudança nas tabelas abaixo reconsulta a view
function assinarRealtimeKPIs(){
  if(!sb) return;
  sb.channel('realtime-kpis')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alunos' },                 carregarKPIsDashboard)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matriculas' },             carregarKPIsDashboard)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'financeiro_lancamentos' }, carregarKPIsDashboard)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'certificados' },           carregarKPIsDashboard)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' },               carregarKPIsDashboard)
    .subscribe((status)=>{ if(status==='SUBSCRIBED') carregarKPIsDashboard(); });
}

// 5) Boot
document.addEventListener('DOMContentLoaded', ()=>{
  if(document.getElementById('kpiTotalAlunos')){  // estamos no dashboard
    carregarKPIsDashboard();
    assinarRealtimeKPIs();
  }
});
    ''


    // =====================================================
// GESTÃO DE MÓDULOS - INTEGRAÇÃO COM SUPABASE
// =====================================================

// Variáveis globais
let cursoEditandoId = null;
let moduloEditandoId = null;

// Função para abrir modal de módulos
function abrirModalModulos(cursoId, cursoNome, cursoArea) {
    cursoEditandoId = cursoId;
    document.getElementById('mmCursoNome').textContent = `${cursoNome} - ${cursoArea}`;
    document.getElementById('modalModulos').setAttribute('aria-hidden', 'false');
    
    // Carregar módulos do curso
    carregarModulosCurso(cursoId);
}

// Carregar módulos do curso do Supabase
async function carregarModulosCurso(cursoId) {
    try {
        console.log('Carregando módulos do curso:', cursoId);
        
        const { data: modulos, error } = await supabase
            .from('modulos')
            .select('*')
            .eq('curso_id', cursoId)
            .order('ordem', { ascending: true });

        if (error) throw error;

        const tbody = document.querySelector('#tabModulos tbody');
        tbody.innerHTML = '';

        if (modulos && modulos.length > 0) {
            modulos.forEach(modulo => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${modulo.ordem}</td>
                    <td>
                        <strong>${modulo.titulo}</strong>
                        ${modulo.descricao ? `<br><small style="color: #64748b;">${modulo.descricao}</small>` : ''}
                    </td>
                    <td style="text-align: center;">0</td>
                    <td style="text-align: center;">0</td>
                    <td>
                        <span class="status-badge ${modulo.publicado ? 'status-ativo' : 'status-inativo'}">
                            ${modulo.publicado ? '✅ Ativo' : '⏸️ Inativo'}
                        </span>
                    </td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm" onclick="abrirEdicaoModulo('${modulo.id}', '${modulo.titulo}', '${cursoId}')">
                                ✏️ Editar
                            </button>
                            <button class="btn btn-sm ghost" onclick="alternarStatusModulo('${modulo.id}')">
                                ${modulo.publicado ? '⏸️' : '▶️'}
                            </button>
                            <button class="btn btn-sm ghost" onclick="excluirModulo('${modulo.id}')" style="color: #ef4444;">
                                🗑️
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b;">Nenhum módulo cadastrado</td></tr>';
        }

    } catch (error) {
        console.error('Erro ao carregar módulos:', error);
        alert('Erro ao carregar módulos do curso');
    }
}

// Adicionar novo módulo
document.addEventListener('DOMContentLoaded', function() {
    const formModulo = document.getElementById('formModulo');
    
    if (formModulo) {
        formModulo.addEventListener('submit', async (e) => {
            e.preventDefault();

            const titulo = document.getElementById('fModuloTitulo').value;
            const ordem = parseInt(document.getElementById('fModuloOrdem').value) || 1;
            const descricao = document.getElementById('fModuloDesc').value;

            if (!titulo) {
                alert('Por favor, insira um título para o módulo');
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('modulos')
                    .insert([
                        {
                            curso_id: cursoEditandoId,
                            titulo: titulo,
                            ordem: ordem,
                            descricao: descricao,
                            publicado: false,
                            created_at: new Date().toISOString()
                        }
                    ])
                    .select();

                if (error) throw error;

                // Limpar formulário
                formModulo.reset();
                document.getElementById('fModuloOrdem').value = 1;
                
                // Recarregar lista
                await carregarModulosCurso(cursoEditandoId);
                
                alert('Módulo adicionado com sucesso!');

            } catch (error) {
                console.error('Erro ao adicionar módulo:', error);
                alert('Erro ao adicionar módulo: ' + error.message);
            }
        });
    }

    // Fechar modal de módulos
    const fecharModulos = document.getElementById('fecharModulos');
    if (fecharModulos) {
        fecharModulos.addEventListener('click', () => {
            document.getElementById('modalModulos').setAttribute('aria-hidden', 'true');
            cursoEditandoId = null;
        });
    }

    // Botão voltar
    const btnVoltarModulos = document.getElementById('btnVoltarModulos');
    if (btnVoltarModulos) {
        btnVoltarModulos.addEventListener('click', () => {
            document.getElementById('modalModulos').setAttribute('aria-hidden', 'true');
            cursoEditandoId = null;
        });
    }
});

// Alternar status do módulo (ativo/inativo)
async function alternarStatusModulo(moduloId) {
    try {
        // Primeiro busca o status atual
        const { data: modulo, error: fetchError } = await supabase
            .from('modulos')
            .select('publicado')
            .eq('id', moduloId)
            .single();

        if (fetchError) throw fetchError;

        // Alterna o status
        const { error } = await supabase
            .from('modulos')
            .update({ publicado: !modulo.publicado })
            .eq('id', moduloId);

        if (error) throw error;

        // Recarrega a lista
        await carregarModulosCurso(cursoEditandoId);
        
        alert('Status do módulo atualizado!');

    } catch (error) {
        console.error('Erro ao alternar status:', error);
        alert('Erro ao alterar status do módulo');
    }
}

// Excluir módulo
async function excluirModulo(moduloId) {
    if (!confirm('Tem certeza que deseja excluir este módulo? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('modulos')
            .delete()
            .eq('id', moduloId);

        if (error) throw error;

        // Recarrega a lista
        await carregarModulosCurso(cursoEditandoId);
        
        alert('Módulo excluído com sucesso!');

    } catch (error) {
        console.error('Erro ao excluir módulo:', error);
        alert('Erro ao excluir módulo');
    }
}

// Abrir edição detalhada do módulo (Materiais + Questões)
function abrirEdicaoModulo(moduloId, moduloTitulo, cursoId) {
    moduloEditandoId = moduloId;
    cursoEditandoId = cursoId;
    
    document.getElementById('editarModuloTitulo').textContent = moduloTitulo;
    document.getElementById('modalEditarModulo').setAttribute('aria-hidden', 'false');
    
    // Carregar materiais e questões existentes
    carregarMateriaisModulo(moduloId);
    carregarQuestoesModulo(moduloId);
}

// Funções para carregar materiais e questões (você implementa depois)
async function carregarMateriaisModulo(moduloId) {
    console.log('Carregando materiais do módulo:', moduloId);
    // Implementar busca no Supabase
}

async function carregarQuestoesModulo(moduloId) {
    console.log('Carregando questões do módulo:', moduloId);
    // Implementar busca no Supabase
}
