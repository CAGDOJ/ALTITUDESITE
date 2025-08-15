/* ============================================================
   Login do Portal do Aluno (Supabase Auth)
   - Faz login com email/senha
   - Em caso de sucesso, redireciona para portaldoaluno.html
   - Em caso de falha, mostra mensagem no #loginErro
   ============================================================ */

// Cria o cliente Supabase (global "supabase" vem do script UMD no HTML)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Atacha o listener do formulário de forma segura
window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');
  const msgEl   = document.getElementById('loginErro');

  if (!form || !emailEl || !passEl) {
    console.error('Login: elementos não encontrados no DOM.');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEl.style.display = 'none';
    msgEl.textContent = '';

    const email = (emailEl.value || '').trim().toLowerCase();
    const password = passEl.value || '';

    if (!email || !password) {
      msgEl.textContent = 'Informe e-mail e senha.';
      msgEl.style.display = 'block';
      return;
    }

    try {
      // Faz o login no Supabase
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.session) {
        msgEl.textContent = 'Não foi possível entrar. Verifique os dados e tente novamente.';
        msgEl.style.display = 'block';
        return;
      }

      // OK: redireciona para o portal
      // Se o seu arquivo estiver em outra pasta, ajuste o caminho
      window.location.href = 'ALTITUDESITE/Projeto/1-html/portaldoaluno.html';

    } catch (err) {
      console.error(err);
      msgEl.textContent = 'Erro ao tentar entrar. Tente novamente.';
      msgEl.style.display = 'block';
    }
  });
});
