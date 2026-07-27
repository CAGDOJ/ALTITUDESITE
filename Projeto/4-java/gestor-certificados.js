(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (v='') => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const n = (v) => Math.max(0, Number(v || 0));
  const dateBR = (v, time=false) => {
    if (!v) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T12:00:00`) : new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', time ? {dateStyle:'short',timeStyle:'short'} : {dateStyle:'short'});
  };
  const money = (v) => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const isoDate = (v) => { if(!v) return ''; const d=/^\d{4}-\d{2}-\d{2}$/.test(String(v))?new Date(`${v}T12:00:00`):new Date(v); return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const suggestedPeriod = (registered,hours) => { const start=registered?new Date(registered):new Date(); start.setHours(12,0,0,0); const end=new Date(start); end.setDate(end.getDate()+Math.max(0,Math.ceil(n(hours)/8)-1)); const today=new Date();today.setHours(12,0,0,0);if(end>today)end.setTime(today.getTime());return {start:isoDate(start),end:isoDate(end)}; };

  const state = {
    certificados: [], carteiras: [], alunos: new Map(), cursos: new Map(),
    busca: '', filtro: 'TODOS', processadosBusca: '', processadosStatus: 'TODOS',
    certAtual: null, carteiraAtual: null, pdfEditId: null, loading: false, whatsapp: '5591983640933'
  };

  function toast(message, error=false){
    let el=document.querySelector('.gestor-toast');
    if(!el){el=document.createElement('div');el.className='gestor-toast';document.body.appendChild(el);}
    el.textContent=message;el.className=`gestor-toast show${error?' error':''}`;
    clearTimeout(el._t);el._t=setTimeout(()=>el.className='gestor-toast',3800);
  }
  function statusLabel(s){
    const x=String(s||'PENDENTE').toUpperCase();
    return ({PENDENTE:'Aguardando decisão',AGUARDANDO_HORAS:'Aguardando',EMITIDO:'Emitido',BLOQUEADO:'Bloqueado',CANCELADO:'Cancelado'})[x]||x;
  }
  function badge(s){
    const x=String(s||'PENDENTE').toUpperCase();
    const cls=x==='EMITIDO'?'resolvido':x==='BLOQUEADO'?'urgente':x==='CANCELADO'?'cancelado':'media';
    return `<span class="badge ${cls}">${esc(statusLabel(x))}</span>`;
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
        cursoIds.length?sb.from('cursos').select('id,titulo,categoria').in('id',cursoIds):Promise.resolve({data:[],error:null})
      ]);
      if(ar.error) throw ar.error; if(cur.error) throw cur.error;
      state.alunos=new Map((ar.data||[]).map(x=>[x.user_id,x]));
      state.cursos=new Map((cur.data||[]).map(x=>[Number(x.id),x]));
      renderWallets(); renderCertificates(); renderProcessed(); updateKpis();
    }catch(e){console.error(e); if(!options.silent) toast(`Não foi possível atualizar: ${e.message}`,true);}
    finally{state.loading=false;}
  }

  function renderWallets(){
    const body=$('tabCarteirasHorasGestao')?.querySelector('tbody'); if(!body) return;
    const q=norm(state.busca);
    const rows=state.carteiras.filter(x=>!q||norm([x.aluno_nome,x.aluno_ra,x.aluno_cpf,x.aluno_email].join(' ')).includes(q));
    if(!rows.length){body.innerHTML='<tr><td colspan="8">Nenhum aluno encontrado.</td></tr>';return;}
    body.innerHTML=rows.map(x=>`<tr>
      <td data-label="Aluno"><div class="cert-admin-student"><strong>${esc(x.aluno_nome||'Aluno')}</strong><small>RA ${esc(x.aluno_ra||'—')} · CPF ${esc(x.aluno_cpf||'—')}</small></div></td>
      <td data-label="Cadastro">${dateBR(x.cadastrado_em)}</td>
      <td data-label="Horas automáticas"><strong>${n(x.horas_automaticas)}h</strong><small class="table-subline">8h por dia desde o cadastro</small></td>
      <td data-label="Ajustes"><strong>${n(x.horas_adicionais)}h</strong></td>
      <td data-label="Reservadas">${n(x.horas_reservadas)}h</td><td data-label="Utilizadas">${n(x.horas_utilizadas)}h</td>
      <td data-label="Saldo"><strong>${n(x.saldo_disponivel)}h</strong></td>
      <td data-label="Ações"><button type="button" data-wallet-v34="${esc(x.aluno_id)}">Gerenciar horas</button></td>
    </tr>`).join('');
  }

  function pendingCertificates(){
    return state.certificados.filter(c=>['PENDENTE','AGUARDANDO_HORAS'].includes(String(c.status||'').toUpperCase()))
      .filter(c=>state.filtro==='TODOS'||String(c.status).toUpperCase()===state.filtro)
      .filter(c=>hit(c,{...aluno(c),...curso(c)}));
  }
  function processedCertificates(){
    let rows=state.certificados.filter(c=>!['PENDENTE','AGUARDANDO_HORAS'].includes(String(c.status||'').toUpperCase()));
    const q=norm(state.processadosBusca);
    if(q) rows=rows.filter(c=>norm([c.nome_aluno,c.nome_curso,c.numero_certificado,c.codigo_validacao,c.protocolo_pagamento,aluno(c).nome,aluno(c).ra,aluno(c).cpf,curso(c).titulo].join(' ')).includes(q));
    if(state.processadosStatus!=='TODOS') rows=rows.filter(c=>String(c.status).toUpperCase()===state.processadosStatus);
    return rows;
  }
  function certActions(c, processed=false){
    const id=Number(c.id), status=String(c.status||'PENDENTE').toUpperCase(), pay=String(c.pagamento_status||'AGUARDANDO_PAGAMENTO').toUpperCase();
    const parts=[`<button data-cert-detail-v34="${id}">Detalhes</button>`,`<button data-cert-whatsapp-v34="${id}">Abrir WhatsApp</button>`];
    if(!processed && !['PAGO','ISENTO'].includes(pay)) parts.push(`<button class="payment-confirm" data-cert-pay-v34="${id}">Confirmar pagamento</button>`);
    if(!processed && ['PAGO','ISENTO'].includes(pay)) parts.push(`<button class="release" data-cert-action-v34="LIBERAR" data-id="${id}">Liberar certificado</button>`);
    if(status==='EMITIDO') parts.push(`<button data-cert-pdf-preview-v34="${id}">Visualizar PDF</button><button class="pdf-action" data-cert-pdf-download-v34="${id}">Baixar PDF</button>`);
    if(status!=='EMITIDO') parts.push(`<button class="block" data-cert-action-v34="BLOQUEAR" data-id="${id}">Bloquear</button><button class="cancel" data-cert-action-v34="CANCELAR" data-id="${id}">Cancelar</button>`);
    if(['BLOQUEADO','CANCELADO'].includes(status)) parts.push(`<button data-cert-action-v34="REABRIR" data-id="${id}">Reabrir</button>`);
    return `<div class="cert-admin-actions">${parts.join('')}</div>`;
  }
  function certRow(c, processed=false){
    const a=aluno(c), course=curso(c), hours=n(c.horas_emitidas||c.horas_solicitadas);
    return `<tr>
      <td data-label="Aluno"><div class="cert-admin-student"><strong>${esc(c.nome_aluno||a.nome||'Aluno')}</strong><small>RA ${esc(a.ra||'—')} · CPF ${esc(a.cpf||'—')}</small></div></td>
      <td data-label="Curso"><div class="cert-admin-course"><strong>${esc(c.nome_curso||course.titulo||'Curso')}</strong><small>${esc(c.numero_certificado||c.protocolo_pagamento||'Aguardando número')}</small></div></td>
      <td data-label="Horas"><strong>${hours}h</strong></td><td data-label="Pagamento">${paymentBadge(c.pagamento_status)}</td>
      ${processed?`<td data-label="Situação">${badge(c.status)}</td><td data-label="Atualização">${dateBR(c.atualizado_em||c.emitido_em,true)}</td>`:`<td data-label="Solicitado em">${dateBR(c.solicitado_em||c.criado_em)}</td><td data-label="Situação">${badge(c.status)}</td>`}
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
    if($('certKpiPendente')) $('certKpiPendente').textContent=count('PENDENTE')+count('AGUARDANDO_HORAS');
    if($('certKpiEmitido')) $('certKpiEmitido').textContent=count('EMITIDO');
    if($('certKpiBloqueado')) $('certKpiBloqueado').textContent=count('BLOQUEADO');
    if($('certKpiCancelado')) $('certKpiCancelado').textContent=count('CANCELADO');
    if($('dashCertPendentes')) $('dashCertPendentes').textContent=count('PENDENTE')+count('AGUARDANDO_HORAS');
  }

  function openWallet(id){
    const x=state.carteiras.find(r=>r.aluno_id===id); if(!x) return toast('Carteira não encontrada.',true);
    state.carteiraAtual=x;
    $('horasModalTitulo').textContent=x.aluno_nome||'Gerenciar horas';
    $('horasModalResumo').innerHTML=`<article><span>Cadastro</span><strong>${dateBR(x.cadastrado_em)}</strong></article><article><span>Horas automáticas</span><strong>${n(x.horas_automaticas)}h</strong></article><article><span>Ajustes da gestão</span><strong>${n(x.horas_adicionais)}h</strong></article><article><span>Reservadas</span><strong>${n(x.horas_reservadas)}h</strong></article><article><span>Utilizadas</span><strong>${n(x.horas_utilizadas)}h</strong></article><article><span>Saldo disponível</span><strong>${n(x.saldo_disponivel)}h</strong></article>`;
    $('horasGestaoTotal').value=String(n(x.horas_adicionais));
    $('horasGestaoExcepcional').checked=true;
    $('horasGestaoJustificativa').value=x.justificativa_gestor||'';
    $('horasGestaoAlerta').className='hours-manager-alert ok';
    $('horasGestaoAlerta').textContent=`O aluno já possui ${n(x.horas_automaticas)}h automáticas. Este campo adiciona horas extras à carteira.`;
    $('modalHorasGestao').setAttribute('aria-hidden','false');
  }
  async function saveWallet(e){
    e.preventDefault(); const x=state.carteiraAtual; if(!x) return;
    const hours=Math.max(0,Math.round(n($('horasGestaoTotal').value)/5)*5), reason=$('horasGestaoJustificativa').value.trim();
    const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
    try{const {error}=await sb.rpc('gestor_definir_horas_aluno_v34',{p_aluno_id:x.aluno_id,p_horas_adicionais:hours,p_justificativa:reason||null});if(error)throw error;$('modalHorasGestao').setAttribute('aria-hidden','true');toast('Carteira atualizada.');await load();}catch(err){toast(err.message,true);}finally{btn.disabled=false;}
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
    if(error) return toast(error.message,true); toast('Pagamento confirmado. A solicitação já está pronta para liberação.'); await load();
  }
  async function decide(id, action){
    const c=state.certificados.find(x=>Number(x.id)===id); if(!c) return;
    let obs='';
    if(action==='LIBERAR'){
      const ok=window.AltitudeDialog?await AltitudeDialog.confirm({title:'Liberar certificado',message:'O pagamento está confirmado. O certificado será emitido usando o período contado desde o cadastro do aluno, respeitando 8 horas por dia.',confirmText:'Emitir e liberar'}):confirm('Liberar certificado?');
      if(!ok) return; obs='Pagamento confirmado e certificado liberado pela gestão.';
    }else{
      obs=window.AltitudeDialog?await AltitudeDialog.prompt({title:`${action==='BLOQUEAR'?'Bloquear':action==='CANCELAR'?'Cancelar':'Reabrir'} certificado`,label:'Motivo ou observação',required:true,confirmText:'Salvar'}):prompt('Motivo:');
      if(obs===null||obs===undefined) return;
    }
    const {error}=await sb.rpc('gestor_decidir_certificado_v34',{p_certificado_id:id,p_acao:action,p_observacao:obs||null,p_periodo_inicio:null,p_periodo_fim:null});
    if(error) return toast(error.message,true); toast(action==='LIBERAR'?'Certificado emitido e liberado.':'Situação atualizada.'); await load();
  }

  async function details(id){
    const c=state.certificados.find(x=>Number(x.id)===id); if(!c) return;
    state.certAtual=c; const a=aluno(c), course=curso(c);
    $('certModalTitulo').textContent=c.numero_certificado||c.protocolo_pagamento||`Solicitação #${id}`;
    $('certModalResumo').innerHTML=`<article><span>Aluno</span><strong>${esc(c.nome_aluno||a.nome||'—')}</strong></article><article><span>RA / CPF</span><strong>${esc(a.ra||'—')} · ${esc(a.cpf||'—')}</strong></article><article><span>Curso</span><strong>${esc(c.nome_curso||course.titulo||'—')}</strong></article><article><span>Horas</span><strong>${n(c.horas_emitidas||c.horas_solicitadas)}h</strong></article><article><span>Pagamento</span><strong>${esc(String(c.pagamento_status||'AGUARDANDO_PAGAMENTO').replaceAll('_',' '))}</strong></article><article><span>Valor</span><strong>${money(c.valor_final)}</strong></article><article><span>Cupom</span><strong>${esc(c.cupom_codigo||'—')}</strong></article><article><span>Protocolo</span><strong>${esc(c.protocolo_pagamento||'—')}</strong></article><article><span>Pagamento confirmado em</span><strong>${dateBR(c.pagamento_confirmado_em,true)}</strong></article><article><span>Observação financeira</span><strong>${esc(c.pagamento_observacao||'—')}</strong></article>`;
    const editable=['PENDENTE','AGUARDANDO_HORAS'].includes(String(c.status).toUpperCase()),form=$('formAjustarCertificadoV34');
    if(form){form.hidden=!editable;if(editable){const period=suggestedPeriod(a.criado_em,n(c.horas_solicitadas));$('certAjusteHoras').value=String(n(c.horas_solicitadas)||5);$('certAjusteInicio').value=isoDate(c.periodo_inicio)||period.start;$('certAjusteFim').value=isoDate(c.periodo_fim)||period.end;$('certAjusteObservacao').value=c.observacao_gestor||'';}}
    $('certModalAcoes').innerHTML=certActions(c,!editable);
    const {data,error}=await sb.from('certificados_historico').select('*').eq('certificado_id',id).order('criado_em',{ascending:false});
    $('certModalHistorico').innerHTML=error?`<div class="empty-state">${esc(error.message)}</div>`:(data||[]).map(h=>`<div class="cert-history-row"><span class="cert-history-dot"></span><div><strong>${esc(String(h.acao||'Atualização').replaceAll('_',' '))}</strong><span>${esc(h.observacao||'')}</span></div><small>${dateBR(h.criado_em,true)}</small></div>`).join('')||'<div class="empty-state">Sem histórico.</div>';
    $('modalCertificadoGestao').setAttribute('aria-hidden','false');
  }
  async function pdf(id, preview=false){
    const c=state.certificados.find(x=>Number(x.id)===id); if(!c||String(c.status).toUpperCase()!=='EMITIDO') return toast('O PDF só está disponível após a emissão.',true);
    if(!window.AltitudeCertificatePDF) return toast('Gerador de PDF não carregado.',true);
    const code=c.codigo_validacao||c.numero_certificado;
    const opts={sb,cert:c,aluno:aluno(c),curso:curso(c),logoUrl:'../3-img/LOGO.png',validationUrl:`${location.origin}/Projeto/1-html/8-certificados.html?codigo=${encodeURIComponent(code)}`};
    try{preview?await AltitudeCertificatePDF.preview(opts):await AltitudeCertificatePDF.download(opts);}catch(e){toast(e.message,true);}
  }

  async function wire(){
    const profile=await window.GESTOR_AUTH_READY; if(!profile||Number(profile.nivel_acesso||1)<2) return;
    const old=window.abrirAba; window.abrirAba=(id)=>{old?.(id);if(id==='certificados-gestao')load();};
    $('certBusca')?.addEventListener('input',e=>{state.busca=e.target.value;renderWallets();renderCertificates();});
    $('certFiltroStatus')?.addEventListener('change',e=>{state.filtro=e.target.value;renderCertificates();});
    $('certProcessadosBusca')?.addEventListener('input',e=>{state.processadosBusca=e.target.value;renderProcessed();});
    $('certProcessadosStatus')?.addEventListener('change',e=>{state.processadosStatus=e.target.value;renderProcessed();});
    $('btnAtualizarCertificados')?.addEventListener('click',()=>load());
    $('formGerenciarHoras')?.addEventListener('submit',saveWallet);
    $('formAjustarCertificadoV34')?.addEventListener('submit',saveCertificateAdjustment);
    $('horasMenos5')?.addEventListener('click',()=>{$('horasGestaoTotal').value=String(Math.max(0,n($('horasGestaoTotal').value)-5));});
    $('horasMais5')?.addEventListener('click',()=>{$('horasGestaoTotal').value=String(n($('horasGestaoTotal').value)+5);});
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
    });
    load();
    if(!window.__v34CertRealtime){window.__v34CertRealtime=true;const refresh=()=>setTimeout(()=>load({silent:true}),500);const ch=sb.channel('altitude-v34-certificados');['certificados','carteiras_horas_aluno_v34','packs_alunos_v34'].forEach(table=>ch.on('postgres_changes',{event:'*',schema:'public',table},refresh));ch.subscribe();}
  }
  document.addEventListener('DOMContentLoaded',wire);
})();
