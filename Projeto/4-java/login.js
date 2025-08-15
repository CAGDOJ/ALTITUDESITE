/* ============================================================
   Portal do Aluno – Frontend (Supabase Auth + RPCs schema portal)
   -> Usa SOMENTE as funções RPC criadas no seu schema.sql (portal.*)
   -> Comentado para manutenção
   ============================================================ */

/** 1) PREENCHA com os dados do seu projeto Supabase **/
const SUPABASE_URL = 'COLOQUE_AQUI_SUA_URL';
const SUPABASE_ANON_KEY = 'COLOQUE_AQUI_SUA_ANON_KEY';
/** ========================================================== **/

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helpers de UI / Formatadores
const $  = id => document.getElementById(id);
const qa = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const pad = n => String(n).padStart(2,'0');
const fmtHMS = s => `${pad(Math.floor(s/3600))}:${pad(Math.floor((s%3600)/60))}:${pad(s%60)}`;
const toast = (msg,ms=2000)=>{ $('toastMsg').textContent=msg; $('toast').style.display='grid'; setTimeout(()=>$('toast').style.display='none',ms); };

// Inatividade (pausa cronom.)
const INAT_MS = 5*60*1000;

// Estado global do app
const state = {
  session: null,
  me: null,          // retorno de portal.rpc_get_me (perfil + RA)
  cursos: [],        // cursos + módulos (rpc_list_cursos)
  minhas: [],        // minhas matrículas (rpc_my_enrollments)
  promos: [],        // pacotes de certificados
  certs: [],         // certificados emitidos
  charts: {},
  timers: {
    globalSec: 0,                 // tempo total da sessão vigente (cronômetro global)
    lastActive: Date.now(),       // última atividade do usuário (para pausar por inatividade)
    course: { id:null, sec:0, timer:null } // cronômetro do curso aberto
  },
  pagamento: { promo:null, cupom:null, total:0, intentId:null }
};

/* ===================== AUTH ===================== */
async function signIn(email, password){
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error) throw error; return data.session;
}
async function signUp(email, password){
  const { data, error } = await sb.auth.signUp({ email, password });
  if(error) throw error; return data.user;
}

/* ===================== BOOT (pós login) ===================== */
async function boot(){
  // 1) cria/garante profile + RA (via ensure_profile dentro da RPC)
  const me = await sb.rpc('rpc_get_me');
  if(me.error) throw me.error;
  state.me = me.data?.[0] || me.data;
  renderProfileStatic();

  // 2) carrega dados paralelamente
  await Promise.all([loadCursos(), loadMinhas(), loadPromos(), loadCerts()]);

  // 3) renderiza as telas
  renderInicio();
  renderMeusCursos();
  renderInscricoes();
  renderPagamentos();
  renderCreditos();
  await loadTickets();

  // 4) inicia cronômetro global (começa a contar assim que loga)
  startGlobalTimer();

  // UI geral
  qa('.tab-btn').forEach(b=> b.onclick = ()=> activateTab(b.dataset.tab));
  $('yr').textContent = new Date().getFullYear();
  activateTab('inicio');
}

/* ===================== LOADERS (RPCs) ===================== */
async function loadCursos(){
  const r = await sb.rpc('rpc_list_cursos');
  if(r.error) throw r.error;
  state.cursos = r.data || [];
}
async function loadMinhas(){
  const r = await sb.rpc('rpc_my_enrollments');
  if(r.error) throw r.error;
  state.minhas = r.data || [];
}
async function loadPromos(){
  const r = await sb.rpc('rpc_list_promos');
  if(r.error) throw r.error;
  state.promos = r.data || [];
}
async function loadCerts(){
  const r = await sb.rpc('rpc_list_certs');
  if(r.error) throw r.error;
  state.certs = r.data || [];
}

