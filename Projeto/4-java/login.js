/* ===== Login Altitude (RA/CPF/E-mail + senha) — Supabase (UMD) ===== */
/** PREENCHA COM OS DADOS DO SEU PROJETO (usando os que você já tinha) **/
const SUPABASE_URL = 'https://mxnvrxqwokvelulzdvmn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bnZyeHF3b2t2ZWx1bHpkdm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NTQ4MjAsImV4cCI6MjA3MDQzMDgyMH0.DBntQQc91IWYAvMxHknJxjxxFAl5kiWOkc1LUXe_vKE';
/* =================================================================== */

// cliente do Supabase (usa o UMD carregado no HTML)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// caixinha de erro abaixo do botão, se não existir
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

// identifica se o que o usuário digitou é e-mail, CPF ou RA
function parseIdent(v) {
  const raw = (v || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return { type: 'email', value: raw.toLowerCase() };
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return { type: 'cpf', value: digits };
  return { type: 'ra', value: raw.toUpperCase() };
}

// RA/CPF -> descobre e-mail na tabela 'alunos'
async function resolveEmail(ident) {
  if (ident.type === 'email') return ident.value;
  const { data, error } = await sb.from('alunos').select('email').eq(ident.type, ident.value).single();
  if (error || !data?.email) throw new Error(`${ident.type.toUpperCase()} não encontrado.`);
  return String(data.email).toLowerCase();
}

document.addEventListener('DOMContentLoaded', () => {
  // SELETORES compatíveis com seu 4-login.html
  const form   = document.querySelector('form.login-form');
  const userEl = document.getElementById('ra');     // RA / CPF / E-mail
  const passEl = document.getElementById('senha');  // Senha
  const btn    = document.querySelector('.btn-login');

  if (!form || !emailEl || !passEl) {
    console.error('Login: elementos não encontrados no DOM.');
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
