


// ====== MOCK DATA ======
const cursosMatriculados = [
  { id:"c1", titulo:"Informática Forense Avançada", cargaHoraria:60, progresso:72, proximaAvaliacao:"2025-08-20", status:"andamento" },
  { id:"c2", titulo:"Segurança em Redes (XCP-ng & Windows Server)", cargaHoraria:40, progresso:35, proximaAvaliacao:"2025-08-25", status:"andamento" },
  { id:"c3", titulo:"LGPD para Concursos", cargaHoraria:24, progresso:100, proximaAvaliacao:null, status:"concluido" },
];

const catalogoCursos = [
  { id:"n1", titulo:"Criptografia Aplicada", cargaHoraria:30, nivel:"Intermediário" },
  { id:"n2", titulo:"Análise de Malware", cargaHoraria:50, nivel:"Avançado" },
  { id:"n3", titulo:"Perícia em Sistemas Móveis", cargaHoraria:36, nivel:"Intermediário" },
  { id:"n4", titulo:"Python para Perícia Digital", cargaHoraria:40, nivel:"Inicial" },
];

const desempenhoMensal = [
  { mes:"Mar", media:7.4, horas:18 },
  { mes:"Abr", media:7.8, horas:22 },
  { mes:"Mai", media:8.1, horas:24 },
  { mes:"Jun", media:8.3, horas:27 },
  { mes:"Jul", media:8.5, horas:25 },
  { mes:"Ago", media:8.7, horas:29 },
];

const faturas = [
  { id:"FAT-2025-071", referencia:"Mensalidade Julho/2025", valor:199.9, vencimento:"2025-07-10", status:"pago" },
  { id:"FAT-2025-081", referencia:"Mensalidade Agosto/2025", valor:199.9, vencimento:"2025-08-10", status:"pendente" },
  { id:"FAT-2025-091", referencia:"Mensalidade Setembro/2025", valor:199.9, vencimento:"2025-09-10", status:"aberto" },
];

const provasRecentes = [
  { curso:"Informática Forense Avançada", data:"2025-07-28", nota:8.6 },
  { curso:"Segurança em Redes", data:"2025-07-20", nota:7.9 },
  { curso:"LGPD", data:"2025-07-10", nota:9.1 },
];

// ====== UTIL ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const brDate = (s) => new Date(s).toLocaleDateString("pt-BR");
const fmt = (sec)=>{ const h=Math.floor(sec/3600); const m=Math.floor((sec%3600)/60); const s=sec%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` };
const credits = (sec)=> Math.floor(sec/3600);

// ====== TABS ======
function setupTabs(){
  const sections = $$('main section');
  const buttons = $$('.tab-btn');
  function activate(tab){
    sections.forEach(s=>s.classList.remove('active'));
    const target = $(`#tab-${tab}`);
    if(target) target.classList.add('active');
    buttons.forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    // Corrige tamanho de gráficos quando a aba é aberta
    if(tab==='desempenho' || tab==='inicio'){ renderCharts(); }
  }
  buttons.forEach(btn=>btn.addEventListener('click',()=>activate(btn.dataset.tab)));
  // Estado inicial
  const initial = buttons.find(b=>b.classList.contains('active'))?.dataset.tab || 'inicio';
  activate(initial);
}

// ====== BUSCA ======
function setupSearch(){
  const input=$('#busca'); if(!input) return;
  input.addEventListener('input', (e)=>{
    const q = e.target.value.toLowerCase();
    const filtrados = cursosMatriculados.filter(c=>c.titulo.toLowerCase().includes(q));
    renderCursos(filtrados);
    renderProgresso(filtrados);
    renderProvasAgenda(filtrados);
  });
}

