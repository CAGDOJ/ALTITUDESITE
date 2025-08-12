import { supabase } from "./supabaseClient.js";

const elActions  = document.getElementById("auth-actions");
const elMenu     = document.getElementById("user-menu");
const elName     = document.getElementById("user-name");

async function renderHeader(){
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (elActions) elActions.style.display = "flex";
    if (elMenu) elMenu.style.display = "none";
    return;
  }

  // Buscar nome no banco
  let displayName = user.email;
  const { data: perfil } = await supabase
    .from("alunos")
    .select("nome")
    .eq("user_id", user.id)
    .maybeSingle();

  if (perfil?.nome) {
    const primeiro = perfil.nome.trim().split(" ")[0];
    displayName = primeiro || perfil.nome;
  }

  if (elName) elName.textContent = `Olá ${displayName}`;
  if (elActions) elActions.style.display = "none";
  if (elMenu) elMenu.style.display = "flex";
}

renderHeader();
supabase.auth.onAuthStateChange(() => renderHeader());
