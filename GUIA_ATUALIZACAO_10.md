# Instalação da Atualização 10

## 1. Banco de dados

No Supabase, abra **SQL Editor → New query**, cole todo o conteúdo de:

`ATUALIZACAO_10_GESTAO_SIMPLIFICADA_ACESSO.sql`

e clique em **Run**.

O resultado deve mostrar o gestor `GST-2026-0001`, e-mail `altitudesecretaria@gmail.com`, nível `4` e status `ATIVO`.

Caso o e-mail ainda não exista em **Authentication → Users**, crie o usuário antes e execute o SQL novamente.

## 2. Site

Substitua os arquivos do repositório GitHub pelo conteúdo do novo ZIP. Aguarde o GitHub Pages publicar e atualize usando `Ctrl + F5`.

## 3. Teste

1. Entre com o ID `GST-2026-0001`.
2. Abra **Certificados** e confirme que as carteiras e solicitações carregam sem “Acesso restrito”.
3. Abra **Cursos e conteúdos → Montar curso**.
4. Crie um módulo, use os botões **Conteúdo**, **Materiais** e **Prova**.
5. Teste também em celular ou tablet: a barra lateral deve abrir como menu lateral, sem cobrir permanentemente o conteúdo.
