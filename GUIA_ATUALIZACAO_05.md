# ALTITUDE - Atualização 05

Esta versão adiciona a carteira de horas por aluno e curso, emissão parcial de certificados e liberação obrigatória pela gestão.

## Regra implementada

1. O aluno conclui o conteúdo e é aprovado na prova.
2. A gestão acessa **Certificados > Gerência de horas dos alunos**.
3. A gestão define o total de horas validadas para aquele aluno e curso.
4. O aluno escolhe quantas horas disponíveis deseja usar, sempre de 5 em 5.
5. As horas ficam reservadas enquanto a solicitação aguarda análise.
6. O PDF só é disponibilizado após o gestor clicar em **Liberar**.
7. As horas emitidas são descontadas do saldo. O restante permanece disponível para outra emissão.

Exemplo: 40h validadas, solicitação de 20h, saldo restante de 20h.

## Cálculo padrão

O limite automático usa 8 horas por dia útil desde a matrícula, sem criar período anterior à matrícula e sem ultrapassar a data atual. Para liberar acima desse limite, o gestor precisa marcar **liberação excepcional** e registrar uma justificativa.

## Instalação

1. Abra o Supabase.
2. Entre em **SQL Editor**.
3. Cole e execute todo o arquivo `ATUALIZACAO_05_CARTEIRA_HORAS_CERTIFICADOS.sql`.
4. Substitua os arquivos do site pelo conteúdo do ZIP desta versão.
5. Aguarde o GitHub Pages publicar.
6. Atualize o navegador com `Ctrl + F5`.

## Teste recomendado

1. Use um aluno com curso 100% concluído e prova aprovada.
2. No gestor, valide 40h para esse aluno.
3. No portal do aluno, solicite 20h.
4. Confirme que aparecem 20h disponíveis e 20h em análise.
5. No gestor, libere a solicitação.
6. Confirme que o aluno consegue baixar o PDF de 20h.
7. Confirme que restam 20h para uma nova solicitação.

## Certificado

O certificado agora usa a logomarca oficial ALTITUDE enviada, apresenta o período acadêmico calculado, RA legível, carga efetivamente emitida, QR Code e duas páginas.

## Menu Cursos Profissionais

O submenu foi aproximado do botão “Cursos”, recebeu uma área contínua para o mouse e demora 450 ms para fechar. Em telas de toque, o primeiro toque abre o submenu e o segundo acessa o catálogo.
