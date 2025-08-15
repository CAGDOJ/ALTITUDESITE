
/* ================== CONFIG SUPABASE ================== */
// PREENCHA com os dados do seu projeto:
const SUPA_URL = 'https://mxnvrxqwokvelulzdvmn.supabase.co';
const SUPA_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bnZyeHF3b2t2ZWx1bHpkdm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NTQ4MjAsImV4cCI6MjA3MDQzMDgyMH0.DBntQQc91IWYAvMxHknJxjxxFAl5kiWOkc1LUXe_vKE';
const supa = supabase.createClient(SUPA_URL, SUPA_ANON_KEY);

/* ================== ESTADO / HELPERS ================== */
const qs = new URLSearchParams(location.search);
const DEMO = qs.get('demo')==='1';
const IS_ADMIN = qs.get('admin')==='1';
const ADMIN_NAME = qs.get('adminName') || 'Gestor';
const KEY='aluno_portal_sb_v1';

const state = load() || {
  auth:{ id:'', email:'', ra:'', registeredAt:'' },
  perfil:{ nome:'', telefone:'', foto:'' },
  study:{ totalSec:0, lastActive:Date.now(), adjustments:[] },
  courses:{ available:[], enrolled:[] },
  performance:{ notasHistorico:[], mediaGeral:0, provasFeitas:0 },
  payments:{ balanceCert:0, paidOk:false, tx:[], couponsApplied:[] },
  certificates:{ issued:[] },
  forum:{ seqYear:new Date().getFullYear(), seq:-1, tickets:[] },
  promos:[]
};
function load(){ try{return JSON.parse(localStorage.getItem(KEY))}catch{return null} }
function save(){ localStorage.setItem(KEY, JSON.stringify(state)) }
function toast(msg,ms=1800){ const el=document.getElementById('toast'); document.getElementById('toastMsg').textContent=msg; el.style.display='grid'; setTimeout(()=>el.style.display='none',ms); }
function hms(sec){ const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` }

/* ================== LOGIN / PERFIL (Supabase) ==================
   - Busca o usuário logado
   - Se não existir perfil em "students", chama RPC register_current_user()
   - RA é gerado no banco (trigger). Nunca muda depois.
=============================================================== */
async function fetchMeSupabase(){
  try{
    // precisa estar autenticado (use sua tela de login)
    const { data: { user } } = await supa.auth.getUser();
    if(!user){
      if(DEMO){
        // modo demo: usa query params
        const emailParam = qs.get('email') || 'aluno@demo.com';
        const raParam = qs.get('ra') || 'RA2025-000001';
        const regParam = qs.get('reg') || new Date().toISOString();
        state.auth = { id:'demo', email:emailParam, ra:raParam, registeredAt:regParam };
        save(); return;
      } else {
        toast('Faça login para continuar.');
        return;
      }
    }

    state.auth.id = user.id;

    // tenta pegar o perfil; se não existir, cria (gera RA)
    let { data: me, error } = await supa.rpc('get_me');
    if(error) throw error;

    if(!me){ // primeiro acesso: cria no banco e retorna já com RA
      const payload = { p_name: state.perfil.nome || null, p_phone: state.perfil.telefone || null };
      const { data: created, error: e2 } = await supa.rpc('register_current_user', payload);
      if(e2) throw e2;
      me = created;
    }

    // sincroniza estado
    state.auth.email = me.email;
    state.auth.ra = me.ra;
    state.auth.registeredAt = me.registered_at;
    state.perfil.nome = me.name || state.perfil.nome;
    state.perfil.telefone = me.phone || state.perfil.telefone;
    state.perfil.foto = me.photo || state.perfil.foto;
    save();
  }catch(e){
    console.error(e);
    if(DEMO){
      const emailParam = qs.get('email') || 'aluno@demo.com';
      const raParam = qs.get('ra') || 'RA2025-000001';
      const regParam = qs.get('reg') || new Date().toISOString();
      state.auth = { id:'demo', email:emailParam, ra:raParam, registeredAt:regParam };
      save();
      toast('Rodando em DEMO sem Supabase.');
    }else{
      toast('Erro ao carregar perfil.');
    }
  }
}

/* ================== TIMER GLOBAL ================== */
const INAT_MS = 5*60*1000;
let globalTimer=null;
function startGlobalTimer(){
  if(globalTimer) clearInterval(globalTimer);
  globalTimer = setInterval(()=>{
    if(Date.now()-state.study.lastActive < INAT_MS){
      state.study.totalSec++;
      renderSession(); save();
    }
  },1000);
}
['mousemove','keydown','click','touchstart','scroll'].forEach(evt=>{
  document.addEventListener(evt,()=>{ state.study.lastActive=Date.now(); });
});
function renderSession(){
  const credits = Math.floor(state.study.totalSec/3600);
  document.getElementById('pillTimer').textContent = hms(state.study.totalSec);
  document.getElementById('pillCredits').textContent = `${credits} créditos`;
  document.getElementById('metTotal').textContent = hms(state.study.totalSec);
  document.getElementById('metCreditos').textContent = String(credits);
}

/* ================== ROUTER ================== */
function goto(hash){ location.hash=hash; }
function syncTabsFromHash(){
  const h = location.hash || '#inicio';
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('section').forEach(s=>s.classList.remove('active'));

  if(h.startsWith('#curso/')){
    document.querySelector('[data-tab="cursos"]')?.classList.add('active');
    document.getElementById('tab-cursos').classList.add('active');
    const id = Number(h.split('/')[1]);
    openCourse(id);
    return;
  }
  const tab = h.replace('#','');
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  const sec = document.getElementById(`tab-${tab}`);
  if(btn && sec){ btn.classList.add('active'); sec.classList.add('active'); }
  if(tab==='desempenho') drawCharts();
}
window.addEventListener('hashchange', syncTabsFromHash);

/* ================== CATÁLOGO (mock) ================== */
async function fetchCursos(){
  if(DEMO){
    return [
      {id:1,titulo:'Lógica de Programação',descricao:'Algoritmos, variáveis, estruturas de controle.',area:'Tecnologia',imagem:'https://picsum.photos/seed/logic/600/360',inscritos:125,estrelas:4.7,
       modulos:[{titulo:'Módulo 1: Fundamentos',pdf:'',video:''},{titulo:'Módulo 2: Condicionais',pdf:'',video:''},{titulo:'Módulo 3: Laços',pdf:'',video:''},{titulo:'Módulo 4: Funções',pdf:'',video:''}]},
      {id:2,titulo:'Informática Forense',descricao:'Coleta e preservação de evidências digitais.',area:'Segurança',imagem:'https://picsum.photos/seed/forense/600/360',inscritos:89,estrelas:4.6,
       modulos:[{titulo:'Módulo 1: Introdução',pdf:'',video:''},{titulo:'Módulo 2: Cadeia de Custódia',pdf:'',video:''},{titulo:'Módulo 3: Ferramentas',pdf:'',video:''},{titulo:'Módulo 4: Relatórios',pdf:'',video:''}]}
    ];
  }
  // TODO: trocar para selects do Supabase quando tiver suas tabelas de cursos
  return [];
}
async function initCatalogo(){
  if(!state.courses.available.length){
    state.courses.available = await fetchCursos();
    const areas=[...new Set(state.courses.available.map(c=>c.area))];
    const sel=document.getElementById('filtroArea');
    areas.forEach(a=>{ const o=document.createElement('option'); o.value=a; o.textContent=a; sel.appendChild(o); });
    save();
  }
  renderCatalogo();
}
function renderCatalogo(){
  const wrap=document.getElementById('gridCatalogo'); wrap.innerHTML='';
  const area=document.getElementById('filtroArea').value;
  state.courses.available.filter(c=>!area || c.area===area).forEach(c=>{
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
        save(); renderMeusCursos(); updateMetrics();
        toast('Inscrição realizada! O curso está em "Meus Cursos".');
      }
    });
  });
}
document.getElementById('filtroArea').addEventListener('change', renderCatalogo);

/* ================== MEUS CURSOS ================== */
function renderMeusCursos(){
  const grid=document.getElementById('gridMeusCursos'); grid.innerHTML='';
  state.courses.enrolled.forEach(ec=>{
    const c=state.courses.available.find(x=>x.id===ec.id); if(!c) return;
    const done = ec.progress===100 ? '<span class="tag ok">Concluído</span>' : '';
    const card=document.createElement('div'); card.className='card';
    card.innerHTML=`
      <img src="${c.imagem}" style="width:100%;height:150px;object-fit:cover;border-bottom:1px solid var(--border)">
      <div class="body">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4 style="margin:0">${c.titulo}</h4>${done}
        </div>
        <div class="row" style="margin-top:8px"><span>Progresso</span>
          <div style="flex:1;height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:0 8px">
            <span style="display:block;height:100%;width:${ec.progress}%;background:linear-gradient(90deg,var(--brand),#22d3ee)"></span>
          </div>
          <strong>${ec.progress}%</strong>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <a class="btn" href="#curso/${c.id}">Acessar curso</a>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}
