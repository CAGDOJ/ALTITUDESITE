-- PORTAL ALTITUDE V34 — VERIFICAÇÃO CORRIGIDA
-- Execute após a migration 018.
--
-- IMPORTANTE:
-- O SQL Editor do Supabase não possui uma sessão de usuário do portal.
-- Por isso auth.uid() normalmente retorna NULL e funções protegidas por
-- public.e_gestor(...) não devem ser chamadas diretamente neste arquivo.

-- 1. Confirma as tabelas principais da V34.
select to_regclass('public.configuracoes_comerciais_v34') as configuracoes,
       to_regclass('public.cupons_v34') as cupons,
       to_regclass('public.promocoes_v34') as promocoes,
       to_regclass('public.packs_v34') as packs,
       to_regclass('public.packs_alunos_v34') as packs_alunos,
       to_regclass('public.carteiras_horas_aluno_v34') as carteira_global;

-- 2. Tipos de curso configurados para o catálogo.
select codigo,nome,visivel_site,permitir_inscricao,ordem
from public.tipos_curso_catalogo_v34
order by ordem;

-- 3. Configuração comercial principal.
select id,valor_certificado,whatsapp,cobranca_ativa
from public.configuracoes_comerciais_v34;

-- 4. Funções V34 instaladas.
select proname
from pg_proc
where proname like '%v34'
order by proname;

-- 5. Carteira global: uma linha por aluno, sem depender de curso.
-- Esta consulta direta é própria para o SQL Editor e substitui a chamada
-- protegida public.obter_carteiras_horas_gestao_v34().
select
  a.user_id as aluno_id,
  a.nome as aluno_nome,
  a.email as aluno_email,
  a.ra as aluno_ra,
  a.cpf as aluno_cpf,
  a.criado_em as cadastrado_em,
  coalesce(public.horas_automaticas_aluno_v34(a.user_id),0) as horas_automaticas,
  coalesce(c.horas_adicionais,0) as horas_adicionais,
  coalesce(public.horas_automaticas_aluno_v34(a.user_id),0)
    + coalesce(c.horas_adicionais,0) as horas_validadas,
  coalesce(c.horas_reservadas,0) as horas_reservadas,
  coalesce(c.horas_utilizadas,0) as horas_utilizadas,
  greatest(
    0,
    coalesce(public.horas_automaticas_aluno_v34(a.user_id),0)
      + coalesce(c.horas_adicionais,0)
      - coalesce(c.horas_reservadas,0)
      - coalesce(c.horas_utilizadas,0)
  ) as saldo_disponivel,
  c.justificativa_gestor,
  c.atualizado_em
from public.alunos a
left join public.carteiras_horas_aluno_v34 c
  on c.aluno_id = a.user_id
order by a.nome
limit 10;

-- 6. Cursos técnicos devem iniciar ocultos.
select codigo,visivel_site,permitir_inscricao
from public.tipos_curso_catalogo_v34
where codigo='TECNICO';

-- 7. Não deve existir teto/constraint legado de carga fixa no curso ou módulo.
select conrelid::regclass as tabela,
       conname,
       pg_get_constraintdef(oid) as definicao
from pg_constraint
where contype='c'
  and conrelid in ('public.cursos'::regclass,'public.modulos'::regclass)
  and pg_get_constraintdef(oid) ilike '%carga_horaria%';

-- 8. Quantidade de cupons, promoções e packs.
select
  (select count(*) from public.cupons_v34) as cupons,
  (select count(*) from public.promocoes_v34) as promocoes,
  (select count(*) from public.packs_v34) as packs;

-- 9. Funções internas não devem estar liberadas diretamente.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema='public'
  and routine_name in ('horas_automaticas_aluno_v34','validar_cupom_v34')
order by routine_name,grantee;

-- 10. Diagnóstico dos gestores cadastrados.
select gestor_id,nome,email,user_id,status,nivel_acesso
from public.gestores
order by nome;

-- No SQL Editor, o resultado abaixo normalmente será NULL. Isso é esperado.
select auth.uid() as usuario_autenticado_no_sql_editor;

-- 11. V34.1: data corrigível e ajustes positivos/negativos.
select
  a.nome,
  coalesce(c.data_inicio_contagem,a.criado_em::date) as data_inicio_contagem,
  c.horas_adicionais,
  public.horas_automaticas_aluno_v34(a.user_id) as horas_automaticas,
  greatest(0,public.horas_automaticas_aluno_v34(a.user_id)+coalesce(c.horas_adicionais,0)-coalesce(c.horas_reservadas,0)-coalesce(c.horas_utilizadas,0)) as saldo_disponivel
from public.alunos a
left join public.carteiras_horas_aluno_v34 c on c.aluno_id=a.user_id
order by a.nome;

-- 12. Confirma a função de ajuste da carteira e a função de decisão do certificado.
select to_regprocedure('public.gestor_ajustar_carteira_aluno_v34(uuid,integer,text,date)') as ajustar_carteira,
       to_regprocedure('public.gestor_decidir_certificado_v34(bigint,text,text,date,date)') as decidir_certificado;
