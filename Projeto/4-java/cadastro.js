import { supabase } from './supabaseClient.js';

const form = document.querySelector('.registration-form');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nome = document.querySelector('#name').value;
  const email = document.querySelector('#email').value;
  const senha = document.querySelector('#password').value;
  const telefone = document.querySelector('#phone').value;
  const objetivo = document.querySelector('#objective').value;

  // Cadastro no auth
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: senha
  });

  if (error) {
    alert('Erro ao cadastrar: ' + error.message);
    return;
  }

  const userId = data.user.id;

  // Inserção na tabela alunos
  const { error: insertError } = await supabase
    .from('alunos')
    .insert([{ id: userId, nome, email, telefone, objetivo }]);

  if (insertError) {
    alert('Erro ao salvar dados: ' + insertError.message);
    return;
  }

  alert('Cadastro realizado com sucesso!');
  form.reset();
});
