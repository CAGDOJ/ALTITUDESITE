-- ================================================================
-- PORTAL ALTITUDE V30
-- Compatibilidade do importador LaTeX com bancos em que a tabela
-- public.modulos utiliza created_at em vez de criado_em.
-- Pode ser executado mais de uma vez.
-- ================================================================

begin;

alter table if exists public.modulos
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists criado_em timestamp with time zone not null default now();

-- Mantém os registros antigos com uma data válida para qualquer versão
-- do portal que ainda esteja em cache no navegador.
update public.modulos
set criado_em = coalesce(criado_em, created_at, now()),
    updated_at = coalesce(updated_at, created_at, criado_em, now())
where criado_em is null or updated_at is null;

commit;
