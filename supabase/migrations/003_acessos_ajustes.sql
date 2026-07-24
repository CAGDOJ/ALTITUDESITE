-- ALTITUDE - Atualização 03
-- Login do gestor, cargas de 5h a 200h, prioridade de chamados,
-- QR Code da carteirinha e buckets de foto/materiais.
-- Execute APÓS as atualizações 01 e 02.

begin;

create extension if not exists pgcrypto;


alter table public.alunos
  add column if not exists atualizado_em timestamp with time zone not null default now();

-- =============================================================================
-- 1. CARGA HORÁRIA: 5 EM 5, DE 5H A 200H
-- =============================================================================
update public.cursos
set carga_horaria = greatest(
  5,
  least(200, (round(coalesce(carga_horaria, 5)::numeric / 5) * 5)::integer)
)
where carga_horaria is null
   or carga_horaria < 5
   or carga_horaria > 200
   or mod(carga_horaria, 5) <> 0;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'cursos_carga_horaria_check'
      and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos drop constraint cursos_carga_horaria_check;
  end if;

  alter table public.cursos
    alter column carga_horaria set default 5,
    alter column carga_horaria set not null;

  alter table public.cursos
    add constraint cursos_carga_horaria_check
    check (carga_horaria between 5 and 200 and mod(carga_horaria, 5) = 0);
end $$;

-- Repara provas antigas vinculadas somente ao módulo.
update public.provas p
set curso_id = m.curso_id
from public.modulos m
where p.modulo_id = m.id
  and (p.curso_id is null or p.curso_id <> m.curso_id);

-- =============================================================================
-- 2. CARTEIRINHA DIGITAL COM CÓDIGO ÚNICO
-- =============================================================================
alter table public.alunos
  add column if not exists codigo_carteirinha uuid default gen_random_uuid();

update public.alunos
set codigo_carteirinha = gen_random_uuid()
where codigo_carteirinha is null;

alter table public.alunos
  alter column codigo_carteirinha set default gen_random_uuid(),
  alter column codigo_carteirinha set not null;

create unique index if not exists alunos_codigo_carteirinha_uidx
  on public.alunos(codigo_carteirinha);

