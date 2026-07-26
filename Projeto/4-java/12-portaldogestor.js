/* ----------------------------------------------------------
   Sistema de Carregamento
-----------------------------------------------------------*/
function mostrarCarregamento(mensagem = 'Carregando...') {
  const loaderExistente = document.getElementById('global-loader');
  if (loaderExistente) loaderExistente.remove();

  const loader = document.createElement('div');
  loader.id = 'global-loader';
  loader.innerHTML = `
    <div class="loader-overlay">
      <div class="loader-content">
        <div class="loader-spinner"></div>
        <p>${mensagem}</p>
      </div>
    </div>
  `;
  // Segurança: nenhuma operação pode deixar a tela bloqueada indefinidamente.
  loader._altitudeTimeout = window.setTimeout(() => {
    if (loader.isConnected) {
      console.warn('Carregamento removido automaticamente após o tempo limite:', mensagem);
      loader.remove();
    }
  }, 20000);
  
  if (!document.querySelector('#loader-styles')) {
    const styles = document.createElement('style');
    styles.id = 'loader-styles';
    styles.textContent = `
      .loader-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        backdrop-filter: blur(5px);
      }
      .loader-content {
        text-align: center;
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        border: 1px solid #e2e8f0;
      }
      .loader-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f4f6;
        border-top: 4px solid #0ea5a3;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .loader-content p {
        margin: 0;
        color: #374151;
        font-weight: 500;
      }
    `;
    document.head.appendChild(styles);
  }
  
  document.body.appendChild(loader);
}

function esconderCarregamento() {
  const loader = document.getElementById('global-loader');
  if (!loader) return;
  if (loader._altitudeTimeout) window.clearTimeout(loader._altitudeTimeout);
  loader.remove();
}

function comTempoLimite(promise, ms = 15000, mensagem = 'A operação demorou mais do que o esperado.') {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(mensagem)), ms);
    })
  ]).finally(() => window.clearTimeout(timer));
}

/* ----------------------------------------------------------
   Navegação entre abas com feedback visual
-----------------------------------------------------------*/
function abrirAba(id) {
  mostrarCarregamento('Carregando dados...');
  
  setTimeout(() => {
    document.querySelectorAll('.aba').forEach(a => a.classList.remove('ativa'));
    document.getElementById(id)?.classList.add('ativa');
    
    if (id === 'alunos') {
      carregarAlunosDoSupabase();
    } else if (id === 'cursos') {
      if (window.carregarCursosCompleto) {
        carregarCursosCompleto();
      }
    }
    
    esconderCarregamento();
  }, 300);
}

