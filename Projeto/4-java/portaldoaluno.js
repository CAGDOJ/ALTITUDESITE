/* ===========================
   MOCK DATA (catálogo/curso)
   =========================== */
export const cursosMatriculados = [
  { id:"c1", titulo:"Informática Forense Avançada", cargaHoraria:60, proximaAvaliacao:"2025-08-20", status:"andamento" },
  { id:"c2", titulo:"Segurança em Redes (XCP-ng & Windows Server)", cargaHoraria:40, proximaAvaliacao:"2025-08-25", status:"andamento" },
  { id:"c3", titulo:"LGPD para Concursos", cargaHoraria:24, proximaAvaliacao:null, status:"concluido" }
];

const catalogoCursos = [
  { id:"n1", titulo:"Criptografia Aplicada", cargaHoraria:30, nivel:"Intermediário" },
  { id:"n2", titulo:"Análise de Malware",    cargaHoraria:50, nivel:"Avançado" },
  { id:"n3", titulo:"Perícia em Sistemas Móveis", cargaHoraria:36, nivel:"Intermediário" },
  { id:"n4", titulo:"Python para Perícia Digital", cargaHoraria:40, nivel:"Inicial" }
];

const desempenhoMensal = [
  { mes:"Mar", media:7.4, horas:18 },
  { mes:"Abr", media:7.8, horas:22 },
  { mes:"Mai", media:8.1, horas:24 },
  { mes:"Jun", media:8.3, horas:27 },
  { mes:"Jul", media:8.5, horas:25 },
  { mes:"Ago", media:8.7, horas:29 }
];

const faturas = [
  { id:"FAT-2025-071", referencia:"Mensalidade Julho/2025",   valor:199.9, vencimento:"2025-07-10", status:"pago" },
  { id:"FAT-2025-081", referencia:"Mensalidade Agosto/2025",  valor:199.9, vencimento:"2025-08-10", status:"pendente" },
  { id:"FAT-2025-091", referencia:"Mensalidade Setembro/2025",valor:199.9, vencimento:"2025-09-10", status:"aberto" }
];

/* ===========================
   HELPERS
   =========================== */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const brDate = (s)=> new Date(s).toLocaleDateString("pt-BR");
const fmt = (sec)=>{ const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
const hours = (sec)=> sec/3600;

/* ===========================
   ESTADO PERSISTENTE (SALVO)
   =========================== */
const STATE_KEY = 'portal_aluno_state_v1';

// tudo começa em 0 e vai somando conforme o aluno interage
let estado = {
  // tempo total e por curso (em segundos)
  totalSeconds: 0,
  byCourseSeconds: {}, // { c1: 5400, c2: 1200, ... }

  // créditos (1h inteira = 1 crédito)
  credits: 0,

  // curso atualmente em estudo (para retomar)
  lastCourse: null,

  // conclusão (marca curso concluído quando bater 100%)
  completed: {} // { c1: true }
};

function loadState(){
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      estado = { ...estado, ...parsed };
    }
  } catch(_) {}
}

function saveState(){
  localStorage.setItem(STATE_KEY, JSON.stringify(estado));
}

/* ===========================
   TRACKER DE ESTUDO (persist)
   =========================== */
