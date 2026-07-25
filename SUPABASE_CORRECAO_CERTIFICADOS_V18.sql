-- =============================================================================
-- ALTITUDE - CORRECAO V18
-- 1) Liberação imediata realmente muda o certificado para EMITIDO.
-- 2) Liberação automática mantém o certificado em AGUARDANDO_HORAS.
-- 3) Gestor pode editar os dados exibidos no PDF sem alterar a contabilidade.
-- 4) Compatível com solicitações antigas BLOQUEADAS e já processadas.
-- Execute depois da V17. Pode ser executado novamente sem duplicar estruturas.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

alter table public.certificados
  add column if not exists titulo_documento text not null default 'CERTIFICADO',
  add column if not exists subtitulo_documento text not null default 'DE CONCLUSÃO E APROVEITAMENTO',
  add column if not exists pdf_atualizado_em timestamp with time zone,
  add column if not exists pdf_atualizado_por uuid references auth.users(id);

-- -----------------------------------------------------------------------------
-- Liberação definitiva e autocontida. Não depende das funções antigas.
-- -----------------------------------------------------------------------------
create or replace function public.gestor_liberar_certificado_v18(
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
  v_modo text := upper(trim(coalesce(p_modo, '')));
  v_cert public.certificados%rowtype;
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_matricula public.matriculas%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_horas integer;
  v_reservas_outros integer := 0;
  v_validado_necessario integer := 0;
  v_codigo uuid;
  v_numero text;
  v_inicio date;
  v_fim date;
  v_data_liberacao date;
  v_liberar_em timestamp with time zone;
  v_status_anterior text;
  v_ja_processado boolean := false;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica.' using errcode = '42501';
  end if;

  if v_modo not in ('AUTOMATICO', 'IMEDIATO') then
    raise exception 'Modo inválido. Escolha AUTOMATICO ou IMEDIATO.';
  end if;

  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;

  if not found then
    raise exception 'Certificado não encontrado.';
  end if;

  v_status_anterior := upper(coalesce(v_cert.status, 'PENDENTE'));
  if v_status_anterior = 'CANCELADO' then
    raise exception 'Certificado cancelado não pode ser liberado.';
  end if;

  select * into v_aluno
  from public.alunos
  where user_id = v_cert.aluno_id;
  if not found then raise exception 'Cadastro do aluno não encontrado.'; end if;

  select * into v_curso
  from public.cursos
  where id = v_cert.curso_id;
  if not found then raise exception 'Curso não encontrado.'; end if;

  select * into v_matricula
  from public.matriculas
  where aluno_id = v_cert.aluno_id
    and curso_id = v_cert.curso_id
  order by criada_em asc, id asc
  limit 1;
  if not found then raise exception 'Matrícula do aluno não encontrada.'; end if;

  v_horas := greatest(
    0,
    coalesce(nullif(v_cert.horas_solicitadas, 0), nullif(v_cert.horas_emitidas, 0), 0)
  );
  if v_horas < 5 or mod(v_horas, 5) <> 0 then
    raise exception 'A carga solicitada deve possuir pelo menos 5 horas e ser múltipla de 5.';
  end if;

  insert into public.carteiras_horas_curso (aluno_id, curso_id)
  values (v_cert.aluno_id, v_cert.curso_id)
  on conflict (aluno_id, curso_id) do nothing;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id = v_cert.aluno_id
    and curso_id = v_cert.curso_id
  for update;

  -- Reserva apenas as outras solicitações ainda abertas.
  select coalesce(sum(greatest(0, coalesce(c.horas_solicitadas, 0))), 0)::integer
  into v_reservas_outros
  from public.certificados c
  where c.aluno_id = v_cert.aluno_id
    and c.curso_id = v_cert.curso_id
    and c.id <> v_cert.id
    and coalesce(c.saldo_processado, false) = false
    and upper(coalesce(c.status, '')) in ('PENDENTE', 'BLOQUEADO', 'AGUARDANDO_HORAS');

  v_ja_processado := coalesce(v_cert.saldo_processado, false)
    and coalesce(v_cert.horas_emitidas, 0) > 0;

  if v_modo = 'AUTOMATICO' then
    if v_ja_processado then
      raise exception 'Este certificado já consumiu horas. Use a liberação imediata para reativá-lo.';
    end if;

    -- A gestão autorizou a solicitação: o saldo validado deve cobrir a reserva.
    v_validado_necessario := coalesce(v_carteira.horas_utilizadas, 0)
      + v_reservas_outros + v_horas;

    update public.carteiras_horas_curso
    set horas_validadas = greatest(coalesce(horas_validadas, 0), v_validado_necessario),
        horas_reservadas = v_reservas_outros + v_horas,
        validado_por = v_uid,
        validado_em = now(),
        atualizado_em = now()
    where id = v_carteira.id
    returning * into v_carteira;

    v_data_liberacao := public.altitude_data_liberacao_v15(current_date, v_horas);
    v_liberar_em := make_timestamptz(
      extract(year from v_data_liberacao)::integer,
      extract(month from v_data_liberacao)::integer,
      extract(day from v_data_liberacao)::integer,
      23, 59, 59, 'America/Belem'
    );

    update public.certificados
    set status = 'AGUARDANDO_HORAS',
        modo_liberacao = 'AUTOMATICO',
        contagem_iniciada_em = now(),
        liberar_em = v_liberar_em,
        liberado_por = v_uid,
        liberado_em = null,
        observacao_gestor = coalesce(
          nullif(trim(coalesce(p_observacao, '')), ''),
          'Contagem automática autorizada pela gestão: 8 horas por dia útil.'
        ),
        atualizado_em = now(),
        nome_aluno = coalesce(nullif(nome_aluno, ''), upper(v_aluno.nome)),
        nome_curso = coalesce(nullif(nome_curso, ''), v_curso.titulo),
        matricula_id = coalesce(matricula_id, v_matricula.id)
    where id = v_cert.id
    returning * into v_cert;

    insert into public.certificados_historico (
      certificado_id, aluno_id, curso_id, acao,
      status_anterior, status_novo, observacao, realizado_por
    ) values (
      v_cert.id, v_cert.aluno_id, v_cert.curso_id, 'CONTAGEM_AUTOMATICA_INICIADA',
      v_status_anterior, 'AGUARDANDO_HORAS', v_cert.observacao_gestor, v_uid
    );

    return to_jsonb(v_cert);
  end if;

  -- Liberação imediata. Se o certificado já consumiu o saldo anteriormente,
  -- apenas reativa; caso contrário, consome a carga exatamente uma vez.
  if not v_ja_processado then
    v_validado_necessario := coalesce(v_carteira.horas_utilizadas, 0)
      + v_reservas_outros + v_horas;

    update public.carteiras_horas_curso
    set horas_validadas = greatest(coalesce(horas_validadas, 0), v_validado_necessario),
        horas_reservadas = v_reservas_outros,
        horas_utilizadas = coalesce(horas_utilizadas, 0) + v_horas,
        liberacao_excepcional = true,
        justificativa_gestor = coalesce(
          nullif(trim(coalesce(p_observacao, '')), ''),
          'Carga integral creditada pela gestão para emissão imediata.'
        ),
        validado_por = v_uid,
        validado_em = now(),
        atualizado_em = now()
    where id = v_carteira.id
    returning * into v_carteira;
  else
    update public.carteiras_horas_curso
    set horas_reservadas = v_reservas_outros,
        atualizado_em = now()
    where id = v_carteira.id
    returning * into v_carteira;
  end if;

  v_codigo := coalesce(v_cert.codigo_validacao, gen_random_uuid());
  v_numero := coalesce(
    nullif(v_cert.numero_certificado, ''),
    'ALT-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(v_codigo::text, '-', ''), 1, 12))
  );
  v_fim := current_date;
  v_inicio := greatest(
    v_matricula.criada_em::date,
    public.altitude_subtrair_dias_uteis_v15(
      current_date,
      greatest(0, ceil(v_horas / 8.0)::integer - 1)
    )
  );

  update public.certificados
  set status = 'EMITIDO',
      modo_liberacao = 'IMEDIATO',
      horas_emitidas = v_horas,
      horas_solicitadas = v_horas,
      codigo_validacao = v_codigo,
      numero_certificado = v_numero,
      nome_aluno = coalesce(nullif(nome_aluno, ''), upper(v_aluno.nome)),
      nome_curso = coalesce(nullif(nome_curso, ''), v_curso.titulo),
      emitido_em = coalesce(emitido_em, now()),
      liberado_em = now(),
      contagem_iniciada_em = coalesce(contagem_iniciada_em, now()),
      liberar_em = null,
      liberado_por = v_uid,
      observacao_gestor = nullif(trim(coalesce(p_observacao, '')), ''),
      periodo_inicio = coalesce(periodo_inicio, v_inicio),
      periodo_fim = coalesce(periodo_fim, v_fim),
      saldo_processado = true,
      matricula_id = coalesce(matricula_id, v_matricula.id),
      atualizado_em = now()
  where id = v_cert.id
  returning * into v_cert;

  if not v_ja_processado then
    insert into public.movimentacoes_horas (
      carteira_id, aluno_id, curso_id, certificado_id, tipo, horas,
      saldo_validado, saldo_reservado, saldo_utilizado, observacao, realizado_por
    ) values (
      v_carteira.id, v_cert.aluno_id, v_cert.curso_id, v_cert.id,
      'LIBERACAO_CERTIFICADO', v_horas,
      v_carteira.horas_validadas, v_carteira.horas_reservadas, v_carteira.horas_utilizadas,
      coalesce(nullif(trim(coalesce(p_observacao, '')), ''), format('Certificado de %s horas emitido.', v_horas)),
      v_uid
    );
  end if;

  insert into public.certificados_historico (
    certificado_id, aluno_id, curso_id, acao,
    status_anterior, status_novo, observacao, realizado_por
  ) values (
    v_cert.id, v_cert.aluno_id, v_cert.curso_id, 'CERTIFICADO_EMITIDO',
    v_status_anterior, 'EMITIDO',
    coalesce(nullif(trim(coalesce(p_observacao, '')), ''), 'Emissão imediata autorizada pela gestão.'),
    v_uid
  );

  return to_jsonb(v_cert);
end;
$$;

-- -----------------------------------------------------------------------------
-- Edição dos dados que aparecem no PDF. Não muda saldo, horas utilizadas ou
-- status do documento. A carga horária continua sendo gerenciada na carteira.
-- -----------------------------------------------------------------------------
create or replace function public.gestor_editar_certificado_pdf_v18(
  p_certificado_id bigint,
  p_titulo_documento text,
  p_subtitulo_documento text,
  p_nome_aluno text,
  p_nome_curso text,
  p_nota_final numeric,
  p_periodo_inicio date,
  p_periodo_fim date,
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
  v_inicio date := p_periodo_inicio;
  v_fim date := p_periodo_fim;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica.' using errcode = '42501';
  end if;

  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;
  if not found then raise exception 'Certificado não encontrado.'; end if;

  if nullif(trim(coalesce(p_nome_aluno, '')), '') is null then
    raise exception 'Informe o nome que aparecerá no certificado.';
  end if;
  if nullif(trim(coalesce(p_nome_curso, '')), '') is null then
    raise exception 'Informe o nome do curso que aparecerá no certificado.';
  end if;
  if p_nota_final is not null and (p_nota_final < 0 or p_nota_final > 100) then
    raise exception 'A nota deve ficar entre 0 e 100.';
  end if;
  if v_inicio is not null and v_fim is not null and v_inicio > v_fim then
    raise exception 'A data inicial não pode ser posterior à data final.';
  end if;
  if v_fim is not null and v_fim > current_date then
    raise exception 'A data final não pode ultrapassar a data atual.';
  end if;

  update public.certificados
  set titulo_documento = upper(coalesce(nullif(trim(p_titulo_documento), ''), 'CERTIFICADO')),
      subtitulo_documento = upper(coalesce(nullif(trim(p_subtitulo_documento), ''), 'DE CONCLUSÃO E APROVEITAMENTO')),
      nome_aluno = upper(trim(p_nome_aluno)),
      nome_curso = trim(p_nome_curso),
      nota_final = coalesce(p_nota_final, nota_final),
      periodo_inicio = coalesce(v_inicio, periodo_inicio),
      periodo_fim = coalesce(v_fim, periodo_fim),
      observacao_gestor = coalesce(nullif(trim(coalesce(p_observacao, '')), ''), observacao_gestor),
      versao_pdf = coalesce(versao_pdf, 0) + 1,
      pdf_atualizado_em = now(),
      pdf_atualizado_por = v_uid,
      atualizado_em = now()
  where id = p_certificado_id
  returning * into v_cert;

  insert into public.certificados_historico (
    certificado_id, aluno_id, curso_id, acao,
    status_anterior, status_novo, observacao, realizado_por
  ) values (
    v_cert.id, v_cert.aluno_id, v_cert.curso_id, 'DADOS_PDF_EDITADOS',
    v_cert.status, v_cert.status,
    coalesce(nullif(trim(coalesce(p_observacao, '')), ''), 'Dados exibidos no PDF atualizados pela gestão.'),
    v_uid
  );

  return to_jsonb(v_cert);
end;
$$;

revoke all on function public.gestor_liberar_certificado_v18(bigint, text, text) from public;
revoke all on function public.gestor_editar_certificado_pdf_v18(bigint, text, text, text, text, numeric, date, date, text) from public;

grant execute on function public.gestor_liberar_certificado_v18(bigint, text, text) to authenticated;
grant execute on function public.gestor_editar_certificado_pdf_v18(bigint, text, text, text, text, numeric, date, date, text) to authenticated;

-- Realtime para atualização sem apagar e reconstruir a tela continuamente.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['certificados', 'certificados_historico', 'carteiras_horas_curso'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_tabela);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

commit;

select
  to_regprocedure('public.gestor_liberar_certificado_v18(bigint,text,text)') is not null as liberacao_v18_ok,
  to_regprocedure('public.gestor_editar_certificado_pdf_v18(bigint,text,text,text,text,numeric,date,date,text)') is not null as edicao_pdf_v18_ok,
  'Correção V18 aplicada com sucesso' as resultado;
