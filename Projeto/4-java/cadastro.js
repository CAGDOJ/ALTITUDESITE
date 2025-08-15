// Projeto/4-java/cadastro.js
import { supabase } from "./supabaseClient.js";

/* ===========================
   Seletores (1x, sem duplicar)
=========================== */
const form      = document.querySelector(".registration-form");
const nameEl    = document.getElementById("name");
const mailEl    = document.getElementById("email");
const passEl    = document.getElementById("password");
const pass2El   = document.getElementById("password2");            // opcional
const telEl     = document.getElementById("phone");                // opcional
const objEl     = document.getElementById("objective");            // opcional
const cpfEl     = document.getElementById("cpf");                  // opcional
const termsEl   = document.getElementById("terms");                // opcional (checkbox)

const emailMsg  = document.getElementById("email-msg");            // <small id="email-msg">
const passHint  = document.getElementById("pass-hint");            // <small id="pass-hint">
const pass2Hint = document.getElementById("pass2-hint");           // <small id="pass2-hint">

const btnSubmit = form?.querySelector(".btn.submit") || form?.querySelector('button[type="submit"]');

/* ===========================
   Helpers de UI
=========================== */
function setFieldState(el, ok, message = "") {
  if (!el) return;
  el.classList.remove("input-erro", "input-ok");
  if (ok === true)  el.classList.add("input-ok");
  if (ok === false) el.classList.add("input-erro");
  if (emailMsg && el === mailEl) emailMsg.textContent = message || "";
}

function msgGeral(texto, ok = false) {
  let el = document.getElementById("msg");
  if (!el && form) {
    el = document.createElement("p");
    el.id = "msg";
    el.style.marginTop = "10px";
    form.appendChild(el);
  }
  if (el) {
    el.style.color = ok ? "seagreen" : "crimson";
    el.textContent = texto;
  }
}

function setHint(el, text, state) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("ok", "err");
  if (state === "ok")  el.classList.add("ok");
  if (state === "err") el.classList.add("err");
}

/* ===========================
   Validações & Máscaras
=========================== */
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailValido = (v) => reEmail.test((v || "").trim());

// CPF
function cpfMask(v) {
  v = v.replace(/\D/g, "").slice(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
  return v;
}
function cpfValido(cpf) {
  cpf = (cpf || "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (b) => {
    let s = 0;
    for (let i = 0; i < b; i++) s += +cpf[i] * (b + 1 - i);
    const d = 11 - (s % 11);
    return d > 9 ? 0 : d;
  };
  return dv(9) === +cpf[9] && dv(10) === +cpf[10];
}
cpfEl?.addEventListener("input", () => (cpfEl.value = cpfMask(cpfEl.value)));

// Telefone (opcional): (00) 00000-0000
function phoneMask(v) {
  v = v.replace(/\D/g, "").slice(0, 11);
  if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  else if (v.length > 0) v = v.replace(/(\d{0,2})/, "($1");
  return v;
}
telEl?.addEventListener("input", () => (telEl.value = phoneMask(telEl.value)));

// Senhas iguais
const senhasConferem = () => {
  if (!pass2El) return true;
  if (!passEl?.value || !pass2El?.value) return true;
  return passEl.value === pass2El.value;
};

/* ===========================
   Olho mostrar/ocultar
=========================== */
function bindEyeToggle() {
  document.querySelectorAll(".eye-toggle").forEach((btn) => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    btn.addEventListener("click", () => {
      const showing = btn.getAttribute("aria-pressed") === "true";
      if (showing) {
        input.type = "password";
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-label", "Mostrar senha");
      } else {
        input.type = "text";
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("aria-label", "Ocultar senha");
      }
    });
  });
}
bindEyeToggle();

/* ===========================
   Validação em tempo real
=========================== */
// E-mail
mailEl?.addEventListener("input", () => {
  setFieldState(mailEl, null, "");
  if (!mailEl.value) return;
  if (emailValido(mailEl.value)) {
    setFieldState(mailEl, true, "");
  }
});

