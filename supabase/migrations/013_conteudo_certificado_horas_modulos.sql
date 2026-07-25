-- V26: garante horas por módulo e conteúdo programático idêntico no gestor e no aluno
alter table if exists public.modulos
  add column if not exists carga_horaria integer not null default 0;

create or replace function public.obter_conteudo_programatico_certificado(p_certificado_id bigint)
returns table (
  id bigint,
  titulo text,
  descricao text,
  conteudo text,
  conteudo_latex text,
  ordem integer,
  carga_horaria integer
)
language sql
security definer
set search_path = public
as $$
  select m.id, m.titulo, m.descricao, m.conteudo,
         case when to_jsonb(m) ? 'conteudo_latex' then to_jsonb(m)->>'conteudo_latex' else null end,
         coalesce(m.ordem, 1), coalesce(m.carga_horaria, 0)
  from public.certificados c
  join public.modulos m on m.curso_id = c.curso_id
  where c.id = p_certificado_id
    and upper(coalesce(c.status, '')) = 'EMITIDO'
  order by coalesce(m.ordem, 1), m.id;
$$;

grant execute on function public.obter_conteudo_programatico_certificado(bigint) to authenticated;