const STORAGE_KEY = 'altitude_study_time_v1';
const tracker = {
  data: { totalSeconds:0, byCourse:{}, current:null, lastActive:Date.now() },

  load(){
    try{ const s = localStorage.getItem(STORAGE_KEY); if(s) this.data = JSON.parse(s); }catch(_){}
    this.data.totalSeconds ||= 0;
    this.data.byCourse ||= {};
    this.data.current ||= null;
  },
  save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); },

  start(courseId){
    if(this.data.current) return; // já estudando algo
    this.data.current = { courseId, start:Date.now(), seconds:0 };
    this.data.lastActive = Date.now();

    estado.lastCourse = courseId; // salva para retomar
    ui.setCursoAtual(courseId);
    ui.setLiveDot(true);
    saveState();
  },
  pause(){
    if(!this.data.current) return;
    this.tick(); // contabiliza até agora
    this.data.current = null;
    ui.setLiveDot(false);
    this.save();
  },
  tick(){
    if(!this.data.current) return;
    const now = Date.now();
    const delta = Math.floor((now - this.data.lastActive)/1000);
    if(delta>0){
      const id = this.data.current.courseId;

      // tracker
      this.data.current.seconds += delta;
      this.data.totalSeconds += delta;
      this.data.byCourse[id] = (this.data.byCourse[id]||0) + delta;
      this.data.lastActive = now;
      this.save();

      // estado persistente
      estado.totalSeconds += delta;
      estado.byCourseSeconds[id] = (estado.byCourseSeconds[id]||0) + delta;
      estado.credits = Math.floor(estado.totalSeconds/3600);
      maybeMarkCompleted(id);
      saveState();

      // UI
      ui.renderCounters();
    }
  },
  idleWatch(){
    const idleMs = 5*60*1000;
    if(this.data.current && (Date.now()-this.data.lastActive) > idleMs){
      this.pause();
      alert('Sessão pausada por inatividade (5 min).');
    }
  }
};

/* ===========================
   PROGRESSO REAL POR CURSO
   =========================== */
function progressPercentById(courseId){
  const curso = cursosMatriculados.find(c=>c.id===courseId);
  if(!curso) return 0;
  const sec = estado.byCourseSeconds[courseId]||0;
  return Math.min(100, (hours(sec)/curso.cargaHoraria)*100);
}

function maybeMarkCompleted(courseId){
  if(progressPercentById(courseId) >= 100){
    estado.completed[courseId] = true;
  }
}

/* ===========================
   UI (render + interações)
   =========================== */
const ui = {
  setCursoAtual(id){
    const c = cursosMatriculados.find(x=>x.id===id);
    const el = $("#met-curso");
    if(el) el.textContent = c ? c.titulo : "—";
  },
  setLiveDot(active){
    $('#pill-dot')?.classList.toggle('active', !!active);
  },
  renderCounters(){
    $('#met-total')    && ($('#met-total').textContent = fmt(estado.totalSeconds));
    $('#met-creditos') && ($('#met-creditos').textContent = estado.credits);
  },
  renderLive(){
    const live = tracker.data.current ? tracker.data.current.seconds : 0;
    $('#met-sessao') && ($('#met-sessao').textContent = fmt(live));
    $('#pill-timer').textContent   = fmt(live);
    $('#pill-credits').textContent = `${estado.credits} créditos`;
  },
  renderHorasPorCurso(){
    const wrap = $('#lista-horas-curso'); if(!wrap) return;
    wrap.innerHTML = '';
    cursosMatriculados.forEach(c=>{
      const sec = estado.byCourseSeconds[c.id] || 0;
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `
        <div>
          <div style="font-weight:600">${c.titulo}</div>
          <div style="font-size:12px;color:var(--muted)">${fmt(sec)} • Créditos: <strong>${Math.floor(sec/3600)}</strong></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost btn-study" data-course="${c.id}">
            ${tracker.data.current && tracker.data.current.courseId===c.id ? 'Pausar estudo' : 'Iniciar estudo'}
          </button>
        </div>`;
      wrap.appendChild(row);
    });
    bindStudyButtons();
  }
};

/* ===========================
   TABS + BUSCA
   =========================== */
function setupTabs(){
  const sections = $$('main section');
  const buttons  = $$('.tab-btn');

  function activate(tab){
    sections.forEach(s=>s.classList.remove('active'));
    $(`#tab-${tab}`)?.classList.add('active');
    buttons.forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    if(tab==='desempenho' || tab==='inicio') renderCharts(); // garante redimensionamento
  }

  buttons.forEach(btn=>btn.addEventListener('click', ()=>activate(btn.dataset.tab)));
  const initial = buttons.find(b=>b.classList.contains('active'))?.dataset.tab || 'inicio';
  activate(initial);
}

function setupSearch(){
  const input = $('#busca'); if(!input) return;
  input.addEventListener('input', e=>{
    const q = e.target.value.toLowerCase();
    const filtrados = cursosMatriculados.filter(c=>c.titulo.toLowerCase().includes(q));
    renderCursos(filtrados);
    renderProgresso(filtrados);
    renderProvasAgenda(filtrados);
  });
}

