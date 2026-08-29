(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  let decorating = false;

  function readyCards() {
    return [...document.querySelectorAll('#listaSolicitacaoCertificados [data-curso-certificado]')]
      .filter(card => card.querySelector('.request-certificate-main-action') && card.querySelector('select[id^="horasSolicitadas-"]'));
  }
  function selectedItems() {
    return readyCards().filter(card => card.querySelector('.v42-pack-course-check')?.checked).map(card => {
      const curso_id = Number(card.dataset.cursoCertificado || 0);
      const select = card.querySelector(`#horasSolicitadas-${curso_id}`) || card.querySelector('select[id^="horasSolicitadas-"]');
      return { curso_id, horas:Number(select?.value || 50) };
    }).filter(x => x.curso_id > 0);
  }
  function updateSummary() {
    const items = selectedItems();
    const count = $('v42PackCount');
    const hours = $('v42PackHours');
    const button = $('v42PackSubmit');
    if (count) count.textContent = String(items.length);
    if (hours) hours.textContent = String(items.reduce((n, x) => n + Number(x.horas || 0), 0));
    if (button) button.disabled = items.length === 0;
  }
  async function submitPack() {
    const items = selectedItems();
    if (!items.length) return alert('Selecione ao menos um certificado para o PACK.');
    const coupon = String($('v42PackCoupon')?.value || '').trim();
    const summary = `${items.length} certificado(s) · ${items.reduce((n,x)=>n+x.horas,0)}h solicitadas no total`;
    const ok = window.AltitudeDialog
      ? await window.AltitudeDialog.confirm({ title:'Solicitar PACK de certificados', message:`${summary}. O sistema liberará cada certificado conforme as horas ficarem disponíveis.`, confirmText:'Solicitar PACK' })
      : window.confirm(`Solicitar PACK com ${summary}?`);
    if (!ok) return;
    const button = $('v42PackSubmit');
    const original = button?.textContent || 'Solicitar PACK';
    if (button) { button.disabled = true; button.textContent = 'Solicitando…'; }
    try {
      if (!window.sb?.rpc) throw new Error('Conexão com o Supabase indisponível.');
      const { data, error } = await window.sb.rpc('solicitar_pack_certificados_v42', { p_itens:items, p_cupom:coupon || null });
      if (error) throw error;
      const final = data?.valor_final;
      const discount = Number(data?.desconto || 0);
      const payment = String(data?.pagamento_status || '').toUpperCase();
      const paymentText = payment === 'PAGO' ? 'O PACK ficou quitado.' : `Valor do PACK: ${money(final)}.`;
      alert(`PACK solicitado com sucesso. ${data?.quantidade || items.length} certificado(s). ${discount > 0 ? `Desconto: ${money(discount)}. ` : ''}${paymentText} Os itens sem horas suficientes permanecerão aguardando horas.`);
      window.altitudeAnalyticsV42?.send?.('certificate_pack_request', `PACK ${items.length}`, { quantidade:items.length, horas:items.reduce((n,x)=>n+x.horas,0), cupom:Boolean(coupon) });
      window.location.reload();
    } catch (error) {
      console.error('PACK V42:', error);
      alert(`Não foi possível solicitar o PACK. ${error?.message || error}`);
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }
  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      const section = $('secaoCursosAptosCertificado');
      const list = $('listaSolicitacaoCertificados');
      if (!section || !list || section.hidden) return;
      const cards = readyCards();
      let panel = $('v42PackRequest');
      if (!cards.length) { panel?.remove(); return; }
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'v42PackRequest';
        panel.className = 'v42-pack-request';
        panel.innerHTML = `
          <div class="v42-pack-request-head">
            <div><h3>Solicitar certificados em PACK</h3><p>Selecione quantos cursos quiser. O PACK considera a quantidade e mantém a liberação de cada certificado vinculada às horas disponíveis.</p></div>
            <label class="v42-pack-select"><input type="checkbox" id="v42PackSelectAll"> Selecionar todos os aptos</label>
          </div>
          <div class="v42-pack-toolbar">
            <div class="v42-pack-summary"><span><strong id="v42PackCount">0</strong> certificado(s)</span><span><strong id="v42PackHours">0</strong> horas solicitadas</span></div>
            <label>Cupom do PACK <input id="v42PackCoupon" type="text" maxlength="30" placeholder="Cupom (opcional)" autocomplete="off"></label>
            <button type="button" class="primary-button" id="v42PackSubmit" disabled>Solicitar PACK</button>
          </div>`;
        section.insertBefore(panel, list);
        $('v42PackSelectAll')?.addEventListener('change', (event) => {
          readyCards().forEach(card => { const c = card.querySelector('.v42-pack-course-check'); if (c) c.checked = event.currentTarget.checked; });
          updateSummary();
        });
        $('v42PackSubmit')?.addEventListener('click', submitPack);
      }
      cards.forEach(card => {
        if (card.querySelector('.v42-pack-course-check')) return;
        const cursoId = Number(card.dataset.cursoCertificado || 0);
        const top = card.querySelector('.certificate-card-top') || card;
        const label = document.createElement('label');
        label.className = 'v42-pack-select';
        label.innerHTML = `<input class="v42-pack-course-check" type="checkbox" data-pack-curso="${cursoId}"> Incluir no PACK`;
        top.appendChild(label);
        label.querySelector('input')?.addEventListener('change', updateSummary);
        card.querySelector(`#horasSolicitadas-${cursoId}`)?.addEventListener('change', updateSummary);
      });
      updateSummary();
    } finally { decorating = false; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const list = $('listaSolicitacaoCertificados');
    if (!list) return;
    new MutationObserver(() => window.setTimeout(decorate, 0)).observe(list, { childList:true, subtree:false });
    window.setTimeout(decorate, 700);
  });
  window.AltitudeV42Pack = { decorate };
})();
