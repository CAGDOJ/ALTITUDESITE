/* ================================================
   LOGIN – Altitude (Supabase Auth)
   Feito para a página 4-login e cadastro.html
   - Usa os campos: #email, #password
   - Intercepta o submit do <form class="registration-form">
   - Redireciona ao Portal do Aluno após login
   ================================================ */

/** 1) Coloque os dados do seu projeto Supabase **/
const SUPABASE_URL = 'COLOQUE_AQUI_SUA_URL';
const SUPABASE_ANON_KEY = 'COLOQUE_AQUI_SUA_ANON_KEY';

/** 2) Para onde redirecionar após login bem-sucedido **/
const DEFAULT_REDIRECT = '../1-html/portal-aluno.html'; // ajuste o caminho do seu portal

// ================================================
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function $(sel, el=document){ return el.querySelector(sel); }

function showError(msg){
  // Mostra mensagem simples logo abaixo do botão
  let box = $('#login-error');
  if(!box){
    box = document.createElement('div');
    box.id = 'login-error';
    box.style.marginTop = '10px';
    box.style.color = '#b91c1c';
    box.style.background = '#fee2e2';
    box.style.border = '1px solid #fecaca';
    box.style.padding = '8px 10px';
    box.style.borderRadius = '8px';
    $('.registration-form').appendChild(box);
  }
  box.textContent = msg;
}

function clearError(){
  const box = $('#login-error');
  if(box) box.remove();
}

function getNextUrl(){
  const p = new URLSearchParams(location.search);
  const next = p.get('next');
  if(next && /^\/|^\.\.\//.test(next)) return next; // aceita "/..." ou "../..."
  return DEFAULT_REDIRECT;
}

async function doLogin(email, password){
  // Tenta logar
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if(error){
    // Erro “padrão” ou necessidade de verificação de e-mail
    if(error.message && /email|confirm/i.test(error.message)){
      throw new Error('Verifique seu e‑mail para confirmar a conta e tente novamente.');
    }
    throw new Error('Não foi possível entrar. Confira e‑mail e senha e tente novamente.');
  }

  // Se o projeto exige confirmação de e-mail, data.session pode vir null.
  if(!data || !data.session){
    throw new Error('Conta criada, mas é necessário confirmar o e‑mail antes de entrar.');
  }

  // OK -> redireciona
  location.href = getNextUrl();
}

window.addEventListener('DOMContentLoaded', ()=>{
  const form = $('.registration-form');
  if(!form){
    console.warn('[login] Formulário .registration-form não encontrado.');
    return;
  }

  form.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    clearError();

    const email = $('#email')?.value?.trim().toLowerCase();
    const password = $('#password')?.value ?? '';

    if(!email || !password){
      showError('Informe e‑mail e senha.');
      return;
    }

    // (Opcional) Validação de tamanho da senha
    if(password.length < 6){
      showError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    // Desabilita o botão para evitar cliques múltiplos
    const btn = $('button[type="submit"]', form);
    const oldText = btn?.textContent;
    if(btn){ btn.disabled = true; btn.textContent = 'Entrando…'; }

    try{
      await doLogin(email, password);
    }catch(err){
      showError(err.message || 'Falha no login.');
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = oldText || 'Fazer Login'; }
    }
  });
});
