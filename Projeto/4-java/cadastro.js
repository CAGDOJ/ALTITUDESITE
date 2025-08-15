// =============================================================
// cadastro.js
// - Validações em tempo real (email, CPF, telefone, senhas)
// - Botão “olho” (mostrar/ocultar senha)
// - Criação do usuário (Supabase Auth) e upsert na tabela "alunos"
// - Feedback no botão e mensagem geral + redirecionamento
// - IMPORTANTE: este arquivo importa o supabaseClient.js via ES Module.
//   NÃO insira <script> separado para supabaseClient no HTML.
// =============================================================

import { supabase } from "./supabaseClient.js"; // importa client criado UMA ÚNICA VEZ

/* =========================
   SELETORES
========================= */
const form     = document.querySelector(".registration-form");
const nameEl   = document.getElementById("name");
const cpfEl    = document.getElementById("cpf");
const mailEl   = document.getElementById("email");
const passEl   = document.getElementById("password");
const pass2El  = document.getElementById("password2");
const telEl    = document.getElementById("phone");
const objEl    = document.getElementById("objective");
const termsEl  = document.getElementById("terms");

// Hints (mensagens abaixo dos inputs)
const cpfHint   = document.getElementById("cpf-hint");
const emailHint = document.getElementById("email-msg");
const passHint  = document.getElementById("pass-hint");
const pass2Hint = document.getElementById("pass2-hint");
const phoneHint = document.getElementById("phone-hint");
const termsHint = document.getElementById("terms-hint");

// Botão e mensagem geral
const btnSubmit  = form.querySelector(".btn.submit");
const msgGeralEl = document.getElementById("msg");

/* =========================
   HELPERS DE UI
========================= */
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // valida email básico

function setHint(el, text = "", state = "") {
  if (!el) return;
  el.classList.remove("ok", "err");
  el.textContent = text;
  if (state) el.classList.add(state); // "ok" (verde) ou "err" (vermelho)
}

function setFieldState(el, ok) {
  if (!el) return;
  el.classList.remove("input-ok", "input-erro");
  if (ok === true)  el.classList.add("input-ok");
  if (ok === false) el.classList.add("input-erro");
}

function msgGeral(text, ok = false) {
  msgGeralEl.textContent = text || "";
  msgGeralEl.style.color = ok ? "#17a673" : "#d9534f";
}

function loading(on){
  if (!btnSubmit) return;
  btnSubmit.disabled = !!on;
  btnSubmit.textContent = on ? "Enviando..." : "Enviar";
  btnSubmit.classList.remove("btn-ok","btn-erro");
}

/* =========================
   MÁSCARAS E VALIDAÇÕES
========================= */
// CPF
function cpfMask(v){
  v = (v || "").replace(/\D/g, "").slice(0, 11);
  if (v.length > 9)  v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
  return v;
}
function cpfValido(cpf){
  cpf = (cpf || "").replace(/\D/g,"");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (b)=>{ let s=0; for(let i=0;i<b;i++) s += +cpf[i]*(b+1-i); const d=11-(s%11); return d>9?0:d; };
  return dv(9)===+cpf[9] && dv(10)===+cpf[10];
}
cpfEl?.addEventListener("input", ()=>{
  cpfEl.value = cpfMask(cpfEl.value);
  setHint(cpfHint, "");
  setFieldState(cpfEl, null);
});
cpfEl?.addEventListener("blur", ()=>{
  if (!cpfEl.value) return;
  const ok = cpfValido(cpfEl.value);
  setFieldState(cpfEl, ok);
  setHint(cpfHint, ok ? "CPF válido ✔" : "CPF inválido.", ok ? "ok" : "err");
});

// Telefone (formato (00) 00000-0000)
function phoneMask(v){
  v = (v || "").replace(/\D/g, "").slice(0, 11);
  if (v.length > 6)  v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  else if (v.length > 0) v = v.replace(/(\d{0,2})/, "($1");
  return v;
}
telEl?.addEventListener("input", ()=>{
  telEl.value = phoneMask(telEl.value);
  setHint(phoneHint, "");
  setFieldState(telEl, null);
});
telEl?.addEventListener("blur", ()=>{
  if (!telEl.value) return;
  const ok = /\(\d{2}\)\s\d{5}-\d{4}/.test(telEl.value);
  setFieldState(telEl, ok);
  setHint(phoneHint, ok ? "Telefone válido ✔" : "Informe DDD + número (11 dígitos).", ok ? "ok" : "err");
});

// E-mail
mailEl?.addEventListener("input", ()=>{
  setHint(emailHint,"");
  setFieldState(mailEl, null);
});
mailEl?.addEventListener("blur", ()=>{
  if (!mailEl.value) return;
  const ok = reEmail.test(mailEl.value.trim());
  setFieldState(mailEl, ok);
  setHint(emailHint, ok ? "E-mail válido ✔" : "Formato inválido.", ok ? "ok" : "err");
});

