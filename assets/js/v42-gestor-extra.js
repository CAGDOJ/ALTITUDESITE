(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

  // -------------------------------------------------------------------------
  // 105/116 — Cadastro manual por etapas em vez de tudo espremido na tela.
  // -------------------------------------------------------------------------
  function setupManualBuilderSteps() {
    const panel = $('normalBuilderPanel');
    const heading = panel?.querySelector('.v30-section-heading');
    const grid = panel?.querySelector('.course-builder-grid');
    const form = $('formModulo');
    const createPanel = panel?.querySelector('.builder-create-panel');
    const preview = panel?.querySelector('.v30-preview-column');
    const modules = panel?.querySelector('.v30-modules-section');
    if (!panel || !heading || !grid || !form || !createPanel || !preview || !modules || panel.querySelector('.v42-builder-steps')) return;
    const fields = [...form.querySelectorAll(':scope > fieldset.builder-form-section')];
    if (fields.length < 3) return;
    panel.classList.add('v42-step-mode');
    const nav = document.createElement('nav');
    nav.className = 'v42-builder-steps';
    nav.setAttribute('aria-label', 'Etapas do cadastro do módulo');
    nav.innerHTML = `
      <button type="button" data-v42-step="dados" class="active">1. Dados</button>
      <button type="button" data-v42-step="conteudo">2. Conteúdo</button>
      <button type="button" data-v42-step="midias">3. Mídias e anexos</button>
      <button type="button" data-v42-step="previa">4. Prévia</button>
      <button type="button" data-v42-step="modulos">5. Módulos do curso</button>`;
    heading.insertAdjacentElement('afterend', nav);

    const activate = (step) => {
      nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v42Step === step));
      const formStep = ['dados','conteudo','midias'].includes(step);
      createPanel.hidden = !formStep;
      preview.hidden = step !== 'previa';
      modules.hidden = step !== 'modulos';
      grid.hidden = step === 'modulos';
      fields.forEach((field, i) => { field.hidden = !formStep || ['dados','conteudo','midias'][i] !== step; });
      if (step === 'previa') {
        try { $('fModuloConteudo')?.dispatchEvent(new Event('input', { bubbles:true })); } catch (_) {}
      }
      document.querySelector('.builder-scroll-area')?.scrollTo?.({ top:0, behavior:'smooth' });
    };
    nav.addEventListener('click', e => { const b=e.target.closest('[data-v42-step]'); if (b) activate(b.dataset.v42Step); });
    // Ao editar um módulo existente, facilita acessar a lista/edição.
    $('btnRecarregarModulos')?.addEventListener('click', () => activate('modulos'));
    activate('dados');
  }

  // -------------------------------------------------------------------------
  // 114/115 — Painel do Gestor para aprovação coletiva de PACK.
  // -------------------------------------------------------------------------
  async function loadPackAdmin() {
    const list = $('v42PackAdminList');
    if (!list || !window.sb) return;
    list.innerHTML = '<div class="empty-state">Carregando PACKs…</div>';
    const { data:packs, error } = await sb.from('packs_alunos_v34')
      .select('id,aluno_id,quantidade_adquirida,quantidade_utilizada,valor_base,desconto,valor_final,cupom_codigo,status_pagamento,solicitacao_coletiva_v42,aprovacao_coletiva_status,criado_em')
      .eq('solicitacao_coletiva_v42', true).order('criado_em', { ascending:false }).limit(100);
    if (error) {
      list.innerHTML = `<div class="empty-state">Execute o SQL V42 para ativar PACKs coletivos.<br><small>${esc(error.message)}</small></div>`;
      return;
    }
    const rows = packs || [];
    if (!rows.length) { list.innerHTML = '<div class="empty-state">Nenhum PACK coletivo solicitado.</div>'; return; }
    const alunoIds = [...new Set(rows.map(x=>x.aluno_id).filter(Boolean))];
    const packIds = rows.map(x=>x.id);
    const [{ data:alunos }, { data:itens }] = await Promise.all([
      alunoIds.length ? sb.from('alunos').select('user_id,nome,ra,email').in('user_id', alunoIds) : Promise.resolve({data:[]}),
      packIds.length ? sb.from('certificado_pack_itens_v42').select('pack_aluno_id,curso_id,certificado_id,horas_solicitadas,status').in('pack_aluno_id', packIds) : Promise.resolve({data:[]})
    ]);
    const names = new Map((alunos||[]).map(a=>[a.user_id,a]));
    const grouped = new Map(); (itens||[]).forEach(i=>{ if(!grouped.has(i.pack_aluno_id)) grouped.set(i.pack_aluno_id,[]); grouped.get(i.pack_aluno_id).push(i); });
    list.innerHTML = rows.map(p => {
      const aluno = names.get(p.aluno_id) || {};
      const its = grouped.get(p.id) || [];
      const waiting = its.filter(x => String(x.status).toUpperCase() !== 'EMITIDO').length;
      const approved = String(p.aprovacao_coletiva_status || '').toUpperCase() === 'APROVADO';
      return `<article class="v42-pack-admin-card">
        <div>
          <strong>PACK #${Number(p.id)} — ${Number(p.quantidade_adquirida||its.length)} certificado(s)</strong>
          <p>${esc(aluno.nome || 'Aluno')} ${aluno.ra ? `· RA ${esc(aluno.ra)}` : ''}</p>
          <small>${its.reduce((n,x)=>n+Number(x.horas_solicitadas||0),0)}h solicitadas · ${waiting} aguardando · ${Number(p.quantidade_utilizada||0)} emitido(s)</small><br>
          <small>Subtotal ${money(p.valor_base)}${Number(p.desconto||0)>0 ? ` · Cupom ${esc(p.cupom_codigo||'')} (-${money(p.desconto)})` : ''} · Total <b>${money(p.valor_final)}</b></small><br>
          <small>Pagamento: ${esc(p.status_pagamento||'PENDENTE')} · Aprovação: ${esc(p.aprovacao_coletiva_status||'PENDENTE')}</small>
        </div>
        <div class="v42-pack-admin-actions">
          ${approved ? '<button type="button" disabled>PACK aprovado</button>' : `<button type="button" data-v42-approve-pack="${Number(p.id)}">Aprovar PACK</button>`}
        </div>
      </article>`;
    }).join('');
  }
  function setupPackAdmin() {
    const section = $('certificados-gestao');
    if (!section || $('v42PackAdmin')) return;
    const pageHeading = section.querySelector('.page-heading');
    const box = document.createElement('section');
    box.id = 'v42PackAdmin'; box.className = 'v42-pack-admin';
    box.innerHTML = `<div class="section-heading"><div><span>Solicitações coletivas</span><h3>PACKs de certificados</h3><p>Aprove todo o PACK de uma vez. Itens sem horas suficientes continuam aguardando e são liberados progressivamente.</p></div><button type="button" id="v42PackAdminRefresh">Atualizar PACKs</button></div><div id="v42PackAdminList" class="v42-pack-admin-list"></div>`;
    pageHeading?.insertAdjacentElement('afterend', box);
    $('v42PackAdminRefresh')?.addEventListener('click', loadPackAdmin);
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-v42-approve-pack]'); if (!b) return;
      const id = Number(b.dataset.v42ApprovePack || 0); if (!id) return;
      const ok = window.AltitudeDialog ? await window.AltitudeDialog.confirm({ title:'Aprovar PACK', message:'O pagamento do PACK será confirmado e todos os certificados do grupo serão autorizados. Os que ainda não tiverem horas suficientes permanecerão aguardando horas.', confirmText:'Aprovar PACK' }) : window.confirm('Aprovar este PACK?');
      if (!ok) return;
      const old=b.textContent; b.disabled=true; b.textContent='Aprovando…';
      try {
        const { data,error } = await sb.rpc('gestor_aprovar_pack_certificados_v42',{ p_pack_aluno_id:id, p_observacao:'Aprovação coletiva pelo Portal do Gestor V42' });
        if (error) throw error;
        alert(`PACK aprovado. ${Number(data?.emitidos_agora||0)} certificado(s) emitido(s) agora; ${Number(data?.aguardando||0)} permanecem aguardando requisitos/horas.`);
        window.altitudeAnalyticsV42?.send?.('pack_approve', `PACK ${id}`, data || {});
        await loadPackAdmin();
        $('btnAtualizarCertificados')?.click();
      } catch (error) { alert(`Não foi possível aprovar o PACK. ${error?.message || error}`); b.disabled=false; b.textContent=old; }
    });
  }

  // -------------------------------------------------------------------------
  // 109 — Métricas de tráfego, alcance, aquisição e conversão.
  // -------------------------------------------------------------------------
  function setupTrafficDashboard() {
    const section = $('estatisticas');
    const toolbar = section?.querySelector('.analytics-toolbar');
    if (!section || !toolbar || $('v42TrafficDashboard')) return;
    section.querySelector('.analytics-kpis')?.setAttribute('hidden','');
    section.querySelector('.analytics-grid')?.setAttribute('hidden','');
    const recent = $('analyticsRecentesV41')?.closest('.analytics-panel'); if (recent) recent.hidden=true;
    const wrap=document.createElement('div'); wrap.id='v42TrafficDashboard';
    wrap.innerHTML=`
      <div class="analytics-kpis v42-traffic-kpis">
        <article><span>Visitantes únicos</span><strong id="v42Visitors">0</strong></article>
        <article><span>Acessos / páginas</span><strong id="v42PageViews">0</strong></article>
        <article><span>Sessões</span><strong id="v42Sessions">0</strong></article>
        <article><span>Novos cadastros</span><strong id="v42Signups">0</strong></article>
        <article><span>Novas matrículas</span><strong id="v42Enrollments">0</strong></article>
        <article><span>Conversão em matrícula</span><strong id="v42Conversion">0%</strong></article>
      </div>
      <div class="analytics-panel"><div class="section-heading"><div><span>Funil</span><h3>Alcance → interesse → cadastro → matrícula</h3></div></div><div id="v42Funnel" class="v42-funnel"></div></div>
      <div class="v42-analytics-columns">
        <div class="analytics-panel"><div class="section-heading"><div><span>Aquisição</span><h3>Origem do tráfego</h3></div></div><div id="v42Sources" class="analytics-list"></div></div>
        <div class="analytics-panel"><div class="section-heading"><div><span>Conteúdo</span><h3>Páginas mais acessadas</h3></div></div><div id="v42TopPages" class="analytics-list"></div></div>
        <div class="analytics-panel"><div class="section-heading"><div><span>Tecnologia</span><h3>Dispositivos, navegador e sistema</h3></div></div><div id="v42Tech" class="analytics-list"></div></div>
        <div class="analytics-panel"><div class="section-heading"><div><span>Campanhas</span><h3>UTM / campanhas</h3></div></div><div id="v42Campaigns" class="analytics-list"></div></div>
      </div>`;
    toolbar.insertAdjacentElement('afterend',wrap);
  }
  const countMap = (rows,keyFn) => { const m=new Map(); rows.forEach(r=>{const k=keyFn(r);if(k)m.set(k,(m.get(k)||0)+1)});return [...m].sort((a,b)=>b[1]-a[1]); };
  const rowsHtml = (pairs,empty='Sem dados no período.') => pairs.length ? pairs.slice(0,12).map(([k,n])=>`<div class="analytics-row"><span><strong>${esc(k)}</strong></span><b>${Number(n)}</b></div>`).join('') : `<div class="empty-state">${empty}</div>`;
  async function exactCount(table,column,since) {
    try { const { count,error }=await sb.from(table).select('*',{count:'exact',head:true}).gte(column,since); if(error) throw error; return Number(count||0); } catch (_) { return 0; }
  }
  async function loadTraffic() {
    if (!$('v42TrafficDashboard') || !window.sb) return;
    const days=Math.max(1,Number($('analyticsPeriodoV41')?.value||30)); const dev=$('analyticsDispositivoV41')?.value||''; const since=new Date(Date.now()-days*86400000).toISOString();
    let q=sb.from('analytics_eventos_v41').select('id,user_id,sessao_id,visitante_id,tipo,nome,pagina,dispositivo,origem,campanha,navegador,sistema,metadata,criado_em').gte('criado_em',since).order('criado_em',{ascending:false}).limit(10000);
    if(dev) q=q.eq('dispositivo',dev);
    let {data,error}=await q;
    if(error){ // compatibilidade pré-SQL V42
      let q2=sb.from('analytics_eventos_v41').select('id,user_id,sessao_id,tipo,nome,pagina,dispositivo,metadata,criado_em').gte('criado_em',since).order('criado_em',{ascending:false}).limit(10000);if(dev)q2=q2.eq('dispositivo',dev);({data,error}=await q2);
    }
    if(error){$('v42Sources').innerHTML=`<div class="empty-state">${esc(error.message)}</div>`;return;}
    const rows=data||[]; const pageRows=rows.filter(r=>r.tipo==='page_view');
    const visitors=new Set(rows.map(r=>r.visitante_id||r.metadata?.visitor_id||r.sessao_id).filter(Boolean));
    const sessions=new Set(rows.map(r=>r.sessao_id).filter(Boolean));
    const [signups,enrollments]=await Promise.all([exactCount('alunos','criado_em',since),exactCount('matriculas','criada_em',since)]);
    const pv=pageRows.length; const conversion=visitors.size?Math.round((enrollments/visitors.size)*1000)/10:0;
    $('v42Visitors').textContent=String(visitors.size);$('v42PageViews').textContent=String(pv);$('v42Sessions').textContent=String(sessions.size);$('v42Signups').textContent=String(signups);$('v42Enrollments').textContent=String(enrollments);$('v42Conversion').textContent=`${conversion}%`;
    const courseInterest=rows.filter(r=>r.pagina==='/cursos/' || /curso/i.test(String(r.nome||''))).length;
    $('v42Funnel').innerHTML=[['Visitantes',visitors.size],['Interações com cursos',courseInterest],['Cadastros',signups],['Matrículas',enrollments]].map(([k,n])=>`<article><strong>${Number(n)}</strong><span>${esc(k)}</span></article>`).join('');
    $('v42Sources').innerHTML=rowsHtml(countMap(pageRows,r=>r.origem||r.metadata?.utm_source||(r.metadata?.referrer?'Referência externa':'Direto')));
    $('v42TopPages').innerHTML=rowsHtml(countMap(pageRows,r=>r.pagina||'/'));
    const tech=[]; countMap(rows,r=>r.dispositivo||'Outro').slice(0,5).forEach(([k,n])=>tech.push([`Dispositivo · ${k}`,n])); countMap(rows,r=>r.navegador||r.metadata?.browser||'').slice(0,4).forEach(([k,n])=>tech.push([`Navegador · ${k}`,n])); countMap(rows,r=>r.sistema||r.metadata?.os||'').slice(0,4).forEach(([k,n])=>tech.push([`Sistema · ${k}`,n])); $('v42Tech').innerHTML=rowsHtml(tech);
    $('v42Campaigns').innerHTML=rowsHtml(countMap(pageRows,r=>r.campanha||r.metadata?.utm_campaign||''),'Nenhuma campanha UTM identificada no período.');
  }

  async function init() {
    try { await window.GESTOR_AUTH_READY; } catch (_) {}
    setupManualBuilderSteps(); setupPackAdmin(); setupTrafficDashboard();
    $('analyticsAtualizarV41')?.addEventListener('click',loadTraffic); $('analyticsPeriodoV41')?.addEventListener('change',loadTraffic); $('analyticsDispositivoV41')?.addEventListener('change',loadTraffic);
    $('btnAtualizarCertificados')?.addEventListener('click',loadPackAdmin);
    const old=window.abrirAba; if(!window.__v42AbrirAbaWrapped){window.__v42AbrirAbaWrapped=true;window.abrirAba=(id)=>{old?.(id);if(id==='estatisticas')setTimeout(loadTraffic,60);if(id==='certificados-gestao')setTimeout(loadPackAdmin,60);};}
    // Reforço do botão hambúrguer: o ícone é desenhado pelo CSS V42.
    const burger=$('btnMenuGestor'); if(burger){burger.setAttribute('aria-label','Abrir menu do gestor');burger.title='Menu';}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
