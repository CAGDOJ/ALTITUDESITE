-- =============================================================================
-- ALTITUDE - ATUALIZACAO 09
-- VALIDACAO DIRETA DE CERTIFICADOS + EXCLUSAO SEGURA DE CHAMADOS
-- Pode ser executada mais de uma vez.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. LIBERAR DIRETAMENTE CERTIFICADO PENDENTE OU BLOQUEADO
-- -----------------------------------------------------------------------------
create or replace function public.gestor_liberar_certificado_direto(
  p_certificado_id bigint,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert public.certificados%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_horas integer;
  v_faltante_reserva integer;
  v_saldo_disponivel integer;
  v_resultado jsonb;
begin
  if auth.uid() is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito a gestao academica.' using errcode = '42501';
  end if;

  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;

  if not found then
    raise exception 'Certificado nao encontrado.' using errcode = 'P0002';
  end if;

  if v_cert.status = 'EMITIDO' then
    return to_jsonb(v_cert);
  end if;

  -- Documento que ja havia sido emitido e apenas foi bloqueado/cancelado:
  -- reativa sem consumir as mesmas horas novamente.
  if v_cert.status in ('BLOQUEADO', 'CANCELADO')
     and coalesce(v_cert.horas_emitidas, 0) > 0
     and coalesce(v_cert.saldo_processado, false) then
    return public.gestor_decidir_certificado(
      p_certificado_id,
      'REABRIR',
      nullif(trim(coalesce(p_observacao, '')), '')
    );
  end if;

  v_horas := greatest(0, coalesce(nullif(v_cert.horas_solicitadas, 0), v_cert.horas_emitidas, 0));
  if v_horas < 5 or mod(v_horas, 5) <> 0 then
    raise exception 'A solicitacao precisa possuir pelo menos 5 horas e estar em multiplos de 5.';
  end if;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id = v_cert.aluno_id
    and curso_id = v_cert.curso_id
  for update;

  if not found then
    raise exception 'Carteira de horas nao encontrada.' using errcode = 'P0002';
  end if;

  -- Quando uma solicitacao foi bloqueada/cancelada, a reserva pode ter voltado
  -- para o saldo. A funcao recompõe somente o que estiver faltando.
  v_faltante_reserva := greatest(0, v_horas - coalesce(v_carteira.horas_reservadas, 0));
  v_saldo_disponivel := greatest(
    0,
    coalesce(v_carteira.horas_validadas, 0)
      - coalesce(v_carteira.horas_reservadas, 0)
      - coalesce(v_carteira.horas_utilizadas, 0)
  );

  if v_faltante_reserva > v_saldo_disponivel then
    raise exception 'Saldo insuficiente. Disponivel: % horas; necessario: % horas.',
      v_saldo_disponivel,
      v_faltante_reserva;
  end if;

  if v_faltante_reserva > 0 then
    update public.carteiras_horas_curso
    set horas_reservadas = horas_reservadas + v_faltante_reserva,
        atualizado_em = now()
    where id = v_carteira.id;
  end if;

  update public.certificados
  set status = 'PENDENTE',
      horas_solicitadas = v_horas,
      atualizado_em = now(),
      observacao_gestor = nullif(trim(coalesce(p_observacao, '')), '')
  where id = p_certificado_id;

  v_resultado := public.gestor_decidir_certificado(
    p_certificado_id,
    'LIBERAR',
    nullif(trim(coalesce(p_observacao, '')), '')
  );

  return v_resultado;
end;
$$;

revoke all on function public.gestor_liberar_certificado_direto(bigint, text) from public;
grant execute on function public.gestor_liberar_certificado_direto(bigint, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. REGISTRO ADMINISTRATIVO DE CHAMADOS EXCLUIDOS
-- -----------------------------------------------------------------------------
create table if not exists public.chamados_exclusoes (
  id bigint generated always as identity primary key,
  chamado_id_original bigint not null,
  protocolo text,
  aluno_id uuid,
  assunto text,
  categoria text,
  status text,
  prioridade text,
  motivo text not null,
  excluido_por uuid not null,
  excluido_em timestamp with time zone not null default now(),
  dados_originais jsonb not null
);

create index if not exists chamados_exclusoes_data_idx
  on public.chamados_exclusoes(excluido_em desc);

create index if not exists chamados_exclusoes_protocolo_idx
  on public.chamados_exclusoes(protocolo);

alter table public.chamados_exclusoes enable row level security;

drop policy if exists gestor_le_chamados_excluidos on public.chamados_exclusoes;
create policy gestor_le_chamados_excluidos
on public.chamados_exclusoes
for select
to authenticated
using (public.e_gestor(3));

grant select on public.chamados_exclusoes to authenticated;

-- -----------------------------------------------------------------------------
-- 3. EXCLUSAO SEGURA DE CHAMADOS PELO GESTOR
-- -----------------------------------------------------------------------------
create or replace function public.gestor_excluir_chamado(
  p_chamado_id bigint,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chamado public.chamados%rowtype;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_interacoes jsonb;
begin
  if auth.uid() is null or not public.e_gestor(1) then
    raise exception 'Acesso restrito a gestores ativos.' using errcode = '42501';
  end if;

  if length(v_motivo) < 3 then
    raise exception 'Informe o motivo da exclusao.';
  end if;

  select * into v_chamado
  from public.chamados
  where id = p_chamado_id
  for update;

  if not found then
    raise exception 'Chamado nao encontrado.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.criado_em), '[]'::jsonb)
  into v_interacoes
  from public.chamado_interacoes i
  where i.chamado_id = p_chamado_id;

  insert into public.chamados_exclusoes (
    chamado_id_original,
    protocolo,
    aluno_id,
    assunto,
    categoria,
    status,
    prioridade,
    motivo,
    excluido_por,
    dados_originais
  ) values (
    v_chamado.id,
    v_chamado.protocolo,
    v_chamado.aluno_id,
    v_chamado.assunto,
    v_chamado.categoria,
    v_chamado.status,
    v_chamado.prioridade,
    v_motivo,
    auth.uid(),
    jsonb_build_object(
      'chamado', to_jsonb(v_chamado),
      'interacoes', v_interacoes
    )
  );

  delete from public.chamados
  where id = p_chamado_id;

  return jsonb_build_object(
    'excluido', true,
    'chamado_id', p_chamado_id,
    'protocolo', v_chamado.protocolo
  );
end;
$$;

revoke all on function public.gestor_excluir_chamado(bigint, text) from public;
grant execute on function public.gestor_excluir_chamado(bigint, text) to authenticated;

commit;

select 'Atualizacao 09 aplicada com sucesso' as resultado;
