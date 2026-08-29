(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const dateBR = (v) => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR'); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 105/116 — cadastro manual separado da revisão.
  function setManualView(view) {
    const panel = $('normalBuilderPanel');
    if (!panel) return;
    const next = view === 'revisao' ? 'revisao' : 'cadastro';
    panel.dataset.v42ManualView = next;
    panel.querySelectorAll('[data-v42-manual-tab]').forEach((button) => {
      const active = button.dataset.v42ManualTab === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelector('.builder-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function bindManualTabs() {
    const panel = $('normalBuilderPanel');
    if (!panel) return;
    panel.dataset.v42ManualView ||= 'cadastro';
    panel.querySelectorAll('[data-v42-manual-tab]').forEach((button) => button.addEventListener('click', () => setManualView(button.dataset.v42ManualTab)));
    $('formModulo')?.addEventListener('submit', () => window.setTimeout(() => setManualView('revisao'), 700));
    $('btnRecarregarModulos')?.addEventListener('click', () => setManualView('revisao'));
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.gc-mods,.course-build-button');
      if (button) window.setTimeout(() => setManualView('cadastro'), 100);
    });
  }

  // 107/108 — mesma grade/cor de ações em todas as telas do gestor.
  function normalizeActionGrids(root = document) {
    const selectors = [
      '#tabCursos td.course-action-cell','#tabAlunos td.student-actions','#tabCertificadosGestao td:last-child',
      '#tabCertificadosProcessados td:last-child','#tabCarteirasHorasGestao td:last-child','#tabUsuarios td:last-child',
      '.certificate-actions','.builder-module-actions','.ticket-actions','.card-actions'
    ];
    root.querySelectorAll?.(selectors.join(',')).forEach((box) => {
      const buttons = box.querySelectorAll('button,a.button,a.btn,.secondary-button,.primary-button');
      if (buttons.length >= 2) box.classList.add('v42-action-grid');
    });
  }
  function observeActions() {
    normalizeActionGrids();
    const observer = new MutationObserver((mutations) => mutations.forEach((m) => m.addedNodes.forEach((node) => {
      if (node.nodeType === 1) normalizeActionGrids(node);
    })));
    observer.observe(document.body, { childList:true, subtree:true });
  }

  // 109 — tráfego, alcance e conversão.
  let analyticsChart = null;
  async function fetchAllEvents(startISO) {
    const rows = [];
    const pageSize = 1000;
    for (let from = 0; from < 10000; from += pageSize) {
      const { data, error } = await window.sb.from('analytics_eventos_v41').select('id,user_id,sessao_id,tipo,nome,pagina,dispositivo,metadata,criado_em')
        .gte('criado_em', startISO).order('criado_em', { ascending:true }).range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }
  const eventVisitor = (e) => e?.metadata?.visitor_id || e?.user_id || e?.sessao_id || `e-${e?.id}`;
  const eventSource = (e) => String(e?.metadata?.source || (e?.metadata?.referrer_domain?.includes('google') ? 'google' : e?.metadata?.referrer_domain?.includes('instagram') ? 'instagram' : 'direct')).toLowerCase();
  const countBy = (rows, get) => rows.reduce((acc, row) => { const key = get(row) || 'Não identificado'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  function renderRank(id, entries, labeler = (x) => x) {
    const box = $(id); if (!box) return;
    const list = Object.entries(entries).sort((a,b) => b[1]-a[1]).slice(0,10);
    box.innerHTML = list.length ? list.map(([key,value],i) => `<div class="analytics-list-row"><b>${i+1}</b><span>${esc(labeler(key))}</span><strong>${Number(value).toLocaleString('pt-BR')}</strong></div>`).join('') : '<div class="empty-state">Sem dados no período.</div>';
  }
  async function realCount(table, column, startISO) {
    try {
      let q = window.sb.from(table).select('*', { count:'exact', head:true });
      if (column) q = q.gte(column, startISO);
      const { count, error } = await q; if (error) throw error; return count || 0;
    } catch (_) { return null; }
  }
  async function loadAnalyticsV42() {
    if (!$('analyticsVisitantesV42') || !window.sb) return;
    const button = $('analyticsAtualizarV42'); if (button) { button.disabled = true; button.textContent = 'Atualizando...'; }
    try {
      const days = Math.max(1, Number($('analyticsPeriodoV42')?.value || 30));
      const since = new Date(Date.now() - days * 86400000); since.setHours(0,0,0,0);
      let events = await fetchAllEvents(since.toISOString());
      // Evita dupla contagem V41+V42: quando houver eventos de tráfego V42, eles são a fonte principal de visitas/cliques.
      const hasV42 = events.some((e) => String(e.tipo || '').startsWith('traffic_'));
      const views = events.filter((e) => hasV42 ? e.tipo === 'traffic_page_view' : e.tipo === 'page_view');
      const clicks = events.filter((e) => hasV42 ? e.tipo === 'traffic_click' : e.tipo === 'click');
      const sessions = new Set(views.map((e) => e.sessao_id).filter(Boolean));
      const visitors = new Set(views.map(eventVisitor));

      const deviceFilter = $('analyticsDispositivoV42')?.value || '';
      const sourceFilter = $('analyticsOrigemV42')?.value || '';
      if (deviceFilter || sourceFilter) {
        const allow = (e) => (!deviceFilter || e.dispositivo === deviceFilter) && (!sourceFilter || eventSource(e) === sourceFilter);
        events = events.filter(allow);
      }

      const cadastrosReal = await realCount('alunos','criado_em',since.toISOString());
      const matriculasReal = await realCount('matriculas','criada_em',since.toISOString());
      const cadastrosEvt = new Set(events.filter((e) => /registration_(submit|success)|cadastro/i.test(String(e.tipo))).map(eventVisitor)).size;
      const matriculasEvt = new Set(events.filter((e) => /enrollment|matricul/i.test(`${e.tipo} ${e.nome}`)).map(eventVisitor)).size;
      const cadastros = cadastrosReal ?? cadastrosEvt;
      const matriculas = matriculasReal ?? matriculasEvt;

      $('analyticsVisitantesV42').textContent = visitors.size.toLocaleString('pt-BR');
      $('analyticsSessoesV42').textContent = sessions.size.toLocaleString('pt-BR');
      $('analyticsViewsV42').textContent = views.length.toLocaleString('pt-BR');
      $('analyticsClicksV42').textContent = clicks.length.toLocaleString('pt-BR');
      $('analyticsCadastrosV42').textContent = Number(cadastros).toLocaleString('pt-BR');
      $('analyticsMatriculasV42').textContent = Number(matriculas).toLocaleString('pt-BR');
      $('analyticsConversaoV42').textContent = `${visitors.size ? ((Number(matriculas)/visitors.size)*100).toFixed(1) : '0.0'}%`;

      const durationBySession = new Map();
      events.filter((e) => e.tipo === 'traffic_session').forEach((e) => {
        const seconds = Math.max(0, Number(e.metadata?.seconds || 0));
        durationBySession.set(e.sessao_id, Math.max(durationBySession.get(e.sessao_id) || 0, seconds));
      });
      const avgSec = durationBySession.size ? [...durationBySession.values()].reduce((a,b)=>a+b,0)/durationBySession.size : 0;
      $('analyticsTempoV42').textContent = avgSec >= 60 ? `${(avgSec/60).toFixed(1)}min` : `${Math.round(avgSec)}s`;

      renderRank('analyticsOrigensV42', countBy(views,eventSource), (k) => ({direct:'Acesso direto',google:'Google',instagram:'Instagram',other:'Outros'})[k] || k);
      renderRank('analyticsPaginasV42', countBy(views,(e)=>e.pagina || '/'));
      renderRank('analyticsDevicesV42', countBy(views,(e)=>e.dispositivo || 'Não identificado'), (k)=>({desktop:'PC',mobile:'Celular',tablet:'Tablet'})[k]||k);

      const dayCounts = countBy(views,(e)=>String(e.criado_em || '').slice(0,10));
      const labels = []; const values = [];
      for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate()-i); const key = d.toISOString().slice(0,10); labels.push(d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})); values.push(dayCounts[key] || 0); }
      if (window.Chart && $('analyticsChartV42')) {
        analyticsChart?.destroy?.();
        analyticsChart = new window.Chart($('analyticsChartV42'), { type:'line', data:{ labels, datasets:[{ label:'Visualizações', data:values, tension:.25, fill:false }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } } });
      }

      const courseInterest = new Set(events.filter((e)=>e.tipo==='course_interest').map(eventVisitor)).size;
      const regStart = new Set(events.filter((e)=>/funnel_registration_(start|submit)/.test(String(e.tipo))).map(eventVisitor)).size;
      const funnel = $('analyticsFunilV42');
      if (funnel) funnel.innerHTML = [
        ['Visitantes',visitors.size,'100%'],['Abriram curso',courseInterest,visitors.size?`${(courseInterest/visitors.size*100).toFixed(1)}%`:'0%'],['Iniciaram cadastro',regStart,visitors.size?`${(regStart/visitors.size*100).toFixed(1)}%`:'0%'],['Criaram conta',cadastros,visitors.size?`${(cadastros/visitors.size*100).toFixed(1)}%`:'0%'],['Matrículas',matriculas,visitors.size?`${(matriculas/visitors.size*100).toFixed(1)}%`:'0%']
      ].map(([label,value,rate])=>`<article><strong>${Number(value).toLocaleString('pt-BR')}</strong><span>${esc(label)}</span><small>${esc(rate)} dos visitantes</small></article>`).join('');

      const recent = $('analyticsRecentesV42');
      if (recent) recent.innerHTML = events.slice(-20).reverse().map((e)=>`<div class="analytics-list-row"><b>${esc(String(e.tipo||'evento').replaceAll('_',' '))}</b><span>${esc(e.nome||e.pagina||'')}</span><strong>${esc(new Date(e.criado_em).toLocaleString('pt-BR'))}</strong></div>`).join('') || '<div class="empty-state">Sem eventos.</div>';
    } catch (error) {
      console.error('Estatísticas V42:', error);
      const recent = $('analyticsRecentesV42'); if (recent) recent.innerHTML = `<div class="empty-state">Não foi possível carregar as estatísticas: ${esc(error.message)}</div>`;
    } finally { if (button) { button.disabled = false; button.textContent = 'Atualizar'; } }
  }

  // 114/115 — gestão do PACK de solicitações de certificados.
  function ensurePackManager() {
    const section = $('certificados-gestao');
    const before = section?.querySelector('.certificate-requests-heading');
    if (!section || !before || $('listaPacksCertificadosV42')) return;
    const heading = document.createElement('div'); heading.className='section-heading v42-pack-manager-heading';
    heading.innerHTML='<div><span>Solicitação coletiva</span><h3>PACKs de certificados</h3><p>Aprove o pacote inteiro. Os certificados são liberados progressivamente conforme as horas disponíveis.</p></div><button type="button" class="primary-action" id="btnAtualizarPacksCertV42">Atualizar PACKs</button>';
    const list = document.createElement('div'); list.id='listaPacksCertificadosV42'; list.className='v42-pack-manager-list';
    before.before(heading,list);
    $('btnAtualizarPacksCertV42')?.addEventListener('click', loadPacksManager);
  }
  async function loadPacksManager() {
    const list=$('listaPacksCertificadosV42'); if(!list||!window.sb)return;
    list.innerHTML='<div class="empty-state">Carregando PACKs...</div>';
    try{
      const {data:packs,error}=await window.sb.from('solicitacoes_pack_certificados_v42').select('*').order('criado_em',{ascending:false}).limit(100);
      if(error) throw error;
      if(!packs?.length){list.innerHTML='<div class="empty-state">Nenhum PACK solicitado.</div>';return;}
      const ids=packs.map(p=>p.id); const alunos=[...new Set(packs.map(p=>p.aluno_id))];
      const [{data:items},{data:studentRows}] = await Promise.all([
        window.sb.from('solicitacoes_pack_certificados_itens_v42').select('*').in('pack_id',ids).order('ordem'),
        window.sb.from('alunos').select('user_id,nome,ra').in('user_id',alunos)
      ]);
      const courseIds=[...new Set((items||[]).map(i=>i.curso_id))];
      const {data:courses}=courseIds.length?await window.sb.from('cursos').select('id,titulo').in('id',courseIds):{data:[]};
      const alunoMap=new Map((studentRows||[]).map(a=>[a.user_id,a])); const courseMap=new Map((courses||[]).map(c=>[Number(c.id),c]));
      list.innerHTML=packs.map(pack=>{
        const aluno=alunoMap.get(pack.aluno_id)||{}; const packItems=(items||[]).filter(i=>Number(i.pack_id)===Number(pack.id));
        const status=String(pack.status||'').replaceAll('_',' '); const payment=String(pack.pagamento_status||'').replaceAll('_',' ');
        return `<article class="v42-pack-status-card" data-pack-id="${pack.id}"><header><div><span class="eyebrow">${esc(pack.protocolo)}</span><h4>${esc(aluno.nome||'Aluno')} · ${pack.quantidade} certificados</h4><p>${esc(aluno.ra||'')} · ${pack.horas_total}h solicitadas · ${money(pack.valor_final)}</p></div><div>${esc(status)}<br><small>${esc(payment)}</small></div></header><ul>${packItems.map(i=>`<li>${esc(courseMap.get(Number(i.curso_id))?.titulo||`Curso ${i.curso_id}`)} — ${i.horas}h — ${esc(String(i.status||'').replaceAll('_',' '))}</li>`).join('')}</ul><div class="v42-action-grid v42-pack-manager-actions">${pack.status==='PENDENTE_APROVACAO'?`<button type="button" data-pack-approve="${pack.id}">Aprovar PACK</button>`:''}${pack.pagamento_status==='AGUARDANDO_PAGAMENTO'?`<button type="button" data-pack-pay="${pack.id}">Confirmar pagamento</button>`:''}<button type="button" data-pack-refresh="${pack.aluno_id}">Processar horas</button></div></article>`;
      }).join('');
    }catch(error){list.innerHTML=`<div class="empty-state">PACKs indisponíveis. Aplique o SQL da V42. ${esc(error.message)}</div>`;}
  }
  async function packAction(event){
    const approve=event.target.closest('[data-pack-approve]'); const pay=event.target.closest('[data-pack-pay]'); const refresh=event.target.closest('[data-pack-refresh]');
    if(!approve&&!pay&&!refresh)return;
    const btn=approve||pay||refresh; btn.disabled=true;
    try{
      let response;
      if(approve) response=await window.sb.rpc('gestor_aprovar_pack_certificados_v42',{p_pack_id:Number(approve.dataset.packApprove)});
      else if(pay) response=await window.sb.rpc('gestor_confirmar_pagamento_pack_certificados_v42',{p_pack_id:Number(pay.dataset.packPay)});
      else response=await window.sb.rpc('processar_packs_certificados_v42',{p_aluno_id:refresh.dataset.packRefresh});
      if(response.error)throw response.error;
      window.altitudeAnalyticsV42?.send('manager_pack_action',approve?'aprovar':pay?'pagar':'processar',{pack_id:Number(approve?.dataset.packApprove||pay?.dataset.packPay||0)});
      await loadPacksManager();
      $('btnAtualizarCertificados')?.click();
    }catch(error){alert(`Não foi possível concluir a ação do PACK. ${error.message}`);}finally{btn.disabled=false;}
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindManualTabs(); observeActions(); ensurePackManager();
    $('analyticsAtualizarV42')?.addEventListener('click', loadAnalyticsV42);
    $('analyticsPeriodoV42')?.addEventListener('change', loadAnalyticsV42);
    $('analyticsDispositivoV42')?.addEventListener('change', loadAnalyticsV42);
    $('analyticsOrigemV42')?.addEventListener('change', loadAnalyticsV42);
    $('listaPacksCertificadosV42')?.addEventListener('click', packAction);
    // Aguarda o Auth do gestor antes de consultar dados protegidos.
    try { await window.GESTOR_AUTH_READY; } catch (_) {}
    if ($('analyticsVisitantesV42')) loadAnalyticsV42();
    loadPacksManager();
  });
})();
