import { supabase } from './supabaseClient.js';

const form = document.querySelector('.registration-form');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // pega os valores dos inputs (ids iguais aos da sua imagem)
  const nome     = document.querySelector('#name').value.trim();
  const email    = document.querySelector('#email').value.trim();
  const senha    = document.querySelector('#password').value;
  const telefone = document.querySelector('#phone').value.trim();
  const objetivo = document.querySelector('#objective').value.trim();

  try {
    // 1) cria o usuário no Auth
    const { data: signUp, error: e1 } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } }
    });
    if (e1) throw e1;

    const user = signUp.user;
    if (!user) {
      alert('Cadastro criado! Confirme o e-mail e depois faça login.');
      return; // <<< dentro da função (sem erro de "illegal return")
    }

    // 2) grava os dados na tabela 'alunos' usando os NOMES DAS COLUNAS do BD
    const { error: e2 } = await supabase
      .from('alunos')
      .upsert(
        { user_id: user.id, nome, email, telefone, objetivo },
        { onConflict: 'user_id' }
      );
    if (e2) throw e2;

    alert('Cadastro realizado com sucesso!');
    form.reset();
    // redirecionar se quiser:
    // location.href = '/area-aluno/index.html';

  } catch (err) {
    console.error(err);
    alert('Erro: ' + (err.message || 'Tente novamente.'));
  }
});
