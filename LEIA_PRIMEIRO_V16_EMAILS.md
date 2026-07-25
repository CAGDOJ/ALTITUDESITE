# ALTITUDE — V16: e-mails de certificados e chamados

## O que esta atualização envia

- Novo chamado: e-mail para a secretaria/gestor.
- Resposta, mudança de prioridade ou status do chamado: e-mail para o aluno.
- Certificado em contagem automática: e-mail para o aluno.
- Certificado emitido: e-mail para o aluno com aviso de PDF/QR Code disponível.
- Certificado bloqueado ou cancelado: e-mail para o aluno.

## Serviço gratuito recomendado

Use o Resend. O plano gratuito atual permite até 3.000 e-mails por mês, com limite de 100 por dia.
Para enviar para os e-mails dos alunos, verifique seu domínio no Resend. O domínio de teste resend.dev só envia para o próprio e-mail da conta.

## 1. Resend

1. Crie uma conta no Resend.
2. Em Domains, adicione de preferência `mail.portalaltitude.com.br`.
3. Copie os registros SPF e DKIM mostrados pelo Resend para o DNS da Hostinger.
4. Aguarde o domínio ficar como Verified.
5. Crie uma API Key com permissão de envio.

## 2. Secrets no Supabase

Em Edge Functions > Secrets, adicione:

- `RESEND_API_KEY` = chave `re_...`
- `EMAIL_FROM` = `Instituição Altitude <notificacoes@mail.portalaltitude.com.br>`
- `EMAIL_WEBHOOK_SECRET` = uma senha aleatória longa, por exemplo 40 caracteres
- `SITE_URL` = `https://www.portalaltitude.com.br`

Não use a chave da OpenAI. O Resend possui uma chave própria começando com `re_`.

## 3. Banco

Execute `SUPABASE_ATUALIZACAO_FINAL_V16_EMAILS.sql` no SQL Editor, depois da V15.

## 4. Edge Function

Crie pelo editor uma função chamada exatamente:

`enviar-notificacoes-email`

Cole o conteúdo de:

`supabase/functions/enviar-notificacoes-email/index.ts`

Na configuração da função, desative Verify JWT, porque a autenticação será feita pelo cabeçalho secreto do webhook.

## 5. Database Webhook

No Supabase:

1. Database > Webhooks > Create webhook.
2. Nome: `altitude-email-notificacoes`.
3. Tabela: `public.email_notificacoes`.
4. Evento: apenas `INSERT`.
5. Método: POST.
6. URL: `https://SEU-PROJECT-REF.supabase.co/functions/v1/enviar-notificacoes-email`
7. Header:
   - Nome: `x-altitude-webhook`
   - Valor: o mesmo valor de `EMAIL_WEBHOOK_SECRET`

## 6. Teste

- Abra um chamado como aluno. A secretaria deve receber um e-mail.
- Responda pelo gestor. O aluno deve receber a atualização.
- Libere um certificado no modo imediato. O aluno deve receber o aviso de emissão.

No banco, consulte:

```sql
select id,destinatario,evento,status,tentativas,ultimo_erro,criado_em,enviado_em
from public.email_notificacoes
order by id desc;
```

## Observação

O envio do e-mail não bloqueia a abertura do chamado nem a emissão do certificado. Se o provedor estiver fora do ar, a operação principal continua funcionando e o erro fica registrado na tabela `email_notificacoes`.
