# Edge Function `gerenciar-gestor`

Publicação:

```bash
supabase functions deploy gerenciar-gestor
```

A função usa automaticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente do Supabase.

Ela permite:

- configurar o primeiro gestor quando a tabela `gestores` estiver vazia;
- criar usuários no Supabase Auth e no perfil `gestores`;
- atualizar cargo, nível, status e senha de acessos existentes.
