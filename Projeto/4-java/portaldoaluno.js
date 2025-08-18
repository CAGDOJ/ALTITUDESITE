
// ===== Portal do Aluno (UI atualizada) =====
// Requer: window.supa (cliente Supabase) já iniciado.

// Estado salvo localmente para UX
const LS_KEY = "portal_state_v2";
function load(){ try{ const j = localStorage.getItem(LS_KEY); return j? JSON.parse(j) : {auth:{id:null,email:"",ra:""}, perfil:{nome:"",telefone:""}}; }catch{ return {auth:{},perfil:{}}; } }
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function toast(msg, isErr=false){ const el = document.getElementById('perfilMsg'); if(!el) return; el.hidden=false; el.textContent=msg; el.className=isErr?'msg error':'msg'; setTimeout(()=>el.hidden=true, 2800); }

function onlyDigits(s){ return (s||'').replace(/\D/g,''); }
function maskPhone(v){ const d=onlyDigits(v).slice(0,11), has9=d.length>10; const ddd=d.slice(0,2), p1=has9?d.slice(2,7):d.slice(2,6), p2=has9?d.slice(7,11):d.slice(6,10); return (ddd?`(${ddd}) `:'')+p1+(p2?`-${p2}`:''); }
function sanitizeUpperASCII(str){ return (str||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ç/gi,'c').replace(/[^a-zA-Z\s'-]/g,' ').replace(/\s+/g,' ').trim().toUpperCase(); }

let state = load();

function renderProfile(){
  // header
  const brandRA   = document.getElementById('brandRA');
  const brandEmail= document.getElementById('brandEmail');
  if (brandRA)    brandRA.textContent = state.auth.ra || '—';
  if (brandEmail) brandEmail.textContent = state.auth.email || '—';

  // perfil lateral
  const pfNome = document.getElementById('pfNome');
  const pfTel  = document.getElementById('pfTel');
  const pfEmail= document.getElementById('pfEmail');
  const pfRA   = document.getElementById('pfRA');
  if (pfNome)  pfNome.value  = state.perfil.nome || '';
  if (pfTel)   pfTel.value   = maskPhone(state.perfil.telefone || '');
  if (pfEmail) pfEmail.value = state.auth.email || '';
  if (pfRA)    pfRA.value    = state.auth.ra || '';

  // carteirinha
  const cardNome  = document.getElementById('cardNome');
  const cardRA    = document.getElementById('cardRA');
  const cardEmail = document.getElementById('cardEmail');
  if (cardNome)  cardNome.textContent  = state.perfil.nome || '—';
  if (cardRA)    cardRA.textContent    = state.auth.ra || '—';
  if (cardEmail) cardEmail.textContent = state.auth.email || '—';
}

// Supabase: buscar cadastro (apenas SELECT por user_id)
async function fetchMeSupabase(){
  try{
    if(!window.supa){ toast('Sem conexão com Supabase.', true); return; }
    const { data:{ user } } = await supa.auth.getUser();
    if(!user){ toast('Faça login para continuar.', true); return; }
    state.auth.id = user.id;

    const { data: me, error } = await supa
      .from('alunos')
      .select('id,user_id,email,ra,nome,telefone,criado_em')
      .eq('user_id', user.id)
      .single();
    if(error) throw error;

    state.auth.email = me.email;
    state.auth.ra    = me.ra || '';
    state.perfil.nome = me.nome || '';
    state.perfil.telefone = me.telefone || '';
    save(); renderProfile();
  }catch(e){
    console.error(e); toast('Cadastro não encontrado. Cadastre-se primeiro.', true);
  }
}

// Salvar edições do perfil
async function salvarPerfil(){
  try{
    if(!window.supa){ toast('Sem conexão com Supabase.', true); return; }
    const nomeUp = sanitizeUpperASCII((document.getElementById('pfNome')?.value||'').trim());
    const telDig = onlyDigits(document.getElementById('pfTel')?.value||'');

    state.perfil.nome = nomeUp;
    state.perfil.telefone = telDig;
    save(); renderProfile();

    const { error } = await supa.from('alunos')
      .update({ nome: nomeUp, telefone: telDig || null })
      .eq('user_id', state.auth.id);
    if(error) throw error;
    toast('Perfil salvo!');
  }catch(e){
    console.error(e); toast('Erro ao salvar.', true);
  }
}

// Tabs (alphabetical / sem pagamentos)
function setupTabs(){
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const views= Array.from(document.querySelectorAll('.view'));
  tabs.forEach(btn=>btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.classList.remove('active'));
    views.forEach(v=>v.classList.add('hidden')); // set hidden attr for a11y
    btn.classList.add('active');
    const id = btn.dataset.target;
    views.forEach(v=>{
      v.hidden = (v.id !== id);
      if(v.id === id) v.classList.remove('hidden');
    });
  }));
}

// Radar chart (Áreas de conhecimento)
function initRadar(){
  const ctx = document.getElementById('radarAreas');
  if(!ctx || !window.Chart) return;
  const data = {
    labels: ['Exatas', 'Humanas', 'Linguagens', 'Natureza', 'Tecnologia'],
    datasets: [{
      label: 'Estudado',
      data: [0,0,0,0,0],
      fill: true
    }]
  };
  new Chart(ctx, { type: 'radar', data, options: {
    responsive:true, scales:{ r:{ beginAtZero:true, ticks:{display:false}, grid:{color:'#e6ebf2'} } },
    plugins:{ legend:{ display:false } }
  }});
}

document.addEventListener('DOMContentLoaded', ()=>{
  // máscaras
  const pfTel = document.getElementById('pfTel');
  pfTel && pfTel.addEventListener('input', (e)=>{
    const caret=e.target.selectionStart, oldLen=e.target.value.length;
    e.target.value = maskPhone(e.target.value);
    const newLen=e.target.value.length; e.target.selectionStart=e.target.selectionEnd=caret+(newLen-oldLen);
  });

  document.getElementById('btnSalvarPerfil')?.addEventListener('click', salvarPerfil);

  setupTabs();
  renderProfile();
  fetchMeSupabase();
  initRadar();
});
