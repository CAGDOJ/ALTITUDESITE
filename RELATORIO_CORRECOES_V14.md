# RELATÓRIO DE CORREÇÕES — ALTITUDE V14

## Certificados

- Nova RPC `gestor_liberar_certificado_v14`.
- Confirmação obrigatória do retorno com status `EMITIDO`.
- Atualização imediata da tabela do gestor.
- Novo carregamento automático após a liberação.
- Portal do aluno atualizado por Realtime e por verificação de segurança a cada 5 segundos.
- Histórico de alteração de status garantido por trigger.
- Certificados emitidos aparecem na aba Certificados e no indicador da tela inicial.
- O indicador da tela inicial agora abre diretamente os certificados.

## Avaliação

- Removido o `prompt` numérico.
- Adicionado seletor visual de 1 a 5 estrelas.
- Comentário continua opcional.
- Avaliação só é permitida após conclusão e aprovação.

## Login e senha

- Removido o link público “Acesso da gestão”.
- Recuperação simplificada por RA, CPF ou e-mail.
- Link de recuperação enviado pelo Supabase Auth.
- Nova senha exige no mínimo 8 caracteres.
- Gestores continuam usando somente o endereço privado da gestão.

## Catálogo

- Criado campo `tipo_curso` no banco.
- Abas Cursos Profissionais e Cursos Técnicos.
- Gestor escolhe o tipo ao criar ou editar.
- Criador com IA e importação JSON também aceitam o tipo.
- Página técnica antiga redireciona ao catálogo unificado.

## Sincronização

- Polling do Portal do Aluno e do Gestor reduzido para 5 segundos.
- Realtime reforçado para certificados, matrículas, carteira de horas e avaliações.
- Catálogo possui fallback de atualização a cada 15 segundos.

## Identidade visual

- Favicon da nuvem reconstruído por completo.
- Gerados arquivos 16, 32, 180, 192 e 512 px, além do `.ico`.
- Links de favicon receberam versão `v=14` para reduzir cache antigo.