/* ===========================
   MÉTRICAS / KPIs
   =========================== */
function renderMetricas(){
  const ativos = cursosMatriculados.filter(c=>!estado.completed[c.id]).length;
  const horasTotais = Math.round(estado.totalSeconds/3600);
  const media = (desempenhoMensal.reduce((a,d)=>a+d.media,0)/desempenhoMensal.length).toFixed(1);
  const pend  = cursosMatriculados.filter(c=>!estado.completed[c.id] && c.proximaAvaliacao).length;

  $('#metric-cursos').textContent = ativos;
  $('#metric-horas').textContent  = `${horasTotais}h`;
  $('#metric-media').textContent  = media;
  $('#metric-provas').textContent = pend;

  $('#kpi-media')  && ($('#kpi-media').textContent  = media);
  $('#kpi-horas')  && ($('#kpi-horas').textContent  = `${horasTotais}h`);
  $('#kpi-provas') && ($('#kpi-provas').textContent = desempenhoMensal.length); // ou provasRecentes.length, se tiver
}

/* ===========================
   LISTAS / TELAS
   =========================== */
function renderProgresso(arr=cursosMatriculados){
  const wrap = $('#lista-progresso'); if(!wrap) return;
  wrap.innerHTML = '';
  arr.forEach(c=>{
    const pct = progressPercentById(c.id).toFixed(0);
    const status = estado.completed[c.id] ? 'concluido' : c.status;
    const el = document.createElement('div'); el.className='row';
    el.innerHTML = `
      <div>
        <div style="font-weight:600">${c.titulo}</div>
        <div style="font-size:12px;color:var(--muted)">
          Carga horária: ${c.cargaHoraria}h • Status:
          <span class="badge ${status==='concluido'?'ok':''}">${status}</span>
        </div>
        <div class="progress" style="margin-top:8px"><span style="width:${pct}%"></span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${pct}% concluído</div>
      </div>
      <div style="text-align:right;min-width:200px">
        ${c.proximaAvaliacao ? `<div style="font-size:13px">Próxima prova: <strong>${brDate(c.proximaAvaliacao)}</strong></div>`
                              : `<div style="font-size:13px;color:var(--muted)">Sem avaliações pendentes</div>`}
        <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn">Ver conteúdo</button>
          <button class="btn primary">Continuar</button>
          <button class="btn ghost btn-study" data-course="${c.id}">
            ${tracker.data.current && tracker.data.current.courseId===c.id ? 'Pausar estudo' : 'Iniciar estudo'}
          </button>
        </div>
      </div>`;
    wrap.appendChild(el);
  });
  bindStudyButtons();
}

