# ALTITUDE — Instalação da V15

Esta versão deve ser instalada sobre a V14 já publicada.

## Ordem correta

1. Abra o Supabase e entre em **SQL Editor**.
2. Crie uma nova consulta.
3. Cole todo o conteúdo de `SUPABASE_ATUALIZACAO_FINAL_V15.sql`.
4. Clique em **Run**.
5. Confirme a mensagem: `Atualização final V15 aplicada com sucesso`.
6. Substitua no GitHub os arquivos do site pelo conteúdo deste pacote.
7. Aguarde o GitHub Pages finalizar a publicação.
8. Saia e entre novamente no Portal do Gestor e no Portal do Aluno.
9. Atualize o navegador com `Ctrl + F5`.

## Novo fluxo de certificados

Ao clicar para liberar, o gestor escolhe uma das opções:

- **Automático — 8h por dia útil:** o status passa para `AGUARDANDO_HORAS` / **EM CONTAGEM**. O PDF é liberado automaticamente na data calculada.
- **Imediato — carga integral:** a gestão credita as horas solicitadas e o status passa imediatamente para `EMITIDO`.

O SQL tenta agendar a verificação automática a cada 5 minutos com `pg_cron`. Quando essa extensão não estiver disponível no plano/projeto, o aluno e o gestor ainda processam a emissão ao abrir o portal, com atualização periódica e Realtime.

## Exclusão de solicitação

Ao excluir uma solicitação que ainda não foi emitida:

- a reserva é removida;
- as horas retornam ao saldo disponível;
- outras solicitações continuam reservadas;
- a exclusão fica registrada na tabela `certificados_exclusoes`.

Um certificado já emitido precisa ser bloqueado ou cancelado antes da exclusão.
