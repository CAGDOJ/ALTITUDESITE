(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v='') => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const titleCase = (value='') => {
    const small = new Set(['de','da','do','das','dos','e','em','para']);
    return String(value).trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR').split(' ').map((p,i)=> i>0&&small.has(p)?p:p.charAt(0).toLocaleUpperCase('pt-BR')+p.slice(1)).join(' ');
  };
  const AREA_STORAGE_KEY='altitude_areas_custom';
  const localAreas=()=>{try{return JSON.parse(localStorage.getItem(AREA_STORAGE_KEY)||'[]').filter(Boolean)}catch(_){return[]}};
  const saveLocalAreas=(items)=>{try{localStorage.setItem(AREA_STORAGE_KEY,JSON.stringify(items))}catch(_){}};
  const replaceLocalArea=(oldName,newName)=>{const out=localAreas().map(x=>norm(x)===norm(oldName)?newName:x);if(!out.some(x=>norm(x)===norm(newName)))out.push(newName);saveLocalAreas([...new Map(out.map(x=>[norm(x),x])).values()]);};
  const removeLocalArea=(name)=>saveLocalAreas(localAreas().filter(x=>norm(x)!==norm(name)));
  const toast = (message, error=false) => {
    let el=document.querySelector('.gestor-toast');
    if(!el){el=document.createElement('div');el.className='gestor-toast';document.body.appendChild(el);}
    el.textContent=message;el.className=`gestor-toast show${error?' error':''}`;clearTimeout(el._v39);el._v39=setTimeout(()=>el.className='gestor-toast',3800);
  };

  /* ================= ÁREAS ================= */
  let areas=[];
  async function loadAreas(){
    // Uma única fonte de verdade: antes de listar, incorpora ao catálogo qualquer
    // categoria já usada por cursos antigos. Isso mantém Gerenciar áreas, filtro e
    // cursos existentes sempre sincronizados.
    try{
      const {data:cursos,error:cursosError}=await sb.from('cursos').select('categoria');
      if(!cursosError){
        const rows=[...new Map((cursos||[]).map(x=>titleCase(x.categoria||'')).filter(Boolean).map(nome=>{
          const slug=norm(nome).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
          return [slug,{nome,slug,ativo:true,atualizado_em:new Date().toISOString()}];
        })).values()];
        if(rows.length) await sb.from('areas_cursos_v36').upsert(rows,{onConflict:'slug',ignoreDuplicates:false});
      }
    }catch(error){ console.warn('Sincronização de áreas:',error); }
    const {data,error}=await sb.from('areas_cursos_v36').select('*').order('nome');
    if(error){toast(`Não foi possível carregar as áreas: ${error.message}`,true);return;}
    areas=data||[];renderAreas();
  }
  async function areaUsage(name){
    const {count,error}=await sb.from('cursos').select('*',{count:'exact',head:true}).ilike('categoria',name);
    if(error) return 0;
    return Number(count||0);
  }
  async function renderAreas(){
    const box=$('listaGerenciarAreas'); if(!box)return;
    if(!areas.length){box.innerHTML='<div class="empty-state">Nenhuma área cadastrada.</div>';return;}
    const usage=await Promise.all(areas.map(x=>areaUsage(x.nome)));
    box.innerHTML=areas.map((x,i)=>`<article class="v39-area-row" data-area-id="${Number(x.id)}"><div><strong>${esc(titleCase(x.nome))}</strong><small>${usage[i]} curso(s) vinculado(s)</small></div><div class="v39-standard-actions"><button type="button" data-edit-area-v39="${Number(x.id)}">Editar nome</button><button type="button" class="danger-action" data-delete-area-v39="${Number(x.id)}" ${usage[i]?'disabled title="Altere a área dos cursos antes de excluir"':''}>Excluir área</button></div></article>`).join('');
  }
  async function editArea(id){
    const item=areas.find(x=>Number(x.id)===Number(id)); if(!item)return;
    const novo=window.AltitudeDialog?await AltitudeDialog.prompt({title:'Editar área',label:'Novo nome da área',value:titleCase(item.nome),required:true,confirmText:'Salvar'}):prompt('Novo nome da área:',titleCase(item.nome));
    if(novo==null)return;
    const nome=titleCase(novo); if(!nome)return toast('Informe um nome válido.',true);
    const slug=norm(nome).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const antigo=item.nome;
    const {error}=await sb.from('areas_cursos_v36').update({nome,slug,atualizado_em:new Date().toISOString()}).eq('id',Number(id));
    if(error)return toast(error.message,true);
    const {error:courseError}=await sb.from('cursos').update({categoria:nome}).ilike('categoria',antigo);
    if(courseError)return toast(`Área renomeada, mas não foi possível atualizar os cursos: ${courseError.message}`,true);
    replaceLocalArea(antigo,nome);
    toast('Área renomeada e cursos vinculados atualizados.');
    await loadAreas();
    await window.altitudeRecarregarAreasCursos?.();
  }
  async function deleteArea(id){
    const item=areas.find(x=>Number(x.id)===Number(id)); if(!item)return;
    const count=await areaUsage(item.nome);
    if(count>0)return toast(`Esta área está vinculada a ${count} curso(s). Altere esses cursos antes de excluir.`,true);
    const ok=window.AltitudeDialog?await AltitudeDialog.confirm({title:'Excluir área',message:`Excluir a área “${titleCase(item.nome)}”?`,confirmText:'Excluir área',danger:true}):confirm(`Excluir a área ${item.nome}?`);
    if(!ok)return;
    const {error}=await sb.from('areas_cursos_v36').delete().eq('id',Number(id));
    if(error)return toast(error.message,true);
    removeLocalArea(item.nome);
    toast('Área excluída.'); await loadAreas(); await window.altitudeRecarregarAreasCursos?.();
  }
  function openAreas(){ $('modalGerenciarAreas')?.setAttribute('aria-hidden','false'); loadAreas(); }
  function closeAreas(){ $('modalGerenciarAreas')?.setAttribute('aria-hidden','true'); }

  /* ================= RECOMPENSAS ================= */
  let rewards=[];
  const tipoNome=(v)=>({PROFISSIONAL:'Profissional',TECNICO:'Técnico',SUPERIOR:'Superior',POS_GRADUACAO:'Pós-graduação'})[String(v||'').toUpperCase()]||v;
  async function loadRewards(){
    const box=$('listaRecompensasV39'); if(!box)return;
    const {data,error}=await sb.from('recompensas_niveis_v39').select('*').order('ordem').order('cursos_necessarios');
    if(error){box.innerHTML=`<div class="empty-state">Execute o SQL V39 para ativar as recompensas.<br><small>${esc(error.message)}</small></div>`;return;}
    rewards=data||[];renderRewards();
  }
  function renderRewards(){
    const box=$('listaRecompensasV39'); if(!box)return;
    box.innerHTML=rewards.length?rewards.map(r=>`<article class="reward-admin-card ${r.ativo?'':'is-disabled'}"><div class="reward-admin-medal reward-${esc(norm(r.faixa))}">${r.imagem_url?`<img src="${esc(r.imagem_url)}" alt="${esc(r.nome||r.faixa)}">`:`<span>${esc(r.nivel||'I')}</span>`}</div><div class="reward-admin-copy"><span>${esc(tipoNome(r.tipo_curso))}</span><h3>${esc(r.nome||`${r.faixa} ${r.nivel}`)}</h3><p>${Number(r.cursos_necessarios)} curso(s) concluído(s) · ordem ${Number(r.ordem||0)}</p><small>${r.ativo?'Ativo':'Inativo'}</small></div><div class="v39-standard-actions"><button type="button" data-edit-reward-v39="${Number(r.id)}">Editar</button><button type="button" data-toggle-reward-v39="${Number(r.id)}">${r.ativo?'Inativar':'Ativar'}</button><button type="button" class="danger-action" data-delete-reward-v39="${Number(r.id)}">Excluir</button></div></article>`).join(''):'<div class="empty-state">Nenhum nível configurado.</div>';
  }
  function openReward(id=null){
    const r=id?rewards.find(x=>Number(x.id)===Number(id)):null;
    $('recompensaIdV39').value=r?.id||'';
    $('recompensaModalTituloV39').textContent=r?'Editar nível':'Novo nível';
    $('recompensaTipoV39').value=r?.tipo_curso||'PROFISSIONAL';
    $('recompensaFaixaV39').value=r?.faixa||'Bronze';
    $('recompensaNivelV39').value=r?.nivel||'I';
    $('recompensaCursosV39').value=String(r?.cursos_necessarios||1);
    $('recompensaOrdemV39').value=String(r?.ordem||0);
    $('recompensaNomeV39').value=r?.nome||'';
    $('recompensaImagemV39').value=r?.imagem_url||'';
    $('recompensaAtivaV39').checked=r?Boolean(r.ativo):true;
    $('modalRecompensaV39')?.setAttribute('aria-hidden','false');
  }
  function closeReward(){ $('modalRecompensaV39')?.setAttribute('aria-hidden','true'); }
  async function saveReward(e){
    e.preventDefault();
    const id=Number($('recompensaIdV39').value||0);
    const faixa=titleCase($('recompensaFaixaV39').value);
    const nivel=String($('recompensaNivelV39').value||'').trim().toUpperCase();
    const nome=String($('recompensaNomeV39').value||'').trim()||`${faixa} ${nivel}`;
    const payload={tipo_curso:$('recompensaTipoV39').value,faixa,nivel,cursos_necessarios:Math.max(1,Number($('recompensaCursosV39').value||1)),nome,imagem_url:String($('recompensaImagemV39').value||'').trim()||null,ativo:$('recompensaAtivaV39').checked,ordem:Number($('recompensaOrdemV39').value||0),atualizado_por:window.GESTOR_ATUAL?.user_id||null,atualizado_em:new Date().toISOString()};
    const query=id?sb.from('recompensas_niveis_v39').update(payload).eq('id',id):sb.from('recompensas_niveis_v39').insert({...payload,criado_por:window.GESTOR_ATUAL?.user_id||null});
    const {error}=await query;if(error)return toast(error.message,true);
    closeReward();toast('Nível de recompensa salvo.');await loadRewards();
  }
  async function toggleReward(id){const r=rewards.find(x=>Number(x.id)===Number(id));if(!r)return;const {error}=await sb.from('recompensas_niveis_v39').update({ativo:!r.ativo,atualizado_em:new Date().toISOString()}).eq('id',Number(id));if(error)return toast(error.message,true);await loadRewards();}
  async function deleteReward(id){const r=rewards.find(x=>Number(x.id)===Number(id));if(!r)return;const ok=window.AltitudeDialog?await AltitudeDialog.confirm({title:'Excluir nível',message:`Excluir ${r.nome||`${r.faixa} ${r.nivel}`}?`,confirmText:'Excluir',danger:true}):confirm('Excluir este nível?');if(!ok)return;const {error}=await sb.from('recompensas_niveis_v39').delete().eq('id',Number(id));if(error)return toast(error.message,true);await loadRewards();}

  async function wire(){
    try { await window.GESTOR_AUTH_READY; } catch (_) { return; }
    $('btnGerenciarAreas')?.addEventListener('click',openAreas);
    $('fecharGerenciarAreas')?.addEventListener('click',closeAreas);
    $('btnNovaRecompensaV39')?.addEventListener('click',()=>openReward());
    $('fecharRecompensaV39')?.addEventListener('click',closeReward);
    $('formRecompensaV39')?.addEventListener('submit',saveReward);
    document.addEventListener('click',(e)=>{
      let b=e.target.closest('[data-edit-area-v39]');if(b)editArea(b.dataset.editAreaV39);
      b=e.target.closest('[data-delete-area-v39]');if(b)deleteArea(b.dataset.deleteAreaV39);
      b=e.target.closest('[data-edit-reward-v39]');if(b)openReward(Number(b.dataset.editRewardV39));
      b=e.target.closest('[data-toggle-reward-v39]');if(b)toggleReward(Number(b.dataset.toggleRewardV39));
      b=e.target.closest('[data-delete-reward-v39]');if(b)deleteReward(Number(b.dataset.deleteRewardV39));
    });
    const old=window.abrirAba;
    window.abrirAba=(id)=>{old?.(id);if(id==='recompensas')loadRewards();};
    loadRewards();
  }
  document.addEventListener('DOMContentLoaded',wire);
})();
