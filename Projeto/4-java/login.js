/
/*-- ======================= SCRIPT ======================= -->
<script>
/* ============================================================
   PORTAL DO ALUNO – JS COMPLETO E COMENTADO
   ============================================================ */

/* ----------------- Bandeiras / Demo ----------------- */
const DEMO = new URLSearchParams(location.search).get('demo') === '1'; // ?demo=1 ativa dados de exemplo

/* ----------------- Estado persistente ----------------- */
const KEY='aluno_v1';
const initialState={
  perfil:{ nome:'', ra:'', email:'', telefone:'', foto:'' },
  study:{ totalSec:0, lastActive:Date.now() },
  courses:{ available:[], enrolled:[] /* [{id,progress,modulesDone:[],sec,quiz:{score,date}}] */ },
  performance:{ mediaGeral:0, provasFeitas:0, cursosConcluidos:0, notasHistorico:[] },
  payments:{ balanceCert:0, paidOk:false, tx:[], couponsApplied:[] },
  certificates:{ issued:[] /* {id,curso,data} */ },
  forum:{ seqYear:new Date().getFullYear(), seq:0, tickets:[] /* {num,title,cat,status,solver,date} */ },
  promos:[
    /* preenchido no init (ou vindo do gestor) */
  ]
};
let state = load();

/* ----------------- Utilidades ----------------- */
function load(){ try{ return JSON.parse(localStorage.getItem(KEY))||structuredClone(initialState);}catch{ return structuredClone(initialState); } }
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function formatHMS(sec){
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function toast(msg, ms=2000){ const t=document.getElementById('toast');document.getElementById('toast-msg').textContent=msg;t.style.display='grid';setTimeout(()=>t.style.display='none',ms); }

/* ----------------- RA imutável ----------------- */
function ensureRA(){
  if(!state.perfil.ra){
    // RA gerado uma única vez e travado (ex.: AAAAMMDD + rand)
    const d=new Date(), part=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    state.perfil.ra = `RA${part}${Math.floor(Math.random()*900+100)}`;
    save();
  }
}

/* ----------------- Timer Global com inatividade ----------------- */
let timer=null; const INAT_MS=5*60*1000;
function startTimer(){
  if(timer) clearInterval(timer);
  timer=setInterval(()=>{
    if(Date.now()-state.study.lastActive < INAT_MS){
      state.study.totalSec++;
      // créditos: 1h=1
      renderSession();
      save();
    }
  },1000);
}
['mousemove','keydown','click','touchstart'].forEach(evt=>{
  document.addEventListener(evt,()=>{ state.study.lastActive=Date.now(); });
});
function renderSession(){
  document.getElementById('pill-timer').textContent = formatHMS(state.study.totalSec);
  const credits = Math.floor(state.study.totalSec/3600);
  document.getElementById('pill-credits').textContent = `${credits} créditos`;
  // métricas relacionadas
  document.getElementById('met-total').textContent = formatHMS(state.study.totalSec);
  document.getElementById('met-creditos').textContent = String(credits);
}

/* ----------------- Tabs ----------------- */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('section').forEach(s=>s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if(btn.dataset.tab==='desempenho'){ drawCharts(); }
  });
});

