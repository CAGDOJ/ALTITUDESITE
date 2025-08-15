import { supabase } from "../4-java/supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
  const form    = document.querySelector(".registration-form");
  if (!form) return;

  // Campos
  const nameEl  = document.getElementById("name");
  const mailEl  = document.getElementById("email");
  const passEl  = document.getElementById("password");
  const pass2El = document.getElementById("password2");
  const telEl   = document.getElementById("phone");
  const objEl   = document.getElementById("objective");
  const cpfEl   = document.getElementById("cpf");
  const termsEl = document.getElementById("accept-terms");

  // Mensagens/elementos auxiliares
  const emailMsg = document.getElementById("email-msg");
  const btnSubmit= form.querySelector(".btn.submit");
  const errPass  = document.getElementById("err-password");
  const errPass2 = document.getElementById("err-password2");
  const matchOk  = document.getElementById("match-ok");
  const errCpf   = document.getElementById("err-cpf");
  const errPhone = document.getElementById("err-phone");
  const errTerms = document.getElementById("err-terms");

  // ========== Helpers UI ==========
  function setFieldState(el, ok, message = "") {
    if (!el) return;
    el.classList.remove("input-erro", "input-ok");
    if (ok === true)  el.classList.add("input-ok");
    if (ok === false) el.classList.add("input-erro");
    if (emailMsg && el === mailEl) emailMsg.textContent = message || "";
  }
  function msgGeral(texto, ok = false) {
    let el = document.getElementById("msg");
    if (!el) { el = document.createElement("p"); el.id = "msg"; form.appendChild(el); }
    el.style.color = ok ? "seagreen" : "crimson";
    el.textContent = texto;
  }

  // ========== Validações ==========
  const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailValido = (v)=> reEmail.test((v||"").trim());

  // CPF
  function cpfMask(v){
    v = v.replace(/\D/g,'').slice(0,11);
    if (v.length > 9)  v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, '$1.$2');
    return v;
  }
  function cpfValido(cpf){
    cpf = (cpf||'').replace(/\D/g,'');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    const dv = (b)=>{ let s=0; for(let i=0;i<b;i++) s += +cpf[i]*(b+1-i); const d=11-(s%11); return d>9?0:d; };
    return dv(9)===+cpf[9] && dv(10)===+cpf[10];
  }
  cpfEl?.addEventListener("input", ()=>{ cpfEl.value = cpfMask(cpfEl.value); errCpf.textContent = ""; });
  cpfEl?.addEventListener("blur", ()=>{ if (!cpfValido(cpfEl.value)) errCpf.textContent = "CPF inválido."; });

  // Telefone (BR — (00) 00000-0000) com DDD
  function phoneMask(v){
    v = v.replace(/\D/g,'').slice(0,11);
    if (v.length > 6)  v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    else if (v.length > 0) v = v.replace(/(\d{0,2})/, '($1');
    return v;
  }
  function phoneValido(v){
    const n = (v||'').replace(/\D/g,'');
    return n.length === 11; // 2 DDD + 9 dígitos
  }
  telEl?.addEventListener("input", ()=>{ telEl.value = phoneMask(telEl.value); errPhone.textContent = ""; });
  telEl?.addEventListener("blur", ()=>{ if (!phoneValido(telEl.value)) errPhone.textContent = "Telefone inválido (use DDD + 9 dígitos)."; });

  // Senhas (feedback ✔️)
  function checkPasswords(){
    errPass.textContent = "";
    errPass2.textContent = "";
    matchOk.textContent = "";
    if (!passEl.value && !pass2El.value) return;
    if (passEl.value && passEl.value.length < 8){
      errPass.textContent = "Mínimo 8 caracteres.";
      return;
    }
    if (pass2El.value && passEl.value !== pass2El.value){
      errPass2.textContent = "As senhas não conferem.";
      return;
    }
    if (passEl.value && pass2El.value && passEl.value === pass2El.value){
      matchOk.textContent = "Senha Válida ✔️";
      matchOk.classList.add("ok");
    }
  }
  passEl?.addEventListener("input", checkPasswords);
  pass2El?.addEventListener("input", checkPasswords);

  // Mostrar/ocultar senha (olho)
  document.querySelectorAll(".eye-toggle").forEach((btn)=>{
    const input = document.getElementById(btn.dataset.target);
    btn.addEventListener("click", ()=>{
      const pressed = btn.getAttribute("aria-pressed")==="true";
      if (pressed){
        input.type = "password";
        btn.setAttribute("aria-pressed","false");
        btn.setAttribute("aria-label","Mostrar senha");
      }else{
        input.type = "text";
        btn.setAttribute("aria-pressed","true");
        btn.setAttribute("aria-label","Ocultar senha");
      }
    });
  });

  // ========== Submit ==========
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    msgGeral(""); setFieldState(mailEl,null,""); errTerms.textContent="";

    if (!termsEl?.checked){
      errTerms.textContent = "Você deve aceitar os termos.";
      return;
    }
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Cadastrando…";

    const nome     = nameEl.value.trim();
    const email    = mailEl.value.trim();
    const senha    = passEl.value;
    const telefone = telEl.value.trim();
    const objetivo = objEl.value.trim();
    const cpf      = cpfEl.value.trim();

    // checagens finais
    if (!emailValido(email)){ setFieldState(mailEl,false,"Formato de e-mail inválido"); resetBtn(); return; }
    if (senha.length < 8){ msgGeral("A senha precisa ter pelo menos 8 caracteres."); resetBtn(); return; }
    if (pass2El.value !== senha){ msgGeral("As senhas não conferem."); resetBtn(); return; }
    if (!cpfValido(cpf)){ msgGeral("CPF inválido."); resetBtn(); return; }
    if (!phoneValido(telefone)){ msgGeral("Telefone inválido (use DDD + 9 dígitos)."); resetBtn(); return; }

    try{
      // 1) cria no Auth
      const { data: su, error: e1 } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      });
      if (e1){
        const exists = e1?.code==="auth/email_already_in_use" || /already.*use|exist/i.test(e1?.message||"");
        if (exists){ setFieldState(mailEl,false,"Este usuário já existe ❌"); resetBtn(); return; }
        throw e1;
      }

      // 2) garante sessão (se confirmação por e-mail estiver ativa)
      let uid = su.user?.id;
      if (!su.session){
        const { data: login, error: eLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (eLogin){
          msgGeral("Cadastro criado! Confirme o e-mail e depois faça login.", true);
          btnSubmit.classList.add("btn-ok"); btnSubmit.textContent="Verifique seu e-mail"; btnSubmit.disabled=false;
          return;
        }
        uid = login.user.id;
      }

      // 3) grava/atualiza perfil
      const { error: e2 } = await supabase
        .from("alunos")
        .upsert({ user_id: uid, nome, email, telefone, objetivo, cpf }, { onConflict: "user_id" });
      if (e2) throw e2;

      // sucesso
      setFieldState(mailEl,true,"");
      msgGeral("Bem-vindo à Altitude!", true);
      btnSubmit.classList.add("btn-ok");
      btnSubmit.textContent = "Bem-vindo à Altitude!";

      setTimeout(()=>{ window.location.href = "/Projeto/1-html/portaldoaluno.html"; }, 1200);

    }catch(err){
      console.error(err);
      msgGeral("Erro ao cadastrar. Tente novamente.");
      btnSubmit.classList.add("btn-erro");
      btnSubmit.textContent = "Cadastro não realizado";
      btnSubmit.disabled = false;
    }

    function resetBtn(){
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Enviar";
    }
  });
});
