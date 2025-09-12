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
(function(){
  // Estado simples em memória
  let GC_areas = ['Tecnologia', 'Humanas', 'Saúde'];
  let GC_cursos = []; // {id,nome,area,horas,desc,publicado,capa,modulos:[{titulo,materiais:[],questoes:[]}]} 
  let GC_idxCurso = -1;
  let GC_idxModulo = -1;

  const $q = (s)=>document.querySelector(s);

  const GC_up = t => (t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ç/gi,'c').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
  const GC_genId = ()=>{
    const ano = new Date().getFullYear().toString();
    const seq = String(GC_cursos.filter(c=>c.id?.startsWith('CUR'+ano)).length + 1).padStart(4,'0');
    return `CUR${ano}${seq}`;
  };

  function GC_renderAreas(){
    const filtro = $q('#curFiltroArea');
    const formSel = $q('#fCursoArea');
    if(!filtro && !formSel) return;
    const opts = GC_areas.map(a=>`<option value="${a}">${a}</option>`).join('');
    if(formSel) formSel.innerHTML = opts;
    if(filtro){
      filtro.innerHTML = `<option value="TODAS">Todas</option>` + opts;
      filtro.value = filtro.value || 'TODAS';
    }
  }

  function GC_renderCursos(){
    const tbody = $q('#tabCursos tbody'); if(!tbody) return;
    const area = ($q('#curFiltroArea')?.value)||'TODAS';
    const lista = area==='TODAS'? GC_cursos : GC_cursos.filter(c=>c.area===area);
    tbody.innerHTML = lista.map((c,i)=>`
      <tr>
        <td>${c.id||'-'}</td>
        <td>${c.nome}</td>
        <td>${c.area}</td>
        <td>${c.modulos?.length||0}</td>
        <td><span class="badge ${c.publicado==='SIM'?'pub':'nop'}">${c.publicado==='SIM'?'SIM':'NÃO'}</span></td>
        <td>
          <button class="btn-mini" data-gc="edit" data-i="${i}">Editar</button>
          <button class="btn-mini" data-gc="mods" data-i="${i}">Módulos</button>
          <button class="btn-mini" data-gc="del"  data-i="${i}">Excluir</button>
        </td>
      </tr>
    `).join('');
  }

  function GC_renderModulos(){
    const cur = GC_cursos[GC_idxCurso]; if(!cur) return;
    const tbody = $q('#tabModulos tbody'); if(!tbody) return;
    tbody.innerHTML = (cur.modulos||[]).map((m,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${m.titulo}</td>
        <td>${m.materiais?.length||0}</td>
        <td>${m.questoes?.length||0}/10</td>
        <td>
          <button class="btn-mini" data-mm="mat" data-i="${i}">Materiais</button>
          <button class="btn-mini" data-mm="qst" data-i="${i}">Avaliação</button>
          <button class="btn-mini" data-mm="del" data-i="${i}">Excluir</button>
        </td>
      </tr>
    `).join('');

    const table = $q('#tabModulos');
    table.onclick = (ev)=>{
      const b = ev.target.closest('button'); if(!b) return;
      const i = parseInt(b.dataset.i,10);
      const act = b.dataset.mm;
      if(Number.isNaN(i)) return;
      const cur = GC_cursos[GC_idxCurso];
      if(act==='mat'){
        GC_idxModulo = i;
        $q('#matModuloTitulo').textContent = cur.modulos[i].titulo;
        $q('#fMatTipo').value='PDF';
        $q('#wrapUrl').classList.add('hidden');
        $q('#wrapArquivo').classList.remove('hidden');
        $q('#fMatNome').value=''; $q('#fMatUrl').value=''; $q('#fMatArquivo').value='';
        GC_renderMateriais();
        $q('#modalMateriais').setAttribute('aria-hidden','false');
      }
      if(act==='qst'){
        GC_idxModulo = i;
        $q('#qModuloTitulo').textContent = cur.modulos[i].titulo;
        GC_renderQuestoes();
        $q('#modalQuestoes').setAttribute('aria-hidden','false');
      }
      if(act==='del'){
        if(confirm('Excluir módulo?')){ cur.modulos.splice(i,1); GC_renderModulos(); }
      }
    };
  }

  function GC_renderMateriais(){
    const mod = GC_cursos[GC_idxCurso].modulos[GC_idxModulo];
    const tbody = $q('#tabMateriais tbody'); if(!tbody) return;
    tbody.innerHTML = (mod.materiais||[]).map((m,i)=>`
      <tr>
        <td>${m.tipo}</td>
        <td>${m.nome}</td>
        <td>${m.origem || '-'}</td>
        <td><button class="btn-mini" data-rm="${i}">Remover</button></td>
      </tr>
    `).join('');
    $q('#tabMateriais').onclick = (ev)=>{
      const b = ev.target.closest('button'); if(!b) return;
      const i = parseInt(b.dataset.rm,10);
      if(!Number.isNaN(i)){ mod.materiais.splice(i,1); GC_renderMateriais(); }
    };
  }

  function GC_renderQuestoes(){
    const mod = GC_cursos[GC_idxCurso].modulos[GC_idxModulo];
    const tbody = $q('#tabQuestoes tbody'); if(!tbody) return;
    tbody.innerHTML = (mod.questoes||[]).map((q,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${q.enunciado}</td>
        <td>${q.correta}</td>
        <td><button class="btn-mini" data-delq="${i}">Remover</button></td>
      </tr>
    `).join('');
    $q('#tabQuestoes').onclick = (ev)=>{
      const b = ev.target.closest('button'); if(!b) return;
      const i = parseInt(b.dataset.delq,10);
      if(!Number.isNaN(i)){ mod.questoes.splice(i,1); GC_renderQuestoes(); }
    };
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    // Se a aba de cursos não existe nesta página, não faz nada.
    if(!$q('#cursos')) return;

    GC_renderAreas();
    GC_renderCursos();

    $q('#curFiltroArea')?.addEventListener('change', GC_renderCursos);

    // Nova área
    $q('#btnNovaArea')?.addEventListener('click', ()=> $q('#modalArea').setAttribute('aria-hidden','false'));
    $q('#fecharArea')?.addEventListener('click', ()=> $q('#modalArea').setAttribute('aria-hidden','true'));
    $q('#formArea')?.addEventListener('submit', e=>{
      e.preventDefault();
      const nome = GC_up($q('#fAreaNome').value);
      if(nome && !GC_areas.includes(nome)){ GC_areas.push(nome); }
      $q('#fAreaNome').value='';
      $q('#modalArea').setAttribute('aria-hidden','true');
      GC_renderAreas();
    });

    // Novo curso
    $q('#btnNovoCurso')?.addEventListener('click', ()=>{
      GC_idxCurso = -1;
      $q('#tituloCurso').textContent = 'Novo curso';
      $q('#fCursoNome').value = '';
      // horas (se existir no HTML)
      const horasEl = $q('#fCursoHoras'); if(horasEl) horasEl.value = '';
      $q('#fCursoDesc').value = '';
      $q('#fCursoPub').value  = 'NAO';
      $q('#fCursoCapa').value = '';
      $q('#modalCurso').setAttribute('aria-hidden','false');
    });
    $q('#fecharCurso')?.addEventListener('click', ()=> $q('#modalCurso').setAttribute('aria-hidden','true'));

    // Salvar curso
    $q('#formCurso')?.addEventListener('submit', e=>{
      e.preventDefault();
      const payload = {
        id: GC_idxCurso>=0 ? GC_cursos[GC_idxCurso].id : GC_genId(),
        nome: GC_up($q('#fCursoNome').value),
        area: $q('#fCursoArea').value,
        horas: parseInt($q('#fCursoHoras')?.value, 10) || 0, // << HORAS
        desc: $q('#fCursoDesc').value.trim(),
        publicado: $q('#fCursoPub').value,
        capa: $q('#fCursoCapa').files[0]?.name || null,
        modulos: GC_idxCurso>=0 ? GC_cursos[GC_idxCurso].modulos : []
      };
      if(GC_idxCurso>=0) GC_cursos[GC_idxCurso] = payload; else GC_cursos.push(payload);
      $q('#modalCurso').setAttribute('aria-hidden','true');
      GC_renderCursos();
    });

    // Tabela cursos – ações
    $q('#tabCursos')?.addEventListener('click', ev=>{
      const btn = ev.target.closest('button'); if(!btn) return;
      const i = parseInt(btn.dataset.i,10);
      const act = btn.dataset.gc;
      if(Number.isNaN(i)) return;

      const filtro = $q('#curFiltroArea').value;
      const lista = filtro==='TODAS' ? GC_cursos : GC_cursos.filter(c=>c.area===filtro);
      const curso = lista[i];
      const idxGlobal = GC_cursos.findIndex(c=>c.id===curso.id);

      if(act==='edit'){
        GC_idxCurso = idxGlobal;
        $q('#tituloCurso').textContent = 'Editar curso';
        $q('#fCursoArea').value = curso.area;
        $q('#fCursoPub').value  = curso.publicado;
        $q('#fCursoNome').value = curso.nome;
        // horas (se existir no HTML)
        const horasEl = $q('#fCursoHoras'); if(horasEl) horasEl.value = curso.horas || '';
        $q('#fCursoDesc').value = curso.desc || '';
        $q('#fCursoCapa').value = '';
        $q('#modalCurso').setAttribute('aria-hidden','false');
      }

      if(act==='mods'){
        GC_idxCurso = idxGlobal;
        $q('#mmCursoNome').textContent = curso.nome;
        GC_renderModulos();
        $q('#modalModulos').setAttribute('aria-hidden','false');
      }

      if(act==='del'){
        if(confirm('Excluir este curso?')){
          GC_cursos.splice(idxGlobal,1);
          GC_renderCursos();
        }
      }
    });

    // MÓDULOS
    $q('#fecharModulos')?.addEventListener('click', ()=> $q('#modalModulos').setAttribute('aria-hidden','true'));
    $q('#formModulo')?.addEventListener('submit', e=>{
      if(GC_idxCurso<0) return;
      e.preventDefault();
      const titulo = $q('#fModuloTitulo').value.trim();
      if(!titulo) return;
      GC_cursos[GC_idxCurso].modulos = GC_cursos[GC_idxCurso].modulos || [];
      GC_cursos[GC_idxCurso].modulos.push({ titulo, materiais:[], questoes:[] });
      $q('#fModuloTitulo').value='';
      GC_renderModulos();
    });

    // Materiais
    $q('#fecharMateriais')?.addEventListener('click', ()=> $q('#modalMateriais').setAttribute('aria-hidden','true'));
    $q('#fMatTipo')?.addEventListener('change', ()=>{
      const t = $q('#fMatTipo').value;
      if(t==='VIDEO'){ $q('#wrapUrl').classList.remove('hidden'); $q('#wrapArquivo').classList.add('hidden'); }
      else           { $q('#wrapUrl').classList.add('hidden');    $q('#wrapArquivo').classList.remove('hidden'); }
    });
    $q('#formMaterial')?.addEventListener('submit', e=>{
      if(GC_idxCurso<0 || GC_idxModulo<0) return;
      e.preventDefault();
      const tipo = $q('#fMatTipo').value;
      const nome = $q('#fMatNome').value.trim();
      const origem = (tipo==='VIDEO') ? ($q('#fMatUrl').value.trim()) : ($q('#fMatArquivo').files[0]?.name || '');
      const mod = GC_cursos[GC_idxCurso].modulos[GC_idxModulo];
      mod.materiais.push({ tipo, nome, origem });
      $q('#fMatNome').value=''; $q('#fMatUrl').value=''; $q('#fMatArquivo').value='';
      GC_renderMateriais();
    });

    // Questões
    $q('#fecharQuestoes')?.addEventListener('click', ()=> $q('#modalQuestoes').setAttribute('aria-hidden','true'));
    $q('#formQuestao')?.addEventListener('submit', e=>{
      if(GC_idxCurso<0 || GC_idxModulo<0) return;
      e.preventDefault();
      const mod = GC_cursos[GC_idxCurso].modulos[GC_idxModulo];
      mod.questoes = mod.questoes || [];
      if(mod.questoes.length>=10){ alert('Máximo de 10 perguntas.'); return; }
      const q = {
        enunciado: $q('#fPergunta').value.trim(),
        A: $q('#fA').value.trim(),
        B: $q('#fB').value.trim(),
        C: $q('#fC').value.trim(),
        D: $q('#fD').value.trim(),
        correta: $q('#fCorreta').value
      };
      if(!q.enunciado || !q.A || !q.B || !q.C || !q.D){ alert('Preencha a pergunta e todas as alternativas.'); return; }
      mod.questoes.push(q);
      $q('#fPergunta').value=''; $q('#fA').value=''; $q('#fB').value=''; $q('#fC').value=''; $q('#fD').value='';
      GC_renderQuestoes();
    });

    // Exportar CSV de cursos
    $q('#btnExportCursos')?.addEventListener('click', ()=>{
      const rows = [['CODIGO','CURSO','AREA','PUBLICADO','MODULOS']];
      GC_cursos.forEach(c=> rows.push([c.id, c.nome, c.area, c.publicado, (c.modulos?.length||0)]));
      const csv = rows.map(r=>r.join(';')).join('\n');
      const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cursos.csv'; a.click();
    });

  }); // DOMContentLoaded
})(); // IIFE GC_
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

