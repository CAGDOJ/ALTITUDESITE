# corrigir-email-cadastro — V37

Edge Function pública usada somente para contas de aluno cujo e-mail ainda não foi confirmado.

Valida CPF + data de nascimento + senha cadastrada antes de:
- corrigir o e-mail digitado incorretamente; ou
- reenviar a confirmação para o endereço atual.

Secrets necessários: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SITE_URL`.
