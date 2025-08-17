// ===== Helpers =====
const $ = (s) => document.querySelector(s);
const onlyDigits = (v) => (v || "").replace(/\D+/g, "");
const setOK = (el, msgEl, msg="") => { el.classList.add("is-valid"); el.classList.remove("is-invalid"); msgEl.textContent = msg; msgEl.classList.add("ok"); };
const setErr = (el, msgEl, msg) => { el.classList.add("is-invalid"); el.classList.remove("is-valid"); msgEl.textContent = msg || ""; msgEl.classList.remove("ok"); };
const debounce = (fn, t=400) => { let id; return (...a)=>{ clearTimeout(id); id=setTimeout(()=>fn(...a),t); }; };

// ===== DOM =====
const form      = $("#form-cadastro");
const formMsg   = $("#form-msg");
const nomeEl    = $("#nome");
const cpfEl     = $("#cpf");
const emailEl   = $("#email");
const senhaEl   = $("#senha");
const confEl    = $("#confirma");
const telEl     = $("#telefone");
const objetivo  = $("#objetivo");
const termosEl  = $("#termos");
const btnEnviar = $("#btn-enviar");

const fb = {
  nome: $("#fb-nome"),
  cpf: $("#fb-cpf"),
  email: $("#fb-email"),
  senha: $("#fb-senha"),
  confirma: $("#fb-confirma"),
  tel: $("#fb-telefone"),
  objetivo: $("#fb-objetivo"),
};

// ===== Máscaras =====
function maskCPF(v){
  const d = onlyDigits(v).slice(0,11);
  const p1 = d.slice(0,3), p2 = d.slice(3,6), p3 = d.slice(6,9), p4 = d.slice(9,11);
  let out = p1; if(p2) out += "."+p2; if(p3) out += "."+p3; if(p4) out += "-"+p4; return out;
}
function maskPhone(v){
  const d = onlyDigits(v).slice(0,11);
  const has9 = d.length > 10;
  const ddd = d.slice(0,2);
  const p1  = has9 ? d.slice(2,7) : d.slice(2,6);
  const p2  = has9 ? d.slice(7,11) : d.slice(6,10);
  let out = ""; if(ddd) out += `(${ddd}) `; if(p1) out += p1; if(p2) out += "-"+p2; return out;
}

// ===== Validações locais =====
function cpfValido(str){
  const d = onlyDigits(str);
  if(d.length !== 11) return false;
  if(/^(\d)\1{10}$/.test(d)) return false;
  let soma=0, resto;
  for(let i=1;i<=9;i++)  soma += parseInt(d.substring(i-1,i))*(11-i);
  resto=(soma*10)%11; if(resto===10||resto===11) resto=0;
  if(resto!==parseInt(d.substring(9,10))) return false;
  soma=0;
  for(let i=1;i<=10;i++) soma += parseInt(d.substring(i-1,i))*(12-i);
  resto=(soma*10)%11; if(resto===10||resto===11) resto=0;
  return resto===parseInt(d.substring(10,11));
}
const emailValido = (v)=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v||"");
function telValido(v){
  const d = onlyDigits(v);
  if(!(d.length===10||d.length===11)) return false;
  if(/^0+$/.test(d)) return false;
  return true;
}

function validarNome(){ if((nomeEl.value||"").trim().length<3){ setErr(nomeEl,fb.nome,"Informe seu nome completo."); return false; } setOK(nomeEl,fb.nome,""); return true; }
function validarCPF (){
  if(!cpfValido(cpfEl.value)){ setErr(cpfEl,fb.cpf,"CPF inválido."); return false; }
  setOK(cpfEl,fb.cpf,"CPF válido."); return true;
}
function validarEmail(){ if(!emailValido(emailEl.value.trim())){ setErr(emailEl,fb.email,"E-mail inválido. Ex.: nome@dominio.com"); return false; } setOK(emailEl,fb.email,""); return true; }
function validarSenha(){ if(!senhaEl.value || senhaEl.value.length<8){ setErr(senhaEl,fb.senha,"Mínimo de 8 caracteres."); return false; } setOK(senhaEl,fb.senha,""); return true; }
function validarConf (){ if(confEl.value!==senhaEl.value || confEl.value.length<8){ setErr(confEl,fb.confirma,"Senhas não são iguais."); return false; } setOK(confEl,fb.confirma,"Senhas conferem."); return true; }
function validarTel  (){ if(!telValido(telEl.value)){ setErr(telEl,fb.tel,"Informe DDD + número (10 ou 11 dígitos)."); return false; } setOK(telEl,fb.tel,""); return true; }
function validarObj  (){ if(!objetivo.value){ setErr(objetivo,fb.objetivo,"Selecione uma opção."); return false; } setOK(objetivo,fb.objetivo,""); return true; }

function toggleSubmit(){
  const ok = validarNome() && validarCPF() && validarEmail() &&
             validarSenha() && validarConf() && validarTel() &&
             validarObj() && termosEl.checked && !formMsg.textContent;
  btnEnviar.disabled = !ok;
}

// ===== Mensagem geral =====
function showFormMsg(type, text){
  if(!text){ formMsg.hidden = true; formMsg.textContent = ""; return; }
  formMsg.hidden = false;
  formMsg.textContent = text;
}

