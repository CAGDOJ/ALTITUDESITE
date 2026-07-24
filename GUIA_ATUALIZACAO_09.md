# ALTITUDE — Atualização 09

Esta versão conclui quatro pontos:

1. **Entrar e Criar conta no menu de celular** de todas as páginas públicas.
2. **Botão de mostrar senha** discreto dentro do campo no cadastro e no login.
3. **Validar e liberar certificado bloqueado** diretamente no Portal do Gestor.
4. **Excluir chamados**, com motivo obrigatório e cópia administrativa para auditoria.

## Instalação

### 1. Banco de dados

No Supabase, abra **SQL Editor → New query**, cole todo o conteúdo de:

`ATUALIZACAO_09_VALIDACAO_CHAMADOS_MENU.sql`

Clique em **Run**.

Resultado esperado:

`Atualizacao 09 aplicada com sucesso`

O SQL pode ser executado novamente sem duplicar estruturas.

### 2. Site

Substitua no GitHub os arquivos atuais pelos arquivos deste ZIP.

Aguarde o GitHub Pages concluir a publicação e atualize o navegador com:

- Windows: `Ctrl + F5`
- Celular: fechar a aba e abrir novamente; se necessário, limpar os dados do site no navegador.

## Teste rápido

### Menu móvel

Abra o site em um celular e toque no menu. Devem aparecer:

- Início
- Cursos Profissionais
- Certificados
- Sobre Nós
- Ajuda
- Entrar
- Criar conta

### Cadastro

O ícone do olho deve ficar dentro do campo de senha, sem criar uma barra abaixo do campo.

### Certificados

No Portal do Gestor → Certificados:

- certificado pendente: botão **Liberar**;
- certificado bloqueado: botão **Validar e liberar**;
- após liberar, o aluno recebe acesso ao PDF e o QR Code volta a validar.

### Chamados

Na lista e dentro do chamado aparece **Excluir**. O sistema pede um motivo e remove o chamado da área ativa. Uma cópia fica em `public.chamados_exclusoes` para controle administrativo.
