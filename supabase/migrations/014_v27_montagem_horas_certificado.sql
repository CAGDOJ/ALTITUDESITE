-- ================================================================
-- PORTAL ALTITUDE V27
-- Montagem simples de cursos, horas excepcionais até 200h e
-- conteúdo programático idêntico no certificado do gestor/aluno.
-- Execute uma única vez no SQL Editor do Supabase.
-- ================================================================

begin;

alter table if exists public.modulos
  add column if not exists carga_horaria integer not null default 0,
  add column if not exists conteudo_latex text;

alter table if exists public.questoes
  add column if not exists e text,
  add column if not exists resolucao text,
  add column if not exists ordem integer not null default 1,
  add column if not exists enunciado_latex text;

-- Cursos antigos que possuem módulos, mas ainda não possuem horas por módulo,
-- recebem uma divisão equilibrada. Ex.: curso de 20h com 2 módulos = 10h + 10h.
with modulos_ranqueados as (
  select
    m.id,
    greatest(0, coalesce(c.carga_horaria, 0))::integer as total_curso,
    count(*) over (partition by c.id)::integer as quantidade,
    row_number() over (partition by c.id order by coalesce(m.ordem, 1), m.id)::integer as posicao,
    sum(coalesce(m.carga_horaria, 0)) over (partition by c.id)::integer as soma_atual
  from public.modulos m
  join public.cursos c on c.id = m.curso_id
), distribuicao as (
  select
    id,
    (total_curso / nullif(quantidade, 0))
      + case when posicao <= mod(total_curso, nullif(quantidade, 0)) then 1 else 0 end as horas
  from modulos_ranqueados
  where soma_atual = 0 and total_curso > 0 and quantidade > 0
)
update public.modulos m
set carga_horaria = d.horas
from distribuicao d
where m.id = d.id;

