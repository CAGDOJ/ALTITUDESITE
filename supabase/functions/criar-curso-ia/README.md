# Edge Function `criar-curso-ia`

Gera um curso completo em rascunho, módulos, apostilas em PDF, prova e capa opcional.

## Secrets obrigatórios

- `OPENAI_API_KEY`
- `GESTOR_EMAILS` (recomendado; e-mails separados por vírgula)

Secrets opcionais:

- `OPENAI_TEXT_MODEL` (padrão: `gpt-5-mini`)
- `OPENAI_IMAGE_MODEL` (padrão: `gpt-image-1-mini`)

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas no ambiente das Edge Functions do Supabase.
