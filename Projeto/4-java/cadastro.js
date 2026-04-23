const sb = window.sb;

const $ = (id) => document.getElementById(id);

const form = $("form-cadastro");
const btnEnviar = $("btn-enviar");
const formMsg = $("form-msg");

const nomeEl = $("nome");
const cpfEl = $("cpf");
const nascEl = $("nascimento");
const emailEl = $("email");
const senhaEl = $("senha");
const confEl = $("confirma");
const telEl = $("telefone");
const objetivoEl = $("objetivo");
const termosEl = $("termos");

const fb = {
  nome: $("fb-nome"),
  cpf: $("fb-cpf"),
  nascimento: $("fb-nascimento"),
  email: $("fb-email"),
  senha: $("fb-senha"),
  confirma: $("fb-confirma"),
  telefone: $("fb-telefone"),
  objetivo: $("fb-objetivo")
};

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function maskCPF(v) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function maskPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function showMsg(text, type = "error") {
  if (!formMsg) return;
  formMsg.hidden = !text;
  formMsg.textContent = text || "";
  formMsg.className = type === "error" ? "form-msg error" : "form-msg";
}

function setValid(input, msgEl, msg = "") {
  if (input) {
    input.classList.add("is-valid");
    input.classList.remove("is-invalid");
  }
  if (msgEl) {
    msgEl.textContent = msg;
    msgEl.classList.add("ok");
  }
}

function setInvalid(input, msgEl, msg) {
  if (input) {
    input.classList.add("is-invalid");
    input.classList.remove("is-valid");
  }
  if (msgEl) {
    msgEl.textContent = msg || "";
    msgEl.classList.remove("ok");
  }
}

function validarCPF(cpf) {
  cpf = onlyDigits(cpf);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i);
  let resto = 11 - (soma % 11);
  if (resto >= 10) resto = 0;
  if (resto !== parseInt(cpf.charAt(9))) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i)) * (11 - i);
  resto = 11 - (soma % 11);
  if (resto >= 10) resto = 0;
  return resto === parseInt(cpf.charAt(10));
}

function validarNome() {
  const v = (nomeEl?.value || "").trim();
  if (v.length < 3) {
    setInvalid(nomeEl, fb.nome, "Informe seu nome completo.");
    return false;
  }
  setValid(nomeEl, fb.nome, "");
  return true;
}

function validarCampoCPF() {
  const v = cpfEl?.value || "";
  if (!validarCPF(v)) {
    setInvalid(cpfEl, fb.cpf, "CPF inválido.");
    return false;
  }
  setValid(cpfEl, fb.cpf, "CPF válido.");
  return true;
}

function validarNascimento() {
  if (!nascEl?.value) {
    setInvalid(nascEl, fb.nascimento, "Informe a data de nascimento.");
    return false;
  }
  setValid(nascEl, fb.nascimento, "");
  return true;
}

function validarEmail() {
  const v = (emailEl?.value || "").trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (!ok) {
    setInvalid(emailEl, fb.email, "E-mail inválido.");
    return false;
  }
  setValid(emailEl, fb.email, "");
  return true;
}

function validarSenha() {
  const v = senhaEl?.value || "";
  if (v.length < 8) {
    setInvalid(senhaEl, fb.senha, "A senha deve ter no mínimo 8 caracteres.");
    return false;
  }
  setValid(senhaEl, fb.senha, "");
  return true;
}

function validarConfirmacao() {
  const s1 = senhaEl?.value || "";
  const s2 = confEl?.value || "";
  if (!s2 || s1 !== s2) {
    setInvalid(confEl, fb.confirma, "As senhas não coincidem.");
    return false;
  }
  setValid(confEl, fb.confirma, "Senhas conferem.");
  return true;
}

function validarTelefone() {
  const d = onlyDigits(telEl?.value || "");
  if (!(d.length === 10 || d.length === 11)) {
    setInvalid(telEl, fb.telefone, "Informe telefone com DDD.");
    return false;
  }
  setValid(telEl, fb.telefone, "");
  return true;
}

function validarObjetivo() {
  if (!objetivoEl?.value) {
    setInvalid(objetivoEl, fb.objetivo, "Selecione uma opção.");
    return false;
  }
  setValid(objetivoEl, fb.objetivo, "");
  return true;
}

function validarTermos() {
  return !!termosEl?.checked;
}

