-- =============================================================================
-- ALTITUDE - ATUALIZAÇÃO 05 CORRIGIDA
-- Carteira de horas, solicitação parcial e emissão somente após liberação.
-- Esta versão é autossuficiente para os campos de certificados e pode ser
-- executada mesmo quando a atualização 04 não tiver sido aplicada.
-- =============================================================================

begin;

create extension if not exists pgcrypto;


-- ----------------------------------------------------------------------------
-- 0. PRÉ-REQUISITOS E REPARO DE INSTALAÇÕES PARCIAIS
-- ----------------------------------------------------------------------------
-- A versão anterior falhava quando os campos da atualização 04 não existiam.
-- Todos os campos usados abaixo são garantidos antes de qualquer consulta.

alter table public.cursos
  add column if not exists nota_minima numeric not null default 70;

alter table public.modulos
  add column if not exists carga_horaria integer;

create table if not exists public.gestores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gestor_id text not null unique,
  nome text not null,
  email text not null unique,
  telefone text,
  cargo text not null default 'GESTOR'
    check (cargo in ('COLABORADOR','PROFESSOR','COORDENADOR','GESTOR')),
  nivel_acesso integer not null default 4 check (nivel_acesso between 1 and 4),
  status text not null default 'ATIVO' check (status in ('ATIVO','INATIVO')),
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

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

grant execute on function public.e_gestor(integer) to anon, authenticated;

alter table public.certificados
  add column if not exists codigo_validacao uuid default gen_random_uuid(),
  add column if not exists numero_certificado text,
  add column if not exists nome_aluno text,
  add column if not exists nome_curso text,
  add column if not exists nota_final numeric default 0,
  add column if not exists valido_ate date,
  add column if not exists atualizado_em timestamp with time zone default now(),
  add column if not exists solicitado_em timestamp with time zone,
  add column if not exists liberado_em timestamp with time zone,
  add column if not exists liberado_por uuid references auth.users(id),
  add column if not exists observacao_gestor text,
  add column if not exists versao_pdf integer not null default 3,
  add column if not exists horas_solicitadas integer,
  add column if not exists periodo_inicio date,
  add column if not exists periodo_fim date,
  add column if not exists matricula_id bigint references public.matriculas(id),
  add column if not exists saldo_processado boolean not null default false,
  add column if not exists liberacao_excepcional boolean not null default false;

update public.certificados c
set codigo_validacao = coalesce(c.codigo_validacao, gen_random_uuid()),
    nome_aluno = coalesce(c.nome_aluno, a.nome),
    nome_curso = coalesce(c.nome_curso, cu.titulo),
    atualizado_em = coalesce(c.atualizado_em, c.emitido_em, c.criado_em::timestamp with time zone, now()),
    solicitado_em = coalesce(c.solicitado_em, c.criado_em::timestamp with time zone, now()),
    liberado_em = case
      when c.status = 'EMITIDO' then coalesce(c.liberado_em, c.emitido_em, c.atualizado_em, c.criado_em::timestamp with time zone)
      else c.liberado_em
    end,
    versao_pdf = coalesce(c.versao_pdf, 3)
from public.alunos a, public.cursos cu
where a.user_id = c.aluno_id
  and cu.id = c.curso_id;

update public.certificados
set numero_certificado = 'ALT-' || to_char(coalesce(emitido_em, criado_em::timestamp with time zone, now()), 'YYYY') || '-' ||
  upper(substr(replace(codigo_validacao::text, '-', ''), 1, 12))
where numero_certificado is null
  and codigo_validacao is not null
  and status = 'EMITIDO';

create unique index if not exists certificados_codigo_validacao_uidx
  on public.certificados(codigo_validacao);
create unique index if not exists certificados_numero_uidx
  on public.certificados(numero_certificado)
  where numero_certificado is not null;

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
     or old.observacao_gestor is distinct from new.observacao_gestor
     or old.horas_emitidas is distinct from new.horas_emitidas
     or old.horas_solicitadas is distinct from new.horas_solicitadas then
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

insert into public.certificados_historico
  (certificado_id, aluno_id, curso_id, acao, status_anterior, status_novo,
   observacao, realizado_por, criado_em)
select
  c.id, c.aluno_id, c.curso_id, 'IMPORTADO', null, c.status,
  coalesce(c.observacao_gestor, 'Registro existente antes da carteira de horas.'),
  c.liberado_por,
  coalesce(c.solicitado_em, c.criado_em::timestamp with time zone, now())
from public.certificados c
where not exists (
  select 1 from public.certificados_historico h where h.certificado_id = c.id
);

alter table public.certificados
  alter column codigo_validacao set default gen_random_uuid(),
  alter column versao_pdf set default 3;

