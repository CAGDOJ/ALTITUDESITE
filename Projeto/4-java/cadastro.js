// ===== ALTITUDE • cadastro.js (CONSOLIDADO) =====
// - Nome salvo MAIÚSCULO sem acentos/ç
// - Inclui data_nascimento no insert
// - Máscaras/validações consistentes
// - Checagem de duplicidade (cpf/email)
// - Mantém fluxo de insert sem mexer no login

// ===== Helpers =====
const $ = (s) => document.querySelector(s);
const onlyDigits = (v) => (v || "").replace(/\D+/g, "");

const setOK = (el, msgEl, msg = "") => {
  if (el) { el.classList.add("is-valid"); el.classList.remove("is-invalid"); }
  if (msgEl) { msgEl.textContent = msg; msgEl.classList.add("ok"); }
};
const setErr = (el, msgEl, msg) => {
  if (el) { el.classList.add("is-invalid"); el.classList.remove("is-valid"); }
  if (msgEl) { msgEl.textContent = msg || ""; msgEl.classList.remove("ok"); }
};
const debounce = (fn, t = 400) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), t); }; };

// Remove acentos/ç e deixa MAIÚSCULO
const sanitizeUpperASCII = (s = "") =>
  s.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos
    .replace(/ç/gi, "c")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

// Máscaras
function maskCPF(v) {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 3), p2 = d.slice(3, 6), p3 = d.slice(6, 9), p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "-" + p4;
  return out;
}
function maskPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  const has9 = d.length > 10;
  const ddd = d.slice(0, 2);
  const p1 = has9 ? d.slice(2, 7) : d.slice(2, 6);
  const p2 = has9 ? d.slice(7, 11) : d.slice(6, 10);
  let out = "";
  if (ddd) out += `(${ddd}) `;
  if (p1) out += p1;
  if (p2) out += "-" + p2;
  return out;
}

// ===== DOM =====
const form      = $("#form-cadastro");
const btnEnviar = $("#btn-enviar");
const formMsg   = $("#form-msg");

const nomeEl    = $("#nome");
const cpfEl     = $("#cpf");
const nascEl    = $("#nascimento");
const emailEl   = $("#email");
const senhaEl   = $("#senha");
const confEl    = $("#confirma") || $("#confirmar-senha") || $("#confirmar");
const telEl     = $("#telefone");
const objetivo  = $("#objetivo");
const termosEl  = $("#termos"); // se não houver, consideramos true no toggle

const fb = {
  nome: $("#fb-nome"),
  cpf: $("#fb-cpf"),
  email: $("#fb-email"),
  senha: $("#fb-senha"),
  confirma: $("#fb-confirma"),
  tel: $("#fb-telefone"),
  objetivo: $("#fb-objetivo"),
  nascimento: $("#fb-nascimento"),
};

// Limite de datas (não permite futuro)
document.addEventListener("DOMContentLoaded", () => {
  if (nascEl) nascEl.max = new Date().toISOString().split("T")[0];
});

// ===== Validações =====
function cpfValido(str) {
  const d = onlyDigits(str);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // todos iguais

  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) soma += parseInt(d.substring(i - 1, i)) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(d.substring(9, 10))) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++) soma += parseInt(d.substring(i - 1, i)) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(d.substring(10, 11));
}
const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());
function telValido(v) {
  const d = onlyDigits(v);
  if (!(d.length === 10 || d.length === 11)) return false;
  if (/^0+$/.test(d)) return false;
  return true;
}

function validarNome() {
  const v = sanitizeUpperASCII((nomeEl?.value || ""));
  if (nomeEl) nomeEl.value = v; // visual + valor normalizado
  if (v.length < 3) { setErr(nomeEl, fb.nome, "Informe o nome completo."); return false; }
  setOK(nomeEl, fb.nome, "");
  return true;
}
function validarCPF() {
  if (!cpfValido(cpfEl?.value || "")) { setErr(cpfEl, fb.cpf, "CPF inválido."); return false; }
  setOK(cpfEl, fb.cpf, "CPF válido."); return true;
}
function validarNasc() {
  if (!nascEl || !nascEl.value) { setErr(nascEl, fb.nascimento, "Informe sua data de nascimento."); return false; }
  setOK(nascEl, fb.nascimento, ""); return true;
}
function validarEmail() {
  if (!emailValido(emailEl?.value)) { setErr(emailEl, fb.email, "E-mail inválido. Ex.: nome@dominio.com"); return false; }
  setOK(emailEl, fb.email, ""); return true;
}
function validarSenha() {
  if (!senhaEl?.value || senhaEl.value.length < 8) { setErr(senhaEl, fb.senha, "Mínimo de 8 caracteres."); return false; }
  setOK(senhaEl, fb.senha, ""); return true;
}
function validarConf() {
  if (!confEl || confEl.value !== senhaEl.value || (confEl.value || "").length < 8) { setErr(confEl, fb.confirma, "Senhas não são iguais."); return false; }
  setOK(confEl, fb.confirma, "Senhas conferem."); return true;
}
function validarTel() {
  if (!telValido(telEl?.value || "")) { setErr(telEl, fb.tel, "Informe DDD + número (10 ou 11 dígitos)."); return false; }
  setOK(telEl, fb.tel, ""); return true;
}
function validarObj() {
  if (!objetivo || !objetivo.value) { setErr(objetivo, fb.objetivo, "Selecione uma opção."); return false; }
  setOK(objetivo, fb.objetivo, ""); return true;
}

function isTermsChecked() { return termosEl ? !!termosEl.checked : true; }

