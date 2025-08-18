
/* ======= PORTALDOALUNO PATCH (RA + CPF + NOME SEM ACENTO) =======
   Use: colocar DEPOIS do <script src="./4-java/portaldoaluno.js"> no HTML.
   Este patch não remove nada do original — só corrige/completa:
   - fetchMeSupabase(): busca/adota/cria em public.alunos e sincroniza RA/CPF/NOME
   - renderProfile(): preenche CPF + RA em todos os lugares
   - Botão "Salvar": grava nome (MAIÚSCULO/SEM ACENTO), telefone e CPF na tabela 'alunos'
*/ 

(function(){
  // utilitários (não conflitam: só criam se não existir)
  window.onlyDigits = window.onlyDigits || function(s){ return (s||'').replace(/\D/g,''); };
  window.sanitizeUpperASCII = window.sanitizeUpperASCII || function(str){
    const map = {'Á':'A','À':'A','Ã':'A','Â':'A','Ä':'A','É':'E','È':'E','Ê':'E','Ë':'E','Í':'I','Ì':'I','Î':'I','Ï':'I','Ó':'O','Ò':'O','Õ':'O','Ô':'O','Ö':'O','Ú':'U','Ù':'U','Û':'U','Ü':'U','Ç':'C',
                 'á':'A','à':'A','ã':'A','â':'A','ä':'A','é':'E','è':'E','ê':'E','ë':'E','í':'I','ì':'I','î':'I','ï':'I','ó':'O','ò':'O','õ':'O','ô':'O','ö':'O','ú':'U','ù':'U','û':'U','ü':'U','ç':'C'};
    return (str||'').split('').map(ch=>map[ch]||ch).join('').toUpperCase();
  };
  function maskCPF(v){
    const d = onlyDigits(v).slice(0,11);
    return d.replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  // helper seguro de pegar elemento
  function el(id){ return document.getElementById(id); }

  // ========== PATCH DE RENDER (mostra RA/CPF) ==========
  const _renderProfile = window.renderProfile;
  window.renderProfile = function(){
    if(!_renderProfile) return; // se original não carregou ainda
    _renderProfile();
    try{
      if(window.state){
        // RA em todos os lugares
        if(el('brandRA')) el('brandRA').textContent = window.state.auth?.ra || '—';
        if(el('pfRA'))    el('pfRA').value         = window.state.auth?.ra || '';
        if(el('cardRA'))  el('cardRA').textContent = window.state.auth?.ra || '—';
        // CPF mascarado
        if(el('pfCPF'))   el('pfCPF').value = maskCPF(window.state.perfil?.cpf||'');
      }
    }catch(e){ console.error(e); }
  };

  // ========== FETCH DO PERFIL (busca/adota/cria + RA) ==========
  window.fetchMeSupabase = async function(){
    try{
      if(!window.supa){ console.warn('Supabase client (supa) não encontrado.'); return; }
      const { data:{ user } } = await supa.auth.getUser();
      if(!user){ if(window.toast) toast('Faça login para continuar.'); return; }
      window.state = window.state || { auth:{}, perfil:{} };
      state.auth.id = user.id;

      // 1) tenta achar por user_id
      let { data: me, error } = await supa
        .from('alunos')
        .select('id,user_id,ra,nome,telefone,cpf,data_nascimento,email,"e-mail",criado_em')
        .eq('user_id', user.id)
        .maybeSingle();
      if(error) throw error;

      // 2) senão, tenta por e-mail (email e "e-mail") e adota (liga o user_id)
      if(!me){
        let r = await supa.from('alunos')
          .select('id,user_id,ra,nome,telefone,cpf,data_nascimento,email,"e-mail",criado_em')
          .eq('email', user.email).maybeSingle();
        me = r.data || null;
        if(!me){
          r = await supa.from('alunos')
            .select('id,user_id,ra,nome,telefone,cpf,data_nascimento,email,"e-mail",criado_em')
            .eq('e-mail', user.email).maybeSingle();
          me = r.data || null;
        }
        if(me && !me.user_id){
          await supa.from('alunos')
            .update({ user_id: user.id, email: user.email, "e-mail": user.email })
            .eq('id', me.id);
        }
      }

      // 3) se ainda não existir, cria (trigger gera RA)
      if(!me){
        const ins = { user_id:user.id, email:user.email, "e-mail":user.email, nome: state.perfil?.nome || 'NOVO ALUNO' };
        const cre = await supa.from('alunos')
          .insert(ins)
          .select('id,user_id,ra,nome,telefone,cpf,data_nascimento,email,"e-mail",criado_em')
          .single();
        if(cre.error) throw cre.error;
        me = cre.data;
      }

      // 4) sincroniza estado
      state.auth.email        = me.email || me["e-mail"] || user.email;
      state.auth.ra           = me.ra || '';
      state.auth.registeredAt = me.criado_em || null;
      state.perfil.nome       = me.nome || state.perfil.nome || '';
      state.perfil.telefone   = me.telefone || state.perfil.telefone || '';
      state.perfil.cpf        = me.cpf || state.perfil.cpf || '';
      if(window.save) save();
      if(window.renderProfile) renderProfile();
    }catch(e){
      console.error(e);
      if(window.toast) toast('Erro ao carregar perfil.');
    }
  };

  // ========== SALVAR PERFIL (NOME MAIÚSCULO SEM ACENTO + CPF) ==========
  function attachSave(){
    const btn = el('btnSalvarPerfil');
    if(!btn) return;
    btn.onclick = async function(){
      try{
        const nomeUp    = sanitizeUpperASCII((el('pfNome')?.value||'').trim());
        const telDigits = onlyDigits(el('pfTel')?.value||'');
        const cpfDigits = onlyDigits(el('pfCPF')?.value||'');

        if(window.state){
          state.perfil.nome     = nomeUp;
          state.perfil.telefone = telDigits;
          state.perfil.cpf      = cpfDigits;
          if(window.save) save();
          if(window.renderProfile) renderProfile();
        }

        if(!window.supa){ if(window.toast) toast('Sem conexão com o banco.'); return; }
        const { error } = await supa.from('alunos').update({
          nome: nomeUp, telefone: telDigits || null, cpf: cpfDigits || null,
          email: state.auth?.email || null, "e-mail": state.auth?.email || null
        }).eq('user_id', state.auth?.id);
        if(error) throw error;
        if(window.toast) toast('Perfil salvo!');
      }catch(e){
        console.error(e);
        if(window.toast) toast('Erro ao salvar.');
      }
    };
  }

  // máscara do CPF no input do perfil, se existir
  function attachCPFMask(){
    const i = el('pfCPF'); if(!i) return;
    i.addEventListener('input', e=>{
      const caret = e.target.selectionStart, oldLen = e.target.value.length;
      e.target.value = maskCPF(e.target.value);
      const newLen = e.target.value.length;
      e.target.selectionStart = e.target.selectionEnd = caret + (newLen - oldLen);
    });
  }

  // inicialização
  document.addEventListener('DOMContentLoaded', ()=>{
    attachSave();
    attachCPFMask();
    // se já existir session/state, reaplica render
    if(window.renderProfile) renderProfile();
  });
})();
