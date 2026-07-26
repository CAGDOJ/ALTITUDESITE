-- PORTAL ALTITUDE V27 — VERIFICAÇÃO SEM ALTERAR DADOS

-- 1. Colunas usadas pelo construtor, LaTeX e certificado
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'modulos' and column_name in ('carga_horaria','conteudo_latex','pdf_url','video_url'))
    or
    (table_name = 'questoes' and column_name in ('e','resolucao','ordem','enunciado_latex'))
  )
order by table_name, column_name;

-- 2. Funções principais da V27
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'gestor_definir_horas_curso',
    'gestor_importar_curso_latex',
    'obter_conteudo_programatico_certificado'
  )
order by routine_name;

-- 3. Conferência das horas dos módulos já cadastrados
select
  c.id as curso_id,
  c.titulo as curso,
  c.carga_horaria as carga_do_curso,
  count(m.id) as quantidade_modulos,
  coalesce(sum(m.carga_horaria), 0) as soma_horas_modulos
from public.cursos c
left join public.modulos m on m.curso_id = c.id
group by c.id, c.titulo, c.carga_horaria
order by c.id desc;

-- Resultado esperado:
-- - 8 colunas na primeira consulta;
-- - 3 funções na segunda consulta;
-- - na terceira, a soma das horas dos módulos deve corresponder à carga do curso.
