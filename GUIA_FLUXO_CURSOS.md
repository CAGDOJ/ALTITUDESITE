# Fluxo completo dos cursos — ALTITUDE

## 1. O que o gestor faz

Na aba **Cursos e conteúdos**, o trabalho segue uma ordem única:

1. Criar o curso manualmente ou pela IA.
2. Informar nome, categoria, carga horária, nível, nota mínima e capa.
3. Criar os módulos na ordem correta.
4. Escrever o conteúdo do módulo.
5. Gerar a apostila em PDF ou anexar um PDF próprio.
6. Adicionar imagens, vídeos, áudios ou links quando forem úteis.
7. Criar a prova e cadastrar as questões A, B, C e D.
8. Revisar tudo.
9. Clicar em **Publicar**.

O botão Publicar impede a liberação quando faltar capa, carga horária, módulo, conteúdo/PDF, material, prova ou questões. Ao confirmar, os módulos também ficam disponíveis para os alunos.

## 2. O que aparece no site

Somente cursos com `publicado = true` aparecem em **Cursos Profissionais**.

Cada card mostra:

- foto de capa;
- nome alinhado;
- categoria e nível;
- carga horária exata;
- avaliação por estrelas;
- quantidade de avaliações;
- módulos;
- matrículas;
- acessos/cliques;
- selo **Em alta** quando marcado pelo gestor ou quando o curso ganha popularidade.

A página também cria caixas de filtro com todas as cargas horárias existentes no banco.

## 3. Inscrição do aluno

1. O aluno abre os detalhes do curso.
2. Clica em **Inscrever-se neste curso**.
3. Caso não esteja autenticado, vai para o login e o curso fica salvo para finalizar a inscrição.
4. A função `matricular_em_curso` cria ou reativa a matrícula.
5. O aluno é levado ao Portal do Aluno com o curso aberto.

## 4. Estudo e conclusão

O Portal do Aluno mostra somente cursos em que o usuário está matriculado.

Dentro do curso, o aluno encontra:

- texto escrito pelo gestor;
- apostilas em PDF;
- imagens;
- vídeos;
- áudios;
- links complementares.

Cada módulo concluído atualiza `progresso_modulos` e o percentual da matrícula. Ao concluir todos os módulos, a prova é liberada.

## 5. Prova

- A prova aparece uma questão por vez.
- O gabarito não é enviado ao navegador.
- A função `finalizar_prova` corrige no Supabase.
- A nota mínima vem do próprio curso.
- O aluno pode refazer a avaliação quando não for aprovado.

## 6. Certificado

Após 100% de progresso e aprovação:

1. O aluno solicita o certificado.
2. O Supabase valida matrícula, progresso e resultado.
3. É criado um código UUID único.
4. O PDF recebe nome do aluno, curso, carga horária, nota, logo, número e QR Code.
5. O QR Code abre a página pública de autenticação.
6. A página consulta o banco e mostra se o documento está emitido, bloqueado, cancelado ou inexistente.

## 7. Arquivos principais

- `Projeto/1-html/2-profissional.html`
- `Projeto/2-css/2-profissinal.css`
- `Projeto/4-java/cursos-profissionais.js`
- `Projeto/1-html/11-portaldoaluno.html`
- `Projeto/4-java/portaldoaluno.js`
- `Projeto/1-html/12-portaldogestor.html`
- `Projeto/4-java/12-portaldogestor.js`
- `Projeto/4-java/gestor-enhancements.js`
- `ATUALIZACAO_02_FLUXO_CURSOS.sql`
