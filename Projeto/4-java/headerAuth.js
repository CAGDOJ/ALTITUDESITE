import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { user } } = await supabase.auth.getUser();

  const authActions = document.getElementById('auth-actions');
  const userMenu = document.getElementById('user-menu');
  const userName = document.getElementById('user-name');
  const logoutBtn = document.getElementById('logout-btn');

  if (user) {
    // Pega o nome do banco
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

    authActions.style.display = 'none';
    userMenu.style.display = 'flex';
  } else {
    authActions.style.display = 'flex';
    userMenu.style.display = 'none';
  }

  logoutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/Projeto/1-html/index.html';
  });
});
