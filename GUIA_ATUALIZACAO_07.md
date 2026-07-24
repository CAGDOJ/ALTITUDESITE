# ALTITUDE — Atualização 07

## O que muda

- Remove a seção visual **Extrato de horas** do Portal do Aluno.
- Mantém a **Carteira de horas** e o **Histórico de certificados**, que são as informações úteis para o aluno.
- Adiciona **Excluir solicitação** no Portal de Gestão.
- Ao excluir uma solicitação pendente, as horas reservadas retornam ao saldo.
- Ao excluir um certificado bloqueado/cancelado que já havia consumido horas, essas horas também retornam ao saldo.
- Um certificado com status `EMITIDO` não pode ser excluído diretamente: primeiro deve ser bloqueado ou cancelado.
- A exclusão exige motivo e fica registrada em `certificados_exclusoes` para auditoria administrativa.
- Corrige a carteirinha que exibia dois QR Codes; agora somente um é mostrado.
- Botões da gestão foram reorganizados para celular e tablet.

## Instalação

1. No Supabase, abra **SQL Editor**.
2. Cole e execute todo o conteúdo de:
   `ATUALIZACAO_07_SOLICITACOES_CERTIFICADOS.sql`
3. Confirme o retorno:
   `Atualização 07 aplicada com sucesso`
4. Substitua os arquivos do site pelos arquivos do ZIP da Atualização 07.
5. Aguarde a publicação do GitHub Pages.
6. Atualize o navegador com `Ctrl + F5` ou limpe o cache do celular.

## Como excluir uma solicitação

1. Entre no Portal de Gestão.
2. Abra **Certificados**.
3. Localize a solicitação.
4. Clique em **Excluir solicitação**.
5. Informe o motivo.
6. Confirme a exclusão.

As horas devolvidas aparecerão novamente no saldo disponível do aluno. O movimento permanece registrado no banco para controle interno, mas o extrato técnico não é mais exibido no Portal do Aluno.
