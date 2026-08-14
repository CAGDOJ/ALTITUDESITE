(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (v='') => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const n = (v) => Math.max(0, Number(v || 0));
  const signed = (v) => Number(v || 0);
  const dateBR = (v, time=false) => {
    if (!v) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T12:00:00`) : new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', time ? {dateStyle:'short',timeStyle:'short'} : {dateStyle:'short'});
  };
  const money = (v) => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const isoDate = (v) => { if(!v) return ''; const d=/^\d{4}-\d{2}-\d{2}$/.test(String(v))?new Date(`${v}T12:00:00`):new Date(v); return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const suggestedPeriod = (registered,hours) => { const start=registered?new Date(registered):new Date(); start.setHours(12,0,0,0); const end=new Date(start); end.setDate(end.getDate()+Math.max(0,Math.ceil(n(hours)/8)-1)); const today=new Date();today.setHours(12,0,0,0);if(end>today)end.setTime(today.getTime());return {start:isoDate(start),end:isoDate(end)}; };
  const gestorEspecial = () => String(window.GESTOR_ATUAL?.gestor_id || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'') === 'GST20260001';

  const state = {
    certificados: [], carteiras: [], alunos: new Map(), cursos: new Map(),
    busca: '', filtro: 'TODOS', processadosBusca: '', processadosStatus: 'TODOS',
    certAtual: null, carteiraAtual: null, pdfEditId: null, loading: false, whatsapp: '5591983640933', hoursMode: 'add',
    notificacoesHoras: [], notificacoesHorasDisponiveis: true
  };

  function toast(message, error=false){
    let el=document.querySelector('.gestor-toast');
    if(!el){el=document.createElement('div');el.className='gestor-toast';document.body.appendChild(el);}
    el.textContent=message;el.className=`gestor-toast show${error?' error':''}`;
    clearTimeout(el._t);el._t=setTimeout(()=>el.className='gestor-toast',3800);
  }
  function statusLabel(s){
    const x=String(s||'PENDENTE').toUpperCase();
    return ({PENDENTE:'Aguardando decisão',AGUARDANDO_HORAS:'Aguardando horas',AGUARDANDO_PAGAMENTO:'Aguardando pagamento',PRONTO_PARA_LIBERACAO:'Pronto para liberação',AUTORIZADO_AGUARDANDO_DATA:'Aguardando data de liberação',EMITIDO:'Emitido',BLOQUEADO:'Bloqueado',CANCELADO:'Cancelado'})[x]||x;
  }
  function statusEfetivo(cert){
    const original=String(cert?.status||'PENDENTE').toUpperCase();
    if(['CANCELADO','BLOQUEADO','EMITIDO'].includes(original)) return original;
    if(n(cert?.horas_faltantes)>0) return 'AGUARDANDO_HORAS';
    const pay=String(cert?.pagamento_status||'').toUpperCase();
    if(pay && !['PAGO','ISENTO'].includes(pay)) return 'AGUARDANDO_PAGAMENTO';
    if(original==='AUTORIZADO_AGUARDANDO_DATA') return original;
    if(cert?.autorizado_em && (cert?.previsao_liberacao||cert?.data_final_prevista||cert?.periodo_fim||cert?.liberar_em)) return 'AUTORIZADO_AGUARDANDO_DATA';
    if(['PENDENTE','REABERTO'].includes(original) && ['PAGO','ISENTO'].includes(pay)) return 'PRONTO_PARA_LIBERACAO';
    return original;
  }
  function badge(s){
    const x=String(s||'PENDENTE').toUpperCase();
    const cls=x==='EMITIDO'?'resolvido':x==='BLOQUEADO'?'urgente':x==='CANCELADO'?'cancelado':'media';
    return `<span class="badge ${cls}">${esc(statusLabel(x))}</span>`;
  }

  function certificateTone(cert){
    const status=statusEfetivo(cert);
    const pay=String(cert?.pagamento_status||'').toUpperCase();
    if(['BLOQUEADO','CANCELADO'].includes(status)) return 'is-error';
    if(status==='PRONTO_PARA_LIBERACAO' || status==='EMITIDO') return 'is-ready';
    if(status==='PENDENTE' && ['PAGO','ISENTO'].includes(pay) && n(cert?.horas_faltantes)===0) return 'is-ready';
    return 'is-waiting';
  }
  function paymentBadge(s){
    const x=String(s||'AGUARDANDO_PAGAMENTO').toUpperCase();
    const label=({AGUARDANDO_PAGAMENTO:'Aguardando pagamento',PAGAMENTO_INFORMADO:'Pagamento informado',PAGO:'Pago',ISENTO:'Isento',CANCELADO:'Cancelado'})[x]||x;
    const cls=['PAGO','ISENTO'].includes(x)?'resolvido':x==='CANCELADO'?'cancelado':'media';
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }
  function aluno(cert){ return state.alunos.get(cert.aluno_id)||{}; }
  function curso(cert){ return state.cursos.get(Number(cert.curso_id))||{}; }
  function hit(item, extra={}){
    const q=norm(state.busca); if(!q) return true;
    return norm([item.aluno_nome,item.aluno_email,item.aluno_ra,item.aluno_cpf,item.nome_aluno,item.nome_curso,item.numero_certificado,item.codigo_validacao,item.protocolo_pagamento,extra.nome,extra.email,extra.ra,extra.cpf,extra.titulo].join(' ')).includes(q);
  }

  async function load(options={}){
    if(state.loading) return;
    state.loading=true;
    try{
      try{await sb.rpc('processar_certificados_prontos_v34_3');}catch(_){/* migration ainda não publicada */}
      const [cr,wr,cfg]=await Promise.all([
        sb.from('certificados').select('*').order('id',{ascending:false}),
        sb.rpc('obter_carteiras_horas_gestao_v34'),
        sb.from('configuracoes_comerciais_v34').select('whatsapp').eq('id',1).maybeSingle()
      ]);
      if(cr.error) throw cr.error;
      if(wr.error) throw wr.error;
      state.certificados=cr.data||[]; state.carteiras=wr.data||[]; state.whatsapp=String(cfg?.data?.whatsapp||state.whatsapp).replace(/\D/g,'')||'5591983640933';
      const alunoIds=[...new Set(state.certificados.map(x=>x.aluno_id).filter(Boolean))];
      const cursoIds=[...new Set(state.certificados.map(x=>Number(x.curso_id)).filter(Boolean))];
      const [ar,cur]=await Promise.all([
        alunoIds.length?sb.from('alunos').select('user_id,nome,email,ra,cpf,criado_em').in('user_id',alunoIds):Promise.resolve({data:[],error:null}),
        cursoIds.length?sb.from('cursos').select('id,titulo,categoria,tipo_curso').in('id',cursoIds):Promise.resolve({data:[],error:null})
      ]);
      if(ar.error) throw ar.error; if(cur.error) throw cur.error;
      state.alunos=new Map((ar.data||[]).map(x=>[x.user_id,x]));
      state.cursos=new Map((cur.data||[]).map(x=>[Number(x.id),x]));
      try {
        const nr = await sb.rpc('gestor_notificacoes_horas_v36');
        if (nr.error) throw nr.error;
        state.notificacoesHoras = nr.data || [];
        state.notificacoesHorasDisponiveis = true;
      } catch (notificationError) {
        console.warn('Notificações automáticas de horas:', notificationError.message);
        state.notificacoesHoras = [];
        state.notificacoesHorasDisponiveis = false;
      }
      renderWallets(); renderCertificates(); renderProcessed(); renderHoursNotifications(); updateKpis();
    }catch(e){
      console.error(e);
      const jaTemDados = state.certificados.length || state.carteiras.length || state.alunos.size || state.cursos.size;
      // Não exibe falso erro em refresh/realtime quando os dados já estão visíveis.
      if(!options.silent && !jaTemDados) toast(`Não foi possível carregar os dados: ${e.message}`,true);
    }
    finally{state.loading=false;}
  }

  function renderHoursNotifications(){
    const box=$('horasAutoNotificacoes'); if(!box) return;
    if(!state.notificacoesHorasDisponiveis){
      box.innerHTML='<div class="hours-auto-note is-empty"><strong>Cálculo automático V36 ainda não ativado no banco.</strong><span>Execute a migration 022_v36_fluxo_mobile_horas.sql no Supabase.</span></div>';
      return;
    }
    const rows=state.notificacoesHoras.slice(0,12);
    if(!rows.length){
      box.innerHTML='<div class="hours-auto-note is-empty">Nenhuma janela de certificado pendente precisa de atenção agora.</div>';
      return;
    }
    box.innerHTML=rows.map(x=>`<div class="hours-auto-note"><div><strong>${esc(x.aluno_nome||'Aluno')} · ${esc(x.curso_nome||'Curso')}</strong><span>${esc(x.mensagem||'Período calculado automaticamente.')}</span></div><small>${n(x.horas)}h · ${dateBR(x.periodo_inicio)} → ${dateBR(x.periodo_fim)}</small></div>`).join('');
  }

  async function recalcularPeriodosAutomaticamente(){
    const button=$('btnRecalcularHorasAutomatico');
    if(button){button.disabled=true;button.textContent='Recalculando…';}
    try{
      const {data,error}=await sb.rpc('gestor_recalcular_previsoes_todos_v36');
      if(error) throw error;
      toast(`Períodos recalculados para ${n(data?.alunos_processados)} aluno(s). Nenhuma janela foi sobreposta.`);
      await load();
    }catch(error){
      toast(error.message?.includes('gestor_recalcular_previsoes_todos_v36')?'Ative a migration V36 no Supabase para usar o cálculo automático.':error.message,true);
    }finally{
      if(button){button.disabled=false;button.textContent='Recalcular períodos automaticamente';}
    }
  }

  function renderWallets(){
    const body=$('tabCarteirasHorasGestao')?.querySelector('tbody'); if(!body) return;
    const q=norm(state.busca);
    const rows=state.carteiras.filter(x=>!q||norm([x.aluno_nome,x.aluno_ra,x.aluno_cpf,x.aluno_email].join(' ')).includes(q));
    if(!rows.length){body.innerHTML='<tr><td colspan="8">Nenhum aluno encontrado.</td></tr>';return;}
    body.innerHTML=rows.map(x=>`<tr>
      <td data-label="Aluno"><div class="cert-admin-student"><strong>${esc(x.aluno_nome||'Aluno')}</strong><small>RA ${esc(x.aluno_ra||'—')} · CPF ${esc(x.aluno_cpf||'—')}</small></div></td>
      <td data-label="Cadastro" class="no-wrap">${dateBR(x.data_inicio_contagem||x.cadastrado_em)}</td>
      <td data-label="Horas automáticas"><strong>${n(x.horas_automaticas)}h</strong><small class="table-subline">8h por dia desde o cadastro</small></td>
      <td data-label="Ajustes"><strong class="${signed(x.horas_adicionais)<0?'negative-value':''}">${signed(x.horas_adicionais)>0?'+':''}${signed(x.horas_adicionais)}h</strong></td>
      <td data-label="Reservadas">${n(x.horas_reservadas)}h</td><td data-label="Utilizadas">${n(x.horas_utilizadas)}h</td>
      <td data-label="Saldo"><strong>${n(x.saldo_disponivel)}h</strong></td>
      <td data-label="Ações"><button type="button" data-wallet-v34="${esc(x.aluno_id)}">Gerenciar horas</button></td>
    </tr>`).join('');
  }

  function pendingCertificates(){
    return state.certificados.filter(c=>['PENDENTE','AGUARDANDO_HORAS','AUTORIZADO_AGUARDANDO_DATA'].includes(String(c.status||'').toUpperCase()))
      .filter(c=>state.filtro==='TODOS'||String(c.status).toUpperCase()===state.filtro)
      .filter(c=>hit(c,{...aluno(c),...curso(c)}));
  }
  function processedCertificates(){
    let rows=state.certificados.filter(c=>!['PENDENTE','AGUARDANDO_HORAS','AUTORIZADO_AGUARDANDO_DATA'].includes(String(c.status||'').toUpperCase()));
    const q=norm(state.processadosBusca);
    if(q) rows=rows.filter(c=>norm([c.nome_aluno,c.nome_curso,c.numero_certificado,c.codigo_validacao,c.protocolo_pagamento,aluno(c).nome,aluno(c).ra,aluno(c).cpf,curso(c).titulo].join(' ')).includes(q));
    if(state.processadosStatus!=='TODOS') rows=rows.filter(c=>String(c.status).toUpperCase()===state.processadosStatus);
    return rows;
  }
  function certActions(c, processed=false){
    const id=Number(c.id), status=String(c.status||'PENDENTE').toUpperCase(), pay=String(c.pagamento_status||'AGUARDANDO_PAGAMENTO').toUpperCase();
    const parts=[`<button data-cert-detail-v34="${id}">Detalhes</button>`,`<button data-cert-whatsapp-v34="${id}">Abrir WhatsApp</button>`];
    if(!processed && !['PAGO','ISENTO'].includes(pay)) parts.push(`<button class="payment-confirm" data-cert-pay-v34="${id}">Confirmar pagamento</button>`);
    if(!processed && ['PAGO','ISENTO'].includes(pay) && !c.autorizado_em) parts.push(`<button class="release" data-cert-action-v34="LIBERAR" data-id="${id}">Autorizar emissão</button>`);
    if(status==='EMITIDO') parts.push(`<button data-cert-pdf-preview-v34="${id}">Visualizar PDF</button><button class="pdf-action" data-cert-pdf-download-v34="${id}">Baixar PDF</button>`);
    if(status!=='EMITIDO') parts.push(`<button class="block" data-cert-action-v34="BLOQUEAR" data-id="${id}">Bloquear</button><button class="cancel" data-cert-action-v34="CANCELAR" data-id="${id}">Cancelar</button>`);
    if(['BLOQUEADO','CANCELADO'].includes(status)) parts.push(`<button data-cert-action-v34="REABRIR" data-id="${id}">Reabrir</button>`);
    if(processed && Number(window.GESTOR_ATUAL?.nivel_acesso||0)>=4) parts.push(`<button class="danger-action" data-cert-delete-v342="${id}">Excluir certificado</button>`);
    return `<div class="cert-admin-actions">${parts.join('')}</div>`;
  }
  function certRow(c, processed=false){
    const a=aluno(c), course=curso(c), hours=n(c.horas_emitidas||c.horas_solicitadas);
    const tone=certificateTone(c);
    const statusText=statusLabel(statusEfetivo(c));
    return `<tr class="certificate-status-row ${tone}" data-status-text="${esc(statusText)}">
      <td data-label="Aluno"><div class="cert-admin-student"><strong>${esc(c.nome_aluno||a.nome||'Aluno')}</strong><small>RA ${esc(a.ra||'—')} · CPF ${esc(a.cpf||'—')}</small></div></td>
      <td data-label="Curso"><div class="cert-admin-course"><strong>${esc(c.nome_curso||course.titulo||'Curso')}</strong><small>${esc(c.numero_certificado||c.protocolo_pagamento||'Aguardando número')}</small></div></td>
      <td data-label="Horas"><strong>${hours}h</strong></td><td data-label="Pagamento">${paymentBadge(c.pagamento_status)}</td>
      ${processed?`<td data-label="Situação">${badge(statusEfetivo(c))}</td><td data-label="Atualização">${dateBR(c.atualizado_em||c.emitido_em,true)}</td>`:`<td data-label="Solicitado em">${dateBR(c.solicitado_em||c.criado_em)}</td><td data-label="Situação">${badge(statusEfetivo(c))}</td>`}
      <td data-label="Ações">${certActions(c,processed)}</td></tr>`;
  }
  function renderCertificates(){
    const body=$('tabCertificadosGestao')?.querySelector('tbody'); if(!body) return;
    const rows=pendingCertificates(); body.innerHTML=rows.length?rows.map(c=>certRow(c,false)).join(''):'<tr><td colspan="7">Nenhum certificado aguardando decisão.</td></tr>';
  }
  function renderProcessed(){
    const body=$('tabCertificadosProcessados')?.querySelector('tbody'); if(!body) return;
    const rows=processedCertificates(); body.innerHTML=rows.length?rows.map(c=>certRow(c,true)).join(''):'<tr><td colspan="7">Nenhum certificado processado.</td></tr>';
  }
  function updateKpis(){
    const count=s=>state.certificados.filter(c=>String(c.status).toUpperCase()===s).length;
    if($('certKpiPendente')) $('certKpiPendente').textContent=count('PENDENTE')+count('AGUARDANDO_HORAS')+count('AUTORIZADO_AGUARDANDO_DATA');
    if($('certKpiEmitido')) $('certKpiEmitido').textContent=count('EMITIDO');
    if($('certKpiBloqueado')) $('certKpiBloqueado').textContent=count('BLOQUEADO');
    if($('certKpiCancelado')) $('certKpiCancelado').textContent=count('CANCELADO');
    if($('dashCertPendentes')) $('dashCertPendentes').textContent=count('PENDENTE')+count('AGUARDANDO_HORAS')+count('AUTORIZADO_AGUARDANDO_DATA');
  }

  function setHoursMode(mode){
    state.hoursMode=mode==='remove'?'remove':'add';
    $('horasModoAdicionar')?.classList.toggle('active',state.hoursMode==='add');
    $('horasModoRetirar')?.classList.toggle('active',state.hoursMode==='remove');
    $('horasConfirmarAjuste').textContent=state.hoursMode==='remove'?'Confirmar retirada':'Confirmar adição';
    updateWalletPreview();
  }
  function updateWalletPreview(){
    const x=state.carteiraAtual;if(!x)return;
    let qty=Math.max(0,Math.round(n($('horasGestaoQuantidade')?.value)/5)*5);
    if($('horasGestaoQuantidade'))$('horasGestaoQuantidade').value=String(qty);
    const delta=state.hoursMode==='remove'?-qty:qty;
    const currentAdditional=signed(x.horas_adicionais);
    const nextAdditional=currentAdditional+delta;
    const automatic=n(x.horas_automaticas),reserved=n(x.horas_reservadas),used=n(x.horas_utilizadas);
    const current=Math.max(0,automatic+currentAdditional-reserved-used);
    const next=automatic+nextAdditional-reserved-used;
    $('horasGestaoTotal').value=String(nextAdditional);
    $('horasSaldoAtual').textContent=`${current}h`;
    $('horasSaldoDepois').textContent=`${Math.max(0,next)}h`;
    $('horasSaldoDepois').classList.toggle('negative-value',next<0);
    $('horasGestaoAlerta').textContent=next<0?'A retirada ultrapassa o saldo disponível. Reduza a quantidade.':qty===0?'Informe uma quantidade em múltiplos de 5 horas.':`${state.hoursMode==='remove'?'Retirada':'Adição'} de ${qty}h. Ajuste total da gestão após salvar: ${nextAdditional>0?'+':''}${nextAdditional}h.`;
  }
  function openWallet(id){
    const x=state.carteiras.find(r=>r.aluno_id===id); if(!x) return;
    state.carteiraAtual=x; state.hoursMode='add';
    $('horasModalTitulo').textContent=x.aluno_nome||'Carteira do aluno';
    $('horasModalResumo').innerHTML=`<article><span>Cadastro</span><strong>${dateBR(x.data_inicio_contagem||x.cadastrado_em)}</strong></article><article><span>Horas automáticas</span><strong>${n(x.horas_automaticas)}h</strong></article><article><span>Ajustes da gestão</span><strong>${signed(x.horas_adicionais)>0?'+':''}${signed(x.horas_adicionais)}h</strong></article><article><span>Reservadas</span><strong>${n(x.horas_reservadas)}h</strong></article><article><span>Utilizadas</span><strong>${n(x.horas_utilizadas)}h</strong></article><article><span>Saldo disponível</span><strong>${n(x.saldo_disponivel)}h</strong></article>`;
    $('horasGestaoQuantidade').value='0';
    $('horasGestaoTotal').value=String(signed(x.horas_adicionais));
    $('horasDataInicio').value=isoDate(x.data_inicio_contagem||x.cadastrado_em);
    const dataEntradaWrap=$('horasDataInicio')?.closest('label');
    if(dataEntradaWrap) dataEntradaWrap.hidden=!gestorEspecial();
    if($('horasDataInicio')) $('horasDataInicio').disabled=!gestorEspecial();
    $('horasGestaoJustificativa').value='';
    setHoursMode('add'); updateWalletPreview();
    $('modalHorasGestao').setAttribute('aria-hidden','false');
  }
  async function saveWallet(e){
    e.preventDefault(); const x=state.carteiraAtual; if(!x) return;
    updateWalletPreview();
    const total=Math.round(signed($('horasGestaoTotal').value)/5)*5;
    const reason=$('horasGestaoJustificativa').value.trim();
    const date=gestorEspecial()?($('horasDataInicio').value||null):null;
    const next=n(x.horas_automaticas)+total-n(x.horas_reservadas)-n(x.horas_utilizadas);
    if(!reason)return toast('Informe a justificativa da gestão.',true);
    if(next<0)return toast('O ajuste deixaria a carteira com saldo negativo.',true);
    const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
    try{
      const {error}=await sb.rpc('gestor_ajustar_carteira_aluno_v34',{p_aluno_id:x.aluno_id,p_horas_adicionais:total,p_justificativa:reason,p_data_inicio_contagem:date});
      if(error)throw error;
      $('modalHorasGestao').setAttribute('aria-hidden','true');toast('Carteira atualizada.');await load();
    }catch(err){toast(err.message,true);}finally{btn.disabled=false;}
  }

  function openWhatsapp(id){
    const c=state.certificados.find(x=>Number(x.id)===Number(id)); if(!c) return;
    const a=aluno(c), course=curso(c);
    const text=[
      'Olá! Atendimento ALTITUDE CENTRO UNIVERSITÁRIO.',
      '',
      `Aluno: ${c.nome_aluno||a.nome||'—'}`,
      `RA: ${a.ra||'—'}`,
      `Curso: ${c.nome_curso||course.titulo||'—'}`,
      `Carga solicitada: ${n(c.horas_emitidas||c.horas_solicitadas)} horas`,
      `Protocolo: ${c.protocolo_pagamento||'—'}`,
      `Situação do pagamento: ${String(c.pagamento_status||'AGUARDANDO_PAGAMENTO').replaceAll('_',' ')}`
    ].join('\n');
    window.open(`https://wa.me/${state.whatsapp}?text=${encodeURIComponent(text)}`,'_blank','noopener');
  }

  async function saveCertificateAdjustment(event){
    event.preventDefault();
    const c=state.certAtual;if(!c)return;
    const hours=Math.max(5,Math.round(n($('certAjusteHoras').value)/5)*5);
    if(hours>200) return toast('Cada certificado pode ter no máximo 200 horas.',true);
    const start=$('certAjusteInicio').value||null,end=$('certAjusteFim').value||null,obs=$('certAjusteObservacao').value.trim()||null;
    const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const {error}=await sb.rpc('gestor_ajustar_solicitacao_certificado_v34',{p_certificado_id:Number(c.id),p_horas:hours,p_periodo_inicio:start,p_periodo_fim:end,p_observacao:obs});
      if(error)throw error;
      toast('Carga e período atualizados.');await load();await details(Number(c.id));
    }catch(error){toast(error.message,true);}finally{button.disabled=false;}
  }

  async function confirmPayment(id){
    const c=state.certificados.find(x=>Number(x.id)===id); if(!c) return;
    const ok=window.AltitudeDialog?await AltitudeDialog.confirm({title:'Confirmar pagamento',message:`Confirma o pagamento de ${money(c.valor_final)} para o protocolo ${c.protocolo_pagamento||'—'}?`,confirmText:'Confirmar pagamento'}):confirm('Confirmar pagamento?');
    if(!ok) return;
    const {error}=await sb.rpc('gestor_confirmar_pagamento_certificado_v34',{p_certificado_id:id,p_observacao:'Pagamento confirmado pela gestão.'});
    if(error) return toast(error.message,true); toast('Pagamento confirmado. A emissão ainda respeitará a autorização da gestão e a data prevista.'); await load();
  }
  async function decide(id, action){
    const c=state.certificados.find(x=>Number(x.id)===id); if(!c) return;
    let obs='';
    if(action==='LIBERAR'){
      const previsao=dateBR(c.previsao_liberacao||c.data_final_prevista||c.periodo_fim);
      const ok=window.AltitudeDialog
        ? await AltitudeDialog.confirm({title:'Autorizar emissão',message:`A autorização será registrada agora. O certificado somente será liberado quando o pagamento, as horas e a data prevista estiverem concluídos.${previsao!=='—'?` Previsão: ${previsao}.`:''}`,confirmText:'Autorizar emissão'})
        : confirm('Autorizar a emissão deste certificado?');
      if(!ok) return;
      obs='Emissão autorizada pela gestão, respeitando a previsão e o limite global de 8 horas por dia.';
      const {data,error}=await sb.rpc('gestor_autorizar_certificado_v34_3',{p_certificado_id:id,p_observacao:obs});
      if(error) return toast(error.message,true);
      const emitido=Boolean(data?.emitido_agora)||String(data?.status||'').toUpperCase()==='EMITIDO';
      toast(emitido?'Certificado emitido e liberado.':`Emissão autorizada. Liberação prevista para ${dateBR(data?.previsao_liberacao||c.previsao_liberacao)}.`);
      await load();
      return;
    }
    obs=window.AltitudeDialog?await AltitudeDialog.prompt({title:`${action==='BLOQUEAR'?'Bloquear':action==='CANCELAR'?'Cancelar':'Reabrir'} certificado`,label:'Motivo ou observação',required:true,confirmText:'Salvar'}):prompt('Motivo:');
    if(obs===null||obs===undefined) return;
    const {error}=await sb.rpc('gestor_decidir_certificado_v34',{p_certificado_id:id,p_acao:action,p_observacao:obs||null,p_periodo_inicio:null,p_periodo_fim:null});
    if(error) return toast(error.message,true);
    toast('Situação atualizada.');
    await load();
  }

  async function deleteCertificate(id){
    const c=state.certificados.find(x=>Number(x.id)===Number(id)); if(!c)return;
    if(Number(window.GESTOR_ATUAL?.nivel_acesso||0)<4)return toast('Somente o gestor de nível máximo pode excluir certificados.',true);
    const reason=window.AltitudeDialog
      ? await AltitudeDialog.prompt({title:'Excluir certificado definitivamente',label:'Justificativa obrigatória',message:'O documento será removido do Portal do Aluno, o código e o QR Code deixarão de validar e as horas serão devolvidas à carteira.',required:true,confirmText:'Excluir certificado',danger:true})
      : prompt('Informe a justificativa para excluir o certificado:');
    if(reason===null||reason===undefined)return;
    if(!String(reason).trim())return toast('Informe a justificativa da exclusão.',true);
    const confirmed=window.AltitudeDialog
      ? await AltitudeDialog.confirm({title:'Confirmar exclusão',message:`Excluir definitivamente o certificado ${c.numero_certificado||c.id}? Esta ação não poderá ser desfeita.`,confirmText:'Excluir definitivamente',danger:true})
      : confirm('Excluir definitivamente este certificado?');
    if(!confirmed)return;
    const {error}=await sb.rpc('gestor_excluir_certificado_v34_2',{p_certificado_id:Number(id),p_motivo:String(reason).trim()});
    if(error)return toast(error.message,true);
    $('modalCertificadoGestao')?.setAttribute('aria-hidden','true');
    toast('Certificado excluído, validação invalidada e horas devolvidas.');
    await load();
  }

  async function details(id){
    const c=state.certificados.find(x=>Number(x.id)===id); if(!c) return;
    state.certAtual=c; const a=aluno(c), course=curso(c);
    $('certModalTitulo').textContent=c.numero_certificado||c.protocolo_pagamento||`Solicitação #${id}`;
    const wallet=state.carteiras.find(x=>x.aluno_id===c.aluno_id)||{};
    const requested=n(c.horas_emitidas||c.horas_solicitadas);
    const committed=n(c.horas_comprometidas_anteriores);
    const capacity=n(c.capacidade_periodo);
    const remainingCapacity=Math.max(0,capacity-committed-requested);
    $('certModalResumo').innerHTML=`
      <article><span>Aluno</span><strong>${esc(c.nome_aluno||a.nome||'—')}</strong></article>
      <article><span>RA / CPF</span><strong>${esc(a.ra||'—')} · ${esc(a.cpf||'—')}</strong></article>
      <article><span>Curso</span><strong>${esc(c.nome_curso||course.titulo||'—')}</strong></article>
      <article><span>Tipo</span><strong>${esc(c.tipo_curso_snapshot||course.tipo_curso||'PROFISSIONAL')}</strong></article>
      <article><span>Data de entrada</span><strong>${dateBR(wallet.data_inicio_contagem||wallet.cadastrado_em||a.criado_em)}</strong></article>
      <article><span>Horas solicitadas</span><strong>${requested}h</strong></article>
      <article><span>Saldo atual</span><strong>${n(wallet.saldo_disponivel)}h</strong></article>
      <article><span>Horas que faltam</span><strong>${n(c.horas_faltantes)}h</strong></article>
      <article><span>Data inicial prevista</span><strong>${dateBR(c.data_inicio_prevista||c.periodo_inicio)}</strong></article>
      <article><span>Data final prevista</span><strong>${dateBR(c.data_final_prevista||c.periodo_fim)}</strong></article>
      <article><span>Previsão de liberação</span><strong>${dateBR(c.previsao_liberacao||c.data_final_prevista||c.periodo_fim)}</strong></article>
      <article><span>Horas já comprometidas</span><strong>${committed}h</strong></article>
      <article><span>Capacidade calculada</span><strong>${capacity}h</strong></article>
      <article><span>Capacidade livre após este pedido</span><strong>${remainingCapacity}h</strong></article>
      <article><span>Pagamento</span><strong>${esc(String(c.pagamento_status||'AGUARDANDO_PAGAMENTO').replaceAll('_',' '))}</strong></article>
      <article><span>Autorização</span><strong>${c.autorizado_em?`Autorizado em ${dateBR(c.autorizado_em,true)}`:'Aguardando gestor'}</strong></article>
      <article><span>Valor</span><strong>${money(c.valor_final)}</strong></article>
      <article><span>Cupom</span><strong>${esc(c.cupom_codigo||'—')}</strong></article>
      <article><span>Protocolo</span><strong>${esc(c.protocolo_pagamento||'—')}</strong></article>`;
    const special=gestorEspecial();
    const editable=special&&['PENDENTE','AGUARDANDO_HORAS','AUTORIZADO_AGUARDANDO_DATA','EMITIDO'].includes(String(c.status).toUpperCase());
    const form=$('formAjustarCertificadoV34');
    if(form){
      form.hidden=!editable;
      if(editable){
        const period=suggestedPeriod(a.criado_em,requested);
        $('certAjusteHoras').value=String(requested||5);
        $('certAjusteInicio').value=isoDate(c.data_inicio_prevista||c.periodo_inicio)||period.start;
        $('certAjusteFim').value=isoDate(c.data_final_prevista||c.periodo_fim)||period.end;
        $('certAjusteObservacao').value='';
      }
    }
    const stillPending=['PENDENTE','AGUARDANDO_HORAS','AUTORIZADO_AGUARDANDO_DATA'].includes(String(c.status).toUpperCase());
    $('certModalAcoes').innerHTML=certActions(c,!stillPending);
    const {data,error}=await sb.from('certificados_historico').select('*').eq('certificado_id',id).order('criado_em',{ascending:false});
    $('certModalHistorico').innerHTML=error?`<div class="empty-state">${esc(error.message)}</div>`:(data||[]).map(h=>`<div class="cert-history-row"><span class="cert-history-dot"></span><div><strong>${esc(String(h.acao||'Atualização').replaceAll('_',' '))}</strong><span>${esc(h.observacao||'')}</span></div><small>${dateBR(h.criado_em,true)}</small></div>`).join('')||'<div class="empty-state">Sem histórico.</div>';
    $('modalCertificadoGestao').setAttribute('aria-hidden','false');
  }

  async function pdf(id, preview=false){
    const c=state.certificados.find(x=>Number(x.id)===id); if(!c||String(c.status).toUpperCase()!=='EMITIDO') return toast('O PDF só está disponível após a emissão.',true);
    if(!window.AltitudeCertificatePDF) return toast('Gerador de PDF não carregado.',true);
    const code=c.codigo_validacao||c.numero_certificado;
    const opts={sb,cert:c,aluno:aluno(c),curso:curso(c),logoUrl:'/assets/img/LOGO.png',validationUrl:`${location.origin}/certificados/?codigo=${encodeURIComponent(code)}`};
    try{preview?await AltitudeCertificatePDF.preview(opts):await AltitudeCertificatePDF.download(opts);}catch(e){toast(e.message,true);}
  }

  async function wire(){
    const profile=await window.GESTOR_AUTH_READY; if(!profile||Number(profile.nivel_acesso||1)<2) return; window.GESTOR_ATUAL=profile;
    const old=window.abrirAba; window.abrirAba=(id)=>{old?.(id);if(id==='certificados-gestao')load();};
    $('certBusca')?.addEventListener('input',e=>{state.busca=e.target.value;renderWallets();renderCertificates();});
    $('certFiltroStatus')?.addEventListener('change',e=>{state.filtro=e.target.value;renderCertificates();});
    $('certProcessadosBusca')?.addEventListener('input',e=>{state.processadosBusca=e.target.value;renderProcessed();});
    $('certProcessadosStatus')?.addEventListener('change',e=>{state.processadosStatus=e.target.value;renderProcessed();});
    $('btnAtualizarCertificados')?.addEventListener('click',()=>load());
    $('btnRecalcularHorasAutomatico')?.addEventListener('click',recalcularPeriodosAutomaticamente);
    $('formGerenciarHoras')?.addEventListener('submit',saveWallet);
    $('formAjustarCertificadoV34')?.addEventListener('submit',saveCertificateAdjustment);
    $('horasModoAdicionar')?.addEventListener('click',()=>setHoursMode('add'));
    $('horasModoRetirar')?.addEventListener('click',()=>setHoursMode('remove'));
    $('horasMenos5')?.addEventListener('click',()=>{const i=$('horasGestaoQuantidade');i.value=String(Math.max(0,n(i.value)-5));updateWalletPreview();});
    $('horasMais5')?.addEventListener('click',()=>{const i=$('horasGestaoQuantidade');i.value=String(n(i.value)+5);updateWalletPreview();});
    $('horasGestaoQuantidade')?.addEventListener('input',updateWalletPreview);
    $('horasDataInicio')?.addEventListener('change',updateWalletPreview);
    ['horasFecharModal','horasCancelar'].forEach(id=>$(id)?.addEventListener('click',()=>$('modalHorasGestao').setAttribute('aria-hidden','true')));
    $('certFecharModal')?.addEventListener('click',()=>$('modalCertificadoGestao').setAttribute('aria-hidden','true'));
    document.addEventListener('click',e=>{
      const w=e.target.closest('[data-wallet-v34]'); if(w)openWallet(w.dataset.walletV34);
      const payBtn=e.target.closest('[data-cert-pay-v34]'); if(payBtn)confirmPayment(Number(payBtn.dataset.certPayV34));
      const wa=e.target.closest('[data-cert-whatsapp-v34]'); if(wa)openWhatsapp(Number(wa.dataset.certWhatsappV34));
      const act=e.target.closest('[data-cert-action-v34]'); if(act)decide(Number(act.dataset.id),act.dataset.certActionV34);
      const det=e.target.closest('[data-cert-detail-v34]'); if(det)details(Number(det.dataset.certDetailV34));
      const dl=e.target.closest('[data-cert-pdf-download-v34]'); if(dl)pdf(Number(dl.dataset.certPdfDownloadV34),false);
      const pv=e.target.closest('[data-cert-pdf-preview-v34]'); if(pv)pdf(Number(pv.dataset.certPdfPreviewV34),true);
      const del=e.target.closest('[data-cert-delete-v342]'); if(del)deleteCertificate(Number(del.dataset.certDeleteV342));
    });
    load();
    if(!window.__v34CertRealtime){window.__v34CertRealtime=true;const refresh=()=>setTimeout(()=>load({silent:true}),500);const ch=sb.channel('altitude-v34-certificados');['certificados','carteiras_horas_aluno_v34','packs_alunos_v34'].forEach(table=>ch.on('postgres_changes',{event:'*',schema:'public',table},refresh));ch.subscribe();}
  }
  document.addEventListener('DOMContentLoaded',wire);
})();