let currentCourseId=null, courseTimer=null;
function openCourse(id){
  currentCourseId=id;
  const panel=document.getElementById('cursoPanel');
  const grid=document.getElementById('gridMeusCursos');
  const c=state.courses.available.find(x=>x.id===id);
  const ec=state.courses.enrolled.find(x=>x.id===id);
  if(!c||!ec){ toast('Curso não encontrado.'); return; }
  panel.style.display='block'; grid.style.display='none';
  document.getElementById('cpTitulo').textContent=c.titulo;

  const mods=document.getElementById('cpModulos'); mods.innerHTML='';
  c.modulos.forEach((m,idx)=>{
    const done=ec.modulesDone.includes(idx);
    const b=document.createElement('button'); b.className='mod-btn'+(done?' done':''); b.dataset.idx=idx;
    b.innerHTML=`<span>${m.titulo}</span>${done?'<span class="tag ok">OK</span>':''}`;
    b.addEventListener('click',()=>loadModule(idx));
    mods.appendChild(b);
  });
  document.getElementById('cpBtnProva').disabled = ec.modulesDone.length < c.modulos.length;
  document.getElementById('cpBtnProva').onclick = ()=>showExam();

  if(courseTimer) clearInterval(courseTimer);
  courseTimer=setInterval(()=>{ ec.sec++; renderCourseTimer(ec.sec); save(); },1000);
  renderCourseTimer(ec.sec);
  loadModule(0);
}
function renderCourseTimer(sec){
  document.getElementById('cpTimer').textContent = hms(sec);
  document.getElementById('cpCreditos').textContent = `${Math.floor(sec/3600)} créditos`;
}
function loadModule(idx){
  const c=state.courses.available.find(x=>x.id===currentCourseId);
  const ec=state.courses.enrolled.find(x=>x.id===currentCourseId);
  const m=c.modulos[idx];
  document.getElementById('cpViewProva').style.display='none';
  document.getElementById('cpViewModulo').style.display='block';
  document.getElementById('cpModTitulo').textContent=m.titulo;
  document.getElementById('cpPDF').src=m.pdf||'';
  document.getElementById('cpPDFLink').href=m.pdf||'#';
  document.getElementById('cpVideo').src=m.video||'';
  const flag=document.getElementById('cpFlagConc');
  flag.style.display = ec.modulesDone.includes(idx)?'inline-block':'none';

  document.getElementById('cpBtnConcluir').onclick=()=>{
    if(!ec.modulesDone.includes(idx)){
      ec.modulesDone.push(idx);
      ec.progress=Math.round(ec.modulesDone.length*100/c.modulos.length);
      save(); renderMeusCursos();
      document.querySelectorAll('#cpModulos .mod-btn')[idx].classList.add('done');
      flag.style.display='inline-block';
      document.getElementById('cpBtnProva').disabled = ec.modulesDone.length < c.modulos.length;
      document.getElementById('cpProgresso').textContent=ec.progress+'%';
      toast('Módulo concluído!');
    }
  };
  document.getElementById('cpProgresso').textContent=ec.progress+'%';
}
function showExam(){
  document.getElementById('cpViewModulo').style.display='none';
  document.getElementById('cpViewProva').style.display='block';
  const form=document.getElementById('cpQuiz'); const result=document.getElementById('cpResultado');
  form.reset(); result.style.display='none';
  ['copy','cut','paste','contextmenu'].forEach(ev=>form.addEventListener(ev,e=>e.preventDefault()));
  form.onsubmit=(e)=>{
    e.preventDefault();
    const ans={q1:'b',q2:'c',q3:'a',q4:'a',q5:'a'};
    let score=0; const fd=new FormData(form);
    Object.keys(ans).forEach(k=>{ if(fd.get(k)===ans[k]) score+=2; });
    const ec=state.courses.enrolled.find(x=>x.id===currentCourseId);
    ec.quiz={score, date:new Date().toISOString()};
    state.performance.notasHistorico.push(score);
    state.performance.mediaGeral = media(state.performance.notasHistorico);
    state.performance.provasFeitas = state.performance.notasHistorico.length;
    save(); updateMetrics(); drawCharts();
    result.style.display='flex';
    result.innerHTML=`<strong>Nota:</strong> ${score.toFixed(1)} / 10 • <span class="tag ${score>=6?'ok':'warn'}">${score>=6?'Aprovado':'Em recuperação'}</span>`;
    toast('Prova enviada!');
  };
}

