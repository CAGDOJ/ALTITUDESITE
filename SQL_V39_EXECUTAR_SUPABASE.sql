-- ============================================================================
-- ALTITUDE V39 — RECOMPENSAS CONFIGURÁVEIS
-- Execute depois das migrations anteriores (V37/V38 não criaram nova tabela).
-- ============================================================================

begin;

create table if not exists public.recompensas_niveis_v39 (
  id bigint generated always as identity primary key,
  tipo_curso text not null,
  faixa text not null,
  nivel text not null,
  cursos_necessarios integer not null check (cursos_necessarios >= 1),
  nome text not null,
  imagem_url text null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_por uuid null,
  criado_em timestamptz not null default now(),
  atualizado_por uuid null,
  atualizado_em timestamptz not null default now(),
  constraint recompensas_niveis_v39_tipo_nivel_unique unique (tipo_curso, nivel)
);

create index if not exists recompensas_niveis_v39_tipo_idx
  on public.recompensas_niveis_v39(tipo_curso, ativo, cursos_necessarios);

alter table public.recompensas_niveis_v39 enable row level security;

drop policy if exists aluno_le_recompensas_v39 on public.recompensas_niveis_v39;
create policy aluno_le_recompensas_v39
on public.recompensas_niveis_v39
for select to authenticated
using (true);

drop policy if exists gestor_gerencia_recompensas_v39 on public.recompensas_niveis_v39;
create policy gestor_gerencia_recompensas_v39
on public.recompensas_niveis_v39
for all to authenticated
using (public.e_gestor(3))
with check (public.e_gestor(3));

grant select, insert, update, delete on public.recompensas_niveis_v39 to authenticated;
grant usage, select on sequence public.recompensas_niveis_v39_id_seq to authenticated;

-- Configuração inicial totalmente editável pela Gestão.
-- Os limiares 1–5 servem apenas como ponto de partida; podem ser alterados no portal.
insert into public.recompensas_niveis_v39
  (tipo_curso, faixa, nivel, cursos_necessarios, nome, ordem)
values
  ('PROFISSIONAL','Bronze','I',1,'Bronze I',101),
  ('PROFISSIONAL','Bronze','II',2,'Bronze II',102),
  ('PROFISSIONAL','Bronze','III',3,'Bronze III',103),
  ('PROFISSIONAL','Bronze','IV',4,'Bronze IV',104),
  ('PROFISSIONAL','Bronze','V',5,'Bronze V',105),
  ('TECNICO','Prata','I',1,'Prata I',201),
  ('TECNICO','Prata','II',2,'Prata II',202),
  ('TECNICO','Prata','III',3,'Prata III',203),
  ('TECNICO','Prata','IV',4,'Prata IV',204),
  ('TECNICO','Prata','V',5,'Prata V',205),
  ('SUPERIOR','Ouro','I',1,'Ouro I',301),
  ('SUPERIOR','Ouro','II',2,'Ouro II',302),
  ('SUPERIOR','Ouro','III',3,'Ouro III',303),
  ('SUPERIOR','Ouro','IV',4,'Ouro IV',304),
  ('SUPERIOR','Ouro','V',5,'Ouro V',305),
  ('POS_GRADUACAO','Diamante','I',1,'Diamante I',401),
  ('POS_GRADUACAO','Diamante','II',2,'Diamante II',402),
  ('POS_GRADUACAO','Diamante','III',3,'Diamante III',403),
  ('POS_GRADUACAO','Diamante','IV',4,'Diamante IV',404),
  ('POS_GRADUACAO','Diamante','V',5,'Diamante V',405)
on conflict (tipo_curso, nivel) do nothing;

commit;
