
// Detecta se veio do link de confirmação do Supabase
const params = new URLSearchParams(window.location.search);
if (params.get("type") === "signup") {
    const msg = document.createElement("p");
    msg.textContent = "✅ Sua conta foi confirmada! Já pode fazer login.";
    msg.style.color = "seagreen";
    msg.style.fontWeight = "bold";
    msg.style.marginBottom = "10px";

    const form = document.querySelector("form");
    if (form) {
        form.prepend(msg);
    }
}

import { supabase } from "./supabaseClient.js";

document.querySelector(".registration-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.querySelector("#email").value.trim();
    const password = document.querySelector("#password").value;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        alert("Erro: " + error.message);
        return;
    }

    // Troca botão de login/cadastro pelo nome
    const nome = data.user.user_metadata.nome || email;
    document.getElementById("auth-actions").style.display = "none";
    document.getElementById("user-menu").style.display = "block";
    document.getElementById("user-name").textContent = nome;
});