-- ----------------------------------------------------------------------------
-- 1. CAMPOS DO CERTIFICADO
-- ----------------------------------------------------------------------------
alter table public.certificados
  add column if not exists horas_solicitadas integer,
  add column if not exists periodo_inicio date,
  add column if not exists periodo_fim date,
  add column if not exists matricula_id bigint references public.matriculas(id),
  add column if not exists saldo_processado boolean not null default false,
  add column if not exists liberacao_excepcional boolean not null default false;

update public.certificados c
set horas_solicitadas = greatest(
      0,
      coalesce(c.horas_solicitadas, nullif(c.horas_emitidas, 0), cr.carga_horaria, 0)
    ),
    saldo_processado = case when c.status = 'EMITIDO' then true else c.saldo_processado end,
    matricula_id = coalesce(
      c.matricula_id,
      (
        select m.id
        from public.matriculas m
        where m.aluno_id = c.aluno_id and m.curso_id = c.curso_id
        order by m.criada_em asc, m.id asc
        limit 1
      )
    )
from public.cursos cr
where cr.id = c.curso_id;

alter table public.certificados
  alter column horas_solicitadas set default 0,
  alter column horas_solicitadas set not null;

-- ----------------------------------------------------------------------------
-- 2. CARTEIRA DE HORAS POR ALUNO E CURSO
-- ----------------------------------------------------------------------------
create table if not exists public.carteiras_horas_curso (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  curso_id bigint not null references public.cursos(id) on delete cascade,
  horas_validadas integer not null default 0,
  horas_reservadas integer not null default 0,
  horas_utilizadas integer not null default 0,
  liberacao_excepcional boolean not null default false,
  justificativa_gestor text,
  validado_por uuid references auth.users(id),
  validado_em timestamp with time zone,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint carteiras_horas_valores_check check (
    horas_validadas >= 0
    and horas_reservadas >= 0
    and horas_utilizadas >= 0
    and horas_reservadas + horas_utilizadas <= horas_validadas
  ),
  constraint carteiras_horas_aluno_curso_unique unique (aluno_id, curso_id)
);

alter table public.carteiras_horas_curso
  drop constraint if exists carteiras_horas_multiplos_check;

create index if not exists carteiras_horas_aluno_idx
  on public.carteiras_horas_curso(aluno_id, atualizado_em desc);
create index if not exists carteiras_horas_curso_idx
  on public.carteiras_horas_curso(curso_id, atualizado_em desc);

create table if not exists public.movimentacoes_horas (
  id bigint generated always as identity primary key,
  carteira_id bigint not null references public.carteiras_horas_curso(id) on delete cascade,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  curso_id bigint not null references public.cursos(id) on delete cascade,
  certificado_id bigint references public.certificados(id) on delete set null,
  tipo text not null check (tipo in (
    'CREDITO_GESTOR','CREDITO_EXCEPCIONAL','AJUSTE_GESTOR',
    'RESERVA_SOLICITACAO','LIBERACAO_CERTIFICADO','ESTORNO_RESERVA',
    'CANCELAMENTO','IMPORTACAO'
  )),
  horas integer not null,
  saldo_validado integer not null,
  saldo_reservado integer not null,
  saldo_utilizado integer not null,
  observacao text,
  realizado_por uuid references auth.users(id),
  criado_em timestamp with time zone not null default now()
);

create index if not exists movimentacoes_horas_aluno_idx
  on public.movimentacoes_horas(aluno_id, criado_em desc);
create index if not exists movimentacoes_horas_carteira_idx
  on public.movimentacoes_horas(carteira_id, criado_em desc);


-- Solicitações antigas não recebem saldo automaticamente. Elas ficam bloqueadas
-- até o gestor validar horas e o aluno criar uma nova solicitação parcial.
update public.certificados
set status = 'BLOQUEADO',
    horas_solicitadas = 0,
    observacao_gestor = coalesce(
      nullif(observacao_gestor, ''),
      'Solicitação anterior à carteira de horas. A gestão deve validar o saldo e o aluno deve solicitar novamente.'
    ),
    atualizado_em = now()
where status in ('PENDENTE', 'BLOQUEADO')
  and coalesce(saldo_processado, false) = false;

-- Importa o consumo e as reservas já existentes sem conceder saldo livre indevido.
insert into public.carteiras_horas_curso (
  aluno_id, curso_id, horas_validadas, horas_reservadas, horas_utilizadas,
  liberacao_excepcional, justificativa_gestor, validado_em, atualizado_em
)
select
  c.aluno_id,
  c.curso_id,
  sum(case when c.status = 'EMITIDO' then greatest(0, coalesce(c.horas_emitidas, c.horas_solicitadas, 0)) else 0 end)::integer,
  0::integer,
  sum(case when c.status = 'EMITIDO' then greatest(0, coalesce(c.horas_emitidas, c.horas_solicitadas, 0)) else 0 end)::integer,
  bool_or(coalesce(c.liberacao_excepcional, false)),
  'Saldo inicial reconstruído a partir dos certificados existentes.',
  max(coalesce(c.liberado_em, c.emitido_em, c.atualizado_em, c.criado_em::timestamp with time zone)),
  now()
