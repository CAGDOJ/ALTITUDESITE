-- ALTITUDE V34.1 - carteira global, ajustes negativos e data inicial corrigível
begin;

alter table public.carteiras_horas_aluno_v34
  add column if not exists data_inicio_contagem date;

-- O ajuste da gestão pode ser positivo ou negativo, sempre em múltiplos de 5.
alter table public.carteiras_horas_aluno_v34
  drop constraint if exists carteiras_horas_aluno_v34_horas_adicionais_check;
alter table public.carteiras_horas_aluno_v34
  add constraint carteiras_horas_aluno_v34_horas_adicionais_check
  check (mod(abs(horas_adicionais),5)=0);

create or replace function public.horas_automaticas_aluno_v34(p_aluno_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    (current_date - coalesce(c.data_inicio_contagem, a.criado_em::date) + 1) * 8
  )::integer
  from public.alunos a
  left join public.carteiras_horas_aluno_v34 c on c.aluno_id = a.user_id
  where a.user_id = p_aluno_id;
$$;

create or replace function public.obter_minha_carteira_horas_v34()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.carteiras_horas_aluno_v34%rowtype;
  v_auto integer;
  v_cadastro date;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  insert into public.carteiras_horas_aluno_v34(aluno_id) values(auth.uid()) on conflict(aluno_id) do nothing;
  select * into v from public.carteiras_horas_aluno_v34 where aluno_id=auth.uid();
  select coalesce(v.data_inicio_contagem,a.criado_em::date) into v_cadastro from public.alunos a where a.user_id=auth.uid();
  v_auto := coalesce(public.horas_automaticas_aluno_v34(auth.uid()),0);
  return jsonb_build_object(
    'aluno_id',v.aluno_id,
    'cadastrado_em',v_cadastro,
    'data_inicio_contagem',v_cadastro,
    'horas_automaticas',v_auto,
    'horas_adicionais',v.horas_adicionais,
    'horas_validadas',greatest(0,v_auto+v.horas_adicionais),
    'horas_reservadas',v.horas_reservadas,
    'horas_utilizadas',v.horas_utilizadas,
    'saldo_disponivel',greatest(0,v_auto+v.horas_adicionais-v.horas_reservadas-v.horas_utilizadas),
    'atualizado_em',v.atualizado_em
  );
end;
$$;

create or replace function public.obter_carteiras_horas_gestao_v34()
returns table(
  aluno_id uuid, aluno_nome text, aluno_email text, aluno_ra text, aluno_cpf text,
  cadastrado_em timestamptz, data_inicio_contagem date,
  horas_automaticas integer, horas_adicionais integer,
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
  select
    a.user_id,a.nome,a.email,a.ra,a.cpf,a.criado_em,
    coalesce(c.data_inicio_contagem,a.criado_em::date),
    coalesce(public.horas_automaticas_aluno_v34(a.user_id),0),
    coalesce(c.horas_adicionais,0),
    greatest(0,coalesce(public.horas_automaticas_aluno_v34(a.user_id),0)+coalesce(c.horas_adicionais,0)),
    coalesce(c.horas_reservadas,0),coalesce(c.horas_utilizadas,0),
    greatest(0,coalesce(public.horas_automaticas_aluno_v34(a.user_id),0)+coalesce(c.horas_adicionais,0)-coalesce(c.horas_reservadas,0)-coalesce(c.horas_utilizadas,0)),
    c.justificativa_gestor,c.atualizado_em
  from public.alunos a
  left join public.carteiras_horas_aluno_v34 c on c.aluno_id=a.user_id
  order by a.nome;
end;
$$;

create or replace function public.gestor_ajustar_carteira_aluno_v34(
  p_aluno_id uuid,
  p_horas_adicionais integer,
  p_justificativa text,
  p_data_inicio_contagem date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid:=auth.uid();
  v public.carteiras_horas_aluno_v34%rowtype;
  v_auto integer;
  v_anterior integer:=0;
  v_delta integer:=0;
  v_saldo integer;
begin
  if v_uid is null or not public.e_gestor(2) then raise exception 'Acesso restrito à gestão acadêmica'; end if;
  if mod(abs(coalesce(p_horas_adicionais,0)),5)<>0 then raise exception 'Informe o ajuste em múltiplos de 5 horas'; end if;
  if nullif(trim(coalesce(p_justificativa,'')),'') is null then raise exception 'Informe a justificativa do ajuste'; end if;
  if p_data_inicio_contagem is not null and p_data_inicio_contagem > current_date then raise exception 'A data inicial não pode ser futura'; end if;

  insert into public.carteiras_horas_aluno_v34(aluno_id) values(p_aluno_id) on conflict(aluno_id) do nothing;
  select * into v from public.carteiras_horas_aluno_v34 where aluno_id=p_aluno_id for update;
  v_anterior:=coalesce(v.horas_adicionais,0);

  update public.carteiras_horas_aluno_v34
     set horas_adicionais=coalesce(p_horas_adicionais,0),
         data_inicio_contagem=coalesce(p_data_inicio_contagem,data_inicio_contagem),
         justificativa_gestor=trim(p_justificativa),
         atualizado_por=v_uid,
         atualizado_em=now()
   where aluno_id=p_aluno_id
   returning * into v;

  v_auto:=coalesce(public.horas_automaticas_aluno_v34(p_aluno_id),0);
  v_saldo:=v_auto+v.horas_adicionais-v.horas_reservadas-v.horas_utilizadas;
  if v_saldo < 0 then
    raise exception 'O ajuste deixaria a carteira com saldo negativo';
  end if;

  v_delta:=v.horas_adicionais-v_anterior;
  insert into public.movimentacoes_horas_aluno_v34(
    aluno_id,tipo,horas,saldo_automatico,saldo_adicional,saldo_reservado,saldo_utilizado,observacao,realizado_por
  ) values(
    p_aluno_id,
    case when v_delta<0 then 'RETIRADA_GESTAO' when v_delta>0 then 'ADICAO_GESTAO' else 'CORRECAO_DATA' end,
    v_delta,v_auto,v.horas_adicionais,v.horas_reservadas,v.horas_utilizadas,trim(p_justificativa),v_uid
  );

  return jsonb_build_object(
    'horas_automaticas',v_auto,'horas_adicionais',v.horas_adicionais,
    'horas_validadas',greatest(0,v_auto+v.horas_adicionais),
    'horas_reservadas',v.horas_reservadas,'horas_utilizadas',v.horas_utilizadas,
    'saldo_disponivel',greatest(0,v_saldo),'data_inicio_contagem',v.data_inicio_contagem
  );
end;
$$;

revoke all on function public.gestor_definir_horas_aluno_v34(uuid,integer,text) from authenticated;
grant execute on function public.gestor_ajustar_carteira_aluno_v34(uuid,integer,text,date) to authenticated;

-- Emissão usa a data corrigida da carteira e exige CPF válido.
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
   if length(regexp_replace(coalesce(v_aluno.cpf,''),'\D','','g'))<>11 then raise exception 'Cadastre um CPF válido antes de emitir o certificado'; end if;
   v_inicio:=coalesce(p_periodo_inicio,v_cert.periodo_inicio,(select coalesce(data_inicio_contagem,v_aluno.criado_em::date) from public.carteiras_horas_aluno_v34 where aluno_id=v_cert.aluno_id),v_aluno.criado_em::date);
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

grant execute on function public.gestor_decidir_certificado_v34(bigint,text,text,date,date) to authenticated;


commit;