/* ================== MÉTRICAS ================== */
function media(arr){ return arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function updateMetrics(){
  document.getElementById('metricCursos').textContent = String(state.courses.enrolled.length);
  document.getElementById('metricHoras').textContent = Math.floor(state.study.totalSec/3600)+'h';
  document.getElementById('metricMedia').textContent = (state.performance.mediaGeral||0).toFixed(1);
  document.getElementById('metricCerts').textContent = String(state.payments.balanceCert);

  document.getElementById('kpiMedia').textContent = (state.performance.mediaGeral||0).toFixed(1);
  document.getElementById('kpiHoras').textContent = Math.floor(state.study.totalSec/3600)+'h';
  document.getElementById('kpiProvas').textContent = String(state.performance.provasFeitas||0);
  const concl = state.courses.enrolled.filter(e=>e.progress===100).length;
  document.getElementById('kpiConcluidos').textContent = String(concl);

  const list=document.getElementById('listaProgresso'); list.innerHTML='';
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
      </div><strong>${ec.progress}%</strong>
    </div>`;
    list.appendChild(el);
  });

  document.getElementById('metSaldo').textContent = String(state.payments.balanceCert);
  document.getElementById('metEmitidos').textContent = String(state.certificates.issued.length);

  const tbody=document.querySelector('#tabCerts tbody'); tbody.innerHTML='';
  state.certificates.issued.forEach((c,i)=>{
    const tr=document.createElement('tr'); tr.innerHTML=`<td>${i+1}</td><td>${c.curso||'-'}</td><td>${new Date(c.data).toLocaleString('pt-BR')}</td>`;
    tbody.appendChild(tr);
  });
}

/* ================== CHARTS ================== */
let chMedia=null, chHoras=null, chLinha=null;
function drawCharts(){
  const ctx1=document.getElementById('chartMedia').getContext('2d');
  if(chMedia) chMedia.destroy();
  chMedia=new Chart(ctx1,{type:'line',data:{labels: state.performance.notasHistorico.map((_,i)=>`P${i+1}`),
    datasets:[{label:'Notas',data: state.performance.notasHistorico,borderColor:'#1cc3bb',backgroundColor:'rgba(28,195,187,.15)',fill:true,tension:.3}]},
    options:{plugins:{legend:{display:false}},scales:{y:{min:0,max:10}}}
  });

  const horas=Math.floor(state.study.totalSec/3600);
  const arr=[...Array(6)].map((_,i)=>Math.max(0, Math.floor(horas/6)+(i%2?1:-1)));
  const ctx2=document.getElementById('chartHoras').getContext('2d');
  if(chHoras) chHoras.destroy();
  chHoras=new Chart(ctx2,{type:'bar',data:{labels:['Mar','Abr','Mai','Jun','Jul','Ago'],datasets:[{label:'Horas',data:arr}]},options:{plugins:{legend:{display:false}}}});

  const ctx3=document.getElementById('chartMediaLinha').getContext('2d');
  if(chLinha) chLinha.destroy();
  const serieMed = (()=>{ const ns=state.performance.notasHistorico.slice(-6); const out=[]; let m=0;
    for(let i=0;i<6;i++){ if(ns[i]!=null){ m=(m*(i)+ns[i])/(i+1);} out.push(Number(m.toFixed(1))); } while(out.length<6) out.unshift(0); return out; })();
  chLinha=new Chart(ctx3,{type:'line',data:{labels:['Mar','Abr','Mai','Jun','Jul','Ago'],datasets:[{label:'Média',data:serieMed,borderColor:'#1cc3bb',tension:.25}]},
    options:{plugins:{legend:{display:false}},scales:{y:{min:0,max:10}}}});
}

/* ================== PAGAMENTOS (DEMO) ================== */
function initPromos(){
  if(!state.promos.length){
    state.promos = DEMO ? [
      {id:'pk5', titulo:'Pacote 5 certificados', qtd:5, preco:49.9},
      {id:'pk10', titulo:'Pacote 10 certificados', qtd:10, preco:79.9},
      {id:'pk20', titulo:'Pacote 20 certificados', qtd:20, preco:129.9},
    ] : [];
    save();
  }
  renderPromos();
}
let selPromo=null, desconto=0;
function renderPromos(){
  const wrap=document.getElementById('listaPromos'); wrap.innerHTML='';
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
    b.addEventListener('click',()=>{ selPromo=state.promos.find(x=>x.id===b.dataset.promo); desconto=0; document.getElementById('cupom').value=''; renderResumo(); });
  });
  renderResumo();
}
function renderResumo(){
  const box=document.getElementById('boxResumo');
  if(!selPromo){ box.innerHTML='<em>Selecione um pacote à esquerda.</em>'; return; }
  const total = Math.max(selPromo.preco - desconto, 0);
  box.innerHTML=`
    <div class="row" style="justify-content:space-between"><span>Pacote:</span><strong>${selPromo.titulo}</strong></div>
    <div class="row" style="justify-content:space-between"><span>Subtotal:</span><strong>R$ ${selPromo.preco.toFixed(2)}</strong></div>
    <div class="row" style="justify-content:space-between"><span>Desconto:</span><strong>R$ ${desconto.toFixed(2)}</strong></div>
    <div class="row" style="justify-content:space-between"><span>Total:</span><strong>R$ ${total.toFixed(2)}</strong></div>`;
}
document.getElementById('btnCupom').addEventListener('click',()=>{
  if(!selPromo){ toast('Escolha um pacote primeiro.'); return; }
  const c=(document.getElementById('cupom').value||'').trim().toUpperCase();
  if(!c){ desconto=0; renderResumo(); return; }
  if(DEMO && (c==='BEMVINDO10'||c==='ALUNO20')){ const perc=c==='BEMVINDO10'?0.10:0.20; desconto=selPromo.preco*perc; toast(`Cupom ${Math.round(perc*100)}% aplicado!`); }
  else { desconto=0; toast('Cupom inválido.'); }
  renderResumo();
});
document.getElementById('btnPagar').addEventListener('click',()=>{
  if(!selPromo){ toast('Selecione um pacote.'); return; }
  toast('Redirecionando para pagamento...',1200);
  if(DEMO){ document.getElementById('devApprove').style.display='block'; }
});
document.getElementById('btnDevOk').addEventListener('click',()=>{
  if(!selPromo) return;
  state.payments.paidOk=true;
  state.payments.balanceCert += selPromo.qtd;
  state.payments.tx.push({id:'demo',valor:selPromo.preco-desconto,qtd:selPromo.qtd,date:new Date().toISOString()});
  save(); updateMetrics(); toast('Pagamento confirmado! Saldo atualizado.');
});

/* ================== CERTIFICADOS ================== */
document.getElementById('btnEmitir').addEventListener('click',()=>{
  if(!state.payments.paidOk){ toast('Pagamento ainda não confirmado.'); return; }
  if(state.payments.balanceCert<=0){ toast('Sem saldo de certificados.'); return; }
  const concl = state.courses.enrolled.find(e=>e.progress===100);
  const curso = concl ? (state.courses.available.find(c=>c.id===concl.id)?.titulo) : 'Geral';
  state.payments.balanceCert--;
  state.certificates.issued.push({id:crypto.randomUUID(), curso, data:new Date().toISOString()});
  save(); updateMetrics(); toast('Certificado emitido!');
});

/* ================== PERFIL / FOTO ================== */
function renderProfile(){
  const name = state.perfil.nome || 'Portal do Aluno';
  document.getElementById('brandName').textContent = name;
  document.getElementById('brandRA').textContent = state.auth.ra || '—';
  document.getElementById('pfNome').value = state.perfil.nome || '';
  document.getElementById('pfTel').value = state.perfil.telefone || '';
  document.getElementById('pfEmail').value = state.auth.email || '';
  document.getElementById('pfRA').value = state.auth.ra || '';
  document.getElementById('pfReg').value = state.auth.registeredAt ? new Date(state.auth.registeredAt).toLocaleString('pt-BR') : '—';

  const brandAva=document.getElementById('brandAvatar');
  const pfThumb=document.getElementById('pfThumb');
  const cardFoto=document.getElementById('cardFoto');

  if(state.perfil.foto){
    const img1=new Image(); img1.src=state.perfil.foto; img1.alt='';
    brandAva.innerHTML=''; brandAva.appendChild(img1);
    pfThumb.innerHTML=`<img src="${state.perfil.foto}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    cardFoto.src=state.perfil.foto;
  }else{
    brandAva.textContent='PA'; pfThumb.textContent='PA'; cardFoto.src='';
  }
  document.getElementById('cardNome').textContent = name || '—';
  document.getElementById('cardRA').textContent = state.auth.ra || '—';
  document.getElementById('cardAno').textContent = new Date().getFullYear();
}
document.getElementById('pfFoto').addEventListener('change', e=>{
  const file=e.target.files?.[0]; if(!file) return;
  const r=new FileReader(); r.onload=()=>{ state.perfil.foto=r.result; save(); renderProfile(); }; r.readAsDataURL(file);
});
document.getElementById('btnSalvarPerfil').addEventListener('click',async ()=>{
  state.perfil.nome=document.getElementById('pfNome').value.trim();
  state.perfil.telefone=document.getElementById('pfTel').value.trim();
  save(); renderProfile(); toast('Perfil salvo!');

  // opcional: persistir nome/telefone/foto no Supabase:
  try{
    const { error } = await supa.from('students')
      .update({ name: state.perfil.nome || null, phone: state.perfil.telefone || null, photo: state.perfil.foto || null })
      .eq('id', state.auth.id);
    if(error) throw error;
  }catch(e){ console.warn('Falha ao salvar no supabase (ok em demo).'); }
});
document.getElementById('btnPrintCard').addEventListener('click',()=>window.print());

