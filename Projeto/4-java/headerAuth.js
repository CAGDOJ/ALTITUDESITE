import { supabase } from './supabaseClient.js';

async function carregarCabecalhoPosLogin() {
  const { data: { user } } = await supabase.auth.getUser();

  const authActions = document.getElementById('auth-actions');
  const userMenu = document.getElementById('user-menu');
  const userName = document.getElementById('user-name');
  const logoutBtn = document.getElementById('logout-btn');

  if (user) {
    // Busca o nome do aluno na tabela "alunos"
    const { data, error } = await supabase
      .from('alunos')
      .select('nome_completo')
      .eq('user_id', user.id)
      .single();

    if (!error && data) {
      userName.textContent = `Olá, ${data.nome_completo}`;
    } else {
      userName.textContent = 'Olá!';
    }

    // Mostra cabeçalho logado
    authActions.style.display = 'none';
    userMenu.style.display = 'flex';
  } else {
    // Mostra cabeçalho visitante
    authActions.style.display = 'flex';
    userMenu.style.display = 'none';
  }

  // Botão sair
  logoutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/Projeto/1-html/index.html';
  });
}

// Executa assim que a página carregar
document.addEventListener('DOMContentLoaded', carregarCabecalhoPosLogin);
