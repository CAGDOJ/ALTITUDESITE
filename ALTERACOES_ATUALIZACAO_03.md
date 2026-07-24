# Alterações da Atualização 03

## Portal do Aluno
- Exibição da etapa de prova após 100% do curso.
- Abertura automática da avaliação ao concluir o último módulo.
- Botão de prova sempre acessível no painel de conclusão.
- Prioridade retirada do formulário de chamados.
- Upload de foto no bucket correto, com validação de tipo e tamanho.
- QR Code na carteirinha e página pública de autenticação.
- Menu móvel alinhado e responsivo.

## Portal de Gestão
- Login separado por ID de gestor e senha.
- Primeiro acesso controlado e cadastro de equipe por Edge Function.
- Sidebar com altura total e comportamento móvel corrigido.
- Modais acima da sidebar.
- Gestor define prioridade e status dos chamados.
- Histórico de respostas nos chamados.
- Carga horária de 5 em 5 até 200h.
- Gestão de alunos existentes corrigida para usar `user_id`.

## Banco e segurança
- Tabela de gestores ligada ao Supabase Auth.
- RLS para áreas do aluno e da gestão.
- Bucket `fotos_alunos` criado automaticamente.
- Código UUID único da carteirinha.
- Correção de provas antigas vinculadas somente ao módulo.
- Cadastro de aluno por trigger seguro do Supabase Auth.
