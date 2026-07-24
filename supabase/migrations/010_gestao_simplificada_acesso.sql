-- ============================================================
-- ALTITUDE — ATUALIZAÇÃO 10
-- Correção do acesso acadêmico do gestor e apoio à gestão simplificada
-- Idempotente: pode ser executada novamente sem duplicar registros.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- 1. Garante a estrutura mínima da tabela de gestores.
create table if not exists public.gestores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gestor_id text not null unique,
  nome text not null,
  email text not null unique,
  telefone text,
  cargo text not null default 'GESTOR',
  nivel_acesso integer not null default 4 check (nivel_acesso between 1 and 4),
  status text not null default 'ATIVO' check (status in ('ATIVO','INATIVO')),
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

-- 2. Resolve o usuário autenticado de forma segura, inclusive em chamadas RPC.
create or replace function public.usuario_autenticado_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_claims jsonb;
begin
  v_uid := auth.uid();
  if v_uid is not null then
    return v_uid;
  end if;

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if nullif(v_claims ->> 'sub', '') is not null then
      return (v_claims ->> 'sub')::uuid;
    end if;
  exception when others then
    null;
  end;

  begin
    return nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  exception when others then
    return null;
  end;
end;
$$;

-- 3. Função central de autorização. O fallback por e-mail corrige cadastros
-- antigos em que o e-mail estava correto, mas o user_id ficou desatualizado.
create or replace function public.e_gestor(p_nivel_minimo integer default 1)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_email text;
  v_nivel integer;
begin
  v_uid := public.usuario_autenticado_id();
  if v_uid is null then
    return false;
  end if;

  select lower(u.email)
    into v_email
  from auth.users u
  where u.id = v_uid;

  select g.nivel_acesso
    into v_nivel
  from public.gestores g
  where g.status = 'ATIVO'
    and (
      g.user_id = v_uid
      or (v_email is not null and lower(g.email) = v_email)
    )
  order by case when g.user_id = v_uid then 0 else 1 end
  limit 1;

  return coalesce(v_nivel, 0) >= greatest(1, least(4, coalesce(p_nivel_minimo, 1)));
end;
$$;

-- 4. Reassocia e ativa o gestor principal informado pelo projeto.
do $$
declare
  v_user_id uuid;
begin
  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = 'altitudesecretaria@gmail.com'
  order by u.created_at desc
  limit 1;

  if v_user_id is not null then
    delete from public.gestores
    where user_id <> v_user_id
      and (
        gestor_id = 'GST-2026-0001'
        or lower(email) = 'altitudesecretaria@gmail.com'
      );

    insert into public.gestores (
      user_id, gestor_id, nome, email, cargo,
      nivel_acesso, status, criado_em, atualizado_em
    ) values (
      v_user_id,
      'GST-2026-0001',
      'SECRETARIA ALTITUDE',
      'altitudesecretaria@gmail.com',
      'GESTOR',
      4,
      'ATIVO',
      now(),
      now()
    )
    on conflict (user_id) do update set
      gestor_id = excluded.gestor_id,
      nome = excluded.nome,
      email = excluded.email,
      cargo = excluded.cargo,
      nivel_acesso = 4,
      status = 'ATIVO',
      atualizado_em = now();
  end if;
end
$$;

-- 5. Perfil do gestor autenticado usando a mesma resolução robusta.
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
set search_path = public, auth
as $$
  with atual as (
    select public.usuario_autenticado_id() as uid
  ), dados as (
    select u.id as uid, lower(u.email) as email
    from auth.users u, atual a
    where u.id = a.uid
  )
  select
    g.user_id,
    g.gestor_id,
    g.nome,
    g.email,
    g.telefone,
    g.cargo,
    g.nivel_acesso,
    g.status
  from public.gestores g
  cross join dados d
  where g.status = 'ATIVO'
    and (g.user_id = d.uid or lower(g.email) = d.email)
  order by case when g.user_id = d.uid then 0 else 1 end
  limit 1;
$$;

-- 6. Diagnóstico rápido para conferir o acesso pelo SQL/API.
create or replace function public.diagnosticar_acesso_gestor()
returns table (
  auth_user_id uuid,
  auth_email text,
  gestor_id text,
  nivel_acesso integer,
  status text,
  acesso_academico boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with atual as (
    select public.usuario_autenticado_id() as uid
  )
  select
    a.uid,
    u.email,
    g.gestor_id,
    g.nivel_acesso,
    g.status,
    public.e_gestor(2)
  from atual a
  left join auth.users u on u.id = a.uid
  left join public.gestores g
    on g.user_id = a.uid or lower(g.email) = lower(u.email)
  limit 1;
$$;

-- 7. Permissões das funções.
revoke all on function public.usuario_autenticado_id() from public;
revoke all on function public.e_gestor(integer) from public;
revoke all on function public.obter_meu_perfil_gestor() from public;
revoke all on function public.diagnosticar_acesso_gestor() from public;

grant execute on function public.usuario_autenticado_id() to authenticated;
grant execute on function public.e_gestor(integer) to anon, authenticated;
grant execute on function public.obter_meu_perfil_gestor() to authenticated;
grant execute on function public.diagnosticar_acesso_gestor() to authenticated;

-- 8. Reforça leitura e administração acadêmica para gestores nível 2+.
alter table public.gestores enable row level security;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'alunos', 'cursos', 'modulos', 'materiais', 'provas', 'questoes',
    'matriculas', 'resultados_provas', 'respostas_prova', 'certificados',
    'progresso_modulos', 'carteira_horas_aluno', 'movimentacoes_horas',
    'certificados_historico'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('drop policy if exists gestor_academico_total_atualizacao10 on public.%I', v_table);
      execute format(
        'create policy gestor_academico_total_atualizacao10 on public.%I for all to authenticated using (public.e_gestor(2)) with check (public.e_gestor(2))',
        v_table
      );
      execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    end if;
  end loop;
end
$$;

-- 9. Mantém as funções acadêmicas acessíveis ao perfil autenticado.
do $$
begin
  if to_regprocedure('public.obter_carteiras_horas_gestao()') is not null then
    execute 'grant execute on function public.obter_carteiras_horas_gestao() to authenticated';
  end if;
  if to_regprocedure('public.gestor_definir_horas_curso(uuid,bigint,integer,boolean,text)') is not null then
    execute 'grant execute on function public.gestor_definir_horas_curso(uuid,bigint,integer,boolean,text) to authenticated';
  end if;
  if to_regprocedure('public.gestor_decidir_certificado(bigint,text,text)') is not null then
    execute 'grant execute on function public.gestor_decidir_certificado(bigint,text,text) to authenticated';
  end if;
  if to_regprocedure('public.gestor_liberar_certificado_direto(bigint,text)') is not null then
    execute 'grant execute on function public.gestor_liberar_certificado_direto(bigint,text) to authenticated';
  end if;
end
$$;

commit;

select
  'Atualização 10 aplicada com sucesso' as resultado,
  g.gestor_id,
  g.email,
  g.nivel_acesso,
  g.status
from public.gestores g
where lower(g.email) = 'altitudesecretaria@gmail.com';
