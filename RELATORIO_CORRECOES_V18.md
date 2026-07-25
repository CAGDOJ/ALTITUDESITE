# Relatório de correções V18

## Erros identificados

- A liberação dependia de uma cadeia de funções antigas, permitindo que registros legados permanecessem `BLOQUEADO` mesmo já possuindo número e saldo processado.
- A confirmação do navegador podia usar uma resposta anterior à leitura definitiva da linha.
- O Portal do Gestor substituía o conteúdo das tabelas por “Carregando...” a cada atualização periódica.
- Realtime, polling e troca de aba podiam disparar consultas simultâneas no Portal do Aluno.
- Consultas opcionais zeravam os arrays ao falhar temporariamente, fazendo cards desaparecerem e reaparecerem.
- O gestor não possuía gerador nem editor próprio do PDF.

## Correções aplicadas

- Nova RPC autocontida `gestor_liberar_certificado_v18`.
- Confirmação do status por nova leitura do banco após a RPC.
- Reativação segura de certificados legados com `saldo_processado = true`.
- Mutex/fila de atualização nos dois portais.
- Preservação dos dados já exibidos durante falhas temporárias.
- Realtime com debounce e polling de segurança em intervalo maior.
- Editor de dados do PDF com histórico e incremento de versão.
- Gerador de PDF de duas páginas disponível ao gestor.
- Ações de certificados organizadas em grade responsiva.
