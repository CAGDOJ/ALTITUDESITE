/* ===== Login Supabase (UMD, sem modules) ===== */

/** PREENCHA COM O SEU PROJETO (estes são os seus dados do print/keys) **/
const SUPABASE_URL = 'https://mxnvrxqwokvelulzdvmn.supabase.co'; // <- URL do seu projeto
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bnZyeHF3b2t2ZWx1bHpkdm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NTQ4MjAsImV4cCI6MjA3MDQzMDgyMH0.DBntQQc91IWYAvMxHknJxjxxFAl5kiWOkc1LUXe_vKE';
/** ================================================================== **/

// usa o UMD global já incluído no HTML
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// cria a caixinha de erro se não existir
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
  // seu HTML tem <form class="registration-form">, #email e #password
  const form = document.querySelector('form.registration-form');
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');

  if (!form || !emailEl || !passEl) {
    console.error('Login: elementos não encontrados no DOM.');
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

      // ✅ redireciona para o portal (ajuste o caminho conforme sua pasta)
      window.location.href = './portaldoaluno.html';

    } catch (err) {
      console.error(err);
      msgEl.textContent = 'Erro ao tentar entrar. Tente novamente.';
      msgEl.style.display = 'block';
    }
  });
});
