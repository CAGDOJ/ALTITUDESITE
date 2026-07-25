# Relatório de revisão — ALTITUDE V13

## Erros identificados e corrigidos

### Portal do aluno

- Consulta de aluno com `.single()` falhava quando havia resultado duplicado ou ausente, exibindo “Cannot coerce the result to a single JSON object”. Foi substituída por leitura segura e mensagem clara.
- A abertura de chamado tentava executar `reset()` em uma referência perdida após uma operação assíncrona. O formulário agora é preservado antes do envio.
- Cursos, chamados, certificados e progresso não atualizavam rapidamente. Foram combinados Supabase Realtime, atualização ao retornar para a aba e sincronização periódica.
- A carteirinha agora usa foto circular, um único QR Code e só é liberada após conclusão e aprovação em pelo menos um curso.
- A avaliação por estrelas é liberada após concluir o curso e ser aprovado na prova.

### Gestão de alunos

- O botão Editar utilizava a posição do aluno na lista. Ao filtrar, ordenar ou atualizar a tabela, a posição mudava e podia abrir outro cadastro. Agora todo o fluxo usa o `user_id` imutável.
- Nomes de alunos e gestores são normalizados e exibidos em CAIXA ALTA.
- Removidos dados fictícios de fallback que poderiam confundir a gestão quando o banco falhava.

### Gestão de cursos

- Ações escondidas em “Mais ações” foram substituídas por botões diretos e organizados: Editar dados, Montar curso, Pré-visualizar, Publicar, Duplicar e Excluir.
- O construtor de módulos foi compactado e adaptado para desktop, tablet e celular.
- O portal do aluno passou a usar a função nova de módulos, que retorna texto, PDF, vídeo e materiais vinculados.
- As duas apostilas enviadas foram incluídas no projeto e vinculadas pelo SQL aos módulos do curso de Informática Básica.
- O criador de cursos agora aceita criação manual, importação gratuita por JSON, geração completa por IA e geração somente da capa.

### Certificados e horas

- A liberação recusava certificados com status BLOQUEADO, embora a tela mostrasse o botão de liberar. A função foi refeita para aceitar solicitações bloqueadas e pendentes.
- A liberação agora respeita saldo validado, horas reservadas, período acadêmico e exceções autorizadas pelo gestor.
- O aluno só recebe PDF e QR Code válido após a decisão do gestor.
- Solicitações parciais descontam somente as horas emitidas, preservando o saldo restante para uma nova emissão.
- Histórico, bloqueio, reabertura, cancelamento e exclusão administrativa foram mantidos.

### Atendimento

- Corrigida a criação de chamados no aluno.
- O gestor pode abrir, classificar, responder, resolver e excluir chamados com registro administrativo.
- Listas são atualizadas em tempo real e também por sincronização periódica.

### Páginas públicas e identidade

- A página inicial recebeu texto institucional, explicação do fluxo, chamada para cursos e atendimento pelo WhatsApp.
- As páginas Sobre Nós e Ajuda foram reorganizadas e receberam conteúdo inicial.
- O menu público foi simplificado: “Cursos” abre diretamente o catálogo, sem dropdown distante ou instável.
- Login e Cadastro permanecem disponíveis no menu mobile.
- O favicon foi substituído pela nuvem da identidade Altitude.
- Capas geradas por IA usam a paleta institucional e recebem a logo real sobreposta pelo site.

### Cadastro e autenticação

- Removido o redirecionamento de confirmação por e-mail no código do cadastro.
- Para eliminar a confirmação obrigatória, ainda é necessário desativar manualmente `Confirm email` em Authentication → Providers → Email.
- O gestor entra pela tela com ID e senha; o e-mail associado continua protegido no Supabase Auth e não precisa ser digitado.

## Validações realizadas

- Sintaxe de todos os arquivos JavaScript: aprovada.
- Sintaxe TypeScript da Edge Function: aprovada.
- IDs duplicados e referências locais de 16 páginas HTML: nenhum erro.
- Análise de sintaxe de 18 arquivos CSS: nenhum erro.
- Estrutura estática e delimitadores do SQL: aprovados.
- Arquivos PDF, imagens, favicon e caminhos locais: presentes no pacote.

## Limitação da validação

Não foi possível executar a migração no banco ativo nem simular usuários reais do Supabase sem acesso administrativo. Após publicar, faça o teste completo descrito em `LEIA_PRIMEIRO_V13.md`.
