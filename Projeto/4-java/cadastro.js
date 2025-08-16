

window.addEventListener('DOMContentLoaded', () => {
  /* ---------- Seletores ---------- */
  const form   = document.getElementById('cadastroForm');
  const nameEl = document.getElementById('name');
  const cpfEl  = document.getElementById('cpf');
  const mailEl = document.getElementById('email');
  const p1El   = document.getElementById('password');
  const p2El   = document.getElementById('password2');
  const telEl  = document.getElementById('phone');
  const objEl  = document.getElementById('objective');
  const termsEl= document.getElementById('terms');
  const btn    = document.getElementById('submitBtn');
  const msg    = document.getElementById('msg');

  const fb = {
    name:  document.getElementById('name_fb'),
    cpf:   document.getElementById('cpf_fb'),
    email: document.getElementById('email_fb'),
    p1:    document.getElementById('pass1_fb'),
    p2:    document.getElementById('pass2_fb'),
    phone: document.getElementById('phone_fb'),
    obj:   document.getElementById('obj_fb'),
    terms: document.getElementById('terms_fb'),
  };

  /* ---------- Helpers UI ---------- */
  const setOk   = (i,el,t="Válido") => { i?.classList.remove('is-err'); i?.classList.add('is-ok'); if(el){el.textContent=t; el.className='feedback ok';} toggleSubmit(); };
  const setErr  = (i,el,t)           => { i?.classList.remove('is-ok');  i?.classList.add('is-err'); if(el){el.textContent=t; el.className='feedback err';} toggleSubmit(); };
  const setWarn = (i,el,t)           => { i?.classList.remove('is-ok','is-err'); if(el){el.textContent=t; el.className='feedback warn';} toggleSubmit(); };
  const clearFB = (i,el)             => { i?.classList.remove('is-ok','is-err'); if(el){el.textContent=''; el.className='feedback';} toggleSubmit(); };

  function toggleSubmit(){
    if (!btn) return;
    const obrigOk =
      nameEl?.classList.contains('is-ok') &&
      cpfEl?.classList.contains('is-ok') &&
      mailEl?.classList.contains('is-ok') &&
      p1El?.classList.contains('is-ok') &&
      p2El?.classList.contains('is-ok') &&
      telEl?.classList.contains('is-ok') &&
      objEl?.value !== '' &&
      !!termsEl?.checked;
    btn.disabled = !obrigOk;
  }

  /* ---------- Máscaras ---------- */
  const onlyDigits = v => (v||'').replace(/\D/g,'');
  const normCPF    = v => onlyDigits(v).slice(0,11);
  const normPhone  = v => onlyDigits(v).slice(0,11);

  function maskCPF(v){
    v = normCPF(v);
    if(v.length>9)  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/,'$1.$2.$3-$4');
    if(v.length>6)  return v.replace(/(\d{3})(\d{3})(\d{0,3})/,'$1.$2.$3');
    if(v.length>3)  return v.replace(/(\d{3})(\d{0,3})/,'$1.$2');
    return v;
  }
  function maskPhone(v){
    v = normPhone(v);
    if(v.length>6)  return v.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3');
    if(v.length>2)  return v.replace(/(\d{2})(\d{0,5})/,'($1) $2');
    return v;
  }

  /* ---------- Validações ---------- */
  function cpfValido(cpf){
    cpf = normCPF(cpf);
    if(cpf.length !== 11) return false;
    if(/^(\d)\1{10}$/.test(cpf)) return false; // 000..., 111..., etc
    const dv = b => { let s=0; for(let i=0;i<b;i++) s += +cpf[i]*(b+1-i); const d=11-(s%11); return d>9?0:d; };
    return dv(9)===+cpf[9] && dv(10)===+cpf[10];
  }
  const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  function validarNome(){ if(!nameEl.value.trim()){ setErr(nameEl, fb.name, 'Informe seu nome completo.'); return false; } setOk(nameEl, fb.name, 'Ok'); return true; }
  function validarEmail(){
    const v = mailEl.value.trim();
    if(!reEmail.test(v)){ setErr(mailEl, fb.email, 'E-mail inválido.'); return false; }
    setOk(mailEl, fb.email, 'E-mail válido'); return true;
  }
  function validarSenha1(){ if(p1El.value.length<8){ setErr(p1El, fb.p1, 'Mínimo 8 caracteres.'); return false; } setOk(p1El, fb.p1, 'Senha válida'); return true; }
  function validarSenha2(){ if(p2El.value!==p1El.value || !p2El.value){ setErr(p2El, fb.p2, 'As senhas não conferem.'); return false; } setOk(p2El, fb.p2, 'As senhas coincidem'); return true; }
  function validarPhone(){
    telEl.value = maskPhone(telEl.value);
    const d = normPhone(telEl.value);
    if(d.length!==11){ setErr(telEl, fb.phone, 'Informe DDD + número (11 dígitos).'); return false; }
    if(/^(\d)\1{10}$/.test(d)){ setErr(telEl, fb.phone, 'Telefone inválido.'); return false; }
    setOk(telEl, fb.phone, 'Telefone válido'); return true;
  }
  function validarObj(){ if(!objEl.value){ setErr(objEl, fb.obj, 'Selecione um objetivo.'); return false; } setOk(objEl, fb.obj, 'Ok'); return true; }
  function validarTerms(){ if(!termsEl.checked){ setErr(termsEl, fb.terms, 'Você precisa aceitar os termos.'); return false; } setOk(termsEl, fb.terms, 'Obrigado por aceitar.'); return true; }

  function validarCPF(){
    cpfEl.value = maskCPF(cpfEl.value);
    const d = normCPF(cpfEl.value);
    if(d.length<11){ setErr(cpfEl, fb.cpf, 'CPF incompleto.'); return false; }
    if(!cpfValido(d)){ setErr(cpfEl, fb.cpf, 'CPF inválido.'); return false; }
    setOk(cpfEl, fb.cpf, 'CPF válido'); return true;
  }

  /* ---------- Eventos em tempo real ---------- */
  nameEl?.addEventListener('input', validarNome);

  let cpfTimer=null;
  cpfEl?.addEventListener('input', ()=>{
    cpfEl.value = maskCPF(cpfEl.value);
    clearFB(cpfEl, fb.cpf);
    if(cpfTimer) clearTimeout(cpfTimer);
    cpfTimer = setTimeout(async ()=>{
      // valida formato
      if (!validarCPF()) return;
      // tenta checar duplicidade
      try{
        const { data, error } = await supabase
          .from('alunos')
          .select('user_id').eq('cpf', normCPF(cpfEl.value)).limit(1);

        if(!error && Array.isArray(data) && data.length>0){
          setErr(cpfEl, fb.cpf, 'CPF já cadastrado.');
        } else {
          setOk(cpfEl, fb.cpf, 'CPF válido');
        }
      }catch(e){
        // se não deu pra checar (RLS etc), não bloqueia: o índice único do banco segura
        setOk(cpfEl, fb.cpf, 'CPF válido');
      }
    }, 300);
  });

  mailEl?.addEventListener('input', validarEmail);
  p1El?.addEventListener('input', ()=>{ validarSenha1(); if(p2El.value) validarSenha2(); });
  p2El?.addEventListener('input', validarSenha2);
  telEl?.addEventListener('input', validarPhone);
  objEl?.addEventListener('change', validarObj);
  termsEl?.addEventListener('change', validarTerms);

  // olho mostrar/ocultar senha
  document.querySelectorAll('.eye').forEach(b=>{
    b.addEventListener('click', ()=>{
      const t=document.getElementById(b.dataset.target);
      if (!t) return;
      t.type = (t.type==='password') ? 'text' : 'password';
    });
  });

  /* ---------- Submit: salva e REDIRECIONA ---------- */
  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!btn || !msg) return;

    msg.textContent=''; btn.disabled=true; btn.textContent='Enviando…';

    // revalida rápido
    if(!validarNome()|!validarCPF()|!validarEmail()|!validarSenha1()|!validarSenha2()|!validarPhone()|!validarObj()|!validarTerms()){
      btn.disabled=false; btn.textContent='Enviar';
      return;
    }

    const nome = nameEl.value.trim();
    const email= mailEl.value.trim();
    const senha= p1El.value;
    const cpf  = normCPF(cpfEl.value);  // salva SEM máscara
    const tel  = normPhone(telEl.value);// salva SEM máscara
    const objetivo = objEl.value || null;

    try{
      // 1) AUTH
      const { data: su, error: e1 } = await supabase.auth.signUp({
        email, password: senha, options:{ data:{ nome } }
      });
      if(e1) throw e1;

      // 2) sessão (se confirmation ON, pode vir sem sessão)
      let uid = su.user?.id;
      if(!su.session){
        const { data: login, error: eLogin } =
          await supabase.auth.signInWithPassword({ email, password: senha });
        if(eLogin){
          btn.classList.add('btn-ok'); btn.textContent='Cadastro criado! Verifique o e-mail.';
          msg.style.color='#2e8b57'; msg.textContent='Confirme o e-mail e depois faça login.';
          btn.disabled=false;
          return;
        }
        uid = login.user.id;
      }

      // 3) PERFIL (banco) — UNIQUE/Checks garantem integridade
      const { error: e2 } = await supabase.from('alunos').upsert(
        { user_id: uid, nome, email, telefone: tel, objetivo, cpf },
        { onConflict: 'user_id' }
      );
      if(e2){
        if(e2.code==='23505'){ setErr(cpfEl, fb.cpf, 'CPF já cadastrado.'); }
        throw e2;
      }

      // 4) OK visual + REDIRECT
      btn.classList.remove('btn-erro'); btn.classList.add('btn-ok');
      btn.textContent='Bem-vindo à Altitude!';
      msg.style.color='#2e8b57';
      msg.textContent='Cadastro concluído. Redirecionando…';

      setTimeout(()=>{
        // AJUSTE O CAMINHO ABAIXO PARA SUA PÁGINA DE DESTINO:
        window.location.href = "/Projeto/1-html/portaldoaluno.html";
      }, 1100);

    }catch(err){
      console.error(err);
      btn.disabled=false; btn.textContent='Enviar'; btn.classList.add('btn-erro');
      msg.style.color='#cc1f1f';
      msg.textContent = err?.message || err?.error_description || 'Erro ao cadastrar.';
    }
  });

  // estado inicial
  toggleSubmit();
});