from public.certificados c
where c.status = 'EMITIDO'
group by c.aluno_id, c.curso_id
on conflict (aluno_id, curso_id) do nothing;

insert into public.movimentacoes_horas (
  carteira_id, aluno_id, curso_id, tipo, horas,
  saldo_validado, saldo_reservado, saldo_utilizado,
  observacao, realizado_por, criado_em
)
select
  ch.id, ch.aluno_id, ch.curso_id, 'IMPORTACAO', ch.horas_validadas,
  ch.horas_validadas, ch.horas_reservadas, ch.horas_utilizadas,
  'Importação da situação anterior à atualização 05.', ch.validado_por, now()
from public.carteiras_horas_curso ch
where not exists (
  select 1 from public.movimentacoes_horas mh where mh.carteira_id = ch.id
);

-- ----------------------------------------------------------------------------
-- 3. FUNÇÕES DE PERÍODO ACADÊMICO: 8 HORAS POR DIA ÚTIL
-- ----------------------------------------------------------------------------
create or replace function public.primeiro_dia_util(p_data date)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_data date := p_data;
begin
  while extract(isodow from v_data) in (6, 7) loop
    v_data := v_data + 1;
  end loop;
  return v_data;
end;
$$;

create or replace function public.data_util_por_indice(p_inicio date, p_indice integer)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_data date := public.primeiro_dia_util(p_inicio);
  v_indice integer := greatest(0, coalesce(p_indice, 0));
  v_contador integer := 0;
begin
  while v_contador < v_indice loop
    v_data := v_data + 1;
    if extract(isodow from v_data) not in (6, 7) then
      v_contador := v_contador + 1;
    end if;
  end loop;
  return v_data;
end;
$$;

create or replace function public.dias_uteis_inclusivos(p_inicio date, p_fim date)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_inicio is null or p_fim is null or p_fim < p_inicio then 0
    else count(*)::integer
  end
  from generate_series(p_inicio, p_fim, interval '1 day') d
  where extract(isodow from d) not in (6, 7);
$$;

