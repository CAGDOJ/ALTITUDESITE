# ALTITUDE - Atualização V18

## O que esta versão corrige

1. **Certificado bloqueado mesmo após a liberação**
   - O botão de liberação usa uma nova função única: `gestor_liberar_certificado_v18`.
   - Em **Liberação imediata**, o status obrigatoriamente termina como `EMITIDO`.
   - Solicitações antigas que já consumiram horas, têm número de certificado e foram bloqueadas são reativadas sem descontar as horas novamente.
   - Em **Liberação automática**, o status fica `AGUARDANDO_HORAS` até completar 8h por dia útil.

2. **Informações apagando e voltando**
   - As atualizações do aluno e do gestor não executam mais em paralelo.
   - As tabelas continuam visíveis durante a sincronização.
   - Realtime atualiza somente depois de concluir o lote de consultas.
   - A verificação periódica ficou como redundância, sem apagar a tela.

3. **Gestor com acesso ao PDF**
   - Na aba Certificados aparecem os botões **Editar certificado**, **Visualizar PDF** e **Baixar PDF**.
   - O gestor pode corrigir nome do aluno, nome do curso, título, subtítulo, nota e período.
   - A alteração cria nova versão do PDF e entra no histórico.
   - A edição do texto não altera saldo, horas utilizadas nem status.

## Instalação

1. No Supabase, abra **SQL Editor**.
2. Execute `SUPABASE_CORRECAO_CERTIFICADOS_V18.sql` inteiro.
3. Confira o resultado:
   - `liberacao_v18_ok = true`
   - `edicao_pdf_v18_ok = true`
4. Substitua os arquivos do GitHub pelo conteúdo desta pasta/ZIP.
5. Aguarde o GitHub Pages publicar.
6. Feche as abas antigas e abra novamente usando `Ctrl + F5`.

## Como corrigir o certificado que já está BLOQUEADO

1. Abra **Portal do Gestor > Certificados**.
2. No certificado bloqueado, clique em **Definir liberação**.
3. Escolha **Liberação imediata - carga integral**.
4. O banco confirmará o status `EMITIDO`.
5. Os botões **Visualizar PDF** e **Baixar PDF** aparecerão para o gestor.
6. O certificado aparecerá em **Certificados emitidos** no Portal do Aluno.

## Edição do PDF

O sistema não grava um arquivo PDF fixo no Storage. Ele mantém os dados oficiais no banco e gera o PDF atualizado quando o aluno ou gestor clica para baixar. Assim, uma correção de nome passa a valer na próxima geração sem criar documentos duplicados.