function renderCursos(arr=cursosMatriculados){
  const grid = $('#grid-cursos'); if(!grid) return;
  grid.innerHTML = '';
  arr.forEach(c=>{
    const pct = progressPercentById(c.id).toFixed(0);
    const labelStatus = estado.completed[c.id] ? 'Concluído' : (c.status==='concluido'?'Concluído':'Em andamento');
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <div class="body">
        <div style="font-weight:600">${c.titulo}</div>
        <div style="font-size:12px;color:var(--muted)">${c.cargaHoraria}h • ${labelStatus}</div>
        <div class="progress" style="margin-top:8px"><span style="width:${pct}%"></span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${pct}% concluído</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn">Material</button>
          <button class="btn primary">Continuar aulas</button>
          <button class="btn ghost btn-study" data-course="${c.id}">
            ${tracker.data.current && tracker.data.current.courseId===c.id ? 'Pausar estudo' : 'Iniciar estudo'}
          </button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
  bindStudyButtons();
}

function renderProvasAgenda(arr=cursosMatriculados){
  const wrap = $('#lista-provas'); if(!wrap) return; wrap.innerHTML='';
  arr.filter(c=>c.proximaAvaliacao).forEach(c=>{
    const el=document.createElement('div'); el.className='row';
    el.innerHTML = `
      <div>
        <div style="font-weight:600">${c.titulo}</div>
        <div style="font-size:12px;color:var(--muted)">Próxima prova em ${brDate(c.proximaAvaliacao)}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn">Ver detalhes</button>
        <button class="btn primary">Iniciar simulado</button>
      </div>`;
    wrap.appendChild(el);
  });
}

function renderPagamentos(){
  const tbody = document.querySelector('#tabela-faturas tbody'); if(!tbody) return; tbody.innerHTML='';
  faturas.forEach(f=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${f.id}</code></td>
      <td>${f.referencia}</td>
      <td>${brDate(f.vencimento)}</td>
      <td>R$ ${f.valor.toFixed(2)}</td>
      <td>${f.status==='pago'?'<span class="badge ok">Pago</span>':f.status==='pendente'?'<span class="badge danger">Pendente</span>':'<span class="badge">Em aberto</span>'}</td>
      <td>${f.status!=='pago'?`<button class="btn primary" onclick="pagar('${f.id}')">Pagar agora</button> <button class="btn">Gerar boleto</button>`:`<button class="btn">Recibo</button>`}</td>`;
    tbody.appendChild(tr);
  });
  const assinatura = { proximo:"10/09/2025", valor:"R$ 199,90", status:"Ativo" };
  $('#assinatura').innerHTML = `
    <div style="display:flex;justify-content:space-between"><span>Próximo vencimento</span><strong>${assinatura.proximo}</strong></div>
    <div style="display:flex;justify-content:space-between"><span>Valor</span><strong>${assinatura.valor}</strong></div>
    <div style="display:flex;justify-content:space-between"><span>Status</span><span class="badge ok">${assinatura.status}</span></div>`;
}
window.pagar = (id)=> alert(`Pagamento iniciado para ${id}`);

function renderCatalogo(){
  const grid = $('#grid-catalogo'); if(!grid) return; grid.innerHTML='';
  catalogoCursos.forEach(c=>{
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <div class="body">
        <div style="font-weight:600">${c.titulo}</div>
        <div style="font-size:12px;color:var(--muted)">${c.cargaHoraria}h • ${c.nivel}</div>
        <button class="btn primary block" style="margin-top:12px" onclick="inscrever('${c.id}')">Inscrever-se</button>
      </div>`;
    grid.appendChild(card);
  });
}
window.inscrever = (id)=> alert(`Inscrição realizada com sucesso no curso ${id}!`);

/* ===========================
   GRÁFICOS (Chart.js UMD)
   =========================== */
let CHoras=null, CMedia=null, CInicio=null;
function renderCharts(){
  // gráfico pequeno (Início)
  const ctxInicio = document.getElementById('chart-media');
  if(ctxInicio){
    if(CInicio) CInicio.destroy();
    CInicio = new window.Chart(ctxInicio,{
      type:'line',
      data:{ labels:desempenhoMensal.map(d=>d.mes),
             datasets:[{ label:'Média', data:desempenhoMensal.map(d=>d.media), tension:.35, borderColor:'#10807b', backgroundColor:'rgba(28,195,187,.15)', fill:true }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{min:0,max:10,grid:{color:'#eef4f8'}}, x:{grid:{display:false}} } }
    });
  }

  // gráficos da aba Desempenho (3/6 meses)
  function renderDesempenho(range=6){
    const data   = desempenhoMensal.slice(-range);
    const labels = data.map(d=>d.mes);
    const horas  = data.map(d=>d.horas);
    const medias = data.map(d=>d.media);

    const elH = document.getElementById('chart-horas');
    const elM = document.getElementById('chart-media-linha');

    if(elH){
      if(CHoras) CHoras.destroy();
      CHoras = new window.Chart(elH,{ type:'bar',
        data:{ labels, datasets:[{ label:'Horas de estudo', data:horas, borderRadius:8, backgroundColor:'rgba(28,195,187,.55)' }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,grid:{color:'#eef4f8'}}, x:{grid:{display:false}} } }
      });
    }
    if(elM){
      if(CMedia) CMedia.destroy();
      CMedia = new window.Chart(elM,{ type:'line',
        data:{ labels, datasets:[{ label:'Média', data:medias, tension:.35, borderWidth:2, borderColor:'#0d2b45', pointRadius:3, fill:false }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{min:0,max:10,grid:{color:'#eef4f8'}}, x:{grid:{display:false}} } }
      });
    }
  }
  renderDesempenho(6);
  $$('.range-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      $$('.range-btn').forEach(x=>x.classList.remove('primary'));
      b.classList.add('primary');
      renderDesempenho(parseInt(b.dataset.range));
    });
  });
}

