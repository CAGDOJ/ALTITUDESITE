import { supabase } from "./supabaseClient.js";

// pega o form
const form   = document.querySelector(".registration-form");
const nameEl = document.querySelector("#name");
const mailEl = document.querySelector("#email");
const passEl = document.querySelector("#password");
const telEl  = document.querySelector("#phone");
const objEl  = document.querySelector("#objective");

// alvo para msg do e-mail
const emailMsg = document.getElementById("email-msg");

// helpers de UI
function setFieldState(el, ok, message = "") {
  if (!el) return;
  el.classList.remove("input-erro", "input-ok");
  if (ok === true)  el.classList.add("input-ok");
  if (ok === false) el.classList.add("input-erro");
  if (emailMsg && el === mailEl) emailMsg.textContent = message || "";
}

function msgGeral(texto, ok = false) {
  let el = document.getElementById("msg");
  if (!el) {
    el = document.createElement("p");
    el.id = "msg";
    el.style.marginTop = "10px";
    form.appendChild(el);
  }
  el.style.color = ok ? "seagreen" : "crimson";
  el.textContent = texto;
}

// -------- E-MAIL --------
function emailBasicoValido(email){
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email) 
    ? { ok:true }
    : { ok:false, reason:"Formato de e-mail inválido" };
}

// -------- Mostrar/Ocultar Senhas --------
document.querySelectorAll(".toggle-pass").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const targetId = btn.getAttribute("data-target");
    const input = document.getElementById(targetId);
    if (input.type === "password") {
      input.type = "text";
      btn.textContent = "🙈";
    } else {
      input.type = "password";
      btn.textContent = "👁️";
    }
  });
});

// -------- Verifica senhas em tempo real --------
const passEl = document.getElementById("password");
const pass2El = document.getElementById("password2");
const ePass2 = document.getElementById("err-password2");

pass2El.addEventListener("input", ()=>{
  if (pass2El.value && passEl.value !== pass2El.value) {
    ePass2.textContent = "As senhas não conferem.";
  } else {
    ePass2.textContent = "";
  }
});


// limpando estados enquanto digita
mailEl?.addEventListener("input", () => setFieldState(mailEl, null, ""));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgGeral("");
  setFieldState(mailEl, null, "");

  const btn = form.querySelector(".btn.submit") || form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

  const nome     = nameEl.value.trim();
  const email    = mailEl.value.trim();
  const senha    = passEl.value;
  const telefone = telEl.value.trim();
  const objetivo = objEl.value.trim();

  try {
    // 1) cria conta no Auth (senha fica só no Auth)
    const { data: su, error: e1 } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });

    if (e1) {
      // trata e-mail já cadastrado com feedback visual no campo
      const already =
        e1?.code === "auth/email_already_in_use" ||
        /already.*use|exist/i.test(e1?.message || "");

      if (already) {
        setFieldState(mailEl, false, "Este usuário já existe ❌");
        msgGeral(""); // sem alerta global, só o inline
        return;
      }

      throw e1; // outros erros seguem o fluxo normal
    }

    // 2) garanta que há sessão (se confirmação de e‑mail estiver ON, signUp.session pode ser null)
    let uid = su.user?.id;
    if (!su.session) {
      const { data: login, error: eLogin } =
        await supabase.auth.signInWithPassword({ email, password: senha });
      if (eLogin) {
        // se usar TRIGGER no banco, o perfil já foi criado; sem sessão, não conseguimos gravar mais campos
        msgGeral("Cadastro criado! Confirme o e‑mail e depois faça login.", true);
        return;
      }
      uid = login.user.id;
    }

    // 3) grava/atualiza perfil em public.alunos (1:1 com user_id)
    //    Se você usa TRIGGER no banco, prefira UPDATE para evitar conflito/duplicidade.
    const USE_TRIGGER = false; // <-- troque para true se você ativou a trigger no banco

    let e2;
    if (USE_TRIGGER) {
      ({ error: e2 } = await supabase
        .from("alunos")
        .update({ nome, email, telefone, objetivo })
        .eq("user_id", uid));
    } else {
      ({ error: e2 } = await supabase
        .from("alunos")
        .upsert({ user_id: uid, nome, email, telefone, objetivo }, { onConflict: "user_id" }));
    }
    if (e2) throw e2;

    setFieldState(mailEl, true, "");
    msgGeral("Cadastro concluído! Redirecionando…", true);

    setTimeout(() => {
      // ajuste a rota desejada:
      // location.href = "/area-aluno/index.html";
      form.reset();
    }, 900);

  } catch (err) {
    console.error(err);
    const texto = err?.message || err?.error_description || "Erro ao cadastrar. Tente novamente.";
    msgGeral(texto);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
  }

  
// ===== CPF máscara e validação =====
const cpfEl   = document.getElementById('cpf');
const eCpf    = document.getElementById('err-cpf');

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
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos iguais
  const dv = (b)=> {
    let s=0; for(let i=0;i<b;i++) s += +cpf[i]*(b+1-i);
    const d = 11-(s%11); return d>9?0:d;
  };
  return dv(9)===+cpf[9] && dv(10)===+cpf[10];
}

cpfEl?.addEventListener('input', ()=>{
  cpfEl.value = cpfMask(cpfEl.value);
  eCpf.textContent = '';
});
cpfEl?.addEventListener('blur', ()=>{
  const cheio = cpfEl.value.replace(/\D/g,'').length === 11;
  if (!cheio) { eCpf.textContent = 'CPF incompleto.'; return; }
  if (!cpfValido(cpfEl.value)) eCpf.textContent = 'CPF inválido.';
});

// ===== Mostrar senha (pressionar e segurar) =====
function bindPeekButtons(){
  document.querySelectorAll('.peek').forEach(btn=>{
    const id = btn.dataset.target;
    const input = document.getElementById(id);
    // Pressiona = mostra; Solta = oculta
    const show = ()=>{ input.type='text';  btn.textContent='Ocultando…'; };
    const hide = ()=>{ input.type='password'; btn.textContent='Mostrar';  };
    btn.addEventListener('mousedown', show);
    btn.addEventListener('touchstart', show, {passive:true});
    ['mouseup','mouseleave','touchend','touchcancel','blur'].forEach(evt=>{
      btn.addEventListener(evt, hide);
    });
  });
}
bindPeekButtons();

// ===== Senhas iguais/diferentes em tempo real =====
const passEl  = document.getElementById('password');
const pass2El = document.getElementById('password2');
const ePass   = document.getElementById('err-password');
const ePass2  = document.getElementById('err-password2');
const matchOk = document.getElementById('match-ok');

function checkPasswords(){
  ePass.textContent = '';
  ePass2.textContent = '';
  matchOk.textContent = '';
  if (!passEl.value || !pass2El.value) return;
  if (passEl.value.length < 8) {
    ePass.textContent = 'Mínimo 8 caracteres.';
    return;
  }
  if (passEl.value !== pass2El.value) {
    ePass2.textContent = 'As senhas não conferem.';
  } else {
    matchOk.textContent = '✔️';
  }
}
passEl?.addEventListener('input',  checkPasswords);
pass2El?.addEventListener('input', checkPasswords);

// ===== E-mail: aceitar qualquer domínio válido =====
function emailBasicoValido(email){
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) ? {ok:true} : {ok:false, reason:'Formato de e-mail inválido'};
}
// (se você já tinha essa função, pode substituir por essa)

});
