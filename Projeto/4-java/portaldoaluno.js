const state = {
  user: { name:'Carlos Júnior', email:'carlos@example.com', ra:'—', cpf:'—', phone:'(00) 12345-5769' },
  progress: 0
};
function firstName(full){ return (full||'').split(' ')[0] || ''; }
function fillHeader(){
  document.getElementById('topName').textContent = state.user.name;
  document.getElementById('topRA').textContent = `RA: ${state.user.ra || '—'}`;
  document.getElementById('hero').textContent = `Bem-vindo, ${firstName(state.user.name)}!`;
  document.getElementById('infoRA').textContent = state.user.ra || '—';
  document.getElementById('infoCPF').textContent = state.user.cpf || '—';
  document.getElementById('infoEmail').textContent = state.user.email || '—';
  document.getElementById('infoPhone').textContent = state.user.phone || '—';
}
function initDonut(pct=0){
  const ctx = document.getElementById('donut'); if(!ctx || !window.Chart) return;
  new Chart(ctx, { type:'doughnut',
    data:{ datasets:[{ data:[pct, 100-pct], backgroundColor:['#3b82f6','#e9edf7'], borderWidth:0 }]},
    options:{ cutout:'72%', plugins:{ legend:{display:false}, tooltip:{enabled:false} } }
  });
  document.getElementById('donutVal').textContent = pct + '%';
}
function initMiniCal(){
  const el = document.getElementById('miniCal'); if(!el) return;
  const hdr = ['D','S','T','Q','Q','S','S'];
  hdr.forEach(c=>{ const d=document.createElement('div'); d.className='day hdr'; d.textContent=c; el.appendChild(d); });
  for(let i=1;i<=30;i++){ const d=document.createElement('div'); d.className='day'+(i===12?' mark':''); d.textContent=i; el.appendChild(d); }
}
async function trySupabase(){
  try{
    if(!window.supa) { fillHeader(); return; }
    const { data:{ user } } = await supa.auth.getUser();
    if(!user){ fillHeader(); return; }
    const { data, error } = await supa.from('alunos')
      .select('nome, ra, email, cpf, telefone')
      .eq('user_id', user.id)
      .single();
    if(!error && data){
      state.user.name = data.nome || state.user.name;
      state.user.ra   = data.ra || state.user.ra;
      state.user.email= data.email || state.user.email;
      state.user.cpf  = data.cpf || state.user.cpf;
      state.user.phone= data.telefone || state.user.phone;
    }
    fillHeader();
  }catch(e){ fillHeader(); }
}
document.addEventListener('DOMContentLoaded', ()=>{
  fillHeader();
  initDonut(state.progress);
  initMiniCal();
  document.getElementById('btnEstudo').addEventListener('click', ()=> alert('Abrir player/aula atual…'));
  trySupabase();
});
