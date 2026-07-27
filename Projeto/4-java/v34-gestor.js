(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=(v='')=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dt=v=>v?String(v).slice(0,16):'';
  const state={config:null,cupons:[],promocoes:[],packs:[],packRequests:[],tipos:[],videos:[]};

  function toast(msg,error=false){
    let el=document.querySelector('.gestor-toast'); if(!el){el=document.createElement('div');el.className='gestor-toast';document.body.appendChild(el);}
    el.textContent=msg;el.className=`gestor-toast show${error?' error':''}`;clearTimeout(el._t);el._t=setTimeout(()=>el.className='gestor-toast',3500);
  }
  function openModal(id){$(id)?.setAttribute('aria-hidden','false');}
  function closeModal(id){$(id)?.setAttribute('aria-hidden','true');}
  function slug(v){return String(v||'anuncio').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'anuncio';}
  async function uploadImage(file,prefix){
    if(!file) return null;
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path=`${prefix}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const {error}=await sb.storage.from('promocoes-v34').upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(error) throw error;
    return sb.storage.from('promocoes-v34').getPublicUrl(path).data.publicUrl;
  }

  function setCommercialTab(tab){
    document.querySelectorAll('[data-commercial-tab]').forEach(b=>b.classList.toggle('active',b.dataset.commercialTab===tab));
    document.querySelectorAll('[data-commercial-panel]').forEach(p=>p.classList.toggle('active',p.dataset.commercialPanel===tab));
  }
  async function loadCommercial(){
    try{
      const [cfg,coupons,promos,packs,packRequests,types]=await Promise.all([
        sb.from('configuracoes_comerciais_v34').select('*').eq('id',1).maybeSingle(),
        sb.from('cupons_v34').select('*').order('criado_em',{ascending:false}),
        sb.from('promocoes_v34').select('*').order('prioridade',{ascending:false}).order('criado_em',{ascending:false}),
        sb.from('packs_v34').select('*').order('criado_em',{ascending:false}),
        sb.from('packs_alunos_v34').select('*').order('criado_em',{ascending:false}),
        sb.from('tipos_curso_catalogo_v34').select('*').order('ordem')
      ]);
      for(const r of [cfg,coupons,promos,packs,packRequests,types]) if(r.error) throw r.error;
      const requests=packRequests.data||[];
      const alunoIds=[...new Set(requests.map(x=>x.aluno_id).filter(Boolean))];
      const packIds=[...new Set(requests.map(x=>Number(x.pack_id)).filter(Boolean))];
      const [students,packDetails]=await Promise.all([
        alunoIds.length?sb.from('alunos').select('user_id,nome,ra,cpf').in('user_id',alunoIds):Promise.resolve({data:[],error:null}),
        packIds.length?sb.from('packs_v34').select('id,nome,quantidade_certificados').in('id',packIds):Promise.resolve({data:[],error:null})
      ]);
      if(students.error) throw students.error;
      if(packDetails.error) throw packDetails.error;
      const studentMap=new Map((students.data||[]).map(x=>[x.user_id,x]));
      const packMap=new Map((packDetails.data||[]).map(x=>[Number(x.id),x]));
      state.config=cfg.data;
      state.cupons=coupons.data||[];
      state.promocoes=promos.data||[];
      state.packs=packs.data||[];
      state.packRequests=requests.map(x=>({...x,alunos:studentMap.get(x.aluno_id)||null,packs_v34:packMap.get(Number(x.pack_id))||null}));
      state.tipos=types.data||[];
      renderCommercial();
    }catch(e){console.error(e);toast(`Não foi possível carregar a área comercial: ${e.message}`,true);}
  }
  function renderCommercial(){
    if(state.config){$('comValorCertificado').value=Number(state.config.valor_certificado||0).toFixed(2);$('comWhatsapp').value=state.config.whatsapp||'5591983640933';$('comCobrancaAtiva').checked=state.config.cobranca_ativa!==false;$('comMensagemWhatsapp').value=state.config.mensagem_whatsapp||'';}
    const c=$('listaCuponsGestao');if(c)c.innerHTML=state.cupons.length?state.cupons.map(x=>`<article class="commercial-card"><div><span>${esc(x.aplicacao)}</span><h4>${esc(x.codigo)}</h4><p>${x.tipo==='PERCENTUAL'?`${Number(x.valor)}% de desconto`:x.tipo==='FIXO'?`${money(x.valor)} de desconto`:'Gratuito'}</p><small>${x.ativo?'Ativo':'Inativo'} · ${Number(x.usos_confirmados||0)} uso(s)</small></div><div><button data-edit-coupon="${x.id}">Editar</button><button data-toggle-coupon="${x.id}">${x.ativo?'Pausar':'Ativar'}</button><button class="danger" data-delete-coupon="${x.id}">Excluir</button></div></article>`).join(''):'<p class="empty-state">Nenhum cupom cadastrado.</p>';
    const p=$('listaPromocoesGestao');if(p)p.innerHTML=state.promocoes.length?state.promocoes.map(x=>`<article class="commercial-card media-card">${x.imagem_url?`<img src="${esc(x.imagem_url)}" alt="">`:''}<div><span>/${esc(x.slug)}</span><h4>${esc(x.titulo)}</h4><p>${esc(x.descricao||'')}</p><small>${x.ativa?'Visível':'Oculto'} · ${esc(x.frequencia)}</small></div><div><button data-edit-promo="${x.id}">Editar</button><button data-toggle-promo="${x.id}">${x.ativa?'Pausar':'Ativar'}</button><a href="/Projeto/1-html/11-portaldoaluno.html?promocao=${encodeURIComponent(x.slug)}" target="_blank">Abrir endereço</a><button class="danger" data-delete-promo="${x.id}">Excluir</button></div></article>`).join(''):'<p class="empty-state">Nenhum anúncio cadastrado.</p>';
    const pk=$('listaPacksGestao');if(pk)pk.innerHTML=state.packs.length?state.packs.map(x=>`<article class="commercial-card media-card">${x.imagem_url?`<img src="${esc(x.imagem_url)}" alt="">`:''}<div><span>PACK DE ${Number(x.quantidade_certificados)} CERTIFICADOS</span><h4>${esc(x.nome)}</h4><p>${esc(x.descricao||'')}</p><strong>${money(x.valor)}</strong><small>${x.ativo?'Ativo':'Inativo'}</small></div><div><button data-register-pack="${x.id}">Registrar para aluno</button><button data-edit-pack="${x.id}">Editar</button><button data-toggle-pack="${x.id}">${x.ativo?'Pausar':'Ativar'}</button><button class="danger" data-delete-pack="${x.id}">Excluir</button></div></article>`).join(''):'<p class="empty-state">Nenhum pack cadastrado.</p>';
    const pr=$('listaPacksPagamentosGestao');if(pr)pr.innerHTML=state.packRequests.length?state.packRequests.map(x=>{const a=x.alunos||{},pk=x.packs_v34||{},informed=Boolean(x.pagamento_informado_em)&&x.status_pagamento!=='PAGO';return `<article class="commercial-card"><div><span>${esc(x.protocolo_pagamento||`PACK-${x.id}`)}</span><h4>${esc(a.nome||'Aluno')}</h4><p>${esc(pk.nome||'Pack')} · ${Number(x.quantidade_adquirida||pk.quantidade_certificados||0)} certificados</p><small>RA ${esc(a.ra||'—')} · CPF ${esc(a.cpf||'—')} · ${informed?'Comprovante informado':x.status_pagamento==='PAGO'?'Pagamento confirmado':'Aguardando pagamento'}</small><strong>${money(x.valor_final??x.valor_base)}</strong></div><div>${x.status_pagamento!=='PAGO'?`<button data-confirm-pack-payment="${x.id}">Confirmar pagamento</button>`:''}<button data-open-pack-chat="${x.id}">Abrir WhatsApp</button></div></article>`;}).join(''):'<p class="empty-state">Nenhuma solicitação de pack.</p>';
    const t=$('listaTiposCursoGestao');if(t)t.innerHTML=state.tipos.map(x=>`<article class="commercial-card"><div><span>${esc(x.codigo)}</span><h4>${esc(x.nome)}</h4><p>${esc(x.descricao||'')}</p><small>${x.visivel_site?'Visível no site':'Oculto no site'} · ${x.permitir_inscricao?'Inscrições abertas':'Inscrições bloqueadas'}</small></div><div><button data-toggle-type-visible="${esc(x.codigo)}">${x.visivel_site?'Ocultar':'Mostrar no site'}</button><button data-toggle-type-enroll="${esc(x.codigo)}">${x.permitir_inscricao?'Bloquear inscrições':'Liberar inscrições'}</button></div></article>`).join('');
  }

  async function saveConfig(e){e.preventDefault();const payload={id:1,valor_certificado:Number($('comValorCertificado').value||0),whatsapp:$('comWhatsapp').value.replace(/\D/g,''),cobranca_ativa:$('comCobrancaAtiva').checked,mensagem_whatsapp:$('comMensagemWhatsapp').value.trim(),atualizado_por:window.GESTOR_ATUAL?.user_id||null,atualizado_em:new Date().toISOString()};const {error}=await sb.from('configuracoes_comerciais_v34').upsert(payload);if(error)return toast(error.message,true);toast('Configurações comerciais salvas.');loadCommercial();}
  function newCoupon(){['cupomId','cupomCodigo','cupomValor','cupomInicio','cupomFim','cupomLimite'].forEach(id=>$(id).value='');$('cupomAplicacao').value='CERTIFICADO';$('cupomTipo').value='PERCENTUAL';$('cupomLimiteAluno').value='1';$('cupomAtivo').checked=true;$('cupomModalTitulo').textContent='Novo cupom';openModal('modalCupomV34');}
  function editCoupon(id){const x=state.cupons.find(r=>Number(r.id)===Number(id));if(!x)return;$('cupomId').value=x.id;$('cupomCodigo').value=x.codigo;$('cupomAplicacao').value=x.aplicacao;$('cupomTipo').value=x.tipo;$('cupomValor').value=x.valor;$('cupomInicio').value=dt(x.inicio_em);$('cupomFim').value=dt(x.fim_em);$('cupomLimite').value=x.limite_usos??'';$('cupomLimiteAluno').value=x.limite_por_aluno||1;$('cupomAtivo').checked=x.ativo;$('cupomModalTitulo').textContent=`Editar ${x.codigo}`;openModal('modalCupomV34');}
  async function saveCoupon(e){e.preventDefault();const id=Number($('cupomId').value||0);const payload={codigo:$('cupomCodigo').value.trim().toUpperCase(),aplicacao:$('cupomAplicacao').value,tipo:$('cupomTipo').value,valor:Number($('cupomValor').value||0),inicio_em:$('cupomInicio').value||null,fim_em:$('cupomFim').value||null,limite_usos:$('cupomLimite').value?Number($('cupomLimite').value):null,limite_por_aluno:Number($('cupomLimiteAluno').value||1),ativo:$('cupomAtivo').checked,atualizado_em:new Date().toISOString()};const q=id?sb.from('cupons_v34').update(payload).eq('id',id):sb.from('cupons_v34').insert({...payload,criado_por:window.GESTOR_ATUAL?.user_id||null});const {error}=await q;if(error)return toast(error.message,true);closeModal('modalCupomV34');toast('Cupom salvo.');loadCommercial();}

  function newPromo(){['promocaoId','promocaoTitulo','promocaoDescricao','promocaoSlug','promocaoLink','promocaoInicio','promocaoFim'].forEach(id=>$(id).value='');$('promocaoBotao').value='Ver promoção';$('promocaoPublico').value='TODOS';$('promocaoFrequencia').value='UMA_VEZ';$('promocaoPrioridade').value='0';$('promocaoAtiva').checked=true;$('promocaoImagem').value='';$('promocaoModalTitulo').textContent='Novo anúncio';openModal('modalPromocaoV34');}
  function editPromo(id){const x=state.promocoes.find(r=>Number(r.id)===Number(id));if(!x)return;$('promocaoId').value=x.id;$('promocaoTitulo').value=x.titulo;$('promocaoDescricao').value=x.descricao||'';$('promocaoSlug').value=x.slug;$('promocaoBotao').value=x.texto_botao||'Ver promoção';$('promocaoLink').value=x.link_destino||'';$('promocaoPublico').value=x.publico||'TODOS';$('promocaoInicio').value=dt(x.inicio_em);$('promocaoFim').value=dt(x.fim_em);$('promocaoFrequencia').value=x.frequencia;$('promocaoPrioridade').value=x.prioridade||0;$('promocaoAtiva').checked=x.ativa;$('promocaoImagem').value='';$('promocaoModalTitulo').textContent=`Editar ${x.titulo}`;openModal('modalPromocaoV34');}
  async function savePromo(e){e.preventDefault();const id=Number($('promocaoId').value||0);const current=state.promocoes.find(x=>Number(x.id)===id);let image=current?.imagem_url||null;try{image=await uploadImage($('promocaoImagem').files?.[0],'promocoes')||image;}catch(err){return toast(err.message,true);}const title=$('promocaoTitulo').value.trim();const payload={titulo:title,descricao:$('promocaoDescricao').value.trim()||null,imagem_url:image,slug:slug($('promocaoSlug').value||title),texto_botao:$('promocaoBotao').value.trim()||'Ver promoção',link_destino:$('promocaoLink').value.trim()||null,publico:$('promocaoPublico').value,frequencia:$('promocaoFrequencia').value,prioridade:Number($('promocaoPrioridade').value||0),inicio_em:$('promocaoInicio').value||null,fim_em:$('promocaoFim').value||null,ativa:$('promocaoAtiva').checked,atualizado_em:new Date().toISOString()};const q=id?sb.from('promocoes_v34').update(payload).eq('id',id):sb.from('promocoes_v34').insert({...payload,criado_por:window.GESTOR_ATUAL?.user_id||null});const {error}=await q;if(error)return toast(error.message,true);closeModal('modalPromocaoV34');toast('Anúncio salvo.');loadCommercial();}

  function newPack(){['packId','packNome','packDescricao','packQuantidade','packValor'].forEach(id=>$(id).value='');$('packImagem').value='';$('packAtivo').checked=true;$('packModalTitulo').textContent='Novo pack';openModal('modalPackV34');}
  function editPack(id){const x=state.packs.find(r=>Number(r.id)===Number(id));if(!x)return;$('packId').value=x.id;$('packNome').value=x.nome;$('packDescricao').value=x.descricao||'';$('packQuantidade').value=x.quantidade_certificados;$('packValor').value=x.valor;$('packAtivo').checked=x.ativo;$('packImagem').value='';$('packModalTitulo').textContent=`Editar ${x.nome}`;openModal('modalPackV34');}
  async function savePack(e){e.preventDefault();const id=Number($('packId').value||0);const current=state.packs.find(x=>Number(x.id)===id);let image=current?.imagem_url||null;try{image=await uploadImage($('packImagem').files?.[0],'packs')||image;}catch(err){return toast(err.message,true);}const payload={nome:$('packNome').value.trim(),descricao:$('packDescricao').value.trim()||null,quantidade_certificados:Number($('packQuantidade').value),valor:Number($('packValor').value),imagem_url:image,ativo:$('packAtivo').checked,atualizado_em:new Date().toISOString()};const q=id?sb.from('packs_v34').update(payload).eq('id',id):sb.from('packs_v34').insert({...payload,criado_por:window.GESTOR_ATUAL?.user_id||null});const {error}=await q;if(error)return toast(error.message,true);closeModal('modalPackV34');toast('Pack salvo.');loadCommercial();}
  async function registerPack(id){const pack=state.packs.find(x=>Number(x.id)===Number(id));if(!pack)return;const ra=window.AltitudeDialog?await AltitudeDialog.prompt({title:`Registrar ${pack.nome}`,label:'RA ou CPF do aluno',required:true,confirmText:'Localizar aluno'}):prompt('RA ou CPF:');if(!ra)return;const clean=String(ra).replace(/\D/g,'');let q=sb.from('alunos').select('user_id,nome,ra,cpf').limit(1);q=clean.length===11?q.eq('cpf',clean):q.eq('ra',String(ra).trim());const {data,error}=await q.maybeSingle();if(error||!data)return toast('Aluno não encontrado.',true);const ok=window.AltitudeDialog?await AltitudeDialog.confirm({title:'Confirmar pack pago',message:`Registrar ${pack.quantidade_certificados} certificados para ${data.nome}, no valor de ${money(pack.valor)}?`,confirmText:'Registrar pagamento'}):confirm('Confirmar?');if(!ok)return;const r=await sb.rpc('gestor_registrar_pack_aluno_v34',{p_pack_id:Number(id),p_aluno_id:data.user_id,p_valor_pago:Number(pack.valor)});if(r.error)return toast(r.error.message,true);toast('Pack registrado. O aluno poderá escolher os cursos depois.');}

  async function confirmPackPayment(id){const row=state.packRequests.find(x=>Number(x.id)===Number(id));if(!row)return;const ok=window.AltitudeDialog?await AltitudeDialog.confirm({title:'Confirmar pagamento do pack',message:`Liberar ${Number(row.quantidade_adquirida||0)} certificados para ${row.alunos?.nome||'o aluno'}?`,confirmText:'Confirmar pagamento'}):confirm('Confirmar pagamento?');if(!ok)return;const {error}=await sb.rpc('gestor_confirmar_pagamento_pack_v34',{p_pack_aluno_id:Number(id),p_valor_pago:Number(row.valor_final ?? row.valor_base ?? 0)});if(error)return toast(error.message,true);toast('Pagamento confirmado e quantidade liberada.');loadCommercial();}
  function openPackChat(id){const row=state.packRequests.find(x=>Number(x.id)===Number(id));if(!row)return;const phone=String(state.config?.whatsapp||'5591983640933').replace(/\D/g,'');const msg=`Olá, ${row.alunos?.nome||''}! Estamos entrando em contato sobre o pagamento do pack ${row.packs_v34?.nome||''}.\nProtocolo: ${row.protocolo_pagamento||`PACK-${row.id}`}\nValor: ${money(row.valor_final??row.valor_base)}`;window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,'_blank','noopener');}

  async function toggle(table,id,field,value){const {error}=await sb.from(table).update({[field]:value,atualizado_em:new Date().toISOString()}).eq(table==='tipos_curso_catalogo_v34'?'codigo':'id',id);if(error)return toast(error.message,true);loadCommercial();}
  async function remove(table,id){const ok=confirm('Excluir este registro?');if(!ok)return;const {error}=await sb.from(table).delete().eq('id',id);if(error)return toast(error.message,true);loadCommercial();}

  function latexArg(value=''){
    return String(value??'').replace(/\\/g,'\\textbackslash{}').replace(/([{}%#$&_])/g,'\\$1').replace(/\s+/g,' ').trim();
  }
  function latexText(value=''){
    return String(value??'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/\s+\n/g,'\n').replace(/\n\s+/g,'\n').trim();
  }
  function htmlToLatex(value=''){
    const raw=String(value||'').trim();
    if(!raw)return '% Conteúdo do módulo ainda não preenchido.';
    if(/\\(?:section|subsection|begin\{|textbf\{|item\b)/.test(raw))return raw;
    const node=document.createElement('div');node.innerHTML=raw;
    const walk=(current)=>{
      if(current.nodeType===Node.TEXT_NODE)return latexArg(current.nodeValue||'');
      if(current.nodeType!==Node.ELEMENT_NODE)return '';
      const tag=current.tagName.toLowerCase(),inside=[...current.childNodes].map(walk).join(' ').replace(/\s+/g,' ').trim();
      if(!inside&&tag!=='br')return '';
      if(tag==='h1'||tag==='h2')return `\n\\section{${inside}}\n`;
      if(tag==='h3'||tag==='h4')return `\n\\subsection{${inside}}\n`;
      if(tag==='strong'||tag==='b')return `\\textbf{${inside}}`;
      if(tag==='em'||tag==='i')return `\\textit{${inside}}`;
      if(tag==='br')return '\n';
      if(tag==='li')return `\\item ${inside}\n`;
      if(tag==='ul'||tag==='ol')return `\n\\begin{${tag==='ol'?'enumerate':'itemize'}}\n${[...current.children].map(walk).join('')}\\end{${tag==='ol'?'enumerate':'itemize'}}\n`;
      if(tag==='p'||tag==='div'||tag==='blockquote')return `\n${inside}\n`;
      return inside;
    };
    const converted=[...node.childNodes].map(walk).join('\n').replace(/\n{3,}/g,'\n\n').trim();
    if(converted)return converted;
    return latexText(raw).split(/\n{2,}/).map(part=>latexArg(part)).join('\n\n');
  }
  function proofSourceFromRows(modules,proofs,questions){
    const proofByModule=new Map();
    for(const proof of proofs){if(!proofByModule.has(Number(proof.modulo_id)))proofByModule.set(Number(proof.modulo_id),[]);proofByModule.get(Number(proof.modulo_id)).push(proof);}
    const questionsByProof=new Map();
    for(const q of questions){if(!questionsByProof.has(Number(q.prova_id)))questionsByProof.set(Number(q.prova_id),[]);questionsByProof.get(Number(q.prova_id)).push(q);}
    const lines=['\\documentclass{article}','\\begin{document}',''];
    let number=1;
    for(const module of modules){
      const moduleProofs=proofByModule.get(Number(module.id))||[];
      const moduleQuestions=moduleProofs.flatMap(proof=>questionsByProof.get(Number(proof.id))||[]).sort((a,b)=>Number(a.ordem||a.id)-Number(b.ordem||b.id));
      if(!moduleQuestions.length)continue;
      lines.push(`% Avaliação do Módulo ${Number(module.ordem||1)} - ${latexArg(module.titulo||'Módulo')}`);
      lines.push(`\\begin{altitudeprova}{${Number(module.ordem||1)}}`,'');
      for(const q of moduleQuestions){
        lines.push(`\\begin{altitudequestao}{${number}}`);
        lines.push(`\\enunciado{${latexArg(q.enunciado||'Digite o enunciado.')}}`);
        for(const letter of ['A','B','C','D','E']){const value=q[letter.toLowerCase()];if(value)lines.push(`\\alternativa{${letter}}{${latexArg(value)}}`);}
        lines.push(`\\gabarito{${String(q.correta||'A').toUpperCase()}}`);
        lines.push(`\\resolucao{${latexArg(q.resolucao||'Resolução não informada.')}}`);
        lines.push('\\end{altitudequestao}','');number+=1;
      }
      lines.push('\\end{altitudeprova}','');
    }
    if(number===1)lines.push('% Nenhuma questão cadastrada no modo normal.','% Use altitudeprova e altitudequestao para criar a avaliação.','');
    lines.push('\\end{document}');
    return lines.join('\n');
  }
  async function syncLatexFromNormal(force=false){
    const modal=$('modalModulos'),source=$('latexContentSource'),proofSource=$('latexProofSource');
    const courseId=Number(modal?.dataset.courseId||0);if(!courseId||!source)return;
    const sameCourse=source.dataset.syncedCourseId===String(courseId);
    if(!force&&sameCourse&&source.dataset.userDirty==='true')return;
    try{
      const [courseResult,moduleResult,proofResult]=await Promise.all([
        sb.from('cursos').select('*').eq('id',courseId).single(),
        sb.from('modulos').select('*').eq('curso_id',courseId).order('ordem',{ascending:true}),
        sb.from('provas').select('*').eq('curso_id',courseId).order('id',{ascending:true})
      ]);
      if(courseResult.error)throw courseResult.error;if(moduleResult.error)throw moduleResult.error;if(proofResult.error)throw proofResult.error;
      const course=courseResult.data||{},modules=moduleResult.data||[],proofs=proofResult.data||[];
      const proofIds=proofs.map(x=>Number(x.id)).filter(Boolean);
      const questionResult=proofIds.length?await sb.from('questoes').select('*').in('prova_id',proofIds).order('ordem',{ascending:true}):{data:[],error:null};
      if(questionResult.error)throw questionResult.error;
      const lines=['\\documentclass[12pt,a4paper]{article}','','% ==================================================','% DADOS DO CURSO','% ==================================================',`\\codigocurso{${latexArg(course.codigo||`CURSO-${courseId}`)}}`,`\\titulocurso{${latexArg(course.titulo||modal.dataset.courseTitle||'Curso')}}`,`\\areacurso{${latexArg(course.categoria||modal.dataset.courseCategory||'FORMAÇÃO PROFISSIONAL')}}`,`\\nivelcurso{${latexArg(course.nivel||'BASICO')}}`,`\\notaminima{${Number(course.nota_minima||70)}}`,`\\descricaoCurso{${latexArg(course.descricao||'')}}`,'','\\begin{document}',''];
      modules.forEach((module,index)=>{
        const order=Number(module.ordem||index+1),title=String(module.titulo||`Módulo ${order}`).replace(/^m[oó]dulo\s*\d+\s*[-–—:]?\s*/i,'').trim()||`Módulo ${order}`;
        lines.push('% ==================================================',`% MÓDULO ${order}`,'% ==================================================',`\\begin{altitudemodulo}{${latexArg(title)}}{${order}}`,`\\descricaoModulo{${latexArg(module.descricao||'')}}`);
        if(module.video_url)lines.push(`\\videoModulo{${String(module.video_url).trim()}}`);
        lines.push('','\\begin{conteudo}',htmlToLatex(module.conteudo_latex||module.conteudo||''),'\\end{conteudo}','','\\end{altitudemodulo}','');
      });
      if(!modules.length)lines.push('% O curso ainda não possui módulos no modo normal.','% Crie um módulo aqui ou volte ao modo normal.','');
      lines.push('\\end{document}');
      source.dataset.v34Syncing='true';source.value=lines.join('\n');source.dataset.syncedCourseId=String(courseId);source.dataset.userDirty='false';delete source.dataset.v34Syncing;
      if(proofSource){proofSource.dataset.v34Syncing='true';proofSource.value=proofSourceFromRows(modules,proofs,questionResult.data||[]);proofSource.dataset.syncedCourseId=String(courseId);proofSource.dataset.userDirty='false';delete proofSource.dataset.v34Syncing;}
      window.AltitudeLatexImporter?.previewContent?.();
      renderLatexVideos();
      if(force)toast('LaTeX sincronizado com a edição normal.');
    }catch(error){console.error(error);toast(`Não foi possível sincronizar: ${error.message}`,true);}
  }

  // Módulos reconhecidos no LaTeX: vídeo por módulo, sincronizado no próprio código.
  function renderLatexVideos(){
    const box=$('latexModuleVideoList'), source=$('latexContentSource');if(!box||!source||!window.AltitudeLatexImporter)return;
    try{
      const parsed=AltitudeLatexImporter.parseContent(source.value||'');state.videos=parsed.modulos||[];
      box.innerHTML=state.videos.length?state.videos.map((m,i)=>`<article data-latex-video-index="${i}"><div><strong>Módulo ${i+1} - ${esc(m.titulo||`Módulo ${i+1}`)}</strong><small>${m.video_url?'Vídeo cadastrado':'Sem vídeo'}</small></div><div class="builder-input-action"><input type="url" value="${esc(m.video_url||'')}" placeholder="https://youtube.com/..." data-latex-video-input="${i}"><button type="button" data-latex-video-save="${i}">Adicionar/alterar</button><button type="button" data-latex-video-remove="${i}">Remover</button></div></article>`).join(''):'<p class="empty-state">Nenhum módulo reconhecido.</p>';
    }catch(e){box.innerHTML='<p class="empty-state">Gere a prévia do material para listar os módulos.</p>';}
  }
  function setVideoInLatex(index,url){
    const source=$('latexContentSource');if(!source)return;
    const blocks=[...source.value.matchAll(/\\begin\{altitudemodulo\}\{([^}]*)\}\{([^}]*)\}([\s\S]*?)\\end\{altitudemodulo\}/g)];
    const target=blocks[index];if(!target)return toast('Módulo não encontrado no LaTeX.',true);
    let body=target[3].replace(/\s*\\videoModulo\{[^}]*\}/g,'');
    if(url) body=`\n\\videoModulo{${url}}${body}`;
    const replacement=`\\begin{altitudemodulo}{${target[1]}}{${target[2]}}${body}\\end{altitudemodulo}`;
    source.value=source.value.slice(0,target.index)+replacement+source.value.slice(target.index+target[0].length);
    source.dispatchEvent(new Event('input',{bubbles:true}));
    AltitudeLatexImporter.previewContent();renderLatexVideos();
    toast(url?'Vídeo atualizado e sincronizado com o módulo.':'Vídeo removido do módulo.');
  }

  async function wire(){
    try{await window.GESTOR_AUTH_READY;}catch(_){return;}
    const old=window.abrirAba;window.abrirAba=(id)=>{old?.(id);if(id==='comercial')loadCommercial();};
    document.querySelectorAll('[data-commercial-tab]').forEach(b=>b.addEventListener('click',()=>setCommercialTab(b.dataset.commercialTab)));
    $('btnComercialAtualizar')?.addEventListener('click',loadCommercial);$('formConfiguracaoComercial')?.addEventListener('submit',saveConfig);
    $('btnNovoCupom')?.addEventListener('click',newCoupon);$('formCupomV34')?.addEventListener('submit',saveCoupon);
    $('btnNovaPromocao')?.addEventListener('click',newPromo);$('formPromocaoV34')?.addEventListener('submit',savePromo);
    $('btnNovoPack')?.addEventListener('click',newPack);$('formPackV34')?.addEventListener('submit',savePack);
    document.querySelectorAll('[data-close-v34]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.closeV34)));
    document.addEventListener('click',async e=>{
      let b=e.target.closest('[data-edit-coupon]');if(b)editCoupon(b.dataset.editCoupon);
      b=e.target.closest('[data-toggle-coupon]');if(b){const x=state.cupons.find(r=>Number(r.id)===Number(b.dataset.toggleCoupon));toggle('cupons_v34',x.id,'ativo',!x.ativo);}
      b=e.target.closest('[data-delete-coupon]');if(b)remove('cupons_v34',b.dataset.deleteCoupon);
      b=e.target.closest('[data-edit-promo]');if(b)editPromo(b.dataset.editPromo);
      b=e.target.closest('[data-toggle-promo]');if(b){const x=state.promocoes.find(r=>Number(r.id)===Number(b.dataset.togglePromo));toggle('promocoes_v34',x.id,'ativa',!x.ativa);}
      b=e.target.closest('[data-delete-promo]');if(b)remove('promocoes_v34',b.dataset.deletePromo);
      b=e.target.closest('[data-edit-pack]');if(b)editPack(b.dataset.editPack);
      b=e.target.closest('[data-toggle-pack]');if(b){const x=state.packs.find(r=>Number(r.id)===Number(b.dataset.togglePack));toggle('packs_v34',x.id,'ativo',!x.ativo);}
      b=e.target.closest('[data-delete-pack]');if(b)remove('packs_v34',b.dataset.deletePack);
      b=e.target.closest('[data-register-pack]');if(b)registerPack(b.dataset.registerPack);
      b=e.target.closest('[data-confirm-pack-payment]');if(b)confirmPackPayment(b.dataset.confirmPackPayment);
      b=e.target.closest('[data-open-pack-chat]');if(b)openPackChat(b.dataset.openPackChat);
      b=e.target.closest('[data-toggle-type-visible]');if(b){const x=state.tipos.find(r=>r.codigo===b.dataset.toggleTypeVisible);toggle('tipos_curso_catalogo_v34',x.codigo,'visivel_site',!x.visivel_site);}
      b=e.target.closest('[data-toggle-type-enroll]');if(b){const x=state.tipos.find(r=>r.codigo===b.dataset.toggleTypeEnroll);toggle('tipos_curso_catalogo_v34',x.codigo,'permitir_inscricao',!x.permitir_inscricao);}
      b=e.target.closest('[data-latex-video-save]');if(b){const i=Number(b.dataset.latexVideoSave),input=document.querySelector(`[data-latex-video-input="${i}"]`);setVideoInLatex(i,input?.value.trim()||'');}
      b=e.target.closest('[data-latex-video-remove]');if(b)setVideoInLatex(Number(b.dataset.latexVideoRemove),'');
    });
    $('latexValidateContent')?.addEventListener('click',()=>setTimeout(renderLatexVideos,50));
    $('latexSyncFromNormal')?.addEventListener('click',()=>syncLatexFromNormal(true));
    $('latexContentSource')?.addEventListener('input',()=>{const source=$('latexContentSource');if(source&&!source.dataset.v34Syncing)source.dataset.userDirty='true';clearTimeout(window.__v34LatexVideoTimer);window.__v34LatexVideoTimer=setTimeout(renderLatexVideos,350);});
    $('latexProofSource')?.addEventListener('input',()=>{const source=$('latexProofSource');if(source&&!source.dataset.v34Syncing)source.dataset.userDirty='true';});
    $('latexContentTemplate')?.addEventListener('click',()=>{const source=$('latexContentSource');if(source)source.dataset.userDirty='true';});
    $('latexProofTemplate')?.addEventListener('click',()=>{const source=$('latexProofSource');if(source)source.dataset.userDirty='true';});
    $('latexContentFile')?.addEventListener('change',()=>{const source=$('latexContentSource');if(source)source.dataset.userDirty='true';});
    $('latexProofFile')?.addEventListener('change',()=>{const source=$('latexProofSource');if(source)source.dataset.userDirty='true';});
    document.querySelector('[data-builder-mode="latex"]')?.addEventListener('click',()=>{setTimeout(()=>{syncLatexFromNormal(false);renderLatexVideos();},120);});
    const refreshModules=window.carregarModulosCursoAtual;
    if(typeof refreshModules==='function'&&!refreshModules.__v34Wrapped){const wrapped=async(...args)=>{const result=await refreshModules(...args);const source=$('latexContentSource'),proof=$('latexProofSource');if(source){source.dataset.userDirty='false';source.dataset.syncedCourseId='';}if(proof){proof.dataset.userDirty='false';proof.dataset.syncedCourseId='';}return result;};wrapped.__v34Wrapped=true;window.carregarModulosCursoAtual=wrapped;}
    loadCommercial();setTimeout(renderLatexVideos,300);
  }
  document.addEventListener('DOMContentLoaded',wire);
})();