/* ===========================
   BOTÕES DE ESTUDO
   =========================== */
function bindStudyButtons(){
  $$('.btn-study').forEach(b=>{
    b.onclick = ()=>{
      const id = b.getAttribute('data-course');
      if(tracker.data.current && tracker.data.current.courseId===id){
        tracker.pause(); refreshStudyButtons();
      }else if(tracker.data.current){
        tracker.pause(); tracker.start(id); refreshStudyButtons();
      }else{
        tracker.start(id); refreshStudyButtons();
      }
    };
  });
}
function refreshStudyButtons(){
  $$('.btn-study').forEach(b=>{
    const id = b.getAttribute('data-course');
    b.textContent = (tracker.data.current && tracker.data.current.courseId===id) ? 'Pausar estudo' : 'Iniciar estudo';
  });
  ui.renderHorasPorCurso();
}

/* ===========================
   BUSCA / PROVAS RECENTES
   =========================== */
function renderProvasRecentes(){
  const wrap = $("#lista-provas-recentes"); if(!wrap) return; wrap.innerHTML='';
  // mock simples (poderia vir do servidor)
  const recents = [
    { curso:"Informática Forense Avançada", data:"2025-07-28", nota:8.6 },
    { curso:"Segurança em Redes", data:"2025-07-20", nota:7.9 },
    { curso:"LGPD", data:"2025-07-10", nota:9.1 }
  ];
  recents.forEach(p=>{
    const el=document.createElement('div'); el.className='row';
    el.innerHTML = `<div><div style="font-weight:600">${p.curso}</div><div style="font-size:12px;color:var(--muted)">${brDate(p.data)}</div></div><span class="badge">Nota ${p.nota}</span>`;
    wrap.appendChild(el);
  });
}

/* ===========================
   EXPORT / CERTIFICADO MOCK
   =========================== */
function setupExporters(){
  const btnExp  = $('#btn-exportar');
  const btnCert = $('#btn-mock-cert');
  btnExp && btnExp.addEventListener('click', ()=>{
    const data = { estado, tracker: tracker.data, generatedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'portal-aluno-estado.json'; a.click();
    URL.revokeObjectURL(url);
  });
  btnCert && btnCert.addEventListener('click', ()=>{
    alert(`Certificado mock: ${estado.credits} créditos (horas inteiras).`);
  });
}

/* ===========================
   INIT
   =========================== */
function renderAll(){
  renderMetricas();
  renderProgresso();
  renderCursos();
  renderCharts();
  renderProvasAgenda();
  renderPagamentos();
  renderCatalogo();
  renderProvasRecentes();
  ui.renderCounters();
  ui.renderLive();
  ui.renderHorasPorCurso();
  bindStudyButtons();
}

function init(){
  $('#yr') && ($('#yr').textContent = new Date().getFullYear());

  // carregar persistência antes de desenhar
  loadState();
  tracker.load();

  setupTabs();
  setupSearch();
  setupExporters();

  renderAll();

  // loop do cronômetro + idle
  setInterval(()=>{ tracker.tick(); ui.renderLive(); tracker.idleWatch(); }, 1000);

  // eventos gerais
  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt=>{
    document.addEventListener(evt, ()=>{ tracker.data.lastActive = Date.now(); });
  });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) tracker.pause(); });
  window.addEventListener('beforeunload', ()=>{ tracker.pause(); });
}

document.addEventListener('DOMContentLoaded', init);

/* ===========================
   OPCIONAL: RESET GERAL
   (use no console: window.resetPortal())
   =========================== */
window.resetPortal = ()=>{
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
};
