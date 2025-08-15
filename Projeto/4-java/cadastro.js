// Projeto/4-java/cadastro.js
import { supabase } from "./supabaseClient.js";

// ====== CONFIG ======
const PORTAL_URL = "/Projeto/1-html/portaldoaluno.html"; // ajuste se necessário

// ====== ELEMENTOS ======
const form    = document.querySelector(".registration-form");
const nameEl  = document.getElementById("name");
const mailEl  = document.getElementById("email");
const passEl  = document.getElementById("password");
const pass2El = document.getElementById("password2");
const telEl   = document.getElementById("phone");
const objEl   = document.getElementById("objective");
const cpfEl   = document.getElementById("cpf");

// alvos de mensagens
const emailMsg = document.getElementById("email-msg");
const eCpf     = document.getElementById("err-cpf");
const ePass    = document.getElementById("err-password");
const ePass2   = document.getElementById("err-password2");
const matchOk  = document.getElementById("match-ok");

// ====== HELPERS UI ======
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

function changeButton(state, text) {
  const btn = form?.querySelector(".btn.submit") || form?.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.classList.remove("loading","success","error");
  if (state) btn.classList.add(state);
  if (text)  btn.textContent = text;
  btn.disabled = state === "loading";
}

// ====== VALIDAÇÕES DE ENTRADA ======
function emailBasicoValido(email){
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) ? {ok:true} : {ok:false, reason:'Formato de e-mail inválido'};
}

// CPF máscara + validação
function cpfMask(v){
  v = v.replace(/\D/g,'').slice(0,11);
  if (v.length > 9)       v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
  else if (v.length > 6)  v = v.replace(/(\d{3})(\d{3})(\d{0,3})/,         '$1.$2.$3');
  else if (v.length > 3)  v = v.replace(/(\d{3})(\d{0,3})/,                 '$1.$2');
  return v;
}
function cpfValido(cpf){
  cpf = (cpf||'').replace(/\D/g,'');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (b)=>{ let s=0; for(let i=0;i<b;i++) s += +cpf[i]*(b+1-i); const d=11-(s%11); return d>9?0:d; };
  return dv(9)===+cpf[9] && dv(10)===+cpf[10];
}

// Senhas iguais (✔️/❌)
function checkPasswords(){
  if (ePass)  ePass.textContent  = '';
  if (ePass2) ePass2.textContent = '';
  if (matchOk) matchOk.textContent = '';
  if (!passEl?.value || !pass2El?.value) return;
  if (passEl.value.length < 8) {
    if (ePass) ePass.textContent = 'Mínimo 8 caracteres.';
    return;
  }
  if (passEl.value !== pass2El.value) {
    if (ePass2) ePass2.textContent = 'As senhas não conferem.';
  } else {
    if (matchOk) matchOk.textContent = '✔️';
  }
}

// ====== LISTENERS DE INPUT ======
mailEl?.addEventListener("input", () => setFieldState(mailEl, null, ""));
passEl?.addEventListener('input',  checkPasswords);
pass2El?.addEventListener('input', checkPasswords);

cpfEl?.addEventListener('input', ()=>{
  cpfEl.value = cpfMask(cpfEl.value);
  if (eCpf) eCpf.textContent = '';
});
cpfEl?.addEventListener('blur', ()=>{
  const cheio = cpfEl.value.replace(/\D/g,'').length === 11;
  if (!cheio) { if (eCpf) eCpf.textContent = 'CPF incompleto.'; return; }
  if (!cpfValido(cpfEl.value)) { if (eCpf) eCpf.textContent = 'CPF inválido.'; }
});

// Toggle olho (mostrar/ocultar senha)
function bindEyeToggle(){
  document.querySelectorAll('.eye-toggle').forEach(btn=>{
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    btn.addEventListener('click', ()=>{
      const showing = btn.getAttribute('aria-pressed') === 'true';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
      btn.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
    });
  });
}
bindEyeToggle();

