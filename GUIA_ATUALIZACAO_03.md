# ALTITUDE — Atualização 03

Esta atualização corrige os pontos identificados no Portal do Aluno e no Portal de Gestão.

## O que foi corrigido

- Botão do menu móvel alinhado no mesmo lugar nas páginas públicas, no Portal do Aluno e no Portal de Gestão.
- Barra lateral da gestão ocupando toda a altura da tela.
- Modais da gestão acima da barra lateral, sem conteúdo escondido.
- Avaliação visível quando o aluno chega a 100% do curso.
- Botão adicional **Fazer prova agora** ao concluir o conteúdo.
- Provas antigas ligadas apenas ao módulo são novamente vinculadas ao curso.
- Cargas horárias limitadas a 5, 10, 15... até 200 horas.
- Login separado do gestor por ID institucional e senha.
- Prioridade dos chamados removida do formulário do aluno e controlada pelo gestor.
- QR Code individual na carteirinha digital.
- Página pública para validar a carteirinha.
- Bucket `fotos_alunos` e políticas para o aluno enviar a própria foto.
- Cadastro público preparado para funcionar mesmo com confirmação de e-mail habilitada.

## 1. Atualizar o banco

No Supabase, abra **SQL Editor**, cole todo o arquivo:

`ATUALIZACAO_03_ACESSOS_AJUSTES.sql`

Execute somente depois das atualizações 01 e 02.

A atualização cria automaticamente:

- tabela `gestores`;
- tabela `chamado_interacoes`;
- código único da carteirinha;
- bucket `fotos_alunos`;
- regras de acesso;
- funções de login e validação;
- restrição de carga horária de 5h a 200h.

## 2. Publicar a função de gestão

A criação e alteração de contas de gestores precisam ocorrer no servidor. A função está em:

`supabase/functions/gerenciar-gestor`

Com a Supabase CLI conectada ao projeto, execute:

```bash
supabase functions deploy gerenciar-gestor
```

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas pelo ambiente das Edge Functions do Supabase.

## 3. Configurar o primeiro gestor

1. Publique os arquivos atualizados do site.
2. Abra:
   `https://www.portalaltitude.com.br/Projeto/1-html/14-login-gestor.html`
3. Clique em **Configurar o primeiro gestor**.
4. Informe uma conta que já exista no Supabase Auth, o nome e o ID institucional desejado.
5. Exemplo de ID: `GST-2026-0001`.
6. Depois disso, o acesso normal será feito apenas com o ID de gestor e a senha.

A configuração inicial funciona somente quando a tabela `gestores` ainda está vazia. O primeiro gestor recebe nível 4.

## 4. Criar outros acessos

No Portal de Gestão, entre em **Equipe e acessos**. Somente um gestor de nível 4 pode criar ou alterar contas.

Cada gestor recebe:

- ID institucional;
- senha;
- nome;
- e-mail;
- cargo;
- nível de acesso;
- situação ativa ou inativa.

## 5. Testar a conclusão de um curso

O curso precisa ter:

- curso publicado;
- módulo publicado;
- conteúdo ou PDF;
- prova vinculada ao curso;
- pelo menos uma questão.

Teste nesta ordem:

1. Matricule um aluno.
2. Abra o curso no Portal do Aluno.
3. Marque todos os módulos como concluídos.
4. Ao chegar a 100%, use **Fazer prova agora**.
5. Alcance a nota mínima.
6. Abra **Certificados** e emita o documento.

Se aparecer “A prova ainda não foi cadastrada”, abra o curso na gestão, entre no módulo e crie uma prova com questões. A atualização corrige provas antigas que já tinham `modulo_id`, mas não pode adivinhar a qual curso pertence uma prova totalmente sem vínculo.

## 6. Testar a foto

Depois de executar o SQL:

1. Saia e entre novamente no Portal do Aluno.
2. Abra **Meu cadastro**.
3. Escolha JPG, PNG ou WEBP com até 5 MB.
4. Clique em **Salvar alterações**.

O caminho do arquivo fica dentro da pasta do próprio usuário no bucket `fotos_alunos`.

## 7. Validar a carteirinha

A carteirinha recebe um QR Code individual. Ao escanear, será aberta a página:

`13-validar-carteirinha.html?codigo=...`

A consulta pública mostra somente os dados necessários para confirmar a validade. CPF, telefone e e-mail não são expostos.

## 8. Atualizar os arquivos do site

Substitua o conteúdo publicado pelo ZIP desta versão. Depois, limpe o cache com `Ctrl + F5` ou teste em uma janela anônima.
