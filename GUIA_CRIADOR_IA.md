# Criador de cursos com IA — ALTITUDE

## Funcionamento

Na aba **Criar curso com IA**, o gestor informa:

- tema e instruções;
- categoria;
- nível;
- carga horária;
- quantidade de módulos;
- quantidade de questões;
- se deseja gerar a capa.

A função cria:

- curso como rascunho;
- descrição, público-alvo e objetivos;
- módulos e conteúdo completo;
- apostila PDF de cada módulo;
- prova vinculada ao curso;
- questões, alternativas, gabarito e explicações;
- capa horizontal do curso, quando selecionada.

Nada é publicado automaticamente. O gestor revisa e usa o botão **Publicar**.

## Configuração no Supabase

Na pasta do projeto, com o Supabase CLI configurado:

```bash
supabase functions deploy criar-curso-ia
```

Cadastre os secrets no servidor:

```bash
supabase secrets set OPENAI_API_KEY="SUA_CHAVE"
supabase secrets set GESTOR_EMAILS="seu-email@dominio.com"
```

Também podem ser definidos, opcionalmente:

```bash
supabase secrets set OPENAI_TEXT_MODEL="gpt-5-mini"
supabase secrets set OPENAI_IMAGE_MODEL="gpt-image-1-mini"
```

## Segurança

- A chave da OpenAI fica somente nos secrets da Edge Function.
- A chave não aparece no HTML ou no JavaScript público.
- A função exige usuário autenticado.
- `GESTOR_EMAILS` limita quem pode usar a criação por IA.
- A gravação no banco é feita no servidor.
- Todos os cursos gerados começam com `publicado = false`.

## Revisão recomendada

Antes de publicar:

1. Leia o conteúdo dos módulos.
2. Abra os PDFs gerados.
3. Confira a carga horária.
4. Revise a capa.
5. Verifique todas as questões e respostas corretas.
6. Confirme se a prova está vinculada ao curso.
7. Clique em **Publicar** somente após aprovar o material.
