# ALTITUDE — Instalação da versão final limpa V13

Esta versão reúne as correções das versões anteriores em um único pacote. Não execute novamente os SQL antigos depois de aplicar o arquivo final.

## 1. Faça backup

No Supabase, exporte ou faça uma cópia do banco antes da atualização. No GitHub, preserve uma cópia da versão atual do site.

## 2. Atualize o banco

1. Abra **Supabase → SQL Editor → New query**.
2. Cole todo o conteúdo de `SUPABASE_ATUALIZACAO_FINAL_V13.sql`.
3. Clique em **Run**.
4. O resultado esperado é:

```text
Atualização final V13 aplicada com sucesso
```

O SQL pode ser executado novamente caso a conexão seja interrompida, pois foi preparado para ser idempotente.

## 3. Publique o site

Substitua os arquivos atuais do repositório pelo conteúdo deste pacote, mantendo:

- `index.html` na raiz;
- a pasta `Projeto` completa;
- `CNAME` e `.nojekyll` na raiz.

Depois aguarde o GitHub Pages finalizar o deploy e atualize o navegador com `Ctrl + F5`.

## 4. Retire a confirmação obrigatória por e-mail

Essa opção não pode ser alterada por SQL. Faça manualmente:

1. **Supabase → Authentication → Providers → Email**;
2. desative **Confirm email**;
3. salve.

O cadastro continuará usando e-mail e senha para o login do aluno, mas a pessoa entrará imediatamente, sem clicar em mensagem de confirmação.

## 5. Acesso do gestor

O acesso continua sendo exibido ao gestor como:

```text
ID: GST-2026-0001
Senha: senha cadastrada no Supabase Auth
```

Internamente, o Supabase Auth usa o usuário associado a `altitudesecretaria@gmail.com`, mas a tela pública não exige que o gestor digite o e-mail.

## 6. Criador de cursos

Há três opções:

1. **Manual:** criar curso, módulos, conteúdo, PDFs, materiais e prova no gestor;
2. **Importar JSON gratuitamente:** gerar o conteúdo em uma conversa gratuita e colar o JSON no portal;
3. **IA pela API:** gerar o curso inteiro ou somente a capa. Essa opção depende de créditos da API.

A Edge Function atualizada está em:

```text
supabase/functions/criar-curso-ia/index.ts
```

Se usar a API, publique novamente a função `criar-curso-ia`. O modo gratuito de importação por JSON não depende da Edge Function.

## 7. Apostilas incluídas

O pacote já contém os PDFs:

- `Projeto/5-materiais/apostila-modulo-1-fundamentos-do-computador-e-sistema-operacional.pdf`
- `Projeto/5-materiais/apostila-modulo-2-internet-comunicacao-e-produtividade-digital.pdf`

O SQL associa os arquivos aos módulos correspondentes do curso **Informática Básica para Iniciantes** quando esse curso existir no banco.

## 8. Teste recomendado

1. Cadastre ou use um aluno;
2. matricule-o em um curso publicado;
3. abra os módulos e PDFs;
4. conclua os módulos e faça a prova;
5. avalie o curso;
6. solicite uma quantidade parcial de horas;
7. entre como gestor e libere o certificado;
8. confirme que o PDF e o QR Code só aparecem depois da liberação;
9. abra e responda um chamado;
10. teste em celular e tablet.

## Observação

A estrutura, os arquivos e a sintaxe foram validados localmente. O SQL não foi executado no seu Supabase ativo porque isso exige acesso administrativo à sua conta.
