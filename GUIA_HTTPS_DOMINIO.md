# HTTPS e aviso de segurança — www.portalaltitude.com.br

O projeto já foi preparado para usar somente recursos HTTPS e bloquear conteúdo misto. O aviso de “site não seguro”, solicitação de credenciais ou certificado inválido não é removido apenas alterando HTML/CSS: ele depende do DNS e do certificado da hospedagem.

## Configuração para GitHub Pages

O arquivo `CNAME` deste projeto contém:

```text
www.portalaltitude.com.br
```

No provedor onde o domínio foi comprado, configure:

### Domínio principal `portalaltitude.com.br`

Crie quatro registros **A** apontando para:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

### Subdomínio `www`

Crie um registro **CNAME**:

```text
Nome/Host: www
Destino: SEU-USUARIO.github.io
```

Substitua `SEU-USUARIO` pelo usuário/organização que possui o repositório no GitHub.

## Configuração no repositório

Abra:

**GitHub > Repositório > Settings > Pages**

1. Em **Custom domain**, informe `www.portalaltitude.com.br`.
2. Salve e confirme a verificação do DNS.
3. Ative **Enforce HTTPS**.
4. Não cadastre um endereço com `http://`.

## Conferências importantes

- Remova registros A ou CNAME antigos que apontem para outra hospedagem.
- Não crie CNAME do `www` apontando para o próprio domínio.
- Não use registros DNS do tipo “URL Redirect” no lugar do CNAME.
- Confirme que o repositório publicado contém o arquivo `CNAME` na raiz.
- A URL usada pelo Supabase para redirecionamento já está em HTTPS.

## Supabase Auth

No Supabase, confira:

**Authentication > URL Configuration**

- Site URL: `https://www.portalaltitude.com.br`
- Redirect URLs:
  - `https://www.portalaltitude.com.br/**`
  - `https://www.portalaltitude.com.br/Projeto/1-html/4-login.html`

Isso evita avisos ou redirecionamentos para endereços diferentes durante login e cadastro.