function toggleSubmit() {
  const ok = validarNome() && validarCPF() && validarEmail() &&
             validarSenha() && validarConf() && validarTel() &&
             validarObj() && validarNasc() &&
             isTermsChecked() && !(formMsg && formMsg.textContent);
  if (btnEnviar) btnEnviar.disabled = !ok;
}

// ===== Mensagem geral =====
function showFormMsg(type, text) {
  if (!formMsg) return;
  if (!text) { formMsg.hidden = true; formMsg.textContent = ""; return; }
  formMsg.hidden = false;
  formMsg.textContent = text;
  formMsg.className = type === "error" ? "form-msg error" : "form-msg";
}

// ===== Consulta Supabase (duplicidade) =====
async function checkCPFExists(rawDigits) {
  if (!window.supabase) return null;
  const { count, error } = await supabase
    .from("alunos")
    .select("id", { count: "exact", head: true })
    .eq("cpf", rawDigits);
  if (error) { console.error(error); return null; }
  return (count || 0) > 0;
}
async function checkEmailExists(email) {
  if (!window.supabase) return null;
  const { count, error } = await supabase
    .from("alunos")
    .select("id", { count: "exact", head: true })
    .eq("email", (email || "").trim().toLowerCase());
  if (error) { console.error(error); return null; }
  return (count || 0) > 0;
}
const debouncedCPFCheck = debounce(async () => {
  if (!validarCPF()) { toggleSubmit(); return; }
  const exists = await checkCPFExists(onlyDigits(cpfEl.value));
  if (exists === true) { setErr(cpfEl, fb.cpf, "CPF já cadastrado."); }
  else if (exists === false) { setOK(cpfEl, fb.cpf, "CPF disponível."); }
  toggleSubmit();
});
const debouncedEmailCheck = debounce(async () => {
  if (!validarEmail()) { toggleSubmit(); return; }
  const exists = await checkEmailExists(emailEl.value);
  if (exists === true) { setErr(emailEl, fb.email, "E-mail já cadastrado."); }
  else if (exists === false) { setOK(emailEl, fb.email, "E-mail disponível."); }
  toggleSubmit();
});

// ===== Eventos =====
nomeEl && nomeEl.addEventListener("input", () => {
  const p = nomeEl.selectionStart;
  nomeEl.value = sanitizeUpperASCII(nomeEl.value);
  if (p != null) nomeEl.setSelectionRange(p, p);
  validarNome(); toggleSubmit();
});

cpfEl && cpfEl.addEventListener("input", (e) => {
  const caret = e.target.selectionStart, oldLen = e.target.value.length;
  e.target.value = maskCPF(e.target.value); validarCPF(); debouncedCPFCheck();
  const newLen = e.target.value.length; e.target.selectionStart = e.target.selectionEnd = caret + (newLen - oldLen);
});
cpfEl && cpfEl.addEventListener("blur", debouncedCPFCheck);

telEl && telEl.addEventListener("input", (e) => {
  const caret = e.target.selectionStart, oldLen = e.target.value.length;
  e.target.value = maskPhone(e.target.value); validarTel();
  const newLen = e.target.value.length; e.target.selectionStart = e.target.selectionEnd = caret + (newLen - oldLen);
  toggleSubmit();
});

emailEl && emailEl.addEventListener("input", debouncedEmailCheck);
senhaEl && senhaEl.addEventListener("input", () => { validarSenha(); toggleSubmit(); });
confEl  && confEl.addEventListener("input", () => { validarConf(); toggleSubmit(); });
objetivo&& objetivo.addEventListener("change", () => { validarObj(); toggleSubmit(); });
termosEl&& termosEl.addEventListener("change", toggleSubmit);
nascEl  && nascEl.addEventListener("change", () => { validarNasc(); toggleSubmit(); });

// ===== Submit =====
form && form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!(validarNome() && validarCPF() && validarEmail() && validarSenha() && validarConf() && validarTel() && validarObj() && validarNasc() && isTermsChecked())) {
    showFormMsg("error", "Há campos inválidos. Corrija e tente novamente.");
    toggleSubmit();
    return;
  }
  showFormMsg("", "");

  // Checagem final de duplicidade
  const cpfRaw = onlyDigits(cpfEl.value);
  const [cpfUsed, emailUsed] = await Promise.all([
    checkCPFExists(cpfRaw),
    checkEmailExists(emailEl.value)
  ]);
  if (cpfUsed)  setErr(cpfEl, fb.cpf, "CPF já cadastrado.");
  if (emailUsed) setErr(emailEl, fb.email, "E-mail já cadastrado.");
  if (cpfUsed || emailUsed) { showFormMsg("error", "Existem campos com erro. Corrija-os para continuar."); toggleSubmit(); return; }

  // Monta payload final
  const payload = {
    nome: sanitizeUpperASCII((nomeEl.value || "").trim()),
    cpf: cpfRaw,                                  // 11 dígitos
    data_nascimento: nascEl?.value || null,       // YYYY-MM-DD
    email: (emailEl.value || "").trim().toLowerCase(),
    telefone: onlyDigits(telEl.value || ""),
    objetivo: objetivo?.value || ""
  };

  try {
    if (btnEnviar) btnEnviar.disabled = true;

    // INSERT + retorna RA gerado no servidor (trigger)
    const { data, error } = await supabase
      .from("alunos")
      .insert(payload)
      .select("id, ra, nome")
      .single();

    if (error) throw error;

    alert(`Cadastro concluído!\nRA: ${data.ra}\nAluno: ${data.nome}`);
    form.reset();
    showFormMsg("", "");
    toggleSubmit();
  } catch (err) {
    console.error(err);
    showFormMsg("error", err?.message || String(err));
  } finally {
    if (btnEnviar) btnEnviar.disabled = false;
  }
});
