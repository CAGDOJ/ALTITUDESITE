-- =============================================================================
-- ALTITUDE V34.3 - PREVISAO DE CERTIFICACAO, LIMITE GLOBAL DE 8H/DIA,
-- PERMISSOES ESPECIAIS E SINCRONIZACAO SEGURA DE ACESSO
-- Execute depois da migration 020.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. ESTRUTURA E IDENTIFICACAO DO TIPO DE CURSO
-- ----------------------------------------------------------------------------
alter table public.cursos
  add column if not exists tipo_curso text not null default 'PROFISSIONAL';

update public.cursos
set tipo_curso = case when upper(coalesce(tipo_curso,'PROFISSIONAL'))='TECNICO' then 'TECNICO' else 'PROFISSIONAL' end;

alter table public.certificados
  add column if not exists tipo_curso_snapshot text not null default 'PROFISSIONAL',
  add column if not exists data_inicio_prevista date,
  add column if not exists data_final_prevista date,
  add column if not exists previsao_liberacao date,
  add column if not exists horas_comprometidas_anteriores integer not null default 0,
  add column if not exists capacidade_periodo integer not null default 0,
  add column if not exists horas_faltantes integer not null default 0,
  add column if not exists autorizado_em timestamptz,
  add column if not exists autorizado_por uuid references auth.users(id),
  add column if not exists autorizacao_observacao text;

update public.certificados c
set tipo_curso_snapshot = case when upper(coalesce(cu.tipo_curso,'PROFISSIONAL'))='TECNICO' then 'TECNICO' else 'PROFISSIONAL' end
from public.cursos cu
where cu.id=c.curso_id;

create index if not exists certificados_previsao_v34_3_idx
  on public.certificados(aluno_id,tipo_curso_snapshot,status,previsao_liberacao);

-- ----------------------------------------------------------------------------
-- 2. GESTOR ESPECIAL - A REGRA E VALIDADA NO BANCO, NAO SO NA TELA
-- ----------------------------------------------------------------------------
create table if not exists public.gestores_permissoes_especiais_v34_3(
  gestor_id text primary key,
  pode_alterar_data_entrada boolean not null default false,
  pode_corrigir_certificado_retroativo boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

insert into public.gestores_permissoes_especiais_v34_3(
  gestor_id,pode_alterar_data_entrada,pode_corrigir_certificado_retroativo,ativo
) values('GST-2026-0001',true,true,true)
on conflict(gestor_id) do update set
  pode_alterar_data_entrada=excluded.pode_alterar_data_entrada,
  pode_corrigir_certificado_retroativo=excluded.pode_corrigir_certificado_retroativo,
  ativo=excluded.ativo,
  atualizado_em=now();

alter table public.gestores_permissoes_especiais_v34_3 enable row level security;
revoke all on public.gestores_permissoes_especiais_v34_3 from anon,authenticated;

create or replace function public.e_gestor_especial_v34_3()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.gestores g
    join public.gestores_permissoes_especiais_v34_3 p
      on upper(regexp_replace(coalesce(g.gestor_id,''),'[^A-Z0-9]','','g'))
       = upper(regexp_replace(coalesce(p.gestor_id,''),'[^A-Z0-9]','','g'))
    where g.user_id=auth.uid()
      and g.status='ATIVO'
      and p.ativo=true
      and p.pode_alterar_data_entrada=true
      and p.pode_corrigir_certificado_retroativo=true
  );
$$;

revoke all on function public.e_gestor_especial_v34_3() from public;
grant execute on function public.e_gestor_especial_v34_3() to authenticated;

create table if not exists public.auditoria_especial_v34_3(
  id bigint generated always as identity primary key,
  gestor_id uuid not null references auth.users(id),
  aluno_id uuid references public.alunos(user_id) on delete set null,
  certificado_id bigint references public.certificados(id) on delete set null,
  acao text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  justificativa text not null,
  criado_em timestamptz not null default now()
);

alter table public.auditoria_especial_v34_3 enable row level security;
drop policy if exists gestor_especial_le_auditoria_v34_3 on public.auditoria_especial_v34_3;
create policy gestor_especial_le_auditoria_v34_3
on public.auditoria_especial_v34_3 for select to authenticated
using(public.e_gestor_especial_v34_3());
grant select on public.auditoria_especial_v34_3 to authenticated;

-- Auditoria das alteracoes de e-mail/perfil feitas pela Edge Function.
-- Nenhuma senha e armazenada nesta tabela.
create table if not exists public.auditoria_acessos_alunos_v34_3(
  id bigint generated always as identity primary key,
  aluno_id uuid references public.alunos(user_id) on delete set null,
  alterado_por uuid not null references auth.users(id),
  acao text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  criado_em timestamptz not null default now()
);

alter table public.auditoria_acessos_alunos_v34_3 enable row level security;
drop policy if exists gestores_leem_auditoria_acessos_v34_3 on public.auditoria_acessos_alunos_v34_3;
create policy gestores_leem_auditoria_acessos_v34_3
on public.auditoria_acessos_alunos_v34_3 for select to authenticated
using(public.e_gestor(2));
grant select on public.auditoria_acessos_alunos_v34_3 to authenticated;

-- Login por e-mail, CPF ou RA. Somente alunos ativos sao resolvidos.
create or replace function public.resolver_email_aluno(p_identificador text)
returns text
language sql
stable
security definer
set search_path=public
as $$
  with entrada as (
    select
      lower(trim(coalesce(p_identificador,''))) as email_normalizado,
      upper(regexp_replace(trim(coalesce(p_identificador,'')),'[^A-Za-z0-9]','','g')) as ra_normalizado,
      regexp_replace(coalesce(p_identificador,''),'\D','','g') as cpf_normalizado
  )
  select lower(trim(a.email))
  from public.alunos a, entrada e
  where upper(coalesce(a.status,'ATIVO'))='ATIVO'
    and (
      (e.email_normalizado<>'' and lower(trim(coalesce(a.email,'')))=e.email_normalizado)
      or (e.ra_normalizado<>'' and upper(regexp_replace(coalesce(a.ra,''),'[^A-Za-z0-9]','','g'))=e.ra_normalizado)
      or (
        length(e.cpf_normalizado)=11
        and regexp_replace(coalesce(a.cpf,''),'\D','','g')=e.cpf_normalizado
      )
    )
  order by a.atualizado_em desc nulls last,a.criado_em desc
  limit 1;
