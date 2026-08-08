-- ============================================================================
-- ALTITUDE V37 — CONTAS, RECUPERACAO DE E-MAIL E EXCLUSAO AUDITADA DE ALUNO
-- Execute uma vez no Supabase SQL Editor, DEPOIS da V36.
-- Data: 2026-08-08
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. Tentativas de correcao/reenviar confirmacao de e-mail.
--    Usada pela Edge Function corrigir-email-cadastro para limitar abuso.
-- --------------------------------------------------------------------------
create table if not exists public.solicitacoes_correcao_email_v37 (
  id bigint generated always as identity primary key,
  cpf text not null,
  acao text not null,
  sucesso boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists solicitacoes_correcao_email_v37_cpf_data_idx
  on public.solicitacoes_correcao_email_v37(cpf, criado_em desc);

alter table public.solicitacoes_correcao_email_v37 enable row level security;

drop policy if exists gestor_le_solicitacoes_correcao_email_v37 on public.solicitacoes_correcao_email_v37;
create policy gestor_le_solicitacoes_correcao_email_v37
on public.solicitacoes_correcao_email_v37
for select to authenticated
using (public.e_gestor(4));

grant select on public.solicitacoes_correcao_email_v37 to authenticated;

-- --------------------------------------------------------------------------
-- 2. Auditoria das correcoes de e-mail de contas ainda nao confirmadas.
-- --------------------------------------------------------------------------
create table if not exists public.auditoria_correcao_email_v37 (
  id bigint generated always as identity primary key,
  aluno_id uuid,
  email_anterior text,
  email_novo text,
  acao text not null,
  criado_em timestamptz not null default now()
);

create index if not exists auditoria_correcao_email_v37_aluno_idx
  on public.auditoria_correcao_email_v37(aluno_id, criado_em desc);

alter table public.auditoria_correcao_email_v37 enable row level security;

drop policy if exists gestor_le_auditoria_correcao_email_v37 on public.auditoria_correcao_email_v37;
create policy gestor_le_auditoria_correcao_email_v37
on public.auditoria_correcao_email_v37
for select to authenticated
using (public.e_gestor(4));

grant select on public.auditoria_correcao_email_v37 to authenticated;

-- --------------------------------------------------------------------------
-- 3. Arquivo minimo antes da exclusao definitiva de um aluno.
--    Nao guarda senha. Preserva quem excluiu, motivo e um resumo de vinculos.
-- --------------------------------------------------------------------------
create table if not exists public.alunos_exclusoes_v37 (
  id bigint generated always as identity primary key,
  aluno_id_original uuid not null,
  nome text,
  email text,
  cpf text,
  ra text,
  motivo text not null,
  dados_aluno jsonb not null default '{}'::jsonb,
  vinculos_resumo jsonb not null default '{}'::jsonb,
  excluido_por uuid,
  excluido_em timestamptz not null default now()
);

create index if not exists alunos_exclusoes_v37_aluno_idx
  on public.alunos_exclusoes_v37(aluno_id_original, excluido_em desc);
create index if not exists alunos_exclusoes_v37_cpf_idx
  on public.alunos_exclusoes_v37(cpf, excluido_em desc);

alter table public.alunos_exclusoes_v37 enable row level security;

drop policy if exists gestor_le_alunos_exclusoes_v37 on public.alunos_exclusoes_v37;
create policy gestor_le_alunos_exclusoes_v37
on public.alunos_exclusoes_v37
for select to authenticated
using (public.e_gestor(4));

grant select on public.alunos_exclusoes_v37 to authenticated;

commit;

-- ============================================================================
-- IMPORTANTE APOS O SQL
-- ============================================================================
-- Alem deste SQL, publique as Edge Functions da pasta supabase/functions:
--   1) corrigir-email-cadastro
--   2) gerenciar-gestor  (versao V37, usada pelo botao Excluir aluno)
--
-- Configure SITE_URL=https://www.portalaltitude.com.br nas secrets da funcao
-- corrigir-email-cadastro, se ainda nao existir.
-- ============================================================================
