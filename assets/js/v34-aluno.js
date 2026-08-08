(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value = '') => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const cleanPhone = (value) => String(value || '').replace(/\D/g, '') || '5591983640933';
  const localDate = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const v34 = { config: null, promotions: [], promotionStates: [], packs: [], studentPacks: [], currentPromotion: null, sessionShown: new Set() };

  function notify(message, error = false) {
    if (typeof toast === 'function') return toast(message, error ? 'error' : 'success');
    const box = document.getElementById('globalToast');
    if (!box) return window.alert(message);
    box.textContent = message;
    box.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(box._v34Timer);
    box._v34Timer = setTimeout(() => { box.className = 'toast'; }, 3500);
  }

  function courseName(cert) {
    if (cert?.nome_curso) return cert.nome_curso;
    const item = (state.cursos || []).find((course) => Number(course.id) === Number(cert?.curso_id));
    return item?.titulo || 'Curso';
  }

  function paymentLabel(status) {
    const value = String(status || 'AGUARDANDO_PAGAMENTO').toUpperCase();
    const labels = {
      AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
      PAGAMENTO_INFORMADO: 'Comprovante informado',
      PAGO: 'Pagamento confirmado',
      ISENTO: 'Sem cobrança',
      CANCELADO: 'Cancelado'
    };
    return labels[value] || value.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }

  function paymentClass(status) {
    const value = String(status || '').toUpperCase();
    if (value === 'PAGO' || value === 'ISENTO') return 'success';
    if (value === 'PAGAMENTO_INFORMADO') return 'warning';
    if (value === 'CANCELADO') return 'danger';
    return 'neutral';
  }

  function promotionEligible(item){
    const audience=String(item?.publico||'TODOS').toUpperCase();
    if(audience==='TODOS')return true;
    if(audience==='MATRICULADOS')return Boolean((state.cursos||[]).length);
    if(audience==='APROVADOS')return (state.resultados||[]).some((row)=>row.aprovado===true||Number(row.nota||0)>=70);
    if(audience==='SEM_CERTIFICADO')return !(state.certificados||[]).some((row)=>String(row.status||'').toUpperCase()==='EMITIDO');
    return true;
  }

  async function loadActivePromotions() {
    const rpc = await sb.rpc('obter_promocoes_aluno_v34_3');
    if (!rpc.error) return rpc;
    const fallback = await sb.from('promocoes_v34').select('*')
      .eq('ativa', true)
      .order('prioridade', { ascending: false })
      .order('criado_em', { ascending: false });
    return fallback;
  }

  async function loadCommercialData() {
    if (!window.sb || !state?.aluno?.user_id) return;
    const [config, promotions, promotionStates, packs, studentPacks] = await Promise.all([
      sb.from('configuracoes_comerciais_v34').select('*').eq('id', 1).maybeSingle(),
      loadActivePromotions(),
      sb.from('promocoes_alunos_v34').select('*').eq('aluno_id', state.aluno.user_id),
      sb.from('packs_v34').select('*').order('criado_em', { ascending: false }),
      sb.from('packs_alunos_v34').select('*').eq('aluno_id', state.aluno.user_id).order('criado_em', { ascending: false })
    ]);
    if (!config.error) v34.config = config.data;
    if (!promotions.error) v34.promotions = (promotions.data || []).filter(promotionEligible);
    if (!promotionStates.error) v34.promotionStates = promotionStates.data || [];
    if (!packs.error) v34.packs = packs.data || [];
    if (!studentPacks.error) { const packMap = new Map((v34.packs || []).map((item) => [Number(item.id), item])); v34.studentPacks = (studentPacks.data || []).map((row) => ({ ...row, packs_v34: packMap.get(Number(row.pack_id)) || null })); }
    renderPromotions();
    renderPaymentRequests();
    showRequestedOrNextPromotion();
  }

  function certificatePaymentCard(cert) {
    const status = String(cert.pagamento_status || 'AGUARDANDO_PAGAMENTO').toUpperCase();
    const pending = !['PAGO', 'ISENTO', 'CANCELADO'].includes(status);
    const valueBase = Number(cert.valor_base || 0);
    const discount = Number(cert.desconto || 0);
    const finalValue = Number(cert.valor_final ?? valueBase);
    const coupon = cert.cupom_codigo ? `<span class="payment-coupon-applied">Cupom ${esc(cert.cupom_codigo)} aplicado</span>` : '';
    return `<article class="payment-request-card" data-payment-certificate="${Number(cert.id)}">
      <header><div><span>Certificado</span><h3>${esc(courseName(cert))}</h3></div><b class="payment-status ${paymentClass(status)}">${esc(paymentLabel(status))}</b></header>
      <dl>
        <div><dt>Carga escolhida</dt><dd>${Number(cert.horas_solicitadas || cert.horas_emitidas || 0)} horas</dd></div>
        <div><dt>Protocolo</dt><dd>${esc(cert.protocolo_pagamento || `ALT-CERT-${cert.id}`)}</dd></div>
        <div><dt>Valor padrão</dt><dd>${money(valueBase)}</dd></div>
        <div><dt>Desconto</dt><dd>${money(discount)}</dd></div>
        <div class="payment-total"><dt>Total</dt><dd>${money(finalValue)}</dd></div>
      </dl>
      ${coupon}
      ${pending ? `<div class="payment-coupon-row"><input type="text" maxlength="30" placeholder="Digite o cupom" data-cert-coupon-input="${Number(cert.id)}"><button type="button" data-apply-cert-coupon="${Number(cert.id)}">Aplicar cupom</button></div>` : ''}
      <div class="payment-request-actions">
        ${pending ? `<button type="button" class="whatsapp-payment-button" data-open-cert-whatsapp="${Number(cert.id)}">Continuar no WhatsApp</button><button type="button" class="secondary-button" data-report-cert-payment="${Number(cert.id)}">Já enviei o comprovante</button>` : ''}
        ${status === 'PAGAMENTO_INFORMADO' ? '<small>A equipe financeira foi avisada. A liberação receberá a confirmação automaticamente após a conferência.</small>' : ''}
        ${status === 'PAGO' ? '<small>Pagamento confirmado. A solicitação está disponível para a equipe de certificação.</small>' : ''}
        ${status === 'ISENTO' ? '<small>Esta solicitação está coberta por pack, promoção ou cupom integral.</small>' : ''}
      </div>
    </article>`;
  }

  function packRequestCard(row) {
    const pack = row.packs_v34 || v34.packs.find((item) => Number(item.id) === Number(row.pack_id)) || {};
    const paid = String(row.status_pagamento).toUpperCase() === 'PAGO';
    const informed = Boolean(row.pagamento_informado_em) && !paid;
    const status = paid ? 'PAGO' : informed ? 'PAGAMENTO_INFORMADO' : 'AGUARDANDO_PAGAMENTO';
    return `<article class="payment-request-card pack-payment-card" data-payment-pack="${Number(row.id)}">
      <header><div><span>Pack</span><h3>${esc(pack.nome || 'Pack de certificados')}</h3></div><b class="payment-status ${paymentClass(status)}">${esc(paymentLabel(status))}</b></header>
      <dl>
        <div><dt>Quantidade</dt><dd>${Number(row.quantidade_adquirida || pack.quantidade_certificados || 0)} certificados</dd></div>
        <div><dt>Disponíveis</dt><dd>${Math.max(0, Number(row.quantidade_adquirida || 0) - Number(row.quantidade_utilizada || 0))}</dd></div>
        <div><dt>Protocolo</dt><dd>${esc(row.protocolo_pagamento || `ALT-PACK-${row.id}`)}</dd></div>
        <div><dt>Desconto</dt><dd>${money(row.desconto)}</dd></div>
        <div class="payment-total"><dt>Total</dt><dd>${money(row.valor_final ?? row.valor_base)}</dd></div>
      </dl>
      ${row.cupom_codigo ? `<span class="payment-coupon-applied">Cupom ${esc(row.cupom_codigo)} aplicado</span>` : ''}
      ${!paid ? `<div class="payment-coupon-row"><input type="text" maxlength="30" placeholder="Digite o cupom" data-pack-coupon-input="${Number(row.id)}"><button type="button" data-apply-pack-coupon="${Number(row.id)}">Aplicar cupom</button></div>` : ''}
      <div class="payment-request-actions">
        ${!paid ? `<button type="button" class="whatsapp-payment-button" data-open-pack-whatsapp="${Number(row.id)}">Continuar no WhatsApp</button><button type="button" class="secondary-button" data-report-pack-payment="${Number(row.id)}">Já enviei o comprovante</button>` : '<small>Pack confirmado. O aluno escolhe os cursos posteriormente; somente a quantidade é controlada.</small>'}
      </div>
    </article>`;
  }

  function availablePackCard(pack) {
    return `<article class="available-pack-card">
      ${pack.imagem_url ? `<img src="${esc(pack.imagem_url)}" alt="${esc(pack.nome)}" loading="lazy">` : ''}
      <div><span>PACK COM ${Number(pack.quantidade_certificados)} CERTIFICADOS</span><h3>${esc(pack.nome)}</h3><p>${esc(pack.descricao || 'Escolha os cursos depois da compra.')}</p><strong>${money(pack.valor)}</strong></div>
      <div class="payment-coupon-row"><input type="text" maxlength="30" placeholder="Cupom opcional" data-new-pack-coupon="${Number(pack.id)}"><button type="button" data-request-pack="${Number(pack.id)}">Solicitar pack</button></div>
    </article>`;
  }

  function renderPaymentRequests() {
    const box = $('solicitacoesPagamentoV34');
    if (!box || typeof state === 'undefined') return;
    const certificates = (state.certificados || []).filter((cert) => {
      const status = String(cert.status || '').toUpperCase();
      return status !== 'EMITIDO' && status !== 'BLOQUEADO' && status !== 'CANCELADO';
    });
    const activePacks = (v34.packs || []).filter((pack) => pack.ativo !== false);
    const sections = [];
    if (certificates.length) sections.push(`<section class="payment-request-section-v34"><h2>Certificados solicitados</h2><div class="payment-request-list">${certificates.map(certificatePaymentCard).join('')}</div></section>`);
    if (v34.studentPacks.length) sections.push(`<section class="payment-request-section-v34"><h2>Meus packs</h2><div class="payment-request-list">${v34.studentPacks.map(packRequestCard).join('')}</div></section>`);
    if (activePacks.length) sections.push(`<section class="payment-request-section-v34"><h2>Packs disponíveis</h2><p>O pack controla somente a quantidade de certificados. Os cursos serão escolhidos depois.</p><div class="available-pack-grid">${activePacks.map(availablePackCard).join('')}</div></section>`);
    box.innerHTML = sections.length ? sections.join('') : '<div class="empty-state">Nenhuma solicitação de pagamento no momento.</div>';
  }

  window.renderSolicitacoesPagamentoV34 = renderPaymentRequests;

  async function applyCertificateCoupon(id) {
    const input = document.querySelector(`[data-cert-coupon-input="${Number(id)}"]`);
    const code = String(input?.value || '').trim().toUpperCase();
    if (!code) return notify('Informe o código do cupom.', true);
    const { data, error } = await sb.rpc('aplicar_cupom_certificado_v34', { p_certificado_id: Number(id), p_codigo: code });
    if (error) return notify(error.message, true);
    await carregarCertificados();
    renderCertificados(); renderPagamentos(); renderPaymentRequests();
    if (Number(data?.valor_final || 0) === 0 || data?.aguarda_data_e_autorizacao) notify('Cupom integral aplicado. O certificado ficou gratuito e será liberado após a data prevista e a autorização da gestão.');
    else notify('Cupom aplicado ao pagamento.');
  }

  async function applyPackCoupon(id) {
    const input = document.querySelector(`[data-pack-coupon-input="${Number(id)}"]`);
    const code = String(input?.value || '').trim().toUpperCase();
    if (!code) return notify('Informe o código do cupom.', true);
    const { data, error } = await sb.rpc('aplicar_cupom_pack_v34', { p_pack_aluno_id: Number(id), p_codigo: code });
    if (error) return notify(error.message, true);
    await loadCommercialData();
    if (String(data?.status_pagamento || '').toUpperCase() === 'PAGO') notify('Cupom integral aplicado. Pack liberado gratuitamente e de forma automática.');
    else notify('Cupom aplicado ao pack.');
  }

  async function requestPack(id) {
    const input = document.querySelector(`[data-new-pack-coupon="${Number(id)}"]`);
    const code = String(input?.value || '').trim().toUpperCase();
    const pack = v34.packs.find((item) => Number(item.id) === Number(id));
    const okay = window.AltitudeDialog ? await AltitudeDialog.confirm({
      title: `Solicitar ${pack?.nome || 'pack'}`,
      message: `O pack adiciona ${Number(pack?.quantidade_certificados || 0)} certificados após a confirmação do pagamento. Os cursos serão escolhidos depois.`,
      confirmText: 'Solicitar pack'
    }) : window.confirm('Solicitar este pack?');
    if (!okay) return;
    const { data, error } = await sb.rpc('solicitar_pack_v34', { p_pack_id: Number(id), p_cupom: code || null });
    if (error) return notify(error.message, true);
    await loadCommercialData();
    if (String(data?.status_pagamento || '').toUpperCase() === 'PAGO') notify('Cupom integral aplicado. Pack liberado gratuitamente e de forma automática.');
    else notify('Pack solicitado. Continue o pagamento pelo WhatsApp.');
  }

  function whatsappMessageForCertificate(cert) {
    const configMessage = String(v34.config?.mensagem_whatsapp || 'Olá! Desejo realizar o pagamento do certificado solicitado.').trim();
    return `${configMessage}\n\nAluno: ${state.aluno?.nome || ''}\nRA: ${state.aluno?.ra || ''}\nCurso: ${courseName(cert)}\nCarga horária solicitada: ${Number(cert.horas_solicitadas || 0)} horas\nProtocolo: ${cert.protocolo_pagamento || `ALT-CERT-${cert.id}`}\nValor do certificado: ${money(cert.valor_final ?? cert.valor_base)}${cert.cupom_codigo ? `\nCupom: ${cert.cupom_codigo}` : ''}\n\nAguardo as orientações para pagamento.`;
  }

  function whatsappMessageForPack(row) {
    const pack = row.packs_v34 || v34.packs.find((item) => Number(item.id) === Number(row.pack_id)) || {};
    return `Olá! Desejo realizar o pagamento de um pack da ALTITUDE CENTRO UNIVERSITÁRIO.\n\nAluno: ${state.aluno?.nome || ''}\nRA: ${state.aluno?.ra || ''}\nPack: ${pack.nome || 'Pack de certificados'}\nQuantidade: ${Number(row.quantidade_adquirida || 0)} certificados\nProtocolo: ${row.protocolo_pagamento || `ALT-PACK-${row.id}`}\nValor: ${money(row.valor_final ?? row.valor_base)}${row.cupom_codigo ? `\nCupom: ${row.cupom_codigo}` : ''}\n\nOs cursos serão escolhidos posteriormente.`;
  }

  async function openCertificateWhatsapp(id) {
    const cert = (state.certificados || []).find((item) => Number(item.id) === Number(id));
    if (!cert) return;
    await sb.rpc('registrar_whatsapp_certificado_v34', { p_certificado_id: Number(id) });
    const phone = cleanPhone(v34.config?.whatsapp);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessageForCertificate(cert))}`, '_blank', 'noopener');
  }

  window.altitudeAbrirWhatsappCertificado = openCertificateWhatsapp;

  async function openPackWhatsapp(id) {
    const row = v34.studentPacks.find((item) => Number(item.id) === Number(id));
    if (!row) return;
    await sb.rpc('registrar_whatsapp_pack_v34', { p_pack_aluno_id: Number(id) });
    const phone = cleanPhone(v34.config?.whatsapp);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessageForPack(row))}`, '_blank', 'noopener');
  }

  async function reportCertificatePayment(id) {
    const { error } = await sb.rpc('aluno_informar_pagamento_v34', { p_certificado_id: Number(id) });
    if (error) return notify(error.message, true);
    await carregarCertificados(); renderCertificados(); renderPagamentos(); renderPaymentRequests();
    notify('Comprovante informado. A equipe financeira foi avisada.');
  }

  async function reportPackPayment(id) {
    const { error } = await sb.rpc('aluno_informar_pagamento_pack_v34', { p_pack_aluno_id: Number(id) });
    if (error) return notify(error.message, true);
    await loadCommercialData();
    notify('Comprovante informado. A equipe financeira foi avisada.');
  }

  function promotionState(id) {
    return v34.promotionStates.find((item) => Number(item.promocao_id) === Number(id)) || null;
  }

  function promotionCard(item, saved = false) {
    const exclusive = `${location.origin}${location.pathname}?promocao=${encodeURIComponent(item.slug)}`;
    const destination = item.link_destino || exclusive;
    return `<article class="student-promotion-card">
      ${item.imagem_url ? `<img src="${esc(item.imagem_url)}" alt="${esc(item.titulo)}" loading="lazy">` : ''}
      <div><span>ALTITUDE</span><h3>${esc(item.titulo)}</h3><p>${esc(item.descricao || '')}</p><small>Publicado em ${localDate(item.criado_em)}</small></div>
      <footer><button type="button" data-save-promotion="${Number(item.id)}">${saved ? 'Salva' : 'Salvar'}</button><a href="${esc(destination)}" ${item.link_destino ? 'target="_blank" rel="noopener"' : ''}>${esc(item.texto_botao || 'Ver promoção')}</a><button type="button" data-open-promotion="${Number(item.id)}">Abrir detalhes</button></footer>
    </article>`;
  }

  function renderPromotions() {
    const list = $('listaPromocoesAluno');
    const savedBox = document.querySelector('#promocoesSalvasAluno .student-promotion-grid');
    if (!list || !savedBox) return;
    const savedIds = new Set(v34.promotionStates.filter((item) => item.salvo).map((item) => Number(item.promocao_id)));
    const saved = v34.promotions.filter((item) => savedIds.has(Number(item.id)));
    list.innerHTML = v34.promotions.length ? v34.promotions.map((item) => promotionCard(item, savedIds.has(Number(item.id)))).join('') : '<div class="empty-state">Nenhuma novidade publicada.</div>';
    savedBox.innerHTML = saved.length ? saved.map((item) => promotionCard(item, true)).join('') : '<div class="empty-state">Você ainda não salvou nenhuma promoção.</div>';
  }

  function shouldShowPromotion(item, stateRow) {
    if (v34.sessionShown.has(Number(item.id))) return false;
    if (!stateRow) return true;
    if (item.frequencia === 'CADA_ACESSO') return true;
    if (item.frequencia === 'UMA_VEZ') return !stateRow.visualizado_em;
    if (item.frequencia === 'DIARIA') {
      if (!stateRow.ultima_exibicao_em) return true;
      return new Date(stateRow.ultima_exibicao_em).toDateString() !== new Date().toDateString();
    }
    return true;
  }

  async function upsertPromotionState(item, patch) {
    if (!state?.aluno?.user_id) return;
    const current = promotionState(item.id) || {};
    const payload = { promocao_id: Number(item.id), aluno_id: state.aluno.user_id, ...current, ...patch };
    delete payload.promocoes_v34;
    const { error } = await sb.from('promocoes_alunos_v34').upsert(payload, { onConflict: 'promocao_id,aluno_id' });
    if (!error) {
      const index = v34.promotionStates.findIndex((row) => Number(row.promocao_id) === Number(item.id));
      if (index >= 0) v34.promotionStates[index] = payload; else v34.promotionStates.push(payload);
      renderPromotions();
    }
  }

  async function openPromotion(item) {
    if (!item) return;
    v34.currentPromotion = item;
    const modal = $('v34PromotionModal');
    const image = $('v34PromotionImage');
    if (image) { image.src = item.imagem_url || ''; image.hidden = !item.imagem_url; }
    if ($('v34PromotionTitle')) $('v34PromotionTitle').textContent = item.titulo || 'Novidade';
    if ($('v34PromotionDescription')) $('v34PromotionDescription').textContent = item.descricao || '';
    const action = $('v34PromotionAction');
    if (action) {
      action.textContent = item.texto_botao || 'Ver promoção';
      action.href = item.link_destino || `${location.pathname}?promocao=${encodeURIComponent(item.slug)}`;
    }
    const save = $('v34PromotionSave');
    if (save) save.textContent = promotionState(item.id)?.salvo ? 'Promoção salva' : 'Salvar promoção';
    modal?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('v34-modal-open');
    v34.sessionShown.add(Number(item.id));
    await upsertPromotionState(item, { visualizado_em: promotionState(item.id)?.visualizado_em || new Date().toISOString(), ultima_exibicao_em: new Date().toISOString() });
  }

  async function closePromotion() {
    const item = v34.currentPromotion;
    $('v34PromotionModal')?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('v34-modal-open');
    if (item) await upsertPromotionState(item, { fechado_em: new Date().toISOString() });
    v34.currentPromotion = null;
  }

  async function savePromotion(item) {
    if (!item) return;
    const saved = !Boolean(promotionState(item.id)?.salvo);
    await upsertPromotionState(item, { salvo: saved, salvo_em: saved ? new Date().toISOString() : null });
    notify(saved ? 'Promoção salva.' : 'Promoção removida dos itens salvos.');
    if (v34.currentPromotion?.id === item.id && $('v34PromotionSave')) $('v34PromotionSave').textContent = saved ? 'Promoção salva' : 'Salvar promoção';
  }

  function showRequestedOrNextPromotion() {
    if ($('v34PromotionModal')?.getAttribute('aria-hidden') === 'false') return;
    const slug = new URLSearchParams(location.search).get('promocao');
    const requested = slug ? v34.promotions.find((item) => item.slug === slug) : null;
    if (requested) return openPromotion(requested);
    const next = v34.promotions.find((item) => shouldShowPromotion(item, promotionState(item.id)));
    if (next) window.setTimeout(() => {
      if ($('v34PromotionModal')?.getAttribute('aria-hidden') !== 'false') openPromotion(next);
    }, 450);
  }
  window.altitudeShowNextPromotionV342 = showRequestedOrNextPromotion;

  function wireEvents() {
    document.addEventListener('click', (event) => {
      let button = event.target.closest('[data-apply-cert-coupon]');
      if (button) return applyCertificateCoupon(button.dataset.applyCertCoupon);
      button = event.target.closest('[data-apply-pack-coupon]');
      if (button) return applyPackCoupon(button.dataset.applyPackCoupon);
      button = event.target.closest('[data-request-pack]');
      if (button) return requestPack(button.dataset.requestPack);
      button = event.target.closest('[data-open-cert-whatsapp]');
      if (button) return openCertificateWhatsapp(button.dataset.openCertWhatsapp);
      button = event.target.closest('[data-open-pack-whatsapp]');
      if (button) return openPackWhatsapp(button.dataset.openPackWhatsapp);
      button = event.target.closest('[data-report-cert-payment]');
      if (button) return reportCertificatePayment(button.dataset.reportCertPayment);
      button = event.target.closest('[data-report-pack-payment]');
      if (button) return reportPackPayment(button.dataset.reportPackPayment);
      button = event.target.closest('[data-save-promotion]');
      if (button) return savePromotion(v34.promotions.find((item) => Number(item.id) === Number(button.dataset.savePromotion)));
      button = event.target.closest('[data-open-promotion]');
      if (button) return openPromotion(v34.promotions.find((item) => Number(item.id) === Number(button.dataset.openPromotion)));
      if (event.target.closest('.v34-promotion-close')) return closePromotion();
      if (event.target === $('v34PromotionModal')) return closePromotion();
    });
    $('v34PromotionSave')?.addEventListener('click', () => savePromotion(v34.currentPromotion));
  }

  function realtime() {
    if (!window.sb || window.__v34StudentRealtime || !state?.aluno?.user_id) return;
    window.__v34StudentRealtime = true;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try { await carregarCertificados(); renderCertificados(); await loadCommercialData(); } catch (error) { console.warn('V34 realtime:', error.message); }
      }, 500);
    };
    const channel = sb.channel(`altitude-v34-aluno-${state.aluno.user_id}`);
    ['certificados', 'packs_alunos_v34', 'promocoes_v34', 'promocoes_alunos_v34', 'configuracoes_comerciais_v34']
      .forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
    channel.subscribe();
  }

  async function start() {
    wireEvents();
    document.addEventListener('altitude:aba-aluno', () => window.setTimeout(showRequestedOrNextPromotion, 250));
    for (let tries = 0; tries < 80 && !state?.aluno?.user_id; tries += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    if (!state?.aluno?.user_id) return;
    await loadCommercialData();
    realtime();
  }

  document.addEventListener('DOMContentLoaded', start);
})();
