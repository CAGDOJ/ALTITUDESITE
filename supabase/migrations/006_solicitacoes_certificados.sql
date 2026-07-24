-- ============================================================================
-- ALTITUDE — ATUALIZAÇÃO 07
-- Remove o extrato visual do aluno (alteração feita no site), permite ao gestor
-- excluir solicitações/certificados bloqueados ou cancelados com devolução segura
-- das horas e mantém um registro administrativo independente.
-- Execute após a ATUALIZACAO_05_CORRIGIDA_CARTEIRA_HORAS.sql.
-- ============================================================================

begin;

create table if not exists public.certificados_exclusoes (
  id bigint generated always as identity primary key,
  certificado_id_original bigint not null,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  curso_id bigint not null references public.cursos(id) on delete cascade,
  status_anterior text not null,
  horas_solicitadas integer not null default 0,
  horas_emitidas integer not null default 0,
  numero_certificado text,
  codigo_validacao uuid,
  motivo text not null,
  excluido_por uuid not null references auth.users(id),
  excluido_em timestamp with time zone not null default now()
);

create index if not exists certificados_exclusoes_aluno_idx
  on public.certificados_exclusoes(aluno_id, excluido_em desc);
create index if not exists certificados_exclusoes_curso_idx
  on public.certificados_exclusoes(curso_id, excluido_em desc);

alter table public.certificados_exclusoes enable row level security;

drop policy if exists gestor_le_certificados_excluidos
  on public.certificados_exclusoes;
create policy gestor_le_certificados_excluidos
  on public.certificados_exclusoes
  for select to authenticated
  using (public.e_gestor(2));

grant select on public.certificados_exclusoes to authenticated;

do $$
begin
  if to_regclass('public.certificados_exclusoes_id_seq') is not null then
    execute 'grant usage, select on sequence public.certificados_exclusoes_id_seq to authenticated';
  end if;
end $$;

create or replace function public.gestor_excluir_solicitacao_certificado(
  p_certificado_id bigint,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cert public.certificados%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_horas integer := 0;
  v_devolvidas integer := 0;
  v_reserva_outros integer := 0;
  v_nova_reserva integer := 0;
  v_tipo_movimento text := 'CANCELAMENTO';
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão';
  end if;

  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Informe o motivo da exclusão';
  end if;

  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;

  if not found then
    raise exception 'Solicitação não encontrada';
  end if;

  if upper(coalesce(v_cert.status, '')) = 'EMITIDO' then
    raise exception 'Certificado emitido não pode ser excluído diretamente. Bloqueie ou cancele antes de excluir';
  end if;

  v_horas := greatest(0, coalesce(nullif(v_cert.horas_emitidas, 0), v_cert.horas_solicitadas, 0));

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id = v_cert.aluno_id
    and curso_id = v_cert.curso_id
  for update;

  if found then
    -- Certificado já havia consumido horas e depois foi bloqueado/cancelado:
    -- devolve as horas utilizadas ao saldo antes de excluir.
    if coalesce(v_cert.saldo_processado, false) and coalesce(v_cert.horas_emitidas, 0) > 0 then
      v_devolvidas := least(v_carteira.horas_utilizadas, greatest(0, v_cert.horas_emitidas));

      update public.carteiras_horas_curso
      set horas_utilizadas = greatest(0, horas_utilizadas - v_devolvidas),
          atualizado_em = now()
      where id = v_carteira.id
      returning * into v_carteira;

      v_tipo_movimento := 'CANCELAMENTO';
    else
      -- Solicitação ainda não emitida: reconcilia a reserva com todas as outras
      -- solicitações pendentes da mesma carteira.
      select coalesce(sum(greatest(0, c.horas_solicitadas)), 0)::integer
      into v_reserva_outros
      from public.certificados c
      where c.aluno_id = v_cert.aluno_id
        and c.curso_id = v_cert.curso_id
        and c.id <> v_cert.id
        and upper(coalesce(c.status, '')) = 'PENDENTE';

      v_nova_reserva := least(v_carteira.horas_reservadas, v_reserva_outros);
      v_devolvidas := greatest(0, v_carteira.horas_reservadas - v_nova_reserva);

      update public.carteiras_horas_curso
      set horas_reservadas = v_nova_reserva,
          atualizado_em = now()
      where id = v_carteira.id
      returning * into v_carteira;

      v_tipo_movimento := 'ESTORNO_RESERVA';
    end if;

    if v_devolvidas > 0 then
      insert into public.movimentacoes_horas (
        carteira_id, aluno_id, curso_id, certificado_id, tipo, horas,
        saldo_validado, saldo_reservado, saldo_utilizado,
        observacao, realizado_por
      ) values (
        v_carteira.id, v_cert.aluno_id, v_cert.curso_id, v_cert.id,
        v_tipo_movimento, v_devolvidas,
        v_carteira.horas_validadas, v_carteira.horas_reservadas,
        v_carteira.horas_utilizadas,
        'Solicitação excluída pela gestão. ' || trim(p_motivo),
        v_uid
      );
    end if;
  end if;

  insert into public.certificados_exclusoes (
    certificado_id_original, aluno_id, curso_id, status_anterior,
    horas_solicitadas, horas_emitidas, numero_certificado,
    codigo_validacao, motivo, excluido_por
  ) values (
    v_cert.id, v_cert.aluno_id, v_cert.curso_id,
    coalesce(v_cert.status, 'DESCONHECIDO'),
    greatest(0, coalesce(v_cert.horas_solicitadas, 0)),
    greatest(0, coalesce(v_cert.horas_emitidas, 0)),
    v_cert.numero_certificado, v_cert.codigo_validacao,
    trim(p_motivo), v_uid
  );

  delete from public.certificados where id = v_cert.id;

  return jsonb_build_object(
    'ok', true,
    'certificado_id', p_certificado_id,
    'horas_devolvidas', v_devolvidas,
    'mensagem', 'Solicitação excluída com sucesso.'
  );
end;
$$;

revoke all on function public.gestor_excluir_solicitacao_certificado(bigint,text) from public;
grant execute on function public.gestor_excluir_solicitacao_certificado(bigint,text) to authenticated;

commit;

select 'Atualização 07 aplicada com sucesso' as resultado;