/* ===================== PERFIL ===================== */
function renderProfileStatic(){
  const u = state.me || {};
  $('brandName').textContent = u.nome || 'Portal do Aluno';
  $('brandRA').textContent   = u.ra || '—';
  $('brandSince').textContent= u.signup_at ? new Date(u.signup_at).toLocaleDateString('pt-BR') : '—';
  $('pfNome').value = u.nome || '';
  $('pfTel').value  = u.telefone || '';
  $('pfEmail').value= u.email || '';
  $('pfRA').value   = u.ra || '';
  if(u.foto){
    $('brandAvatar').innerHTML = `<img src="${u.foto}">`;
    $('pfThumb').innerHTML = `<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    $('cardFoto').src = u.foto;
  }else{ $('brandAvatar').textContent='PA'; $('pfThumb').textContent='PA'; $('cardFoto').removeAttribute('src'); }
  $('cardNome').textContent = u.nome || '—';
  $('cardRA').textContent   = u.ra   || '—';
  $('cardAno').textContent  = new Date().getFullYear();
}

// Atualiza foto + dados
$('pfFoto').addEventListener('change', async e=>{
  const f=e.target.files?.[0]; if(!f) return;
  const r=new FileReader();
  r.onload= async ()=>{
    const foto=r.result;
    const up = await sb.rpc('rpc_update_me', { p_nome: $('pfNome').value || null, p_tel: $('pfTel').value || null, p_foto: foto });
    if(!up.error){ state.me.foto=foto; renderProfileStatic(); toast('Foto atualizada!'); }
  };
  r.readAsDataURL(f);
});
$('btnSalvarPerfil').onclick = async ()=>{
  const up = await sb.rpc('rpc_update_me', {
    p_nome: $('pfNome').value || null,
    p_tel : $('pfTel').value  || null,
    p_foto: state.me.foto || null
  });
  if(!up.error){
    const me = await sb.rpc('rpc_get_me'); // recarrega perfil
    state.me = me.data?.[0] || me.data;
    renderProfileStatic(); toast('Perfil salvo!');
  }
};

/* ===================== TIMER GLOBAL ===================== */
/* Conta a partir do login; pausa por inatividade (5min).
   A cada 15s ativa, chama rpc_heartbeat(p_seconds) para acumular no perfil. */
['mousemove','keydown','click','touchstart'].forEach(evt=>document.addEventListener(evt,()=>{ state.timers.lastActive=Date.now(); }));
function startGlobalTimer(){
  setInterval(async ()=>{
    const ativo = (Date.now()-state.timers.lastActive<INAT_MS);
    $('dotGlobal').style.background = ativo ? 'var(--ok)' : 'var(--warn)';
    if(ativo){
      state.timers.globalSec++;
      $('pillTimer').textContent = fmtHMS(state.timers.globalSec);
      $('pillCredits').textContent = `${Math.floor(state.timers.globalSec/3600)} créditos`;
      $('metTotal').textContent = fmtHMS(state.timers.globalSec);
      $('metCreditos').textContent = `${Math.floor(state.timers.globalSec/3600)}`;
      $('metricHoras').textContent = `${Math.floor(state.timers.globalSec/3600)}h`;
      $('kpiHoras').textContent    = `${Math.floor(state.timers.globalSec/3600)}h`;
      if(state.timers.globalSec%15===0){
        await sb.rpc('rpc_heartbeat', { p_seconds: 15 });
      }
    }
  },1000);
}

/* ===================== TABS ===================== */
function activateTab(name){
  qa('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  qa('main > section').forEach(s=>s.classList.remove('active'));
  const sec = $('tab-'+name); if(sec) sec.classList.add('active');
  if(name==='desempenho') drawCharts();
}

/* ===================== INSCRIÇÕES ===================== */
function hasVideo(c){ return (c.modulos||[]).some(m=>m.video_url && m.video_url.trim()!==''); }
function hasPDF(c){ return (c.modulos||[]).some(m=>m.pdf_url && m.pdf_url.trim()!==''); }

function renderInscricoes(){
  const areas=[...new Set(state.cursos.map(c=>c.area).filter(Boolean))];
  const sel=$('filtroArea'); sel.innerHTML='<option value="">Todas as áreas</option>'+areas.map(a=>`<option>${a}</option>`).join('');
  sel.onchange = renderCatalogo;
  renderCatalogo();
}
async function inscrever(courseId){
  const r = await sb.rpc('rpc_enroll', { p_course_id: courseId });
  if(r.error){ toast('Erro ao inscrever'); return; }
  await loadMinhas(); renderMeusCursos(); renderInicio(); toast('Inscrição realizada!');
}
function renderCatalogo(){
  const area=$('filtroArea').value||'';
  const wrap=$('gridCatalogo'); wrap.innerHTML='';
  state.cursos.filter(c=>!area||c.area===area).forEach(c=>{
    const card=document.createElement('div'); card.className='card';
    card.innerHTML=`
      <img src="${c.imagem}" alt="" style="width:100%;height:140px;object-fit:cover;border-radius:12px 12px 0 0">
      <div class="body">
        <div class="row" style="justify-content:flex-start;gap:6px;margin-bottom:6px">
          ${hasVideo(c)?'<span class="tag info">Curso com vídeo</span>':''}
          ${hasPDF(c)?'<span class="tag">PDF</span>':''}
          <span class="tag">★ ${(Number(c.estrelas)||0).toFixed(1)}</span>
          <span class="tag">${c.inscritos||0} inscritos</span>
        </div>
        <h4 style="margin:0 0 4px" title="${c.titulo}">${c.titulo}</h4>
        <small class="muted">${c.descricao||''}</small>
        ${c.obs?`<div class="alert-red" style="margin-top:6px">${c.obs}</div>`:''}
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn primary" data-enroll="${c.id}">Inscrever-se</button>
        </div>
      </div>`;
    wrap.appendChild(card);
  });
  qa('[data-enroll]').forEach(b=> b.onclick = ()=> inscrever(Number(b.dataset.enroll)));
}

/* ===================== MEUS CURSOS ===================== */
function getEnroll(courseId){ return (state.minhas||[]).find(e=>e.course_id===courseId); }

function renderMeusCursos(){
  const wrap=$('gridMeusCursos'); wrap.innerHTML='';
  const meus = state.cursos.filter(c=> getEnroll(c.id));
  $('metricCursos').textContent = meus.length;
  meus.forEach(c=>{
    const e=getEnroll(c.id);
    const horas = ((e?.sec||0)/3600).toFixed(1);
    const card=document.createElement('div'); card.className='card';
    card.innerHTML=`
      <img src="${c.imagem}" alt="" style="width:100%;height:140px;object-fit:cover;border-radius:12px 12px 0 0">
      <div class="body">
        <div class="row" style="justify-content:flex-start;gap:6px;margin-bottom:6px">
          ${hasVideo(c)?'<span class="tag info">Curso com vídeo</span>':''}
          ${hasPDF(c)?'<span class="tag">PDF</span>':''}
          <span class="tag">★ ${(Number(c.estrelas)||0).toFixed(1)}</span>
        </div>
        <h4 style="margin:0 0 4px">${c.titulo}</h4>
        <div class="progress" style="height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden"><span style="display:block;height:100%;width:${e?.progress||0}%;background:linear-gradient(90deg,var(--brand),#22d3ee)"></span></div>
        <small class="muted">${e?.progress||0}% concluído • ${horas}h</small>
        <div style="margin-top:8px"><button class="btn primary" data-open="${c.id}">Acessar curso</button></div>
      </div>`;
    wrap.appendChild(card);
  });
  qa('[data-open]').forEach(b=> b.onclick = ()=> openCourse(Number(b.dataset.open)));
}

// Fecha painel do curso
function closeCourse(){
  $('cursoPanel').style.display='none';
  if(state.timers.course.timer){ clearInterval(state.timers.course.timer); state.timers.course.timer=null; }
  state.timers.course = { id:null, sec:0, timer:null };
}
// Abre painel do curso e inicia cronômetro do curso
function openCourse(courseId){
  const c = state.cursos.find(x=>x.id===courseId); if(!c) return;
  $('cursoPanel').style.display='block';
  $('cpTitulo').textContent=c.titulo;

  const tags=$('cpTags'); tags.innerHTML='';
  if(hasVideo(c)) tags.innerHTML+='<span class="tag info">Curso com vídeo</span>';
  if(hasPDF(c)) tags.innerHTML+='<span class="tag">PDF</span>';

  if(c.obs && c.obs.trim()!==''){ $('cpTabObs').style.display='inline-block'; $('cpObsText').textContent=c.obs; } else { $('cpTabObs').style.display='none'; }
  const e=getEnroll(c.id); $('cpProgresso').textContent = `${e?.progress||0}%`;
  $('cpBtnProva').disabled = (e?.progress||0) < 100;
  $('btnVoltarCursos').onclick = ()=> closeCourse();

  const box=$('cpModulos'); box.innerHTML='';
  (c.modulos||[]).forEach((m,i)=>{
    const done = Array.isArray(e?.modules_done) ? e.modules_done.includes(i) : false;
    const b=document.createElement('button'); b.className='mod-btn'+(done?' done':'');
    b.dataset.idx=i; b.innerHTML=`<span>${m.titulo}</span><span class="tag">${m.video_url?'Vídeo':'PDF'}</span>`;
    b.onclick=()=>openModulo(c.id,i);
    box.appendChild(b);
  });

  $('cpBtnProva').onclick = ()=>{ $('cpViewModulo').style.display='none'; $('cpViewProva').style.display='block'; };

  const form=$('cpQuiz'), out=$('cpResultado');
  ['copy','cut','paste','selectstart','contextmenu'].forEach(evt=> form.addEventListener(evt,e=>e.preventDefault()));
  form.onsubmit=async (ev)=>{
    ev.preventDefault();
    const g={q1:'b',q2:'c',q3:'a',q4:'a',q5:'a'}; let score=0; const fd=new FormData(form);
    Object.keys(g).forEach(k=>{ if(fd.get(k)===g[k]) score+=2; });
    const r = await sb.rpc('rpc_submit_quiz', { p_course_id: c.id, p_score: score });
    if(r.error){ toast('Falha ao enviar prova'); return; }
    out.style.display='flex'; out.textContent=`Sua nota: ${score}/10`;
    await loadMinhas(); renderInicio();
  };

  // cronômetro do curso (bate a cada 15s)
  state.timers.course.id=c.id; state.timers.course.sec=0;
  if(state.timers.course.timer) clearInterval(state.timers.course.timer);
  state.timers.course.timer=setInterval(async ()=>{
    const ativo = (Date.now()-state.timers.lastActive<INAT_MS);
    $('dotCourse').style.background = ativo ? 'var(--ok)' : 'var(--warn)';
    if(ativo){
      state.timers.course.sec++;
      $('cpTimer').textContent=fmtHMS(state.timers.course.sec);
      $('cpCreditos').textContent=`${Math.floor(state.timers.course.sec/3600)} créditos`;
      if(state.timers.course.sec%15===0){
        await sb.rpc('rpc_add_course_seconds', { p_course_id: c.id, p_seconds: 15 });
        await loadMinhas(); renderInicio();
      }
    }
  },1000);
}

function openModulo(courseId, index){
  const c = state.cursos.find(x=>x.id===courseId); const m=(c.modulos||[])[index]; if(!m) return;
  $('cpViewProva').style.display='none'; $('cpViewModulo').style.display='block';
  $('cpModTitulo').textContent=m.titulo;
  $('cpPDF').src=m.pdf_url||''; $('cpPDFLink').href=m.pdf_url||'#';
  const v=$('cpVideo'); v.src=m.video_url||''; v.style.display=m.video_url?'block':'none';
  $('cpFlagConc').style.display='none';
  $('cpBtnConcluir').onclick = async ()=>{
    const r = await sb.rpc('rpc_mark_module_done', { p_course_id: courseId, p_index: index });
    if(r.error){ toast('Erro ao concluir módulo'); return; }
    const btn=qa('#cpModulos .mod-btn')[index]; if(btn){ btn.classList.add('done'); }
    await loadMinhas();
    const e=getEnroll(courseId);
    $('cpProgresso').textContent = `${e?.progress||0}%`;
    $('cpBtnProva').disabled = (e?.progress||0) < 100;
    $('cpFlagConc').style.display='inline-block';
    renderMeusCursos(); renderInicio(); toast('Módulo concluído!');
  };
}

/* ===================== INÍCIO / KPIs ===================== */
function renderInicio(){
  const medias = state.minhas.map(e=>Number(e.quiz_score)||0).filter(x=>x>0);
  const media = medias.length ? (medias.reduce((a,b)=>a+b,0)/medias.length) : 0;
  $('metricMedia').textContent=media.toFixed(1); $('kpiMedia').textContent=media.toFixed(1);
  $('kpiProvas').textContent=medias.length;
  $('kpiConcluidos').textContent=state.minhas.filter(e=>e.progress===100).length;

  const list=$('listaProgresso'); list.innerHTML='';
  state.cursos.filter(c=>getEnroll(c.id)).forEach(c=>{
    const e=getEnroll(c.id)||{};
    const row=document.createElement('div'); row.className='row';
    row.innerHTML=`<div style="min-width:160px">${c.titulo}</div>
      <div style="flex:1">
        <div class="progress" style="height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden"><span style="display:block;height:100%;width:${e.progress||0}%;background:linear-gradient(90deg,var(--brand),#22d3ee)"></span></div>
        <small class="muted">${e.progress||0}% • ${((e.sec||0)/3600).toFixed(1)}h</small>
      </div>
      <div><button class="btn" onclick="openCourse(${c.id})">abrir</button></div>`;
    list.appendChild(row);
  });

  // mini chart
  const ctx=$('chartMedia');
  if(ctx){ if(state.charts.media) state.charts.media.destroy();
    state.charts.media = new Chart(ctx,{type:'line',data:{labels:['Mar','Abr','Mai','Jun','Jul','Ago'],
      datasets:[{label:'Média',data:[7.2,7.6,7.9,8.0,8.3, media||8.6],tension:.3}]},options:{plugins:{legend:{display:false}},scales:{y:{min:0,max:10}}}});
  }
}
function drawCharts(){
  const ctx1=$('chartHoras'), ctx2=$('chartMediaLinha');
  if(ctx1){ if(state.charts.horas) state.charts.horas.destroy();
    const horas = Array.from({length:6},(_,i)=> (state.minhas[i]?.sec||0)/3600);
    state.charts.horas = new Chart(ctx1,{type:'bar',data:{labels:['Mar','Abr','Mai','Jun','Jul','Ago'],datasets:[{label:'Horas',data:horas}]},options:{plugins:{legend:{display:false}}}});
  }
  const medias = state.minhas.map(e=>Number(e.quiz_score)||0).filter(x=>x>0);
  if(ctx2){ if(state.charts.mediaLinha) state.charts.mediaLinha.destroy();
    state.charts.mediaLinha = new Chart(ctx2,{type:'line',data:{labels:['Mar','Abr','Mai','Jun','Jul','Ago'],datasets:[{label:'Média',data:medias,tension:.3}]},options:{plugins:{legend:{display:false}},scales:{y:{min:0,max:10}}}});
  }
}

/* ===================== PAGAMENTOS (RPCs) ===================== */
function renderPagamentos(){
  const list=$('listaPromos'); list.innerHTML='';
  state.promos.forEach(p=>{
    const el=document.createElement('div'); el.className='card';
    el.innerHTML=`<div class="body"><h4 style="margin:0 0 4px">${p.titulo}</h4>
    <div class="row"><span>${p.qtd} certificados</span><strong>R$ ${Number(p.preco).toFixed(2)}</strong></div>
    <button class="btn primary" data-sel="${p.id}">Selecionar</button></div>`;
    list.appendChild(el);
  });
  qa('[data-sel]').forEach(b=> b.onclick = ()=> selectPromo(b.dataset.sel));
  $('btnCupom').onclick = applyCupom;
  $('btnPagar').onclick = pagar;
}
function selectPromo(id){
  const p=state.promos.find(x=>x.id===id); if(!p) return;
  state.pagamento.promo=p; state.pagamento.cupom=null; state.pagamento.total=Number(p.preco);
  $('boxResumo').innerHTML=`<div class="row"><span>${p.titulo}</span><strong>Total: R$ ${Number(p.preco).toFixed(2)}</strong></div>`;
  toast('Pacote selecionado');
}
async function applyCupom(){
  const code=($('cupom').value||'').trim().toUpperCase(); if(!code) return toast('Digite um cupom');
  if(!state.pagamento.promo) return toast('Selecione um pacote');
  const r = await sb.rpc('rpc_validate_coupon', { p_code: code, p_price: state.pagamento.promo.preco });
  if(r.error) return toast('Erro ao validar cupom');
  const row = r.data?.[0];
  if(!row?.valid) return toast('Cupom inválido');
  state.pagamento.cupom = code;
  state.pagamento.total = Number(row.new_total);
  $('boxResumo').innerHTML=`
    <div class="row"><span>${state.pagamento.promo.titulo}</span><strong>R$ ${Number(state.pagamento.promo.preco).toFixed(2)}</strong></div>
    <div class="row"><span>Cupom ${code}</span><strong>→ R$ ${Number(state.pagamento.total).toFixed(2)}</strong></div>
  `;
  toast('Cupom aplicado');
}
async function pagar(){
  if(!state.pagamento.promo) return toast('Selecione um pacote');
  const r = await sb.rpc('rpc_create_payment_intent', {
    p_promo_id: state.pagamento.promo.id,
    p_coupon: state.pagamento.cupom || null
  });
  if(r.error){ toast('Erro ao iniciar pagamento'); return; }
  const row = r.data?.[0] || r.data;
  if(!row){ toast('Erro no checkout'); return; }
  window.open(row.checkout_url, '_blank'); // não exibe “Infinity” pro aluno; é só o gateway
  toast('Pagamento iniciado. Saldo libera após confirmação do gateway.');
}

/* ===================== CRÉDITOS / CERTIFICADOS ===================== */
async function refreshCreditos(){
  const rc = await sb.rpc('rpc_list_certs');
  state.certs = rc.data || [];
}
function renderCreditos(){
  $('metEmitidos').textContent = state.certs.length||0;
  $('metTotal').textContent = fmtHMS(state.timers.globalSec);
  $('metCreditos').textContent = Math.floor(state.timers.globalSec/3600);
  $('metSaldo').textContent = '—'; // Sugestão: criar rpc_get_balance para mostrar saldo exato
  $('metricSaldo').textContent = '—';

  const tbody=$('tabCerts').querySelector('tbody'); tbody.innerHTML='';
  (state.certs||[]).forEach((c,i)=>{
    const dt=new Date(c.issued_at).toLocaleString('pt-BR');
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${i+1}</td><td>${c.course_id||'-'}</td><td>${dt}</td></tr>`);
  });
}
$('btnEmitir').onclick = async ()=>{
  const r = await sb.rpc('rpc_issue_cert', { p_course_id: null });
  if(r.error){ toast(r.error.message || 'Sem saldo de certificados.'); return; }
  await refreshCreditos(); renderCreditos(); toast('Certificado emitido!');
};

