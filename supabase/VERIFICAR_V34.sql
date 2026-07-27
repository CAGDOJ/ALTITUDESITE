-- Execute após a migration 018.
select to_regclass('public.configuracoes_comerciais_v34') as configuracoes,
       to_regclass('public.cupons_v34') as cupons,
       to_regclass('public.promocoes_v34') as promocoes,
       to_regclass('public.packs_v34') as packs,
       to_regclass('public.packs_alunos_v34') as packs_alunos,
       to_regclass('public.carteiras_horas_aluno_v34') as carteira_global;

select codigo,nome,visivel_site,permitir_inscricao,ordem
from public.tipos_curso_catalogo_v34 order by ordem;

select id,valor_certificado,whatsapp,cobranca_ativa
from public.configuracoes_comerciais_v34;

select proname
from pg_proc
where proname like '%v34'
order by proname;

-- Deve retornar uma linha por aluno, sem curso.
select * from public.obter_carteiras_horas_gestao_v34() limit 10;

-- Cursos Técnicos devem iniciar ocultos.
select codigo,visivel_site,permitir_inscricao
from public.tipos_curso_catalogo_v34
where codigo='TECNICO';

-- Não deve existir teto/constraint legado de carga fixa no curso ou módulo.
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where contype='c'
  and conrelid in ('public.cursos'::regclass,'public.modulos'::regclass)
  and pg_get_constraintdef(oid) ilike '%carga_horaria%';

-- Confere a aba de cupons e a quantidade de campanhas/packs cadastrados.
select
  (select count(*) from public.cupons_v34) as cupons,
  (select count(*) from public.promocoes_v34) as promocoes,
  (select count(*) from public.packs_v34) as packs;

-- As funções internas de cálculo/validação não devem estar liberadas diretamente.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema='public'
  and routine_name in ('horas_automaticas_aluno_v34','validar_cupom_v34')
order by routine_name,grantee;