// Senhas
function checkPasswords() {
  setHint(passHint, "");
  setHint(pass2Hint, "");
  if (!passEl?.value) return;

  if (passEl.value.length < 8) {
    setHint(passHint, "Mínimo 8 caracteres.", "err");
    return;
  }

  if (pass2El?.value) {
    if (passEl.value === pass2El.value) {
      setHint(pass2Hint, "Senha válida ✔", "ok");
    } else {
      setHint(pass2Hint, "As senhas não conferem.", "err");
    }
  }
}
passEl?.addEventListener("input", checkPasswords);
pass2El?.addEventListener("input", checkPasswords);

/* ===========================
   Submit
=========================== */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgGeral("");
  setFieldState(mailEl, null, "");

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Cadastrando…";
    btnSubmit.classList.remove("btn-ok", "btn-erro");
  }

  const nome     = (nameEl?.value || "").trim();
  const email    = (mailEl?.value || "").trim();
  const senha    = passEl?.value || "";
  const telefone = (telEl?.value || "").trim();
  const objetivo = (objEl?.value || "").trim();
  const cpf      = cpfEl ? cpfEl.value : null;

  // Termos (se existir checkbox)
  if (termsEl && !termsEl.checked) {
    msgGeral("Você precisa aceitar os termos para continuar.");
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Enviar"; }
    return;
  }

  // Validações mínimas
  if (!emailValido(email)) {
    setFieldState(mailEl, false, "Formato de e-mail inválido");
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Enviar"; }
    return;
  }
  if (senha.length < 8) {
    msgGeral("A senha precisa ter pelo menos 8 caracteres.");
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Enviar"; }
    return;
  }
  if (!senhasConferem()) {
    msgGeral("As senhas não conferem.");
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Enviar"; }
    return;
  }
  if (cpfEl && !cpfValido(cpfEl.value)) {
    msgGeral("CPF inválido.");
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Enviar"; }
    return;
  }

  try {
    // 1) Auth
    const { data: su, error: e1 } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });

    if (e1) {
      const already =
        e1?.code === "auth/email_already_in_use" ||
        /already.*use|exist/i.test(e1?.message || "");
      if (already) {
        setFieldState(mailEl, false, "Este usuário já existe ❌");
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Enviar"; }
        return;
      }
      throw e1;
    }

    // 2) Garante sessão (se confirmação por e-mail estiver ativa)
    let uid = su.user?.id;
    if (!su.session) {
      const { data: login, error: eLogin } =
        await supabase.auth.signInWithPassword({ email, password: senha });
      if (eLogin) {
        msgGeral("Cadastro criado! Confirme o e‑mail e depois faça login.", true);
        if (btnSubmit) {
          btnSubmit.classList.add("btn-ok");
          btnSubmit.textContent = "Cadastro criado! Verifique seu e‑mail.";
          btnSubmit.disabled = false;
        }
        return;
      }
      uid = login.user.id;
    }

    // 3) Perfil na tabela 'alunos'
    const { error: e2 } = await supabase
      .from("alunos")
      .upsert(
        { user_id: uid, nome, email, telefone, objetivo, cpf },
        { onConflict: "user_id" }
      );
    if (e2) throw e2;

    // Sucesso
    setFieldState(mailEl, true, "");
    msgGeral("Bem‑vindo à Altitude!", true);
    if (btnSubmit) {
      btnSubmit.classList.add("btn-ok");
      btnSubmit.textContent = "Bem‑vindo à Altitude!";
    }

    setTimeout(() => {
      window.location.href = "/Projeto/1-html/portaldoaluno.html"; // ajuste sua rota
    }, 1100);
  } catch (err) {
    console.error(err);
    const texto = err?.message || err?.error_description || "Erro ao cadastrar. Tente novamente.";
    msgGeral(texto);
    if (btnSubmit) {
      btnSubmit.classList.add("btn-erro");
      btnSubmit.textContent = "Cadastro não realizado";
      btnSubmit.disabled = false;
    }
  }
});
