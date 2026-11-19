
import { QUESTOES_BASE } from "./questoes-v25.js?v=25.2";

const $ = (root, selector) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const norm = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim();
const dateIso = (add = 0) => {const d = new Date();d.setDate(d.getDate()+add);return d.toISOString().slice(0,10);};
const dateBR = value => {if (!value) return "—";const d=new Date(value.length===10 ? value+"T12:00:00":value);return Number.isFinite(d.getTime())? d.toLocaleDateString("pt-BR"):"—";};
const pct = (correct,total) => total>0 ? Math.round(correct*1000/total)/10 : null;
const levelNames=["Nunca estudei","Já tive contato","Já estudei","Sei resolver questões"];
const levels=[0,1,2,3];
const empty = () => ({self:{}, diagnosticAt:null, baselineObjective:null, sessions:[], customQuestions:[], reviews:[], pdfs:[], config:{weeks:12,minutes:90,days:6}, updatedAt:new Date().toISOString()});
const STORAGE = "ev_study_v25_";
const MAX_IMPORT = 1500;

function group(area) {
  const s=norm(area);
  if (/PORTUGU|LINGUA PORTUGUESA|GRAMATICA|INTERPRETACAO|REDA[CÇ]AO/.test(s)) return "Língua Portuguesa";
  if (/RACIOCINIO LOGICO|LOGICA|LOGICO MATEMATICO/.test(s)) return "Raciocínio Lógico";
  if (/MATEMATICA|ARITMETICA|ESTATISTICA/.test(s)) return "Matemática";
  if (/INFORMATICA|TECNOLOGIA DA INFORMACAO|COMPUTACAO|SEGURANCA DA INFORMACAO/.test(s)) return "Informática";
  if (/CONSTITUCIONAL/.test(s)) return "Direito Constitucional";
  if (/ADMINISTRATIVO|LICITACAO|SERVIDORES PUBLICOS/.test(s)) return "Direito Administrativo";
  if (/ADMINISTRACAO PUBLICA|GESTAO PUBLICA|ADMINISTRACAO GERAL|GESTAO DE PESSOAS/.test(s)) return "Administração Pública";
  if (/ETICA/.test(s)) return "Ética no Serviço Público";
  return s;
}
function questionsForArea(area, state) {
  const sought=group(area);
  return [...QUESTOES_BASE,...(state.customQuestions||[])].filter(q=>group(q.disciplina)===sought);
}
function uniqueAreas(topics) {
  const counts = new Map();
  for(const t of topics||[]) {
    const area=String(t.area||"Conteúdo programático").trim();
    counts.set(area,(counts.get(area)||0)+1);
  }
  return [...counts].map(([name,count])=>({name,count}));
}
function dbOpen() {
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB) return reject(new Error("Armazenamento de PDFs não suportado neste navegador."));
    const request=indexedDB.open("ev_study_pdfs_v25",1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("pdfs"))request.result.createObjectStore("pdfs");};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function dbPdf(mode,key,value) {
  const db=await dbOpen();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction("pdfs",mode==="read"?"readonly":"readwrite");
    const store=tx.objectStore("pdfs");
    const req=mode==="write"?store.put(value,key):mode==="delete"?store.delete(key):store.get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>db.close();
    tx.onerror=()=>db.close();
  });
}
export function setupStudyV25(opts) {
  const content=document.querySelector(".content");
  if(!content) return {refresh(){},render(){}};
  const root=document.createElement("section");
  root.id="view-estudar";
  root.className="view";
  content.appendChild(root);
  const nav=document.createElement("button");
  nav.type="button";
  nav.dataset.view="estudar";
  nav.textContent="▤ Plano + Questões";
  nav.addEventListener("click",()=>opts.navigate("estudar"));
  document.querySelector(".side .nav")?.appendChild(nav);
  let activeKey="";
  let activeUser="";
  let state=empty();
  let stage="diagnostico";
  let quiz=null;
  let pdfUrl=null;
  let pdfName="";
  let savePending=Promise.resolve();
  let loadingKey="";
  let syncMessage="Salvo neste dispositivo";
  let profile=null;
  let selfDraft={};

  const getAreas=()=>uniqueAreas(opts.getTopics());
  const getKey=()=>String(opts.getEditalKey()||"");
  const getUserId=()=>opts.getUser()?.id||"local";
  const storageKey=(key=activeKey,user=activeUser)=>STORAGE+user+"::"+key;
  const getQuestions=()=>[...QUESTOES_BASE,...(state.customQuestions||[])];

  function save() {
    state.updatedAt=new Date().toISOString();
    try{localStorage.setItem(storageKey(),JSON.stringify(state));}catch(err){console.warn("Salvar diagnóstico:",err.message);}
    const client=opts.getStudyClient();
    const user=opts.getUser();
    if(client&&user&&activeKey){
      const snapshot=JSON.parse(JSON.stringify(state)), key=activeKey, uid=user.id;
      savePending=savePending.catch(()=>{}).then(async()=>{
        const {error}=await client.from("planos_concurso").upsert({
          user_id:uid,edital_key:key,dados:snapshot,atualizado_em:snapshot.updatedAt
        },{onConflict:"user_id,edital_key"});
        if(error){console.warn("Sincronização dos estudos:",error.message);syncMessage="Salvo neste dispositivo (sem sincronização)";}
        else syncMessage="Sincronizado com a conta";
      });
    }
  }
  async function load(key,user) {
    activeKey=key; activeUser=user; quiz=null; stage="diagnostico"; selfDraft={}; profile=null;
    try{state={...empty(),...JSON.parse(localStorage.getItem(storageKey(key,user))||"{}")};}catch{state=empty();}
    const client=opts.getStudyClient();
    const current=opts.getUser();
    if(client&&current){
      try{
        const {data,error}=await client.from("planos_concurso").select("dados,atualizado_em")
          .eq("user_id",current.id).eq("edital_key",key).maybeSingle();
        if(!error&&data?.dados){
          const cloud={...empty(),...data.dados};
          if(new Date(cloud.updatedAt||0)>new Date(state.updatedAt||0)){
            state=cloud;
            localStorage.setItem(storageKey(key,user),JSON.stringify(state));
          }
          syncMessage="Sincronizado com a conta";
        }else if(error)syncMessage="Salvo neste dispositivo (sem sincronização)";
      }catch(e){console.warn("Carregamento do plano:",e.message);}
    }
    selfDraft={...state.self};
    if(state.diagnosticAt)stage="plano";
    if(key===activeKey&&user===activeUser)render();
    fetchProfile().catch(()=>{});
  }
  async function fetchProfile() {
    const client=opts.getPortalClient();
    if(!client)return;
    try{
      const {data:{user}}=await client.auth.getUser();
      if(!user)return;
      const {data:aluno}=await client.from("alunos").select("nome,ra").eq("user_id",user.id).maybeSingle();
      if(aluno)profile={nome:aluno.nome,ra:aluno.ra};
      if(profile){
        // Leitura opcional e restrita ao próprio usuário, no banco original
        // ALTITUDE. Não replica CPF, contatos, pagamentos ou notas.
        try{
          const {data:matriculas,error:matriculasErro}=await client.from("matriculas")
            .select("curso_id").eq("aluno_id",user.id).limit(100);
          if(!matriculasErro)profile.cursos=matriculas?.length||0;
          const {data:resultados,error:resultadosErro}=await client.from("resultados_provas")
            .select("curso_id,aprovado").eq("aluno_id",user.id).eq("aprovado",true).limit(100);
          if(!resultadosErro)profile.concluidos=new Set((resultados||[]).map(x=>x.curso_id)).size;
        }catch(_e){/* Perfil acadêmico opcional. */}
        render();
      }
    }catch(e){console.warn("Perfil opcional ALTITUDE:",e.message);}
  }
  function refresh() {
    const key=getKey(),user=getUserId();
    if(!key){activeKey="";quiz=null;render();return;}
    if(key!==activeKey||user!==activeUser){
      const requestId=key+"::"+user;
      if(loadingKey===requestId)return;
      loadingKey=requestId;
      load(key,user).finally(()=>{if(loadingKey===requestId)loadingKey="";});
    }else render();
  }
  function setStage(next) {
    if(!state.diagnosticAt&&next!=="diagnostico"){stage="diagnostico";render();return;}
    stage=next;quiz=null;render();
  }
  function statCard(label,value,sub,className="") {
    return '<div class="v25-stat"><small>'+esc(label)+'</small><strong class="'+esc(className)+'">'+esc(value)+'</strong><em>'+esc(sub)+'</em></div>';
  }
  function intro() {
    return '<div class="v25-lead"><small>ALTITUDE · EDITAL VERTICAL</small><h2>Estudo organizado para concursos</h2>'+
      '<div>Diagnóstico, questões comentadas, leitura de PDFs e revisões em um plano de 2 a 6 meses.</div>'+
      '<small>'+(profile?.nome?"Aluno: "+esc(profile.nome)+(profile.ra?" · RA "+esc(profile.ra):"")+" · ":"")+
      "Cargo: "+esc(opts.getCargo()||"Não selecionado")+
      (profile?.cursos!==undefined?" · "+profile.cursos+" matrícula(s) ALTITUDE":"")+
      (profile?.concluidos!==undefined?" · "+profile.concluidos+" curso(s) aprovados":"")+
      " · "+esc(syncMessage)+'</small></div>';
  }
  function eligibleQuiz() {
    const all=getAreas(), used=new Set(), out=[];
    for(const area of all){
      for(const q of questionsForArea(area.name,state)){
        if(used.has(q.id))continue;
        out.push(q);used.add(q.id);break;
      }
    }
    for(const area of all){
      for(const q of questionsForArea(area.name,state)){
        if(used.has(q.id))continue;
        out.push(q);used.add(q.id);
        if(out.length>=10)return out;
      }
    }
    return out.slice(0,10);
  }
  function renderDiagnosis(){
    const areas=getAreas();
    if(!areas.length)return '<div class="v25-panel"><h3>Primeiro carregue um edital</h3><p>Selecione o PDF e o cargo, para que a avaliação use as disciplinas corretas.</p><button class="v25-action" data-action="upload-edital">Enviar edital</button></div>';
    let html='<div class="v25-panel"><h3>1. Avaliação inicial de conhecimento</h3>'+
      '<p>Antes de montar seu cronograma, informe sua familiaridade com cada disciplina. Essa autoavaliação <b>não é nota de prova</b>; ela serve para priorizar o estudo.</p>'+
      '<div class="v25-table-scroll"><table class="v25-table"><thead><tr><th>Conhecimento / disciplina</th><th>Tópicos</th><th>Situação inicial</th><th>Questões disponíveis</th></tr></thead><tbody>';
    for(const area of areas) {
      const nivel=selfDraft[area.name], options=levelNames.map((n,i)=>'<option value="'+i+'" '+(nivel===i?"selected":"")+'>'+esc(n)+'</option>').join("");
      html+='<tr><td><strong>'+esc(area.name)+'</strong></td><td>'+area.count+'</td><td><select data-assess="'+esc(area.name)+'">'+
        '<option value="" '+(nivel===undefined?"selected":"")+'>Selecione...</option>'+options+'</select></td><td>'+
        questionsForArea(area.name,state).length+' autorais</td></tr>';
    }
    html+='</tbody></table></div><p class="v25-tiny">Selecione todas as disciplinas. O teste prático aparecerá quando houver questões compatíveis com o edital.</p>'+
      '<div class="v25-actions"><button class="v25-action" data-action="save-diagnostic">Continuar avaliação</button></div></div>';
    if(state.diagnosticAt)html+='<div class="v25-panel"><b>Avaliação registrada em '+dateBR(state.diagnosticAt)+'</b><p>Você pode refazê-la para reorganizar suas prioridades, mas o diagnóstico original ficará registrado no histórico de sessões objetivas.</p></div>';
    return html;
  }
  function renderOverview() {
    const areas=getAreas(), sessions=state.sessions.filter(x=>x.type!=="diagnostico"),answered=sessions.reduce((a,b)=>a+(b.total||0),0),correct=sessions.reduce((a,b)=>a+(b.correct||0),0);
    const baseline=state.baselineObjective?.score;
    const current=pct(correct,answered);
    let improvement="—",cls="";
    if(baseline!=null&&current!=null){const delta=Math.round((current-baseline)*10)/10;improvement=(delta>0?"+":"")+delta+" p.p.";cls=delta>0?"good":delta<0?"bad":"";}
    return '<div class="v25-stats">'+statCard("Diagnóstico inicial",baseline==null?"Sem nota":baseline+"%",baseline==null?"Autoavaliação registrada":"Questões objetivas no início")+
      statCard("Prática depois do diagnóstico",current==null?"—":current+"%",answered+" questões respondidas")+
      statCard("Evolução versus diagnóstico",improvement,baseline==null?"Sem base objetiva comparável":"Comparação de amostras diferentes",cls)+
      statCard("Revisões pendentes",state.reviews.filter(r=>!r.done&&r.when<=dateIso()).length,"Revisões para hoje ou atrasadas")+
      '</div>';
  }
  function priorities() {
    const areas=getAreas(), sessions=state.sessions.filter(x=>x.type!=="diagnostico");
    return areas.map((a)=>{
      const relevant=sessions.filter(s=>group(s.area)===group(a.name));
      const answered=relevant.reduce((sum,s)=>sum+s.total,0), correct=relevant.reduce((sum,s)=>sum+s.correct,0);
      const accuracy=pct(correct,answered), level=Number(state.self[a.name]??0);
      const priority=(4-level)*1.4+(accuracy==null?1.7:(100-accuracy)/17)+Math.log2(1+a.count)*.25;
      return {...a,level,answered,correct,accuracy,priority};
    }).sort((a,b)=>b.priority-a.priority);
  }
  function renderPlan(){
    const c=state.config||{weeks:12,minutes:90,days:6};
    const pr=priorities();
    const weekly=(c.minutes*c.days)/60;
    const actions=[];
    for(let i=0;i<14;i++) {
      const day=new Date();day.setDate(day.getDate()+i);
      if(day.getDay()===0&&c.days<7)continue;
      const target=pr[i%Math.max(1,pr.length)];
      if(!target)continue;
      const week=Math.floor(i/7)+1,activity=i%7===5?"Questões + revisão":i%7===2?"Questões comentadas":"PDF/teoria + prática";
      actions.push('<div class="v25-step"><small><b>'+dateBR(dateIso(i))+'</b><br>Semana '+week+'</small>'+
        '<div><strong>'+esc(target.name)+'</strong><div class="v25-tiny">'+activity+' · '+c.minutes+' min</div></div>'+
        '<button class="v25-action secondary" data-action="study-area" data-area="'+esc(target.name)+'">Estudar</button></div>');
    }
    return '<div class="v25-panel"><h3>2. Seu plano de estudos</h3><p>Prioridades calculadas pela familiaridade inicial, quantidade de tópicos e acertos reais nas questões. Quanto mais erros, maior a frequência da disciplina.</p>'+
      '<div class="v25-form-row"><div><label>Duração do plano</label><select id="v25-weeks">'+[8,12,16,24].map(x=>'<option value="'+x+'" '+(c.weeks===x?'selected':'')+'>'+x+' semanas ('+Math.round(x/4.3)+' meses aprox.)</option>').join('')+'</select></div>'+
      '<div><label>Minutos por dia</label><select id="v25-minutes">'+[30,60,90,120,180].map(x=>'<option value="'+x+'" '+(c.minutes===x?'selected':'')+'>'+x+' min</option>').join('')+'</select></div>'+
      '<div><label>Dias por semana</label><select id="v25-days">'+[4,5,6,7].map(x=>'<option value="'+x+'" '+(c.days===x?'selected':'')+'>'+x+' dias</option>').join('')+'</select></div></div>'+
      '<div class="v25-actions" style="margin-top:12px"><button class="v25-action" data-action="save-plan">Atualizar plano</button></div>'+
      '<p class="v25-tiny">Meta: '+weekly.toFixed(1)+' h/semana · '+Math.round(weekly*c.weeks)+' h em '+c.weeks+' semanas. Metas de tempo, não promessa de aprovação.</p></div>'+
      '<div class="v25-panel"><h3>Próximos blocos de estudo</h3><div class="v25-steps">'+actions.join('')+'</div></div>'+
      '<div class="v25-panel"><h3>Disciplinas prioritárias</h3><div class="v25-table-scroll"><table class="v25-table"><thead><tr><th>Disciplina</th><th>Tópicos</th><th>Conhecimento inicial</th><th>Acertos pós-diagnóstico</th></tr></thead><tbody>'+
      pr.map(a=>'<tr><td><b>'+esc(a.name)+'</b></td><td>'+a.count+'</td><td>'+esc(levelNames[a.level])+'</td><td>'+(a.accuracy==null?'Sem questões':a.accuracy+'% ('+a.answered+')')+'</td></tr>').join('')+
      '</tbody></table></div></div>';
  }
  function renderQuestionHome() {
    const areas=getAreas();
    const available=areas.filter(a=>questionsForArea(a.name,state).length);
    return '<div class="v25-panel"><h3>3. Banco de questões comentadas</h3>'+
      '<p>Treine por disciplina. As respostas são corrigidas na hora, com explicação, e passam a alimentar a análise de desempenho. Questões desta base são <b>autorais</b>, não provas oficiais.</p>'+
      '<div class="v25-form-row"><div><label>Disciplina</label><select id="v25-area">'+
      '<option value="">Todas as disponíveis</option>'+available.map(a=>'<option>'+esc(a.name)+'</option>').join('')+'</select></div>'+
      '<div><label>Quantidade</label><select id="v25-count"><option value="5">5 questões</option><option value="10" selected>10 questões</option><option value="20">20 questões</option></select></div>'+
      '<div><label>Tipo</label><select id="v25-mode"><option value="pratica">Prática comentada</option><option value="simulado">Simulado</option></select></div></div>'+
      '<div class="v25-actions" style="margin-top:13px"><button class="v25-action" data-action="start-practice">Começar questões</button><button class="v25-action secondary" data-action="tab" data-tab="banco">Adicionar questões</button></div>'+
      '<p class="v25-tiny">'+available.length+' disciplinas do edital com perguntas disponíveis, '+getQuestions().length+' questões no banco total. Temas não cobertos não receberão notas inventadas.</p></div>';
  }
  function renderQuiz() {
    if(!quiz)return "";
    const q=quiz.items[quiz.index];
    const answered=quiz.current!==null;
    const choices=(q.alternativas||[]).map((item,i)=>'<label><input type="radio" name="v25-answer" value="'+i+'" '+(quiz.current===i?"checked":"")+' '+(answered?"disabled":"")+'><span><b>'+String.fromCharCode(65+i)+'.</b> '+esc(item)+'</span></label>').join('');
    const feedback=answered?'<div class="v25-explain"><strong>'+(quiz.current===Number(q.correta)?"Resposta correta!":"Resposta incorreta.")+'</strong>'+
      '<p>Gabarito: <b>'+String.fromCharCode(65+Number(q.correta))+'</b>. '+esc(q.explicacao||"")+'</p></div>':"";
    return '<div class="v25-panel"><span class="v25-pill">'+(quiz.type==="diagnostico"?"Diagnóstico inicial":quiz.type==="simulado"?"Simulado":"Prática")+'</span>'+
      '<h3 style="margin-top:9px">Questão '+(quiz.index+1)+' de '+quiz.items.length+'</h3>'+
      '<div class="v25-question"><small class="muted">'+esc(q.disciplina)+' · '+esc(q.assunto)+' · '+esc(q.fonte||"Autoral")+'</small>'+
      '<h3 style="margin-top:12px">'+esc(q.enunciado)+'</h3>'+choices+feedback+'</div>'+
      '<div class="v25-actions">'+(answered?'<button class="v25-action" data-action="next-question">'+(quiz.index+1===quiz.items.length?"Finalizar avaliação":"Próxima questão")+'</button>':'<button class="v25-action" data-action="check-answer">Responder</button>')+
      '</div></div>';
  }
  function renderRevisions() {
    const items=[...state.reviews].sort((a,b)=>a.when.localeCompare(b.when));
    const due=items.filter(x=>!x.done),done=items.filter(x=>x.done);
    return '<div class="v25-panel"><h3>4. Revisões espaçadas</h3><p>Ao concluir um bloco, marque a disciplina como estudada: o sistema agenda revisões para 1, 7 e 21 dias depois. Em cada revisão, responda questões do tema.</p>'+
      '<div class="v25-form-row"><div><label>Disciplina estudada</label><select id="v25-review-area">'+getAreas().map(a=>'<option>'+esc(a.name)+'</option>').join('')+'</select></div></div>'+
      '<div class="v25-actions" style="margin-top:12px"><button class="v25-action" data-action="mark-studied">Concluí um bloco hoje</button></div></div>'+
      '<div class="v25-panel"><h3>Próximas revisões</h3><div class="v25-steps">'+
      (due.length?due.slice(0,35).map(x=>'<div class="v25-step"><span class="v25-pill">'+dateBR(x.when)+'</span><div><strong>'+esc(x.area)+'</strong><div class="v25-tiny">'+(x.when<=dateIso()?"Pendente":"Agendada")+'</div></div><button class="v25-action secondary" data-action="review-done" data-id="'+esc(x.id)+'">Revisado</button></div>').join(''):'<p>Nenhuma revisão agendada. Marque o primeiro bloco estudado.</p>')+'</div><p class="v25-tiny">'+done.length+' revisões concluídas</p></div>';
  }
  function renderEvolution(){
    const areas=getAreas();
    return '<div class="v25-panel"><h3>5. Evolução por disciplina</h3><p>O quadro mostra número de questões, acertos, erros, percentual e mudança em pontos percentuais. A comparação inicial depende de ter respondido questões diagnósticas da mesma disciplina.</p>'+
      '<div class="v25-table-scroll"><table class="v25-table"><thead><tr><th>Conhecimento / disciplina</th><th>Estado inicial</th><th>Questões</th><th>Certas</th><th>Erradas</th><th>Desempenho</th><th>Média das sessões</th><th>Melhora ou queda</th></tr></thead><tbody>'+
      areas.map(a=>{
        const sessions=state.sessions.filter(s=>s.type!=="diagnostico" && group(s.area)===group(a.name));
        const answered=sessions.reduce((t,s)=>t+s.total,0),correct=sessions.reduce((t,s)=>t+s.correct,0);
        const current=pct(correct,answered),initial=state.baselineObjective?.areas?.[group(a.name)]?.score;
        const media=sessions.length?Math.round(sessions.reduce((sum,item)=>sum+100*(item.correct/item.total),0)*10/sessions.length)/10:null;
        const delta=initial==null||current==null?null:Math.round((current-initial)*10)/10;
        return '<tr><td><b>'+esc(a.name)+'</b></td><td>'+esc(levelNames[state.self[a.name]]||"—")+'</td><td>'+answered+'</td><td>'+correct+'</td><td>'+(answered-correct)+'</td><td>'+(current===null?"—":current+"%")+'</td><td>'+(media===null?"—":media+"%")+'</td><td>'+(delta===null?"Sem comparação":(delta>0?"+":"")+delta+" p.p.")+'</td></tr>';
      }).join('')+'</tbody></table></div><p class="v25-tiny">A autoavaliação e o resultado objetivo são medidas diferentes. Não são tratados como a mesma nota.</p></div>'+
      '<div class="v25-panel"><h3>Últimas sessões</h3>'+(state.sessions.length?'<div class="v25-steps">'+[...state.sessions].reverse().slice(0,20).map(s=>'<div class="v25-step"><span>'+dateBR(s.at)+'</span><span>'+esc(s.area||"Múltiplas disciplinas")+' · '+esc(s.type)+'</span><strong>'+s.correct+'/'+s.total+' ('+pct(s.correct,s.total)+'%)</strong></div>').join('')+'</div>':'<p>Você ainda não respondeu questões.</p>')+'</div>';
  }
  function renderMethods() {
    return '<div class="v25-panel"><h3>Como estudar gastando pouco</h3>'+
      '<div class="v25-methods">'+[
      ["PDF + leitura ativa","Leia 20 minutos. Anote 3 ideias essenciais sem copiar tudo. Resuma com suas próprias palavras."],
      ["Questões comentadas","Resolva 5 a 15 questões por disciplina. Leia a explicação até das respostas corretas."],
      ["Caderno de erros","Revisite matérias em que os erros se repetem. Volte ao PDF correspondente."],
      ["Repetição espaçada","Reveja o tópico em D+1, D+7 e D+21; comece cada revisão lembrando sem olhar."],
      ["Simulado semanal","Uma vez por semana responda questões com tempo definido e registre o percentual de acertos."],
      ["Revisão ativa por assunto","Escolha um tópico e tente explicá-lo sem consultar o PDF; confira depois e marque lacunas."]
      ].map(a=>'<div class="v25-method"><b>'+esc(a[0])+'</b><p>'+esc(a[1])+'</p></div>').join('')+
      '</div></div>';
  }
  function pdfId(id){return activeUser+"::"+activeKey+"::"+id;}
  function renderPdfs(){
    return '<div class="v25-panel"><h3>Materiais de estudo em PDF</h3><p>Adicione apostilas, resumos e materiais permitidos e vincule cada um a uma disciplina. Os PDFs ficam neste dispositivo; o progresso é sincronizado quando a conexão com o banco funciona.</p>'+
      '<div class="v25-form-row"><div><label>Nome do material</label><input id="v25-pdf-title" placeholder="Ex.: Resumo de Português"></div>'+
      '<div><label>Disciplina</label><select id="v25-pdf-area">'+getAreas().map(a=>'<option>'+esc(a.name)+'</option>').join('')+'</select></div>'+
      '<div><label>PDF</label><input type="file" id="v25-pdf-file" accept="application/pdf,.pdf"></div></div>'+
      '<div class="v25-actions" style="margin-top:12px"><button class="v25-action" data-action="add-pdf">Guardar PDF no dispositivo</button></div></div>'+
      '<div class="v25-panel"><h3>Minha biblioteca</h3>'+
      (state.pdfs.length?state.pdfs.map(x=>'<div class="v25-step"><span class="v25-pill">PDF local</span><div><strong>'+esc(x.title)+'</strong><div class="v25-tiny">'+esc(x.area)+'</div></div><div class="v25-actions"><button class="v25-action secondary" data-action="open-pdf" data-id="'+esc(x.id)+'">Ler PDF</button><button class="v25-action secondary" data-action="delete-pdf" data-id="'+esc(x.id)+'">Excluir</button></div></div>').join(''):'<p>Não há PDFs anexados neste dispositivo.</p>')+
      (pdfUrl?'<div class="v25-pdf" style="margin-top:12px"><b>'+esc(pdfName)+'</b><iframe id="v25-pdf-frame" title="Leitor de PDF" src="'+esc(pdfUrl)+'"></iframe><button class="v25-action secondary" data-action="close-pdf">Fechar leitura</button></div>':'')+
      '</div>';
  }
  function renderBank(){
    return '<div class="v25-panel"><h3>Banco de questões do aluno</h3>'+
      '<p>Além das '+QUESTOES_BASE.length+' questões autorais iniciais, você pode montar seu próprio banco com gabarito e explicação. Nada depende de uma API paga.</p>'+
      '<form id="v25-question-form" class="v25-form">'+
      '<div class="v25-form-row"><div><label>Disciplina</label><select name="disciplina">'+getAreas().map(a=>'<option>'+esc(a.name)+'</option>').join('')+'</select></div>'+
      '<div><label>Assunto</label><input name="assunto" required maxlength="120" placeholder="Ex.: Concordância"></div>'+
      '<div><label>Gabarito</label><select name="correta"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div></div>'+
      '<div><label>Enunciado</label><textarea name="enunciado" required rows="3" placeholder="Escreva a pergunta"></textarea></div>'+
      '<div class="v25-form-row"><div><label>Alternativa A</label><input name="a" required></div><div><label>Alternativa B</label><input name="b" required></div><div><label>Alternativa C</label><input name="c" required></div></div>'+
      '<div><label>Alternativa D</label><input name="d" required></div><div><label>Explicação do gabarito</label><textarea name="explicacao" rows="2" required></textarea></div>'+
      '<button class="v25-action" type="submit">Adicionar ao banco</button></form>'+
      '<hr style="border:0;border-top:1px solid #e5ebf3;margin:18px 0">'+
      '<p><b>Importar questões JSON</b>: arquivo com lista de objetos contendo disciplina, assunto, enunciado, alternativas (4 opções), correta (0=A a 3=D) e explicacao. Máximo de '+MAX_IMPORT+' questões por importação.</p>'+
      '<div class="v25-actions"><input type="file" id="v25-import-file" accept=".json,application/json"><button class="v25-action secondary" data-action="import-questions">Importar JSON</button></div>'+
      '<p class="v25-tiny">'+(state.customQuestions||[]).length+' questões personalizadas cadastradas. A origem das questões deve ser respeitada; não importe conteúdo protegido sem autorização.</p></div>';
  }
  function render(){
    if(!root)return;
    if(!activeKey||!opts.getTopics().length){
      root.innerHTML='<div class="v25-study">'+intro()+'<div class="v25-panel"><h3>Comece pelo seu edital</h3><p>Envie o edital em PDF, confirme o cargo e gere a verticalização. Depois, o diagnóstico inicial libera plano e questões.</p><button class="v25-action" data-action="upload-edital">Carregar edital em PDF</button></div></div>';
      return;
    }
    let inner=intro();
    if(quiz)inner+=renderQuiz();
    else if(!state.diagnosticAt)inner+=renderDiagnosis();
    else{
      inner+=renderOverview();
      inner+='<div class="v25-tabs">'+[["plano","Cronograma"],["questoes","Resolver questões"],["revisoes","Revisões"],["pdf","Estudar por PDF"],["evolucao","Evolução"],["metodos","Métodos"],["banco","Banco de questões"],["diagnostico","Diagnóstico"]].map(t=>'<button data-action="tab" data-tab="'+t[0]+'" class="'+(stage===t[0]?"active":"")+'">'+t[1]+'</button>').join('')+'</div>';
      inner+=stage==="plano"?renderPlan():stage==="questoes"?renderQuestionHome():stage==="revisoes"?renderRevisions():stage==="pdf"?renderPdfs():stage==="evolucao"?renderEvolution():stage==="metodos"?renderMethods():stage==="banco"?renderBank():renderDiagnosis();
    }
    root.innerHTML='<div class="v25-study">'+inner+'</div>';
  }
  function startQuiz(type,area="",count=10){
    const items=area?questionsForArea(area,state):getAreas().flatMap(a=>questionsForArea(a.name,state));
    const unique=[...new Map(items.map(q=>[q.id,q])).values()];
    const shuffled=unique.sort(()=>Math.random()-.5).slice(0,count);
    if(!shuffled.length){alert("Ainda não há questões para esta disciplina. Adicione ao banco de questões e tente novamente.");return;}
    quiz={type,area:area||"Múltiplas disciplinas",items:shuffled,index:0,current:null,answers:[]};
    render();root.scrollIntoView({behavior:"smooth",block:"start"});
  }
  function checkAnswer(){
    if(!quiz)return;
    const selected=$ (root,'input[name="v25-answer"]:checked');
    if(!selected){alert("Marque uma alternativa antes de responder.");return;}
    const q=quiz.items[quiz.index];
    const picked=Number(selected.value),ok=picked===Number(q.correta);
    quiz.current=picked;
    quiz.answers.push({questionId:q.id,area:q.disciplina,assunto:q.assunto,chosen:picked,correct:ok});
    render();
  }
  function nextQuestion(){
    if(!quiz||quiz.current===null)return;
    if(quiz.index+1<quiz.items.length){quiz.index++;quiz.current=null;render();return;}
    const ended=quiz;
    quiz=null;
    const correct=ended.answers.filter(x=>x.correct).length,total=ended.items.length;
    const snapshot={type:ended.type,area:ended.area,correct,total,at:new Date().toISOString(),answers:ended.answers};
    state.sessions.push(snapshot);
    if(ended.type!=="diagnostico")opts.onQuestionResult?.(ended.answers);
    if(ended.type==="diagnostico"){
      const areaGroups={};
      for(const ans of ended.answers){
        const area=group(ans.area);
        if(!areaGroups[area])areaGroups[area]={correct:0,total:0};
        areaGroups[area].total++;
        if(ans.correct)areaGroups[area].correct++;
      }
      for(const stats of Object.values(areaGroups))stats.score=pct(stats.correct,stats.total);
      state.baselineObjective={score:pct(correct,total),total,areas:areaGroups};
      state.diagnosticAt=new Date().toISOString();
      stage="plano";
    }else stage="evolucao";
    save();render();
    alert("Avaliação concluída: "+correct+" acertos em "+total+" questões ("+pct(correct,total)+"%).");
  }
  async function saveDiagnostic(){
    const areas=getAreas();
    if(areas.some(a=>selfDraft[a.name]===undefined)){
      alert("Avalie todas as disciplinas antes de continuar.");return;
    }
    state.self=Object.fromEntries(areas.map(a=>[a.name,Number(selfDraft[a.name])]));
    const available=eligibleQuiz();
    if(available.length){
      quiz={type:"diagnostico",area:"Múltiplas disciplinas",items:available,index:0,current:null,answers:[]};
      render();
    }else{
      state.diagnosticAt=new Date().toISOString();
      state.baselineObjective=null;
      save();stage="plano";render();
      alert("Nenhuma questão autoral do banco corresponde às disciplinas deste edital. Plano liberado com base na autoavaliação, sem inventar nota objetiva.");
    }
  }
  async function savePdf(){
    const file=$ (root,"#v25-pdf-file")?.files?.[0];
    if(!file || !(file.type==="application/pdf"||/\.pdf$/i.test(file.name))){alert("Escolha um arquivo PDF.");return;}
    if(file.size>40*1024*1024){alert("Para economizar espaço no dispositivo, envie PDFs de até 40 MB.");return;}
    const title=$ (root,"#v25-pdf-title")?.value.trim()||file.name;
    const area=$ (root,"#v25-pdf-area")?.value||"Geral";
    const id=crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+Math.random();
    try{
      await dbPdf("write",pdfId(id),file);
      state.pdfs.push({id,title,area,size:file.size,createdAt:new Date().toISOString()});
      save();render();
    }catch(err){alert("O PDF não pôde ser salvo neste dispositivo: "+err.message);}
  }
  async function openPdf(id) {
    const meta=state.pdfs.find(x=>x.id===id);
    if(!meta)return;
    try{
      const file=await dbPdf("read",pdfId(id));
      if(!file){alert("O arquivo está em outro dispositivo. Envie o PDF novamente neste navegador.");return;}
      if(pdfUrl)URL.revokeObjectURL(pdfUrl);
      pdfUrl=URL.createObjectURL(file);pdfName=meta.title;stage="pdf";render();
    }catch(e){alert("Não foi possível ler o arquivo local: "+e.message);}
  }
  function closePdf(){if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=null;pdfName="";render();}
  async function addQuestion(form) {
    const fd=new FormData(form);
    const get=n=>String(fd.get(n)||"").trim();
    const alternatives=["a","b","c","d"].map(get);
    if(!alternatives.every(Boolean)||!get("enunciado")||!get("assunto")||!get("explicacao"))return;
    state.customQuestions.push({
      id:"user-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()),
      disciplina:get("disciplina"),assunto:get("assunto"),enunciado:get("enunciado"),
      alternativas,correta:Number(get("correta")),explicacao:get("explicacao"),fonte:"Questão inserida pelo usuário"
    });
    save();render();alert("Questão cadastrada no seu banco.");
  }
  function validQuestion(q) {
    return q && typeof q.disciplina==="string"&&typeof q.enunciado==="string"&&q.enunciado.trim().length>=8&&
      typeof q.assunto==="string" && Array.isArray(q.alternativas) && q.alternativas.length===4 &&
      q.alternativas.every(x=>typeof x==="string" && x.trim()) &&
      [0,1,2,3].includes(Number(q.correta)) && typeof q.explicacao==="string";
  }
  async function importQuestions(){
    const file=$ (root,"#v25-import-file")?.files?.[0];
    if(!file){alert("Selecione o arquivo JSON.");return;}
    if(file.size>2*1024*1024){alert("O arquivo ultrapassa o limite de 2 MB.");return;}
    try{
      const data=JSON.parse(await file.text());
      if(!Array.isArray(data)||data.length>MAX_IMPORT||!data.every(validQuestion))throw Error("Formato inválido; use lista JSON com os campos documentados.");
      const normalized=data.map(x=>({...x,id:"import-"+(crypto.randomUUID?crypto.randomUUID():Math.random()),correta:Number(x.correta),fonte:"Importada pelo usuário"}));
      state.customQuestions=[...state.customQuestions,...normalized].slice(-MAX_IMPORT);
      save();render();alert(normalized.length+" questões importadas.");
    }catch(e){alert("Importação não concluída: "+e.message);}
  }
  async function handleAction(action,element) {
    if(action==="upload-edital"){opts.navigate("novo");return;}
    if(action==="tab"){setStage(element.dataset.tab);return;}
    if(action==="save-diagnostic"){saveDiagnostic();return;}
    if(action==="check-answer"){checkAnswer();return;}
    if(action==="next-question"){nextQuestion();return;}
    if(action==="start-practice"){
      const area=$ (root,"#v25-area")?.value||"";
      const count=Number($ (root,"#v25-count")?.value||10);
      const type=$ (root,"#v25-mode")?.value||"pratica";
      startQuiz(type,area,count);return;
    }
    if(action==="save-plan"){
      state.config={weeks:Number($(root,"#v25-weeks").value),minutes:Number($(root,"#v25-minutes").value),days:Number($(root,"#v25-days").value)};
      save();render();return;
    }
    if(action==="study-area"){stage="questoes";render();const selected=$(root,"#v25-area");if(selected)selected.value=element.dataset.area||"";return;}
    if(action==="mark-studied"){
      const area=$ (root,"#v25-review-area")?.value;
      if(!area)return;
      const id=crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+Math.random();
      for(const days of [1,7,21])state.reviews.push({id:id+"-"+days,area,when:dateIso(days),done:false});
      save();render();return;
    }
    if(action==="review-done"){
      const item=state.reviews.find(x=>x.id===element.dataset.id);
      if(item){item.done=true;item.doneAt=new Date().toISOString();save();render();}
      return;
    }
    if(action==="add-pdf"){await savePdf();return;}
    if(action==="open-pdf"){await openPdf(element.dataset.id);return;}
    if(action==="close-pdf"){closePdf();return;}
    if(action==="delete-pdf"){
      const id=element.dataset.id;
      if(!confirm("Excluir este PDF deste dispositivo?"))return;
      await dbPdf("delete",pdfId(id)).catch(()=>{});
      state.pdfs=state.pdfs.filter(x=>x.id!==id);save();closePdf();return;
    }
    if(action==="import-questions"){await importQuestions();return;}
  }
  root.addEventListener("click",async event=>{
    const button=event.target.closest("[data-action]");
    if(button){event.preventDefault();await handleAction(button.dataset.action,button);}
  });
  root.addEventListener("change",event=>{
    const el=event.target;
    if(el.matches("[data-assess]") && el.value!=="") selfDraft[el.dataset.assess]=Number(el.value);
  });
  root.addEventListener("submit",async event=>{
    if(event.target.id==="v25-question-form"){event.preventDefault();await addQuestion(event.target);}
  });
  render();
  return {refresh,render,openTab(tab){stage=tab;opts.navigate("estudar");render();}};
}
