-- =============================================================================
-- ALTITUDE V34
-- Carteira global por aluno, cobrança por certificado, WhatsApp, pagamentos,
-- cupons, packs por quantidade, promoções/pop-ups e tipos de curso públicos.
-- Execute após a migration 017.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- V34 não usa carga fixa no curso ou no módulo. Mantemos as colunas legadas
-- somente por compatibilidade com versões anteriores, aceitando zero sem teto.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conrelid::regclass as tabela, conname
    from pg_constraint
    where contype='c'
      and conrelid in ('public.cursos'::regclass,'public.modulos'::regclass)
      and pg_get_constraintdef(oid) ilike '%carga_horaria%'
  loop
    execute format('alter table %s drop constraint %I',v_constraint.tabela,v_constraint.conname);
  end loop;

  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='cursos' and column_name='carga_horaria') then
    execute 'alter table public.cursos alter column carga_horaria set default 0';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='modulos' and column_name='carga_horaria') then
    execute 'alter table public.modulos alter column carga_horaria set default 0';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- CONFIGURAÇÕES COMERCIAIS
-- -----------------------------------------------------------------------------
create table if not exists public.configuracoes_comerciais_v34 (
  id integer primary key default 1 check (id = 1),
  valor_certificado numeric(12,2) not null default 39.90 check (valor_certificado >= 0),
  whatsapp text not null default '5591983640933',
  cobranca_ativa boolean not null default true,
  mensagem_whatsapp text not null default 'Olá! Desejo realizar o pagamento do certificado solicitado.',
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);
insert into public.configuracoes_comerciais_v34(id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- TIPOS DE CURSO NO CATÁLOGO
-- -----------------------------------------------------------------------------
create table if not exists public.tipos_curso_catalogo_v34 (
  codigo text primary key,
  nome text not null,
  descricao text,
  visivel_site boolean not null default true,
  permitir_inscricao boolean not null default true,
  ordem integer not null default 0,
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);
insert into public.tipos_curso_catalogo_v34(codigo,nome,descricao,visivel_site,permitir_inscricao,ordem)
values
 ('PROFISSIONAL','Cursos Profissionais','Qualificações profissionais de curta e média duração.',true,true,1),
 ('TECNICO','Cursos Técnicos','Formações técnicas de maior duração.',false,false,2)
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- PROMOÇÕES E POP-UPS
-- -----------------------------------------------------------------------------
create table if not exists public.promocoes_v34 (
  id bigint generated always as identity primary key,
  titulo text not null,
  descricao text,
  imagem_url text,
  slug text not null unique,
  texto_botao text not null default 'Ver promoção',
  link_destino text,
  publico text not null default 'TODOS' check (publico in ('TODOS','MATRICULADOS','APROVADOS','SEM_CERTIFICADO')),
  frequencia text not null default 'UMA_VEZ' check (frequencia in ('UMA_VEZ','DIARIA','CADA_ACESSO')),
  prioridade integer not null default 0,
  inicio_em timestamptz,
  fim_em timestamptz,
  ativa boolean not null default true,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists promocoes_v34_ativas_idx on public.promocoes_v34(ativa, prioridade desc, criado_em desc);

create table if not exists public.promocoes_alunos_v34 (
  promocao_id bigint not null references public.promocoes_v34(id) on delete cascade,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  visualizado_em timestamptz,
  fechado_em timestamptz,
  salvo boolean not null default false,
  salvo_em timestamptz,
  ultima_exibicao_em timestamptz,
  primary key (promocao_id, aluno_id)
);

-- -----------------------------------------------------------------------------
-- PACKS: QUANTIDADE DE CERTIFICADOS, SEM CURSOS FIXOS
-- -----------------------------------------------------------------------------
create table if not exists public.packs_v34 (
  id bigint generated always as identity primary key,
  nome text not null,
  descricao text,
  quantidade_certificados integer not null check (quantidade_certificados > 0),
  valor numeric(12,2) not null check (valor >= 0),
  imagem_url text,
  ativo boolean not null default true,
  inicio_em timestamptz,
  fim_em timestamptz,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.packs_alunos_v34 (
  id bigint generated always as identity primary key,
  pack_id bigint not null references public.packs_v34(id),
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  quantidade_adquirida integer not null check (quantidade_adquirida > 0),
  quantidade_utilizada integer not null default 0 check (quantidade_utilizada >= 0),
  valor_pago numeric(12,2) not null default 0,
  status_pagamento text not null default 'PENDENTE' check (status_pagamento in ('PENDENTE','PAGO','CANCELADO')),
  pago_em timestamptz,
  pago_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  constraint packs_alunos_v34_saldo_check check (quantidade_utilizada <= quantidade_adquirida)
);
create index if not exists packs_alunos_v34_aluno_idx on public.packs_alunos_v34(aluno_id, status_pagamento, criado_em desc);


alter table public.packs_alunos_v34
  add column if not exists valor_base numeric(12,2) not null default 0,
  add column if not exists desconto numeric(12,2) not null default 0,
  add column if not exists valor_final numeric(12,2) not null default 0,
  add column if not exists cupom_codigo text,
  add column if not exists protocolo_pagamento text,
  add column if not exists whatsapp_aberto_em timestamptz,
  add column if not exists pagamento_informado_em timestamptz;

-- -----------------------------------------------------------------------------
-- CUPONS
-- -----------------------------------------------------------------------------
create table if not exists public.cupons_v34 (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  aplicacao text not null default 'CERTIFICADO' check (aplicacao in ('CERTIFICADO','PACK','AMBOS')),
  tipo text not null check (tipo in ('PERCENTUAL','FIXO','GRATUITO')),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  inicio_em timestamptz,
  fim_em timestamptz,
  limite_usos integer,
  limite_por_aluno integer not null default 1 check (limite_por_aluno > 0),
  usos_confirmados integer not null default 0 check (usos_confirmados >= 0),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cupons_v34_codigo_idx on public.cupons_v34(upper(codigo));
create unique index if not exists cupons_v34_codigo_upper_uidx on public.cupons_v34(upper(codigo));


alter table public.packs_alunos_v34
  add column if not exists cupom_id bigint references public.cupons_v34(id);

create table if not exists public.cupons_usos_v34 (
  id bigint generated always as identity primary key,
  cupom_id bigint not null references public.cupons_v34(id),
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  certificado_id bigint references public.certificados(id) on delete set null,
  pack_aluno_id bigint references public.packs_alunos_v34(id) on delete set null,
  valor_desconto numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists cupons_usos_v34_aluno_idx on public.cupons_usos_v34(cupom_id, aluno_id);

-- -----------------------------------------------------------------------------
-- CARTEIRA GLOBAL DO ALUNO
-- -----------------------------------------------------------------------------
create table if not exists public.carteiras_horas_aluno_v34 (
  aluno_id uuid primary key references public.alunos(user_id) on delete cascade,
  horas_adicionais integer not null default 0 check (horas_adicionais >= 0 and mod(horas_adicionais,5)=0),
  horas_reservadas integer not null default 0 check (horas_reservadas >= 0 and mod(horas_reservadas,5)=0),
  horas_utilizadas integer not null default 0 check (horas_utilizadas >= 0 and mod(horas_utilizadas,5)=0),
  justificativa_gestor text,
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);
insert into public.carteiras_horas_aluno_v34(aluno_id)
select user_id from public.alunos on conflict (aluno_id) do nothing;

create table if not exists public.movimentacoes_horas_aluno_v34 (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  certificado_id bigint references public.certificados(id) on delete set null,
  tipo text not null,
  horas integer not null,
  saldo_automatico integer not null,
  saldo_adicional integer not null,
  saldo_reservado integer not null,
  saldo_utilizado integer not null,
  observacao text,
  realizado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create or replace function public.horas_automaticas_aluno_v34(p_aluno_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, (current_date - a.criado_em::date + 1) * 8)::integer
  from public.alunos a where a.user_id = p_aluno_id;
$$;

-- -----------------------------------------------------------------------------
-- CAMPOS COMERCIAIS DO CERTIFICADO
-- -----------------------------------------------------------------------------
alter table public.certificados
  add column if not exists pagamento_status text not null default 'AGUARDANDO_PAGAMENTO',
  add column if not exists valor_base numeric(12,2) not null default 0,
  add column if not exists desconto numeric(12,2) not null default 0,
  add column if not exists valor_final numeric(12,2) not null default 0,
  add column if not exists cupom_id bigint references public.cupons_v34(id),
  add column if not exists cupom_codigo text,
  add column if not exists pack_aluno_id bigint references public.packs_alunos_v34(id),
  add column if not exists protocolo_pagamento text,
  add column if not exists whatsapp_aberto_em timestamptz,
  add column if not exists pagamento_informado_em timestamptz,
  add column if not exists pagamento_confirmado_em timestamptz,
  add column if not exists pagamento_confirmado_por uuid references auth.users(id),
  add column if not exists pagamento_observacao text;

update public.certificados
set pagamento_status = case when status = 'EMITIDO' then 'PAGO' else coalesce(pagamento_status,'AGUARDANDO_PAGAMENTO') end,
    protocolo_pagamento = coalesce(protocolo_pagamento, 'ALT-PAG-' || to_char(coalesce(solicitado_em, criado_em::timestamptz, now()),'YYYY') || '-' || lpad(id::text,6,'0'));

-- -----------------------------------------------------------------------------
-- CUPOM: CÁLCULO E VALIDAÇÃO
-- -----------------------------------------------------------------------------
create or replace function public.validar_cupom_v34(
  p_codigo text,
  p_aluno_id uuid,
  p_aplicacao text,
  p_valor_base numeric
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.cupons_v34%rowtype;
  v_usos integer;
  v_desconto numeric(12,2) := 0;
  v_final numeric(12,2) := greatest(0,coalesce(p_valor_base,0));
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if p_aluno_id<>auth.uid() and not public.e_gestor(2) then raise exception 'Acesso negado'; end if;
  if nullif(trim(coalesce(p_codigo,'')),'') is null then
    return jsonb_build_object('valido',false,'mensagem','Informe um cupom.');
  end if;
  select * into v from public.cupons_v34 where upper(codigo)=upper(trim(p_codigo)) limit 1;
  if v.id is null then return jsonb_build_object('valido',false,'mensagem','Cupom não encontrado.'); end if;
  if not v.ativo then return jsonb_build_object('valido',false,'mensagem','Cupom inativo.'); end if;
  if v.inicio_em is not null and now() < v.inicio_em then return jsonb_build_object('valido',false,'mensagem','Cupom ainda não está disponível.'); end if;
  if v.fim_em is not null and now() > v.fim_em then return jsonb_build_object('valido',false,'mensagem','Cupom expirado.'); end if;
  if v.aplicacao not in ('AMBOS',upper(coalesce(p_aplicacao,'CERTIFICADO'))) then return jsonb_build_object('valido',false,'mensagem','Cupom não aplicável a esta compra.'); end if;
  if v.limite_usos is not null and v.usos_confirmados >= v.limite_usos then return jsonb_build_object('valido',false,'mensagem','Limite de usos atingido.'); end if;
  select count(*)::integer into v_usos from public.cupons_usos_v34 where cupom_id=v.id and aluno_id=p_aluno_id;
  if v_usos >= v.limite_por_aluno then return jsonb_build_object('valido',false,'mensagem','Você já utilizou este cupom.'); end if;
  v_desconto := case v.tipo
    when 'GRATUITO' then v_final
    when 'PERCENTUAL' then round(v_final * least(100,v.valor) / 100,2)
    else least(v_final,v.valor)
  end;
  v_final := greatest(0,v_final-v_desconto);
  return jsonb_build_object('valido',true,'cupom_id',v.id,'codigo',v.codigo,'tipo',v.tipo,'desconto',v_desconto,'valor_final',v_final,'mensagem','Cupom aplicado.');
end;
$$;

-- -----------------------------------------------------------------------------
-- CONSULTAS DA CARTEIRA GLOBAL
-- -----------------------------------------------------------------------------
create or replace function public.obter_minha_carteira_horas_v34()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.carteiras_horas_aluno_v34%rowtype;
  v_auto integer;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  insert into public.carteiras_horas_aluno_v34(aluno_id) values(auth.uid()) on conflict(aluno_id) do nothing;
  select * into v from public.carteiras_horas_aluno_v34 where aluno_id=auth.uid();
  v_auto := coalesce(public.horas_automaticas_aluno_v34(auth.uid()),0);
  return jsonb_build_object(
    'aluno_id',v.aluno_id,'horas_automaticas',v_auto,'horas_adicionais',v.horas_adicionais,
    'horas_validadas',v_auto+v.horas_adicionais,'horas_reservadas',v.horas_reservadas,
    'horas_utilizadas',v.horas_utilizadas,'saldo_disponivel',greatest(0,v_auto+v.horas_adicionais-v.horas_reservadas-v.horas_utilizadas),
    'atualizado_em',v.atualizado_em
  );
end;
$$;

create or replace function public.obter_carteiras_horas_gestao_v34()
returns table(
  aluno_id uuid, aluno_nome text, aluno_email text, aluno_ra text, aluno_cpf text,
  cadastrado_em timestamptz, horas_automaticas integer, horas_adicionais integer,
  horas_validadas integer, horas_reservadas integer, horas_utilizadas integer,
  saldo_disponivel integer, justificativa_gestor text, atualizado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_gestor(2) then raise exception 'Acesso restrito à gestão acadêmica'; end if;
  return query
  select a.user_id,a.nome,a.email,a.ra,a.cpf,a.criado_em,
    coalesce(public.horas_automaticas_aluno_v34(a.user_id),0),coalesce(c.horas_adicionais,0),
    coalesce(public.horas_automaticas_aluno_v34(a.user_id),0)+coalesce(c.horas_adicionais,0),
    coalesce(c.horas_reservadas,0),coalesce(c.horas_utilizadas,0),
    greatest(0,coalesce(public.horas_automaticas_aluno_v34(a.user_id),0)+coalesce(c.horas_adicionais,0)-coalesce(c.horas_reservadas,0)-coalesce(c.horas_utilizadas,0)),
    c.justificativa_gestor,c.atualizado_em
  from public.alunos a left join public.carteiras_horas_aluno_v34 c on c.aluno_id=a.user_id
  order by a.nome;
end;
$$;

create or replace function public.gestor_definir_horas_aluno_v34(p_aluno_id uuid,p_horas_adicionais integer,p_justificativa text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid:=auth.uid(); v public.carteiras_horas_aluno_v34%rowtype; v_auto integer; v_anterior integer:=0; v_delta integer:=0;
begin
  if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito à gestão acadêmica'; end if;
  if p_horas_adicionais<0 or mod(p_horas_adicionais,5)<>0 then raise exception 'Informe horas adicionais de 5 em 5'; end if;
  insert into public.carteiras_horas_aluno_v34(aluno_id) values(p_aluno_id) on conflict(aluno_id) do nothing;
  select horas_adicionais into v_anterior from public.carteiras_horas_aluno_v34 where aluno_id=p_aluno_id for update;
  v_delta:=p_horas_adicionais-coalesce(v_anterior,0);
  update public.carteiras_horas_aluno_v34 set horas_adicionais=p_horas_adicionais,justificativa_gestor=nullif(trim(coalesce(p_justificativa,'')),''),atualizado_por=v_uid,atualizado_em=now() where aluno_id=p_aluno_id returning * into v;
  v_auto:=coalesce(public.horas_automaticas_aluno_v34(p_aluno_id),0);
  insert into public.movimentacoes_horas_aluno_v34(aluno_id,tipo,horas,saldo_automatico,saldo_adicional,saldo_reservado,saldo_utilizado,observacao,realizado_por)
  values(p_aluno_id,'AJUSTE_GESTOR',v_delta,v_auto,v.horas_adicionais,v.horas_reservadas,v.horas_utilizadas,coalesce(nullif(trim(coalesce(p_justificativa,'')),''),'Ajuste realizado pela gestão.'),v_uid);
  return jsonb_build_object('horas_automaticas',v_auto,'horas_adicionais',v.horas_adicionais,'horas_validadas',v_auto+v.horas_adicionais,'horas_reservadas',v.horas_reservadas,'horas_utilizadas',v.horas_utilizadas,'saldo_disponivel',greatest(0,v_auto+v.horas_adicionais-v.horas_reservadas-v.horas_utilizadas));
end;
$$;

-- -----------------------------------------------------------------------------
-- SOLICITAÇÃO COM COBRANÇA POR CERTIFICADO E CUPOM
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_certificado_curso_v34(p_curso_id bigint,p_horas integer,p_cupom text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid:=auth.uid(); v_aluno public.alunos%rowtype; v_curso public.cursos%rowtype; v_mat public.matriculas%rowtype; v_res public.resultados_provas%rowtype;
  v_wallet public.carteiras_horas_aluno_v34%rowtype; v_auto integer; v_saldo integer; v_cert public.certificados%rowtype;
  v_cfg public.configuracoes_comerciais_v34%rowtype; v_valor numeric(12,2); v_final numeric(12,2); v_desconto numeric(12,2):=0; v_coupon jsonb; v_coupon_id bigint; v_pack public.packs_alunos_v34%rowtype;
begin
  if v_uid is null then raise exception 'Usuário não autenticado'; end if;
  if p_horas<5 or mod(p_horas,5)<>0 then raise exception 'Escolha uma quantidade de horas de 5 em 5'; end if;
  select * into v_aluno from public.alunos where user_id=v_uid;
  select * into v_curso from public.cursos where id=p_curso_id;
  if v_curso.id is null then raise exception 'Curso não encontrado'; end if;
  select * into v_mat from public.matriculas where aluno_id=v_uid and curso_id=p_curso_id and progresso>=100 and status in('ATIVA','CONCLUIDA') order by criada_em limit 1;
  if v_mat.id is null then raise exception 'Curso ainda não foi concluído'; end if;
  select * into v_res from public.resultados_provas where aluno_id=v_uid and curso_id=p_curso_id and aprovado=true and nota>=coalesce(v_curso.nota_minima,70) order by nota desc,criado_em desc limit 1;
  if v_res.id is null then raise exception 'Aprovação na prova ainda não registrada'; end if;
  if exists(select 1 from public.certificados where aluno_id=v_uid and curso_id=p_curso_id and status in('PENDENTE','AGUARDANDO_HORAS')) then raise exception 'Já existe uma solicitação deste curso aguardando decisão'; end if;
  insert into public.carteiras_horas_aluno_v34(aluno_id) values(v_uid) on conflict(aluno_id) do nothing;
  select * into v_wallet from public.carteiras_horas_aluno_v34 where aluno_id=v_uid for update;
  v_auto:=coalesce(public.horas_automaticas_aluno_v34(v_uid),0);
  v_saldo:=v_auto+v_wallet.horas_adicionais-v_wallet.horas_reservadas-v_wallet.horas_utilizadas;
  if p_horas>v_saldo then raise exception 'Saldo insuficiente. Disponível: % horas',greatest(0,v_saldo); end if;
  select * into v_cfg from public.configuracoes_comerciais_v34 where id=1;
  v_valor:=case when coalesce(v_cfg.cobranca_ativa,true) then coalesce(v_cfg.valor_certificado,0) else 0 end;
  v_final:=v_valor;
  select pa.* into v_pack
  from public.packs_alunos_v34 pa
  where pa.aluno_id=v_uid
    and pa.status_pagamento='PAGO'
    and pa.quantidade_utilizada + (
      select count(*)::integer
      from public.certificados c
      where c.pack_aluno_id=pa.id and c.status in ('PENDENTE','AGUARDANDO_HORAS')
    ) < pa.quantidade_adquirida
  order by pa.criado_em
  limit 1
  for update;
  if v_pack.id is not null then v_final:=0; end if;
  if v_pack.id is null and nullif(trim(coalesce(p_cupom,'')),'') is not null then
    v_coupon:=public.validar_cupom_v34(p_cupom,v_uid,'CERTIFICADO',v_valor);
    if not coalesce((v_coupon->>'valido')::boolean,false) then raise exception '%',v_coupon->>'mensagem'; end if;
    v_coupon_id:=(v_coupon->>'cupom_id')::bigint; v_desconto:=(v_coupon->>'desconto')::numeric; v_final:=(v_coupon->>'valor_final')::numeric;
  end if;
  insert into public.certificados(aluno_id,curso_id,matricula_id,status,horas_solicitadas,horas_emitidas,criado_em,solicitado_em,nome_aluno,nome_curso,nota_final,atualizado_em,versao_pdf,saldo_processado,liberacao_excepcional,pagamento_status,valor_base,desconto,valor_final,cupom_id,cupom_codigo,pack_aluno_id,protocolo_pagamento)
  values(v_uid,p_curso_id,v_mat.id,'PENDENTE',p_horas,0,now(),now(),v_aluno.nome,v_curso.titulo,v_res.nota,now(),4,false,false,case when v_final=0 then 'ISENTO' else 'AGUARDANDO_PAGAMENTO' end,v_valor,v_desconto,v_final,v_coupon_id,nullif(upper(trim(coalesce(p_cupom,''))),''),v_pack.id,'ALT-PAG-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))) returning * into v_cert;
  update public.carteiras_horas_aluno_v34 set horas_reservadas=horas_reservadas+p_horas,atualizado_em=now() where aluno_id=v_uid returning * into v_wallet;
  insert into public.movimentacoes_horas_aluno_v34(aluno_id,certificado_id,tipo,horas,saldo_automatico,saldo_adicional,saldo_reservado,saldo_utilizado,observacao,realizado_por)
  values(v_uid,v_cert.id,'RESERVA_SOLICITACAO',-p_horas,v_auto,v_wallet.horas_adicionais,v_wallet.horas_reservadas,v_wallet.horas_utilizadas,format('Reserva de %s horas para solicitação de certificado.',p_horas),v_uid);
  return jsonb_build_object('certificado_id',v_cert.id,'status',v_cert.status,'pagamento_status',v_cert.pagamento_status,'horas_solicitadas',p_horas,'valor_base',v_valor,'desconto',v_desconto,'valor_final',v_final,'protocolo_pagamento',v_cert.protocolo_pagamento,'saldo_disponivel',v_auto+v_wallet.horas_adicionais-v_wallet.horas_reservadas-v_wallet.horas_utilizadas);
end;
$$;


create or replace function public.aplicar_cupom_certificado_v34(p_certificado_id bigint,p_codigo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cert public.certificados%rowtype; v_result jsonb;
begin
  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if v_cert.id is null then raise exception 'Solicitação não encontrada'; end if;
  if v_cert.aluno_id<>auth.uid() and not public.e_gestor(2) then raise exception 'Acesso negado'; end if;
  if v_cert.pagamento_status in('PAGO','ISENTO') then raise exception 'O pagamento desta solicitação já foi concluído'; end if;
  if v_cert.pack_aluno_id is not null then raise exception 'Esta solicitação já está incluída em um pack'; end if;
  v_result:=public.validar_cupom_v34(p_codigo,v_cert.aluno_id,'CERTIFICADO',v_cert.valor_base);
  if not coalesce((v_result->>'valido')::boolean,false) then raise exception '%',v_result->>'mensagem'; end if;
  update public.certificados set cupom_id=(v_result->>'cupom_id')::bigint,cupom_codigo=v_result->>'codigo',desconto=(v_result->>'desconto')::numeric,valor_final=(v_result->>'valor_final')::numeric,pagamento_status=case when (v_result->>'valor_final')::numeric=0 then 'ISENTO' else 'AGUARDANDO_PAGAMENTO' end,atualizado_em=now() where id=v_cert.id returning * into v_cert;
  return jsonb_build_object('certificado_id',v_cert.id,'cupom_codigo',v_cert.cupom_codigo,'desconto',v_cert.desconto,'valor_final',v_cert.valor_final,'pagamento_status',v_cert.pagamento_status);
end;$$;

create or replace function public.registrar_whatsapp_certificado_v34(p_certificado_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.certificados set whatsapp_aberto_em=now(),atualizado_em=now() where id=p_certificado_id and (aluno_id=auth.uid() or public.e_gestor(1));
end;$$;


create or replace function public.aluno_informar_pagamento_v34(p_certificado_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cert public.certificados%rowtype;
begin
  select * into v_cert from public.certificados where id=p_certificado_id and aluno_id=auth.uid() for update;
  if v_cert.id is null then raise exception 'Solicitação não encontrada'; end if;
  if v_cert.pagamento_status in('PAGO','ISENTO') then return to_jsonb(v_cert); end if;
  update public.certificados set pagamento_status='PAGAMENTO_INFORMADO',pagamento_informado_em=now(),atualizado_em=now() where id=v_cert.id returning * into v_cert;
  return to_jsonb(v_cert);
end;$$;

-- Compra de pack por quantidade. Nenhum curso é escolhido no momento da compra.
create or replace function public.solicitar_pack_v34(p_pack_id bigint,p_cupom text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_pack public.packs_v34%rowtype; v_row public.packs_alunos_v34%rowtype;
  v_coupon jsonb; v_coupon_id bigint; v_desconto numeric(12,2):=0; v_final numeric(12,2);
begin
  if v_uid is null then raise exception 'Usuário não autenticado'; end if;
  select * into v_pack from public.packs_v34 where id=p_pack_id and ativo=true and (inicio_em is null or now()>=inicio_em) and (fim_em is null or now()<=fim_em);
  if v_pack.id is null then raise exception 'Pack indisponível'; end if;
  if exists(select 1 from public.packs_alunos_v34 where aluno_id=v_uid and pack_id=v_pack.id and status_pagamento='PENDENTE') then raise exception 'Já existe uma solicitação pendente deste pack'; end if;
  v_final:=v_pack.valor;
  if nullif(trim(coalesce(p_cupom,'')),'') is not null then
    v_coupon:=public.validar_cupom_v34(p_cupom,v_uid,'PACK',v_pack.valor);
    if not coalesce((v_coupon->>'valido')::boolean,false) then raise exception '%',v_coupon->>'mensagem'; end if;
    v_coupon_id:=(v_coupon->>'cupom_id')::bigint; v_desconto:=(v_coupon->>'desconto')::numeric; v_final:=(v_coupon->>'valor_final')::numeric;
  end if;
  insert into public.packs_alunos_v34(pack_id,aluno_id,quantidade_adquirida,quantidade_utilizada,valor_pago,status_pagamento,pago_em,valor_base,desconto,valor_final,cupom_id,cupom_codigo,protocolo_pagamento)
  values(v_pack.id,v_uid,v_pack.quantidade_certificados,0,0,case when v_final=0 then 'PAGO' else 'PENDENTE' end,case when v_final=0 then now() else null end,v_pack.valor,v_desconto,v_final,v_coupon_id,nullif(upper(trim(coalesce(p_cupom,''))),''),'ALT-PACK-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))) returning * into v_row;
  if v_final=0 and v_coupon_id is not null then
    insert into public.cupons_usos_v34(cupom_id,aluno_id,pack_aluno_id,valor_desconto) values(v_coupon_id,v_uid,v_row.id,v_desconto);
    update public.cupons_v34 set usos_confirmados=usos_confirmados+1,atualizado_em=now() where id=v_coupon_id;
  end if;
  return to_jsonb(v_row);
end;$$;

create or replace function public.aplicar_cupom_pack_v34(p_pack_aluno_id bigint,p_codigo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.packs_alunos_v34%rowtype; v_result jsonb;
begin
  select * into v_row from public.packs_alunos_v34 where id=p_pack_aluno_id and (aluno_id=auth.uid() or public.e_gestor(2)) for update;
  if v_row.id is null then raise exception 'Solicitação de pack não encontrada'; end if;
  if v_row.status_pagamento='PAGO' then raise exception 'O pagamento deste pack já foi concluído'; end if;
  v_result:=public.validar_cupom_v34(p_codigo,v_row.aluno_id,'PACK',v_row.valor_base);
  if not coalesce((v_result->>'valido')::boolean,false) then raise exception '%',v_result->>'mensagem'; end if;
  update public.packs_alunos_v34 set cupom_id=(v_result->>'cupom_id')::bigint,cupom_codigo=v_result->>'codigo',desconto=(v_result->>'desconto')::numeric,valor_final=(v_result->>'valor_final')::numeric,status_pagamento=case when (v_result->>'valor_final')::numeric=0 then 'PAGO' else 'PENDENTE' end,valor_pago=case when (v_result->>'valor_final')::numeric=0 then 0 else valor_pago end,pago_em=case when (v_result->>'valor_final')::numeric=0 then now() else null end where id=v_row.id returning * into v_row;
  if v_row.status_pagamento='PAGO' and v_row.cupom_id is not null and not exists(select 1 from public.cupons_usos_v34 where pack_aluno_id=v_row.id) then
    insert into public.cupons_usos_v34(cupom_id,aluno_id,pack_aluno_id,valor_desconto) values(v_row.cupom_id,v_row.aluno_id,v_row.id,v_row.desconto);
    update public.cupons_v34 set usos_confirmados=usos_confirmados+1,atualizado_em=now() where id=v_row.cupom_id;
  end if;
  return to_jsonb(v_row);
end;$$;

create or replace function public.registrar_whatsapp_pack_v34(p_pack_aluno_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.packs_alunos_v34 set whatsapp_aberto_em=now() where id=p_pack_aluno_id and (aluno_id=auth.uid() or public.e_gestor(1));
end;$$;

create or replace function public.aluno_informar_pagamento_pack_v34(p_pack_aluno_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.packs_alunos_v34%rowtype;
begin
  select * into v_row from public.packs_alunos_v34 where id=p_pack_aluno_id and aluno_id=auth.uid() for update;
  if v_row.id is null then raise exception 'Solicitação de pack não encontrada'; end if;
  if v_row.status_pagamento='PAGO' then return to_jsonb(v_row); end if;
  update public.packs_alunos_v34 set pagamento_informado_em=now() where id=v_row.id returning * into v_row;
  return to_jsonb(v_row);
end;$$;

create or replace function public.gestor_confirmar_pagamento_pack_v34(p_pack_aluno_id bigint,p_valor_pago numeric default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_row public.packs_alunos_v34%rowtype;
begin
  if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito à gestão'; end if;
  select * into v_row from public.packs_alunos_v34 where id=p_pack_aluno_id for update;
  if v_row.id is null then raise exception 'Solicitação de pack não encontrada'; end if;
  update public.packs_alunos_v34 set status_pagamento='PAGO',valor_pago=coalesce(p_valor_pago,v_row.valor_final),pago_em=now(),pago_por=v_uid where id=v_row.id returning * into v_row;
  if v_row.cupom_id is not null and not exists(select 1 from public.cupons_usos_v34 where pack_aluno_id=v_row.id) then
    insert into public.cupons_usos_v34(cupom_id,aluno_id,pack_aluno_id,valor_desconto) values(v_row.cupom_id,v_row.aluno_id,v_row.id,v_row.desconto);
    update public.cupons_v34 set usos_confirmados=usos_confirmados+1,atualizado_em=now() where id=v_row.cupom_id;
  end if;
  return to_jsonb(v_row);
end;$$;

create or replace function public.gestor_ajustar_solicitacao_certificado_v34(
  p_certificado_id bigint,
  p_horas integer,
  p_periodo_inicio date default null,
  p_periodo_fim date default null,
  p_observacao text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_cert public.certificados%rowtype; v_wallet public.carteiras_horas_aluno_v34%rowtype;
  v_auto integer; v_disponivel integer; v_delta integer; v_cadastro date;
begin
  if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito à gestão acadêmica'; end if;
  if p_horas<5 or mod(p_horas,5)<>0 then raise exception 'A carga deve ser informada de 5 em 5 horas'; end if;
  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if v_cert.id is null then raise exception 'Solicitação não encontrada'; end if;
  if v_cert.status not in('PENDENTE','AGUARDANDO_HORAS') then raise exception 'A solicitação já foi processada'; end if;
  insert into public.carteiras_horas_aluno_v34(aluno_id) values(v_cert.aluno_id) on conflict(aluno_id) do nothing;
  select * into v_wallet from public.carteiras_horas_aluno_v34 where aluno_id=v_cert.aluno_id for update;
  v_auto:=coalesce(public.horas_automaticas_aluno_v34(v_cert.aluno_id),0);
  v_delta:=p_horas-coalesce(v_cert.horas_solicitadas,0);
  v_disponivel:=v_auto+v_wallet.horas_adicionais-v_wallet.horas_reservadas-v_wallet.horas_utilizadas+coalesce(v_cert.horas_solicitadas,0);
  if p_horas>v_disponivel then raise exception 'Saldo insuficiente. Disponível para esta solicitação: % horas',greatest(0,v_disponivel); end if;
  select criado_em::date into v_cadastro from public.alunos where user_id=v_cert.aluno_id;
  if p_periodo_inicio is not null and p_periodo_inicio<v_cadastro then raise exception 'O período não pode começar antes do cadastro do aluno'; end if;
  if p_periodo_fim is not null and p_periodo_fim>current_date then raise exception 'O período não pode terminar no futuro'; end if;
  if p_periodo_inicio is not null and p_periodo_fim is not null then
    if p_periodo_fim<p_periodo_inicio then raise exception 'A data final deve ser igual ou posterior à inicial'; end if;
    if ((p_periodo_fim-p_periodo_inicio)+1)*8<p_horas then raise exception 'O período informado ultrapassa o limite de 8 horas por dia'; end if;
  end if;
  update public.carteiras_horas_aluno_v34 set horas_reservadas=horas_reservadas+v_delta,atualizado_em=now() where aluno_id=v_cert.aluno_id returning * into v_wallet;
  update public.certificados set horas_solicitadas=p_horas,periodo_inicio=p_periodo_inicio,periodo_fim=p_periodo_fim,observacao_gestor=coalesce(nullif(trim(coalesce(p_observacao,'')),''),observacao_gestor),atualizado_em=now() where id=v_cert.id returning * into v_cert;
  insert into public.movimentacoes_horas_aluno_v34(aluno_id,certificado_id,tipo,horas,saldo_automatico,saldo_adicional,saldo_reservado,saldo_utilizado,observacao,realizado_por)
  values(v_cert.aluno_id,v_cert.id,'AJUSTE_SOLICITACAO',v_delta,v_auto,v_wallet.horas_adicionais,v_wallet.horas_reservadas,v_wallet.horas_utilizadas,coalesce(nullif(trim(coalesce(p_observacao,'')),''),'Solicitação de certificado ajustada pela gestão.'),v_uid);
  return to_jsonb(v_cert);
end;$$;

create or replace function public.gestor_confirmar_pagamento_certificado_v34(p_certificado_id bigint,p_observacao text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_cert public.certificados%rowtype;
begin
  if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito à gestão'; end if;
  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if v_cert.id is null then raise exception 'Solicitação não encontrada'; end if;
  update public.certificados set pagamento_status='PAGO',pagamento_confirmado_em=now(),pagamento_confirmado_por=v_uid,pagamento_observacao=coalesce(nullif(trim(coalesce(p_observacao,'')),''),pagamento_observacao),atualizado_em=now() where id=v_cert.id returning * into v_cert;
  if v_cert.cupom_id is not null and not exists(select 1 from public.cupons_usos_v34 where certificado_id=v_cert.id) then
    insert into public.cupons_usos_v34(cupom_id,aluno_id,certificado_id,valor_desconto) values(v_cert.cupom_id,v_cert.aluno_id,v_cert.id,v_cert.desconto);
    update public.cupons_v34 set usos_confirmados=usos_confirmados+1,atualizado_em=now() where id=v_cert.cupom_id;
  end if;
  return to_jsonb(v_cert);
end;$$;

create or replace function public.gestor_decidir_certificado_v34(p_certificado_id bigint,p_acao text,p_observacao text default null,p_periodo_inicio date default null,p_periodo_fim date default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_uid uuid:=auth.uid(); v_acao text:=upper(trim(coalesce(p_acao,''))); v_cert public.certificados%rowtype; v_wallet public.carteiras_horas_aluno_v34%rowtype; v_aluno public.alunos%rowtype; v_curso public.cursos%rowtype; v_horas integer; v_auto integer; v_inicio date; v_fim date; v_codigo uuid; v_numero text;
begin
 if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito à gestão acadêmica'; end if;
 select * into v_cert from public.certificados where id=p_certificado_id for update; if v_cert.id is null then raise exception 'Certificado não encontrado'; end if;
 insert into public.carteiras_horas_aluno_v34(aluno_id) values(v_cert.aluno_id) on conflict(aluno_id) do nothing;
 select * into v_wallet from public.carteiras_horas_aluno_v34 where aluno_id=v_cert.aluno_id for update;
 v_horas:=greatest(0,coalesce(v_cert.horas_solicitadas,0)); v_auto:=coalesce(public.horas_automaticas_aluno_v34(v_cert.aluno_id),0);
 if v_acao='LIBERAR' then
   if v_cert.pagamento_status not in('PAGO','ISENTO') then raise exception 'Confirme o pagamento antes de liberar o certificado'; end if;
   if v_wallet.horas_reservadas<v_horas then raise exception 'Reserva de horas não encontrada'; end if;
   select * into v_aluno from public.alunos where user_id=v_cert.aluno_id; select * into v_curso from public.cursos where id=v_cert.curso_id;
   v_inicio:=coalesce(p_periodo_inicio,v_cert.periodo_inicio,v_aluno.criado_em::date);
   v_fim:=coalesce(p_periodo_fim,v_cert.periodo_fim,v_inicio + greatest(0,ceil(v_horas/8.0)::integer-1));
   if v_fim>current_date then v_fim:=current_date; end if;
   if v_inicio>v_fim then v_inicio:=v_fim; end if;
   if ((v_fim-v_inicio)+1)*8<v_horas and v_wallet.horas_adicionais=0 then raise exception 'O período disponível ainda não comporta a carga solicitada no limite de 8 horas por dia'; end if;
   v_codigo:=coalesce(v_cert.codigo_validacao,gen_random_uuid());
   v_numero:=coalesce(nullif(v_cert.numero_certificado,''),'ALT-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(v_codigo::text,'-',''),1,10)));
   if v_cert.cupom_id is not null and not exists(select 1 from public.cupons_usos_v34 where certificado_id=v_cert.id) then
     insert into public.cupons_usos_v34(cupom_id,aluno_id,certificado_id,valor_desconto) values(v_cert.cupom_id,v_cert.aluno_id,v_cert.id,v_cert.desconto);
     update public.cupons_v34 set usos_confirmados=usos_confirmados+1,atualizado_em=now() where id=v_cert.cupom_id;
   end if;
   update public.carteiras_horas_aluno_v34 set horas_reservadas=horas_reservadas-v_horas,horas_utilizadas=horas_utilizadas+v_horas,atualizado_em=now() where aluno_id=v_cert.aluno_id returning * into v_wallet;
   if v_cert.pack_aluno_id is not null then
     update public.packs_alunos_v34 set quantidade_utilizada=quantidade_utilizada+1 where id=v_cert.pack_aluno_id and status_pagamento='PAGO' and quantidade_utilizada<quantidade_adquirida;
     if not found then raise exception 'O pack não possui saldo disponível para esta liberação'; end if;
   end if;
   update public.certificados set status='EMITIDO',horas_emitidas=v_horas,codigo_validacao=v_codigo,numero_certificado=v_numero,emitido_em=now(),liberado_em=now(),liberado_por=v_uid,periodo_inicio=v_inicio,periodo_fim=v_fim,saldo_processado=true,nome_aluno=coalesce(v_aluno.nome,nome_aluno),nome_curso=coalesce(v_curso.titulo,nome_curso),observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),atualizado_em=now(),versao_pdf=4 where id=v_cert.id returning * into v_cert;
   insert into public.movimentacoes_horas_aluno_v34(aluno_id,certificado_id,tipo,horas,saldo_automatico,saldo_adicional,saldo_reservado,saldo_utilizado,observacao,realizado_por) values(v_cert.aluno_id,v_cert.id,'LIBERACAO_CERTIFICADO',v_horas,v_auto,v_wallet.horas_adicionais,v_wallet.horas_reservadas,v_wallet.horas_utilizadas,coalesce(nullif(trim(coalesce(p_observacao,'')),''),'Certificado liberado.'),v_uid);
 elsif v_acao in('BLOQUEAR','CANCELAR') then
   if v_cert.status in('PENDENTE','AGUARDANDO_HORAS') and v_wallet.horas_reservadas>=v_horas then update public.carteiras_horas_aluno_v34 set horas_reservadas=horas_reservadas-v_horas,atualizado_em=now() where aluno_id=v_cert.aluno_id; end if;
   update public.certificados set status=case when v_acao='BLOQUEAR' then 'BLOQUEADO' else 'CANCELADO' end,observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),atualizado_em=now() where id=v_cert.id returning * into v_cert;
 elsif v_acao='REABRIR' then
   if v_auto+v_wallet.horas_adicionais-v_wallet.horas_reservadas-v_wallet.horas_utilizadas<v_horas then raise exception 'Saldo insuficiente para reabrir'; end if;
   if v_cert.pack_aluno_id is not null and not exists(
     select 1 from public.packs_alunos_v34 pa
     where pa.id=v_cert.pack_aluno_id and pa.status_pagamento='PAGO'
       and pa.quantidade_utilizada + (
         select count(*)::integer from public.certificados c
         where c.pack_aluno_id=pa.id and c.id<>v_cert.id and c.status in ('PENDENTE','AGUARDANDO_HORAS')
       ) < pa.quantidade_adquirida
   ) then raise exception 'O pack não possui saldo disponível para reabrir esta solicitação'; end if;
   update public.carteiras_horas_aluno_v34 set horas_reservadas=horas_reservadas+v_horas,atualizado_em=now() where aluno_id=v_cert.aluno_id;
   update public.certificados set status='PENDENTE',observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),atualizado_em=now() where id=v_cert.id returning * into v_cert;
 else raise exception 'Ação inválida'; end if;
 return to_jsonb(v_cert);
end;$$;

-- Registrar pack pago para um aluno, sem definir cursos.
create or replace function public.gestor_registrar_pack_aluno_v34(p_pack_id bigint,p_aluno_id uuid,p_valor_pago numeric default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_pack public.packs_v34%rowtype; v_row public.packs_alunos_v34%rowtype;
begin
 if v_uid is null or not public.e_gestor(3) then raise exception 'Acesso restrito à gestão comercial'; end if;
 select * into v_pack from public.packs_v34 where id=p_pack_id; if v_pack.id is null then raise exception 'Pack não encontrado'; end if;
 insert into public.packs_alunos_v34(pack_id,aluno_id,quantidade_adquirida,valor_pago,status_pagamento,pago_em,pago_por)
 values(v_pack.id,p_aluno_id,v_pack.quantidade_certificados,coalesce(p_valor_pago,v_pack.valor),'PAGO',now(),v_uid) returning * into v_row;
 update public.packs_alunos_v34 set valor_base=v_pack.valor,valor_final=coalesce(p_valor_pago,v_pack.valor),protocolo_pagamento=coalesce(protocolo_pagamento,'ALT-PACK-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))) where id=v_row.id returning * into v_row;
 return to_jsonb(v_row);
end;$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.configuracoes_comerciais_v34 enable row level security;
alter table public.tipos_curso_catalogo_v34 enable row level security;
alter table public.promocoes_v34 enable row level security;
alter table public.promocoes_alunos_v34 enable row level security;
alter table public.packs_v34 enable row level security;
alter table public.packs_alunos_v34 enable row level security;
alter table public.cupons_v34 enable row level security;
alter table public.cupons_usos_v34 enable row level security;
alter table public.carteiras_horas_aluno_v34 enable row level security;
alter table public.movimentacoes_horas_aluno_v34 enable row level security;

drop policy if exists "publico_le_config_comercial_v34" on public.configuracoes_comerciais_v34;
drop policy if exists "gestor_edita_config_comercial_v34" on public.configuracoes_comerciais_v34;
drop policy if exists "publico_le_tipos_v34" on public.tipos_curso_catalogo_v34;
drop policy if exists "gestor_edita_tipos_v34" on public.tipos_curso_catalogo_v34;
drop policy if exists "publico_le_promocoes_v34" on public.promocoes_v34;
drop policy if exists "gestor_gerencia_promocoes_v34" on public.promocoes_v34;
drop policy if exists "aluno_promocoes_proprias_v34" on public.promocoes_alunos_v34;
drop policy if exists "gestor_le_promocoes_alunos_v34" on public.promocoes_alunos_v34;
drop policy if exists "publico_le_packs_v34" on public.packs_v34;
drop policy if exists "gestor_gerencia_packs_v34" on public.packs_v34;
drop policy if exists "aluno_le_packs_proprios_v34" on public.packs_alunos_v34;
drop policy if exists "gestor_gerencia_packs_alunos_v34" on public.packs_alunos_v34;
drop policy if exists "gestor_gerencia_cupons_v34" on public.cupons_v34;
drop policy if exists "aluno_le_usos_cupom_v34" on public.cupons_usos_v34;
drop policy if exists "aluno_le_carteira_v34" on public.carteiras_horas_aluno_v34;
drop policy if exists "gestor_gerencia_carteira_v34" on public.carteiras_horas_aluno_v34;
drop policy if exists "aluno_le_movimentacoes_v34" on public.movimentacoes_horas_aluno_v34;

create policy "publico_le_config_comercial_v34" on public.configuracoes_comerciais_v34 for select using (true);
create policy "gestor_edita_config_comercial_v34" on public.configuracoes_comerciais_v34 for all using (public.e_gestor(3)) with check (public.e_gestor(3));
create policy "publico_le_tipos_v34" on public.tipos_curso_catalogo_v34 for select using (true);
create policy "gestor_edita_tipos_v34" on public.tipos_curso_catalogo_v34 for all using (public.e_gestor(3)) with check (public.e_gestor(3));
create policy "publico_le_promocoes_v34" on public.promocoes_v34 for select using (ativa and (inicio_em is null or now()>=inicio_em) and (fim_em is null or now()<=fim_em));
create policy "gestor_gerencia_promocoes_v34" on public.promocoes_v34 for all using (public.e_gestor(3)) with check (public.e_gestor(3));
create policy "aluno_promocoes_proprias_v34" on public.promocoes_alunos_v34 for all using (aluno_id=auth.uid()) with check (aluno_id=auth.uid());
create policy "gestor_le_promocoes_alunos_v34" on public.promocoes_alunos_v34 for select using (public.e_gestor(2));
create policy "publico_le_packs_v34" on public.packs_v34 for select using (ativo and (inicio_em is null or now()>=inicio_em) and (fim_em is null or now()<=fim_em));
create policy "gestor_gerencia_packs_v34" on public.packs_v34 for all using (public.e_gestor(3)) with check (public.e_gestor(3));
create policy "aluno_le_packs_proprios_v34" on public.packs_alunos_v34 for select using (aluno_id=auth.uid() or public.e_gestor(2));
create policy "gestor_gerencia_packs_alunos_v34" on public.packs_alunos_v34 for all using (public.e_gestor(3)) with check (public.e_gestor(3));
create policy "gestor_gerencia_cupons_v34" on public.cupons_v34 for all using (public.e_gestor(3)) with check (public.e_gestor(3));
create policy "aluno_le_usos_cupom_v34" on public.cupons_usos_v34 for select using (aluno_id=auth.uid() or public.e_gestor(2));
create policy "aluno_le_carteira_v34" on public.carteiras_horas_aluno_v34 for select using (aluno_id=auth.uid() or public.e_gestor(2));
create policy "gestor_gerencia_carteira_v34" on public.carteiras_horas_aluno_v34 for all using (public.e_gestor(2)) with check (public.e_gestor(2));
create policy "aluno_le_movimentacoes_v34" on public.movimentacoes_horas_aluno_v34 for select using (aluno_id=auth.uid() or public.e_gestor(2));

grant select on public.configuracoes_comerciais_v34,public.tipos_curso_catalogo_v34,public.promocoes_v34,public.packs_v34 to anon,authenticated;
grant select,insert,update,delete on public.configuracoes_comerciais_v34,public.tipos_curso_catalogo_v34,public.promocoes_v34,public.packs_v34,public.cupons_v34 to authenticated;
grant select,insert,update on public.promocoes_alunos_v34 to authenticated;
grant select on public.packs_alunos_v34,public.cupons_usos_v34,public.carteiras_horas_aluno_v34,public.movimentacoes_horas_aluno_v34 to authenticated;
grant usage,select on all sequences in schema public to authenticated;
-- Por padrão, funções são executáveis por PUBLIC. A V34 fecha esse acesso e
-- libera somente os RPCs usados pelo aluno ou pela gestão.
do $$
declare v_function record;
begin
  for v_function in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%\_v34' escape '\'
  loop
    execute format('revoke all on function %s from public, anon, authenticated',v_function.assinatura);
  end loop;
end $$;

grant execute on function public.obter_minha_carteira_horas_v34(),public.obter_carteiras_horas_gestao_v34(),public.gestor_definir_horas_aluno_v34(uuid,integer,text),public.solicitar_certificado_curso_v34(bigint,integer,text),public.aplicar_cupom_certificado_v34(bigint,text),public.registrar_whatsapp_certificado_v34(bigint),public.aluno_informar_pagamento_v34(bigint),public.solicitar_pack_v34(bigint,text),public.aplicar_cupom_pack_v34(bigint,text),public.registrar_whatsapp_pack_v34(bigint),public.aluno_informar_pagamento_pack_v34(bigint),public.gestor_confirmar_pagamento_pack_v34(bigint,numeric),public.gestor_ajustar_solicitacao_certificado_v34(bigint,integer,date,date,text),public.gestor_confirmar_pagamento_certificado_v34(bigint,text),public.gestor_decidir_certificado_v34(bigint,text,text,date,date),public.gestor_registrar_pack_aluno_v34(bigint,uuid,numeric) to authenticated;

-- Bucket de imagens das promoções/packs. É público apenas para leitura.
insert into storage.buckets(id,name,public) values('promocoes-v34','promocoes-v34',true) on conflict(id) do update set public=true;
drop policy if exists "publico_le_imagens_promocoes_v34" on storage.objects;
drop policy if exists "gestor_envia_imagens_promocoes_v34" on storage.objects;
drop policy if exists "gestor_atualiza_imagens_promocoes_v34" on storage.objects;
drop policy if exists "gestor_exclui_imagens_promocoes_v34" on storage.objects;
create policy "publico_le_imagens_promocoes_v34" on storage.objects for select using (bucket_id='promocoes-v34');
create policy "gestor_envia_imagens_promocoes_v34" on storage.objects for insert with check (bucket_id='promocoes-v34' and public.e_gestor(3));
create policy "gestor_atualiza_imagens_promocoes_v34" on storage.objects for update using (bucket_id='promocoes-v34' and public.e_gestor(3));
create policy "gestor_exclui_imagens_promocoes_v34" on storage.objects for delete using (bucket_id='promocoes-v34' and public.e_gestor(3));

commit;