// ===== Consulta Supabase (duplicidade) =====
async function checkCPFExists(rawDigits){
  if(!window.supabase) return null;         // se não estiver configurado, não gera erro
  const { count, error } = await supabase
    .from("alunos")
    .select("id", { count: "exact", head: true })
    .eq("cpf", rawDigits);
  if(error){ console.error(error); return null; }
  return (count||0) > 0;
}
async function checkEmailExists(email){
  if(!window.supabase) return null;
  const { count, error } = await supabase
    .from("alunos")
    .select("id", { count: "exact", head: true })
    .ilike("email", email.trim());
  if(error){ console.error(error); return null; }
  return (count||0) > 0;
}
const debouncedCPFCheck   = debounce(async ()=>{
  if(!validarCPF()) { toggleSubmit(); return; }
  const exists = await checkCPFExists(onlyDigits(cpfEl.value));
  if(exists===true){ setErr(cpfEl,fb.cpf,"CPF já cadastrado."); }
  else if(exists===false){ setOK(cpfEl,fb.cpf,"CPF disponível."); }
  toggleSubmit();
});
const debouncedEmailCheck = debounce(async ()=>{
  if(!validarEmail()) { toggleSubmit(); return; }
  const exists = await checkEmailExists(emailEl.value);
  if(exists===true){ setErr(emailEl,fb.email,"E-mail já cadastrado."); }
  else if(exists===false){ setOK(emailEl,fb.email,"E-mail disponível."); }
  toggleSubmit();
});

// ===== Eventos =====
cpfEl.addEventListener("input",(e)=>{
  const caret = e.target.selectionStart, oldLen = e.target.value.length;
  e.target.value = maskCPF(e.target.value); validarCPF(); debouncedCPFCheck();
  const newLen = e.target.value.length; e.target.selectionStart = e.target.selectionEnd = caret + (newLen-oldLen);
});
cpfEl.addEventListener("blur", debouncedCPFCheck);

telEl.addEventListener("input",(e)=>{
  const caret = e.target.selectionStart, oldLen = e.target.value.length;
  e.target.value = maskPhone(e.target.value); validarTel();
  const newLen = e.target.value.length; e.target.selectionStart = e.target.selectionEnd = caret + (newLen-oldLen);
  toggleSubmit();
});

nomeEl .addEventListener("input", ()=>{ validarNome(); toggleSubmit(); });
emailEl.addEventListener("input", ()=>{ validarEmail(); debouncedEmailCheck(); });
senhaEl.addEventListener("input", ()=>{ validarSenha(); validarConf(); toggleSubmit(); });
confEl .addEventListener("input", ()=>{ validarConf(); toggleSubmit(); });
objetivo.addEventListener("change", ()=>{ validarObj(); toggleSubmit(); });
termosEl .addEventListener("change", ()=> toggleSubmit());

// Mostrar/ocultar senhas
document.querySelectorAll(".toggle-pass").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const target = document.getElementById(btn.dataset.target);
    const isPwd = target.type === "password";
    target.type = isPwd ? "text" : "password";
    btn.querySelector("i").classList.toggle("fa-eye");
    btn.querySelector("i").classList.toggle("fa-eye-slash");
  });
});

// ===== Envio (com Supabase) =====
form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  showFormMsg("", "");                      // limpa faixa de erro
  toggleSubmit();
  if(btnEnviar.disabled) return;

  // checagem final de duplicidade
  const cpfRaw = onlyDigits(cpfEl.value);
  const [cpfUsed, emailUsed] = await Promise.all([
    checkCPFExists(cpfRaw),
    checkEmailExists(emailEl.value)
  ]);
  if(cpfUsed){ setErr(cpfEl,fb.cpf,"CPF já cadastrado."); }
  if(emailUsed){ setErr(emailEl,fb.email,"E-mail já cadastrado."); }
  if(cpfUsed || emailUsed){ showFormMsg("error","Existem campos com erro. Corrija-os para continuar."); toggleSubmit(); return; }

  // salva no Supabase
  try{
    if(!window.supabase) throw new Error("Conexão com o banco não encontrada.");

    btnEnviar.textContent = "Enviando…";
    btnEnviar.disabled = true;

    // 1) cria usuário de autenticação
    const { data:auth, error:authError } = await supabase.auth.signUp({
      email: emailEl.value.trim().toLowerCase(),
      password: senhaEl.value
    });
    if(authError) throw authError;

    // 2) grava registro na tabela 'alunos'
    const payload = {
      nome: (nomeEl.value||"").trim(),
      cpf: cpfRaw,                          // salve só dígitos no banco
      email: emailEl.value.trim().toLowerCase(),
      telefone: onlyDigits(telEl.value),
      objetivo: objetivo.value
    };
    const { error:insError } = await supabase.from("alunos").insert(payload);
    if(insError) throw insError;

    // 3) sucesso: vai para o login
    window.location.href = "/Projeto/1-html/4-login.html";
  }catch(err){
    console.error(err);
    const msg = (err && err.message) ? err.message : "Não foi possível concluir o cadastro.";
    showFormMsg("error", "Erro no envio: " + msg);
    
    btnEnviar.textContent = "Enviar";
    btnEnviar.disabled = false;
    toggleSubmit();
  }
});

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://mxnvrxqwokvelulzdvmn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bnZyeHF3b2t2ZWx1bHpkdm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NTQ4MjAsImV4cCI6MjA3MDQzMDgyMH0.DBntQQc91IWYAvMxHknJxjxxFAl5kiWOkc1LUXe_vKE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ✅ torna disponível para outros scripts que não estão importando ES modules
window.supabase = supabase;