/* ----------------- Cursos (API-ready + demo) ----------------- */
// Estrutura esperada do backend (gestor):
// GET /api/cursos -> [{id,titulo,descricao,area,imagem,inscritos,estrelas,modulos:[{titulo,pdf,video}]}]
async function fetchCursos(){
  try{
    // Trocar para sua API real quando o gestor estiver pronto:
    // const res = await fetch('/api/cursos'); const data = await res.json();
    // return data;

    if(DEMO){
      return [
        {id:1,titulo:'Lógica de Programação',descricao:'Algoritmos, variáveis, estruturas de controle.',
         area:'Tecnologia',imagem:'https://picsum.photos/seed/logic/600/360',inscritos:125,estrelas:4.7,
         modulos:[
          {titulo:'Módulo 1: Fundamentos',pdf:'',video:''},
          {titulo:'Módulo 2: Condicionais',pdf:'',video:''},
          {titulo:'Módulo 3: Laços',pdf:'',video:''},
          {titulo:'Módulo 4: Funções',pdf:'',video:''},
         ]},
        {id:2,titulo:'Informática Forense',descricao:'Coleta e preservação de evidências digitais.',
         area:'Segurança',imagem:'https://picsum.photos/seed/forense/600/360',inscritos:89,estrelas:4.6,
         modulos:[
          {titulo:'Módulo 1: Introdução',pdf:'',video:''},
          {titulo:'Módulo 2: Cadeia de Custódia',pdf:'',video:''},
          {titulo:'Módulo 3: Ferramentas',pdf:'',video:''},
          {titulo:'Módulo 4: Relatórios',pdf:'',video:''},
         ]},
        {id:3,titulo:'LGPD na Prática',descricao:'Bases legais, direitos do titular e DPO.',
         area:'Jurídico',imagem:'https://picsum.photos/seed/lgpd/600/360',inscritos:203,estrelas:4.8,
         modulos:[
          {titulo:'Módulo 1: Fundamentos',pdf:'',video:''},
          {titulo:'Módulo 2: Bases Legais',pdf:'',video:''},
          {titulo:'Módulo 3: Direitos',pdf:'',video:''},
          {titulo:'Módulo 4: Casos',pdf:'',video:''},
         ]},
      ];
    }
    return []; // sem demo: aguarda backend
  }catch(e){ console.error(e); return []; }
}
async function initCatalogo(){
  if(!state.courses.available.length){
    state.courses.available = await fetchCursos();
    // áreas para filtro
    const areas=[...new Set(state.courses.available.map(c=>c.area))];
    const sel=document.getElementById('filtro-area');
    areas.forEach(a=>{ const o=document.createElement('option');o.value=a;o.textContent=a;sel.appendChild(o); });
    save();
  }
  renderCatalogo();
}
function renderCatalogo(){
  const wrap=document.getElementById('grid-catalogo'); wrap.innerHTML='';
  const area=document.getElementById('filtro-area').value;
  state.courses.available
    .filter(c=>!area || c.area===area)
    .forEach(c=>{
      const el=document.createElement('div'); el.className='card';
      el.innerHTML=`
        <img src="${c.imagem}" alt="" style="width:100%;height:160px;object-fit:cover;border-bottom:1px solid var(--border)">
        <div class="body">
          <h4 style="margin:0 0 4px">${c.titulo}</h4>
          <small class="muted">${c.area} • ${c.inscritos} inscritos • ⭐ ${c.estrelas}</small>
          <p style="margin:8px 0 10px;color:var(--muted);font-size:13px">${c.descricao}</p>
          <button class="btn primary" data-id="${c.id}">Inscrever-se</button>
        </div>`;
      wrap.appendChild(el);
    });
  wrap.querySelectorAll('button[data-id]').forEach(b=>{
    b.addEventListener('click',()=>{
      const id=Number(b.dataset.id);
      if(!state.courses.enrolled.find(e=>e.id===id)){
        state.courses.enrolled.push({id,progress:0,modulesDone:[],sec:0,quiz:null});
        toast('Inscrição realizada! O curso foi para "Meus Cursos".');
        save(); renderMeusCursos(); updateMetrics();
      }
    });
  });
}
document.getElementById('filtro-area').addEventListener('change', renderCatalogo);