function toggleSubmit() {
  const ok =
    validarNome() &&
    validarCampoCPF() &&
    validarNascimento() &&
    validarEmail() &&
    validarSenha() &&
    validarConfirmacao() &&
    validarTelefone() &&
    validarObjetivo() &&
    validarTermos();

  if (btnEnviar) btnEnviar.disabled = !ok;
}

async function checkCPFExists(rawCpf) {
  if (!sb) return false;
  const { count, error } = await sb
    .from("alunos")
    .select("user_id", { count: "exact", head: true })
    .eq("cpf", rawCpf);

  if (error) {
    console.error(error);
    return false;
  }
  return (count || 0) > 0;
}

async function checkEmailExists(email) {
  if (!sb) return false;
  const { count, error } = await sb
    .from("alunos")
    .select("user_id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase());

  if (error) {
    console.error(error);
    return false;
  }
  return (count || 0) > 0;
}

cpfEl?.addEventListener("input", (e) => {
  e.target.value = maskCPF(e.target.value);
  validarCampoCPF();
  toggleSubmit();
});

telEl?.addEventListener("input", (e) => {
  e.target.value = maskPhone(e.target.value);
  validarTelefone();
  toggleSubmit();
});

nomeEl?.addEventListener("input", () => {
  validarNome();
  toggleSubmit();
});

nascEl?.addEventListener("input", () => {
  validarNascimento();
  toggleSubmit();
});

nascEl?.addEventListener("change", () => {
  validarNascimento();
  toggleSubmit();
});

emailEl?.addEventListener("input", () => {
  validarEmail();
  toggleSubmit();
});

senhaEl?.addEventListener("input", () => {
  validarSenha();
  validarConfirmacao();
  toggleSubmit();
});

confEl?.addEventListener("input", () => {
  validarConfirmacao();
  toggleSubmit();
});

objetivoEl?.addEventListener("change", () => {
  validarObjetivo();
  toggleSubmit();
});

termosEl?.addEventListener("change", () => {
  toggleSubmit();
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMsg("", "ok");

  toggleSubmit();
  if (btnEnviar?.disabled) {
    showMsg("Preencha corretamente todos os campos.", "error");
    return;
  }

  const payloadAluno = {
    nome: nomeEl.value.trim(),
    cpf: onlyDigits(cpfEl.value),
    data_nascimento: nascEl.value,
    email: emailEl.value.trim().toLowerCase(),
    telefone: onlyDigits(telEl.value),
    objetivo: objetivoEl.value,
    status: "ATIVO"
  };

  try {
    btnEnviar.disabled = true;
    btnEnviar.textContent = "Enviando...";

    const cpfExiste = await checkCPFExists(payloadAluno.cpf);
    if (cpfExiste) {
      setInvalid(cpfEl, fb.cpf, "CPF já cadastrado.");
      showMsg("Este CPF já está cadastrado.", "error");
      btnEnviar.disabled = false;
      btnEnviar.textContent = "Enviar";
      return;
    }

    const emailExiste = await checkEmailExists(payloadAluno.email);
    if (emailExiste) {
      setInvalid(emailEl, fb.email, "E-mail já cadastrado.");
      showMsg("Este e-mail já está cadastrado.", "error");
      btnEnviar.disabled = false;
      btnEnviar.textContent = "Enviar";
      return;
    }

    const { data: authData, error: authError } = await sb.auth.signUp({
      email: payloadAluno.email,
      password: senhaEl.value
    });

    if (authError) throw authError;

    const userId = authData?.user?.id;
    if (!userId) throw new Error("Usuário criado sem ID.");

    const { data, error } = await sb
      .from("alunos")
      .insert({
        user_id: userId,
        ...payloadAluno
      })
      .select("user_id, nome, email")
      .single();

    if (error) throw error;

    showMsg("Cadastro realizado com sucesso!", "ok");
    alert("Cadastro realizado com sucesso!");
    form.reset();

    [nomeEl, cpfEl, nascEl, emailEl, senhaEl, confEl, telEl, objetivoEl].forEach(el => {
      el?.classList.remove("is-valid", "is-invalid");
    });

    Object.values(fb).forEach(el => {
      if (el) {
        el.textContent = "";
        el.classList.remove("ok");
      }
    });

    toggleSubmit();
  } catch (err) {
    console.error(err);
    showMsg(err.message || "Erro ao cadastrar.", "error");
  } finally {
    btnEnviar.textContent = "Enviar";
    toggleSubmit();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  toggleSubmit();
});