-- ----------------------------------------------------------------
-- 1. GESTOR PODE ADICIONAR OU RETIRAR HORAS, DE 5 EM 5, ATÉ 200H.
--    A redução continua impedida abaixo das horas reservadas/usadas.
-- ----------------------------------------------------------------
create or replace function public.gestor_definir_horas_curso(
  p_aluno_id uuid,
  p_curso_id bigint,
  p_horas_validadas integer,
  p_excepcional boolean default false,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_curso public.cursos%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_auto integer;
  v_anterior integer;
  v_tipo text;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica';
  end if;

  if p_horas_validadas is null
     or p_horas_validadas < 0
     or p_horas_validadas > 200
     or mod(p_horas_validadas, 5) <> 0 then
    raise exception 'As horas devem estar entre 0 e 200, de 5 em 5';
  end if;

  select * into v_curso from public.cursos where id = p_curso_id;
  if v_curso.id is null then raise exception 'Curso não encontrado'; end if;

  if not exists (
    select 1 from public.matriculas m
    where m.aluno_id = p_aluno_id and m.curso_id = p_curso_id
      and coalesce(upper(m.status), 'ATIVA') not in ('CANCELADA','CANCELADO')
  ) then
    raise exception 'O aluno não possui matrícula ativa neste curso';
  end if;

  -- A gestão pode preparar a carteira antes da conclusão. A emissão do
  -- certificado continua condicionada à conclusão e à aprovação nas
  -- funções próprias do fluxo acadêmico.

  v_auto := coalesce(public.horas_automaticas_curso(p_aluno_id, p_curso_id), 0);

  if p_horas_validadas > v_auto and not coalesce(p_excepcional, false) then
    raise exception 'O limite automático atual é % horas. Marque o ajuste excepcional para ultrapassá-lo.', v_auto;
  end if;

  if p_horas_validadas > v_auto and length(trim(coalesce(p_justificativa, ''))) < 10 then
    raise exception 'Informe uma justificativa com pelo menos 10 caracteres para o ajuste excepcional';
  end if;

  insert into public.carteiras_horas_curso (aluno_id, curso_id)
  values (p_aluno_id, p_curso_id)
  on conflict (aluno_id, curso_id) do nothing;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id = p_aluno_id and curso_id = p_curso_id
  for update;

  if p_horas_validadas < v_carteira.horas_reservadas + v_carteira.horas_utilizadas then
    raise exception 'Não é possível reduzir abaixo de % horas, pois já existem horas reservadas ou utilizadas',
      v_carteira.horas_reservadas + v_carteira.horas_utilizadas;
  end if;

  v_anterior := v_carteira.horas_validadas;
  v_tipo := case
    when p_horas_validadas > v_auto then 'CREDITO_EXCEPCIONAL'
    when p_horas_validadas > v_anterior then 'CREDITO_GESTOR'
    else 'AJUSTE_GESTOR'
  end;

  update public.carteiras_horas_curso
  set horas_validadas = p_horas_validadas,
      liberacao_excepcional = p_horas_validadas > v_auto,
      justificativa_gestor = nullif(trim(coalesce(p_justificativa, '')), ''),
      validado_por = v_uid,
      validado_em = now(),
      atualizado_em = now()
  where id = v_carteira.id
  returning * into v_carteira;

  insert into public.movimentacoes_horas (
    carteira_id, aluno_id, curso_id, tipo, horas,
    saldo_validado, saldo_reservado, saldo_utilizado,
    observacao, realizado_por
  ) values (
    v_carteira.id, p_aluno_id, p_curso_id, v_tipo,
    p_horas_validadas - v_anterior,
    v_carteira.horas_validadas, v_carteira.horas_reservadas, v_carteira.horas_utilizadas,
    coalesce(nullif(trim(coalesce(p_justificativa, '')), ''), 'Horas ajustadas pela gestão acadêmica.'),
    v_uid
  );

  return jsonb_build_object(
    'carteira_id', v_carteira.id,
    'horas_validadas', v_carteira.horas_validadas,
    'horas_reservadas', v_carteira.horas_reservadas,
    'horas_utilizadas', v_carteira.horas_utilizadas,
    'saldo_disponivel', v_carteira.horas_validadas - v_carteira.horas_reservadas - v_carteira.horas_utilizadas,
    'horas_automaticas', v_auto,
    'limite_gestao', 200,
    'liberacao_excepcional', v_carteira.liberacao_excepcional
  );
end;
$$;

revoke all on function public.gestor_definir_horas_curso(uuid,bigint,integer,boolean,text) from public;
grant execute on function public.gestor_definir_horas_curso(uuid,bigint,integer,boolean,text) to authenticated;

-- ----------------------------------------------------------------
-- 2. IMPORTADOR LATEX TAMBÉM GRAVA AS HORAS DE CADA MÓDULO.
-- ----------------------------------------------------------------
create or replace function public.gestor_importar_curso_latex(
  p_curso_id bigint,
  p_payload jsonb,
  p_substituir boolean default false,
  p_publicar_modulos boolean default false,
  p_atualizar_curso boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso jsonb := coalesce(p_payload->'curso', '{}'::jsonb);
  v_modulo jsonb;
  v_questao jsonb;
  v_modulo_id bigint;
  v_primeiro_modulo_id bigint;
  v_prova_id bigint;
  v_modulos integer := 0;
  v_questoes integer := 0;
  v_ordem_questao integer := 0;
  v_tem_questoes boolean := false;
begin
  if auth.uid() is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito a gestao academica.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cursos where id = p_curso_id) then
    raise exception 'Curso nao encontrado.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_payload->'modulos', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload->'modulos', '[]'::jsonb)) = 0 then
    raise exception 'O arquivo LaTeX nao possui modulos validos.';
  end if;

  if coalesce(p_atualizar_curso, true) then
    update public.cursos
    set titulo = coalesce(nullif(trim(v_curso->>'titulo'), ''), titulo),
        categoria = coalesce(nullif(upper(trim(v_curso->>'categoria')), ''), categoria),
        carga_horaria = case
          when coalesce(v_curso->>'carga_horaria', '') ~ '^\d+$'
            then least(200, greatest(1, (v_curso->>'carga_horaria')::integer))
          else carga_horaria end,
        descricao = coalesce(nullif(trim(v_curso->>'descricao'), ''), descricao),
        nivel = case
          when upper(trim(coalesce(v_curso->>'nivel',''))) in ('BASICO','INTERMEDIARIO','AVANCADO')
            then upper(trim(v_curso->>'nivel')) else nivel end,
        nota_minima = case
          when coalesce(v_curso->>'nota_minima','') ~ '^\d+(\.\d+)?$'
            then least(100, greatest(0, (v_curso->>'nota_minima')::numeric))
          else nota_minima end,
        revisado_em = now()
    where id = p_curso_id;
  end if;

  if coalesce(p_substituir, false) then
    delete from public.materiais where curso_id = p_curso_id;
    delete from public.provas where curso_id = p_curso_id;
    delete from public.modulos where curso_id = p_curso_id;
  end if;

  for v_modulo in select value from jsonb_array_elements(p_payload->'modulos') loop
    insert into public.modulos(
      curso_id, titulo, descricao, conteudo, conteudo_latex,
      ordem, carga_horaria, pdf_url, video_url, publicado, criado_em, updated_at
    ) values (
      p_curso_id,
      coalesce(nullif(trim(v_modulo->>'titulo'), ''), 'Modulo ' || (v_modulos + 1)),
      nullif(trim(v_modulo->>'descricao'), ''),
      nullif(v_modulo->>'conteudo', ''),
      nullif(v_modulo->>'conteudo_latex', ''),
      coalesce(nullif(v_modulo->>'ordem','')::integer, v_modulos + 1),
      least(200, greatest(0, coalesce(nullif(v_modulo->>'carga_horaria','')::integer, 0))),
      nullif(trim(v_modulo->>'pdf_url'), ''),
      nullif(trim(v_modulo->>'video_url'), ''),
      coalesce(p_publicar_modulos, false),
      now(), now()
    ) returning id into v_modulo_id;

    if v_primeiro_modulo_id is null then v_primeiro_modulo_id := v_modulo_id; end if;
    v_modulos := v_modulos + 1;

    if nullif(trim(v_modulo->>'pdf_url'), '') is not null then
      insert into public.materiais(curso_id, modulo_id, tipo, titulo, url, criado_em)
      values (
        p_curso_id, v_modulo_id, 'PDF',
        'Apostila — ' || coalesce(nullif(trim(v_modulo->>'titulo'), ''), 'Modulo ' || v_modulos),
        trim(v_modulo->>'pdf_url'), now()
      );
    end if;

    if jsonb_typeof(coalesce(v_modulo->'questoes', '[]'::jsonb)) = 'array'
       and jsonb_array_length(coalesce(v_modulo->'questoes', '[]'::jsonb)) > 0 then
      v_tem_questoes := true;
    end if;
  end loop;

  if v_tem_questoes then
    insert into public.provas(curso_id, modulo_id, titulo, criado_em)
    values (
      p_curso_id, v_primeiro_modulo_id,
      coalesce(nullif(trim(v_curso->>'titulo'), ''), 'Curso') || ' — Avaliacao final',
      now()
    ) returning id into v_prova_id;

    for v_modulo in select value from jsonb_array_elements(p_payload->'modulos') loop
      for v_questao in select value from jsonb_array_elements(coalesce(v_modulo->'questoes', '[]'::jsonb)) loop
        v_ordem_questao := v_ordem_questao + 1;
        insert into public.questoes(
          prova_id, enunciado, enunciado_latex,
          a, b, c, d, e, correta, resolucao, ordem
        ) values (
          v_prova_id,
          trim(v_questao->>'enunciado'),
          nullif(v_questao->>'enunciado_latex', ''),
          trim(v_questao->>'a'), trim(v_questao->>'b'),
          trim(v_questao->>'c'), trim(v_questao->>'d'),
          nullif(trim(v_questao->>'e'), ''),
          upper(trim(v_questao->>'correta')),
          nullif(trim(v_questao->>'resolucao'), ''),
          coalesce(nullif(v_questao->>'ordem','')::integer, v_ordem_questao)
        );
        v_questoes := v_questoes + 1;
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'curso_id', p_curso_id,
    'modulos_importados', v_modulos,
    'questoes_importadas', v_questoes,
    'prova_id', v_prova_id
  );
end;
$$;

revoke all on function public.gestor_importar_curso_latex(bigint,jsonb,boolean,boolean,boolean) from public;
grant execute on function public.gestor_importar_curso_latex(bigint,jsonb,boolean,boolean,boolean) to authenticated;

-- ----------------------------------------------------------------
-- 3. CERTIFICADO DO ALUNO E DO GESTOR CONSULTAM A MESMA ESTRUTURA.
-- ----------------------------------------------------------------
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
  select
    m.id,
    m.titulo,
    m.descricao,
    m.conteudo,
    case when to_jsonb(m) ? 'conteudo_latex' then to_jsonb(m)->>'conteudo_latex' else null end,
    coalesce(m.ordem, 1),
    coalesce(m.carga_horaria, 0)
  from public.certificados c
  join public.modulos m on m.curso_id = c.curso_id
  where c.id = p_certificado_id
    and upper(coalesce(c.status, '')) = 'EMITIDO'
  order by coalesce(m.ordem, 1), m.id;
$$;

revoke all on function public.obter_conteudo_programatico_certificado(bigint) from public;
grant execute on function public.obter_conteudo_programatico_certificado(bigint) to authenticated;

commit;

select 'Atualização V27 aplicada com sucesso' as resultado;
