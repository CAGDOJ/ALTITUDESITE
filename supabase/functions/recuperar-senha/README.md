# recuperar-senha

Envia o link de redefinição de senha do aluno. Quando `RESEND_API_KEY` e `EMAIL_FROM` estão configurados, usa o mesmo provedor transacional do Portal Altitude; caso contrário, usa o e-mail padrão do Supabase.

## Deploy

```bash
supabase functions deploy recuperar-senha
```

## Secrets

```bash
supabase secrets set SITE_URL=https://www.portalaltitude.com.br
supabase secrets set RESEND_API_KEY=...
supabase secrets set EMAIL_FROM="Altitude <contato@seudominio.com>"
```