// ====== MÉTRICAS ======
function renderMetricas(){
  const ativos = cursosMatriculados.filter(c=>c.status!=="concluido").length;
  const horas = Math.round(cursosMatriculados.reduce((acc,c)=>acc + c.cargaHoraria*(c.progresso/100),0));
  const media = (desempenhoMensal.reduce((acc,d)=>acc + d.media, 0)/desempenhoMensal.length).toFixed(1);
  const pend = cursosMatriculados.filter(c=>c.status==="andamento" && c.proximaAvaliacao).length;
  $('#metric-cursos').textContent = ativos;
  $('#metric-horas').textContent = `${horas}h`;
  $('#metric-media').textContent = media;
  $('#metric-provas').textContent = pend;
  // KPIs aba Desempenho
  $('#kpi-media') && ($('#kpi-media').textContent = media);
  $('#kpi-horas') && ($('#kpi-horas').textContent = `${desempenhoMensal.reduce((a,d)=>a+d.horas,0)}h`);
  $('#kpi-provas') && ($('#kpi-provas').textContent = provasRecentes.length);
}

// ====== PROGRESSO POR CURSO ======
function renderProgresso(arr=cursosMatriculados){
  const wrap = $('#lista-progresso'); if(!wrap) return; wrap.innerHTML='';
  arr.forEach(c=>{
    const el=document.createElement('div'); el.className='row';
    el.innerHTML = `
      <div>
        <div style="font-weight:600">${c.titulo}</div>
        <div style="font-size:12px;color:var(--muted)">Carga horária: ${c.cargaHoraria}h • Status: <span class="badge ${c.status==='concluido'?'ok':''}">${c.status}</span></div>
        <div class="progress" style="margin-top:8px"><span style="width:${c.progresso}%"></span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${c.progresso}% concluído</div>
      </div>
      <div style="text-align:right;min-width:200px">
        ${c.proximaAvaliacao ? `<div style="font-size:13px">Próxima prova: <strong>${brDate(c.proximaAvaliacao)}</strong></div>` : `<div style="font-size:13px;color:var(--muted)">Sem avaliações pendentes</div>`}
        <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn">Ver conteúdo</button>
          <button class="btn primary">Continuar</button>
          <button class="btn ghost btn-study" data-course="${c.id}">Iniciar estudo</button>
        </div>
      </div>`;
    wrap.appendChild(el);
  });
  bindStudyButtons();
}

// ====== MEUS CURSOS ======
function renderCursos(arr=cursosMatriculados){
  const grid = $('#grid-cursos'); if(!grid) return; grid.innerHTML='';
  arr.forEach(c=>{
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <div class="body">
        <div style="font-weight:600">${c.titulo}</div>
        <div style="font-size:12px;color:var(--muted)">${c.cargaHoraria}h • ${c.status==='concluido'?'Concluído':'Em andamento'}</div>
        <div class="progress" style="margin-top:8px"><span style="width:${c.progresso}%"></span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${c.progresso}% concluído</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn">Material</button>
          <button class="btn primary">Continuar aulas</button>
          <button class="btn ghost btn-study" data-course="${c.id}">Iniciar estudo</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
  bindStudyButtons();
}

// ====== GRÁFICOS ======
let CHoras=null, CMedia=null, CInicio=null;
function renderCharts(){
  // Início – gráfico pequeno de notas
  const ctxInicio = document.getElementById('chart-media');
  if(ctxInicio){
    if(CInicio) CInicio.destroy();
    CInicio = new Chart(ctxInicio, {
      type:'line',
      data:{
        labels:desempenhoMensal.map(d=>d.mes),
        datasets:[{ label:'Média', data:desempenhoMensal.map(d=>d.media), tension:.35, borderColor:'#10807b', backgroundColor:'rgba(28,195,187,.15)', fill:true }]
      },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{min:0,max:10,grid:{color:'#eef4f8'}}, x:{grid:{display:false}} } }
    });
  }

  // Desempenho – 2 gráficos com filtro 3/6 meses
  function renderDesempenho(range=6){
    const data = desempenhoMensal.slice(-range);
    const labels = data.map(d=>d.mes);
    const horas = data.map(d=>d.horas);
    const medias = data.map(d=>d.media);
    const elHoras = document.getElementById('chart-horas');
    const elMedia = document.getElementById('chart-media-linha');
    if(elHoras){
      if(CHoras) CHoras.destroy();
      CHoras = new Chart(elHoras, { type:'bar', data:{ labels, datasets:[{ label:'Horas de estudo', data:horas, borderRadius:8, backgroundColor:'rgba(28,195,187,.55)' }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,grid:{color:'#eef4f8'}}, x:{grid:{display:false}} } } });
    }
    if(elMedia){
      if(CMedia) CMedia.destroy();
      CMedia = new Chart(elMedia, { type:'line', data:{ labels, datasets:[{ label:'Média', data:medias, tension:.35, borderWidth:2, borderColor:'#0d2b45', pointRadius:3, fill:false }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{min:0,max:10,grid:{color:'#eef4f8'}}, x:{grid:{display:false}} } } });
    }
  }
  renderDesempenho(6);
  $$('.range-btn').forEach(b=>b.addEventListener('click', ()=>{
    $$('.range-btn').forEach(x=>x.classList.remove('primary'));
    b.classList.add('primary');
    renderDesempenho(parseInt(b.dataset.range));
  }));
}

