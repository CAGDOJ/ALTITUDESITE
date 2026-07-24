# ALTITUDE — Atualização 08: Atendimento do Gestor

Esta atualização corrige a abertura, classificação e resposta dos chamados no Portal de Gestão.

## Instalação

1. Abra o Supabase.
2. Entre em **SQL Editor → New query**.
3. Cole todo o conteúdo de `ATUALIZACAO_08_CHAMADOS_GESTOR.sql`.
4. Clique em **Run**.
5. Confirme a mensagem:

   `Atualizacao 08 de chamados aplicada com sucesso`

6. Substitua os arquivos do site pelos arquivos do ZIP desta atualização.
7. Aguarde o GitHub Pages publicar.
8. Atualize o navegador com `Ctrl + F5`.

## Teste rápido

1. Entre no Portal do Aluno e abra um chamado.
2. Entre no Portal do Gestor.
3. Abra **Atendimento**.
4. Clique em **Abrir chamado**.
5. Altere prioridade e status.
6. Envie uma resposta.

## O que foi corrigido

- abertura do modal por clique delegado;
- consulta dos chamados por RPC segura;
- carregamento do aluno e do histórico na mesma abertura;
- atualização de prioridade e status;
- respostas do gestor;
- políticas RLS reconstruídas;
- botão para atualizar a lista;
- fechamento pelo X, pelo botão inferior, pela área externa e pela tecla Esc;
- modal em tela cheia no celular;
- chamados exibidos em cards no celular;
- botões com área de toque adequada para celular e tablet.
