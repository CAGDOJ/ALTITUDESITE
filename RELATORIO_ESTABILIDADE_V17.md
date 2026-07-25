# Relatório de estabilidade V17

## Erro principal confirmado

Havia colisão de sessão entre o Portal do Aluno e o Portal do Gestor. Os dois usavam o mesmo cliente Supabase e o mesmo armazenamento local de autenticação. Portanto, autenticar um perfil substituía o outro.

## Ajustes realizados

- clientes de autenticação separados por contexto;
- retry de sessão e perfil;
- consultas principais com `Promise.allSettled`;
- falhas opcionais não interrompem cursos, certificados e atendimento;
- redirecionamento seguro quando a sessão realmente expirou;
- proteção contra inicialização do gestor antes do perfil estar carregado;
- atualização de versão nos arquivos estáticos;
- reaplicação idempotente das funções de certificado da V15.

## Validações

- sintaxe dos JavaScript críticos verificada com `node --check`;
- referências HTML atualizadas para `v=17`;
- estrutura do ZIP verificada;
- função de liberação, processamento automático e exclusão com estorno incluídas no SQL.
