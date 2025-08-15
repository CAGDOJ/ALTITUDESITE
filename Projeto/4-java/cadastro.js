
import { supabase } from "./supabaseClient.js";

// ---------- Seletores (1 só vez; nada duplicado) ----------
const form    = document.querySelector(".registration-form");
const nameEl  = document.getElementById("name");
const mailEl  = document.getElementById("email");
const passEl  = document.getElementById("password");
const pass2El = document.getElementById("password2"); // se não tiver no HTML, mantenha null
const telEl   = document.getElementById("phone");
const objEl   = document.getElementById("objective");
const cpfEl   = document.getElementById("cpf");

const emailMsg = document.getElementById("email-msg");
const btnSubmit = form?.querySelector(".btn.submit") || form?.querySelector('button[type="submit"]');

// ---------- Helpers de UI ----------
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

// ---------- Validações rápidas ----------
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailValido(v) {
  return reEmail.test((v||"").trim());
}

// CPF máscara + validação (opcional; só roda se existir no HTML)
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
  const dv = (b)=> {
    let s=0; for(let i=0;i<b;i++) s += +cpf[i]*(b+1-i);
    const d = 11-(s%11); return d>9?0:d;
  };
  return dv(9)===+cpf[9] && dv(10)===+cpf[10];
}

cpfEl?.addEventListener('input', ()=> { cpfEl.value = cpfMask(cpfEl.value); });

// Senhas iguais (se houver confirmação no HTML)
function senhasConferem() {
  if (!pass2El) return true; // se não tem campo de confirmação, pula
  if (!passEl?.value || !pass2El?.value) return true;
  return passEl.value === pass2El.value;
}

// ---------- Submit ----------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgGeral("");
  setFieldState(mailEl, null, "");

  // UI: desabilita botão
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = "Cadastrando…"; }

  const nome     = (nameEl?.value || "").trim();
  const email    = (mailEl?.value || "").trim();
  const senha    = passEl?.value || "";
  const telefone = (telEl?.value || "").trim();
  const objetivo = (objEl?.value || "").trim();
  const cpf      = cpfEl ? cpfEl.value : null;

  // Validações mínimas
  if (!emailValido(email)) {
    setFieldState(mailEl, false, "Formato de e-mail inválido");
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Enviar"; }
    return;
  }
  if (passEl && senha.length < 8) {
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
    // 1) Cria usuário no Auth
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

    // 2) Garante sessão (se email confirmation estiver ligado, su.session pode ser null)
    let uid = su.user?.id;
    if (!su.session) {
      const { data: login, error: eLogin } =
        await supabase.auth.signInWithPassword({ email, password: senha });
      if (eLogin) {
        msgGeral("Cadastro criado! Confirme o e‑mail e depois faça login.", true);
        if (btnSubmit) {
          btnSubmit.classList.remove("btn-erro");
          btnSubmit.classList.add("btn-ok");
          btnSubmit.textContent = "Cadastro criado! Verifique seu e‑mail.";
          btnSubmit.disabled = false;
        }
        return;
      }
      uid = login.user.id;
    }

    // 3) Grava perfil em public.alunos (1:1 com user_id)
    const { error: e2 } = await supabase
      .from("alunos")
      .upsert(
        { user_id: uid, nome, email, telefone, objetivo, cpf },
        { onConflict: "user_id" }
      );
    if (e2) throw e2;

    // Sucesso: feedback + redireciona
    setFieldState(mailEl, true, "");
    msgGeral("Bem‑vindo à Altitude!", true);
    if (btnSubmit) {
      btnSubmit.classList.remove("btn-erro");
      btnSubmit.classList.add("btn-ok");
      btnSubmit.textContent = "Bem‑vindo à Altitude!";
    }

    setTimeout(() => {
      // Ajuste para a sua rota real:
      window.location.href = "/Projeto/1-html/portaldoaluno.html";
    }, 1100);

  } catch (err) {
    console.error(err);
    const texto = err?.message || err?.error_description || "Erro ao cadastrar. Tente novamente.";
    msgGeral(texto);
    if (btnSubmit) {
      btnSubmit.classList.remove("btn-ok");
      btnSubmit.classList.add("btn-erro");
      btnSubmit.textContent = "Cadastro não realizado";
      btnSubmit.disabled = false;
    }
  }
});
