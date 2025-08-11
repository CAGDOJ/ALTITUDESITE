import { supabase } from "./supabaseClient.js";

const form   = document.querySelector(".registration-form");
const nameEl = document.getElementById("name");
const mailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const telEl  = document.getElementById("phone");
const objEl  = document.getElementById("objective");

function showMsg(txt, ok=false){
  let el = document.getElementById("msg");
  if(!el){ el = document.createElement("p"); el.id="msg"; el.style.marginTop="8px"; form.appendChild(el); }
  el.style.color = ok ? "seagreen" : "crimson";
  el.textContent = txt;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMsg("");
  const btn = form.querySelector(".btn.submit") || form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

  const nome     = nameEl.value.trim();
  const email    = mailEl.value.trim();
  const senha    = passEl.value;
  const telefone = telEl.value.trim();
  const objetivo = objEl.value.trim();

  try {
    // 1) cria a conta no Auth (senha fica só no Auth)
    const { data: signUp, error: e1 } = await supabase.auth.signUp({
      email, password: senha,
      options: { data: { nome } }
    });
    if (e1) throw e1;

    // Se a confirmação de e‑mail estiver LIGADA, não haverá sessão ainda
    const user = signUp.user;
    if (!user) {
      showMsg("Cadastro criado! Confirme o e‑mail e depois faça login.", true);
      return;
    }

    // 2) grava o perfil 1:1 na tabela (note a coluna com espaço!)
    const { error: e2 } = await supabase
      .from("alunos")
      .upsert(
        { ["ID do usuário"]: user.id, nome, telefone, objetivo },
        { onConflict: '"ID do usuário"' }
      );
    if (e2) throw e2;

    showMsg("Cadastro concluído! Redirecionando…", true);
    setTimeout(()=> location.href = "/area-aluno/index.html", 900);

  } catch (err) {
    const mapa = {
      "auth/email_already_in_use": "E‑mail já cadastrado.",
      "auth/weak_password": "Senha fraca (mínimo 6).",
      "auth/invalid_email": "E‑mail inválido."
    };
    showMsg(mapa[err?.code] || err?.message || "Erro ao cadastrar.");
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
  }
});

// após signUp:
const user = signUp.user;
if (!user) {
  showMsg("Cadastro criado! Confirme o e‑mail e depois faça login.", true);
  return;
}

const { error: e2 } = await supabase
  .from("alunos")
  .upsert(
    { user_id: user.id, nome, telefone, objetivo },
    { onConflict: "user_id" }
  );
if (e2) throw e2;
