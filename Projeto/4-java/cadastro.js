// Projeto/4-java/cadastro.js
import { supabase } from "./supabaseClient.js";

const form      = document.querySelector(".registration-form");
const nameEl    = document.getElementById("name");
const emailEl   = document.getElementById("email");
const passEl    = document.getElementById("password");
const phoneEl   = document.getElementById("phone");
const objEl     = document.getElementById("objective");

// mensagem simples
function setMsg(text, ok=false) {
  let box = document.getElementById("msg");
  if (!box) {
    box = document.createElement("p");
    box.id = "msg";
    box.style.marginTop = "8px";
    form.appendChild(box);
  }
  box.style.color = ok ? "seagreen" : "crimson";
  box.textContent = text;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("");
  const btn = form.querySelector(".btn.submit");
  btn.disabled = true; btn.textContent = "Enviando...";

  const nome     = nameEl.value.trim();
  const email    = emailEl.value.trim();
  const senha    = passEl.value;               // fica só no Auth
  const telefone = phoneEl.value.trim();
  const objetivo = objEl.value.trim();

  try {
    // 1) cria conta no Auth
    const { data: signUp, error: e1 } = await supabase.auth.signUp({
      email, password: senha,
      options: { data: { nome } }  // salva nome nos metadados do usuário
    });
    if (e1) throw e1;

    // se confirmação de e-mail estiver ligada, user pode vir null
    const user = signUp.user;
    if (!user) {
      setMsg("Cadastro criado! Confirme o e-mail e depois faça login.", true);
      btn.disabled = false; btn.textContent = "Enviar";
      return;
    }

    // 2) salva/vincula dados adicionais (1:1 via user_id)
    const { error: e2 } = await supabase
      .from("alunos")
      .upsert({ user_id: user.id, nome, telefone, objetivo }, { onConflict: "user_id" });
    if (e2) throw e2;

    setMsg("Cadastro concluído! Redirecionando…", true);
    setTimeout(() => location.href = "/area-aluno/index.html", 900);

  } catch (err) {
    // mensagens mais amigáveis
    const mapa = {
      "auth/email_already_in_use": "E-mail já cadastrado.",
      "auth/weak_password": "Senha fraca (mínimo 6 caracteres).",
      "auth/invalid_email": "E-mail inválido."
    };
    const code = err?.code || "";
    setMsg(mapa[code] || err?.message || "Erro ao cadastrar.");
    console.error(err);
  } finally {
    btn.disabled = false; btn.textContent = "Enviar";
  }
});