/* ===================== FÓRUM ===================== */
async function loadTickets(){
  const r = await sb.rpc('rpc_list_tickets');
  if(r.error) return;
  const rows=r.data||[];
  const tb=$('tabChamados').querySelector('tbody'); tb.innerHTML='';
  rows.forEach(t=>{
    tb.insertAdjacentHTML('beforeend', `<tr><td>${t.num}</td><td>${t.title}</td><td>${t.status}</td><td>${t.solver||'-'}</td><td>${new Date(t.created_at).toLocaleString('pt-BR')}</td></tr>`);
  });
}
$('btnNovoChamado').onclick = ()=>{ activateTab('forum'); $('chTitulo').focus(); };
$('btnLimparChamado').onclick = ()=>{ $('chTitulo').value=''; $('chCat').value=''; $('chDesc').value=''; };
$('btnEnviarChamado').onclick = async ()=>{
  const title=$('chTitulo').value.trim(), category=$('chCat').value, description=$('chDesc').value.trim();
  if(!title||!description) return toast('Preencha título e descrição');
  const r = await sb.rpc('rpc_create_ticket', { p_title: title, p_cat: category||null, p_desc: description });
  if(r.error) return toast('Falha ao abrir chamado');
  $('chTitulo').value=''; $('chCat').value=''; $('chDesc').value='';
  toast('Chamado aberto!'); await loadTickets();
};

