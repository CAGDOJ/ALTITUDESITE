-- ALTITUDE V37 — verificacao rapida
select
  to_regclass('public.solicitacoes_correcao_email_v37') is not null as tentativas_correcao_email,
  to_regclass('public.auditoria_correcao_email_v37') is not null as auditoria_correcao_email,
  to_regclass('public.alunos_exclusoes_v37') is not null as auditoria_exclusao_aluno;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('gestor_notificacoes_horas_v36','gestor_recalcular_previsoes_todos_v36')
order by routine_name;
