// Projeto/4-java/cadastro.js
import { supabase } from "./supabaseClient.js";

// pega o form
const form = document.querySelector(".registration-form");
const nameEl = document.querySelector("#name");
const mailEl = document.querySelector("#email");
const passEl = document.querySelector("#password");
const telEl  = document.querySelector("#phone");
const objEl  = document.querySelector("#objective");

// helper de mensagens
function msg(texto, ok = false) {
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg("");

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
    if (e1) throw e1;

    // 2) garanta que há sessão (se confirmação de e‑mail estiver ON, signUp.session pode ser null)
    let uid = su.user?.id;
    if (!su.session) {
      const { data: login, error: eLogin } =
        await supabase.auth.signInWithPassword({ email, password: senha });
      if (eLogin) {
        // se você usa TRIGGER no banco, já terá criado o perfil; se não usa, a RLS bloqueará sem sessão
        msg("Cadastro criado! Confirme o e‑mail e depois faça login.", true);
        return;
      }
      uid = login.user.id;
    }

    // 3) grava/atualiza perfil em public.alunos (1:1 com user_id)
    //    Se você criou a TRIGGER no banco, isso aqui só complementa info (telefone/objetivo).
    const { error: e2 } = await supabase
      .from("alunos")
      .upsert(
        { user_id: uid, nome, email, telefone, objetivo },
        { onConflict: "user_id" }
      );
    if (e2) throw e2;

    msg("Cadastro concluído! Redirecionando…", true);
    setTimeout(() => {
      // ajuste a rota desejada:
      // location.href = "/area-aluno/index.html";
      form.reset();
      if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
    }, 900);

  } catch (err) {
    console.error(err);
    const texto = err?.message || err?.error_description || "Erro ao cadastrar. Tente novamente.";
    msg(texto);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
  }
});
