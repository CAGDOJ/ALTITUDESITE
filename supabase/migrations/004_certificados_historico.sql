-- =============================================================================
-- ALTITUDE - ATUALIZAÇÃO 04
-- Aprovação de certificados pela gestão, histórico, carteirinha e correções
-- Execute após as atualizações 01, 02 e 03.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. CAMPOS COMPLEMENTARES
-- -----------------------------------------------------------------------------
alter table public.modulos
  add column if not exists carga_horaria integer;

alter table public.certificados
  add column if not exists solicitado_em timestamp with time zone,
  add column if not exists liberado_em timestamp with time zone,
  add column if not exists liberado_por uuid references auth.users(id),
  add column if not exists observacao_gestor text,
  add column if not exists versao_pdf integer not null default 2;

update public.certificados
set solicitado_em = coalesce(solicitado_em, criado_em::timestamp with time zone, now()),
    liberado_em = case
      when status = 'EMITIDO' then coalesce(liberado_em, emitido_em, atualizado_em, criado_em::timestamp with time zone)
      else liberado_em
    end,
    versao_pdf = coalesce(versao_pdf, 2)
where solicitado_em is null
   or versao_pdf is null
   or (status = 'EMITIDO' and liberado_em is null);

-- -----------------------------------------------------------------------------
-- 2. HISTÓRICO IMUTÁVEL DE MOVIMENTAÇÕES
-- -----------------------------------------------------------------------------
create table if not exists public.certificados_historico (
  id bigint generated always as identity primary key,
  certificado_id bigint not null references public.certificados(id) on delete cascade,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  curso_id bigint not null references public.cursos(id) on delete cascade,
  acao text not null,
  status_anterior text,
  status_novo text not null,
  observacao text,
  realizado_por uuid references auth.users(id),
  criado_em timestamp with time zone not null default now()
);

create index if not exists certificados_historico_aluno_idx
  on public.certificados_historico(aluno_id, criado_em desc);
create index if not exists certificados_historico_certificado_idx
  on public.certificados_historico(certificado_id, criado_em desc);