create or replace function public.validar_carteirinha(p_codigo uuid)
returns table (
  valida boolean,
  nome text,
  ra text,
  status text,
  cursos_ativos bigint,
  emitida_em timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select
    true,
    a.nome,
    a.ra,
    a.status,
    (
      select count(*)
      from public.matriculas m
      where m.aluno_id = a.user_id
        and m.status in ('ATIVA', 'CONCLUIDA')
    )::bigint,
    a.criado_em
  from public.alunos a
  where a.codigo_carteirinha = p_codigo
    and a.status = 'ATIVO'
  limit 1;
$$;

revoke all on function public.validar_carteirinha(uuid) from public;
grant execute on function public.validar_carteirinha(uuid) to anon, authenticated;


create or replace function public.resolver_email_aluno(p_identificador text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.email
  from public.alunos a
  where lower(a.email) = lower(trim(p_identificador))
     or a.ra = upper(trim(p_identificador))
     or regexp_replace(coalesce(a.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_identificador, ''), '\D', '', 'g')
  limit 1;
$$;

revoke all on function public.resolver_email_aluno(text) from public;
grant execute on function public.resolver_email_aluno(text) to anon, authenticated;


-- Cadastro seguro mesmo quando a confirmação de e-mail está ativada.
create or replace function public.verificar_cadastro_aluno(p_email text, p_cpf text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'email_existe', exists (
      select 1 from public.alunos a
      where lower(a.email) = lower(trim(coalesce(p_email, '')))
    ),
    'cpf_existe', exists (
      select 1 from public.alunos a
      where regexp_replace(coalesce(a.cpf, ''), '\D', '', 'g') =
            regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
        and regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') <> ''
    )
  );
$$;

revoke all on function public.verificar_cadastro_aluno(text, text) from public;
grant execute on function public.verificar_cadastro_aluno(text, text) to anon, authenticated;

create or replace function public.criar_perfil_aluno_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_cpf text := regexp_replace(coalesce(v_meta->>'cpf', ''), '\D', '', 'g');
begin
  if upper(coalesce(v_meta->>'perfil', '')) <> 'ALUNO' then
    return new;
  end if;

  if v_cpf <> '' and exists (
    select 1 from public.alunos a
    where regexp_replace(coalesce(a.cpf, ''), '\D', '', 'g') = v_cpf
      and a.user_id <> new.id
  ) then
    raise exception 'CPF já cadastrado';
  end if;

  insert into public.alunos (
    user_id, nome, telefone, objetivo, email, cpf, data_nascimento, status
  ) values (
    new.id,
    trim(coalesce(v_meta->>'nome', split_part(coalesce(new.email, ''), '@', 1))),
    nullif(regexp_replace(coalesce(v_meta->>'telefone', ''), '\D', '', 'g'), ''),
    nullif(trim(coalesce(v_meta->>'objetivo', '')), ''),
    lower(new.email),
    nullif(v_cpf, ''),
    case
      when coalesce(v_meta->>'data_nascimento', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (v_meta->>'data_nascimento')::date
      else null
    end,
    'ATIVO'
  )
  on conflict (user_id) do update set
    nome = excluded.nome,
    telefone = excluded.telefone,
    objetivo = excluded.objetivo,
    email = excluded.email,
    cpf = excluded.cpf,
    data_nascimento = excluded.data_nascimento;

  return new;
end;
$$;

drop trigger if exists trg_criar_perfil_aluno_auth on auth.users;
create trigger trg_criar_perfil_aluno_auth
after insert on auth.users
for each row execute function public.criar_perfil_aluno_auth();

-- =============================================================================
-- 3. PERFIS E LOGIN DOS GESTORES
-- =============================================================================
create table if not exists public.gestores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gestor_id text not null unique,
  nome text not null,
  email text not null unique,
  telefone text,
  cargo text not null default 'GESTOR'
    check (cargo in ('COLABORADOR', 'PROFESSOR', 'COORDENADOR', 'GESTOR')),
  nivel_acesso integer not null default 4 check (nivel_acesso between 1 and 4),
  status text not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

create index if not exists gestores_status_nivel_idx
  on public.gestores(status, nivel_acesso desc);

create or replace function public.normalizar_gestor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.gestor_id := upper(trim(new.gestor_id));
  new.email := lower(trim(new.email));
  new.nome := trim(new.nome);
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_normalizar_gestor on public.gestores;
create trigger trg_normalizar_gestor
before insert or update on public.gestores
for each row execute function public.normalizar_gestor();

create or replace function public.e_gestor(p_nivel_minimo integer default 1)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gestores g
    where g.user_id = auth.uid()
      and g.status = 'ATIVO'
      and g.nivel_acesso >= greatest(1, least(4, coalesce(p_nivel_minimo, 1)))
  );
$$;

create or replace function public.resolver_email_gestor(p_gestor_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select g.email
  from public.gestores g
  where g.gestor_id = upper(trim(p_gestor_id))
    and g.status = 'ATIVO'
  limit 1;
$$;

create or replace function public.obter_meu_perfil_gestor()
returns table (
  user_id uuid,
  gestor_id text,
  nome text,
  email text,
  telefone text,
  cargo text,
  nivel_acesso integer,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select g.user_id, g.gestor_id, g.nome, g.email, g.telefone,
         g.cargo, g.nivel_acesso, g.status
  from public.gestores g
  where g.user_id = auth.uid()
    and g.status = 'ATIVO'
  limit 1;
$$;

revoke all on function public.e_gestor(integer) from public;
revoke all on function public.resolver_email_gestor(text) from public;
revoke all on function public.obter_meu_perfil_gestor() from public;
grant execute on function public.e_gestor(integer) to anon, authenticated;
grant execute on function public.resolver_email_gestor(text) to anon, authenticated;
grant execute on function public.obter_meu_perfil_gestor() to authenticated;

alter table public.gestores enable row level security;

drop policy if exists gestor_le_equipe on public.gestores;
create policy gestor_le_equipe on public.gestores
  for select to authenticated
  using (public.e_gestor(4));

-- =============================================================================
-- 4. CHAMADOS: ALUNO ABRE, GESTOR DEFINE PRIORIDADE
-- =============================================================================
alter table public.chamados
  add column if not exists atualizado_em timestamp with time zone not null default now(),
  add column if not exists prioridade_definida_por uuid references public.gestores(user_id),
  add column if not exists ultima_resposta text,
  add column if not exists respondido_em timestamp with time zone;

update public.chamados
set prioridade = coalesce(prioridade, 'MEDIA'),
    atualizado_em = coalesce(atualizado_em, criado_em, now());

create table if not exists public.chamado_interacoes (
  id bigint generated always as identity primary key,
  chamado_id bigint not null references public.chamados(id) on delete cascade,
  autor_id uuid not null,
  autor_tipo text not null check (autor_tipo in ('ALUNO', 'GESTOR')),
  mensagem text not null,
  criado_em timestamp with time zone not null default now()
);

create index if not exists chamado_interacoes_chamado_idx
  on public.chamado_interacoes(chamado_id, criado_em);

alter table public.chamados enable row level security;
alter table public.chamado_interacoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chamados' and policyname='aluno_insere_proprio_chamado') then
    create policy aluno_insere_proprio_chamado on public.chamados
      for insert to authenticated
      with check (aluno_id = auth.uid() and prioridade = 'MEDIA' and status = 'ABERTO');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chamados' and policyname='aluno_le_proprios_chamados') then
    create policy aluno_le_proprios_chamados on public.chamados
      for select to authenticated
      using (aluno_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chamados' and policyname='gestor_gerencia_chamados') then
    create policy gestor_gerencia_chamados on public.chamados
      for all to authenticated
      using (public.e_gestor(1))
      with check (public.e_gestor(1));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chamado_interacoes' and policyname='aluno_le_interacoes_proprias') then
    create policy aluno_le_interacoes_proprias on public.chamado_interacoes
      for select to authenticated
      using (exists (
        select 1 from public.chamados c
        where c.id = chamado_id and c.aluno_id = auth.uid()
      ));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chamado_interacoes' and policyname='gestor_gerencia_interacoes') then
    create policy gestor_gerencia_interacoes on public.chamado_interacoes
      for all to authenticated
      using (public.e_gestor(1))
      with check (public.e_gestor(1));
  end if;
end $$;

-- =============================================================================
-- 5. POLÍTICAS DE ACESSO DO PORTAL DE GESTÃO
-- =============================================================================
-- As funções do aluno continuam funcionando como SECURITY DEFINER.
-- O acesso direto de escrita fica reservado aos gestores ativos.

do $$
declare
  t text;
  v_nivel integer;
begin
  foreach t in array array[
    'cursos','modulos','materiais','provas','questoes','curso_professores',
    'professores','cupons','financeiro_lancamentos'
  ] loop
    v_nivel := case when t in ('cupons','financeiro_lancamentos') then 4 else 2 end;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'gestor_acesso_total_' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.e_gestor(%s)) with check (public.e_gestor(%s))',
      'gestor_acesso_total_' || t, t, v_nivel, v_nivel
    );
  end loop;
end $$;

alter table public.alunos enable row level security;
alter table public.matriculas enable row level security;
alter table public.pagamentos enable row level security;

drop policy if exists gestor_gerencia_alunos on public.alunos;
drop policy if exists gestor_gerencia_matriculas on public.matriculas;
drop policy if exists gestor_gerencia_pagamentos on public.pagamentos;

do $$
begin

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alunos' and policyname='aluno_insere_proprio_cadastro') then
    create policy aluno_insere_proprio_cadastro on public.alunos
      for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alunos' and policyname='aluno_le_proprio_cadastro') then
    create policy aluno_le_proprio_cadastro on public.alunos
      for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alunos' and policyname='aluno_atualiza_proprio_cadastro') then
    create policy aluno_atualiza_proprio_cadastro on public.alunos
      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alunos' and policyname='gestor_gerencia_alunos') then
    create policy gestor_gerencia_alunos on public.alunos
      for all to authenticated using (public.e_gestor(2)) with check (public.e_gestor(2));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='matriculas' and policyname='aluno_le_proprias_matriculas') then
    create policy aluno_le_proprias_matriculas on public.matriculas
      for select to authenticated using (aluno_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='matriculas' and policyname='gestor_gerencia_matriculas') then
    create policy gestor_gerencia_matriculas on public.matriculas
      for all to authenticated using (public.e_gestor(2)) with check (public.e_gestor(2));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pagamentos' and policyname='aluno_le_proprios_pagamentos') then
    create policy aluno_le_proprios_pagamentos on public.pagamentos
      for select to authenticated using (aluno_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pagamentos' and policyname='gestor_gerencia_pagamentos') then
    create policy gestor_gerencia_pagamentos on public.pagamentos
      for all to authenticated using (public.e_gestor(3)) with check (public.e_gestor(3));
  end if;
end $$;

-- O catálogo anônimo vê somente cursos publicados. Alunos também enxergam
-- cursos já matriculados, mesmo que o gestor os retire posteriormente do catálogo.
drop policy if exists catalogo_le_cursos_publicados on public.cursos;
create policy catalogo_le_cursos_publicados on public.cursos
  for select to anon, authenticated
  using (publicado = true);

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cursos' and policyname='aluno_le_cursos_matriculados') then
    create policy aluno_le_cursos_matriculados on public.cursos
      for select to authenticated
      using (exists (
        select 1 from public.matriculas m
        where m.curso_id = cursos.id and m.aluno_id = auth.uid()
      ));
  end if;
end $$;

-- Gestores também podem consultar/gerenciar tabelas acadêmicas que já tinham RLS.
do $$
declare
  t text;
begin
  foreach t in array array['certificados','resultados_provas','respostas_prova','progresso_modulos','avaliacoes_cursos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'gestor_acesso_total_' || t, t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.e_gestor(2)) with check (public.e_gestor(2))',
        'gestor_acesso_total_' || t, t
      );
    end if;
  end loop;
end $$;

-- Privilégios SQL das tabelas novas. As políticas RLS continuam decidindo cada linha.
grant select on public.gestores to authenticated;
grant select, insert, update on public.chamados to authenticated;
grant select, insert, update on public.chamado_interacoes to authenticated;
grant usage, select on sequence public.chamado_interacoes_id_seq to authenticated;

-- =============================================================================
-- 6. BUCKETS E POLÍTICAS DE UPLOAD
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('fotos_alunos', 'fotos_alunos', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('capas_cursos', 'capas_cursos', true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('materiais_cursos', 'materiais_cursos', true, 52428800, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Substitui as regras amplas da atualização 02 por regras exclusivas da gestão.
drop policy if exists autenticado_envia_capas_cursos on storage.objects;
drop policy if exists autenticado_atualiza_capas_cursos on storage.objects;
drop policy if exists autenticado_envia_materiais_cursos on storage.objects;
drop policy if exists autenticado_atualiza_materiais_cursos on storage.objects;
drop policy if exists gestor_envia_capas_cursos on storage.objects;
drop policy if exists gestor_atualiza_capas_cursos on storage.objects;
drop policy if exists gestor_exclui_capas_cursos on storage.objects;
drop policy if exists gestor_envia_materiais_cursos on storage.objects;
drop policy if exists gestor_atualiza_materiais_cursos on storage.objects;
drop policy if exists gestor_exclui_materiais_cursos on storage.objects;

create policy gestor_envia_capas_cursos on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capas_cursos' and public.e_gestor(2));
create policy gestor_atualiza_capas_cursos on storage.objects
  for update to authenticated
  using (bucket_id = 'capas_cursos' and public.e_gestor(2))
  with check (bucket_id = 'capas_cursos' and public.e_gestor(2));
create policy gestor_exclui_capas_cursos on storage.objects
  for delete to authenticated
  using (bucket_id = 'capas_cursos' and public.e_gestor(2));

create policy gestor_envia_materiais_cursos on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materiais_cursos' and public.e_gestor(2));
create policy gestor_atualiza_materiais_cursos on storage.objects
  for update to authenticated
  using (bucket_id = 'materiais_cursos' and public.e_gestor(2))
  with check (bucket_id = 'materiais_cursos' and public.e_gestor(2));
create policy gestor_exclui_materiais_cursos on storage.objects
  for delete to authenticated
  using (bucket_id = 'materiais_cursos' and public.e_gestor(2));

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='fotos_alunos_leitura_publica') then
    create policy fotos_alunos_leitura_publica on storage.objects
      for select to public using (bucket_id = 'fotos_alunos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='aluno_envia_propria_foto') then
    create policy aluno_envia_propria_foto on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'fotos_alunos'
        and (storage.foldername(name))[1] = auth.uid()::text
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
