-- Verifica se a função V28 aceita horas acima de 200.
select
  p.proname as funcao,
  pg_get_function_arguments(p.oid) as argumentos,
  pg_get_functiondef(p.oid) ilike '%p_horas_validadas > 200%' as ainda_possui_limite_200
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'gestor_definir_horas_curso';

-- O resultado de ainda_possui_limite_200 deve ser FALSE.
