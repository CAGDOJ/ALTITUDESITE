# Implementação do Portal do Aluno — ALTITUDE

## 1. Aplicar o banco de dados

1. Abra o projeto no Supabase.
2. Entre em **SQL Editor**.
3. Abra o arquivo `supabase/migrations/001_portal_aluno_certificados.sql`.
4. Copie todo o conteúdo, cole no editor e execute.

Esse script:

- cria progresso por módulo;
- esconde o gabarito das provas do navegador;
- corrige as provas dentro do banco;
- permite novas tentativas;
- emite certificado somente para aluno aprovado;
- cria código único de validação;
- disponibiliza validação pública pelo QR Code;
- adiciona relacionamentos e índices que faltavam.

## 2. Publicar os arquivos

Suba o projeto completo para o mesmo local em que o site já está hospedado. Os arquivos principais alterados são:

- `Projeto/1-html/11-portaldoaluno.html`
- `Projeto/2-css/11-portaldoaluno.css`
- `Projeto/4-java/portaldoaluno.js`
- `Projeto/1-html/8-certificados.html`
- `Projeto/2-css/8-certificados.css`
- `Projeto/4-java/validar-certificado.js`

## 3. Preparar um curso para teste

No portal do gestor ou diretamente no Supabase:

1. Cadastre um curso e marque `publicado = true`.
2. Crie pelo menos um módulo e marque `publicado = true`.
3. Adicione PDF, vídeo ou material ao módulo.
4. Crie uma prova para o curso.
5. Cadastre questões com alternativas A, B, C e D e informe a correta.
6. Matricule um aluno no curso.

## 4. Fluxo entregue

1. O aluno abre o curso.
2. Estuda cada módulo e marca como concluído.
3. Ao atingir 100%, a prova é liberada.
4. A prova aparece uma questão por vez.
5. O banco corrige sem enviar o gabarito ao navegador.
6. Com nota mínima de 70%, o certificado é liberado.
7. O PDF recebe nome, curso, carga horária, logo, número e QR Code.
8. O QR abre a página pública de validação.

## Observação importante

A segurança do certificado depende da execução da migração SQL. Apenas trocar os arquivos HTML/JS não cria as funções e colunas necessárias no Supabase.

## Segurança aplicada

- alunos não podem inserir ou alterar certificados diretamente;
- alunos não podem fabricar resultados de provas pela tabela;
- emissão e correção são feitas por funções `SECURITY DEFINER`;
- o validador público não libera CPF, e-mail ou telefone;
- certificados cancelados ou bloqueados aparecem como inválidos;
- a emissão usa uma fotografia dos nomes do aluno e do curso para preservar o documento mesmo após futuras alterações cadastrais.

## Regra atual de emissão

Nesta versão, o certificado é liberado sem cobrança adicional quando o aluno atinge 100% do conteúdo e nota mínima de 70%. A aba de pagamentos foi mantida para o histórico e para futuras integrações comerciais.