/* ====================== DASHBOARD • Supabase Realtime ====================== */
// 1) Conexão
const SUPABASE_URL      = 'https://SEU-PROJETO.supabase.co';   // <-- troque
const SUPABASE_ANON_KEY = 'eyJ...';                             // <-- troque
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2) Helpers
function setTxt(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }
function moeda(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

// 3) Busca a view v_dashboard_kpis (uma linha só)
async function carregarKPIsDashboard(){
  if(!sb) return;
  const { data, error } = await sb.from('v_dashboard_kpis').select('*').single();
  if(error){ console.warn('KPIs:', error.message); return; }
  setTxt('kpiTotalAlunos',      data.total_alunos ?? '--');
  setTxt('kpiMatriculasAtivas', data.matriculas_ativas ?? '--');
  setTxt('kpiUsuariosInativos', data.usuarios_inativos ?? '--');
  setTxt('kpiValoresPagos',     moeda(data.valores_pagos_mes));
  setTxt('kpiCertificados',     data.certificados_emitidos ?? '--');
  setTxt('kpiCertPendentes',    data.certificados_pendentes ?? '--');
  setTxt('kpiTaxaConclusao',   ((data.taxa_conclusao ?? 0).toFixed ? data.taxa_conclusao.toFixed(1) : data.taxa_conclusao) + '%');
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
