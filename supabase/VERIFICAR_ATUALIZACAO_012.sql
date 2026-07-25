-- Execute depois de 012_latex_chamados_horas.sql para conferir a instalação.

select
  to_regprocedure('public.aluno_detalhar_chamado(bigint)') as aluno_detalhar_chamado,
  to_regprocedure('public.aluno_responder_chamado(bigint,text)') as aluno_responder_chamado,
  to_regprocedure('public.gestor_importar_curso_latex(bigint,jsonb,boolean,boolean,boolean)') as importador_latex,
  to_regprocedure('public.obter_correcao_resultado_prova(bigint)') as correcao_prova,
  to_regprocedure('public.horas_automaticas_curso(uuid,bigint)') as calculo_horas;

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'questoes' and column_name in ('e','resolucao','ordem','enunciado_latex'))
    or (table_name = 'modulos' and column_name = 'conteudo_latex')
  )
order by table_name, column_name;

-- Exibe o cálculo atual para as matrículas existentes.
select
  a.nome as aluno,
  c.titulo as curso,
  m.criada_em as matricula_em,
  public.horas_automaticas_curso(m.aluno_id, m.curso_id) as limite_automatico_horas
from public.matriculas m
join public.alunos a on a.user_id = m.aluno_id
join public.cursos c on c.id = m.curso_id
order by m.criada_em desc
limit 50;
