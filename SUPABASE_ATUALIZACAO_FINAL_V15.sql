-- =============================================================================
-- ALTITUDE — ATUALIZAÇÃO FINAL V15
-- Fluxo de certificados em dois modos, devolução integral de horas em exclusões,
-- processamento automático e correções de status.
-- Execute após a V14. Pode ser executada mais de uma vez.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. CAMPOS E STATUS DO CERTIFICADO
-- -----------------------------------------------------------------------------
alter table public.certificados
  add column if not exists modo_liberacao text,
  add column if not exists contagem_iniciada_em timestamp with time zone,
  add column if not exists liberar_em timestamp with time zone;

-- Remove a restrição antiga, que aceitava somente quatro estados.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.certificados'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.certificados drop constraint if exists %I', v_constraint.conname);
  end loop;
end $$;

alter table public.certificados
  add constraint certificados_status_check_v15
  check (status in ('PENDENTE','AGUARDANDO_HORAS','EMITIDO','BLOQUEADO','CANCELADO'));

alter table public.certificados
  drop constraint if exists certificados_modo_liberacao_check_v15;
alter table public.certificados
  add constraint certificados_modo_liberacao_check_v15
  check (modo_liberacao is null or modo_liberacao in ('AUTOMATICO','IMEDIATO'));

create index if not exists certificados_liberar_em_idx
  on public.certificados(status, liberar_em)
  where status = 'AGUARDANDO_HORAS';

-- -----------------------------------------------------------------------------
-- 2. REGISTRO ADMINISTRATIVO DE EXCLUSÕES
-- -----------------------------------------------------------------------------
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
  horas_devolvidas integer not null default 0,
  excluido_por uuid not null references auth.users(id),
  excluido_em timestamp with time zone not null default now()
);

alter table public.certificados_exclusoes
  add column if not exists horas_devolvidas integer not null default 0;

alter table public.certificados_exclusoes enable row level security;
drop policy if exists gestor_le_certificados_excluidos_v15 on public.certificados_exclusoes;
create policy gestor_le_certificados_excluidos_v15
  on public.certificados_exclusoes for select to authenticated
  using (public.e_gestor(2));
grant select on public.certificados_exclusoes to authenticated;

-- -----------------------------------------------------------------------------
-- 3. FUNÇÕES DE DATA ÚTIL
-- -----------------------------------------------------------------------------
create or replace function public.altitude_data_util_inicio_v15(p_data date)
returns date
language plpgsql
immutable
as $$
declare
  v_data date := coalesce(p_data, current_date);
begin
  while extract(isodow from v_data) > 5 loop
    v_data := v_data + 1;
  end loop;
  return v_data;
end;
$$;

create or replace function public.altitude_data_liberacao_v15(
  p_inicio date,
  p_horas integer
)
returns date
language plpgsql
immutable
as $$
declare
  v_data date := public.altitude_data_util_inicio_v15(coalesce(p_inicio, current_date));
  v_dias integer := greatest(1, ceil(greatest(1, coalesce(p_horas, 1)) / 8.0)::integer);
  v_contador integer := 1;
begin
  while v_contador < v_dias loop
    v_data := v_data + 1;
    if extract(isodow from v_data) <= 5 then
      v_contador := v_contador + 1;
    end if;
  end loop;
  return v_data;
end;
$$;


create or replace function public.altitude_subtrair_dias_uteis_v15(
  p_fim date,
  p_dias integer
)
returns date
language plpgsql
immutable
as $$
declare
  v_data date := coalesce(p_fim,current_date);
  v_restante integer := greatest(0,coalesce(p_dias,0));
begin
  while extract(isodow from v_data) > 5 loop
    v_data := v_data - 1;
  end loop;
  while v_restante > 0 loop
    v_data := v_data - 1;
    if extract(isodow from v_data) <= 5 then
      v_restante := v_restante - 1;
    end if;
  end loop;
  return v_data;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. EMISSÃO INTERNA: CONSOME A RESERVA UMA ÚNICA VEZ