// ====== SUBMIT ======
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  console.clear();
  msgGeral("");
  setFieldState(mailEl, null, "");
  changeButton("loading", "Cadastrando…");

  // pega valores
  const nome     = nameEl?.value.trim();
  const email    = mailEl?.value.trim().toLowerCase();
  const senha    = passEl?.value || "";
  const senha2   = pass2El?.value || "";
  const telefone = telEl?.value.trim() || "";
  const objetivo = objEl?.value || "";
  const cpfRaw   = (cpfEl?.value || "").replace(/\D/g,'');

  // validações rápidas
  if (!nome || !email || !senha) {
    changeButton("error","Preencha os campos");
    msgGeral("Campos obrigatórios faltando.");
    return;
  }
  if (!emailBasicoValido(email).ok){
    setFieldState(mailEl, false, "E-mail inválido");
    changeButton("error","Corrija o e-mail");
    return;
  }
  if (senha.length < 8) {
    changeButton("error","Senha curta");
    msgGeral("Senha precisa de 8+ caracteres");
    return;
  }
  if (senha !== senha2) {
    changeButton("error","Senhas não conferem");
    msgGeral("As senhas não conferem");
    return;
  }
  if (cpfEl) {
    if (cpfRaw.length !== 11) {
      changeButton("error","CPF incompleto");
      msgGeral("Informe os 11 dígitos do CPF.");
      return;
    }
    if (!cpfValido(cpfEl.value)) {
      changeButton("error","CPF inválido");
      msgGeral("CPF inválido.");
      return;
    }
  }

  try {
    // 1) Auth
    const { data: su, error: e1 } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, cpf: cpfRaw },
        emailRedirectTo: "https://www.portalaltitude.com.br/Projeto/1-html/4-login%20e%20cadastro.html"
      }
    });

    if (e1) {
      const already =
        e1?.code === "auth/email_already_in_use" ||
        /already.*use|exist/i.test(e1?.message || "");
      if (already) {
        setFieldState(mailEl, false, "Este usuário já existe ❌");
        changeButton("error","E-mail já cadastrado");
        msgGeral(""); // só inline
        return;
      }
      throw e1;
    }

    // 2) Sessão (se confirmação por e-mail estiver ON, pode não haver session)
    let uid = su.user?.id;
    if (!su.session) {
      const { data: login, error: eLogin } =
        await supabase.auth.signInWithPassword({ email, password: senha });
      if (eLogin) {
        changeButton("success","Cadastro criado!");
        msgGeral("Cadastro criado! Confirme o e‑mail e depois faça login.", true);
        setTimeout(()=> {
          form.reset();
          changeButton(null,"Enviar");
        }, 1200);
        return;
      }
      uid = login.user.id;
    }

    // 3) Banco (confirma gravação com .select().single())
    const { data: saved, error: e2 } = await supabase
      .from("alunos")
      .upsert(
        { user_id: uid, nome, email, telefone, objetivo, cpf: cpfRaw },
        { onConflict: "user_id" }
      )
      .select("user_id")
      .single();

    if (e2) throw e2;
    if (!saved?.user_id) throw new Error("Não foi possível confirmar o cadastro no banco.");

    // 4) Sucesso + redirecionamento
    setFieldState(mailEl, true, "");
    changeButton("success","Bem‑vindo à Altitude!");
    msgGeral("Cadastro concluído. Redirecionando…", true);

    setTimeout(() => {
      window.location.href = PORTAL_URL;
    }, 1000);

  } catch (err) {
    console.error("ERRO NO CADASTRO:", err);
    changeButton("error","Tente novamente");
    msgGeral(err?.message || err?.error_description || "Erro ao cadastrar. Tente novamente.");
  } finally {
    // se quiser reabilitar o botão apenas em erro, comente a linha abaixo:
    // changeButton(null,"Enviar");
  }
});
