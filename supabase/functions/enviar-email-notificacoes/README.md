# Edge Function `enviar-email-notificacoes`

Envia as notificações transacionais armazenadas em `public.email_notificacoes` usando a API da Resend.

## Secrets obrigatórios

- `EMAIL_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

## Secret opcional

- `SITE_URL` (padrão: `https://www.portalaltitude.com.br`)

Publicação:

```bash
supabase functions deploy enviar-email-notificacoes
```

A função deve ser acionada por um Database Webhook da tabela `public.email_notificacoes` e receber o cabeçalho `x-altitude-webhook` com o mesmo valor de `EMAIL_WEBHOOK_SECRET`.