// ====== PROVAS ======
function renderProvasAgenda(arr=cursosMatriculados){
  const wrap = $('#lista-provas'); if(!wrap) return; wrap.innerHTML='';
  arr.filter(c=>c.proximaAvaliacao).forEach(c=>{
    const el=document.createElement('div'); el.className='row';
    el.innerHTML = `<div><div style="font-weight:600">${c.titulo}</div><div style="font-size:12px;color:var(--muted)">Próxima prova em ${brDate(c.proximaAvaliacao)}</div></div><div style="display:flex;gap:8px"><button class="btn">Ver detalhes</button><button class="btn primary">Iniciar simulado</button></div>`;
    wrap.appendChild(el);
  });
}

// ====== PAGAMENTOS ======
function renderPagamentos(){
  const tbody = document.querySelector('#tabela-faturas tbody'); if(!tbody) return; tbody.innerHTML='';
  faturas.forEach(f=>{
    const tr=document.createElement('tr');
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
function pagar(id){ alert(`Pagamento iniciado para ${id}`); }

// ====== INSCRIÇÕES ======
function renderCatalogo(){
  const grid = $('#grid-catalogo'); if(!grid) return; grid.innerHTML='';
  catalogoCursos.forEach(c=>{
    const card=document.createElement('div'); card.className='card';
    card.innerHTML = `<div class="body"><div style=\"font-weight:600\">${c.titulo}</div><div style=\"font-size:12px;color:var(--muted)\">${c.cargaHoraria}h • ${c.nivel}</div><button class=\"btn primary block\" style=\"margin-top:12px\" onclick=\"inscrever('${c.id}')\">Inscrever-se</button></div>`;
    grid.appendChild(card);
  })
}
function inscrever(id){ alert(`Inscrição realizada com sucesso no curso ${id}!`); }

// ====== PROVAS RECENTES ======
function renderProvasRecentes(){
  const wrap = $('#lista-provas-recentes'); if(!wrap) return; wrap.innerHTML='';
  provasRecentes.forEach(p=>{
    const el=document.createElement('div'); el.className='row';
    el.innerHTML = `<div><div style=\"font-weight:600\">${p.curso}</div><div style=\"font-size:12px;color:var(--muted)\">${brDate(p.data)}</div></div><span class=\"badge\">Nota ${p.nota}</span>`;
    wrap.appendChild(el);
  })
}

// ====== TRACKING DE TEMPO (1h = 1 crédito) ======
const STORAGE_KEY = 'altitude_study_time_v1';
const tracker = {
  data: { totalSeconds:0, byCourse:{}, current:null, lastActive:Date.now() },
  load(){ try{ const s = localStorage.getItem(STORAGE_KEY); if(s){ this.data = JSON.parse(s);} }catch(e){}
    this.data.totalSeconds ||= 0; this.data.byCourse ||= {}; this.data.current ||= null; },
  save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); },
  start(courseId){ if(this.data.current) return; this.data.current = { courseId, start:Date.now(), seconds:0 }; this.data.lastActive = Date.now(); ui.setCursoAtual(courseId); ui.setLiveDot(true); },
  pause(){ if(!this.data.current) return; this.tick(); this.data.current = null; ui.setLiveDot(false); },
  tick(){ if(!this.data.current) return; const now = Date.now(); const delta = Math.floor((now - this.data.lastActive)/1000); if(delta>0){ this.data.current.seconds += delta; this.data.totalSeconds += delta; const id = this.data.current.courseId; this.data.byCourse[id] = (this.data.byCourse[id]||0) + delta; this.data.lastActive = now; this.save(); ui.renderCounters(this); } },
  idleWatch(){ const idleLimitMs = 5*60*1000; if(this.data.current && (Date.now()-this.data.lastActive) > idleLimitMs){ this.pause(); alert('Sessão pausada por inatividade (5 min).'); } }
};

const ui = {
  setCursoAtual(id){ const c = cursosMatriculados.find(x=>x.id===id); $('#met-curso').textContent = c? c.titulo : '—'; },
  setLiveDot(active){ const dot = $('#pill-dot'); if(dot){ dot.classList.toggle('active', !!active); } },
  renderCounters(){ $('#met-total') && ($('#met-total').textContent = fmt(tracker.data.totalSeconds)); $('#met-creditos') && ($('#met-creditos').textContent = credits(tracker.data.totalSeconds)); },
  renderLive(){ const live = tracker.data.current? tracker.data.current.seconds : 0; $('#met-sessao') && ($('#met-sessao').textContent = fmt(live)); $('#pill-timer').textContent = fmt(live); $('#pill-credits').textContent = `${credits(tracker.data.totalSeconds)} créditos`; },
  renderHorasPorCurso(){ const wrap = $('#lista-horas-curso'); if(!wrap) return; wrap.innerHTML = ''; cursosMatriculados.forEach(c=>{ const sec = tracker.data.byCourse[c.id]||0; const row=document.createElement('div'); row.className='row'; row.innerHTML = `<div><div style=\"font-weight:600\">${c.titulo}</div><div style=\"font-size:12px;color:var(--muted)\">${fmt(sec)} • Créditos: <strong>${credits(sec)}</strong></div></div><div style=\"display:flex;gap:8px\"><button class=\"btn ghost btn-study\" data-course=\"${c.id}\">${tracker.data.current && tracker.data.current.courseId===c.id? 'Pausar estudo':'Iniciar estudo'}</button></div>`; wrap.appendChild(row); }); bindStudyButtons(); }
};

function bindStudyButtons(){
  $$('.btn-study').forEach(b=>{
    b.onclick = ()=>{
      const id = b.getAttribute('data-course');
      if(tracker.data.current && tracker.data.current.courseId===id){ tracker.pause(); refreshStudyButtons(); }
      else if(tracker.data.current){ tracker.pause(); tracker.start(id); refreshStudyButtons(); }
      else { tracker.start(id); refreshStudyButtons(); }
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

// Atividade do usuário (idle)
['mousemove','keydown','click','scroll','touchstart'].forEach(evt=>{
  document.addEventListener(evt, ()=>{ tracker.data.lastActive = Date.now(); });
});
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) tracker.pause(); });
window.addEventListener('beforeunload', ()=>{ tracker.pause(); tracker.save(); });
setInterval(()=>{ tracker.tick(); ui.renderLive(); tracker.idleWatch(); }, 1000);

// Export/certificado (mock)
const btnExp = document.getElementById('btn-exportar'); if(btnExp){ btnExp.addEventListener('click', ()=>{ const blob=new Blob([JSON.stringify(tracker.data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='horas-estudo.json'; a.click(); URL.revokeObjectURL(url); }); }
const btnCert = document.getElementById('btn-mock-cert'); if(btnCert){ btnCert.addEventListener('click', ()=> alert(`Certificado mock: ${credits(tracker.data.totalSeconds)} créditos acumulados.`)); }

// ====== INIT ======
function init(){
  document.getElementById('yr').textContent = new Date().getFullYear();
  tracker.load();
  setupTabs();
  setupSearch();
  renderMetricas();
  renderProgresso();
  renderCursos();
  renderCharts();
  renderProvasAgenda();
  renderPagamentos();
  renderCatalogo();
  renderProvasRecentes();
  ui.renderCounters(); ui.renderLive(); ui.renderHorasPorCurso();
  bindStudyButtons();
}
init();
