document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("form-cadastro");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = document.getElementById("nome").value;
    const cpf = document.getElementById("cpf").value;
    const nascimento = document.getElementById("nascimento").value;
    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    try {
      // 1. cria usuário no auth
      const { data, error } = await sb.auth.signUp({
        email: email,
        password: senha,
      });

      if (error) {
        alert("Erro: " + error.message);
        return;
      }

      // 2. salva dados na tabela alunos
      await sb.from("alunos").insert([
        {
          user_id: data.user.id,
          nome: nome,
          cpf: cpf,
          nascimento: nascimento,
          email: email,
        },
      ]);

      alert("Cadastro realizado com sucesso!");
      window.location.href = "/Projeto/1-html/4-login.html";

    } catch (err) {
      console.error(err);
      alert("Erro inesperado");
    }
  });
});