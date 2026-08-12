(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = (v='') => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const money = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dateBR = v => v ? new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
  const state={certs:[],students:new Map(),courses:new Map(),packs:[],packDefs:new Map(),types:[],typeEdit:null,loading:false};
  function toast(message,error=false){let el=document.querySelector('.gestor-toast');if(!el){el=document.createElement('div');el.className='gestor-toast';document.body.appendChild(el);}el.textContent=message;el.className=`gestor-toast show${error?' error':''}`;clearTimeout(el._t);el._t=setTimeout(()=>el.className='gestor-toast',3500);}
  function openModal(id){$(id)?.setAttribute('aria-hidden','false');}
  function closeModal(id){$(id)?.setAttribute('aria-hidden','true');}
  function payLabel(value){return ({AGUARDANDO_PAGAMENTO:'Aguardando pagamento',PAGAMENTO_INFORMADO:'Pagamento informado',PAGO:'Pago - pronto para liberação',ISENTO:'Isento - pronto para liberação',CANCELADO:'Cancelado',PENDENTE:'Aguardando pagamento'})[String(value||'').toUpperCase()]||String(value||'Pendente').replaceAll('_',' ');}
  function titleForTab(id){return ({dashboard:'Visão geral',cursos:'Cursos e conteúdos',alunos:'Alunos','certificados-gestao':'Certificados','pagamentos-gestao':'Pagamentos','tipos-curso':'Tipos de curso',recompensas:'Recompensas',usuarios:'Equipe e acessos',chamados:'Atendimento',comercial:'Comercial e promoções'})[id]||'Portal de Gestão';}
  function removeEmojis(){document.querySelectorAll('main h1,main h2,main h3,main button').forEach(el=>{if(el.children.length)return;el.textContent=el.textContent.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/\s{2,}/g,' ').trim();});}
  async function loadPayments(){
    if(state.loading)return;state.loading=true;
    try{
      const [cr,pr,pd]=await Promise.all([
        sb.from('certificados').select('*').order('id',{ascending:false}),
        sb.from('packs_alunos_v34').select('*').order('criado_em',{ascending:false}),
        sb.from('packs_v34').select('*')
      ]);
      if(cr.error)throw cr.error;if(pr.error)throw pr.error;if(pd.error)throw pd.error;
      state.certs=cr.data||[];state.packs=pr.data||[];state.packDefs=new Map((pd.data||[]).map(x=>[Number(x.id),x]));
      const studentIds=[...new Set([...state.certs.map(x=>x.aluno_id),...state.packs.map(x=>x.aluno_id)].filter(Boolean))];
      const courseIds=[...new Set(state.certs.map(x=>Number(x.curso_id)).filter(Boolean))];
      const [sr,cor]=await Promise.all([
        studentIds.length?sb.from('alunos').select('user_id,nome,email,ra,cpf,telefone').in('user_id',studentIds):Promise.resolve({data:[],error:null}),
        courseIds.length?sb.from('cursos').select('id,titulo').in('id',courseIds):Promise.resolve({data:[],error:null})
      ]);
      if(sr.error)throw sr.error;if(cor.error)throw cor.error;
      state.students=new Map((sr.data||[]).map(x=>[x.user_id,x]));state.courses=new Map((cor.data||[]).map(x=>[Number(x.id),x]));
      renderPayments();
    }catch(e){console.error(e);toast(`Não foi possível carregar pagamentos: ${e.message}`,true);}finally{state.loading=false;}
  }
  function paymentFilter(item,kind){
    const q=norm($('pagamentosBuscaV34')?.value||'');const status=String($('pagamentosStatusV34')?.value||'TODOS').toUpperCase();
    const student=state.students.get(item.aluno_id)||{};const course=kind==='cert'?state.courses.get(Number(item.curso_id))||{}:{};
    const current=kind==='cert'?String(item.pagamento_status||'AGUARDANDO_PAGAMENTO').toUpperCase():String(item.status_pagamento||'PENDENTE').toUpperCase();
    if(status!=='TODOS' && current!==status && !(status==='AGUARDANDO_PAGAMENTO'&&current==='PENDENTE'))return false;
    return !q||norm([student.nome,student.ra,student.cpf,student.email,course.titulo,item.nome_curso,item.protocolo_pagamento,item.numero_certificado].join(' ')).includes(q);
  }
  function paymentGroupStatus(raw, kind='cert'){
    const value=String(raw||'').toUpperCase();
    if(value==='PAGO'||value==='ISENTO') return {group:'confirmed',label:value==='ISENTO'?'Confirmado sem cobrança':'Confirmado',css:'payment-confirmed'};
    if(value==='PAGAMENTO_INFORMADO') return {group:'pending',label:'A confirmar',css:'payment-pending'};
    if(value==='CANCELADO') return {group:'confirmed',label:'Cancelado',css:'payment-unpaid'};
    return {group:'pending',label:'Não pago',css:'payment-unpaid'};
  }
  function zeroReason(row,kind){
    if(Number(row.valor_final??row.valor_pago??row.valor_base)!==0)return '';
    if(row.cupom_codigo)return `Gratuito por cupom ${esc(row.cupom_codigo)}`;
    if(kind==='cert'&&row.pack_aluno_id)return 'Coberto por pack';
    if(String(row.pagamento_status||'').toUpperCase()==='ISENTO')return 'Gratuidade ou cortesia';
    if(kind==='pack'&&String(row.status_pagamento||'').toUpperCase()==='PAGO')return 'Pack gratuito';
    return 'Valor zerado — verifique a origem';
  }
  function paymentCertificateCard(c){
    const a=state.students.get(c.aluno_id)||{},course=state.courses.get(Number(c.curso_id))||{};
    const raw=String(c.pagamento_status||'AGUARDANDO_PAGAMENTO').toUpperCase(),meta=paymentGroupStatus(raw,'cert');
    const reason=zeroReason(c,'cert');
    return `<article class="commercial-card payment-card ${meta.css}">
      <div><span>${esc(c.protocolo_pagamento||`Solicitação ${c.id}`)}</span><h4>${esc(a.nome||c.nome_aluno||'Aluno')}</h4>
      <p>${esc(course.titulo||c.nome_curso||'Curso')} · ${Number(c.horas_solicitadas||c.horas_emitidas||0)}h</p>
      <small>RA ${esc(a.ra||'—')} · CPF ${esc(a.cpf||'—')}</small><strong>${money(c.valor_final)}</strong>
      ${reason?`<small>${esc(reason)}</small>`:''}<span class="payment-status-chip">${esc(meta.label)}</span></div>
      <div class="card-actions">${meta.group==='pending'?`<button type="button" class="success-action" data-confirm-cert-payment="${c.id}">Confirmar pagamento</button>`:''}
      <button type="button" data-open-cert-whatsapp="${c.id}">Abrir WhatsApp</button><button type="button" data-open-cert-details="${c.id}">Ver na certificação</button></div>
    </article>`;
  }
  function paymentPackCard(p){
    const a=state.students.get(p.aluno_id)||{},pack=state.packDefs.get(Number(p.pack_id))||{};
    const raw=String(p.status_pagamento||'PENDENTE').toUpperCase(),meta=paymentGroupStatus(raw,'pack');
    const reason=zeroReason(p,'pack');
    return `<article class="commercial-card payment-card ${meta.css}">
      <div><span>${esc(p.protocolo_pagamento||`Pack ${p.id}`)}</span><h4>${esc(a.nome||'Aluno')}</h4>
      <p>${esc(pack.nome||'Pack')} · ${Number(p.quantidade_adquirida||0)} certificado(s)</p>
      <small>RA ${esc(a.ra||'—')} · CPF ${esc(a.cpf||'—')}</small><strong>${money(p.valor_final??p.valor_pago??p.valor_base)}</strong>
      ${reason?`<small>${esc(reason)}</small>`:''}<span class="payment-status-chip">${esc(meta.label)}</span></div>
      <div class="card-actions">${meta.group==='pending'?`<button type="button" class="success-action" data-confirm-pack-payment-emissao="${p.id}">Confirmar pagamento</button>`:''}
      <button type="button" data-open-pack-whatsapp-emissao="${p.id}">Abrir WhatsApp</button></div>
    </article>`;
  }
  function groupedPaymentHtml(rows,cardFn,emptyText){
    if(!rows.length)return `<p class="empty-state">${esc(emptyText)}</p>`;
    const pending=rows.filter(row=>paymentGroupStatus(row.pagamento_status??row.status_pagamento).group==='pending');
    const confirmed=rows.filter(row=>paymentGroupStatus(row.pagamento_status??row.status_pagamento).group==='confirmed');
    return `<section class="payment-group-v342"><header><h4>A confirmar</h4><span>${pending.length} registro(s)</span></header>
      ${pending.length?pending.map(cardFn).join(''):'<p class="empty-state">Nenhum pagamento aguardando confirmação.</p>'}</section>
      <section class="payment-group-v342"><header><h4>Confirmados</h4><span>${confirmed.length} registro(s)</span></header>
      ${confirmed.length?confirmed.map(cardFn).join(''):'<p class="empty-state">Nenhum pagamento confirmado.</p>'}</section>`;
  }
  function renderPayments(){
    const certBox=$('listaPagamentosCertificadosGestao');
    if(certBox){const rows=state.certs.filter(x=>paymentFilter(x,'cert'));certBox.innerHTML=groupedPaymentHtml(rows,paymentCertificateCard,'Nenhum pagamento de certificado encontrado.');}
    const packBox=$('listaPacksPagamentosGestao');
    if(packBox){const rows=state.packs.filter(x=>paymentFilter(x,'pack'));packBox.innerHTML=groupedPaymentHtml(rows,paymentPackCard,'Nenhum pagamento de pack encontrado.');}
  }
  async function confirmCert(id){const {error}=await sb.rpc('gestor_confirmar_pagamento_certificado_v34',{p_certificado_id:Number(id),p_observacao:'Pagamento confirmado na aba Pagamentos.'});if(error)return toast(error.message,true);toast('Pagamento confirmado. A certificação já está pronta para liberação.');await loadPayments();}
  async function confirmPack(id){const row=state.packs.find(x=>Number(x.id)===Number(id));const {error}=await sb.rpc('gestor_confirmar_pagamento_pack_v34',{p_pack_aluno_id:Number(id),p_valor_pago:Number(row?.valor_final??row?.valor_base??0)});if(error)return toast(error.message,true);toast('Pagamento do pack confirmado.');await loadPayments();}
  function whatsapp(kind,id){const item=kind==='cert'?state.certs.find(x=>Number(x.id)===Number(id)):state.packs.find(x=>Number(x.id)===Number(id));if(!item)return;const a=state.students.get(item.aluno_id)||{};const subject=kind==='cert'?(state.courses.get(Number(item.curso_id))?.titulo||item.nome_curso||'Certificado'):(state.packDefs.get(Number(item.pack_id))?.nome||'Pack');const message=`Olá! Atendimento Altitude.\n\nAluno: ${a.nome||'—'}\nRA: ${a.ra||'—'}\nSolicitação: ${subject}\nProtocolo: ${item.protocolo_pagamento||'—'}\nSituação: ${payLabel(kind==='cert'?item.pagamento_status:item.status_pagamento)}`;window.open(`https://wa.me/5591983640933?text=${encodeURIComponent(message)}`,'_blank','noopener');}
  async function loadTypes(){const {data,error}=await sb.from('tipos_curso_catalogo_v34').select('*').order('ordem');if(error)return toast(error.message,true);state.types=data||[];renderTypes();}
  function renderTypes(){const box=$('listaTiposCursoGestao');if(!box)return;box.innerHTML=state.types.length?state.types.map(t=>`<article class="commercial-card type-course-card"><div><span>${esc(t.codigo)}</span><h4>${esc(t.nome)}</h4><p>${esc(t.descricao||'')}</p><small>${t.visivel_site?'Visível no site':'Oculto no site'} · ${t.permitir_inscricao?'Inscrições liberadas':'Inscrições bloqueadas'}</small></div><div class="card-actions"><button type="button" data-edit-type-course="${esc(t.codigo)}">Editar</button><button type="button" data-toggle-type-site="${esc(t.codigo)}">${t.visivel_site?'Ocultar do site':'Mostrar no site'}</button><button type="button" data-toggle-type-enrollment="${esc(t.codigo)}">${t.permitir_inscricao?'Bloquear inscrições':'Liberar inscrições'}</button></div></article>`).join(''):'<p class="empty-state">Nenhum tipo de curso cadastrado.</p>';}
  function editType(code=null){const t=code?state.types.find(x=>x.codigo===code):null;state.typeEdit=t||null;$('tipoCursoModalTitulo').textContent=t?'Editar tipo de curso':'Novo tipo de curso';$('tipoCursoCodigo').value=t?.codigo||'';$('tipoCursoCodigoNovo').value=t?.codigo||'';$('tipoCursoCodigoNovo').disabled=Boolean(t);$('tipoCursoNome').value=t?.nome||'';$('tipoCursoDescricao').value=t?.descricao||'';$('tipoCursoOrdem').value=String(t?.ordem??state.types.length+1);$('tipoCursoVisivel').checked=Boolean(t?.visivel_site);$('tipoCursoInscricao').checked=Boolean(t?.permitir_inscricao);openModal('modalTipoCursoV34');}
  async function saveType(e){e.preventDefault();const old=$('tipoCursoCodigo').value;const code=(old||$('tipoCursoCodigoNovo').value).trim().toUpperCase().replace(/[^A-Z0-9_]+/g,'_');if(!code)return toast('Informe o código interno.',true);const payload={codigo:code,nome:$('tipoCursoNome').value.trim(),descricao:$('tipoCursoDescricao').value.trim()||null,ordem:Number($('tipoCursoOrdem').value||0),visivel_site:$('tipoCursoVisivel').checked,permitir_inscricao:$('tipoCursoInscricao').checked,atualizado_por:window.GESTOR_ATUAL?.user_id||null,atualizado_em:new Date().toISOString()};const query=old?sb.from('tipos_curso_catalogo_v34').update(payload).eq('codigo',old):sb.from('tipos_curso_catalogo_v34').insert(payload);const {error}=await query;if(error)return toast(error.message,true);closeModal('modalTipoCursoV34');toast('Tipo de curso salvo.');await loadTypes();}
  async function toggleType(code,field){const t=state.types.find(x=>x.codigo===code);if(!t)return;const {error}=await sb.from('tipos_curso_catalogo_v34').update({[field]:!t[field],atualizado_em:new Date().toISOString()}).eq('codigo',code);if(error)return toast(error.message,true);await loadTypes();}
  async function wire(){try{await window.GESTOR_AUTH_READY;}catch(_){return;}removeEmojis();const old=window.abrirAba;window.abrirAba=(id)=>{old?.(id);document.title=`${titleForTab(id)} - Altitude`;if(id==='pagamentos-gestao')loadPayments();if(id==='tipos-curso')loadTypes();};$('btnAtualizarPagamentosV34')?.addEventListener('click',loadPayments);$('pagamentosBuscaV34')?.addEventListener('input',renderPayments);$('pagamentosStatusV34')?.addEventListener('change',renderPayments);$('btnNovoTipoCursoV34')?.addEventListener('click',()=>editType());$('formTipoCursoV34')?.addEventListener('submit',saveType);document.querySelectorAll('[data-close-emissao]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.closeEmissao)));document.addEventListener('click',e=>{let b=e.target.closest('[data-confirm-cert-payment]');if(b)confirmCert(b.dataset.confirmCertPayment);b=e.target.closest('[data-confirm-pack-payment-emissao]');if(b)confirmPack(b.dataset.confirmPackPaymentEmissao);b=e.target.closest('[data-open-cert-whatsapp]');if(b)whatsapp('cert',b.dataset.openCertWhatsapp);b=e.target.closest('[data-open-pack-whatsapp-emissao]');if(b)whatsapp('pack',b.dataset.openPackWhatsappEmissao);b=e.target.closest('[data-open-cert-details]');if(b){window.abrirAba?.('certificados-gestao');setTimeout(()=>document.querySelector(`[data-cert-detail-v34="${b.dataset.openCertDetails}"]`)?.click(),300);}b=e.target.closest('[data-edit-type-course]');if(b)editType(b.dataset.editTypeCourse);b=e.target.closest('[data-toggle-type-site]');if(b)toggleType(b.dataset.toggleTypeSite,'visivel_site');b=e.target.closest('[data-toggle-type-enrollment]');if(b)toggleType(b.dataset.toggleTypeEnrollment,'permitir_inscricao');});loadPayments();loadTypes();}
  document.addEventListener('DOMContentLoaded',wire);
})();
