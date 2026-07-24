# ALTITUDE - Atualização 04: certificados, histórico e carteirinha

## Instalação

1. Confirme que as atualizações 01, 02 e 03 já foram executadas.
2. Abra o Supabase em **SQL Editor**.
3. Cole e execute todo o arquivo `ATUALIZACAO_04_CERTIFICADOS_HISTORICO.sql`.
4. Publique o conteúdo deste ZIP no GitHub Pages.
5. Atualize a página com `Ctrl + F5`.

## Novo fluxo do certificado

1. O aluno conclui 100% do curso.
2. O aluno é aprovado na prova.
3. Na aba **Certificados**, ele clica em **Solicitar certificado**.
4. O registro aparece no Portal de Gestão em **Certificados**.
5. O gestor confere e clica em **Liberar**.
6. O documento passa para `EMITIDO` e aparece em **Certificados emitidos** no Portal do Aluno.
7. O aluno pode baixar o PDF em duas páginas, copiar o código e abrir a validação pública.

## Certificados antigos

A migração não apaga registros existentes. Ela cria o histórico inicial de cada certificado antigo.

- `EMITIDO`: aparece imediatamente em **Certificados emitidos**.
- `BLOQUEADO`: aparece na gestão para ser liberado ou cancelado.
- `PENDENTE`: aparece como aguardando liberação.
- `CANCELADO`: permanece no histórico, sem validade.

Para o certificado de Segurança Digital que atualmente aparece como `BLOQUEADO`, entre como gestor, abra **Certificados** e clique em **Liberar**. O mesmo código de autenticação passa a validar como documento emitido.

## Carteirinha digital

A carteirinha foi corrigida para não quebrar o nome em uma letra por linha. Ela contém:

- foto do aluno;
- nome completo;
- RA;
- status;
- QR Code de validação;
- botão **Baixar carteirinha em PDF**.

O bucket `fotos_alunos` e as políticas de upload também são configurados pela migração.

## Modelo do certificado

O PDF agora possui duas páginas:

1. frente com nome, curso, período, carga horária, nota, assinaturas, número e QR Code;
2. conteúdo programático, carga horária total, dados institucionais e autenticação.

O arquivo `MODELO_CERTIFICADO_ALTITUDE_V5.pdf` é apenas uma demonstração visual e não possui validade.
