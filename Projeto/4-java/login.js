
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
