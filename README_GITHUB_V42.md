# ALTITUDE — V42

Pacote público do Portal Altitude para publicação no GitHub Pages.

## O que este pacote contém
- frontend público do portal;
- Portal do Aluno e Portal do Gestor;
- ajustes V42 (101–117);
- CSS/JavaScript necessários para a nova interface, LaTeX, provas, estatísticas e PACKs.

## O que NÃO está neste pacote
- SQL de banco de dados;
- migrations privadas;
- Service Role/Secret Keys;
- Edge Functions administrativas;
- dumps, backups ou exportações do banco;
- registros reais de alunos.

## Implantação
1. Publique o conteúdo deste diretório no repositório do site.
2. Antes de testar as funções V42, aplique o pacote privado do Supabase.
3. Não copie o pacote `ALTITUDESITE_V42_SUPABASE_PRIVADO` para o GitHub.

A URL e a chave pública/publishable do Supabase usadas pelo navegador podem permanecer no frontend. Chaves de serviço/secretas não podem ser publicadas.
