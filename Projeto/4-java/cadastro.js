import { supabase } from "./supabaseClient.js";

const form     = document.querySelector(".registration-form");
const msgEl    = document.getElementById("form-msg");
const btn      = document.getElementById("submit-btn");

const nameEl   = document.getElementById("name");
const cpfEl    = document.getElementById("cpf");
const emailEl  = document.getElementById("email");
const passEl   = document.getElementById("password");
const pass2El  = document.getElementById("password2");
const phoneEl  = document.getElementById("phone");
const objEl    = document.getElementById("objective");
const agreeEl  = document.getElementById("agree");
const toggle   = document.getElementById("toggle-pass");

// erros
const eName  = document.getElementById("err-name");
const eCpf   = document.getElementById("err-cpf");
const eEmail = document.getElementById("err-email");
const ePass  = document.getElementById("err-password");
const ePass2 = document.getElementById("err-password2");
const ePhone = document.getElementById("err-phone");
const eObj   = document.getElementById("err-objective");
const eAgree = document.getElementById("err-agree");

const setErr = (el, t="") => { if(el){ el.textContent = t; } };
const clearAll = () => [eName,eCpf,eEmail,ePass,ePass2,ePhone,eObj,eAgree].forEach(x=>setErr(x,""));

/* ====== Máscaras ====== */
cpfEl?.addEventListener("input", () => {
  let v = cpfEl.value.replace(/\D/g,"").slice(0,11);
  if (v.length > 9)  v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
  cpfEl.value = v;
});

phoneEl?.addEventListener("input", () => {
  let v = phoneEl.value.replace(/\D/g,"").slice(0,11);
  if (v.length > 6)  v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  phoneEl.value = v;
});

/* ====== Validadores ====== */
function cpfValido(cpf){
  cpf = (cpf||"").replace(/\D/g,"");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  const calc = (base) => {
    let sum = 0;
    for (let i=0;i<base;i++) sum += parseInt(cpf[i]) * (base+1-i);
    let d = 11 - (sum % 11);
    return d > 9 ? 0 : d;
  };
  const d1 = calc(9), d2 = calc(10);
  return d1 === +cpf[9] && d2 === +cpf[10];
}

const ALLOWED_DOMAINS = ["gmail.com","hotmail.com"]; // adicione: "outlook.com","yahoo.com"...
function emailBasicoValido(email){
  const m = email.match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/i);
  if (!m) return { ok:false, reason:"Formato inválido" };
  const domain = m[1].toLowerCase();
  if (!ALLOWED_DOMAINS.includes(domain)) return { ok:false, reason:`Use um e-mail ${ALLOWED_DOMAINS.join(" / ")}` };
  return { ok:true, domain };
}

function telefoneValido(tel){
  const d = (tel||"").replace(/\D/g,"");
  return d.length === 11; // 2 DDD + 9 número
}

/* ====== Mostrar/ocultar senhas ====== */
toggle?.addEventListener("change", ()=>{
  const type = toggle.checked ? "text" : "password";
  passEl.type  = type;
  pass2El.type = type;
});

/* ====== Checagem de e-mail em tempo real ====== */
let emailTimer = null;
emailEl?.addEventListener("input", () => {
  setErr(eEmail,"");
  clearTimeout(emailTimer);
  const email = emailEl.value.trim();
  const basic = emailBasicoValido(email);
  if (!basic.ok){ setErr(eEmail, basic.reason); return; }

  emailTimer = setTimeout(async ()=>{
    try{
      const { data, error } = await supabase.rpc("email_exists", { p_email: email });
      if (!error && data === true){
        setErr(eEmail, "E-mail já cadastrado.");
      }
    }catch(_){}
  }, 500);
});

/* ====== Submit ====== */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAll();

  const nome     = nameEl.value.trim();
  const cpf      = cpfEl.value.trim();
  const email    = emailEl.value.trim();
  const senha    = passEl.value;
  const senha2   = pass2El.value;
  const telefone = phoneEl.value.trim();
  const objetivo = objEl.value;
  const aceite   = agreeEl.checked;

  let ok = true;

  if (!nome){ setErr(eName,"Informe seu nome completo."); ok=false; }
  if (!cpfValido(cpf)){ setErr(eCpf,"CPF inválido."); ok=false; }

  const eb = emailBasicoValido(email);
  if (!eb.ok){ setErr(eEmail, eb.reason); ok=false; }

  if (!senha || senha.length < 8){ setErr(ePass,"Mínimo 8 caracteres."); ok=false; }
  if (senha !== senha2){ setErr(ePass2,"As senhas não conferem."); ok=false; }

  if (!telefoneValido(telefone)){ setErr(ePhone,"Informe telefone com DDD (ex.: (11) 90000-0000)."); ok=false; }
  if (!objetivo){ setErr(eObj,"Selecione um objetivo."); ok=false; }
  if (!aceite){ setErr(eAgree,"Você precisa aceitar os termos para continuar."); ok=false; }

  if (!ok) {
    changeButton("error","Algo deu errado. Cadastre novamente");
    return;
  }

  try{
    changeButton("loading","Carregando…");

    // tentativa rápida: se email_exists já acusou, dá erro
    const { data: exists } = await supabase.rpc("email_exists", { p_email: email });
    if (exists === true){
      setErr(eEmail, "E-mail já cadastrado.");
      throw new Error("E-mail existente");
    }

    // 1) cria conta no Auth
    const { data: su, error: e1 } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, cpf: cpf.replace(/\D/g,"") },
        emailRedirectTo: "https://www.portalaltitude.com.br/Projeto/1-html/4-login%20e%20cadastro.html"
      }
    });
    if (e1) throw e1;

    const uid = su.user?.id;
    if (!uid) throw new Error("Não foi possível criar o usuário.");

    // 2) grava perfil
    const { error: e2 } = await supabase.from("alunos").upsert({
      user_id: uid,
      nome,
      cpf: cpf.replace(/\D/g,""),
      email,
      telefone,
      objetivo
    }, { onConflict: "user_id" });
    if (e2) throw e2;

    changeButton("success","Sucesso! Bem-vindo");
    // redireciona logo após sucesso
    setTimeout(()=>location.href="/Projeto/1-html/4-login%20e%20cadastro.html", 900);

  }catch(err){
    console.error(err);
    changeButton("error","Algo deu errado. Cadastre novamente");
    if (msgEl){ msgEl.style.color="crimson"; msgEl.textContent = err?.message || "Erro ao cadastrar."; }
  }
});

function changeButton(state, text){
  if(!btn) return;
  btn.classList.remove("loading","success","error");
  if (state) btn.classList.add(state);
  btn.textContent = text || "Enviar";
  btn.disabled = state === "loading";
}
