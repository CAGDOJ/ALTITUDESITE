# Relatório de correções — V15

## Problemas encontrados

1. O JavaScript chamava `gestor_excluir_solicitacao_certificado`, mas essa função não estava incluída no SQL final da V14.
2. O estado `BLOQUEADO` estava sendo usado tanto para bloqueio administrativo quanto para espera da contagem de horas.
3. A liberação não diferenciava claramente a contagem normal de 8h por dia da liberação integral imediata.
4. A tabela de cursos tinha larguras insuficientes, causando sobreposição entre título e área.
5. Confirmações importantes ainda utilizavam janelas simples do navegador.

## Correções aplicadas

- Criado o status `AGUARDANDO_HORAS`, exibido como **EM CONTAGEM**.
- Criados os campos `modo_liberacao`, `contagem_iniciada_em` e `liberar_em`.
- Criada a função `gestor_programar_certificado_v15` com os modos `AUTOMATICO` e `IMEDIATO`.
- Criada a função `processar_certificados_automaticos_v15` e agendamento condicional a cada 5 minutos por `pg_cron`.
- Refeita a exclusão da solicitação para recalcular reservas e devolver as horas ao saldo.
- Adicionado registro de `horas_devolvidas` nas exclusões administrativas.
- Criadas janelas institucionais centralizadas para liberação e exclusão.
- A tabela de cursos recebeu colunas e larguras estáveis, com rolagem interna em telas menores.
- Portal do aluno e gestor processam e atualizam certificados automaticamente.

## Verificações realizadas

- Sintaxe de todos os arquivos JavaScript.
- Estrutura HTML das páginas do aluno e gestor.
- Balanceamento dos arquivos CSS.
- Presença dos scripts e estilos adicionados.
- Integridade do arquivo ZIP.

O SQL precisa ser executado no Supabase ativo para o teste funcional final com os dados reais.
