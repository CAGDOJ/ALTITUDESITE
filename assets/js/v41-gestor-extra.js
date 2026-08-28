(() => {
  'use strict';
  const $=id=>document.getElementById(id); const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtHours=(sec)=>{const h=Number(sec||0)/3600;return h<1?`${Math.round(h*60)}min`:`${h.toFixed(h<10?1:0)}h`};
  async function loadAnalytics(){
    const box=$('analyticsPaginasV41'); if(!box||!window.sb)return;
    const days=Math.max(1,Number($('analyticsPeriodoV41')?.value||30));
    const dev=$('analyticsDispositivoV41')?.value||'';
    const since=new Date(Date.now()-days*86400000).toISOString();
    let q=sb.from('analytics_eventos_v41').select('id,user_id,sessao_id,tipo,nome,pagina,dispositivo,metadata,criado_em').gte('criado_em',since).order('criado_em',{ascending:false}).limit(5000);
    if(dev) q=q.eq('dispositivo',dev);
    const {data,error}=await q;
    if(error){box.innerHTML=`<div class="empty-state">Execute o SQL V41 para ativar as estatísticas.<br><small>${esc(error.message)}</small></div>`;return;}
    const rows=data||[];
    const sessions=new Set(rows.map(x=>x.sessao_id).filter(Boolean)); const users=new Set(rows.map(x=>x.user_id).filter(Boolean));
    const studySeconds=rows.filter(x=>x.tipo==='session_touch').reduce((n,x)=>n+Number(x.metadata?.seconds||0),0);
    $('analyticsEventosV41').textContent=String(rows.length);$('analyticsSessoesV41').textContent=String(sessions.size);$('analyticsAlunosV41').textContent=String(users.size);$('analyticsEstudoV41').textContent=fmtHours(studySeconds);
    const counts=new Map();rows.forEach(x=>{const k=x.tipo==='page_view'?x.pagina:`${x.tipo}: ${x.nome||x.pagina}`;counts.set(k,(counts.get(k)||0)+1)});
    const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,15);
    box.innerHTML=top.length?top.map(([k,n])=>`<div class="analytics-row"><span><strong>${esc(k)}</strong><small>${n===1?'1 evento':`${n} eventos`}</small></span><b>${n}</b></div>`).join(''):'<div class="empty-state">Sem eventos no período.</div>';
    const dc=new Map();rows.forEach(x=>dc.set(x.dispositivo||'outro',(dc.get(x.dispositivo||'outro')||0)+1));
    $('analyticsDevicesV41').innerHTML=[...dc].sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="analytics-row"><span><strong>${esc(k==='mobile'?'Celular':k==='tablet'?'Tablet':k==='desktop'?'PC':k)}</strong></span><b>${n}</b></div>`).join('')||'<div class="empty-state">Sem dados.</div>';
    $('analyticsRecentesV41').innerHTML=rows.slice(0,30).map(x=>`<div class="analytics-row"><span><strong>${esc(x.nome||x.tipo)}</strong><small>${esc(x.pagina)} · ${new Date(x.criado_em).toLocaleString('pt-BR')}</small></span><b>${esc(x.dispositivo||'')}</b></div>`).join('')||'<div class="empty-state">Sem atividade recente.</div>';
  }
  async function wire(){try{await window.GESTOR_AUTH_READY}catch(_){return} $('analyticsAtualizarV41')?.addEventListener('click',loadAnalytics);$('analyticsPeriodoV41')?.addEventListener('change',loadAnalytics);$('analyticsDispositivoV41')?.addEventListener('change',loadAnalytics); const old=window.abrirAba;window.abrirAba=(id)=>{old?.(id);if(id==='estatisticas')setTimeout(loadAnalytics,40)};}
  document.addEventListener('DOMContentLoaded',wire);
})();
