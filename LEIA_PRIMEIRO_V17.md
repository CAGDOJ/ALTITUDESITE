# ALTITUDE — Correção de estabilidade V17

## Problema encontrado

O Portal do Aluno e o Portal do Gestor usavam a mesma chave de sessão do Supabase no navegador. Ao entrar como gestor, a sessão do aluno era substituída; ao entrar como aluno, a sessão do gestor era substituída. Isso causava mensagens como:

- Cadastro do aluno não encontrado;
- Acesso restrito à gestão acadêmica;
- falha de carregamento ao alternar entre os dois portais;
- necessidade de sair, entrar ou atualizar a página.

## Correção

A V17 usa sessões independentes:

- `altitude-auth-aluno-v17` para aluno;
- `altitude-auth-gestor-v17` para gestor.

Também foram adicionados:

- tentativas automáticas antes de declarar falha;
- carregamento parcial: uma consulta opcional não derruba o portal inteiro;
- inicialização do gestor somente depois da autenticação;
- aviso de sincronização não bloqueante;
- cache-busting `?v=17` para o navegador carregar os arquivos novos;
- restauração das funções críticas de certificados.

## Instalação

1. Execute `SUPABASE_CORRECAO_ESTABILIDADE_V17.sql` no SQL Editor.
2. Substitua os arquivos do GitHub pelo conteúdo do ZIP V17.
3. Aguarde o GitHub Pages publicar.
4. Feche as abas antigas dos portais.
5. Abra novamente e pressione `Ctrl + F5` uma vez.
6. Faça login do aluno e do gestor. Eles poderão permanecer abertos ao mesmo tempo no mesmo navegador.

## Resultado esperado

O SQL deve mostrar `true` nas três verificações e a mensagem:

`Correção de estabilidade V17 aplicada com sucesso`