-- -----------------------------------------------------------------------------
create or replace function public.altitude_emitir_certificado_v15(
  p_certificado_id bigint,
  p_realizado_por uuid default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cert public.certificados%rowtype;
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_matricula public.matriculas%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_horas integer := 0;
  v_reserva_outros integer := 0;
  v_total_necessario integer := 0;
  v_codigo uuid;
  v_numero text;
  v_inicio date;
  v_fim date;
begin
  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;

  if not found then raise exception 'Certificado não encontrado.'; end if;
  if upper(coalesce(v_cert.status,'')) = 'EMITIDO' then return to_jsonb(v_cert); end if;
  if upper(coalesce(v_cert.status,'')) = 'CANCELADO' then raise exception 'Certificado cancelado não pode ser emitido.'; end if;

  select * into v_aluno from public.alunos where user_id = v_cert.aluno_id;
  select * into v_curso from public.cursos where id = v_cert.curso_id;
  select * into v_matricula
  from public.matriculas
  where aluno_id = v_cert.aluno_id and curso_id = v_cert.curso_id
  order by criada_em asc, id asc limit 1;
  if v_matricula.id is null then raise exception 'Matrícula do aluno não encontrada.'; end if;

  v_horas := greatest(0, coalesce(nullif(v_cert.horas_solicitadas,0), nullif(v_cert.horas_emitidas,0), 0));
  if v_horas < 5 or mod(v_horas,5) <> 0 then
    raise exception 'A carga solicitada deve possuir pelo menos 5 horas e ser múltipla de 5.';
  end if;

  insert into public.carteiras_horas_curso(aluno_id, curso_id)
  values(v_cert.aluno_id, v_cert.curso_id)
  on conflict(aluno_id, curso_id) do nothing;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id = v_cert.aluno_id and curso_id = v_cert.curso_id
  for update;

  -- Certificado anteriormente emitido e depois bloqueado: apenas reativa.
  if coalesce(v_cert.saldo_processado,false) and coalesce(v_cert.horas_emitidas,0) > 0 then
    update public.certificados
    set status = 'EMITIDO',
        emitido_em = coalesce(emitido_em, now()),
        liberado_em = now(),
        liberar_em = null,
        liberado_por = coalesce(p_realizado_por, liberado_por),
        observacao_gestor = nullif(trim(coalesce(p_observacao,'')),''),
        atualizado_em = now()
    where id = v_cert.id
    returning * into v_cert;
    return to_jsonb(v_cert);
  end if;

  -- Reserva necessária para todas as outras solicitações ainda ativas.
  select coalesce(sum(greatest(0, coalesce(c.horas_solicitadas,0))),0)::integer
  into v_reserva_outros
  from public.certificados c
  where c.aluno_id = v_cert.aluno_id
    and c.curso_id = v_cert.curso_id
    and c.id <> v_cert.id
    and coalesce(c.saldo_processado,false) = false
    and upper(coalesce(c.status,'')) in ('PENDENTE','BLOQUEADO','AGUARDANDO_HORAS');

  v_total_necessario := coalesce(v_carteira.horas_utilizadas,0) + v_horas + v_reserva_outros;
  if coalesce(v_carteira.horas_validadas,0) < v_total_necessario then
    raise exception 'Saldo validado insuficiente para a emissão. Necessário: %h; validado: %h.',
      v_total_necessario, coalesce(v_carteira.horas_validadas,0);
  end if;

  update public.carteiras_horas_curso
  set horas_reservadas = v_reserva_outros,
      horas_utilizadas = coalesce(horas_utilizadas,0) + v_horas,
      atualizado_em = now()
  where id = v_carteira.id
  returning * into v_carteira;

  v_codigo := coalesce(v_cert.codigo_validacao, gen_random_uuid());
  v_numero := coalesce(nullif(v_cert.numero_certificado,''),
    'ALT-' || to_char(current_date,'YYYY') || '-' || upper(substr(replace(v_codigo::text,'-',''),1,12)));

  if upper(coalesce(v_cert.modo_liberacao,'')) = 'AUTOMATICO' then
    v_inicio := coalesce(v_cert.contagem_iniciada_em::date, v_matricula.criada_em::date);
    v_fim := coalesce(v_cert.liberar_em::date, current_date);
  else
    v_fim := current_date;
    v_inicio := greatest(
      v_matricula.criada_em::date,
      public.altitude_subtrair_dias_uteis_v15(current_date, greatest(0, ceil(v_horas / 8.0)::integer - 1))
    );
  end if;

  update public.certificados
  set status = 'EMITIDO',
      horas_emitidas = v_horas,
      horas_solicitadas = v_horas,
      codigo_validacao = v_codigo,
      numero_certificado = v_numero,
      nome_aluno = upper(coalesce(v_aluno.nome, nome_aluno)),
      nome_curso = coalesce(v_curso.titulo, nome_curso),
      emitido_em = coalesce(emitido_em, now()),
      liberado_em = now(),
      liberar_em = null,
      liberado_por = coalesce(p_realizado_por, liberado_por),
      observacao_gestor = nullif(trim(coalesce(p_observacao,'')),''),
      periodo_inicio = v_inicio,
      periodo_fim = v_fim,
      saldo_processado = true,
      atualizado_em = now(),
      matricula_id = coalesce(matricula_id, v_matricula.id)
  where id = v_cert.id
  returning * into v_cert;

  if to_regclass('public.movimentacoes_horas') is not null then
    insert into public.movimentacoes_horas(
      carteira_id, aluno_id, curso_id, certificado_id, tipo, horas,
      saldo_validado, saldo_reservado, saldo_utilizado, observacao, realizado_por
    ) values(
      v_carteira.id, v_cert.aluno_id, v_cert.curso_id, v_cert.id,
      'LIBERACAO_CERTIFICADO', v_horas,
      v_carteira.horas_validadas, v_carteira.horas_reservadas, v_carteira.horas_utilizadas,
      coalesce(nullif(trim(coalesce(p_observacao,'')),''), format('Certificado de %s horas emitido.',v_horas)),
      p_realizado_por
    );
  end if;

  return to_jsonb(v_cert);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. GESTOR ESCOLHE: CONTAGEM AUTOMÁTICA OU LIBERAÇÃO IMEDIATA
-- -----------------------------------------------------------------------------
create or replace function public.gestor_programar_certificado_v15(
  p_certificado_id bigint,
  p_modo text,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_cert public.certificados%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_horas integer := 0;
  v_reserva_ativa integer := 0;
  v_total_necessario integer := 0;
  v_modo text := upper(trim(coalesce(p_modo,'')));
  v_data date;
  v_liberar_em timestamp with time zone;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica.' using errcode='42501';
  end if;
  if v_modo not in ('AUTOMATICO','IMEDIATO') then
    raise exception 'Escolha AUTOMATICO ou IMEDIATO.';
  end if;

  select * into v_cert from public.certificados where id = p_certificado_id for update;
  if not found then raise exception 'Certificado não encontrado.'; end if;
  if upper(coalesce(v_cert.status,'')) = 'CANCELADO' then raise exception 'A solicitação está cancelada.'; end if;

  v_horas := greatest(0, coalesce(nullif(v_cert.horas_solicitadas,0), nullif(v_cert.horas_emitidas,0),0));
  if v_horas < 5 or mod(v_horas,5) <> 0 then
    raise exception 'A carga solicitada deve ser múltipla de 5 e ter pelo menos 5 horas.';
  end if;

  insert into public.carteiras_horas_curso(aluno_id,curso_id)
  values(v_cert.aluno_id,v_cert.curso_id)
  on conflict(aluno_id,curso_id) do nothing;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id=v_cert.aluno_id and curso_id=v_cert.curso_id
  for update;

  select coalesce(sum(greatest(0,coalesce(c.horas_solicitadas,0))),0)::integer
  into v_reserva_ativa
  from public.certificados c
  where c.aluno_id=v_cert.aluno_id
    and c.curso_id=v_cert.curso_id
    and coalesce(c.saldo_processado,false)=false
    and upper(coalesce(c.status,'')) in ('PENDENTE','BLOQUEADO','AGUARDANDO_HORAS');

  v_reserva_ativa := greatest(v_reserva_ativa, v_horas);
  v_total_necessario := coalesce(v_carteira.horas_utilizadas,0) + v_reserva_ativa;

  update public.carteiras_horas_curso
  set horas_validadas = greatest(coalesce(horas_validadas,0), v_total_necessario),
      horas_reservadas = v_reserva_ativa,
      liberacao_excepcional = case when v_modo='IMEDIATO' then true else liberacao_excepcional end,
      justificativa_gestor = case
        when v_modo='IMEDIATO' then coalesce(nullif(trim(coalesce(p_observacao,'')),''),'Carga integral creditada pela gestão para emissão imediata.')
        else justificativa_gestor
      end,
      validado_por = v_uid,
      validado_em = now(),
      atualizado_em = now()
  where id = v_carteira.id
  returning * into v_carteira;

  if v_modo = 'IMEDIATO' then
    update public.certificados
    set modo_liberacao='IMEDIATO',
        contagem_iniciada_em=now(),
        liberar_em=now(),
        liberado_por=v_uid,
        observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),
        atualizado_em=now()
    where id=v_cert.id;
    return public.altitude_emitir_certificado_v15(v_cert.id,v_uid,p_observacao);
  end if;

  v_data := public.altitude_data_liberacao_v15(current_date,v_horas);
  v_liberar_em := make_timestamptz(
    extract(year from v_data)::integer,
    extract(month from v_data)::integer,
    extract(day from v_data)::integer,
    23,59,59,'America/Belem'
  );

  update public.certificados
  set status='AGUARDANDO_HORAS',
      modo_liberacao='AUTOMATICO',
      contagem_iniciada_em=now(),
      liberar_em=v_liberar_em,
      liberado_por=v_uid,
      observacao_gestor=coalesce(nullif(trim(coalesce(p_observacao,'')),''),'Contagem automática autorizada pela gestão: 8 horas por dia útil.'),
      atualizado_em=now()
  where id=v_cert.id
  returning * into v_cert;

  return to_jsonb(v_cert);
end;
$$;

-- Processa emissões automáticas vencidas. Pode ser chamado pelo portal do aluno
-- e pelo portal do gestor; somente registros cujo prazo venceu são alterados.
create or replace function public.processar_certificados_automaticos_v15()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_item record;
  v_processados integer := 0;
  v_erros integer := 0;
begin
  for v_item in
    select id, liberado_por, observacao_gestor
    from public.certificados
    where status='AGUARDANDO_HORAS'
      and liberar_em is not null
      and liberar_em <= now()
    order by liberar_em asc
    for update skip locked
  loop
    begin
      perform public.altitude_emitir_certificado_v15(
        v_item.id,
        v_item.liberado_por,
        coalesce(v_item.observacao_gestor,'Contagem automática concluída.')
      );
      v_processados := v_processados + 1;
    exception when others then
      v_erros := v_erros + 1;
    end;
  end loop;

  return jsonb_build_object('ok',true,'processados',v_processados,'erros',v_erros);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. EXCLUSÃO COM DEVOLUÇÃO DAS HORAS AO SALDO
-- -----------------------------------------------------------------------------
create or replace function public.gestor_excluir_solicitacao_certificado(
  p_certificado_id bigint,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_cert public.certificados%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_reserva_outros integer := 0;
  v_devolvidas integer := 0;
  v_antes_reservadas integer := 0;
  v_antes_utilizadas integer := 0;
  v_horas_processadas integer := 0;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão.' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_motivo,'')),'') is null then
    raise exception 'Informe o motivo da exclusão.';
  end if;

  select * into v_cert
  from public.certificados
  where id=p_certificado_id
  for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if upper(coalesce(v_cert.status,''))='EMITIDO' then
    raise exception 'Certificado emitido não pode ser excluído diretamente. Bloqueie ou cancele antes de excluir.';
  end if;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id=v_cert.aluno_id and curso_id=v_cert.curso_id
  for update;

  if found then
    v_antes_reservadas := coalesce(v_carteira.horas_reservadas,0);
    v_antes_utilizadas := coalesce(v_carteira.horas_utilizadas,0);

    if coalesce(v_cert.saldo_processado,false) and coalesce(v_cert.horas_emitidas,0)>0 then
      v_horas_processadas := least(v_antes_utilizadas,greatest(0,v_cert.horas_emitidas));
      update public.carteiras_horas_curso
      set horas_utilizadas=greatest(0,coalesce(horas_utilizadas,0)-v_horas_processadas),
          atualizado_em=now()
      where id=v_carteira.id
      returning * into v_carteira;
      v_devolvidas := v_horas_processadas;
    else
      select coalesce(sum(greatest(0,coalesce(c.horas_solicitadas,0))),0)::integer
      into v_reserva_outros
      from public.certificados c
      where c.aluno_id=v_cert.aluno_id
        and c.curso_id=v_cert.curso_id
        and c.id<>v_cert.id
        and coalesce(c.saldo_processado,false)=false
        and upper(coalesce(c.status,'')) in ('PENDENTE','BLOQUEADO','AGUARDANDO_HORAS');

      v_reserva_outros := least(v_reserva_outros, greatest(0,coalesce(v_carteira.horas_validadas,0)-coalesce(v_carteira.horas_utilizadas,0)));
      update public.carteiras_horas_curso
      set horas_reservadas=v_reserva_outros,
          atualizado_em=now()
      where id=v_carteira.id
      returning * into v_carteira;
      v_devolvidas := greatest(0,v_antes_reservadas-v_reserva_outros);
    end if;

    if v_devolvidas>0 and to_regclass('public.movimentacoes_horas') is not null then
      insert into public.movimentacoes_horas(
        carteira_id,aluno_id,curso_id,certificado_id,tipo,horas,
        saldo_validado,saldo_reservado,saldo_utilizado,observacao,realizado_por
      ) values(
        v_carteira.id,v_cert.aluno_id,v_cert.curso_id,v_cert.id,
        'ESTORNO_RESERVA',v_devolvidas,
        v_carteira.horas_validadas,v_carteira.horas_reservadas,v_carteira.horas_utilizadas,
        'Horas devolvidas ao crédito do aluno após exclusão da solicitação. '||trim(p_motivo),v_uid
      );
    end if;
  end if;

  insert into public.certificados_exclusoes(
    certificado_id_original,aluno_id,curso_id,status_anterior,
    horas_solicitadas,horas_emitidas,numero_certificado,codigo_validacao,
    motivo,horas_devolvidas,excluido_por
  ) values(
    v_cert.id,v_cert.aluno_id,v_cert.curso_id,coalesce(v_cert.status,'DESCONHECIDO'),
    greatest(0,coalesce(v_cert.horas_solicitadas,0)),
    greatest(0,coalesce(v_cert.horas_emitidas,0)),
    v_cert.numero_certificado,v_cert.codigo_validacao,
    trim(p_motivo),v_devolvidas,v_uid
  );

  delete from public.certificados where id=v_cert.id;

  return jsonb_build_object(
    'ok',true,
    'certificado_id',p_certificado_id,
    'horas_devolvidas',v_devolvidas,
    'saldo_disponivel',case when v_carteira.id is null then 0 else greatest(0,v_carteira.horas_validadas-v_carteira.horas_reservadas-v_carteira.horas_utilizadas) end,
    'mensagem',format('%s hora(s) devolvidas ao crédito do aluno.',v_devolvidas)
  );
end;
$$;

revoke all on function public.altitude_emitir_certificado_v15(bigint,uuid,text) from public;
revoke all on function public.gestor_programar_certificado_v15(bigint,text,text) from public;
revoke all on function public.processar_certificados_automaticos_v15() from public;
revoke all on function public.gestor_excluir_solicitacao_certificado(bigint,text) from public;

grant execute on function public.gestor_programar_certificado_v15(bigint,text,text) to authenticated;
grant execute on function public.processar_certificados_automaticos_v15() to authenticated;
grant execute on function public.gestor_excluir_solicitacao_certificado(bigint,text) to authenticated;

-- Agenda a verificação a cada 5 minutos quando o pg_cron estiver disponível.
-- Se a extensão não estiver liberada no projeto, o portal continua usando o
-- processamento por Realtime/polling como alternativa.
do $cron_setup$
begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    begin
      execute 'create extension if not exists pg_cron';
    exception when others then
      raise notice 'pg_cron não pôde ser ativado; será usado o processamento pelo portal.';
    end;

    if to_regnamespace('cron') is not null then
      begin
        execute 'select cron.unschedule(jobid) from cron.job where jobname = ''altitude-certificados-v15''';
      exception when others then null;
      end;
      begin
        execute $schedule$
          select cron.schedule(
            'altitude-certificados-v15',
            '*/5 * * * *',
            'select public.processar_certificados_automaticos_v15();'
          )
        $schedule$;
      exception when others then
        raise notice 'Não foi possível criar o agendamento; será usado o processamento pelo portal.';
      end;
    end if;
  end if;
end
$cron_setup$;

-- Realtime para os dados que precisam atualizar sem trocar de página.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['certificados','certificados_historico','carteiras_horas_curso'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I',v_tabela);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

commit;

select 'Atualização final V15 aplicada com sucesso' as resultado;
