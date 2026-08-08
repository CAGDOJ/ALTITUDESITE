// Lógica de login (RA/CPF/E-mail + senha)
(function () {
  const sb = window.sb;

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
    if (m.includes('e-mail não cadastrado') || m.includes('email não cadastrado')) return 'E-mail não cadastrado.';
    if (m.includes('senha incorreta')) return 'Senha incorreta ou e-mail ainda não confirmado.';
    if (m.includes('não encontrado')) return err.message;
    if (m.includes('invalid login credentials')) return 'Senha incorreta ou e-mail ainda não confirmado.';
    if (m.includes('email not confirmed')) return 'E-mail não confirmado. Verifique sua caixa de entrada.';
    if (s === 429 || m.includes('rate limit')) return 'Muitas tentativas. Aguarde e tente novamente.';
    if (s >= 500) return 'Serviço indisponível no momento. Tente novamente.';
    return 'Não foi possível entrar. Verifique os dados e tente novamente.';
  }

  function parseIdent(v) {
    const raw = (v || '').trim();
    if (!raw) return null;
    if (raw.includes('@')) return { type: 'email', value: raw.toLowerCase() };
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11) return { type: 'cpf', value: digits };
    return { type: 'ra', value: raw.toUpperCase() };
  }

  async function resolveEmail(ident) {
    if (ident.type === 'email') return ident.value;
    const { data, error } = await sb.rpc('resolver_email_aluno', { p_identificador: ident.value });
    if (error || !data) throw new Error(`${ident.type.toUpperCase()} não encontrado.`);
    return String(data).toLowerCase();
  }

  async function emailCadastrado(email) {
    try {
      const { data, error } = await sb.rpc('verificar_cadastro_aluno', { p_email: String(email || '').trim().toLowerCase(), p_cpf: '' });
      if (error) return null;
      return Boolean(data?.email_existe);
    } catch (_) { return null; }
  }

  function mostrarSituacaoCadastro(form) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cadastro') !== 'sucesso') return;
    let box = document.getElementById('loginSituacao');
    if (!box) {
      box = document.createElement('div');
      box.id = 'loginSituacao';
      box.className = 'login-situation';
      form.parentNode?.insertBefore(box, form);
    }
    const email = params.get('email') || 'seu e-mail';
    const safeEmail = String(email).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    const pendente = params.get('confirmacao') === 'pendente';
    box.innerHTML = pendente
      ? `<strong>Cadastro concluído.</strong><span>Antes de entrar, confirme o e-mail enviado para ${safeEmail}. Depois volte aqui e faça o login.</span>`
      : `<strong>Cadastro concluído.</strong><span>Seu acesso já está liberado. Entre abaixo com e-mail, CPF ou RA e sua senha.</span>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form   = document.querySelector('form.login-form');
    const userEl = document.getElementById('ra');     // RA/CPF/E-mail
    const passEl = document.getElementById('senha');  // Senha
    const btn    = document.querySelector('.btn-login');
    if (!form || !userEl || !passEl) return;

    const msgEl = ensureErrorBox(form);
    mostrarSituacaoCadastro(form);

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

      btn.disabled = true; btn.textContent = 'Entrando...';

      try {
        const email = await resolveEmail(ident);
        if (ident.type === 'email') {
          const existe = await emailCadastrado(email);
          if (existe === false) throw new Error('E-mail não cadastrado.');
        }
        await sb.auth.signOut({ scope: 'local' }).catch(() => {});
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error || !data?.session) {
          if ((error?.message || '').toLowerCase().includes('invalid login credentials')) {
            throw new Error('Senha incorreta ou e-mail ainda não confirmado.');
          }
          throw error || new Error('Credenciais inválidas.');
        }
        const params = new URLSearchParams(window.location.search);
        const cursoId = Number(params.get('curso') || localStorage.getItem('altitude_curso_pendente'));
        if (cursoId) {
          const { error: matriculaError } = await sb.rpc('matricular_em_curso', { p_curso_id: cursoId });
          if (matriculaError) console.warn('Matrícula automática não concluída:', matriculaError);
          localStorage.removeItem('altitude_curso_pendente');
          window.location.href = `/portaldoaluno/?curso=${cursoId}`;
        } else {
          window.location.href = '/portaldoaluno/';
        }
      } catch (err) {
        console.error(err);
        msgEl.textContent = traduz(err);
        msgEl.style.display = 'block';
      } finally {
        btn.disabled = false; btn.textContent = 'ENTRAR';
      }
    });
  });
})();
