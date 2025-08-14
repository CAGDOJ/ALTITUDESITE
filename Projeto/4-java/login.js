// Projeto/4-java/login.js
import { supabase } from "./supabaseClient.js";

const form = document.querySelector(".registration-form");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.querySelector("#email")?.value.trim();
    const password = document.querySelector("#password")?.value;

    const btn = form.querySelector(".btn.submit") || form.querySelector('button[type="submit"]');

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Carregando…";
      }

      // Faz o login no Supabase
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Redireciona para a página desejada
      window.location.href = "/Projeto/1-html/portaldoaluno.html"; // troque para a sua página
    } catch (err) {
      alert(err?.message || "Não foi possível entrar.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar";
      }
    }
  });
}
