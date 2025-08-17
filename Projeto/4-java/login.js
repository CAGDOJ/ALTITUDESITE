/* ===== Login Altitude (RA/CPF/E-mail + senha) ===== */
(function () {
  // usa o cliente já criado no supabaseClient.js
  const sb = window.supabase;

  function ensureErrorBox(form) {
    let box = document.getElementById('loginErro');
    if (!box) {
      box = document.createElement('div');
      box.id = 'loginErro';
      box.style.display = 'none';
      box.style.color = '#b91c1c';
      box.style.margin = '8px 0';
      box.style.fontSize = '14px';
      form.appendChild(box);
    }
    return box;
  }

  function traduz(err) {
    const m = (err?.message || '').toLowerCase();
    const s = err?.status || err?.cause?.status;
    if (m.includes('invalid login credentials')) return 'Usuário ou senha inválidos.';
    if (m.includes('email not confirmed')) return 'E-mail não confirmado. Verifique sua caixa de entrada.';
    if (s === 429 || m.includes('rate limit')) return 'Muitas tentativas. Aguarde e tente novamente.';
    if (s >= 500) return 'Serviço indisponível no momento. Tente novamente.';
    return 'Não foi possível entrar. Verifique os dados e tente novamente.';
  }

  // identifica se é email, cpf ou ra
  function parseIdent(v) {
    const raw = (v || '').trim();
    if (!raw) return null;
    if (raw.includes('@')) return { type: 'email', value: raw.toLowerCase() };
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11) return { type: 'cpf', value: digits };
    return { type: 'ra', value: raw.toUpperCase() };
  }

  // para RA/CPF, buscar o email na tabela alunos
  async function resolveEmail(ident) {
    if (ident.type === 'email') return ident.value;
    const { data, error } = await sb
      .from('alunos')
      .select('email')
      .eq(ident.type, ident.value)
      .single();
    if (error || !data?.email) {
      const label = ident.type.toUpperCase();
      throw new Error(`${label} não encontrado.`);
    }
    return String(data.email).toLowerCase();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form.login-form'); // <- seu HTML
    const userEl = document.getElementById('ra');           // RA/CPF/E-mail
    const passEl = document.getElementById('senha');        // Senha
    const btn    = document.querySelector('.btn-login');

    if (!form || !userEl || !passEl) {
      console.error('Login: elementos não encontrados no DOM.');
      return;
    }
    if (!sb || !sb.auth) {
      const box = ensureErrorBox(form);
      box.textContent = 'Conexão com o servidor indisponível.';
      box.style.display = 'block';
      return;
    }

    const msgEl = ensureErrorBox(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msgEl.style.display = 'none';
      msgEl.textContent = '';

      const ident = parseIdent(userEl.value);
      const password = passEl.value || '';

      if (!ident || !password) {
        msgEl.textContent = 'Informe o usuário (RA/CPF/E-mail) e a senha.';
        msgEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Entrando...';

      try {
        const email = await resolveEmail(ident);
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error || !data?.session) throw error || new Error('Credenciais inválidas.');
        // redireciona após sucesso
        window.location.href = '/Projeto/1-html/11-portaldoaluno.html';
      } catch (err) {
        console.error(err);
        msgEl.textContent = traduz(err);
        msgEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'ENTRAR';
      }
    });
  });
})();
