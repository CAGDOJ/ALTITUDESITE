(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = (v) => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let config = null;
  let packRows = [];
  let packItems = [];
  let rendering = false;

  function s(){ return window.__ALTITUDE_ALUNO_STATE; }
  function resultFor(courseId){ return (s()?.resultados||[]).filter(r=>Number(r.curso_id)===Number(courseId)).sort((a,b)=>Number(b.nota||0)-Number(a.nota||0))[0]||null; }
  function evaluated(courseId){ return (s()?.avaliacoes||[]).some(a=>Number(a.curso_id)===Number(courseId)); }
  function activeCert(courseId){ return (s()?.certificados||[]).some(c=>Number(c.curso_id)===Number(courseId)&&!['CANCELADO','BLOQUEADO'].includes(String(c.status||'').toUpperCase())); }
  function eligibleCourses(){
    return (s()?.cursos||[]).filter(c=>Number(c.progresso||0)>=100&&Boolean(resultFor(c.id)?.aprovado)&&evaluated(c.id)&&!activeCert(c.id));
  }
  async function loadConfig(){
    try{const {data,error}=await window.sb.from('configuracoes_comerciais_v34').select('valor_certificado,cobranca_ativa,whatsapp').eq('id',1).maybeSingle();if(!error)config=data||null;}catch(_){}
  }
  async function loadPacks(){
    if(!s()?.aluno?.user_id)return;
    try{
      const {data,error}=await window.sb.from('solicitacoes_pack_certificados_v42').select('*').eq('aluno_id',s().aluno.user_id).order('criado_em',{ascending:false});
      if(error)throw error; packRows=data||[];
      const ids=packRows.map(p=>p.id);
      if(ids.length){const {data:items,error:itemError}=await window.sb.from('solicitacoes_pack_certificados_itens_v42').select('*').in('pack_id',ids).order('ordem');if(itemError)throw itemError;packItems=items||[];}else packItems=[];
    }catch(error){console.debug('PACK V42 ainda não instalado:',error.message);packRows=[];packItems=[];}
  }
  function statusLabel(value){return String(value||'').replaceAll('_',' ').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());}
  function selectedItems(root){
    return [...root.querySelectorAll('[data-v42-pack-course]:checked')].map(check=>{
      const id=Number(check.dataset.v42PackCourse);const select=root.querySelector(`[data-v42-pack-hours="${id}"]`);
      return {curso_id:id,horas:Number(select?.value||50)};
    });
  }
  function updateSummary(root){
    const items=selectedItems(root);const base=Number(config?.cobranca_ativa===false?0:config?.valor_certificado||0)*items.length;
    const count=root.querySelector('[data-v42-pack-count]');const hours=root.querySelector('[data-v42-pack-total-hours]');const total=root.querySelector('[data-v42-pack-base]');
    if(count)count.textContent=String(items.length);if(hours)hours.textContent=`${items.reduce((sum,i)=>sum+i.horas,0)}h`;if(total)total.textContent=money(base);
    const button=root.querySelector('[data-v42-pack-submit]');if(button)button.disabled=items.length<2;
  }
  function packHistoryHtml(){
    if(!packRows.length)return '';
    const courseMap=new Map((s()?.cursos||[]).map(c=>[Number(c.id),c]));
    return `<div class="v42-pack-history"><h4>Meus PACKs</h4>${packRows.slice(0,8).map(pack=>{
      const items=packItems.filter(i=>Number(i.pack_id)===Number(pack.id));
      return `<article class="v42-pack-status-card"><header><div><span class="eyebrow">${esc(pack.protocolo)}</span><strong>PACK — ${pack.quantidade} certificados</strong><small>${pack.horas_total}h no total</small></div><div><b>${esc(statusLabel(pack.status))}</b><small>${esc(statusLabel(pack.pagamento_status))}</small></div></header><div class="v42-pack-summary"><div><span>Subtotal</span><strong>${money(pack.valor_base)}</strong></div><div><span>Desconto${pack.cupom_codigo?` · ${esc(pack.cupom_codigo)}`:''}</span><strong>${money(pack.desconto)}</strong></div><div><span>Total</span><strong>${money(pack.valor_final)}</strong></div><div><span>Certificados</span><strong>${pack.quantidade}</strong></div></div><ul>${items.map(i=>`<li>${esc(courseMap.get(Number(i.curso_id))?.titulo||`Curso ${i.curso_id}`)} — ${i.horas}h — ${esc(statusLabel(i.status))}</li>`).join('')}</ul></article>`;
    }).join('')}</div>`;
  }
  function renderPackUI(){
    if(rendering)return;rendering=true;
    try{
      const list=$('listaSolicitacaoCertificados');const block=list?.closest('.certificate-request-section');if(!list||!block)return;
      let root=$('v42PackRequest');
      if(!root){root=document.createElement('div');root.id='v42PackRequest';block.insertBefore(root,list);}
      const eligible=eligibleCourses();
      if(eligible.length<2&&!packRows.length){root.hidden=true;root.innerHTML='';return;}
      root.hidden=false;
      root.innerHTML=`${eligible.length>=2?`<section class="v42-pack-request"><header><div><span class="eyebrow">Solicitação coletiva</span><h3>Solicitar certificados em PACK</h3><p>Selecione 2 ou mais cursos aptos. O gestor aprova o pacote e os certificados vão sendo liberados conforme suas horas.</p></div><label class="v42-pack-select-all"><input type="checkbox" data-v42-pack-all> Selecionar todos</label></header><div class="v42-pack-items">${eligible.map(c=>`<label class="v42-pack-item"><input type="checkbox" data-v42-pack-course="${Number(c.id)}"><span><strong>${esc(c.titulo||'Curso')}</strong><small>Prova aprovada e curso avaliado</small></span><select data-v42-pack-hours="${Number(c.id)}" aria-label="Horas do certificado">${Array.from({length:40},(_,i)=>(i+1)*5).map(h=>`<option value="${h}"${h===50?' selected':''}>${h}h</option>`).join('')}</select></label>`).join('')}</div><div class="v42-pack-summary"><div><span>Certificados</span><strong data-v42-pack-count>0</strong></div><div><span>Horas solicitadas</span><strong data-v42-pack-total-hours>0h</strong></div><div><span>Subtotal estimado</span><strong data-v42-pack-base>${money(0)}</strong></div><div><span>Cupom</span><strong>Opcional</strong></div></div><div class="v42-pack-footer"><input type="text" maxlength="30" data-v42-pack-coupon placeholder="Cupom de desconto (opcional)"><button type="button" class="primary-button" data-v42-pack-submit disabled>Solicitar PACK</button></div><p class="v42-pack-note">O cupom é validado sobre o valor total do PACK. O desconto não altera a quantidade de horas necessária para cada certificado.</p></section>`:''}${packHistoryHtml()}`;
      root.querySelector('[data-v42-pack-all]')?.addEventListener('change',e=>{root.querySelectorAll('[data-v42-pack-course]').forEach(c=>c.checked=e.target.checked);updateSummary(root);});
      root.querySelectorAll('[data-v42-pack-course],[data-v42-pack-hours]').forEach(el=>el.addEventListener('change',()=>updateSummary(root)));
      root.querySelector('[data-v42-pack-submit]')?.addEventListener('click',()=>submitPack(root));
      updateSummary(root);
    }finally{rendering=false;}
  }
  async function submitPack(root){
    const items=selectedItems(root);if(items.length<2)return;
    const coupon=String(root.querySelector('[data-v42-pack-coupon]')?.value||'').trim().toUpperCase();
    const totalHours=items.reduce((sum,i)=>sum+i.horas,0);
    const ok=window.AltitudeDialog?await window.AltitudeDialog.confirm({title:`Solicitar PACK com ${items.length} certificados`,message:`O PACK terá ${totalHours}h distribuídas entre os certificados. Se suas horas ainda não forem suficientes, a liberação ocorrerá progressivamente.${coupon?` O cupom ${coupon} será validado sobre o total.`:''}`,confirmText:'Solicitar PACK'}):window.confirm(`Solicitar PACK com ${items.length} certificados?`);
    if(!ok)return;
    const btn=root.querySelector('[data-v42-pack-submit]');btn.disabled=true;btn.textContent='Enviando...';
    try{
      const {data,error}=await window.sb.rpc('solicitar_pack_certificados_v42',{p_itens:items,p_cupom:coupon||null});if(error)throw error;
      window.altitudeAnalyticsV42?.send('certificate_pack_request','PACK solicitado',{pack_id:data?.id,quantity:items.length,total_hours:totalHours,coupon:coupon||null});
      if(typeof window.__ALTITUDE_ALUNO_REFRESH==='function')await window.__ALTITUDE_ALUNO_REFRESH();
      await loadPacks();renderPackUI();
      if(typeof toast==='function')toast(`PACK com ${items.length} certificados solicitado com sucesso.`,'success');
    }catch(error){if(typeof toast==='function')toast(`Não foi possível solicitar o PACK: ${error.message}`,'error');else alert(error.message);}
    finally{btn.disabled=false;btn.textContent='Solicitar PACK';}
  }
  async function init(){
    for(let i=0;i<50&&!s()?.aluno?.user_id;i++)await new Promise(r=>setTimeout(r,150));
    if(!s()?.aluno?.user_id)return;
    await Promise.all([loadConfig(),loadPacks()]);
    try{await window.sb.rpc('processar_packs_certificados_v42',{p_aluno_id:s().aluno.user_id});await window.__ALTITUDE_ALUNO_REFRESH?.();await loadPacks();}catch(_){/* SQL V42 ainda pode não estar publicado */}
    renderPackUI();
    const list=$('listaSolicitacaoCertificados');if(list){let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(async()=>{await loadPacks();renderPackUI();},180);}).observe(list,{childList:true,subtree:true});}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