/* ================== FÓRUM (local) ================== */
function nextTicketNumber(){
  const y=new Date().getFullYear();
  if(state.forum.seqYear!==y){ state.forum.seqYear=y; state.forum.seq=-1; }
  state.forum.seq++;
  return `${y}-${String(state.forum.seq).padStart(3,'0')}`;
}
function renderChamados(){
  const tb=document.querySelector('#tabChamados tbody'); tb.innerHTML='';
  state.forum.tickets.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(t=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${t.num}</td><td>${t.title}</td>
      <td><span class="tag ${t.status==='Resolvido'?'ok':(t.status==='Atendendo'?'':'warn')}">${t.status}</span></td>
      <td>${t.solver||'—'}</td><td>${new Date(t.date).toLocaleString('pt-BR')}</td>`;
    tb.appendChild(tr);
  });
}
document.getElementById('btnEnviarChamado').addEventListener('click',()=>{
  const title=(document.getElementById('chTitulo').value||'').trim();
  const cat=document.getElementById('chCat').value||'';
  const desc=(document.getElementById('chDesc').value||'').trim();
  if(!title||!desc){ toast('Preencha título e descrição.'); return; }
  const num=nextTicketNumber();
  state.forum.tickets.push({ num, title, cat, desc, status:'Em análise', solver:'', date:new Date().toISOString(), aluno: state.perfil.nome, ra: state.auth.ra });
  save(); renderChamados(); toast(`Chamado ${num} aberto!`);
});
document.getElementById('btnLimparChamado').addEventListener('click',()=>{ document.getElementById('chTitulo').value=''; document.getElementById('chDesc').value=''; });

/* ================== BUSCA ================== */
document.getElementById('busca').addEventListener('input',e=>{
  const q=e.target.value.toLowerCase();
  document.querySelectorAll('#gridCatalogo .card').forEach(card=>{
    const t=card.querySelector('h4')?.textContent.toLowerCase()||''; card.style.display = t.includes(q)?'block':'none';
  });
  document.querySelectorAll('#gridMeusCursos .card').forEach(card=>{
    const t=card.querySelector('h4')?.textContent.toLowerCase()||''; card.style.display = t.includes(q)?'block':'none';
  });
});

/* ================== GESTÃO (Supabase RPC) ================== */
function showGestaoIfAdmin(){
  if(IS_ADMIN){ document.getElementById('btn-gestao').style.display='inline-block'; document.getElementById('adminWho').textContent=ADMIN_NAME; }
}
let gsCurrent=null; // aluno encontrado (payload vindo do Supabase)
document.getElementById('btnBuscarAluno').addEventListener('click', async ()=>{
  const ra=(document.getElementById('gsRA').value||'').trim()||null;
  const em=(document.getElementById('gsEmail').value||'').trim()||null;
  try{
    const { data, error } = await supa.rpc('find_student_admin', { p_ra: ra, p_email: em });
    if(error) throw error;
    if(!data){ gsCurrent=null; document.getElementById('gsPane').style.display='none'; toast('Aluno não encontrado.'); return; }
    gsCurrent=data;
    document.getElementById('gsFound').textContent = `${data.name||'(sem nome)'} • ${data.email} • ${data.ra}`;
    document.getElementById('gsReg').textContent = new Date(data.registered_at).toLocaleString('pt-BR');
    await renderGsPaneFromSupabase();
    document.getElementById('gsPane').style.display='block';
  }catch(e){ console.error(e); toast('Erro ao buscar aluno (permite admin apenas).'); }
});
async function renderGsPaneFromSupabase(){
  // total de segundos e lista de ajustes
  const { data: tot } = await supa.from('study_time_totals').select('total_seconds').eq('student_id', gsCurrent.id).maybeSingle();
  const totalSec = tot?.total_seconds || 0;
  document.getElementById('gsHoras').textContent = Math.floor(totalSec/3600)+'h';
  document.getElementById('gsCreditos').textContent = String(Math.floor(totalSec/3600));
  document.getElementById('gsCursos').textContent = '—';
  document.getElementById('gsProvas').textContent = '—';

  const { data: adj } = await supa.rpc('list_adjustments_admin', { p_student_id: gsCurrent.id });
  const tb=document.querySelector('#gsAudit tbody'); tb.innerHTML='';
  (adj||[]).forEach(a=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${new Date(a.created_at).toLocaleString('pt-BR')}</td><td>${a.by_admin}</td><td>${(a.delta_seconds/3600).toFixed(2)}h</td><td>${a.reason||'-'}</td>`;
    tb.appendChild(tr);
  });
}
async function adjustHours(deltaMin){
  if(!gsCurrent){ toast('Busque um aluno primeiro.'); return; }
  const reason=document.getElementById('gsMotivo').value||null;
  try{
    const { data, error } = await supa.rpc('adjust_hours_admin', {
      p_student_id: gsCurrent.id,
      p_delta_minutes: deltaMin,
      p_reason: reason,
      p_admin_name: ADMIN_NAME
    });
    if(error) throw error;
    await renderGsPaneFromSupabase();
    toast(deltaMin>0? 'Horas adicionadas.' : 'Horas removidas.');
  }catch(e){ console.error(e); toast('Sem permissão ou erro no ajuste.'); }
}
document.getElementById('btnAddHoras').addEventListener('click',()=>adjustHours(Number(document.getElementById('gsMin').value||0)));
document.getElementById('btnSubHoras').addEventListener('click',()=>adjustHours(-Math.abs(Number(document.getElementById('gsMin').value||0))));

/* ================== INIT ================== */
function renderProfileUi(){ renderProfile(); }
async function init(){
  document.getElementById('yr').textContent=new Date().getFullYear();
  showGestaoIfAdmin();
  await fetchMeSupabase();
  await initCatalogo();
  renderCatalogo();
  renderMeusCursos();
  renderProfileUi();
  renderSession();
  updateMetrics();
  drawCharts();
  startGlobalTimer();
  syncTabsFromHash();
}
init();
