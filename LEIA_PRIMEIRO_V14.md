# ALTITUDE — INSTALAÇÃO DA V14

Esta versão corrige o ciclo de liberação do certificado, atualização do Portal do Aluno, avaliação por estrelas, recuperação de senha, favicon e separação do catálogo.

## Ordem correta

1. Abra o Supabase e entre em **SQL Editor**.
2. Crie uma consulta nova.
3. Cole todo o arquivo `SUPABASE_ATUALIZACAO_FINAL_V14.sql`.
4. Clique em **Run**.
5. Confirme o resultado: `Atualização final V14 aplicada com sucesso`.
6. Substitua os arquivos do GitHub Pages pelo conteúdo desta pasta/ZIP.
7. Aguarde o deploy e atualize o navegador com `Ctrl + F5`.

## Certificado que ainda aparece BLOQUEADO

Depois de executar o SQL e publicar o site:

1. Entre no Portal do Gestor.
2. Abra **Certificados**.
3. Clique novamente em **Validar e liberar**.
4. O registro deve mudar imediatamente para **EMITIDO**.
5. Em até 5 segundos, o Portal do Aluno exibirá:
   - total de certificados emitidos;
   - cartão do certificado;
   - botão **Baixar PDF**;
   - botão **Validar**.

## Recuperação de senha

A página pública não apresenta mais link para a gestão. O aluno informa RA, CPF ou e-mail, recebe um link seguro e define uma senha com no mínimo 8 caracteres.

No Supabase, confirme em **Authentication > URL Configuration** que a URL de redirecionamento inclui:

`https://www.portalaltitude.com.br/Projeto/1-html/4-login.html?recovery=1`

## Catálogo

A página Cursos possui duas abas:

- Cursos Profissionais;
- Cursos Técnicos.

No gestor, cada curso possui o campo **Tipo de formação**. Cursos existentes ficam como PROFISSIONAL por padrão.

## Favicon

A nuvem foi redesenhada inteira, com margem transparente, e aplicada a todas as páginas e ao manifesto do site. Caso o navegador mostre o ícone antigo, feche a aba, limpe o cache e abra novamente.
