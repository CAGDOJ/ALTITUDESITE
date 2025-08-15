/* ============================================================
   Login do Portal do Aluno (Supabase Auth)
   - Seletores compatíveis com 4-login e cadastro.html
   - Mostra erro amigável
   - Redireciona para o portal ao logar
   ============================================================ */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function ensureErrorBox(form) {
  let box = document.getElementById('loginErro');
  if (!box) {
    box = document.createElement('div');
    box.id = 'loginErro';
    box.style.display = 'none';
    box.style.color = '#b91c1c';
    box.style.margin = '8px 0';
    form.appendChild(box);
  }
  return box;
}

window.addEventListener('DOMContentLoaded', () => {
  // Seleciona o formulário pela classe que existe no HTML
  const form = document.querySelector('form.registration-form');
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');

  if (!form || !emailEl || !passEl) {
    console.error('Login: elementos não encontrados no DOM. Verifique IDs/classe do formulário.');
    return;
  }

  const msgEl = ensureErrorBox(form);

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
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.session) {
        msgEl.textContent = 'Não foi possível entrar. Verifique os dados e tente novamente.';
        msgEl.style.display = 'block';
        return;
      }

      // ✅ Redireciona para o Portal do Aluno
      // Ajuste o caminho conforme sua estrutura de pastas!
      // Se este arquivo está em: /1-html/4-login e cadastro.html
      // e o portal está em:      /1-html/portaldoaluno.html
      window.location.href = '../1-html/portaldoaluno.html';

    } catch (err) {
      console.error(err);
      msgEl.textContent = 'Erro ao tentar entrar. Tente novamente.';
      msgEl.style.display = 'block';
    }
  });
});