$$;

revoke all on function public.resolver_email_aluno(text) from public;
grant execute on function public.resolver_email_aluno(text) to anon,authenticated;

-- ----------------------------------------------------------------------------
-- 3. CONTAGEM CORRETA: DATA LOCAL DE BELEM E EXATAMENTE 8H POR DIA
-- ----------------------------------------------------------------------------
create or replace function public.horas_automaticas_aluno_v34(p_aluno_id uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select greatest(
    0,
    (
      (now() at time zone 'America/Belem')::date
      - coalesce(c.data_inicio_contagem,(a.criado_em at time zone 'America/Belem')::date)
      + 1
    ) * 8
  )::integer
  from public.alunos a
  left join public.carteiras_horas_aluno_v34 c on c.aluno_id=a.user_id
  where a.user_id=p_aluno_id;
$$;

grant execute on function public.horas_automaticas_aluno_v34(uuid) to authenticated;

-- Ajustes positivos/negativos continuam para gestores academicos. Alterar a
-- data de entrada e recalcular retroativamente e exclusivo do GST-2026-0001.
create or replace function public.gestor_ajustar_carteira_aluno_v34(
  p_aluno_id uuid,
  p_horas_adicionais integer,
  p_justificativa text,
  p_data_inicio_contagem date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_wallet public.carteiras_horas_aluno_v34%rowtype;
  v_aluno public.alunos%rowtype;
  v_auto integer;
  v_anterior integer:=0;
  v_delta integer:=0;
  v_saldo integer;
  v_data_anterior date;
  v_hoje date:=(now() at time zone 'America/Belem')::date;
begin
  if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito a gestao academica'; end if;
  if mod(abs(coalesce(p_horas_adicionais,0)),5)<>0 then raise exception 'Informe o ajuste em multiplos de 5 horas'; end if;
  if nullif(trim(coalesce(p_justificativa,'')),'') is null then raise exception 'Informe a justificativa do ajuste'; end if;
  if p_data_inicio_contagem is not null and p_data_inicio_contagem>v_hoje then raise exception 'A data inicial nao pode ser futura'; end if;

  select * into v_aluno from public.alunos where user_id=p_aluno_id for update;
  if v_aluno.user_id is null then raise exception 'Aluno nao encontrado'; end if;

  insert into public.carteiras_horas_aluno_v34(aluno_id) values(p_aluno_id) on conflict(aluno_id) do nothing;
  select * into v_wallet from public.carteiras_horas_aluno_v34 where aluno_id=p_aluno_id for update;
  v_anterior:=coalesce(v_wallet.horas_adicionais,0);
  v_data_anterior:=coalesce(v_wallet.data_inicio_contagem,(v_aluno.criado_em at time zone 'America/Belem')::date);

  if p_data_inicio_contagem is not null and p_data_inicio_contagem<>v_data_anterior and not public.e_gestor_especial_v34_3() then
    raise exception 'Somente o gestor GST-2026-0001 pode alterar a data de entrada do aluno';
  end if;

  if p_data_inicio_contagem is not null and p_data_inicio_contagem<>v_data_anterior then
    update public.alunos
       set criado_em=(p_data_inicio_contagem::timestamp + time '12:00') at time zone 'America/Belem',
           atualizado_em=now()
     where user_id=p_aluno_id;
  end if;

  update public.carteiras_horas_aluno_v34
     set horas_adicionais=coalesce(p_horas_adicionais,0),
         data_inicio_contagem=coalesce(p_data_inicio_contagem,data_inicio_contagem),
         justificativa_gestor=trim(p_justificativa),
         atualizado_por=v_uid,
         atualizado_em=now()
   where aluno_id=p_aluno_id
   returning * into v_wallet;

  v_auto:=coalesce(public.horas_automaticas_aluno_v34(p_aluno_id),0);
  v_saldo:=v_auto+v_wallet.horas_adicionais-v_wallet.horas_reservadas-v_wallet.horas_utilizadas;
  if v_saldo<0 then raise exception 'O ajuste deixaria a carteira com saldo negativo'; end if;

  v_delta:=v_wallet.horas_adicionais-v_anterior;
  insert into public.movimentacoes_horas_aluno_v34(
    aluno_id,tipo,horas,saldo_automatico,saldo_adicional,saldo_reservado,saldo_utilizado,observacao,realizado_por
  ) values(
    p_aluno_id,
    case when p_data_inicio_contagem is not null and p_data_inicio_contagem<>v_data_anterior then 'CORRECAO_DATA_ENTRADA'
         when v_delta<0 then 'RETIRADA_GESTAO'
         when v_delta>0 then 'ADICAO_GESTAO'
         else 'AJUSTE_SEM_VARIACAO' end,
    v_delta,v_auto,v_wallet.horas_adicionais,v_wallet.horas_reservadas,v_wallet.horas_utilizadas,
    trim(p_justificativa),v_uid
  );

  if p_data_inicio_contagem is not null and p_data_inicio_contagem<>v_data_anterior then
    insert into public.auditoria_especial_v34_3(
      gestor_id,aluno_id,acao,valor_anterior,valor_novo,justificativa
    ) values(
      v_uid,p_aluno_id,'ALTERAR_DATA_ENTRADA',
      jsonb_build_object('data_entrada',v_data_anterior),
      jsonb_build_object('data_entrada',p_data_inicio_contagem),trim(p_justificativa)
    );
  end if;

  return jsonb_build_object(
    'horas_automaticas',v_auto,
    'horas_adicionais',v_wallet.horas_adicionais,
    'horas_validadas',greatest(0,v_auto+v_wallet.horas_adicionais),
    'horas_reservadas',v_wallet.horas_reservadas,
    'horas_utilizadas',v_wallet.horas_utilizadas,
    'saldo_disponivel',greatest(0,v_saldo),
    'data_inicio_contagem',coalesce(v_wallet.data_inicio_contagem,p_data_inicio_contagem,v_data_anterior)
  );
end;
$$;

grant execute on function public.gestor_ajustar_carteira_aluno_v34(uuid,integer,text,date) to authenticated;

-- Cupom valido pelo dia local de Belem. Isso evita o falso aviso de
-- "ainda nao esta disponivel" quando o gestor ativa o cupom no mesmo dia.
create or replace function public.validar_cupom_v34(
  p_codigo text,
  p_aluno_id uuid,
  p_aplicacao text,
  p_valor_base numeric
) returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v public.cupons_v34%rowtype;
  v_usos_aluno integer:=0;
  v_compromissos_aluno integer:=0;
  v_compromissos_globais integer:=0;
  v_desconto numeric(12,2):=0;
  v_final numeric(12,2):=greatest(0,coalesce(p_valor_base,0));
  v_hoje date:=(now() at time zone 'America/Belem')::date;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado'; end if;
  if p_aluno_id<>auth.uid() and not public.e_gestor(2) then raise exception 'Acesso negado'; end if;
  if nullif(trim(coalesce(p_codigo,'')),'') is null then
    return jsonb_build_object('valido',false,'mensagem','Informe um cupom.');
  end if;

  select * into v from public.cupons_v34 where upper(trim(codigo))=upper(trim(p_codigo)) limit 1;
  if v.id is null then return jsonb_build_object('valido',false,'mensagem','Cupom nao encontrado.'); end if;
  if not v.ativo then return jsonb_build_object('valido',false,'mensagem','Cupom inativo.'); end if;
  if v.inicio_em is not null and (v.inicio_em at time zone 'America/Belem')::date>v_hoje then
    return jsonb_build_object('valido',false,'mensagem','Cupom ainda nao esta disponivel.');
  end if;
  if v.fim_em is not null and (v.fim_em at time zone 'America/Belem')::date<v_hoje then
    return jsonb_build_object('valido',false,'mensagem','Cupom expirado.');
  end if;
  if upper(coalesce(v.aplicacao,'')) not in('AMBOS',upper(coalesce(p_aplicacao,'CERTIFICADO'))) then
    return jsonb_build_object('valido',false,'mensagem','Cupom nao aplicavel a esta solicitacao.');
  end if;

  select count(*)::integer into v_usos_aluno
  from public.cupons_usos_v34 u where u.cupom_id=v.id and u.aluno_id=p_aluno_id;

  select (
    (select count(*) from public.certificados c
      where c.cupom_id=v.id
        and upper(coalesce(c.status,'')) not in('CANCELADO','BLOQUEADO','EMITIDO'))
    +
    (select count(*) from public.packs_alunos_v34 pa
      where pa.cupom_id=v.id
        and upper(coalesce(pa.status_pagamento,'')) not in('CANCELADO','PAGO'))
  )::integer into v_compromissos_globais;

  select (
    (select count(*) from public.certificados c
      where c.aluno_id=p_aluno_id and c.cupom_id=v.id
        and upper(coalesce(c.status,'')) not in('CANCELADO','BLOQUEADO','EMITIDO'))
    +
    (select count(*) from public.packs_alunos_v34 pa
      where pa.aluno_id=p_aluno_id and pa.cupom_id=v.id
        and upper(coalesce(pa.status_pagamento,'')) not in('CANCELADO','PAGO'))
  )::integer into v_compromissos_aluno;

  if v.limite_usos is not null and v.usos_confirmados+v_compromissos_globais>=v.limite_usos then
    return jsonb_build_object('valido',false,'mensagem','Limite de usos atingido.');
  end if;
  if v_usos_aluno+v_compromissos_aluno>=v.limite_por_aluno then
    return jsonb_build_object('valido',false,'mensagem','Voce ja utilizou ou reservou este cupom.');
  end if;

  v_desconto:=case upper(v.tipo)
    when 'GRATUITO' then v_final
    when 'PERCENTUAL' then round(v_final*least(100,v.valor)/100,2)
    else least(v_final,v.valor)
  end;
  v_final:=greatest(0,v_final-v_desconto);

  return jsonb_build_object(
    'valido',true,'cupom_id',v.id,'codigo',v.codigo,'tipo',v.tipo,
    'desconto',v_desconto,'valor_final',v_final,'mensagem','Cupom aplicado.'
  );
end;
$$;

grant execute on function public.validar_cupom_v34(text,uuid,text,numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. AGENDA GLOBAL DOS CURSOS PROFISSIONAIS - MAXIMO DE 8H POR DIA/ALUNO
-- ----------------------------------------------------------------------------
create or replace function public.recalcular_previsoes_profissionais_v34_3(p_aluno_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_inicio date;
  v_acumulado integer:=0;
  v_horas integer;
  v_ini date;
  v_fim date;
  v_auto integer;
  v_wallet public.carteiras_horas_aluno_v34%rowtype;
  r record;
begin
  insert into public.carteiras_horas_aluno_v34(aluno_id) values(p_aluno_id) on conflict(aluno_id) do nothing;
  select * into v_wallet from public.carteiras_horas_aluno_v34 where aluno_id=p_aluno_id;
  select coalesce(v_wallet.data_inicio_contagem,(a.criado_em at time zone 'America/Belem')::date)
    into v_inicio from public.alunos a where a.user_id=p_aluno_id;
  if v_inicio is null then return; end if;
  v_auto:=coalesce(public.horas_automaticas_aluno_v34(p_aluno_id),0);

  for r in
    select c.id,c.status,coalesce(nullif(c.horas_emitidas,0),c.horas_solicitadas,0) as horas
    from public.certificados c
    join public.cursos cu on cu.id=c.curso_id
    where c.aluno_id=p_aluno_id
      and upper(coalesce(cu.tipo_curso,c.tipo_curso_snapshot,'PROFISSIONAL'))='PROFISSIONAL'
      and upper(coalesce(c.status,'')) not in ('CANCELADO','BLOQUEADO')
    order by coalesce(c.solicitado_em,c.criado_em::timestamptz,c.emitido_em),c.id
  loop
    v_horas:=greatest(0,coalesce(r.horas,0));
    if v_horas=0 then continue; end if;
    v_ini:=v_inicio + floor(v_acumulado/8.0)::integer;
    v_fim:=v_inicio + floor((v_acumulado+v_horas-1)/8.0)::integer;

    if upper(coalesce(r.status,''))<>'EMITIDO' then
      update public.certificados
         set tipo_curso_snapshot='PROFISSIONAL',
             data_inicio_prevista=v_ini,
             data_final_prevista=v_fim,
             previsao_liberacao=v_fim,
             periodo_inicio=v_ini,
             periodo_fim=v_fim,
             horas_comprometidas_anteriores=v_acumulado,
             capacidade_periodo=((v_fim-v_inicio)+1)*8,
             horas_faltantes=greatest(0,v_horas-greatest(0,v_auto+coalesce(v_wallet.horas_adicionais,0)-coalesce(v_wallet.horas_reservadas,0)-coalesce(v_wallet.horas_utilizadas,0))),
             atualizado_em=now()
       where id=r.id;
    end if;
    v_acumulado:=v_acumulado+v_horas;
  end loop;
end;
$$;

revoke all on function public.recalcular_previsoes_profissionais_v34_3(uuid) from public;

create or replace function public.calcular_previsao_certificado_v34_3(
  p_aluno_id uuid,
  p_horas integer,
  p_excluir_certificado_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_inicio date;
  v_comprometidas integer:=0;
  v_ini date;
  v_fim date;
  v_auto integer;
  v_adicional integer:=0;
  v_reservado integer:=0;
  v_utilizado integer:=0;
  v_saldo integer:=0;
begin
  if p_horas<5 or mod(p_horas,5)<>0 then raise exception 'A carga deve ser informada de 5 em 5 horas'; end if;
  if auth.uid()<>p_aluno_id and not public.e_gestor(2) then raise exception 'Acesso negado'; end if;

  select coalesce(w.data_inicio_contagem,(a.criado_em at time zone 'America/Belem')::date),
         coalesce(w.horas_adicionais,0),coalesce(w.horas_reservadas,0),coalesce(w.horas_utilizadas,0)
    into v_inicio,v_adicional,v_reservado,v_utilizado
  from public.alunos a
  left join public.carteiras_horas_aluno_v34 w on w.aluno_id=a.user_id
  where a.user_id=p_aluno_id;
  if v_inicio is null then raise exception 'Aluno nao encontrado'; end if;

  select coalesce(sum(coalesce(nullif(c.horas_emitidas,0),c.horas_solicitadas,0)),0)::integer
    into v_comprometidas
  from public.certificados c
  join public.cursos cu on cu.id=c.curso_id
  where c.aluno_id=p_aluno_id
    and (p_excluir_certificado_id is null or c.id<>p_excluir_certificado_id)
    and upper(coalesce(cu.tipo_curso,c.tipo_curso_snapshot,'PROFISSIONAL'))='PROFISSIONAL'
    and upper(coalesce(c.status,'')) not in ('CANCELADO','BLOQUEADO');

  v_ini:=v_inicio+floor(v_comprometidas/8.0)::integer;
  v_fim:=v_inicio+floor((v_comprometidas+p_horas-1)/8.0)::integer;
  v_auto:=coalesce(public.horas_automaticas_aluno_v34(p_aluno_id),0);
  v_saldo:=greatest(0,v_auto+v_adicional-v_reservado-v_utilizado);

  return jsonb_build_object(
    'data_entrada',v_inicio,
    'data_inicio_prevista',v_ini,
    'data_final_prevista',v_fim,
    'previsao_liberacao',v_fim,
    'horas_solicitadas',p_horas,
    'horas_disponiveis',v_saldo,
    'horas_faltantes',greatest(0,p_horas-v_saldo),
    'horas_comprometidas_anteriores',v_comprometidas,
    'capacidade_total_ate_fim',((v_fim-v_inicio)+1)*8,
    'capacidade_restante_antes_pedido',greatest(0,((v_fim-v_inicio)+1)*8-v_comprometidas),
    'limite_diario',8
  );
end;
$$;

grant execute on function public.calcular_previsao_certificado_v34_3(uuid,integer,bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. SOLICITACAO PROFISSIONAL ACEITA HORAS ACIMA DO SALDO E GUARDA PREVISAO
-- ----------------------------------------------------------------------------
create or replace function public.solicitar_certificado_profissional_v34_3(
  p_curso_id bigint,
  p_horas integer,
  p_cupom text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_mat public.matriculas%rowtype;
  v_res public.resultados_provas%rowtype;
  v_cfg public.configuracoes_comerciais_v34%rowtype;
  v_cert public.certificados%rowtype;
  v_pack public.packs_alunos_v34%rowtype;
  v_coupon jsonb;
  v_calc jsonb;
  v_coupon_id bigint;
  v_valor numeric(12,2);
  v_desconto numeric(12,2):=0;
  v_final numeric(12,2);
  v_status text;
begin
  if v_uid is null then raise exception 'Usuario nao autenticado'; end if;
  if p_horas<5 or mod(p_horas,5)<>0 then raise exception 'Escolha uma quantidade de horas de 5 em 5'; end if;

  select * into v_aluno from public.alunos where user_id=v_uid and status='ATIVO';
  if v_aluno.user_id is null then raise exception 'Cadastro de aluno inativo ou nao encontrado'; end if;
  select * into v_curso from public.cursos where id=p_curso_id;
  if v_curso.id is null then raise exception 'Curso nao encontrado'; end if;
  if upper(coalesce(v_curso.tipo_curso,'PROFISSIONAL'))<>'PROFISSIONAL' then
    raise exception 'Esta regra de previsao e exclusiva dos cursos profissionais';
  end if;

  if exists(select 1 from public.certificados c where c.aluno_id=v_uid and c.curso_id=p_curso_id and upper(coalesce(c.status,''))='EMITIDO') then
    raise exception 'Este curso ja possui certificado emitido';
  end if;
  if exists(select 1 from public.certificados c where c.aluno_id=v_uid and c.curso_id=p_curso_id and upper(coalesce(c.status,'')) in ('PENDENTE','AGUARDANDO_HORAS','AUTORIZADO_AGUARDANDO_DATA')) then
    raise exception 'Ja existe uma solicitacao ativa para este curso';
  end if;

  select * into v_mat
  from public.matriculas
  where aluno_id=v_uid and curso_id=p_curso_id and progresso>=100 and status in('ATIVA','CONCLUIDA')
  order by criada_em limit 1;
  if v_mat.id is null then raise exception 'Curso ainda nao foi concluido'; end if;

  select * into v_res
  from public.resultados_provas
  where aluno_id=v_uid and curso_id=p_curso_id and aprovado=true
  order by nota desc,criado_em desc limit 1;
  if v_res.id is null then raise exception 'A aprovacao na prova e obrigatoria'; end if;

  insert into public.carteiras_horas_aluno_v34(aluno_id) values(v_uid) on conflict(aluno_id) do nothing;

  select * into v_cfg from public.configuracoes_comerciais_v34 where id=1;
  v_valor:=case when coalesce(v_cfg.cobranca_ativa,true) then coalesce(v_cfg.valor_certificado,0) else 0 end;
  v_final:=v_valor;

  select pa.* into v_pack
  from public.packs_alunos_v34 pa
  where pa.aluno_id=v_uid and pa.status_pagamento='PAGO'
    and pa.quantidade_utilizada+(
      select count(*)::integer from public.certificados c
      where c.pack_aluno_id=pa.id and upper(coalesce(c.status,'')) in('PENDENTE','AGUARDANDO_HORAS','AUTORIZADO_AGUARDANDO_DATA')
    )<pa.quantidade_adquirida
  order by pa.criado_em limit 1 for update;

  if v_pack.id is not null then
    v_final:=0;
  elsif nullif(trim(coalesce(p_cupom,'')),'') is not null then
    v_coupon:=public.validar_cupom_v34(p_cupom,v_uid,'CERTIFICADO',v_valor);
    if not coalesce((v_coupon->>'valido')::boolean,false) then raise exception '%',v_coupon->>'mensagem'; end if;
    v_coupon_id:=(v_coupon->>'cupom_id')::bigint;
    v_desconto:=(v_coupon->>'desconto')::numeric;
    v_final:=(v_coupon->>'valor_final')::numeric;
  end if;

  v_calc:=public.calcular_previsao_certificado_v34_3(v_uid,p_horas,null);
  v_status:=case
    when (v_calc->>'previsao_liberacao')::date>(now() at time zone 'America/Belem')::date then 'AGUARDANDO_HORAS'
    when (v_calc->>'horas_faltantes')::integer>0 then 'AGUARDANDO_HORAS'
    else 'PENDENTE' end;

  insert into public.certificados(
    aluno_id,curso_id,matricula_id,status,horas_solicitadas,horas_emitidas,
    criado_em,solicitado_em,nome_aluno,nome_curso,nota_final,atualizado_em,versao_pdf,
    saldo_processado,liberacao_excepcional,pagamento_status,valor_base,desconto,valor_final,
    cupom_id,cupom_codigo,pack_aluno_id,protocolo_pagamento,tipo_curso_snapshot,
    data_inicio_prevista,data_final_prevista,previsao_liberacao,periodo_inicio,periodo_fim,
    horas_comprometidas_anteriores,capacidade_periodo,horas_faltantes
  ) values(
    v_uid,p_curso_id,v_mat.id,v_status,p_horas,0,now(),now(),v_aluno.nome,v_curso.titulo,v_res.nota,now(),6,
    false,false,case when v_final=0 then 'ISENTO' else 'AGUARDANDO_PAGAMENTO' end,
    v_valor,v_desconto,v_final,v_coupon_id,nullif(upper(trim(coalesce(p_cupom,''))),''),v_pack.id,
    'ALT-PAG-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    'PROFISSIONAL',(v_calc->>'data_inicio_prevista')::date,(v_calc->>'data_final_prevista')::date,
    (v_calc->>'previsao_liberacao')::date,(v_calc->>'data_inicio_prevista')::date,(v_calc->>'data_final_prevista')::date,
    (v_calc->>'horas_comprometidas_anteriores')::integer,(v_calc->>'capacidade_total_ate_fim')::integer,
    (v_calc->>'horas_faltantes')::integer
  ) returning * into v_cert;

  perform public.recalcular_previsoes_profissionais_v34_3(v_uid);
  select * into v_cert from public.certificados where id=v_cert.id;

  insert into public.certificados_historico(certificado_id,aluno_id,curso_id,acao,status_anterior,status_novo,observacao,realizado_por)
  values(v_cert.id,v_uid,p_curso_id,'SOLICITADO',null,v_cert.status,
    format('Solicitacao de %s horas. Previsao de liberacao: %s.',p_horas,to_char(v_cert.previsao_liberacao,'DD/MM/YYYY')),v_uid);

  return to_jsonb(v_cert)||jsonb_build_object(
    'gratuito_por_cupom',v_coupon_id is not null and v_final=0,
    'previsao_liberacao',v_cert.previsao_liberacao,
    'horas_faltantes',v_cert.horas_faltantes,
    'mensagem','Solicitacao registrada. A liberacao respeitara o limite global de 8 horas por dia.'
  );
end;
$$;

grant execute on function public.solicitar_certificado_profissional_v34_3(bigint,integer,text) to authenticated;

-- Cupom aplicado depois da solicitacao nao emite antes da data nem sem autorizacao.
create or replace function public.aplicar_cupom_certificado_v34(p_certificado_id bigint,p_codigo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cert public.certificados%rowtype; v_result jsonb;
begin
  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if v_cert.id is null then raise exception 'Solicitacao nao encontrada'; end if;
  if v_cert.aluno_id<>auth.uid() and not public.e_gestor(2) then raise exception 'Acesso negado'; end if;
  if upper(coalesce(v_cert.status,''))='EMITIDO' then return to_jsonb(v_cert); end if;
  if v_cert.pagamento_status in('PAGO','ISENTO') then raise exception 'O pagamento desta solicitacao ja foi concluido'; end if;
  if v_cert.pack_aluno_id is not null then raise exception 'Esta solicitacao ja esta incluida em um pack'; end if;
  v_result:=public.validar_cupom_v34(p_codigo,v_cert.aluno_id,'CERTIFICADO',v_cert.valor_base);
  if not coalesce((v_result->>'valido')::boolean,false) then raise exception '%',v_result->>'mensagem'; end if;
  update public.certificados
     set cupom_id=(v_result->>'cupom_id')::bigint,cupom_codigo=v_result->>'codigo',
         desconto=(v_result->>'desconto')::numeric,valor_final=(v_result->>'valor_final')::numeric,
         pagamento_status=case when (v_result->>'valor_final')::numeric=0 then 'ISENTO' else 'AGUARDANDO_PAGAMENTO' end,
         atualizado_em=now()
   where id=v_cert.id returning * into v_cert;
  return to_jsonb(v_cert)||jsonb_build_object('aguarda_data_e_autorizacao',v_cert.valor_final=0);
end;$$;

grant execute on function public.aplicar_cupom_certificado_v34(bigint,text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. AUTORIZACAO + DATA + PAGAMENTO: SO DEPOIS DISSO OCORRE A EMISSAO
-- ----------------------------------------------------------------------------
create or replace function public.emitir_certificado_pronto_v34_3(p_certificado_id bigint,p_realizado_por uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_cert public.certificados%rowtype;
  v_wallet public.carteiras_horas_aluno_v34%rowtype;
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_horas integer;
  v_auto integer;
  v_saldo integer;
  v_codigo uuid;
  v_numero text;
  v_hoje date:=(now() at time zone 'America/Belem')::date;
begin
  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if v_cert.id is null or upper(coalesce(v_cert.status,''))='EMITIDO' then return false; end if;
  if upper(coalesce(v_cert.tipo_curso_snapshot,'PROFISSIONAL'))<>'PROFISSIONAL' then return false; end if;
  if v_cert.autorizado_em is null or v_cert.pagamento_status not in('PAGO','ISENTO') then return false; end if;
  if coalesce(v_cert.previsao_liberacao,v_cert.periodo_fim)>v_hoje then return false; end if;

  select * into v_aluno from public.alunos where user_id=v_cert.aluno_id;
  select * into v_curso from public.cursos where id=v_cert.curso_id;
  if length(regexp_replace(coalesce(v_aluno.cpf,''),'\D','','g'))<>11 then return false; end if;

  insert into public.carteiras_horas_aluno_v34(aluno_id) values(v_cert.aluno_id) on conflict(aluno_id) do nothing;
  select * into v_wallet from public.carteiras_horas_aluno_v34 where aluno_id=v_cert.aluno_id for update;
  v_horas:=greatest(0,coalesce(v_cert.horas_solicitadas,0));
  v_auto:=coalesce(public.horas_automaticas_aluno_v34(v_cert.aluno_id),0);
  v_saldo:=v_auto+coalesce(v_wallet.horas_adicionais,0)-coalesce(v_wallet.horas_reservadas,0)-coalesce(v_wallet.horas_utilizadas,0);
  if v_saldo<v_horas then
    update public.certificados set status='AGUARDANDO_HORAS',horas_faltantes=v_horas-greatest(0,v_saldo),atualizado_em=now() where id=v_cert.id;
    return false;
  end if;

  if v_cert.pack_aluno_id is not null then
    update public.packs_alunos_v34
       set quantidade_utilizada=quantidade_utilizada+1
     where id=v_cert.pack_aluno_id and status_pagamento='PAGO' and quantidade_utilizada<quantidade_adquirida;
    if not found then return false; end if;
  end if;

  if v_cert.cupom_id is not null and not exists(select 1 from public.cupons_usos_v34 where certificado_id=v_cert.id) then
    insert into public.cupons_usos_v34(cupom_id,aluno_id,certificado_id,valor_desconto)
    values(v_cert.cupom_id,v_cert.aluno_id,v_cert.id,v_cert.desconto);
    update public.cupons_v34 set usos_confirmados=usos_confirmados+1,atualizado_em=now() where id=v_cert.cupom_id;
  end if;

  update public.carteiras_horas_aluno_v34
     set horas_reservadas=greatest(0,horas_reservadas-least(horas_reservadas,v_horas)),
         horas_utilizadas=horas_utilizadas+v_horas,
         atualizado_em=now()
   where aluno_id=v_cert.aluno_id returning * into v_wallet;

  v_codigo:=coalesce(v_cert.codigo_validacao,gen_random_uuid());
  v_numero:=coalesce(nullif(v_cert.numero_certificado,''),'ALT-'||to_char(v_hoje,'YYYY')||'-'||upper(substr(replace(v_codigo::text,'-',''),1,10)));

  update public.certificados
     set status='EMITIDO',horas_emitidas=v_horas,codigo_validacao=v_codigo,numero_certificado=v_numero,
         emitido_em=now(),liberado_em=now(),liberado_por=coalesce(p_realizado_por,v_cert.autorizado_por),
         periodo_inicio=coalesce(v_cert.data_inicio_prevista,v_cert.periodo_inicio),
         periodo_fim=coalesce(v_cert.data_final_prevista,v_cert.periodo_fim),
         saldo_processado=true,nome_aluno=coalesce(v_aluno.nome,nome_aluno),nome_curso=coalesce(v_curso.titulo,nome_curso),
         horas_faltantes=0,atualizado_em=now(),versao_pdf=greatest(coalesce(versao_pdf,1),6)
   where id=v_cert.id returning * into v_cert;

  insert into public.movimentacoes_horas_aluno_v34(
    aluno_id,certificado_id,tipo,horas,saldo_automatico,saldo_adicional,saldo_reservado,saldo_utilizado,observacao,realizado_por
  ) values(
    v_cert.aluno_id,v_cert.id,'LIBERACAO_CERTIFICADO',v_horas,v_auto,v_wallet.horas_adicionais,
    v_wallet.horas_reservadas,v_wallet.horas_utilizadas,'Certificado emitido apos data, pagamento e autorizacao.',coalesce(p_realizado_por,v_cert.autorizado_por)
  );

  insert into public.certificados_historico(certificado_id,aluno_id,curso_id,acao,status_anterior,status_novo,observacao,realizado_por)
  values(v_cert.id,v_cert.aluno_id,v_cert.curso_id,'EMITIDO','AUTORIZADO_AGUARDANDO_DATA','EMITIDO','Todos os requisitos foram concluidos.',coalesce(p_realizado_por,v_cert.autorizado_por));
  return true;
end;
$$;

revoke all on function public.emitir_certificado_pronto_v34_3(bigint,uuid) from public;

create or replace function public.processar_certificados_prontos_v34_3()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_count integer:=0;
  r record;
begin
  if v_uid is null then raise exception 'Usuario nao autenticado'; end if;
  for r in
    select c.id
    from public.certificados c
    where upper(coalesce(c.tipo_curso_snapshot,'PROFISSIONAL'))='PROFISSIONAL'
      and upper(coalesce(c.status,'')) in('PENDENTE','AGUARDANDO_HORAS','AUTORIZADO_AGUARDANDO_DATA')
      and c.autorizado_em is not null
      and c.pagamento_status in('PAGO','ISENTO')
      and coalesce(c.previsao_liberacao,c.periodo_fim)<=(now() at time zone 'America/Belem')::date
      and (public.e_gestor(2) or c.aluno_id=v_uid)
    order by c.previsao_liberacao,c.id
  loop
    if public.emitir_certificado_pronto_v34_3(r.id,case when public.e_gestor(2) then v_uid else null end) then
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('emitidos',v_count);
end;
$$;

grant execute on function public.processar_certificados_prontos_v34_3() to authenticated;

create or replace function public.gestor_autorizar_certificado_v34_3(p_certificado_id bigint,p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_cert public.certificados%rowtype;
  v_emitido boolean:=false;
  v_hoje date:=(now() at time zone 'America/Belem')::date;
begin
  if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito a gestao academica'; end if;
  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if v_cert.id is null then raise exception 'Solicitacao nao encontrada'; end if;
  if v_cert.pagamento_status not in('PAGO','ISENTO') then raise exception 'Confirme o pagamento antes de autorizar'; end if;
  if upper(coalesce(v_cert.status,'')) in('CANCELADO','BLOQUEADO') then raise exception 'Reabra a solicitacao antes de autorizar'; end if;

  update public.certificados
     set autorizado_em=now(),autorizado_por=v_uid,autorizacao_observacao=nullif(trim(coalesce(p_observacao,'')),''),
         status=case when coalesce(previsao_liberacao,periodo_fim)>v_hoje then 'AUTORIZADO_AGUARDANDO_DATA' else status end,
         atualizado_em=now()
   where id=p_certificado_id returning * into v_cert;

  v_emitido:=public.emitir_certificado_pronto_v34_3(v_cert.id,v_uid);
  select * into v_cert from public.certificados where id=p_certificado_id;

  insert into public.certificados_historico(certificado_id,aluno_id,curso_id,acao,status_anterior,status_novo,observacao,realizado_por)
  values(v_cert.id,v_cert.aluno_id,v_cert.curso_id,'AUTORIZADO',null,v_cert.status,
    coalesce(nullif(trim(coalesce(p_observacao,'')),''),format('Autorizado. Previsao de liberacao: %s.',to_char(v_cert.previsao_liberacao,'DD/MM/YYYY'))),v_uid);

  return to_jsonb(v_cert)||jsonb_build_object('emitido_agora',v_emitido);
end;
$$;

grant execute on function public.gestor_autorizar_certificado_v34_3(bigint,text) to authenticated;

-- Mantem a assinatura usada pela interface, mas LIBERAR agora significa
-- autorizar; a emissao so ocorre quando data, horas e pagamento estiverem OK.
create or replace function public.gestor_decidir_certificado_v34(
  p_certificado_id bigint,p_acao text,p_observacao text default null,
  p_periodo_inicio date default null,p_periodo_fim date default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid();
  v_acao text:=upper(trim(coalesce(p_acao,'')));
  v_cert public.certificados%rowtype;
  v_status_anterior text;
begin
  if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito a gestao academica'; end if;
  if v_acao='LIBERAR' then return public.gestor_autorizar_certificado_v34_3(p_certificado_id,p_observacao); end if;
  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if v_cert.id is null then raise exception 'Certificado nao encontrado'; end if;
  v_status_anterior:=v_cert.status;

  if v_acao in('BLOQUEAR','CANCELAR') then
    update public.certificados
       set status=case when v_acao='BLOQUEAR' then 'BLOQUEADO' else 'CANCELADO' end,
           autorizado_em=null,autorizado_por=null,autorizacao_observacao=null,
           observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),atualizado_em=now()
     where id=v_cert.id returning * into v_cert;
  elsif v_acao='REABRIR' then
    update public.certificados
       set status='AGUARDANDO_HORAS',observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),atualizado_em=now()
     where id=v_cert.id returning * into v_cert;
  else
    raise exception 'Acao invalida';
  end if;

  perform public.recalcular_previsoes_profissionais_v34_3(v_cert.aluno_id);
  select * into v_cert from public.certificados where id=v_cert.id;
  insert into public.certificados_historico(certificado_id,aluno_id,curso_id,acao,status_anterior,status_novo,observacao,realizado_por)
  values(v_cert.id,v_cert.aluno_id,v_cert.curso_id,v_acao,v_status_anterior,v_cert.status,p_observacao,v_uid);
  return to_jsonb(v_cert);
end;$$;

grant execute on function public.gestor_decidir_certificado_v34(bigint,text,text,date,date) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. CORRECOES RETROATIVAS DE CERTIFICADO - SOMENTE GST-2026-0001
-- ----------------------------------------------------------------------------
create or replace function public.gestor_ajustar_solicitacao_certificado_v34(
  p_certificado_id bigint,
  p_horas integer,
  p_periodo_inicio date default null,
  p_periodo_fim date default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_cert public.certificados%rowtype;
  v_antigo jsonb;
  v_delta integer:=0;
  v_wallet public.carteiras_horas_aluno_v34%rowtype;
  v_auto integer;
  v_saldo integer;
  v_calc jsonb;
begin
  if v_uid is null or not public.e_gestor_especial_v34_3() then
    raise exception 'Somente o gestor GST-2026-0001 pode alterar carga ou periodo retroativo do certificado';
  end if;
  if p_horas<5 or mod(p_horas,5)<>0 then raise exception 'A carga deve ser informada de 5 em 5 horas'; end if;
  if nullif(trim(coalesce(p_observacao,'')),'') is null then raise exception 'Informe a justificativa da alteracao'; end if;
  if p_periodo_inicio is not null and p_periodo_fim is not null and p_periodo_fim<p_periodo_inicio then raise exception 'A data final deve ser posterior ou igual a inicial'; end if;
  if p_periodo_inicio is not null and p_periodo_fim is not null and ((p_periodo_fim-p_periodo_inicio)+1)*8<p_horas then raise exception 'O periodo informado ultrapassa 8 horas por dia'; end if;

  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if v_cert.id is null then raise exception 'Certificado nao encontrado'; end if;
  v_antigo:=to_jsonb(v_cert);

  if upper(coalesce(v_cert.status,''))='EMITIDO' then
    insert into public.carteiras_horas_aluno_v34(aluno_id) values(v_cert.aluno_id) on conflict(aluno_id) do nothing;
    select * into v_wallet from public.carteiras_horas_aluno_v34 where aluno_id=v_cert.aluno_id for update;
    v_delta:=p_horas-coalesce(v_cert.horas_emitidas,v_cert.horas_solicitadas,0);
    v_auto:=coalesce(public.horas_automaticas_aluno_v34(v_cert.aluno_id),0);
    v_saldo:=v_auto+v_wallet.horas_adicionais-v_wallet.horas_reservadas-v_wallet.horas_utilizadas;
    if v_delta>v_saldo then raise exception 'Nao ha horas suficientes para aumentar este certificado em % horas',v_delta; end if;
    if v_wallet.horas_utilizadas+v_delta<0 then raise exception 'A correcao deixaria as horas utilizadas negativas'; end if;
    update public.carteiras_horas_aluno_v34
       set horas_utilizadas=horas_utilizadas+v_delta,atualizado_em=now(),atualizado_por=v_uid
     where aluno_id=v_cert.aluno_id returning * into v_wallet;
  end if;

  if p_periodo_inicio is null or p_periodo_fim is null then
    v_calc:=public.calcular_previsao_certificado_v34_3(v_cert.aluno_id,p_horas,v_cert.id);
  end if;

  update public.certificados
     set horas_solicitadas=p_horas,
         horas_emitidas=case when upper(coalesce(status,''))='EMITIDO' then p_horas else horas_emitidas end,
         periodo_inicio=coalesce(p_periodo_inicio,(v_calc->>'data_inicio_prevista')::date,periodo_inicio),
         periodo_fim=coalesce(p_periodo_fim,(v_calc->>'data_final_prevista')::date,periodo_fim),
         data_inicio_prevista=coalesce(p_periodo_inicio,(v_calc->>'data_inicio_prevista')::date,data_inicio_prevista),
         data_final_prevista=coalesce(p_periodo_fim,(v_calc->>'data_final_prevista')::date,data_final_prevista),
         previsao_liberacao=coalesce(p_periodo_fim,(v_calc->>'previsao_liberacao')::date,previsao_liberacao),
         observacao_gestor=trim(p_observacao),versao_pdf=coalesce(versao_pdf,1)+1,atualizado_em=now()
   where id=v_cert.id returning * into v_cert;

  insert into public.auditoria_especial_v34_3(gestor_id,aluno_id,certificado_id,acao,valor_anterior,valor_novo,justificativa)
  values(v_uid,v_cert.aluno_id,v_cert.id,'CORRIGIR_CERTIFICADO_RETROATIVO',v_antigo,to_jsonb(v_cert),trim(p_observacao));
  insert into public.certificados_historico(certificado_id,aluno_id,curso_id,acao,status_anterior,status_novo,observacao,realizado_por)
  values(v_cert.id,v_cert.aluno_id,v_cert.curso_id,'CORRECAO_RETROATIVA',v_cert.status,v_cert.status,trim(p_observacao),v_uid);

  perform public.recalcular_previsoes_profissionais_v34_3(v_cert.aluno_id);
  return to_jsonb(v_cert);
end;
$$;

grant execute on function public.gestor_ajustar_solicitacao_certificado_v34(bigint,integer,date,date,text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. PROMOCOES: RPC ESTAVEL PARA O PORTAL DO ALUNO
-- ----------------------------------------------------------------------------
create or replace function public.obter_promocoes_aluno_v34_3()
returns setof public.promocoes_v34
language sql
stable
security definer
set search_path=public
as $$
  select p.* from public.promocoes_v34 p
  where p.ativa=true
    and (p.inicio_em is null or now()>=p.inicio_em)
    and (p.fim_em is null or now()<=p.fim_em)
  order by p.prioridade desc,p.criado_em desc;
$$;

grant execute on function public.obter_promocoes_aluno_v34_3() to authenticated;

-- ----------------------------------------------------------------------------
-- 9. RECONCILIACAO INICIAL
-- ----------------------------------------------------------------------------
update public.certificados c
set tipo_curso_snapshot=case when upper(coalesce(cu.tipo_curso,'PROFISSIONAL'))='TECNICO' then 'TECNICO' else 'PROFISSIONAL' end
from public.cursos cu where cu.id=c.curso_id;

do $$ declare r record; begin
  for r in select distinct aluno_id from public.certificados loop
    perform public.recalcular_previsoes_profissionais_v34_3(r.aluno_id);
  end loop;
end $$;

commit;
