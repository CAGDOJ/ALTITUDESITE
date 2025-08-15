// Projeto/4-java/headerAuth.js
import { supabase } from "./supabaseClient.js";

// Elementos do cabeçalho (se não existirem, não faz nada)
const actions  = document.getElementById('auth-actions'); // bloco com "Acessar / Cadastrar"
const menuUser = document.getElementById('user-menu');    // bloco com "Olá Nome / Sair"
const slotName = document.getElementById('user-name');
const btnOut   = document.getElementById('logout-btn');

if (actions && menuUser && slotName) {
  // carrega sessão e ajusta cabeçalho
  carregaCabecalhoPosLogin().catch(console.error);

  async function carregaCabecalhoPosLogin() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      actions.style.display  = 'flex';
      menuUser.style.display = 'none';
      return;
    }
    const nome = session.user.user_metadata?.nome || session.user.email || "Aluno";
    slotName.textContent = `Olá ${nome}`;
    actions.style.display  = 'none';
    menuUser.style.display = 'flex';
  }

  btnOut?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    actions.style.display  = 'flex';
    menuUser.style.display = 'none';
    // opcional: redireciona para a home
    // location.href = "/Projeto/1-html/index.html";
  });
}
