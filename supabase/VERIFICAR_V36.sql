-- Execute depois da migration 022_v36_fluxo_mobile_horas.sql
select
  to_regclass('public.areas_cursos_v36') is not null as areas_cursos_v36,
  to_regprocedure('public.gestor_recalcular_previsoes_todos_v36()') is not null as recalculo_v36,
  to_regprocedure('public.gestor_notificacoes_horas_v36()') is not null as notificacoes_v36,
  exists(
    select 1 from pg_trigger
    where tgname='trg_validar_certificado_v36' and not tgisinternal
  ) as limite_certificado_v36;

select public.gestor_recalcular_previsoes_todos_v36();
select * from public.gestor_notificacoes_horas_v36() limit 20;