/* ===================== BUSCA / PRINT / EVENTOS ===================== */
$('busca').addEventListener('input', (e)=>{
  const q=e.target.value.toLowerCase();
  qa('#gridMeusCursos .card, #gridCatalogo .card').forEach(card=>{ card.style.display = card.textContent.toLowerCase().includes(q)?'':'none'; });
});
$('btnPrintCard').onclick = ()=> window.print();

/* ===================== LOGIN UI ===================== */
$('btnFazerLogin').onclick = async ()=>{
  const email=$('lgEmail').value.trim().toLowerCase(), pass=$('lgPass').value;
  try{
    const sess = await signIn(email,pass);
    if(!sess){ $('loginErro').style.display='block'; $('loginErro').textContent='Não foi possível entrar. Tente novamente.'; return; }
    state.session = sess; $('login').style.display='none';
    await boot();
  }catch{
    $('loginErro').style.display='block';
    $('loginErro').textContent='Não foi possível entrar. Tente novamente.';
  }
};
$('btnCriarConta').onclick = async ()=>{
  const email=$('lgEmail').value.trim().toLowerCase(), pass=$('lgPass').value;
  if(!email||!pass) return toast('Informe e‑mail e senha');
  try{
    await signUp(email,pass);
    toast('Conta criada! Verifique o e‑mail (se exigido) e entre.');
  }catch{ toast('Erro ao criar conta'); }
};

/* ===================== INIT ===================== */
window.addEventListener('DOMContentLoaded', async ()=>{
  $('login').style.display='grid';
  $('yr').textContent = new Date().getFullYear();
  const { data } = await sb.auth.getSession();
  if(data?.session){ $('login').style.display='none'; await boot(); }
});