// Senhas (mensagem “Senha válida ✔” no primeiro campo; “Senhas conferem ✔” no segundo)
function checkPasswords(){
  setHint(passHint, "");
  setHint(pass2Hint,"");

  if (!passEl?.value) return;

  if (passEl.value.length < 8){
    setHint(passHint, "Mínimo 8 caracteres.", "err");
    setFieldState(passEl, false);
    return;
  }
  // senha principal válida
  setHint(passHint, "Senha válida ✔", "ok");
  setFieldState(passEl, true);

  // confirmação (se houver)
  if (pass2El?.value){
    if (passEl.value === pass2El.value){
      setHint(pass2Hint, "Senhas conferem ✔", "ok");
      setFieldState(pass2El, true);
    } else{
      setHint(pass2Hint, "As senhas não conferem.", "err");
      setFieldState(pass2El, false);
    }
  }
}
passEl?.addEventListener("input", checkPasswords);
pass2El?.addEventListener("input", checkPasswords);

// Botão do olho (mostrar/ocultar senha)
function bindEyeToggle(){
  document.querySelectorAll(".eye-toggle").forEach(btn=>{
    const target = document.getElementById(btn.dataset.target);
    btn.addEventListener("click", ()=>{
      const show = btn.getAttribute("aria-pressed")==="true";
      if (show){
        target.type = "password";                 // volta a esconder
        btn.setAttribute("aria-pressed","false");
        btn.setAttribute("aria-label","Mostrar senha");
      } else {
        target.type = "text";                     // mostra senha
        btn.setAttribute("aria-pressed","true");
        btn.setAttribute("aria-label","Ocultar senha");
      }
    });
  });
}
bindEyeToggle();

/* =========================
   SUBMISSÃO DO FORMULÁRIO
========================= */
form?.addEventListener("submit", async (e)=>{
  e.preventDefault();     // evita reload
  msgGeral("");           // limpa mensagem geral
  loading(true);          // botão “Enviando...”

  // Captura valores
  const nome     = (nameEl?.value || "").trim();
  const email    = (mailEl?.value || "").trim();
  const senha    = passEl?.value || "";
  const telefone = (telEl?.value || "").trim();
  const objetivo = (objEl?.value || "").trim();
  const cpf      = (cpfEl?.value || "").trim();

  // Validações mínimas
  if (!reEmail.test(email)){
    setFieldState(mailEl,false);
    setHint(emailHint,"Formato de e-mail inválido.","err");
    loading(false); return;
  }
  if (senha.length < 8){
    setFieldState(passEl,false);
    setHint(passHint,"Mínimo 8 caracteres.","err");
    loading(false); return;
  }
  if (pass2El && pass2El.value !== senha){
    setFieldState(pass2El,false);
    setHint(pass2Hint,"As senhas não conferem.","err");
    loading(false); return;
  }
  if (cpfEl && !cpfValido(cpf)){
    setFieldState(cpfEl,false);
    setHint(cpfHint,"CPF inválido.","err");
    loading(false); return;
  }
  if (telEl && !/\(\d{2}\)\s\d{5}-\d{4}/.test(telefone)){
    setFieldState(telEl,false);
    setHint(phoneHint,"Informe DDD + número (11 dígitos).","err");
    loading(false); return;
  }
  if (!termsEl?.checked){
    setHint(termsHint,"Você precisa aceitar os termos para continuar.","err");
    loading(false); return;
  } else {
    setHint(termsHint,"");
  }

  try{
    // 1) Cria usuário no Auth do Supabase
    const { data: su, error: e1 } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } } // guarda “nome” também no user_metadata
    });

    // Trata e-mail já existente
    if (e1){
      const jaExiste = e1?.code === "auth/email_already_in_use" || /already.*(use|exist)/i.test(e1?.message||"");
      if (jaExiste){
        setFieldState(mailEl,false);
        setHint(emailHint,"Este usuário já existe ❌","err");
        loading(false);
        return;
      }
      throw e1;
    }

    // 2) Garante sessão (se “email confirmation” estiver ativo, pode não haver)
    let uid = su.user?.id;
    if (!su.session){
      const { data: login, error: eLogin } =
        await supabase.auth.signInWithPassword({ email, password: senha });
      if (eLogin){
        // sem sessão: avisa e devolve controle
        btnSubmit.classList.add("btn-ok");
        msgGeral("Cadastro criado! Confirme o e‑mail e depois faça login.", true);
        loading(false);
        return;
      }
      uid = login.user.id;
    }

    // 3) Upsert na tabela public.alunos (1:1 user_id)
    const { error: e2 } = await supabase
      .from("alunos")
      .upsert(
        { user_id: uid, nome, email, telefone, objetivo, cpf },
        { onConflict: "user_id" }
      );
    if (e2) throw e2;

    // 4) Sucesso: feedback visual + redirecionar
    setFieldState(mailEl,true);
    btnSubmit.classList.add("btn-ok");
    msgGeral("Bem‑vindo à Altitude!", true);

    setTimeout(()=>{
      // Ajuste esta rota para o seu portal real
      window.location.href = "/Projeto/1-html/portaldoaluno.html";
    }, 1100);

  } catch(err){
    // Tratamento de erro genérico
    console.error(err);
    btnSubmit.classList.add("btn-erro");
    msgGeral(err?.message || err?.error_description || "Erro ao cadastrar. Tente novamente.");
    loading(false);
  }
});
