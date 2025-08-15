/* ===== Login Supabase (sem módulos / usando UMD global) ===== */

/** 1) DADOS DO SEU PROJETO SUPABASE **/
const SUPABASE_URL = 'https://mxnvrxqwokvelulzdvmn.supabase.co';   // <<< URL correta
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bnZyeHF3b2t2ZWx1bHpkdm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NTQ4MjAsImV4cCI6MjA3MDQzMDgyMH0.DBntQQc91IWYAvMxHknJxjxxFAl5kiWOkc1LUXe_vKE';
/** ============================================================ **/

// cria client a partir do UMD global
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// helper: cria/pega área de erro abaixo do form
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
  // seu HTML usa .registration-form, #email e #password
  const form   = document.querySelector('form.registration-form');
  const email  = document.getElementById('email');
  const pass   = document.getElementById('password');
  if (!form || !email || !pass) {
    console.error('Login: elementos não encontrados no DOM.');
    return;
  }
  const msg = ensureErrorBox(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.style.display = 'none';
    msg.textContent = '';

    const emailVal = (email.value || '').trim().toLowerCase();
    const passVal  = pass.value || '';
    if (!emailVal || !passVal) {
      msg.textContent = 'Informe e‑mail e senha.';
      msg.style.display = 'block';
      return;
    }

    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: emailVal, password: passVal });
      if (error || !data?.session) {
        msg.textContent = 'Não foi possível entrar. Verifique os dados e tente novamente.';
        msg.style.display = 'block';
        return;
      }

      // redireciona para o portal (ajuste o caminho se precisar)
      window.location.href = '../1-html/portaldoaluno.html';

    } catch (err) {
      console.error(err);
      msg.textContent = 'Erro ao tentar entrar. Tente novamente.';
      msg.style.display = 'block';
    }
  });
});