create or replace function public.horas_automaticas_curso(p_aluno_id uuid, p_curso_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select least(
    coalesce(c.carga_horaria, 0),
    public.dias_uteis_inclusivos(m.criada_em::date, current_date) * 8
  )::integer
  from public.matriculas m
  join public.cursos c on c.id = m.curso_id
  where m.aluno_id = p_aluno_id
    and m.curso_id = p_curso_id
  order by m.criada_em asc, m.id asc
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 4. CONSULTAS SEGURAS DA CARTEIRA
-- ----------------------------------------------------------------------------
create or replace function public.obter_minhas_carteiras_horas()
returns table (
  carteira_id bigint,
  curso_id bigint,
  curso_titulo text,
  curso_categoria text,
  carga_curso integer,
  matricula_em timestamp with time zone,
  progresso numeric,
  aprovado boolean,
  nota numeric,
  horas_automaticas integer,
  horas_validadas integer,
  horas_reservadas integer,
  horas_utilizadas integer,
  saldo_disponivel integer,
  liberacao_excepcional boolean,
  justificativa_gestor text,
  atualizado_em timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ch.id,
    c.id,
    c.titulo,
    c.categoria,
    c.carga_horaria,
    m.criada_em,
    m.progresso,
    exists (
      select 1 from public.resultados_provas rp
      where rp.aluno_id = auth.uid() and rp.curso_id = c.id and rp.aprovado = true
    ),
    coalesce((
      select max(rp.nota) from public.resultados_provas rp
      where rp.aluno_id = auth.uid() and rp.curso_id = c.id and rp.aprovado = true
    ), 0),
    coalesce(public.horas_automaticas_curso(auth.uid(), c.id), 0),
    coalesce(ch.horas_validadas, 0),
    coalesce(ch.horas_reservadas, 0),
    coalesce(ch.horas_utilizadas, 0),
    greatest(0, coalesce(ch.horas_validadas, 0) - coalesce(ch.horas_reservadas, 0) - coalesce(ch.horas_utilizadas, 0)),
    coalesce(ch.liberacao_excepcional, false),
    ch.justificativa_gestor,
    ch.atualizado_em
  from public.matriculas m
  join public.cursos c on c.id = m.curso_id
  left join public.carteiras_horas_curso ch
    on ch.aluno_id = m.aluno_id and ch.curso_id = m.curso_id
  where m.aluno_id = auth.uid()
    and m.status in ('ATIVA','CONCLUIDA')
  order by m.criada_em desc;
$$;

create or replace function public.obter_carteiras_horas_gestao()
returns table (
  carteira_id bigint,
  aluno_id uuid,
  aluno_nome text,
  aluno_email text,
  aluno_ra text,
  curso_id bigint,
  curso_titulo text,
  carga_curso integer,
  matricula_em timestamp with time zone,
  progresso numeric,
  aprovado boolean,
  nota numeric,
  horas_automaticas integer,
  horas_validadas integer,
  horas_reservadas integer,
  horas_utilizadas integer,
  saldo_disponivel integer,
  liberacao_excepcional boolean,
  justificativa_gestor text,
  atualizado_em timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica';
  end if;

  return query
  select
    ch.id,
    a.user_id,
    a.nome,
    a.email,
    a.ra,
    c.id,
    c.titulo,
    c.carga_horaria,
    m.criada_em,
    m.progresso,
    exists (
      select 1 from public.resultados_provas rp
      where rp.aluno_id = a.user_id and rp.curso_id = c.id and rp.aprovado = true
    ),
    coalesce((
      select max(rp.nota) from public.resultados_provas rp
      where rp.aluno_id = a.user_id and rp.curso_id = c.id and rp.aprovado = true
    ), 0),
    coalesce(public.horas_automaticas_curso(a.user_id, c.id), 0),
    coalesce(ch.horas_validadas, 0),
    coalesce(ch.horas_reservadas, 0),
    coalesce(ch.horas_utilizadas, 0),
    greatest(0, coalesce(ch.horas_validadas, 0) - coalesce(ch.horas_reservadas, 0) - coalesce(ch.horas_utilizadas, 0)),
    coalesce(ch.liberacao_excepcional, false),
    ch.justificativa_gestor,
    ch.atualizado_em
  from public.matriculas m
  join public.alunos a on a.user_id = m.aluno_id
  join public.cursos c on c.id = m.curso_id
  left join public.carteiras_horas_curso ch
    on ch.aluno_id = m.aluno_id and ch.curso_id = m.curso_id
  where m.status in ('ATIVA','CONCLUIDA')
    and m.progresso >= 100
    and exists (
      select 1 from public.resultados_provas rp
      where rp.aluno_id = m.aluno_id and rp.curso_id = m.curso_id and rp.aprovado = true
    )
  order by a.nome, c.titulo;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. GESTOR DEFINE O TOTAL DE HORAS QUE O ALUNO PODE UTILIZAR
-- ----------------------------------------------------------------------------
create or replace function public.gestor_definir_horas_curso(
  p_aluno_id uuid,
  p_curso_id bigint,
  p_horas_validadas integer,
  p_excepcional boolean default false,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_curso public.cursos%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_auto integer;
  v_anterior integer;
  v_tipo text;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica';
  end if;
  if p_horas_validadas is null or p_horas_validadas < 0 or mod(p_horas_validadas, 5) <> 0 then
    raise exception 'As horas devem ser informadas de 5 em 5';
  end if;

  select * into v_curso from public.cursos where id = p_curso_id;
  if v_curso.id is null then raise exception 'Curso não encontrado'; end if;
  if p_horas_validadas > v_curso.carga_horaria then
    raise exception 'O total não pode ultrapassar a carga do curso (% horas)', v_curso.carga_horaria;
  end if;
  if not exists (
    select 1 from public.matriculas m
    where m.aluno_id = p_aluno_id and m.curso_id = p_curso_id
      and m.progresso >= 100 and m.status in ('ATIVA','CONCLUIDA')
  ) then
    raise exception 'O aluno ainda não concluiu o conteúdo do curso';
  end if;
  if not exists (
    select 1 from public.resultados_provas rp
    where rp.aluno_id = p_aluno_id and rp.curso_id = p_curso_id and rp.aprovado = true
  ) then
    raise exception 'O aluno ainda não foi aprovado na avaliação';
  end if;

  v_auto := coalesce(public.horas_automaticas_curso(p_aluno_id, p_curso_id), 0);
  if p_horas_validadas > v_auto and not coalesce(p_excepcional, false) then
    raise exception 'Pelo período da matrícula, o limite automático atual é % horas. Marque a liberação excepcional para ultrapassá-lo.', v_auto;
  end if;
  if p_horas_validadas > v_auto and length(trim(coalesce(p_justificativa, ''))) < 10 then
    raise exception 'Informe uma justificativa com pelo menos 10 caracteres para a liberação excepcional';
  end if;

  insert into public.carteiras_horas_curso (aluno_id, curso_id)
  values (p_aluno_id, p_curso_id)
  on conflict (aluno_id, curso_id) do nothing;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id = p_aluno_id and curso_id = p_curso_id
  for update;

  if p_horas_validadas < v_carteira.horas_reservadas + v_carteira.horas_utilizadas then
    raise exception 'Não é possível reduzir abaixo de % horas, pois já existem horas reservadas ou utilizadas',
      v_carteira.horas_reservadas + v_carteira.horas_utilizadas;
  end if;

  v_anterior := v_carteira.horas_validadas;
  v_tipo := case
    when p_horas_validadas > v_auto then 'CREDITO_EXCEPCIONAL'
    when v_anterior = 0 and p_horas_validadas > 0 then 'CREDITO_GESTOR'
    else 'AJUSTE_GESTOR'
  end;

  update public.carteiras_horas_curso
  set horas_validadas = p_horas_validadas,
      liberacao_excepcional = p_horas_validadas > v_auto,
      justificativa_gestor = nullif(trim(coalesce(p_justificativa, '')), ''),
      validado_por = v_uid,
      validado_em = now(),
      atualizado_em = now()
  where id = v_carteira.id
  returning * into v_carteira;

  insert into public.movimentacoes_horas (
    carteira_id, aluno_id, curso_id, tipo, horas,
    saldo_validado, saldo_reservado, saldo_utilizado,
    observacao, realizado_por
  ) values (
    v_carteira.id, p_aluno_id, p_curso_id, v_tipo,
    p_horas_validadas - v_anterior,
    v_carteira.horas_validadas, v_carteira.horas_reservadas, v_carteira.horas_utilizadas,
    coalesce(nullif(trim(coalesce(p_justificativa, '')), ''), 'Horas definidas pela gestão acadêmica.'),
    v_uid
  );

  return jsonb_build_object(
    'carteira_id', v_carteira.id,
    'horas_validadas', v_carteira.horas_validadas,
    'horas_reservadas', v_carteira.horas_reservadas,
    'horas_utilizadas', v_carteira.horas_utilizadas,
    'saldo_disponivel', v_carteira.horas_validadas - v_carteira.horas_reservadas - v_carteira.horas_utilizadas,
    'horas_automaticas', v_auto,
    'liberacao_excepcional', v_carteira.liberacao_excepcional
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. ALUNO ESCOLHE QUANTAS HORAS DO SALDO DESEJA SOLICITAR
-- ----------------------------------------------------------------------------
drop function if exists public.solicitar_certificado_curso(bigint, integer);
create or replace function public.solicitar_certificado_curso(
  p_curso_id bigint,
  p_horas integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_matricula public.matriculas%rowtype;
  v_resultado public.resultados_provas%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_cert public.certificados%rowtype;
  v_saldo integer;
begin
  if v_uid is null then raise exception 'Usuário não autenticado'; end if;
  if p_horas is null or p_horas < 5 or mod(p_horas, 5) <> 0 then
    raise exception 'Escolha uma quantidade de horas de 5 em 5';
  end if;

  select * into v_aluno from public.alunos where user_id = v_uid;
  if v_aluno.user_id is null then raise exception 'Aluno não encontrado'; end if;

  select * into v_curso from public.cursos where id = p_curso_id;
  if v_curso.id is null then raise exception 'Curso não encontrado'; end if;

  select * into v_matricula
  from public.matriculas
  where aluno_id = v_uid and curso_id = p_curso_id
    and progresso >= 100 and status in ('ATIVA','CONCLUIDA')
  order by criada_em asc, id asc
  limit 1;
  if v_matricula.id is null then raise exception 'Curso ainda não foi concluído'; end if;

  select * into v_resultado
  from public.resultados_provas
  where aluno_id = v_uid and curso_id = p_curso_id
    and aprovado = true and nota >= coalesce(v_curso.nota_minima, 70)
  order by nota desc, criado_em desc
  limit 1;
  if v_resultado.id is null then raise exception 'Aprovação na prova ainda não registrada'; end if;

  if exists (
    select 1 from public.certificados
    where aluno_id = v_uid and curso_id = p_curso_id and status = 'PENDENTE'
  ) then
    raise exception 'Já existe uma solicitação deste curso aguardando análise';
  end if;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id = v_uid and curso_id = p_curso_id
  for update;
  if v_carteira.id is null then raise exception 'A gestão ainda não liberou horas para este curso'; end if;

  v_saldo := v_carteira.horas_validadas - v_carteira.horas_reservadas - v_carteira.horas_utilizadas;
  if p_horas > v_saldo then
    raise exception 'Saldo insuficiente. Disponível: % horas', greatest(0, v_saldo);
  end if;

  insert into public.certificados (
    aluno_id, curso_id, matricula_id, status,
    horas_solicitadas, horas_emitidas, criado_em, solicitado_em,
    nome_aluno, nome_curso, nota_final, atualizado_em,
    versao_pdf, saldo_processado, liberacao_excepcional
  ) values (
    v_uid, p_curso_id, v_matricula.id, 'PENDENTE',
    p_horas, 0, now(), now(),
    v_aluno.nome, v_curso.titulo, v_resultado.nota, now(),
    3, false, false
  ) returning * into v_cert;

  update public.carteiras_horas_curso
  set horas_reservadas = horas_reservadas + p_horas,
      atualizado_em = now()
  where id = v_carteira.id
  returning * into v_carteira;

  insert into public.movimentacoes_horas (
    carteira_id, aluno_id, curso_id, certificado_id, tipo, horas,
    saldo_validado, saldo_reservado, saldo_utilizado,
    observacao, realizado_por
  ) values (
    v_carteira.id, v_uid, p_curso_id, v_cert.id, 'RESERVA_SOLICITACAO', -p_horas,
    v_carteira.horas_validadas, v_carteira.horas_reservadas, v_carteira.horas_utilizadas,
    format('Aluno solicitou certificado de %s horas.', p_horas), v_uid
  );

  return jsonb_build_object(
    'certificado_id', v_cert.id,
    'status', v_cert.status,
    'horas_solicitadas', p_horas,
    'saldo_disponivel', v_carteira.horas_validadas - v_carteira.horas_reservadas - v_carteira.horas_utilizadas
  );
end;
$$;

-- Compatibilidade: impede emissão sem escolha explícita das horas.
create or replace function public.solicitar_certificado_curso(p_curso_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Escolha a quantidade de horas antes de solicitar o certificado';
end;
$$;

create or replace function public.emitir_certificado_curso(p_curso_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'O PDF só é liberado após a solicitação de horas e a aprovação da gestão';
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. DECISÃO DO GESTOR: PDF SOMENTE APÓS LIBERAÇÃO
-- ----------------------------------------------------------------------------
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
  v_matricula public.matriculas%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_codigo uuid;
  v_numero text;
  v_horas integer;
  v_horas_anteriores integer;
  v_auto integer;
  v_inicio date;
  v_fim date;
  v_excepcional boolean;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica';
  end if;

  select * into v_cert from public.certificados where id = p_certificado_id for update;
  if v_cert.id is null then raise exception 'Certificado não encontrado'; end if;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id = v_cert.aluno_id and curso_id = v_cert.curso_id
  for update;
  if v_carteira.id is null then raise exception 'Carteira de horas não encontrada'; end if;

  v_horas := greatest(0, coalesce(v_cert.horas_solicitadas, 0));

  if v_acao = 'LIBERAR' then
    if v_cert.status = 'EMITIDO' then return to_jsonb(v_cert); end if;
    if v_cert.status <> 'PENDENTE' then raise exception 'Somente solicitações pendentes podem ser liberadas'; end if;
    if v_horas < 5 or mod(v_horas, 5) <> 0 then raise exception 'Quantidade de horas inválida'; end if;
    if v_carteira.horas_reservadas < v_horas then raise exception 'A reserva de horas desta solicitação não está disponível'; end if;

    select * into v_aluno from public.alunos where user_id = v_cert.aluno_id;
    select * into v_curso from public.cursos where id = v_cert.curso_id;
    select * into v_matricula
    from public.matriculas
    where id = v_cert.matricula_id
       or (aluno_id = v_cert.aluno_id and curso_id = v_cert.curso_id)
    order by case when id = v_cert.matricula_id then 0 else 1 end, criada_em asc
    limit 1;

    v_horas_anteriores := v_carteira.horas_utilizadas;
    v_auto := coalesce(public.horas_automaticas_curso(v_cert.aluno_id, v_cert.curso_id), 0);
    v_excepcional := (v_horas_anteriores + v_horas) > v_auto;

    v_inicio := public.data_util_por_indice(v_matricula.criada_em::date, floor(v_horas_anteriores / 8.0)::integer);
    v_fim := public.data_util_por_indice(v_matricula.criada_em::date, floor((v_horas_anteriores + v_horas - 1) / 8.0)::integer);

    if v_fim > current_date then
      if not coalesce(v_carteira.liberacao_excepcional, false) then
        raise exception 'O período acadêmico ainda não comporta estas horas. Limite automático: % horas', v_auto;
      end if;
      v_excepcional := true;
      v_fim := current_date;
      v_inicio := greatest(v_matricula.criada_em::date, least(v_inicio, current_date));
    end if;

    v_codigo := coalesce(v_cert.codigo_validacao, gen_random_uuid());
    v_numero := coalesce(
      nullif(v_cert.numero_certificado, ''),
      'ALT-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(v_codigo::text, '-', ''), 1, 12))
    );

    update public.carteiras_horas_curso
    set horas_reservadas = horas_reservadas - v_horas,
        horas_utilizadas = horas_utilizadas + v_horas,
        atualizado_em = now()
    where id = v_carteira.id
    returning * into v_carteira;

    update public.certificados
    set status = 'EMITIDO',
        horas_emitidas = v_horas,
        codigo_validacao = v_codigo,
        numero_certificado = v_numero,
        emitido_em = now(),
        liberado_em = now(),
        liberado_por = v_uid,
        observacao_gestor = nullif(trim(coalesce(p_observacao, '')), ''),
        periodo_inicio = v_inicio,
        periodo_fim = v_fim,
        liberacao_excepcional = v_excepcional,
        saldo_processado = true,
        nome_aluno = coalesce(v_aluno.nome, v_cert.nome_aluno),
        nome_curso = coalesce(v_curso.titulo, v_cert.nome_curso),
        atualizado_em = now(),
        versao_pdf = 3
    where id = v_cert.id
    returning * into v_cert;

    insert into public.movimentacoes_horas (
      carteira_id, aluno_id, curso_id, certificado_id, tipo, horas,
      saldo_validado, saldo_reservado, saldo_utilizado,
      observacao, realizado_por
    ) values (
      v_carteira.id, v_cert.aluno_id, v_cert.curso_id, v_cert.id,
      'LIBERACAO_CERTIFICADO', v_horas,
      v_carteira.horas_validadas, v_carteira.horas_reservadas, v_carteira.horas_utilizadas,
      coalesce(nullif(trim(coalesce(p_observacao, '')), ''), format('Certificado de %s horas liberado.', v_horas)),
      v_uid
    );

  elsif v_acao in ('BLOQUEAR','CANCELAR') then
    if v_cert.status = 'PENDENTE' and v_horas > 0 then
      update public.carteiras_horas_curso
      set horas_reservadas = greatest(0, horas_reservadas - v_horas),
          atualizado_em = now()
      where id = v_carteira.id
      returning * into v_carteira;

      insert into public.movimentacoes_horas (
        carteira_id, aluno_id, curso_id, certificado_id, tipo, horas,
        saldo_validado, saldo_reservado, saldo_utilizado,
        observacao, realizado_por
      ) values (
        v_carteira.id, v_cert.aluno_id, v_cert.curso_id, v_cert.id,
        case when v_acao = 'CANCELAR' then 'CANCELAMENTO' else 'ESTORNO_RESERVA' end,
        v_horas,
        v_carteira.horas_validadas, v_carteira.horas_reservadas, v_carteira.horas_utilizadas,
        coalesce(nullif(trim(coalesce(p_observacao, '')), ''), 'Reserva devolvida ao saldo do aluno.'),
        v_uid
      );
    end if;

    update public.certificados
    set status = case when v_acao = 'BLOQUEAR' then 'BLOQUEADO' else 'CANCELADO' end,
        observacao_gestor = nullif(trim(coalesce(p_observacao, '')), ''),
        atualizado_em = now()
    where id = v_cert.id
    returning * into v_cert;

  elsif v_acao = 'REABRIR' then
    if v_cert.horas_emitidas > 0 and v_cert.saldo_processado then
      update public.certificados
      set status = 'EMITIDO', observacao_gestor = nullif(trim(coalesce(p_observacao, '')), ''), atualizado_em = now()
      where id = v_cert.id
      returning * into v_cert;
    else
      if v_carteira.horas_validadas - v_carteira.horas_reservadas - v_carteira.horas_utilizadas < v_horas then
        raise exception 'Saldo insuficiente para reabrir a solicitação';
      end if;
      update public.carteiras_horas_curso
      set horas_reservadas = horas_reservadas + v_horas, atualizado_em = now()
      where id = v_carteira.id
      returning * into v_carteira;
      update public.certificados
      set status = 'PENDENTE', observacao_gestor = nullif(trim(coalesce(p_observacao, '')), ''), atualizado_em = now()
      where id = v_cert.id
      returning * into v_cert;
    end if;
  else
    raise exception 'Ação inválida';
  end if;

  return to_jsonb(v_cert);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. VALIDAÇÃO PÚBLICA COM PERÍODO E HORAS EFETIVAMENTE EMITIDAS
-- ----------------------------------------------------------------------------
create or replace function public.validar_certificado(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert public.certificados%rowtype;
  v_valido boolean;
begin
  select * into v_cert
  from public.certificados
  where lower(codigo_validacao::text) = lower(trim(p_codigo))
     or upper(numero_certificado) = upper(trim(p_codigo))
  order by id desc
  limit 1;

  if v_cert.id is null then
    return jsonb_build_object('encontrado', false, 'valido', false,
      'mensagem', 'Certificado não encontrado na base oficial do Instituto Altitude.');
  end if;

  v_valido := v_cert.status = 'EMITIDO'
    and v_cert.horas_emitidas > 0
    and (v_cert.valido_ate is null or v_cert.valido_ate >= current_date);

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
    'periodo_inicio', v_cert.periodo_inicio,
    'periodo_fim', v_cert.periodo_fim,
    'emitido_em', v_cert.emitido_em,
    'valido_ate', v_cert.valido_ate,
    'liberacao_excepcional', v_cert.liberacao_excepcional,
    'observacao', v_cert.observacao_gestor,
    'mensagem', case when v_valido then 'Certificado autêntico e válido.' else 'O registro existe, mas o certificado não está válido.' end
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. RLS E PERMISSÕES
-- ----------------------------------------------------------------------------

-- Certificados e histórico: aluno vê os próprios; gestão vê todos.
alter table public.certificados enable row level security;
alter table public.certificados_historico enable row level security;

drop policy if exists aluno_le_proprios_certificados on public.certificados;
create policy aluno_le_proprios_certificados on public.certificados
  for select to authenticated using (aluno_id = auth.uid());

drop policy if exists gestor_le_certificados on public.certificados;
create policy gestor_le_certificados on public.certificados
  for select to authenticated using (public.e_gestor(2));

drop policy if exists aluno_le_proprio_historico_certificados on public.certificados_historico;
create policy aluno_le_proprio_historico_certificados on public.certificados_historico
  for select to authenticated using (aluno_id = auth.uid());

drop policy if exists gestor_le_historico_certificados on public.certificados_historico;
create policy gestor_le_historico_certificados on public.certificados_historico
  for select to authenticated using (public.e_gestor(2));

grant select on public.certificados to authenticated;
grant select on public.certificados_historico to authenticated;
do $$
begin
  if to_regclass('public.certificados_historico_id_seq') is not null then
    execute 'grant usage, select on sequence public.certificados_historico_id_seq to authenticated';
  end if;
end $$;

alter table public.carteiras_horas_curso enable row level security;
alter table public.movimentacoes_horas enable row level security;

drop policy if exists aluno_le_propria_carteira_horas on public.carteiras_horas_curso;
create policy aluno_le_propria_carteira_horas on public.carteiras_horas_curso
  for select to authenticated using (aluno_id = auth.uid());

drop policy if exists gestor_gerencia_carteira_horas on public.carteiras_horas_curso;
create policy gestor_gerencia_carteira_horas on public.carteiras_horas_curso
  for all to authenticated using (public.e_gestor(2)) with check (public.e_gestor(2));

drop policy if exists aluno_le_movimentacoes_horas on public.movimentacoes_horas;
create policy aluno_le_movimentacoes_horas on public.movimentacoes_horas
  for select to authenticated using (aluno_id = auth.uid());

drop policy if exists gestor_le_movimentacoes_horas on public.movimentacoes_horas;
create policy gestor_le_movimentacoes_horas on public.movimentacoes_horas
  for select to authenticated using (public.e_gestor(2));

grant select on public.carteiras_horas_curso to authenticated;
grant select on public.movimentacoes_horas to authenticated;
do $$
begin
  if to_regclass('public.carteiras_horas_curso_id_seq') is not null then
    execute 'grant usage, select on sequence public.carteiras_horas_curso_id_seq to authenticated';
  end if;
  if to_regclass('public.movimentacoes_horas_id_seq') is not null then
    execute 'grant usage, select on sequence public.movimentacoes_horas_id_seq to authenticated';
  end if;
end $$;

revoke all on function public.obter_minhas_carteiras_horas() from public;
revoke all on function public.obter_carteiras_horas_gestao() from public;
revoke all on function public.gestor_definir_horas_curso(uuid,bigint,integer,boolean,text) from public;
revoke all on function public.solicitar_certificado_curso(bigint,integer) from public;
revoke all on function public.solicitar_certificado_curso(bigint) from public;
revoke all on function public.emitir_certificado_curso(bigint) from public;
revoke all on function public.gestor_decidir_certificado(bigint,text,text) from public;
revoke all on function public.validar_certificado(text) from public;

grant execute on function public.obter_minhas_carteiras_horas() to authenticated;
grant execute on function public.obter_carteiras_horas_gestao() to authenticated;
grant execute on function public.gestor_definir_horas_curso(uuid,bigint,integer,boolean,text) to authenticated;
grant execute on function public.solicitar_certificado_curso(bigint,integer) to authenticated;
grant execute on function public.solicitar_certificado_curso(bigint) to authenticated;
grant execute on function public.emitir_certificado_curso(bigint) to authenticated;
grant execute on function public.gestor_decidir_certificado(bigint,text,text) to authenticated;
grant execute on function public.validar_certificado(text) to anon, authenticated;

commit;

-- Conferência rápida
select 'Atualização 05 corrigida aplicada com sucesso' as resultado;