create or replace function public.registrar_historico_certificado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acao text;
begin
  if tg_op = 'INSERT' then
    v_acao := case new.status
      when 'PENDENTE' then 'SOLICITADO'
      when 'EMITIDO' then 'EMITIDO'
      when 'BLOQUEADO' then 'BLOQUEADO'
      when 'CANCELADO' then 'CANCELADO'
      else 'CRIADO'
    end;

    insert into public.certificados_historico
      (certificado_id, aluno_id, curso_id, acao, status_anterior, status_novo,
       observacao, realizado_por, criado_em)
    values
      (new.id, new.aluno_id, new.curso_id, v_acao, null, new.status,
       new.observacao_gestor, auth.uid(), now());

  elsif old.status is distinct from new.status
     or old.observacao_gestor is distinct from new.observacao_gestor then
    v_acao := case new.status
      when 'PENDENTE' then 'REABERTO'
      when 'EMITIDO' then 'LIBERADO'
      when 'BLOQUEADO' then 'BLOQUEADO'
      when 'CANCELADO' then 'CANCELADO'
      else 'ATUALIZADO'
    end;

    insert into public.certificados_historico
      (certificado_id, aluno_id, curso_id, acao, status_anterior, status_novo,
       observacao, realizado_por, criado_em)
    values
      (new.id, new.aluno_id, new.curso_id, v_acao, old.status, new.status,
       new.observacao_gestor, auth.uid(), now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_certificados_historico on public.certificados;
create trigger trg_certificados_historico
after insert or update on public.certificados
for each row execute function public.registrar_historico_certificado();

-- Registra o estado atual dos certificados antigos sem duplicar.
insert into public.certificados_historico
  (certificado_id, aluno_id, curso_id, acao, status_anterior, status_novo,
   observacao, realizado_por, criado_em)
select
  c.id,
  c.aluno_id,
  c.curso_id,
  'IMPORTADO',
  null,
  c.status,
  coalesce(c.observacao_gestor, 'Registro existente antes da atualização 04.'),
  c.liberado_por,
  coalesce(c.solicitado_em, c.criado_em::timestamp with time zone, now())
from public.certificados c
where not exists (
  select 1 from public.certificados_historico h where h.certificado_id = c.id
);

-- -----------------------------------------------------------------------------
-- 3. SOLICITAÇÃO PELO ALUNO
-- O aluno conclui e solicita. A gestão libera na aba Certificados.
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_certificado_curso(p_curso_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_resultado public.resultados_provas%rowtype;
  v_cert public.certificados%rowtype;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_aluno
  from public.alunos
  where user_id = v_uid;

  if v_aluno.user_id is null then
    raise exception 'Aluno não encontrado';
  end if;

  select c.* into v_curso
  from public.cursos c
  join public.matriculas m on m.curso_id = c.id
  where c.id = p_curso_id
    and m.aluno_id = v_uid
    and m.progresso >= 100
    and m.status in ('ATIVA', 'CONCLUIDA')
  order by m.id desc
  limit 1;

  if v_curso.id is null then
    raise exception 'Curso ainda não foi concluído';
  end if;

  select * into v_resultado
  from public.resultados_provas
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and aprovado = true
    and nota >= coalesce(v_curso.nota_minima, 70)
  order by nota desc, criado_em desc
  limit 1;

  if v_resultado.id is null then
    raise exception 'Aprovação na prova ainda não registrada';
  end if;

  select * into v_cert
  from public.certificados
  where aluno_id = v_uid
    and curso_id = p_curso_id
  order by id desc
  limit 1;

  if v_cert.id is not null and v_cert.status in ('EMITIDO', 'PENDENTE', 'BLOQUEADO') then
    return to_jsonb(v_cert);
  end if;

  insert into public.certificados
    (aluno_id, curso_id, status, horas_emitidas, criado_em, solicitado_em,
     nome_aluno, nome_curso, nota_final, atualizado_em, versao_pdf)
  values
    (v_uid, p_curso_id, 'PENDENTE', coalesce(v_curso.carga_horaria, 0), now(), now(),
     v_aluno.nome, v_curso.titulo, v_resultado.nota, now(), 2)
  returning * into v_cert;

  return to_jsonb(v_cert);
end;
$$;

-- Compatibilidade com versões antigas do JavaScript.
create or replace function public.emitir_certificado_curso(p_curso_id bigint)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.solicitar_certificado_curso(p_curso_id);
$$;

-- -----------------------------------------------------------------------------
-- 4. DECISÃO DO GESTOR
-- -----------------------------------------------------------------------------
create or replace function public.gestor_decidir_certificado(
  p_certificado_id bigint,
  p_acao text,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_acao text := upper(trim(coalesce(p_acao, '')));
  v_cert public.certificados%rowtype;
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_resultado public.resultados_provas%rowtype;
  v_codigo uuid;
  v_numero text;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica';
  end if;

  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;

  if v_cert.id is null then
    raise exception 'Certificado não encontrado';
  end if;

  if v_acao = 'LIBERAR' then
    select * into v_aluno from public.alunos where user_id = v_cert.aluno_id;
    select * into v_curso from public.cursos where id = v_cert.curso_id;
    select * into v_resultado
    from public.resultados_provas
    where aluno_id = v_cert.aluno_id
      and curso_id = v_cert.curso_id
      and aprovado = true
      and nota >= coalesce(v_curso.nota_minima, 70)
    order by nota desc, criado_em desc
    limit 1;

    if v_resultado.id is null then
      raise exception 'O aluno ainda não possui prova aprovada para este curso';
    end if;

    v_codigo := coalesce(v_cert.codigo_validacao, gen_random_uuid());
    v_numero := coalesce(
      v_cert.numero_certificado,
      'ALT-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(v_codigo::text, '-', ''), 1, 12))
    );

    -- Mantém somente um certificado válido por aluno e curso.
    update public.certificados
    set status = 'CANCELADO',
        observacao_gestor = 'Substituído por uma emissão mais recente.',
        atualizado_em = now()
    where aluno_id = v_cert.aluno_id
      and curso_id = v_cert.curso_id
      and id <> v_cert.id
      and status = 'EMITIDO';

    update public.certificados
    set status = 'EMITIDO',
        emitido_em = now(),
        liberado_em = now(),
        liberado_por = v_uid,
        codigo_validacao = v_codigo,
        numero_certificado = v_numero,
        nome_aluno = v_aluno.nome,
        nome_curso = v_curso.titulo,
        horas_emitidas = coalesce(v_curso.carga_horaria, 0),
        nota_final = v_resultado.nota,
        observacao_gestor = nullif(trim(coalesce(p_observacao, '')), ''),
        valido_ate = null,
        versao_pdf = 2,
        atualizado_em = now()
    where id = v_cert.id
    returning * into v_cert;

  elsif v_acao = 'BLOQUEAR' then
    update public.certificados
    set status = 'BLOQUEADO',
        observacao_gestor = coalesce(nullif(trim(coalesce(p_observacao, '')), ''), 'Bloqueado pela gestão acadêmica.'),
        atualizado_em = now()
    where id = v_cert.id
    returning * into v_cert;

  elsif v_acao = 'CANCELAR' then
    update public.certificados
    set status = 'CANCELADO',
        observacao_gestor = coalesce(nullif(trim(coalesce(p_observacao, '')), ''), 'Cancelado pela gestão acadêmica.'),
        atualizado_em = now()
    where id = v_cert.id
    returning * into v_cert;

  elsif v_acao in ('REABRIR', 'PENDENTE') then
    update public.certificados
    set status = 'PENDENTE',
        solicitado_em = now(),
        observacao_gestor = nullif(trim(coalesce(p_observacao, '')), ''),
        atualizado_em = now()
    where id = v_cert.id
    returning * into v_cert;

  else
    raise exception 'Ação inválida. Use LIBERAR, BLOQUEAR, CANCELAR ou REABRIR';
  end if;

  return to_jsonb(v_cert);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. VALIDAÇÃO PÚBLICA CLARA
-- -----------------------------------------------------------------------------
create or replace function public.validar_certificado(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert public.certificados%rowtype;
  v_valido boolean;
  v_mensagem text;
begin
  select * into v_cert
  from public.certificados
  where lower(codigo_validacao::text) = lower(trim(p_codigo))
     or upper(numero_certificado) = upper(trim(p_codigo))
  order by id desc
  limit 1;

  if v_cert.id is null then
    return jsonb_build_object(
      'encontrado', false,
      'valido', false,
      'mensagem', 'Certificado não encontrado na base oficial da ALTITUDE CENTRO UNIVERSITÁRIO.'
    );
  end if;

  v_valido := v_cert.status = 'EMITIDO'
    and v_cert.emitido_em is not null
    and (v_cert.valido_ate is null or v_cert.valido_ate >= current_date);

  v_mensagem := case
    when v_valido then 'Certificado autêntico, emitido e válido.'
    when v_cert.status = 'PENDENTE' then 'A emissão foi solicitada e aguarda liberação da gestão acadêmica.'
    when v_cert.status = 'BLOQUEADO' then 'Este certificado foi bloqueado pela instituição. Entre em contato com o atendimento.'
    when v_cert.status = 'CANCELADO' then 'Este certificado foi cancelado pela instituição.'
    else 'O registro existe, mas não possui validade atual.'
  end;

  return jsonb_build_object(
    'encontrado', true,
    'valido', v_valido,
    'status', v_cert.status,
    'numero_certificado', v_cert.numero_certificado,
    'codigo_validacao', v_cert.codigo_validacao,
    'nome_aluno', v_cert.nome_aluno,
    'nome_curso', v_cert.nome_curso,
    'horas_emitidas', v_cert.horas_emitidas,
    'nota_final', v_cert.nota_final,
    'emitido_em', v_cert.emitido_em,
    'valido_ate', v_cert.valido_ate,
    'observacao', v_cert.observacao_gestor,
    'mensagem', v_mensagem
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. RLS E PERMISSÕES
-- -----------------------------------------------------------------------------
alter table public.certificados_historico enable row level security;
alter table public.certificados enable row level security;

-- A gestão precisa consultar todos os registros para liberar, bloquear e cancelar.
drop policy if exists gestor_le_todos_certificados on public.certificados;
create policy gestor_le_todos_certificados
on public.certificados
for select to authenticated
using (public.e_gestor(2));

drop policy if exists aluno_le_proprio_historico_certificados on public.certificados_historico;
create policy aluno_le_proprio_historico_certificados
on public.certificados_historico
for select to authenticated
using (aluno_id = auth.uid());

drop policy if exists gestor_le_historico_certificados on public.certificados_historico;
create policy gestor_le_historico_certificados
on public.certificados_historico
for select to authenticated
using (public.e_gestor(2));

grant select on public.certificados to authenticated;
grant select on public.certificados_historico to authenticated;
grant usage, select on sequence public.certificados_historico_id_seq to authenticated;

revoke all on function public.solicitar_certificado_curso(bigint) from public;
revoke all on function public.emitir_certificado_curso(bigint) from public;
revoke all on function public.gestor_decidir_certificado(bigint,text,text) from public;
revoke all on function public.validar_certificado(text) from public;

grant execute on function public.solicitar_certificado_curso(bigint) to authenticated;
grant execute on function public.emitir_certificado_curso(bigint) to authenticated;
grant execute on function public.gestor_decidir_certificado(bigint,text,text) to authenticated;
grant execute on function public.validar_certificado(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. BUCKET DE FOTOS (IDEMPOTENTE)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos_alunos', 'fotos_alunos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='fotos_alunos_leitura_publica') then
    create policy fotos_alunos_leitura_publica on storage.objects
      for select to public using (bucket_id = 'fotos_alunos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='aluno_envia_propria_foto') then
    create policy aluno_envia_propria_foto on storage.objects
      for insert to authenticated with check (
        bucket_id = 'fotos_alunos' and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='aluno_atualiza_propria_foto') then
    create policy aluno_atualiza_propria_foto on storage.objects
      for update to authenticated
      using (bucket_id = 'fotos_alunos' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'fotos_alunos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='aluno_exclui_propria_foto') then
    create policy aluno_exclui_propria_foto on storage.objects
      for delete to authenticated
      using (bucket_id = 'fotos_alunos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

commit;

-- Conferência rápida
select status, count(*) as quantidade
from public.certificados
group by status
order by status;