/* ----------------- Meus Cursos + Painel ----------------- */
function renderMeusCursos(){
  const grid=document.getElementById('grid-cursos'); grid.innerHTML='';
  state.courses.enrolled.forEach(ec=>{
    const c=state.courses.available.find(x=>x.id===ec.id); if(!c) return;
    const card=document.createElement('div');card.className='card';
    const done = ec.progress===100 ? '<span class="tag ok">Concluído</span>' : '';
    card.innerHTML=`
      <img src="${c.imagem}" style="width:100%;height:150px;object-fit:cover;border-bottom:1px solid var(--border)">
      <div class="body">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4 style="margin:0">${c.titulo}</h4> ${done}
        </div>
        <div class="row" style="margin-top:8px"><span>Progresso</span>
          <div style="flex:1;height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:0 8px">
            <span style="display:block;height:100%;width:${ec.progress}%;background:linear-gradient(90deg,var(--brand),#22d3ee)"></span>
          </div>
          <strong>${ec.progress}%</strong>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" data-open="${c.id}">Iniciar estudo</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
  // abrir painel
  grid.querySelectorAll('button[data-open]').forEach(b=>{
    b.addEventListener('click',()=>openCourse(Number(b.dataset.open)));
  });
}
let currentCourseId=null, courseTimer=null;
function openCourse(id){
  currentCourseId=id;
  const c=state.courses.available.find(x=>x.id===id);
  const ec=state.courses.enrolled.find(x=>x.id===id);
  if(!c||!ec) return;
  document.getElementById('cp-titulo').textContent=c.titulo;
  document.getElementById('curso-panel').style.display='block';
  document.getElementById('grid-cursos').style.display='none';

  // lista módulos
  const mods=document.getElementById('cp-modulos'); mods.innerHTML='';
  c.modulos.forEach((m,idx)=>{
    const done = ec.modulesDone.includes(idx);
    const el=document.createElement('button'); el.className='mod-btn'+(done?' done':'');
    el.dataset.idx=idx;
    el.innerHTML=`<span>${m.titulo}</span> ${done?'<span class="tag ok">OK</span>':''}`;
    el.addEventListener('click',()=>loadModule(idx));
    mods.appendChild(el);
  });

  // habilita prova se concluiu todos
  document.getElementById('cp-btn-prova').disabled = ec.modulesDone.length < c.modulos.length;

  // timer do curso
  if(courseTimer) clearInterval(courseTimer);
  courseTimer=setInterval(()=>{ ec.sec++; renderCourseTimer(ec.sec); save(); },1000);

  // handlers
  document.getElementById('btn-voltar-meus').onclick=closeCourse;
  document.getElementById('cp-btn-prova').onclick=()=>showExam();
  // carregar primeiro módulo automaticamente
  loadModule(0);
  renderCourseTimer(ec.sec);
}
function renderCourseTimer(sec){
  document.getElementById('cp-timer').textContent=formatHMS(sec);
  document.getElementById('cp-creditos').textContent=`${Math.floor(sec/3600)} créditos`;
}
function closeCourse(){
  if(courseTimer) clearInterval(courseTimer);
  document.getElementById('curso-panel').style.display='none';
  document.getElementById('grid-cursos').style.display='grid';
  currentCourseId=null;
}
function loadModule(idx){
  const c=state.courses.available.find(x=>x.id===currentCourseId);
  const ec=state.courses.enrolled.find(x=>x.id===currentCourseId);
  const m=c.modulos[idx];
  document.getElementById('cp-view-prova').style.display='none';
  document.getElementById('cp-view-modulo').style.display='block';
  document.getElementById('cp-mod-titulo').textContent=m.titulo;
  document.getElementById('cp-pdf').src=m.pdf||'';
  document.getElementById('cp-pdf-link').href=m.pdf||'#';
  document.getElementById('cp-video').src=m.video||'';
  const flag=document.getElementById('cp-flag-conc');
  flag.style.display = (ec.modulesDone.includes(idx)?'inline-block':'none');
  document.getElementById('cp-btn-concluir').onclick=()=>{
    if(!ec.modulesDone.includes(idx)){
      ec.modulesDone.push(idx);
      // progresso
      ec.progress = Math.round(ec.modulesDone.length*100/c.modulos.length);
      save(); renderMeusCursos();
      // marcar visual
      document.querySelectorAll('#cp-modulos .mod-btn')[idx].classList.add('done');
      flag.style.display='inline-block';
      // habilita prova?
      document.getElementById('cp-btn-prova').disabled = ec.modulesDone.length < c.modulos.length;
      toast('Módulo concluído!');
      document.getElementById('cp-progresso').textContent = ec.progress+'%';
    }
  };
  document.getElementById('cp-progresso').textContent = ec.progress+'%';
}
function showExam(){
  document.getElementById('cp-view-modulo').style.display='none';
  document.getElementById('cp-view-prova').style.display='block';
  const form=document.getElementById('cp-quiz');
  const result=document.getElementById('cp-resultado');
  form.reset(); result.style.display='none';

  // bloquear copiar/colar/selecionar
  form.addEventListener('copy',e=>e.preventDefault());
  form.addEventListener('cut',e=>e.preventDefault());
  form.addEventListener('paste',e=>e.preventDefault());
  form.addEventListener('contextmenu',e=>e.preventDefault());

  form.onsubmit=(e)=>{
    e.preventDefault();
    // gabarito
    const ans={q1:'b',q2:'c',q3:'a',q4:'a',q5:'a'};
    let score=0;
    Object.keys(ans).forEach(k=>{
      const v=(new FormData(form)).get(k);
      if(v===ans[k]) score+=2; // 5 questões *2 = 10
    });
    const ec=state.courses.enrolled.find(x=>x.id===currentCourseId);
    ec.quiz={score, date:new Date().toISOString()};
    // atualiza performance
    state.performance.notasHistorico.push(score);
    state.performance.mediaGeral = calcMedia(state.performance.notasHistorico);
    state.performance.provasFeitas = state.performance.notasHistorico.length;
    if(ec.progress===100){ state.performance.cursosConcluidos = (state.performance.cursosConcluidos||0)+1; }
    save(); updateMetrics(); drawCharts();

    result.style.display='flex';
    result.innerHTML=`<strong>Nota:</strong> ${score.toFixed(1)} / 10 • <span class="tag ${score>=6?'ok':'warn'}">${score>=6?'Aprovado':'Em recuperação'}</span>`;
    toast('Prova enviada!');
  };
}

/* ----------------- Métricas + Início ----------------- */
function updateMetrics(){
  document.getElementById('metric-cursos').textContent=String(state.courses.enrolled.length);
  document.getElementById('metric-horas').textContent = Math.floor(state.study.totalSec/3600)+'h';
  document.getElementById('metric-media').textContent = (state.performance.mediaGeral||0).toFixed(1);
  document.getElementById('metric-certificados').textContent = String(state.payments.balanceCert);

  // KPIs Desempenho
  document.getElementById('kpi-media').textContent=(state.performance.mediaGeral||0).toFixed(1);
  document.getElementById('kpi-horas').textContent=Math.floor(state.study.totalSec/3600)+'h';
  document.getElementById('kpi-provas').textContent=String(state.performance.provasFeitas||0);
  // cursos concluídos (progress==100)
  const concl=state.courses.enrolled.filter(e=>e.progress===100).length;
  document.getElementById('kpi-cursos').textContent=String(concl);

  // Lista de progresso
  const list=document.getElementById('lista-progresso'); list.innerHTML='';
  state.courses.enrolled.forEach(ec=>{
    const c=state.courses.available.find(x=>x.id===ec.id); if(!c) return;
    const el=document.createElement('div'); el.className='row';
    el.innerHTML=`<div style="display:flex;align-items:center;gap:8px">
        <img src="${c.imagem}" style="width:56px;height:36px;object-fit:cover;border-radius:6px">
        <div><strong>${c.titulo}</strong><div class="muted" style="font-size:12px">${c.area}</div></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:120px;height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden">
          <span style="display:block;height:100%;width:${ec.progress}%;background:linear-gradient(90deg,var(--brand),#22d3ee)"></span>
        </div>
        <strong>${ec.progress}%</strong>
      </div>`;
    list.appendChild(el);
  });

  // Créditos & Certificados
  document.getElementById('met-saldo-cert').textContent = String(state.payments.balanceCert);
  document.getElementById('met-cert-emit').textContent = String(state.certificates.issued.length);

  // Tabela de certificados
  const tbody=document.querySelector('#tabela-certs tbody'); tbody.innerHTML='';
  state.certificates.issued.forEach((c,i)=>{
    const tr=document.createElement('tr'); tr.innerHTML=`<td>${i+1}</td><td>${c.curso||'-'}</td><td>${new Date(c.data).toLocaleString('pt-BR')}</td>`;
    tbody.appendChild(tr);
  });
}
function calcMedia(arr){ if(!arr.length) return 0; return arr.reduce((a,b)=>a+b,0)/arr.length; }

/* ----------------- Charts ----------------- */
let chMedia=null, chHoras=null, chLinha=null;
function drawCharts(){
  // Evolução de notas (Início)
  const ctx1=document.getElementById('chart-media').getContext('2d');
  if(chMedia) chMedia.destroy();
  chMedia=new Chart(ctx1,{type:'line',data:{labels: state.performance.notasHistorico.map((_,i)=>`P${i+1}`),
    datasets:[{label:'Notas',data: state.performance.notasHistorico, borderColor:'#1cc3bb',backgroundColor:'rgba(28,195,187,.15)', fill:true,tension:.3}]},
    options:{plugins:{legend:{display:false}}, scales:{y:{min:0,max:10}}}
  });

  // Horas (Desempenho) – simples por meses (mock a partir do total)
  const horas=Math.floor(state.study.totalSec/3600);
  const arr=[...Array(6)].map((_,i)=>Math.max(0, Math.floor(horas/6)+(i%2?1:-1)));
  const ctx2=document.getElementById('chart-horas').getContext('2d');
  if(chHoras) chHoras.destroy();
  chHoras=new Chart(ctx2,{type:'bar',data:{labels:['Mar','Abr','Mai','Jun','Jul','Ago'],datasets:[{label:'Horas',data:arr}]},options:{plugins:{legend:{display:false}}}});

  // Média linha (Desempenho)
  const ctx3=document.getElementById('chart-media-linha').getContext('2d');
  if(chLinha) chLinha.destroy();
  chLinha=new Chart(ctx3,{type:'line',data:{labels:['Mar','Abr','Mai','Jun','Jul','Ago'],datasets:[{label:'Média',data:calcSerieMedia(),borderColor:'#1cc3bb',tension:.25}]},options:{plugins:{legend:{display:false}},scales:{y:{min:0,max:10}}}});
}
function calcSerieMedia(){
  const ns=state.performance.notasHistorico.slice(-6);
  const out=[]; let m=0;
  for(let i=0;i<6;i++){ if(ns[i]!=null){ m = (m*(i)+ns[i])/(i+1); } out.push(Number(m.toFixed(1))); }
  while(out.length<6) out.unshift(0);
  return out;
}

/* ----------------- Pagamentos + cupons + InfinityPay (placeholder) ----------------- */
function initPromos(){
  if(!state.promos.length){
    state.promos = DEMO ? [
      {id:'pk5', titulo:'Pacote 5 certificados', qtd:5, preco:49.9 },
      {id:'pk10', titulo:'Pacote 10 certificados', qtd:10, preco:79.9 },
      {id:'pk20', titulo:'Pacote 20 certificados', qtd:20, preco:129.9 },
    ] : [];
    save();
  }
  renderPromos();
}
let selPromo=null, desconto=0;
function renderPromos(){
  const wrap=document.getElementById('lista-promos'); wrap.innerHTML='';
  state.promos.forEach(p=>{
    const el=document.createElement('div'); el.className='card';
    el.innerHTML=`<div class="body">
      <h4 style="margin:0 0 6px">${p.titulo}</h4>
      <div class="muted" style="font-size:13px">${p.qtd} certificados</div>
      <div style="margin:8px 0"><strong>R$ ${p.preco.toFixed(2)}</strong></div>
      <button class="btn" data-promo="${p.id}">Selecionar</button>
    </div>`;
    wrap.appendChild(el);
  });
  wrap.querySelectorAll('button[data-promo]').forEach(b=>{
    b.addEventListener('click',()=>{
      selPromo=state.promos.find(x=>x.id===b.dataset.promo);
      desconto=0;
      document.getElementById('cupom').value='';
      renderResumo();
    });
  });
  renderResumo();
}
function renderResumo(){
  const el=document.getElementById('resumo-pag');
  if(!selPromo){ el.innerHTML='<em>Selecione um pacote ao lado.</em>'; return; }
  const total = Math.max(selPromo.preco - desconto, 0);
  el.innerHTML=`<div class="row" style="justify-content:space-between"><span>Pacote:</span><strong>${selPromo.titulo}</strong></div>
  <div class="row" style="justify-content:space-between"><span>Subtotal:</span><strong>R$ ${selPromo.preco.toFixed(2)}</strong></div>
  <div class="row" style="justify-content:space-between"><span>Desconto:</span><strong>R$ ${desconto.toFixed(2)}</strong></div>
  <div class="row" style="justify-content:space-between"><span>Total:</span><strong>R$ ${total.toFixed(2)}</strong></div>`;
}
document.getElementById('btn-aplicar-cupom').addEventListener('click',()=>{
  const c = (document.getElementById('cupom').value||'').trim().toUpperCase();
  if(!selPromo){ toast('Escolha um pacote primeiro.'); return; }
  if(!c){ desconto=0; renderResumo(); return; }
  // Lado do gestor: criar cupons no backend; aqui, demo:
  if(DEMO && (c==='BEMVINDO10'||c==='ALUNO20')){
    const perc = c==='BEMVINDO10'? .10 : .20;
    desconto = selPromo.preco*perc;
    toast(`Cupom aplicado: ${Math.round(perc*100)}%`);
  }else{
    desconto=0; toast('Cupom inválido.');
  }
  renderResumo();
});
// Botão pagar – integração oficial deve ser NO BACKEND (rigorosa!)
document.getElementById('btn-pagar').addEventListener('click',()=>{
  if(!selPromo){ toast('Selecione um pacote.'); return; }
  // Front envia intenção de compra -> backend cria transação InfinityPay e retorna link
  // Aqui, demo:
  toast('Redirecionando para InfinityPay (demo)…',1500);
  if(DEMO){ document.getElementById('dev-approve').style.display='block'; }
});
// DEMO: aprovar pagamento (simula Webhook do backend)
document.getElementById('btn-dev-aprovar').addEventListener('click',()=>{
  if(!selPromo) return;
  state.payments.paidOk=true;
  state.payments.balanceCert += selPromo.qtd;
  state.payments.tx.push({id:'demo',valor:selPromo.preco - desconto, qtd:selPromo.qtd, date:new Date().toISOString()});
  save(); updateMetrics();
  toast('Pagamento confirmado! Saldo de certificados atualizado.');
});

/* ----------------- Certificados ----------------- */
document.getElementById('btn-emitir-cert').addEventListener('click',()=>{
  // Rigor: só libera se backend confirmou pagamento (paidOk) e saldo >0
  if(!state.payments.paidOk){ toast('Pagamento ainda não confirmado.'); return; }
  if(state.payments.balanceCert<=0){ toast('Sem saldo de certificados.'); return; }
  // Escolher curso concluído (exemplo: primeiro com 100%)
  const concl = state.courses.enrolled.find(e=>e.progress===100);
  const curso = concl ? (state.courses.available.find(c=>c.id===concl.id)?.titulo) : null;
  state.payments.balanceCert--;
  state.certificates.issued.push({id:crypto.randomUUID(), curso:curso||'Geral', data:new Date().toISOString()});
  save(); updateMetrics();
  toast('Certificado emitido!');
});

/* ----------------- Perfil + Carteirinha ----------------- */
function renderProfile(){
  const p=state.perfil;
  // Cabeçalho
  document.getElementById('brand-name').textContent = p.nome || 'Portal do Aluno';
  document.getElementById('brand-ra').textContent = p.ra || '—';
  if(p.foto){
    const img=document.createElement('img'); img.src=p.foto;
    const bl=document.getElementById('brand-logo'); bl.innerHTML=''; bl.appendChild(img);
  }else{
    document.getElementById('brand-logo').textContent='PA';
  }
  // Perfil
  document.getElementById('pf-nome').value=p.nome||'';
  document.getElementById('pf-email').value=p.email||'';
  document.getElementById('pf-tel').value=p.telefone||'';
  document.getElementById('pf-ra').value=p.ra||'';
  const thumb=document.getElementById('pf-thumb');
  if(p.foto){ thumb.innerHTML=`<img src="${p.foto}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; } else { thumb.textContent='PA'; }

  // Carteirinha
  document.getElementById('card-nome').textContent=p.nome||'—';
  document.getElementById('card-ra').textContent=p.ra||'—';
  document.getElementById('card-ano').textContent=new Date().getFullYear();
  document.getElementById('card-foto').src=p.foto||'';
}
document.getElementById('pf-foto').addEventListener('change', e=>{
  const file=e.target.files?.[0]; if(!file) return;
  const r=new FileReader(); r.onload=()=>{ state.perfil.foto=r.result; save(); renderProfile(); }; r.readAsDataURL(file);
});
document.getElementById('btn-salvar-perfil').addEventListener('click', ()=>{
  state.perfil.nome=document.getElementById('pf-nome').value.trim();
  state.perfil.email=document.getElementById('pf-email').value.trim();
  state.perfil.telefone=document.getElementById('pf-tel').value.trim();
  save(); renderProfile(); toast('Perfil salvo!');
});
document.getElementById('print-card').addEventListener('click',()=>window.print());

/* ----------------- Fórum / Chamados ----------------- */
function nextTicketNumber(){
  const year=new Date().getFullYear();
  if(state.forum.seqYear!==year){ state.forum.seqYear=year; state.forum.seq=0; }
  state.forum.seq++;
  return `${year}-${String(state.forum.seq).padStart(3,'0')}`;
}
function renderChamados(){
  const tb=document.querySelector('#tabela-chamados tbody'); tb.innerHTML='';
  state.forum.tickets
    .slice().sort((a,b)=>new Date(b.date)-new Date(a.date))
    .forEach(t=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${t.num}</td><td>${t.title}</td>
        <td><span class="tag ${t.status==='Resolvido'?'ok':(t.status==='Atendendo'?'info':'warn')}">${t.status}</span></td>
        <td>${t.solver || '—'}</td><td>${new Date(t.date).toLocaleString('pt-BR')}</td>`;
      tb.appendChild(tr);
    });
}
document.getElementById('btn-enviar-chamado').addEventListener('click',()=>{
  const title=(document.getElementById('ch-titulo').value||'').trim();
  const cat=document.getElementById('ch-cat').value||'';
  const desc=(document.getElementById('ch-desc').value||'').trim();
  if(!title||!desc){ toast('Preencha título e descrição.'); return; }
  const num=nextTicketNumber();
  state.forum.tickets.push({ num, title, cat, desc, status:'Em análise', solver:'', date:new Date().toISOString(), aluno: state.perfil.nome, ra: state.perfil.ra });
  save(); renderChamados(); toast(`Chamado ${num} aberto!`);
  document.getElementById('ch-titulo').value=''; document.getElementById('ch-desc').value='';
});
document.getElementById('btn-limpar-chamado').addEventListener('click',()=>{
  document.getElementById('ch-titulo').value=''; document.getElementById('ch-desc').value='';
});

/* ----------------- Busca (filtra cursos) ----------------- */
document.getElementById('busca').addEventListener('input',e=>{
  const q=e.target.value.toLowerCase();
  // Filtra em Inscrições
  document.querySelectorAll('#grid-catalogo .card').forEach(card=>{
    const t=card.querySelector('h4')?.textContent.toLowerCase()||'';
    card.style.display = t.includes(q)?'block':'none';
  });
  // Filtra Meus Cursos
  document.querySelectorAll('#grid-cursos .card').forEach(card=>{
    const t=card.querySelector('h4')?.textContent.toLowerCase()||'';
    card.style.display = t.includes(q)?'block':'none';
  });
});

/* ----------------- Inicialização ----------------- */
function init(){
  ensureRA();
  // perfil inicial
  if(!state.perfil.nome && DEMO){ state.perfil.nome='Aluno Demo'; }
  renderProfile();

  // demo cursos/cupom/promos
  initCatalogo();
  initPromos();

  // métricas e UI
  renderMeusCursos();
  updateMetrics();
  drawCharts();

  // carteirinha validade
  document.getElementById('yr').textContent = new Date().getFullYear();

  // Timer global
  startTimer();

  // Botão voltar do curso
  document.getElementById('btn-voltar-meus').addEventListener('click',closeCourse);
}
init();