/* ----------------------------------------------------------
   GESTÃO DE ALUNOS - CONECTADO AO SUPABASE
-----------------------------------------------------------*/
let alunos = [];
const pageAln = { idx:1, size:10 };
let editAlunoId = null;
const $ = s => document.querySelector(s);
function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function up(t){
  return (t||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/ç/gi,'c')
    .replace(/[^a-zA-Z\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim().toUpperCase();
}

function maskPhone(v){
  const d=(v||'').replace(/\D/g,'').slice(0,11);
  const has9=d.length>10;
  const ddd=d.slice(0,2), p1=has9?d.slice(2,7):d.slice(2,6), p2=has9?d.slice(7,11):d.slice(6,10);
  return (ddd?`(${ddd}) `:'')+p1+(p2?`-${p2}`:'');
}

// Carregar alunos do Supabase
async function carregarAlunosDoSupabase() {
  try {
    console.log('🔍 Iniciando carregamento de alunos do Supabase...');
    
    const { data, error } = await sb
      .from('alunos')
      .select('*')
      .order('criado_em', { ascending: false });

    if (error) {
      console.error('❌ Erro do Supabase:', error);
      throw error;
    }
    
    console.log('✅ Alunos carregados:', data);
    
    alunos = data.map(aluno => ({
      id: aluno.user_id,
      ra: aluno.ra || '',
      nome: String(aluno.nome || '').toUpperCase(),
      email: aluno.email || '',
      telefone: aluno.telefone || '',
      status: aluno.status || 'ATIVO',
      user_id: aluno.user_id,
      cpf: aluno.cpf,
      data_nascimento: aluno.data_nascimento,
      objetivo: aluno.objetivo,
      criado_em: aluno.criado_em
    }));
    
    renderAlunos();
  } catch (error) {
    console.error('❌ Erro ao carregar alunos:', error);
    
    alunos = [
      { 
        id: '1',
        user_id: 'cf3c57f7-ea29-4fb0-813f-21aaadcd4a6c',
        ra: '20251', 
        nome: 'CARLOS JUNIOR', 
        email: 'oliveiracagoj@gmail.com', 
        telefone: null, 
        status: 'ATIVO',
        cpf: null,
        data_nascimento: null,
        objetivo: null,
        criado_em: '2025-08-17 05:22:04.142164+00'
      }
    ];
    
    renderAlunos();
  }
}

function getFilteredAln(){
  const q   = ($('#alnBusca')?.value||'').trim().toUpperCase();
  const st  = $('#alnStatus')?.value || 'TODOS';
  const ord = $('#alnOrdenar')?.value || 'ra-asc';

  let data = alunos.filter(a=>{
    const hit = a.ra.includes(q) || a.nome.includes(q);
    const ok  = (st==='TODOS') || (a.status===st);
    return hit && ok;
  });

  const [campo,dir]=ord.split('-');
  data.sort((a,b)=>{
    const va=campo==='ra'?a.ra:a.nome, vb=campo==='ra'?b.ra:b.nome;
    return dir==='asc' ? (va>vb?1:-1) : (va<vb?1:-1);
  });
  return data;
}

function renderAlunos(){
  const tbody = $('#tabAlunos tbody');
  if(!tbody) return;

  const data = getFilteredAln();
  const totalPages = Math.max(1, Math.ceil(data.length / pageAln.size));
  if(pageAln.idx>totalPages) pageAln.idx = totalPages;

  const start = (pageAln.idx-1)*pageAln.size;
  const rows = data.slice(start, start+pageAln.size);

  tbody.innerHTML = rows.map((a)=>`
    <tr data-aluno-id="${a.id}">
      <td><strong>${a.ra}</strong></td>
      <td class="student-name-cell">${String(a.nome || '').toUpperCase()}</td>
      <td>${a.email}</td>
      <td>${maskPhone(a.telefone)}</td>
      <td><span class="badge ${a.status==='ATIVO'?'ativo':'inativo'}">${a.status}</span></td>
      <td class="student-actions">
        <button class="btn-mini primary-action-mini" data-act="edit" data-id="${a.id}">Editar dados</button>
        <button class="btn-mini" data-act="toggle" data-id="${a.id}">${a.status==='ATIVO'?'Inativar':'Ativar'}</button>
      </td>
    </tr>`).join('');
  $('#pgInfo') && ($('#pgInfo').textContent = `${pageAln.idx} / ${totalPages}`);
}

function openModalAln(alunoId = null){
  mostrarCarregamento('Preparando formulário...');

  setTimeout(() => {
    editAlunoId = alunoId ? String(alunoId) : null;
    const aluno = editAlunoId
      ? alunos.find((item) => String(item.id) === editAlunoId || String(item.user_id) === editAlunoId)
      : null;

    if (editAlunoId && !aluno) {
      esconderCarregamento();
      alert('Aluno não encontrado. Atualize a lista e tente novamente.');
      return;
    }

    $('#modalTitulo').textContent = aluno ? 'Editar aluno' : 'Novo aluno';
    $('#fRa').value = aluno?.ra || gerarRaLocal();
    $('#fStatus').value = aluno?.status || 'ATIVO';
    $('#fNome').value = String(aluno?.nome || '').toUpperCase();
    $('#fEmail').value = aluno?.email || '';
    $('#fTel').value = maskPhone(aluno?.telefone || '');

    $('#modalAluno').setAttribute('aria-hidden','false');
    esconderCarregamento();
  }, 120);
}

function closeModalAln(){ 
  editAlunoId = null;
  $('#modalAluno')?.setAttribute('aria-hidden','true'); 
}

function exportCSVAln(){
  const rows = [['RA','NOME','EMAIL','TELEFONE','STATUS']];
  getFilteredAln().forEach(a=> rows.push([a.ra,a.nome,a.email,maskPhone(a.telefone),a.status]));
  const csv = rows.map(r=>r.join(';')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='alunos.csv'; a.click();
}

async function salvarAluno(alunoData, isEdit = false, alunoId = null) {
  try {
    let result;
    
    const dadosParaSalvar = {
      nome: alunoData.nome,
      email: alunoData.email,
      telefone: alunoData.telefone,
      status: alunoData.status,
      ra: alunoData.ra,
      atualizado_em: new Date().toISOString()
    };
    
    if (isEdit && alunoId) {
      console.log('📝 Editando aluno:', alunoId, dadosParaSalvar);
      const { data, error } = await sb
        .from('alunos')
        .update(dadosParaSalvar)
        .eq('user_id', alunoId)
        .select();
      
      if (error) throw error;
      result = data[0];
      console.log('✅ Aluno editado:', result);
    } else {
      throw new Error('Novos alunos devem criar a conta pelo formulário público de cadastro.');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Erro ao salvar aluno:', error);
    throw error;
  }
}

async function alternarStatusAluno(alunoId, novoStatus) {
  try {
    console.log('🔄 Alternando status do aluno:', alunoId, novoStatus);
    
    const { data, error } = await sb
      .from('alunos')
      .update({ 
        status: novoStatus, 
        atualizado_em: new Date().toISOString() 
      })
      .eq('user_id', alunoId)
      .select();
    
    if (error) throw error;
    
    console.log('✅ Status alterado com sucesso');
    return data[0];
  } catch (error) {
    console.error('❌ Erro ao alterar status:', error);
    throw error;
  }
}

function carregarAlunos(){
  if($('#alnBusca')){
    $('#alnBusca').addEventListener('input', ()=>{ pageAln.idx=1; renderAlunos(); });
    $('#alnStatus').addEventListener('change', ()=>{ pageAln.idx=1; renderAlunos(); });
    $('#alnOrdenar').addEventListener('change', ()=>{ pageAln.idx=1; renderAlunos(); });

    $('#pgPrev').addEventListener('click', ()=>{ if(pageAln.idx>1){ pageAln.idx--; renderAlunos(); } });
    $('#pgNext').addEventListener('click', ()=>{ pageAln.idx++; renderAlunos(); });

    $('#alnExportar').addEventListener('click', exportCSVAln);
    $('#alnNovo').addEventListener('click', async ()=> {
      const url = new URL('5-cadastro.html', window.location.href).href;
      try { await navigator.clipboard.writeText(url); alert('Link de cadastro copiado. Envie ao novo aluno.'); }
      catch { prompt('Copie o link de cadastro:', url); }
    });
    $('#btnCancelar').addEventListener('click', closeModalAln);

    $('#tabAlunos').addEventListener('click', async (ev)=>{
      const btn = ev.target.closest('button'); 
      if(!btn) return;
      
      const alunoId = btn.dataset.id;
      const act = btn.dataset.act;
      const idx = alunos.findIndex((aluno) => String(aluno.id) === String(alunoId));
      if(idx < 0) {
        alert('Aluno não encontrado. Atualize a lista e tente novamente.');
        return;
      }
      
      if(act==='edit'){
        openModalAln(alunoId);
      }
      
      if(act==='toggle'){ 
        try {
          mostrarCarregamento('Alterando status...');
          const novoStatus = alunos[idx].status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
          await alternarStatusAluno(alunoId, novoStatus);
          alunos[idx].status = novoStatus;
          renderAlunos();
          esconderCarregamento();
        } catch (error) {
          esconderCarregamento();
          alert('Erro ao alterar status do aluno');
        }
      }
    });

    $('#formAluno').addEventListener('submit', async (e)=>{
      e.preventDefault();
      mostrarCarregamento('Salvando aluno...');
      
      const payload = {
        ra: $('#fRa').value || gerarRaLocal(),
        nome: up($('#fNome').value),
        email: $('#fEmail').value.trim().toLowerCase(),
        telefone: ($('#fTel').value||'').replace(/\D/g,''),
        status: $('#fStatus').value,
        atualizado_em: new Date().toISOString()
      };

      try {
        if(editAlunoId){ 
          const alunoId = editAlunoId;
          await salvarAluno(payload, true, alunoId);
          const idxAtual = alunos.findIndex((aluno) => String(aluno.id) === String(alunoId));
          if (idxAtual >= 0) alunos[idxAtual] = { ...alunos[idxAtual], ...payload, nome: up(payload.nome), id: alunoId, user_id: alunoId };
        } else { 
          throw new Error('Novos alunos devem usar o cadastro público.');
        }
        
        closeModalAln(); 
        renderAlunos();
        esconderCarregamento();
      } catch (error) {
        esconderCarregamento();
        alert('Erro ao salvar aluno: ' + error.message);
      }
    });

    $('#fTel').addEventListener('input', e=> e.target.value = maskPhone(e.target.value));
  }
  
  carregarAlunosDoSupabase();
}

function gerarRaLocal(){
  const ano = new Date().getFullYear().toString();
  const max = alunos.filter(a=>a.ra.startsWith(ano))
                    .map(a=>parseInt(a.ra.slice(4),10))
                    .reduce((m,v)=>isNaN(v)?m:Math.max(m,v),0);
  return ano + String(max+1).padStart(3, '0');
}

/* ======================= GESTÃO DE CURSOS (GC_) ======================= */
(function () {
  const $  = (s, sc = document) => sc.querySelector(s);
  const $$ = (s, sc = document) => Array.from(sc.querySelectorAll(s));

  const BUCKET_CAPAS = 'capas_cursos';
  const AREAS_FIXAS  = ['TECNOLOGIA', 'HUMANAS', 'SAÚDE', 'ADMINISTRAÇÃO', 'ENGENHARIA'];

  const GC = {
    cursos: [],
    editId: null,
    cursoAtual: null,
    moduloAtual: null,
    provaAtualId: null
  };

  const toUp   = (t) => (t || '').trim().toUpperCase();
  const fmtBool = (b) => (b ? 'SIM' : 'NÃO');
  const thumb   = (url) => url || '../3-img/LOGO.png';

  async function uploadCapa(arquivo) {
    if (!arquivo) return null;
    const nomeArquivo = `${Date.now()}-${arquivo.name}`.replace(/\s+/g, '_');

    const { error: upErr } = await sb.storage
      .from(BUCKET_CAPAS)
      .upload(nomeArquivo, arquivo, { upsert: true });

    if (upErr) throw upErr;

    const { data } = sb.storage
      .from(BUCKET_CAPAS)
      .getPublicUrl(nomeArquivo);

    return data.publicUrl;
  }

  async function fetchCursosComStats(filtroArea = 'TODAS') {
    let q = sb.from('cursos')
      .select('*')
      .order('id', { ascending: false });

    if (filtroArea && filtroArea !== 'TODAS') {
      q = q.eq('categoria', filtroArea);
    }

    const { data: cursos, error } = await q;
    if (error) throw error;
    if (!cursos || !cursos.length) return [];

    const ids = cursos.map(c => c.id);

    let mats = [], provas = [], modulos = [];
    
    const m = await sb.from('materiais').select('id,curso_id').in('curso_id', ids);
    if (!m.error && m.data) mats = m.data;

    const p = await sb.from('provas').select('id,curso_id').in('curso_id', ids);
    if (!p.error && p.data) provas = p.data;

    const mod = await sb.from('modulos').select('id,curso_id').in('curso_id', ids);
    if (!mod.error && mod.data) modulos = mod.data;

    const countBy = (arr) =>
      arr.reduce((acc, x) => {
        acc[x.curso_id] = (acc[x.curso_id] || 0) + 1;
        return acc;
      }, {});

    const matsCount   = countBy(mats);
    const provasCount = countBy(provas);
    const modulosCount = countBy(modulos);

    return cursos.map(c => ({
      ...c,
      total_materiais: matsCount[c.id]   || 0,
      total_provas:    provasCount[c.id] || 0,
      total_modulos:   modulosCount[c.id] || 0
    }));
  }

  function renderAreasSelects() {
    const filtro = $('#curFiltroArea');
    if (filtro) {
      const atual = filtro.value || 'TODAS';
      filtro.innerHTML = ['TODAS', ...AREAS_FIXAS]
        .map(a => `<option value="${a}">${a}</option>`)
        .join('');
      filtro.value = atual;
    }

    const areaForm = $('#fCursoArea');
    if (areaForm) {
      areaForm.innerHTML = AREAS_FIXAS
        .map(a => `<option value="${a}">${a}</option>`)
        .join('');
    }
  }

  function renderTabelaCursos() {
    const tbody = $('#tabCursos tbody');
    if (!tbody) return;

    tbody.innerHTML = GC.cursos.map(c => `
      <tr data-id="${c.id}">
        <td class="col-id">${c.id}</td>
        <td class="col-curso">
          <div class="curso-info">
            <img src="${thumb(c.capa_url)}" class="curso-thumb" alt="Capa do curso">
            <div class="curso-textos">
              <div class="curso-titulo">${c.titulo}</div>
              <div class="curso-sub">${c.carga_horaria || 0}h · ${(c.tipo_curso || 'PROFISSIONAL') === 'TECNICO' ? 'TÉCNICO' : 'PROFISSIONAL'} · ${c.categoria || '-'}</div>
            </div>
          </div>
        </td>
        <td class="col-area">${c.categoria || '-'}</td>
        <td class="col-modulos">
          <span title="Módulos cadastrados">📦 ${c.total_modulos || 0}</span>
        </td>
        <td class="col-pub">
          <span class="badge ${c.publicado ? 'pub' : 'nop'}">
            ${fmtBool(c.publicado)}
          </span>
        </td>
        <td class="col-acoes course-action-cell">
          <button class="btn-mini gc-edit" title="Editar nome, carga, capa e descrição">Editar dados</button>
          <button class="btn-mini gc-mods course-build-button" title="Cadastrar módulos, conteúdo, PDFs e prova">Montar curso</button>
          <button class="btn-mini gc-prev" title="Visualizar o curso">Pré-visualizar</button>
          <button class="btn-mini gc-publish ${c.publicado ? 'is-live' : ''}" title="${c.publicado ? 'Retirar do catálogo' : 'Revisar e publicar'}">${c.publicado ? '✓ Publicado' : 'Publicar'}</button>
          <button class="btn-mini gc-dup" title="Duplicar curso">Duplicar</button>
          <button class="btn-mini gc-del danger" title="Excluir curso">Excluir</button>
        </td>
      </tr>
    `).join('');
  }

  async function carregarCursosCompleto() {
    if (!$('#tabCursos')) return;

    const area = $('#curFiltroArea')?.value || 'TODAS';
    try {
      console.log('🎯 Carregando cursos do Supabase...');
      GC.cursos = await fetchCursosComStats(area);
      console.log('✅ Cursos carregados:', GC.cursos);
      renderTabelaCursos();
    } catch (err) {
      console.error('❌ Erro ao carregar cursos:', err);
      alert('Erro ao carregar cursos: ' + err.message);
    }
  }

  function abrirModalCursoNovo() {
    mostrarCarregamento('Abrindo formulário...');
    setTimeout(() => {
      GC.editId = null;
      $('#tituloCurso').textContent = 'Novo curso';

      $('#fCursoNome').value  = '';
      $('#fCursoArea').value  = AREAS_FIXAS[0] || 'TECNOLOGIA';
      $('#fCursoHoras').value = '20';
      $('#fCursoDesc').value  = '';
      $('#fCursoPub').value   = 'NAO';
      $('#fCursoCapa').value  = '';
      if ($('#fCursoNivel')) $('#fCursoNivel').value = 'BASICO';
      if ($('#fCursoTipo')) $('#fCursoTipo').value = 'PROFISSIONAL';
      if ($('#fCursoNotaMinima')) $('#fCursoNotaMinima').value = '70';
      if ($('#fCursoDestaque')) $('#fCursoDestaque').checked = false;
      const prev = $('#cursoCapaPreview'); if (prev) prev.innerHTML = '<span>A capa aparecerá aqui</span>';

      if ($('#modalCurso')) $('#modalCurso').dataset.courseId = '';
      $('#modalCurso')?.setAttribute('aria-hidden', 'false');
      esconderCarregamento();
    }, 300);
  }

  function abrirModalCursoEditar(id) {
    mostrarCarregamento('Carregando dados do curso...');
    setTimeout(() => {
      const c = GC.cursos.find(x => x.id === id);
      if (!c) return;

      GC.editId = id;
      $('#tituloCurso').textContent = `Editar curso #${id}`;

      $('#fCursoNome').value  = c.titulo || '';
      $('#fCursoArea').value  = toUp(c.categoria || AREAS_FIXAS[0]);
      $('#fCursoHoras').value = c.carga_horaria || 0;
      $('#fCursoDesc').value  = c.descricao || '';
      $('#fCursoPub').value   = c.publicado ? 'SIM' : 'NAO';
      $('#fCursoCapa').value  = '';
      if ($('#fCursoNivel')) $('#fCursoNivel').value = c.nivel || 'BASICO';
      if ($('#fCursoTipo')) $('#fCursoTipo').value = c.tipo_curso || 'PROFISSIONAL';
      if ($('#fCursoNotaMinima')) $('#fCursoNotaMinima').value = c.nota_minima ?? 70;
      if ($('#fCursoDestaque')) $('#fCursoDestaque').checked = Boolean(c.destaque);
      const prev = $('#cursoCapaPreview');
      if (prev) prev.innerHTML = c.capa_url ? `<img src="${c.capa_url}" alt="Capa atual">` : '<span>Curso sem capa</span>';

      if ($('#modalCurso')) $('#modalCurso').dataset.courseId = String(id);
      $('#modalCurso')?.setAttribute('aria-hidden', 'false');
      esconderCarregamento();
    }, 300);
  }

  async function salvarCurso(ev) {
    ev.preventDefault();
    mostrarCarregamento('Salvando curso...');

    const nome   = $('#fCursoNome')?.value?.trim();
    const area   = toUp($('#fCursoArea')?.value || 'TECNOLOGIA');
    const horas  = parseInt($('#fCursoHoras')?.value, 10) || 0;
    const desc   = $('#fCursoDesc')?.value?.trim() || '';
    const cursoAtual = GC.editId ? GC.cursos.find(curso => curso.id === GC.editId) : null;
    const publi = Boolean(cursoAtual?.publicado);
    const arquivo= $('#fCursoCapa')?.files[0] || null;
    const nivel = $('#fCursoNivel')?.value || 'BASICO';
    const tipoCurso = $('#fCursoTipo')?.value || 'PROFISSIONAL';
    const notaMinima = Math.max(0, Math.min(100, parseInt($('#fCursoNotaMinima')?.value, 10) || 70));
    const destaque = Boolean($('#fCursoDestaque')?.checked);

    if (!nome) {
      esconderCarregamento();
      alert('Informe o nome do curso.');
      return;
    }

    if (horas < 5 || horas > 200 || horas % 5 !== 0) {
      esconderCarregamento();
      alert('A carga horária deve ser de 5 em 5 horas, entre 5h e 200h.');
      return;
    }

    const { data: dupList, error: dupErr } = await sb
      .from('cursos')
      .select('id,titulo')
      .ilike('titulo', nome);

    if (dupErr) console.warn(dupErr);

    const existeOutro = (dupList || []).some(row =>
      row.titulo.trim().toLowerCase() === nome.toLowerCase() &&
      row.id !== GC.editId
    );
    if (existeOutro) {
      esconderCarregamento();
      alert('Já existe um curso com esse nome. Escolha outro título.');
      return;
    }

    try {
      let urlCapa = null;
      if (arquivo) {
        urlCapa = await uploadCapa(arquivo);
      }

      const payloadBase = {
        titulo      : nome,
        categoria   : area,
        carga_horaria: horas,
        descricao   : desc,
        publicado   : publi,
        nivel       : nivel,
        tipo_curso  : tipoCurso,
        nota_minima : notaMinima,
        destaque    : destaque,
        publicado_em: publi ? new Date().toISOString() : null
      };
      if (urlCapa) payloadBase.capa_url = urlCapa;

      let salvo;
      if (GC.editId) {
        const { data, error } = await sb
          .from('cursos')
          .update(payloadBase)
          .eq('id', GC.editId)
          .select()
          .single();
        if (error) throw error;
        salvo = data;
      } else {
        const payloadNew = { ...payloadBase, criado_em: new Date().toISOString() };
        const { data, error } = await sb
          .from('cursos')
          .insert(payloadNew)
          .select()
          .single();
        if (error) throw error;
        salvo = data;
      }

      esconderCarregamento();
      alert(GC.editId ? `✅ Curso "${salvo.titulo}" atualizado com sucesso!` : `✅ Curso "${salvo.titulo}" salvo como rascunho. Agora crie os módulos, materiais e a prova.`);
      $('#modalCurso')?.setAttribute('aria-hidden', 'true');
      $('#formCurso')?.reset();
      await carregarCursosCompleto();
    } catch (err) {
      esconderCarregamento();
      console.error(err);
      alert('❌ Erro ao salvar curso: ' + err.message);
    }
  }

  async function excluirCurso(id) {
    const curso = GC.cursos.find(c => c.id === id);
    if (!curso) return;

    const ok = confirm(`Excluir o curso "${curso.titulo}"?\nEssa ação não pode ser desfeita.`);
    if (!ok) return;

    mostrarCarregamento('Excluindo curso...');
    try {
      const { data: provas } = await sb.from('provas').select('id').eq('curso_id', id);
      if (provas && provas.length) {
        const provaIds = provas.map(p => p.id);
        await sb.from('questoes').delete().in('prova_id', provaIds);
        await sb.from('provas').delete().eq('curso_id', id);
      }
      await sb.from('materiais').delete().eq('curso_id', id);

      const { error } = await sb.from('cursos').delete().eq('id', id);
      if (error) throw error;

      esconderCarregamento();
      alert('✅ Curso excluído com sucesso.');
      await carregarCursosCompleto();
    } catch (err) {
      esconderCarregamento();
      console.error(err);
      alert('❌ Não foi possível excluir o curso. Veja o console para detalhes.');
    }
  }

  async function duplicarCurso(id) {
    const curso = GC.cursos.find(c => c.id === id);
    if (!curso) return;

    mostrarCarregamento('Duplicando curso...');
    try {
      const base = {
        titulo       : `${curso.titulo} (CÓPIA)`,
        descricao    : curso.descricao,
        categoria    : curso.categoria,
        carga_horaria: curso.carga_horaria,
        capa_url     : curso.capa_url,
        publicado    : false,
        criado_em    : new Date().toISOString()
      };
      const { data: novoCurso, error: cErr } = await sb
        .from('cursos')
        .insert(base)
        .select()
        .single();
      if (cErr) throw cErr;

      const mats = await sb.from('materiais').select('*').eq('curso_id', id);
      if (!mats.error && mats.data && mats.data.length) {
        const novos = mats.data.map(m => ({
          curso_id: novoCurso.id,
          tipo    : m.tipo,
          titulo  : m.titulo,
          url     : m.url,
          criado_em: new Date().toISOString()
        }));
        await sb.from('materiais').insert(novos);
      }

      const prs = await sb.from('provas').select('*').eq('curso_id', id);
      if (!prs.error && prs.data && prs.data.length) {
        for (const p of prs.data) {
          const { data: np } = await sb
            .from('provas')
            .insert({
              curso_id: novoCurso.id,
              titulo  : p.titulo,
              criado_em: new Date().toISOString()
            })
            .select()
            .single();

          const qs = await sb.from('questoes').select('*').eq('prova_id', p.id);
          if (!qs.error && qs.data && qs.data.length) {
            const novasQ = qs.data.map(q => ({
              prova_id : np.id,
              enunciado: q.enunciado,
              a: q.a, b: q.b, c: q.c, d: q.d,
              correta  : q.correta
            }));
            await sb.from('questoes').insert(novasQ);
          }
        }
      }

      esconderCarregamento();
      alert(`✅ Curso duplicado: "${novoCurso.titulo}"`);
      await carregarCursosCompleto();
    } catch (err) {
      esconderCarregamento();
      console.error(err);
      alert('❌ Erro ao duplicar curso: ' + err.message);
    }
  }

  // =====================================================================
  //  GESTÃO DE MÓDULOS - SISTEMA COMPLETO E FUNCIONAL
  // =====================================================================

  let cursoEditandoId = null;
  let moduloEditandoId = null;

  function debugModulos(mensagem, data = null) {
    console.log(`🔧 MÓDULOS: ${mensagem}`, data || '');
  }

  async function abrirPainelModulos(id) {
    debugModulos('Abrindo painel de módulos para curso:', id);
    // Remove qualquer carregamento antigo que tenha ficado preso.
    esconderCarregamento();

    const curso = GC.cursos.find(c => Number(c.id) === Number(id));
    if (!curso) {
      alert('Curso não encontrado. Atualize a lista e tente novamente.');
      return;
    }

    cursoEditandoId = Number(id);
    GC.cursoAtual = curso;
    const modalModulos = $('#modalModulos');
    if (!modalModulos) {
      alert('A tela de montagem do curso não foi carregada. Atualize a página com Ctrl + F5.');
      return;
    }

    modalModulos.dataset.courseId = String(id);
    modalModulos.dataset.courseTitle = curso.titulo || 'Curso Altitude';
    modalModulos.dataset.courseHours = String(Math.max(0, Number(curso.carga_horaria || 0)));
    modalModulos.dataset.courseCategory = curso.categoria || '';
    modalModulos.dataset.courseDescription = curso.descricao || '';

    const courseName = $('#mmCursoNome');
    if (courseName) courseName.textContent = `${curso.titulo} · ${curso.categoria || 'SEM ÁREA'}`;

    // Abre primeiro a tela. O formulário continua utilizável mesmo se a internet estiver lenta.
    modalModulos.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    configurarEventListenersModulos();
    document.getElementById('builderModeNormal')?.click();
    atualizarPreviaModuloNormal();
    document.querySelector('.builder-scroll-area')?.scrollTo?.({ top: 0 });
    document.querySelector('.builder-list-panel')?.scrollTo?.({ top: 0 });

    const list = $('#tabModulosBody');
    if (list) list.innerHTML = '<div class="builder-empty-state"><strong>Carregando módulos…</strong><span>O formulário já pode ser preenchido enquanto os dados são carregados.</span></div>';

    try {
      await comTempoLimite(
        carregarModulosCurso(Number(id)),
        18000,
        'Não foi possível concluir o carregamento dos módulos. Verifique a conexão e tente novamente.'
      );
    } catch (error) {
      console.error('Erro/tempo limite ao abrir módulos:', error);
      if (list) {
        list.innerHTML = `<div class="builder-empty-state error" data-retry="true"><strong>Os módulos não foram carregados.</strong><span>${escapeHTML(error.message || 'Falha de conexão.')}</span><button type="button" id="btnRetryModulesV28">Tentar novamente</button></div>`;
        document.getElementById('btnRetryModulesV28')?.addEventListener('click', () => carregarModulosCurso(Number(id)));
      }
    } finally {
      esconderCarregamento();
    }
  }

  function fecharPainelModulos() {
    $('#modalModulos').setAttribute('aria-hidden', 'true');
    if ($('#modalModulos')) {
      delete $('#modalModulos').dataset.courseId;
      delete $('#modalModulos').dataset.courseTitle;
    }
    GC.cursoAtual = null;
    cursoEditandoId = null;
    moduloEditandoId = null;
    document.body.style.overflow = '';
    if (normalPreviewImageUrl) { URL.revokeObjectURL(normalPreviewImageUrl); normalPreviewImageUrl = null; }
    if (normalPreviewPdfUrl) { URL.revokeObjectURL(normalPreviewPdfUrl); normalPreviewPdfUrl = null; }
  }

  async function carregarModulosCurso(cursoId) {
    const list = $('#tabModulosBody');
    const summary = $('#builderModuleSummary');
    if (!list) return [];
    list.innerHTML = '<div class="builder-empty-state"><strong>Carregando módulos…</strong><span>Aguarde só um instante.</span></div>';

    try {
      const moduloResult = await comTempoLimite(
        sb.from('modulos').select('*').eq('curso_id', Number(cursoId)).order('ordem', { ascending: true }),
        15000,
        'A consulta dos módulos demorou demais.'
      );
      if (moduloResult.error) throw moduloResult.error;
      const modulos = moduloResult.data || [];

      if (!modulos.length) {
        list.innerHTML = '<div class="builder-empty-state"><strong>O curso ainda não possui módulos.</strong><span>Use o formulário ao lado para criar o primeiro módulo.</span></div>';
        if (summary) summary.textContent = '0 módulos cadastrados';
        const normalStatus = document.getElementById('builderNormalStatus');
        if (normalStatus) normalStatus.textContent = 'Salve o primeiro módulo para continuar.';
        return [];
      }

      const moduloIds = modulos.map((item) => Number(item.id)).filter(Boolean);
      const [materiaisResult, provasResult] = await Promise.all([
        comTempoLimite(
          sb.from('materiais').select('id,modulo_id').in('modulo_id', moduloIds),
          12000,
          'A consulta dos materiais demorou demais.'
        ).catch((error) => ({ data: [], error })),
        comTempoLimite(
          sb.from('provas').select('id,modulo_id').in('modulo_id', moduloIds),
          12000,
          'A consulta das provas demorou demais.'
        ).catch((error) => ({ data: [], error }))
      ]);

      if (materiaisResult.error) console.warn('Materiais não puderam ser contados:', materiaisResult.error);
      if (provasResult.error) console.warn('Provas não puderam ser contadas:', provasResult.error);

      const materiais = materiaisResult.data || [];
      const provas = provasResult.data || [];
      const provaIds = provas.map((item) => Number(item.id)).filter(Boolean);
      let questoes = [];
      if (provaIds.length) {
        const questoesResult = await comTempoLimite(
          sb.from('questoes').select('id,prova_id').in('prova_id', provaIds),
          12000,
          'A consulta das questões demorou demais.'
        ).catch((error) => ({ data: [], error }));
        if (questoesResult.error) console.warn('Questões não puderam ser contadas:', questoesResult.error);
        questoes = questoesResult.data || [];
      }

      const materialCount = materiais.reduce((acc, item) => {
        const key = Number(item.modulo_id);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const proofByModule = provas.reduce((acc, item) => {
        const key = Number(item.modulo_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(Number(item.id));
        return acc;
      }, {});
      const questionsByProof = questoes.reduce((acc, item) => {
        const key = Number(item.prova_id);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      let prontos = 0;
      const cards = modulos.map((modulo) => {
        const moduleId = Number(modulo.id);
        const materiaisCount = materialCount[moduleId] || 0;
        const questaoCount = (proofByModule[moduleId] || []).reduce((sum, proofId) => sum + (questionsByProof[proofId] || 0), 0);
        const temConteudo = Boolean(String(modulo.conteudo || '').trim() || String(modulo.pdf_url || '').trim());
        const etapas = Number(temConteudo) + Number(materiaisCount > 0) + Number(questaoCount > 0) + Number(Boolean(modulo.publicado));
        const percentual = Math.round((etapas / 4) * 100);
        if (percentual === 100) prontos += 1;

        const safeTitle = escapeHTML(modulo.titulo || 'Módulo');
        const safeDescription = escapeHTML(modulo.descricao || 'Sem descrição cadastrada.');
        const rawContent = String(modulo.conteudo || '').trim();
        const safePreview = rawContent
          ? escapeHTML(rawContent.slice(0, 150)) + (rawContent.length > 150 ? '…' : '')
          : (modulo.pdf_url ? 'Apostila em PDF anexada.' : 'Nenhum conteúdo inserido ainda.');

        return `
          <article class="builder-module-card" data-module-id="${moduleId}" data-module-title="${safeTitle}">
            <div class="builder-module-top">
              <div class="builder-module-order">${Number(modulo.ordem || 1)}</div>
              <div class="builder-module-copy">
                <h5>${safeTitle}</h5>
                <p><strong>${Math.max(0, Number(modulo.carga_horaria || 0))}h</strong> · ${safeDescription}</p>
                <small class="builder-content-preview">${safePreview}</small>
              </div>
              <span class="builder-status ${modulo.publicado ? 'live' : ''}">${modulo.publicado ? 'LIBERADO' : 'RASCUNHO'}</span>
            </div>
            <div class="builder-progress-row"><div class="builder-progress"><span style="width:${percentual}%"></span></div><strong>${percentual}% configurado</strong></div>
            <div class="builder-checks">
              <span class="${temConteudo ? 'done' : ''}">${temConteudo ? '✓' : '○'} Conteúdo/PDF</span>
              <span class="${materiaisCount > 0 ? 'done' : ''}">${materiaisCount > 0 ? '✓' : '○'} Arquivos e mídia (${materiaisCount})</span>
              <span class="${questaoCount > 0 ? 'done' : ''}">${questaoCount > 0 ? '✓' : '○'} Prova (${questaoCount})</span>
              <span class="${modulo.publicado ? 'done' : ''}">${modulo.publicado ? '✓' : '○'} Liberação</span>
            </div>
            <div class="builder-module-actions">
              <button type="button" class="primary" data-module-action="content">Editar módulo</button>
              <button type="button" data-module-action="materials">Arquivos e mídia</button>
              <button type="button" data-module-action="exam">Prova</button>
              <button type="button" data-module-action="toggle">${modulo.publicado ? 'Desativar' : 'Liberar módulo'}</button>
              <button type="button" class="danger" data-module-action="delete">Excluir</button>
            </div>
          </article>`;
      });

      list.innerHTML = cards.join('');
      if (summary) summary.textContent = `${modulos.length} módulo${modulos.length === 1 ? '' : 's'} · ${prontos} totalmente configurado${prontos === 1 ? '' : 's'}`;
      const normalStatus = document.getElementById('builderNormalStatus');
      const totalHours = modulos.reduce((sum, item) => sum + Math.max(0, Number(item.carga_horaria || 0)), 0);
      const totalQuestions = questoes.length;
      if (normalStatus) normalStatus.textContent = `${modulos.length} módulo(s) · ${totalHours}h distribuídas · ${totalQuestions} questão(ões)`;
      return modulos;
    } catch (error) {
      console.error('Erro ao carregar módulos:', error);
      list.innerHTML = `<div class="builder-empty-state error" data-retry="true"><strong>Não foi possível carregar os módulos.</strong><span>${escapeHTML(error.message || error)}</span><button type="button" id="btnRetryModulesV28">Tentar novamente</button></div>`;
      document.getElementById('btnRetryModulesV28')?.addEventListener('click', () => carregarModulosCurso(Number(cursoId)));
      if (summary) summary.textContent = 'Falha ao carregar a estrutura';
      return [];
    }
  }

  async function uploadPdfModulo(file, cursoId) {
    if (!file) return null;
    if (file.type && file.type !== 'application/pdf') throw new Error('Selecione um arquivo PDF válido.');
    const safeName = String(file.name || 'apostila.pdf').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${cursoId}/modulos/${Date.now()}-${safeName}`;
    const { error } = await sb.storage.from('materiais_cursos').upload(path, file, { upsert: false, contentType: 'application/pdf' });
    if (error) throw error;
    return sb.storage.from('materiais_cursos').getPublicUrl(path).data.publicUrl;
  }

  async function uploadArquivoCurso(file, cursoId, pasta = 'materiais') {
    if (!file) return null;
    const safeName = String(file.name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${cursoId}/${pasta}/${Date.now()}-${safeName}`;
    const { error } = await sb.storage.from('materiais_cursos').upload(path, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });
    if (error) throw error;
    return sb.storage.from('materiais_cursos').getPublicUrl(path).data.publicUrl;
  }

  function tipoMaterialArquivo(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (type.startsWith('image/')) return 'IMAGEM';
    if (type.startsWith('video/')) return 'VIDEO';
    if (type.startsWith('audio/')) return 'AUDIO';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
    return 'OUTRO';
  }

  let normalPreviewImageUrl = null;
  let normalPreviewPdfUrl = null;

  function setNormalPreviewMode(mode) {
    const screen = document.getElementById('normalMaterialPreview');
    const frame = document.getElementById('normalPdfPreviewFrame');
    if (!screen || !frame) return;
    screen.hidden = mode === 'pdf';
    frame.hidden = mode !== 'pdf';
    ['btnPreviewNormalScreen','btnPreviewSelectedPdf','btnPreviewNormalPdf'].forEach((id) => {
      document.getElementById(id)?.classList.toggle('active',
        (mode === 'screen' && id === 'btnPreviewNormalScreen') ||
        (mode === 'pdf' && id !== 'btnPreviewNormalScreen'));
    });
  }

  function atualizarPreviaModuloNormal() {
    const box = document.getElementById('normalMaterialPreview');
    if (!box) return;
    const titulo = document.getElementById('fModuloTitulo')?.value.trim() || 'Título do módulo';
    const descricao = document.getElementById('fModuloDesc')?.value.trim() || 'A descrição aparecerá aqui.';
    const horas = Math.max(0, Number(document.getElementById('fModuloHoras')?.value || 0));
    const conteudo = document.getElementById('fModuloConteudo')?.value.trim() || 'O conteúdo para leitura aparecerá nesta área.';
    const video = document.getElementById('fModuloVideo')?.value.trim() || '';
    const imageFile = document.getElementById('fModuloImagemArquivo')?.files?.[0] || null;
    if (normalPreviewImageUrl) { URL.revokeObjectURL(normalPreviewImageUrl); normalPreviewImageUrl = null; }
    if (imageFile) normalPreviewImageUrl = URL.createObjectURL(imageFile);
    box.innerHTML = `
      <div class="normal-preview-hero">
        <div><h3>${escapeHTML(titulo)}</h3><p>${escapeHTML(descricao)}</p><div class="normal-preview-meta"><span>${horas} horas</span><span>Material de estudo</span></div></div>
        ${normalPreviewImageUrl ? `<img class="normal-preview-image" src="${normalPreviewImageUrl}" alt="Prévia da foto do módulo">` : '<div class="normal-preview-image"></div>'}
      </div>
      <div class="normal-preview-content">${escapeHTML(conteudo)}</div>
      ${video ? `<a class="normal-preview-link" href="${escapeHTML(video)}" target="_blank" rel="noopener">Abrir vídeo complementar</a>` : ''}`;
    setNormalPreviewMode('screen');
  }

  async function criarPdfInstitucionalModuloBlob({ title, desc, hours, content, courseTitle }) {
    if (!content) throw new Error('Insira o conteúdo do módulo para gerar a apostila em PDF.');
    const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
    if (!JsPDF && window.AltitudeLatexImporter?.createModulePdfBlob) {
      return window.AltitudeLatexImporter.createModulePdfBlob({
        titulo: title,
        descricao: desc,
        carga_horaria: hours,
        conteudo: content,
        conteudo_latex: content,
        ordem: 1
      }, { titulo: courseTitle || 'Curso Altitude', categoria: 'FORMAÇÃO PROFISSIONAL', carga_horaria: hours });
    }
    if (!JsPDF) throw new Error('Não foi possível carregar o gerador de PDF. Atualize a página e tente novamente.');

    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 20;
    const right = 20;
    const width = pageWidth - left - right;
    const bottom = pageHeight - 20;
    let y = 24;
    let page = 1;

    const color = (hex) => {
      const value = String(hex).replace('#', '');
      doc.setTextColor(parseInt(value.slice(0,2),16), parseInt(value.slice(2,4),16), parseInt(value.slice(4,6),16));
    };
    const headerFooter = () => {
      doc.setDrawColor(200, 211, 220);
      doc.setLineWidth(.25);
      doc.line(left, 13, pageWidth - right, 13);
      doc.setFont('helvetica','normal');
      doc.setFontSize(8.5);
      doc.setTextColor(85,85,85);
      doc.text('Instituição Altitude', left, 10);
      doc.text(courseTitle, pageWidth - right, 10, { align:'right', maxWidth:95 });
      doc.line(left, pageHeight - 14, pageWidth - right, pageHeight - 14);
      doc.text(String(page), pageWidth / 2, pageHeight - 9, { align:'center' });
    };
    const addPage = () => {
      headerFooter();
      doc.addPage();
      page += 1;
      y = 23;
    };
    const ensure = (needed=10) => { if (y + needed > bottom) addPage(); };
    const write = (text, opts={}) => {
      const value = String(text || '').trim();
      if (!value) return;
      const size = opts.size || 10.5;
      const lineHeight = opts.lineHeight || size * .47;
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      color(opts.color || '#263746');
      const lines = doc.splitTextToSize(value, width - (opts.indent || 0));
      lines.forEach(line => {
        ensure(lineHeight + 1);
        doc.text(line, left + (opts.indent || 0), y, { maxWidth: width - (opts.indent || 0), align: opts.align || 'left' });
        y += lineHeight;
      });
      y += opts.after ?? 2.5;
    };

    doc.setFillColor(234,244,251);
    doc.roundedRect(20, 38, pageWidth - 40, 62, 4, 4, 'F');
    color('#0D0A3C');
    doc.setFont('helvetica','bold');
    doc.setFontSize(25);
    doc.text('ALTITUDE', pageWidth / 2, 55, { align:'center' });
    color('#1F70AB');
    doc.setFontSize(16);
    doc.text('Material de Estudo', pageWidth / 2, 68, { align:'center' });
    color('#0D0A3C');
    doc.setFontSize(20);
    doc.text(doc.splitTextToSize(title, pageWidth - 60), pageWidth / 2, 83, { align:'center' });

    doc.setDrawColor(31,112,171);
    doc.setFillColor(247,251,254);
    doc.roundedRect(20, 113, pageWidth - 40, 55, 3, 3, 'FD');
    y = 125;
    write(`Curso: ${courseTitle}`, { bold:true, size:10.5, after:2 });
    write(`Módulo: ${title}`, { size:10.5, after:2 });
    write(`Carga horária: ${hours} horas`, { size:10.5, after:2 });
    write(`Descrição: ${desc || 'Conteúdo programático do módulo.'}`, { size:10, after:2 });
    headerFooter();

    doc.addPage();
    page += 1;
    y = 24;
    write(title, { size:18, bold:true, color:'#1F70AB', after:5 });
    const paragraphs = String(content).replace(/\r/g,'').split(/\n\s*\n|\n/).map(item => item.trim()).filter(Boolean);
    paragraphs.forEach(paragraph => {
      const bullet = /^[-•*]\s+/.test(paragraph);
      write(bullet ? `• ${paragraph.replace(/^[-•*]\s+/, '')}` : paragraph, { size:10.5, indent: bullet ? 4 : 0, after: bullet ? 1.5 : 3 });
    });
    headerFooter();
    return doc.output('blob');
  }

  async function gerarPreviaPdfNormal() {
    const title = document.getElementById('fModuloTitulo')?.value.trim() || 'Módulo do curso';
    const desc = document.getElementById('fModuloDesc')?.value.trim() || '';
    const hours = Math.max(0, Number(document.getElementById('fModuloHoras')?.value || 0));
    const content = document.getElementById('fModuloConteudo')?.value.trim() || '';
    const courseTitle = document.getElementById('modalModulos')?.dataset.courseTitle || 'Curso Altitude';
    try {
      const blob = await criarPdfInstitucionalModuloBlob({ title, desc, hours, content, courseTitle });
      if (normalPreviewPdfUrl) URL.revokeObjectURL(normalPreviewPdfUrl);
      normalPreviewPdfUrl = URL.createObjectURL(blob);
      const frame = document.getElementById('normalPdfPreviewFrame');
      if (frame) frame.src = normalPreviewPdfUrl;
      setNormalPreviewMode('pdf');
    } catch (error) {
      alert(error.message);
    }
  }

  function visualizarPdfSelecionado() {
    const file = document.getElementById('fModuloPdfArquivo')?.files?.[0];
    if (!file) return alert('Selecione primeiro a apostila em PDF.');
    if (normalPreviewPdfUrl) URL.revokeObjectURL(normalPreviewPdfUrl);
    normalPreviewPdfUrl = URL.createObjectURL(file);
    const frame = document.getElementById('normalPdfPreviewFrame');
    if (frame) frame.src = normalPreviewPdfUrl;
    setNormalPreviewMode('pdf');
  }

  async function adicionarModulo() {
    debugModulos('=== INICIANDO ADIÇÃO DE MÓDULO ===');
    mostrarCarregamento('Adicionando módulo...');
    
    if (!cursoEditandoId) {
      debugModulos('ERRO: Nenhum curso selecionado');
      esconderCarregamento();
      alert('❌ Erro: Nenhum curso selecionado');
      return;
    }

    const tituloInput = $('#fModuloTitulo');
    const ordemInput = $('#fModuloOrdem');
    const descricaoInput = $('#fModuloDesc');
    const horasInput = $('#fModuloHoras');
    const conteudoInput = $('#fModuloConteudo');
    const imageInput = $('#fModuloImagemArquivo');
    const pdfInput = $('#fModuloPdfArquivo');
    const videoInput = $('#fModuloVideo');
    const extraTitleInput = $('#fModuloMaterialTitulo');
    const extraFileInput = $('#fModuloMaterialArquivo');
    const publicadoInput = $('#fModuloPublicado');
    const gerarPdfAutomaticoInput = $('#fModuloGerarPdfAutomatico');
    const formElement = $('#formModulo');
    const abrirProvaDepois = formElement?.dataset.openExam === 'true';
    if (formElement) formElement.dataset.openExam = 'false';

    if (!tituloInput || !ordemInput) {
      esconderCarregamento();
      debugModulos('ERRO: Campos do formulário não encontrados');
      return;
    }

    const titulo = tituloInput.value.trim();
    const ordem = parseInt(ordemInput.value) || 1;
    const descricao = descricaoInput ? descricaoInput.value.trim() : '';
    const cargaHoraria = Math.max(0, parseInt(horasInput?.value || '0', 10) || 0);
    const conteudo = conteudoInput ? conteudoInput.value.trim() : '';
    const imageFile = imageInput?.files?.[0] || null;
    const pdfFile = pdfInput?.files?.[0] || null;
    const videoUrl = videoInput?.value?.trim() || '';
    const extraTitle = extraTitleInput?.value?.trim() || '';
    const extraFile = extraFileInput?.files?.[0] || null;
    const publicado = Boolean(publicadoInput?.checked);
    const gerarPdfAutomatico = Boolean(gerarPdfAutomaticoInput?.checked);

    if (!titulo) {
      esconderCarregamento();
      alert('⚠️ Por favor, insira um título para o módulo');
      tituloInput.focus();
      return;
    }

    debugModulos('Dados do formulário:', { titulo, ordem, descricao, conteudo, cursoEditandoId });

    try {
      debugModulos('Enviando para Supabase...');
      
      let pdfUrl = await uploadPdfModulo(pdfFile, cursoEditandoId);
      if (!pdfUrl && gerarPdfAutomatico && conteudo) {
        const courseTitle = document.getElementById('modalModulos')?.dataset.courseTitle || GC.cursoAtual?.titulo || 'Curso Altitude';
        const generatedBlob = await criarPdfInstitucionalModuloBlob({ title: titulo, desc: descricao, hours: cargaHoraria, content: conteudo, courseTitle });
        pdfUrl = await uploadPdfModulo(generatedBlob, cursoEditandoId);
      }
      const imageUrl = await uploadArquivoCurso(imageFile, cursoEditandoId, 'imagens-modulos');
      const extraUrl = await uploadArquivoCurso(extraFile, cursoEditandoId, 'materiais-extras');
      const { data, error } = await sb
        .from('modulos')
        .insert([{
          curso_id: cursoEditandoId,
          titulo: titulo,
          ordem: ordem,
          descricao: descricao,
          carga_horaria: cargaHoraria,
          conteudo: conteudo,
          pdf_url: pdfUrl,
          video_url: videoUrl || null,
          publicado: publicado,
          created_at: new Date().toISOString()
        }])
        .select();

      if (error) {
        debugModulos('ERRO no Supabase:', error);
        throw error;
      }

      const moduloCriado = data?.[0];
      if (moduloCriado?.id) {
        const materiaisNovos = [];
        if (pdfUrl) materiaisNovos.push({ curso_id: cursoEditandoId, modulo_id: moduloCriado.id, tipo: 'PDF', titulo: `Apostila — ${titulo}`, url: pdfUrl, criado_em: new Date().toISOString() });
        if (imageUrl) materiaisNovos.push({ curso_id: cursoEditandoId, modulo_id: moduloCriado.id, tipo: 'IMAGEM', titulo: `Imagem — ${titulo}`, url: imageUrl, criado_em: new Date().toISOString() });
        if (extraUrl) materiaisNovos.push({ curso_id: cursoEditandoId, modulo_id: moduloCriado.id, tipo: tipoMaterialArquivo(extraFile), titulo: extraTitle || extraFile?.name || `Material — ${titulo}`, url: extraUrl, criado_em: new Date().toISOString() });
        if (materiaisNovos.length) {
          const { error: materialError } = await sb.from('materiais').insert(materiaisNovos);
          if (materialError) console.warn('Módulo salvo, mas um material não foi indexado:', materialError.message);
        }
      }

      debugModulos('✅ Módulo salvo com sucesso no Supabase:', data);

      tituloInput.value = '';
      if (descricaoInput) descricaoInput.value = '';
      if (horasInput) horasInput.value = '0';
      if (conteudoInput) conteudoInput.value = '';
      if (imageInput) imageInput.value = '';
      if (pdfInput) pdfInput.value = '';
      if (videoInput) videoInput.value = '';
      if (extraTitleInput) extraTitleInput.value = '';
      if (extraFileInput) extraFileInput.value = '';
      if (publicadoInput) publicadoInput.checked = false;
      if (gerarPdfAutomaticoInput) gerarPdfAutomaticoInput.checked = true;
      ordemInput.value = String((data?.[0]?.ordem || ordem) + 1);

      await carregarModulosCurso(cursoEditandoId);
      atualizarPreviaModuloNormal();
      
      esconderCarregamento();
      alert('✅ Módulo adicionado com sucesso!');
      if (abrirProvaDepois && moduloCriado?.id) {
        await window.abrirGestaoProvas(moduloCriado.id, titulo);
      }
      
      debugModulos('=== MÓDULO ADICIONADO COM SUCESSO ===');

    } catch (error) {
      esconderCarregamento();
      debugModulos('ERRO COMPLETO:', error);
      alert('❌ Erro ao adicionar módulo: ' + error.message);
    }
  }

  function configurarEventListenersModulos() {
    const formModulo = $('#formModulo');
    if (formModulo && formModulo.dataset.bound !== 'true') {
      formModulo.dataset.bound = 'true';
      formModulo.addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
        adicionarModulo();
      });
    }

    const list = $('#tabModulosBody');
    if (list && list.dataset.bound !== 'true') {
      list.dataset.bound = 'true';
      list.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-module-action]');
        const card = event.target.closest('[data-module-id]');
        if (!button || !card) return;
        const id = Number(card.dataset.moduleId);
        const title = card.dataset.moduleTitle || 'Módulo';
        const action = button.dataset.moduleAction;
        if (action === 'content') return window.abrirEdicaoModulo(id);
        if (action === 'materials') return window.abrirEdicaoModulo(id);
        if (action === 'exam') return window.abrirGestaoProvas(id, title);
        if (action === 'toggle') return window.alternarStatusModulo(id);
        if (action === 'delete') return window.excluirModulo(id);
      });
    }

    const reload = $('#btnRecarregarModulos');
    if (reload && reload.dataset.bound !== 'true') {
      reload.dataset.bound = 'true';
      reload.addEventListener('click', () => cursoEditandoId && carregarModulosCurso(cursoEditandoId));
    }

    const close = $('#fecharModulos');
    if (close && close.dataset.bound !== 'true') {
      close.dataset.bound = 'true';
      close.addEventListener('click', fecharPainelModulos);
    }
    const back = $('#btnVoltarModulos');
    if (back && back.dataset.bound !== 'true') {
      back.dataset.bound = 'true';
      back.addEventListener('click', fecharPainelModulos);
    }

    const previewIds = ['fModuloTitulo','fModuloOrdem','fModuloHoras','fModuloDesc','fModuloConteudo','fModuloVideo','fModuloImagemArquivo'];
    previewIds.forEach((id) => {
      const field = document.getElementById(id);
      if (!field || field.dataset.previewBound === 'true') return;
      field.dataset.previewBound = 'true';
      field.addEventListener(field.type === 'file' ? 'change' : 'input', atualizarPreviaModuloNormal);
    });
    const screenPreview = document.getElementById('btnPreviewNormalScreen');
    if (screenPreview && screenPreview.dataset.bound !== 'true') {
      screenPreview.dataset.bound = 'true';
      screenPreview.addEventListener('click', () => { atualizarPreviaModuloNormal(); setNormalPreviewMode('screen'); });
    }
    const selectedPdf = document.getElementById('btnPreviewSelectedPdf');
    if (selectedPdf && selectedPdf.dataset.bound !== 'true') {
      selectedPdf.dataset.bound = 'true';
      selectedPdf.addEventListener('click', visualizarPdfSelecionado);
    }
    const generatePdf = document.getElementById('btnPreviewNormalPdf');
    if (generatePdf && generatePdf.dataset.bound !== 'true') {
      generatePdf.dataset.bound = 'true';
      generatePdf.addEventListener('click', gerarPreviaPdfNormal);
    }
    const saveAndExam = document.getElementById('btnSalvarAbrirProva');
    if (saveAndExam && saveAndExam.dataset.bound !== 'true') {
      saveAndExam.dataset.bound = 'true';
      saveAndExam.addEventListener('click', () => {
        const form = document.getElementById('formModulo');
        if (!form) return;
        form.dataset.openExam = 'true';
        form.requestSubmit();
      });
    }
    const openEditExam = document.getElementById('btnAbrirProvaEdicao');
    if (openEditExam && openEditExam.dataset.bound !== 'true') {
      openEditExam.dataset.bound = 'true';
      openEditExam.addEventListener('click', () => {
        const id = Number(document.getElementById('editar-id')?.value || 0);
        const title = document.getElementById('editar-titulo')?.value.trim() || 'Módulo';
        if (id) window.abrirGestaoProvas(id, title);
      });
    }
    const newModuleButton = document.getElementById('btnNormalNewModule');
    if (newModuleButton && newModuleButton.dataset.bound !== 'true') {
      newModuleButton.dataset.bound = 'true';
      newModuleButton.addEventListener('click', () => {
        document.getElementById('formModulo')?.reset();
        const orderField = document.getElementById('fModuloOrdem');
        const cards = document.querySelectorAll('#tabModulosBody [data-module-id]');
        if (orderField) orderField.value = String(cards.length + 1);
        const hoursField = document.getElementById('fModuloHoras');
        if (hoursField) hoursField.value = '0';
        const autoPdf = document.getElementById('fModuloGerarPdfAutomatico');
        if (autoPdf) autoPdf.checked = true;
        atualizarPreviaModuloNormal();
        document.querySelector('.builder-scroll-area')?.scrollTo?.({ top: 0, behavior: 'smooth' });
        document.getElementById('fModuloTitulo')?.focus();
      });
    }
    const publishNormalButton = document.getElementById('btnBuilderPublishNormal');
    if (publishNormalButton && publishNormalButton.dataset.bound !== 'true') {
      publishNormalButton.dataset.bound = 'true';
      publishNormalButton.addEventListener('click', async () => {
        const courseId = Number(document.getElementById('modalModulos')?.dataset.courseId || 0);
        if (!courseId) return alert('Curso não identificado. Feche a tela e abra “Montar curso” novamente.');
        if (typeof window.altitudeAlternarPublicacaoCurso !== 'function') return alert('A publicação ainda está carregando. Aguarde alguns segundos e tente novamente.');
        const published = await window.altitudeAlternarPublicacaoCurso(courseId, publishNormalButton, { forcePublish: true });
        if (published) document.getElementById('fecharModulos')?.click();
      });
    }
  }

  async function contarMateriaisModulo(moduloId) {
    try {
      const { count, error } = await sb
        .from('materiais')
        .select('*', { count: 'exact', head: true })
        .eq('modulo_id', moduloId);
      return count || 0;
    } catch (error) {
      return 0;
    }
  }

  async function contarQuestoesModulo(moduloId) {
    try {
      const { data: provas, error: provError } = await sb
        .from('provas')
        .select('id')
        .eq('modulo_id', moduloId);

      if (!provas || provas.length === 0) return 0;

      const provaIds = provas.map(p => p.id);
      const { count, error: questError } = await sb
        .from('questoes')
        .select('*', { count: 'exact', head: true })
        .in('prova_id', provaIds);
      return count || 0;
    } catch (error) {
      return 0;
    }
  }

  // =====================================================================
  //  SISTEMA DE SELEÇÃO: MÓDULOS vs PROVAS
  // =====================================================================

  function mostrarSelecaoGestao(moduloId, moduloTitulo) {
    GC.moduloAtual = { id: moduloId, titulo: moduloTitulo };
    
    const modalSelecao = document.createElement('div');
    modalSelecao.className = 'modal';
    modalSelecao.setAttribute('aria-hidden', 'false');
    modalSelecao.innerHTML = `
      <div class="modal__sheet" style="max-width: 500px;">
        <h3>Gerenciar Módulo</h3>
        <p style="margin-bottom: 20px; color: #64748b;">Selecione o que deseja gerenciar no módulo:</p>
        
        <div style="display: grid; gap: 15px; margin-bottom: 25px;">
          <button class="btn-grande" onclick="abrirGestaoMateriais(${moduloId}, '${moduloTitulo}')" 
                  style="padding: 20px; text-align: left; background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; cursor: pointer;">
            <div style="font-size: 18px; font-weight: bold; color: #0369a1;">📚 Materiais</div>
            <div style="color: #64748b; margin-top: 5px;">Adicionar PDFs, vídeos, áudios e imagens</div>
          </button>
          
          <button class="btn-grande" onclick="abrirGestaoProvas(${moduloId}, '${moduloTitulo}')" 
                  style="padding: 20px; text-align: left; background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; cursor: pointer;">
            <div style="font-size: 18px; font-weight: bold; color: #047857;">📝 Provas</div>
            <div style="color: #64748b; margin-top: 5px;">Criar e gerenciar avaliações com questões</div>
          </button>
        </div>
        
        <div style="text-align: center;">
          <button type="button" class="ghost" onclick="fecharModalSelecao()">Cancelar</button>
        </div>
      </div>
    `;
    
    modalSelecao.id = 'modalSelecao';
    document.body.appendChild(modalSelecao);
  }

  function fecharModalSelecao() {
    const modal = document.getElementById('modalSelecao');
    if (modal) {
      modal.remove();
    }
  }

  // =====================================================================
  //  GESTÃO DE PROVAS - SISTEMA COMPLETO
  // =====================================================================

  window.abrirGestaoProvas = async function(moduloId, moduloTitulo) {
    fecharModalSelecao();
    mostrarCarregamento('Carregando provas...');
    document.getElementById('modalModulos')?.setAttribute('aria-hidden', 'true');
    
    GC.moduloAtual = { id: moduloId, titulo: moduloTitulo };
    
    try {
      // Carregar provas existentes para este módulo
      const { data: provas, error } = await sb
        .from('provas')
        .select('*')
        .eq('modulo_id', moduloId)
        .order('criado_em', { ascending: false });

      if (error) throw error;

      // Criar ou atualizar modal de provas
      let modalProvas = document.getElementById('modalProvas');
      if (!modalProvas) {
        modalProvas = document.createElement('div');
        modalProvas.className = 'modal';
        modalProvas.id = 'modalProvas';
        document.body.appendChild(modalProvas);
      }

      modalProvas.innerHTML = `
        <div class="modal__sheet simple-exam-modal">
          <header class="course-builder-header">
            <div>
              <p class="builder-eyebrow">AVALIAÇÃO DO MÓDULO</p>
              <h3>Prova — ${escapeHTML(moduloTitulo)}</h3>
              <p>Crie uma avaliação e depois adicione as questões. O aluno verá uma questão por vez.</p>
            </div>
            <button type="button" class="btn-fechar builder-close" onclick="fecharModalProvas()" aria-label="Fechar">×</button>
          </header>

          <div class="simple-exam-layout">
            <section class="simple-exam-create">
              <span>NOVA PROVA</span>
              <h4>Comece com o título</h4>
              <form id="formProva">
                <label>Título da prova
                  <input type="text" id="fProvaTitulo" required value="Avaliação — ${escapeHTML(moduloTitulo)}" placeholder="Ex.: Avaliação do módulo">
                </label>
                <button type="submit" class="builder-main-button">Criar prova e adicionar questões</button>
              </form>
              <div class="builder-help-card">
                <strong>Como funciona</strong>
                <ol><li>Crie a prova.</li><li>Clique em <b>Adicionar questões</b>.</li><li>Cadastre enunciado, alternativas e resposta correta.</li></ol>
              </div>
            </section>

            <section class="simple-exam-list">
              <div class="builder-list-heading">
                <div><span>PROVAS CADASTRADAS</span><h4>${provas?.length || 0} avaliação${provas?.length === 1 ? '' : 'ões'}</h4></div>
              </div>
              <div class="simple-exam-cards">
                ${provas && provas.length > 0 ? provas.map(prova => `
                  <article class="simple-exam-card">
                    <div>
                      <strong>${prova.titulo}</strong>
                      <small>${prova.total_questoes || 0} questões · ${new Date(prova.criado_em).toLocaleDateString('pt-BR')}</small>
                    </div>
                    <div>
                      <button type="button" class="primary" onclick="editarProva(${prova.id})">Adicionar questões</button>
                      <button type="button" class="danger" onclick="excluirProva(${prova.id})">Excluir</button>
                    </div>
                  </article>`).join('') : '<div class="builder-empty-state"><strong>Nenhuma prova criada.</strong><span>Use o formulário ao lado para começar.</span></div>'}
              </div>
            </section>
          </div>
          <footer class="builder-footer"><button type="button" class="builder-secondary-button" onclick="fecharModalProvas()">← Voltar aos módulos</button></footer>
        </div>
      `;

      // Configurar evento do formulário
      document.getElementById('formProva')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await criarProva(moduloId);
      });

      modalProvas.setAttribute('aria-hidden', 'false');
      esconderCarregamento();

    } catch (error) {
      esconderCarregamento();
      document.getElementById('modalModulos')?.setAttribute('aria-hidden', 'false');
      console.error('❌ Erro ao carregar provas:', error);
      alert('Erro ao carregar provas: ' + error.message);
    }
  }

  async function criarProva(moduloId) {
    const tituloInput = document.getElementById('fProvaTitulo');
    const titulo = tituloInput.value.trim();

    if (!titulo) {
      alert('Por favor, insira um título para a prova');
      return;
    }

    mostrarCarregamento('Criando prova...');
    
    try {
      const { data, error } = await sb
        .from('provas')
        .insert([{
          curso_id: GC.cursoAtual?.id || cursoEditandoId,
          modulo_id: moduloId,
          titulo: titulo,
          criado_em: new Date().toISOString()
        }])
        .select();

      if (error) throw error;

      esconderCarregamento();
      const provaCriada = data?.[0];
      if (provaCriada?.id) await window.editarProva(provaCriada.id);
      else await window.abrirGestaoProvas(moduloId, GC.moduloAtual.titulo);
      
    } catch (error) {
      esconderCarregamento();
      console.error('❌ Erro ao criar prova:', error);
      alert('Erro ao criar prova: ' + error.message);
    }
  }

  window.editarProva = async function(provaId) {
    mostrarCarregamento('Abrindo editor da prova...');
    try {
      document.getElementById('modalProvas')?.setAttribute('aria-hidden', 'true');
      document.getElementById('modalEdicaoProva')?.remove();

      const { data: prova, error: provaError } = await sb.from('provas').select('*').eq('id', provaId).single();
      if (provaError) throw provaError;
      const { data: questoes, error: questError } = await sb.from('questoes').select('*').eq('prova_id', provaId).order('ordem', { ascending: true }).order('id', { ascending: true });
      if (questError) throw questError;

      const modalEdicao = document.createElement('div');
      modalEdicao.className = 'modal';
      modalEdicao.id = 'modalEdicaoProva';
      modalEdicao.setAttribute('aria-hidden', 'false');
      modalEdicao.innerHTML = `
        <div class="modal__sheet exam-editor-sheet">
          <header class="course-builder-header exam-editor-header">
            <div><p class="builder-eyebrow">AVALIAÇÃO DO CURSO</p><h3>${escapeHTML(prova.titulo || 'Prova')}</h3><p>Cadastre as questões e confira a visualização ao lado. O aluno continuará selecionando uma alternativa por questão.</p></div>
            <button type="button" class="btn-fechar builder-close" onclick="fecharModalEdicaoProva()" aria-label="Fechar">×</button>
          </header>
          <div class="exam-editor-grid">
            <section class="exam-question-form-panel">
              <div class="builder-panel-title"><span>NOVA QUESTÃO</span><h4>Enunciado, alternativas e resolução</h4></div>
              <form id="formQuestao" class="exam-question-form">
                <input type="hidden" id="fProvaId" value="${Number(provaId)}">
                <label>Enunciado da questão<textarea id="fEnunciado" rows="4" required></textarea></label>
                <div class="exam-alternatives-grid">
                  <label>Alternativa A<input type="text" id="fAlternativaA" required></label>
                  <label>Alternativa B<input type="text" id="fAlternativaB" required></label>
                  <label>Alternativa C<input type="text" id="fAlternativaC" required></label>
                  <label>Alternativa D<input type="text" id="fAlternativaD" required></label>
                  <label>Alternativa E <small>(opcional)</small><input type="text" id="fAlternativaE"></label>
                  <label>Resposta correta<select id="fCorreta" required><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="E">E</option></select></label>
                </div>
                <label>Resolução comentada<textarea id="fResolucao" rows="4" placeholder="Explique por que a alternativa correta é a resposta adequada."></textarea></label>
                <button type="submit" class="builder-main-button">Adicionar questão</button>
              </form>
            </section>
            <section class="exam-question-preview-panel">
              <div class="builder-list-heading"><div><span>PRÉ-VISUALIZAÇÃO</span><h4>${questoes?.length || 0} questão(ões) cadastrada(s)</h4><p>O gabarito aparece em verde apenas para o gestor.</p></div></div>
              <div class="exam-question-list">
                ${questoes?.length ? questoes.map((q, index) => {
                  const alternatives = [['A',q.a],['B',q.b],['C',q.c],['D',q.d],['E',q.e]].filter(([,value]) => value);
                  return `<article class="latex-question-card">
                    <header><strong>Questão ${index + 1}</strong><button type="button" class="exam-delete-question" onclick="excluirQuestao(${Number(q.id)})">Excluir</button></header>
                    <p>${escapeHTML(q.enunciado || '')}</p>
                    <ul>${alternatives.map(([letter,value]) => `<li class="${String(q.correta).toUpperCase() === letter ? 'correct' : ''}"><b>${letter})</b> ${escapeHTML(value)}</li>`).join('')}</ul>
                    ${q.resolucao ? `<div class="resolution"><b>Resolução:</b> ${escapeHTML(q.resolucao)}</div>` : ''}
                  </article>`;
                }).join('') : '<div class="builder-empty-state"><strong>Nenhuma questão cadastrada.</strong><span>Use o formulário para adicionar a primeira.</span></div>'}
              </div>
            </section>
          </div>
          <footer class="builder-footer"><button type="button" class="builder-secondary-button" onclick="fecharModalEdicaoProva()">← Voltar às provas</button><p>Depois de revisar, feche esta tela e volte à montagem do curso.</p></footer>
        </div>`;
      document.body.appendChild(modalEdicao);
      document.getElementById('formQuestao')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await adicionarQuestao(provaId);
      });
      esconderCarregamento();
    } catch (error) {
      esconderCarregamento();
      console.error('Erro ao abrir prova:', error);
      alert('Erro ao carregar prova: ' + error.message);
    }
  }

  async function adicionarQuestao(provaId) {
    const enunciado = document.getElementById('fEnunciado')?.value.trim() || '';
    const a = document.getElementById('fAlternativaA')?.value.trim() || '';
    const b = document.getElementById('fAlternativaB')?.value.trim() || '';
    const c = document.getElementById('fAlternativaC')?.value.trim() || '';
    const d = document.getElementById('fAlternativaD')?.value.trim() || '';
    const e = document.getElementById('fAlternativaE')?.value.trim() || null;
    const correta = document.getElementById('fCorreta')?.value || 'A';
    const resolucao = document.getElementById('fResolucao')?.value.trim() || null;
    if (!enunciado || !a || !b || !c || !d) return alert('Preencha o enunciado e as alternativas A, B, C e D.');
    if (correta === 'E' && !e) return alert('A alternativa E foi marcada como correta, mas está vazia.');
    mostrarCarregamento('Adicionando questão...');
    try {
      const { count } = await sb.from('questoes').select('*', { count: 'exact', head: true }).eq('prova_id', provaId);
      const { error } = await sb.from('questoes').insert({
        prova_id: Number(provaId), enunciado, a, b, c, d, e, correta, resolucao, ordem: Number(count || 0) + 1
      });
      if (error) throw error;
      document.getElementById('modalEdicaoProva')?.remove();
      await window.editarProva(Number(provaId));
    } catch (error) {
      esconderCarregamento();
      console.error('Erro ao adicionar questão:', error);
      alert('Erro ao adicionar questão: ' + error.message);
    }
  }

  window.excluirQuestao = async function(questaoId) {
    if (!confirm('Tem certeza que deseja excluir esta questão?')) return;
    
    mostrarCarregamento('Excluindo questão...');
    
    try {
      const { error } = await sb
        .from('questoes')
        .delete()
        .eq('id', questaoId);

      if (error) throw error;

      // Recarregar a edição da prova
      const provaId = document.getElementById('fProvaId').value;
      await window.editarProva(parseInt(provaId));
      
      esconderCarregamento();
      alert('✅ Questão excluída com sucesso!');
      
    } catch (error) {
      esconderCarregamento();
      console.error('❌ Erro ao excluir questão:', error);
      alert('Erro ao excluir questão: ' + error.message);
    }
  }

  window.excluirProva = async function(provaId) {
    if (!confirm('Tem certeza que deseja excluir esta prova? Todas as questões serão excluídas.')) return;
    
    mostrarCarregamento('Excluindo prova...');
    
    try {
      // Primeiro excluir as questões
      await sb.from('questoes').delete().eq('prova_id', provaId);
      
      // Depois excluir a prova
      const { error } = await sb
        .from('provas')
        .delete()
        .eq('id', provaId);

      if (error) throw error;

      // Recarregar a lista de provas
      await window.abrirGestaoProvas(GC.moduloAtual.id, GC.moduloAtual.titulo);
      
      esconderCarregamento();
      alert('✅ Prova excluída com sucesso!');
      
    } catch (error) {
      esconderCarregamento();
      console.error('❌ Erro ao excluir prova:', error);
      alert('Erro ao excluir prova: ' + error.message);
    }
  }

  window.fecharModalProvas = function() {
    const modal = document.getElementById('modalProvas');
    if (modal) modal.remove();
    const builder = document.getElementById('modalModulos');
    if (builder?.dataset.courseId) builder.setAttribute('aria-hidden', 'false');
  }

  window.fecharModalEdicaoProva = function() {
    document.getElementById('modalEdicaoProva')?.remove();
    const proofList = document.getElementById('modalProvas');
    if (proofList) proofList.setAttribute('aria-hidden', 'false');
    else if (GC.moduloAtual?.id) window.abrirGestaoProvas(GC.moduloAtual.id, GC.moduloAtual.titulo);
  }

  // =====================================================================
  //  GESTÃO DE MATERIAIS (Placeholder - você pode implementar similar às provas)
  // =====================================================================

  window.abrirGestaoMateriais = function(moduloId, moduloTitulo) {
    fecharModalSelecao();
    alert(`🎯 Gestão de Materiais para: ${moduloTitulo}\n\nEsta funcionalidade será implementada em breve!`);
    // Aqui você pode implementar um sistema similar ao de provas para materiais
  }

  // 🎯 FUNÇÕES GLOBAIS PARA MÓDULOS
  window.alternarStatusModulo = async function(moduloId) {
    try {
      console.log('🔄 Alternando status do módulo:', moduloId);
      mostrarCarregamento('Alterando status...');
      
      const { data: modulo, error: fetchError } = await sb
        .from('modulos')
        .select('publicado')
        .eq('id', moduloId)
        .single();
        
      if (fetchError) throw fetchError;

      const novoStatus = !modulo.publicado;
      
      const { error } = await sb
        .from('modulos')
        .update({ 
          publicado: novoStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', moduloId);

      if (error) throw error;
      
      await carregarModulosCurso(cursoEditandoId);
      esconderCarregamento();
      alert(`✅ Módulo ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`);
      
    } catch (error) {
      esconderCarregamento();
      console.error('❌ Erro ao alternar status:', error);
      alert('Erro ao alterar status do módulo: ' + error.message);
    }
  }

  window.abrirEdicaoModulo = async function(moduloId) {
    try {
      console.log('✏️ Abrindo edição do módulo:', moduloId);
      mostrarCarregamento('Carregando dados do módulo...');
      
      const { data: modulo, error } = await sb
        .from('modulos')
        .select('*')
        .eq('id', moduloId)
        .single();

      if (error) throw error;
      if (!modulo) {
        esconderCarregamento();
        alert('Módulo não encontrado');
        return;
      }

      console.log('📋 Dados do módulo:', modulo);

      document.getElementById('editar-id').value = modulo.id;
      document.getElementById('editar-course-id').value = modulo.curso_id;
      document.getElementById('editar-titulo').value = modulo.titulo || '';
      document.getElementById('editar-descricao').value = modulo.descricao || '';
      const editarConteudo = document.getElementById('editar-conteudo'); if (editarConteudo) editarConteudo.value = modulo.conteudo || '';
      document.getElementById('editar-order').value = modulo.ordem || 1;
      const editarHoras = document.getElementById('editar-carga-horaria');
      if (editarHoras) editarHoras.value = Math.max(0, Number(modulo.carga_horaria || 0));
      document.getElementById('editar-pdf-url').value = modulo.pdf_url || '';
      document.getElementById('editar-video-url').value = modulo.video_url || '';
      document.getElementById('editar-publicado').checked = modulo.publicado || false;
      const editarGerarPdf = document.getElementById('editar-gerar-pdf');
      if (editarGerarPdf) editarGerarPdf.checked = true;

      const editPanel = document.getElementById('form-edicao-modulo');
      if (editPanel) {
        editPanel.hidden = false;
        editPanel.style.display = 'block';
        editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      esconderCarregamento();
      
    } catch (error) {
      esconderCarregamento();
      console.error('❌ Erro ao abrir edição:', error);
      alert('Erro ao carregar dados do módulo: ' + error.message);
    }
  }

  window.excluirModulo = async function(moduloId) {
    if (!confirm('Tem certeza que deseja excluir este módulo?\nEsta ação não pode ser desfeita.')) return;
    
    mostrarCarregamento('Excluindo módulo...');
    try {
      const { error } = await sb
        .from('modulos')
        .delete()
        .eq('id', moduloId);
        
      if (error) throw error;
      
      await carregarModulosCurso(cursoEditandoId);
      esconderCarregamento();
      alert('✅ Módulo excluído com sucesso!');
      
    } catch (error) {
      esconderCarregamento();
      console.error('❌ Erro ao excluir módulo:', error);
      alert('Erro ao excluir módulo: ' + error.message);
    }
  }

  window.salvarEdicaoModulo = async function(e) {
    e.preventDefault();
    mostrarCarregamento('Salvando alterações...');
    
    const moduloId = document.getElementById('editar-id').value;
    const courseId = document.getElementById('editar-course-id').value;

    if (!moduloId) {
      esconderCarregamento();
      alert('ID do módulo não encontrado');
      return;
    }

    try {
      const newPdfFile = document.getElementById('editar-pdf-arquivo')?.files?.[0] || null;
      const newImageFile = document.getElementById('editar-imagem-arquivo')?.files?.[0] || null;
      const newExtraFile = document.getElementById('editar-material-arquivo')?.files?.[0] || null;
      const newExtraTitle = document.getElementById('editar-material-titulo')?.value.trim() || '';
      let pdfUrl = document.getElementById('editar-pdf-url').value.trim();
      let imageUrl = null;
      let extraUrl = null;
      const editTitle = document.getElementById('editar-titulo').value.trim();
      const editDescription = document.getElementById('editar-descricao').value.trim();
      const editContent = document.getElementById('editar-conteudo')?.value.trim() || '';
      const editHours = Math.max(0, Math.min(200, parseInt(document.getElementById('editar-carga-horaria')?.value || '0', 10) || 0));
      if (newPdfFile) {
        pdfUrl = await uploadPdfModulo(newPdfFile, Number(courseId));
      } else if (document.getElementById('editar-gerar-pdf')?.checked && editContent) {
        const courseTitle = document.getElementById('modalModulos')?.dataset.courseTitle || GC.cursoAtual?.titulo || 'Curso Altitude';
        const generatedBlob = await criarPdfInstitucionalModuloBlob({ title: editTitle, desc: editDescription, hours: editHours, content: editContent, courseTitle });
        pdfUrl = await uploadPdfModulo(generatedBlob, Number(courseId));
      }
      if (newImageFile) imageUrl = await uploadArquivoCurso(newImageFile, Number(courseId), 'imagens-modulos');
      if (newExtraFile) extraUrl = await uploadArquivoCurso(newExtraFile, Number(courseId), 'materiais-extras');

      const dadosAtualizados = {
        titulo: editTitle,
        descricao: editDescription,
        conteudo: editContent,
        ordem: parseInt(document.getElementById('editar-order').value) || 1,
        carga_horaria: editHours,
        pdf_url: pdfUrl,
        video_url: document.getElementById('editar-video-url').value.trim(),
        publicado: document.getElementById('editar-publicado').checked,
        updated_at: new Date().toISOString()
      };

      if (!dadosAtualizados.titulo) {
        esconderCarregamento();
        alert('O título do módulo é obrigatório');
        return;
      }

      console.log('💾 Salvando edição do módulo:', { moduloId, dadosAtualizados });

      const { error } = await sb
        .from('modulos')
        .update(dadosAtualizados)
        .eq('id', moduloId);

      if (error) throw error;

      const novosMateriais = [];
      if ((newPdfFile || document.getElementById('editar-gerar-pdf')?.checked) && pdfUrl) {
        await sb.from('materiais').delete().eq('modulo_id', Number(moduloId)).eq('tipo', 'PDF').like('titulo', 'Apostila —%');
      }
      if ((newPdfFile || document.getElementById('editar-gerar-pdf')?.checked) && pdfUrl) novosMateriais.push({ curso_id: Number(courseId), modulo_id: Number(moduloId), tipo: 'PDF', titulo: `Apostila — ${dadosAtualizados.titulo}`, url: pdfUrl, criado_em: new Date().toISOString() });
      if (newImageFile && imageUrl) novosMateriais.push({ curso_id: Number(courseId), modulo_id: Number(moduloId), tipo: 'IMAGEM', titulo: `Imagem — ${dadosAtualizados.titulo}`, url: imageUrl, criado_em: new Date().toISOString() });
      if (newExtraFile && extraUrl) novosMateriais.push({ curso_id: Number(courseId), modulo_id: Number(moduloId), tipo: tipoMaterialArquivo(newExtraFile), titulo: newExtraTitle || newExtraFile.name || `Material — ${dadosAtualizados.titulo}`, url: extraUrl, criado_em: new Date().toISOString() });
      if (novosMateriais.length) {
        const { error: materialError } = await sb.from('materiais').insert(novosMateriais);
        if (materialError) console.warn('Módulo atualizado, mas um material não foi indexado:', materialError.message);
      }

      esconderCarregamento();
      alert('✅ Módulo atualizado com sucesso!');
      fecharEdicaoModulo();
      
      await carregarModulosCurso(courseId);
      
    } catch (error) {
      esconderCarregamento();
      console.error('❌ Erro ao salvar edição:', error);
      alert('Erro ao atualizar módulo: ' + error.message);
    }
  }

  window.fecharEdicaoModulo = function() {
    const panel = document.getElementById('form-edicao-modulo');
    if (panel) { panel.hidden = true; panel.style.display = 'none'; }
    document.getElementById('form-editar-modulo')?.reset();
  }

  // =====================================================================
  //  ATUALIZAÇÃO DO BOTÃO PARA USAR O SISTEMA DE SELEÇÃO
  // =====================================================================

  function wireCursosUI() {
    const wrap = $('#cursos');
    if (!wrap) return;

    renderAreasSelects();

    $('#curFiltroArea')?.addEventListener('change', carregarCursosCompleto);

    $('#btnNovoCurso')?.addEventListener('click', abrirModalCursoNovo);
    $('#btnNovoCursoTopo')?.addEventListener('click', abrirModalCursoNovo);
    $('#fecharCurso')?.addEventListener('click', () =>
      $('#modalCurso')?.setAttribute('aria-hidden', 'true')
    );
    $('#formCurso')?.addEventListener('submit', salvarCurso);

    $('#tabCursos')?.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (!tr) return;
      const id = parseInt(tr.dataset.id, 10);
      if (Number.isNaN(id)) return;

      if (ev.target.classList.contains('gc-edit')) return abrirModalCursoEditar(id);
      if (ev.target.classList.contains('gc-del'))  return excluirCurso(id);
      if (ev.target.classList.contains('gc-dup'))  return duplicarCurso(id);
      if (ev.target.classList.contains('gc-prev')) return window.open(`11-portaldoaluno.html?curso=${id}`, '_blank');
      if (ev.target.classList.contains('gc-mods')) {
        debugModulos('Abrindo módulos para curso:', id);
        return abrirPainelModulos(id);
      }
    });

    // Atualizar o evento dos botões de módulo para usar o sistema de seleção
    document.addEventListener('click', (ev) => {
      if (ev.target.classList.contains('gc-gestao-modulo')) {
        const moduloId = ev.target.dataset.moduloId;
        const moduloTitulo = ev.target.dataset.moduloTitulo;
        mostrarSelecaoGestao(moduloId, moduloTitulo);
      }
    });

    $('#fecharModulos')?.addEventListener('click', fecharPainelModulos);
    $('#btnVoltarModulos')?.addEventListener('click', fecharPainelModulos);

    carregarCursosCompleto();
  }

  window.carregarCursosCompleto = carregarCursosCompleto;
  window.carregarModulosCursoAtual = () => cursoEditandoId ? carregarModulosCurso(cursoEditandoId) : Promise.resolve();
  document.addEventListener('DOMContentLoaded', async () => { const profile = await window.GESTOR_AUTH_READY; if (profile) wireCursosUI(); });
})();
