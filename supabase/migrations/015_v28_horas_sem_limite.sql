-- ================================================================
-- PORTAL ALTITUDE V28
-- Horas validadas sem limite máximo, sempre em múltiplos de 5.
-- O limite automático de 8h por dia útil continua apenas como referência
-- e exige justificativa quando for ultrapassado.
-- ================================================================

begin;

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
     or mod(p_horas_validadas, 5) <> 0 then
    raise exception 'As horas devem ser iguais ou maiores que zero, de 5 em 5';
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
    'limite_gestao', null,
    'liberacao_excepcional', v_carteira.liberacao_excepcional
  );
end;
$$;

revoke all on function public.gestor_definir_horas_curso(uuid,bigint,integer,boolean,text) from public;
grant execute on function public.gestor_definir_horas_curso(uuid,bigint,integer,boolean,text) to authenticated;

commit;
