-- =============================================================================
-- ALTITUDE V34.2 — AJUSTES FINAIS
-- Cupom integral com emissão automática, exclusão administrativa segura de
-- certificado e reconciliação de solicitações contraditórias.
-- Execute depois das migrations 018 e 019 CORRIGIDA.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. AUDITORIA INDEPENDENTE DA EXCLUSÃO DE CERTIFICADOS
-- -----------------------------------------------------------------------------
create table if not exists public.certificados_exclusoes_v34_2 (
  id bigint generated always as identity primary key,
  certificado_id_original bigint not null,
  aluno_id uuid not null,
  curso_id bigint not null,
  status_anterior text not null,
  horas_devolvidas integer not null default 0,
  numero_certificado text,
  codigo_validacao uuid,
  motivo text not null,
  dados_certificado jsonb not null,
  excluido_por uuid not null references auth.users(id),
  excluido_em timestamptz not null default now()
);

create index if not exists certificados_exclusoes_v34_2_aluno_idx
  on public.certificados_exclusoes_v34_2(aluno_id, excluido_em desc);
create index if not exists certificados_exclusoes_v34_2_codigo_idx
  on public.certificados_exclusoes_v34_2(numero_certificado);

alter table public.certificados_exclusoes_v34_2 enable row level security;
drop policy if exists gestor_le_certificados_exclusoes_v34_2
  on public.certificados_exclusoes_v34_2;
create policy gestor_le_certificados_exclusoes_v34_2
  on public.certificados_exclusoes_v34_2
  for select to authenticated
  using (public.e_gestor(4));

grant select on public.certificados_exclusoes_v34_2 to authenticated;

do $$
begin
  if to_regclass('public.certificados_exclusoes_v34_2_id_seq') is not null then
    execute 'grant usage, select on sequence public.certificados_exclusoes_v34_2_id_seq to authenticated';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. EMISSÃO AUTOMÁTICA EXCLUSIVA PARA CUPOM QUE ZERA O CERTIFICADO
-- -----------------------------------------------------------------------------
create or replace function public.emitir_certificado_cupom_automatico_v34_2(
  p_certificado_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cert public.certificados%rowtype;
  v_wallet public.carteiras_horas_aluno_v34%rowtype;
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_horas integer;
  v_auto integer;
  v_inicio date;
  v_fim date;
  v_codigo uuid;
  v_numero text;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;

  if v_cert.id is null then
    raise exception 'Solicitação não encontrada';
  end if;
  if v_cert.aluno_id <> v_uid and not public.e_gestor(2) then
    raise exception 'Acesso negado';
  end if;
  if upper(coalesce(v_cert.status, '')) = 'EMITIDO' then
    return to_jsonb(v_cert);
  end if;
  if upper(coalesce(v_cert.status, '')) not in ('PENDENTE','AGUARDANDO_HORAS') then
    raise exception 'A solicitação não está disponível para emissão automática';
  end if;
  if v_cert.cupom_id is null
     or upper(coalesce(v_cert.pagamento_status, '')) <> 'ISENTO'
     or coalesce(v_cert.valor_final, 0) <> 0 then
    raise exception 'A emissão automática exige um cupom válido que zere integralmente o certificado';
  end if;
  if exists (
    select 1 from public.certificados c
    where c.aluno_id = v_cert.aluno_id
      and c.curso_id = v_cert.curso_id
      and c.id <> v_cert.id
      and upper(coalesce(c.status,'')) = 'EMITIDO'
  ) then
    raise exception 'Este curso já possui certificado emitido';
  end if;

  select * into v_aluno from public.alunos where user_id = v_cert.aluno_id;
  select * into v_curso from public.cursos where id = v_cert.curso_id;
  if v_aluno.user_id is null or v_curso.id is null then
    raise exception 'Dados do aluno ou do curso não encontrados';
  end if;
  if length(regexp_replace(coalesce(v_aluno.cpf,''),'\D','','g')) <> 11 then
    raise exception 'Cadastre um CPF válido antes de emitir o certificado';
  end if;

  insert into public.carteiras_horas_aluno_v34(aluno_id)
  values(v_cert.aluno_id)
  on conflict(aluno_id) do nothing;
  select * into v_wallet
  from public.carteiras_horas_aluno_v34
  where aluno_id = v_cert.aluno_id
  for update;

  v_horas := greatest(0, coalesce(v_cert.horas_solicitadas, 0));
  if v_horas < 5 or mod(v_horas, 5) <> 0 then
    raise exception 'A carga solicitada precisa ser informada de 5 em 5 horas';
  end if;
  if v_wallet.horas_reservadas < v_horas then
    raise exception 'Reserva de horas não encontrada';
  end if;

  v_auto := coalesce(public.horas_automaticas_aluno_v34(v_cert.aluno_id), 0);
  v_inicio := coalesce(
    v_cert.periodo_inicio,
    v_wallet.data_inicio_contagem,
    v_aluno.criado_em::date
  );
  v_fim := coalesce(
    v_cert.periodo_fim,
    v_inicio + greatest(0, ceil(v_horas / 8.0)::integer - 1)
  );
  if v_fim > current_date then v_fim := current_date; end if;
  if v_inicio > v_fim then v_inicio := v_fim; end if;
  if ((v_fim - v_inicio) + 1) * 8 < v_horas and coalesce(v_wallet.horas_adicionais,0) = 0 then
    raise exception 'O período disponível ainda não comporta a carga solicitada no limite de 8 horas por dia';
  end if;

  v_codigo := coalesce(v_cert.codigo_validacao, gen_random_uuid());
  v_numero := coalesce(
    nullif(v_cert.numero_certificado,''),
    'ALT-' || to_char(current_date,'YYYY') || '-' ||
    upper(substr(replace(v_codigo::text,'-',''),1,10))
  );

  if not exists (
    select 1 from public.cupons_usos_v34 where certificado_id = v_cert.id
  ) then
    insert into public.cupons_usos_v34(
      cupom_id, aluno_id, certificado_id, valor_desconto
    ) values(
      v_cert.cupom_id, v_cert.aluno_id, v_cert.id, v_cert.desconto
    );
    update public.cupons_v34
       set usos_confirmados = usos_confirmados + 1,
           atualizado_em = now()
     where id = v_cert.cupom_id;
  end if;

  update public.carteiras_horas_aluno_v34
     set horas_reservadas = horas_reservadas - v_horas,
         horas_utilizadas = horas_utilizadas + v_horas,
         atualizado_em = now()
   where aluno_id = v_cert.aluno_id
   returning * into v_wallet;

  update public.certificados
     set status = 'EMITIDO',
         horas_emitidas = v_horas,
         codigo_validacao = v_codigo,
         numero_certificado = v_numero,
         emitido_em = now(),
         liberado_em = now(),
         liberado_por = null,
         periodo_inicio = v_inicio,
         periodo_fim = v_fim,
         saldo_processado = true,
         nome_aluno = coalesce(v_aluno.nome, nome_aluno),
         nome_curso = coalesce(v_curso.titulo, nome_curso),
         pagamento_status = 'ISENTO',
         pagamento_confirmado_em = now(),
         pagamento_confirmado_por = null,
         pagamento_observacao = 'Gratuito por cupom integral. Liberação automática.',
         observacao_gestor = 'Emitido automaticamente por cupom integral.',
         atualizado_em = now(),
         versao_pdf = 5
   where id = v_cert.id
   returning * into v_cert;

  insert into public.movimentacoes_horas_aluno_v34(
    aluno_id, certificado_id, tipo, horas,
    saldo_automatico, saldo_adicional, saldo_reservado, saldo_utilizado,
    observacao, realizado_por
  ) values(
    v_cert.aluno_id, v_cert.id, 'LIBERACAO_AUTOMATICA_CUPOM', v_horas,
    v_auto, v_wallet.horas_adicionais, v_wallet.horas_reservadas, v_wallet.horas_utilizadas,
    'Certificado emitido gratuitamente e de forma automática por cupom integral.',
    v_uid
  );

  return to_jsonb(v_cert) || jsonb_build_object(
    'liberacao_automatica', true,
    'gratuito_por_cupom', true
  );
end;
$$;

revoke all on function public.emitir_certificado_cupom_automatico_v34_2(bigint) from public;
grant execute on function public.emitir_certificado_cupom_automatico_v34_2(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. SOLICITAÇÃO: CUPOM É VALIDADO ANTES E, SE ZERAR, EMITE AUTOMATICAMENTE
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_certificado_curso_v34(
  p_curso_id bigint,
  p_horas integer,
  p_cupom text default null
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
  v_mat public.matriculas%rowtype;
  v_res public.resultados_provas%rowtype;
  v_wallet public.carteiras_horas_aluno_v34%rowtype;
  v_auto integer;
  v_saldo integer;
  v_cert public.certificados%rowtype;
  v_cfg public.configuracoes_comerciais_v34%rowtype;
  v_valor numeric(12,2);
  v_final numeric(12,2);
  v_desconto numeric(12,2) := 0;
  v_coupon jsonb;
  v_coupon_id bigint;
  v_pack public.packs_alunos_v34%rowtype;
  v_auto_result jsonb;
begin
  if v_uid is null then raise exception 'Usuário não autenticado'; end if;
  if p_horas < 5 or mod(p_horas,5) <> 0 then
    raise exception 'Escolha uma quantidade de horas de 5 em 5';
  end if;

  select * into v_aluno from public.alunos where user_id = v_uid;
  select * into v_curso from public.cursos where id = p_curso_id;
  if v_curso.id is null then raise exception 'Curso não encontrado'; end if;

  select * into v_mat
  from public.matriculas
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and progresso >= 100
    and status in ('ATIVA','CONCLUIDA')
  order by criada_em
  limit 1;
  if v_mat.id is null then raise exception 'Curso ainda não foi concluído'; end if;

  select * into v_res
  from public.resultados_provas
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and aprovado = true
    and nota >= coalesce(v_curso.nota_minima,70)
  order by nota desc, criado_em desc
  limit 1;
  if v_res.id is null then raise exception 'Aprovação na prova ainda não registrada'; end if;

  if exists (
    select 1 from public.certificados
    where aluno_id = v_uid and curso_id = p_curso_id
      and upper(coalesce(status,'')) = 'EMITIDO'
  ) then
    raise exception 'Este curso já possui certificado emitido';
  end if;
  if exists (
    select 1 from public.certificados
    where aluno_id = v_uid and curso_id = p_curso_id
      and upper(coalesce(status,'')) in ('PENDENTE','AGUARDANDO_HORAS')
  ) then
    raise exception 'Já existe uma solicitação deste curso aguardando decisão';
  end if;

  insert into public.carteiras_horas_aluno_v34(aluno_id)
  values(v_uid) on conflict(aluno_id) do nothing;
  select * into v_wallet
  from public.carteiras_horas_aluno_v34
  where aluno_id = v_uid
  for update;

  v_auto := coalesce(public.horas_automaticas_aluno_v34(v_uid),0);
  v_saldo := v_auto + v_wallet.horas_adicionais - v_wallet.horas_reservadas - v_wallet.horas_utilizadas;
  if p_horas > v_saldo then
    raise exception 'Saldo insuficiente. Disponível: % horas', greatest(0,v_saldo);
  end if;

  select * into v_cfg from public.configuracoes_comerciais_v34 where id = 1;
  v_valor := case when coalesce(v_cfg.cobranca_ativa,true) then coalesce(v_cfg.valor_certificado,0) else 0 end;
  v_final := v_valor;

  select pa.* into v_pack
  from public.packs_alunos_v34 pa
  where pa.aluno_id = v_uid
    and pa.status_pagamento = 'PAGO'
    and pa.quantidade_utilizada + (
      select count(*)::integer
      from public.certificados c
      where c.pack_aluno_id = pa.id
        and upper(coalesce(c.status,'')) in ('PENDENTE','AGUARDANDO_HORAS')
    ) < pa.quantidade_adquirida
  order by pa.criado_em
  limit 1
  for update;

  if v_pack.id is not null then
    v_final := 0;
  elsif nullif(trim(coalesce(p_cupom,'')),'') is not null then
    v_coupon := public.validar_cupom_v34(p_cupom,v_uid,'CERTIFICADO',v_valor);
    if not coalesce((v_coupon->>'valido')::boolean,false) then
      raise exception '%', v_coupon->>'mensagem';
    end if;
    v_coupon_id := (v_coupon->>'cupom_id')::bigint;
    v_desconto := (v_coupon->>'desconto')::numeric;
    v_final := (v_coupon->>'valor_final')::numeric;
  end if;

  insert into public.certificados(
    aluno_id, curso_id, matricula_id, status,
    horas_solicitadas, horas_emitidas, criado_em, solicitado_em,
    nome_aluno, nome_curso, nota_final, atualizado_em, versao_pdf,
    saldo_processado, liberacao_excepcional,
    pagamento_status, valor_base, desconto, valor_final,
    cupom_id, cupom_codigo, pack_aluno_id, protocolo_pagamento
  ) values(
    v_uid, p_curso_id, v_mat.id, 'PENDENTE',
    p_horas, 0, now(), now(),
    v_aluno.nome, v_curso.titulo, v_res.nota, now(), 5,
    false, false,
    case when v_final = 0 then 'ISENTO' else 'AGUARDANDO_PAGAMENTO' end,
    v_valor, v_desconto, v_final,
    v_coupon_id, nullif(upper(trim(coalesce(p_cupom,''))),''), v_pack.id,
    'ALT-PAG-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
  ) returning * into v_cert;

  update public.carteiras_horas_aluno_v34
     set horas_reservadas = horas_reservadas + p_horas,
         atualizado_em = now()
   where aluno_id = v_uid
   returning * into v_wallet;

  insert into public.movimentacoes_horas_aluno_v34(
    aluno_id, certificado_id, tipo, horas,
    saldo_automatico, saldo_adicional, saldo_reservado, saldo_utilizado,
    observacao, realizado_por
  ) values(
    v_uid, v_cert.id, 'RESERVA_SOLICITACAO', -p_horas,
    v_auto, v_wallet.horas_adicionais, v_wallet.horas_reservadas, v_wallet.horas_utilizadas,
    format('Reserva de %s horas para solicitação de certificado.',p_horas), v_uid
  );

  -- Somente cupom integral gera emissão automática. Pack continua seguindo o
  -- fluxo acadêmico/pagamento já existente.
  if v_coupon_id is not null and v_final = 0 then
    begin
      v_auto_result := public.emitir_certificado_cupom_automatico_v34_2(v_cert.id);
      return v_auto_result;
    exception when others then
      -- O cupom continua aplicado e a solicitação permanece gratuita. A emissão
      -- será concluída assim que o dado obrigatório indicado for corrigido.
      return jsonb_build_object(
        'certificado_id',v_cert.id,
        'status','PENDENTE',
        'pagamento_status','ISENTO',
        'horas_solicitadas',p_horas,
        'valor_base',v_valor,
        'desconto',v_desconto,
        'valor_final',v_final,
        'protocolo_pagamento',v_cert.protocolo_pagamento,
        'emissao_automatica_pendente',true,
        'mensagem',sqlerrm
      );
    end;
  end if;

  return jsonb_build_object(
    'certificado_id',v_cert.id,
    'status',v_cert.status,
    'pagamento_status',v_cert.pagamento_status,
    'horas_solicitadas',p_horas,
    'valor_base',v_valor,
    'desconto',v_desconto,
    'valor_final',v_final,
    'protocolo_pagamento',v_cert.protocolo_pagamento,
    'saldo_disponivel',v_auto + v_wallet.horas_adicionais - v_wallet.horas_reservadas - v_wallet.horas_utilizadas
  );
end;
$$;

grant execute on function public.solicitar_certificado_curso_v34(bigint,integer,text) to authenticated;

create or replace function public.aplicar_cupom_certificado_v34(
  p_certificado_id bigint,
  p_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert public.certificados%rowtype;
  v_result jsonb;
begin
  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;

  if v_cert.id is null then raise exception 'Solicitação não encontrada'; end if;
  if v_cert.aluno_id <> auth.uid() and not public.e_gestor(2) then raise exception 'Acesso negado'; end if;
  if upper(coalesce(v_cert.status,'')) = 'EMITIDO' then return to_jsonb(v_cert); end if;
  if v_cert.pagamento_status in ('PAGO','ISENTO') then raise exception 'O pagamento desta solicitação já foi concluído'; end if;
  if v_cert.pack_aluno_id is not null then raise exception 'Esta solicitação já está incluída em um pack'; end if;

  v_result := public.validar_cupom_v34(p_codigo,v_cert.aluno_id,'CERTIFICADO',v_cert.valor_base);
  if not coalesce((v_result->>'valido')::boolean,false) then
    raise exception '%',v_result->>'mensagem';
  end if;

  update public.certificados
     set cupom_id = (v_result->>'cupom_id')::bigint,
         cupom_codigo = v_result->>'codigo',
         desconto = (v_result->>'desconto')::numeric,
         valor_final = (v_result->>'valor_final')::numeric,
         pagamento_status = case when (v_result->>'valor_final')::numeric = 0 then 'ISENTO' else 'AGUARDANDO_PAGAMENTO' end,
         atualizado_em = now()
   where id = v_cert.id
   returning * into v_cert;

  if v_cert.cupom_id is not null and v_cert.valor_final = 0 then
    begin
      return public.emitir_certificado_cupom_automatico_v34_2(v_cert.id);
    exception when others then
      return jsonb_build_object(
        'certificado_id',v_cert.id,
        'status',v_cert.status,
        'cupom_codigo',v_cert.cupom_codigo,
        'desconto',v_cert.desconto,
        'valor_final',v_cert.valor_final,
        'pagamento_status','ISENTO',
        'emissao_automatica_pendente',true,
        'mensagem',sqlerrm
      );
    end;
  end if;

  return jsonb_build_object(
    'certificado_id',v_cert.id,
    'status',v_cert.status,
    'cupom_codigo',v_cert.cupom_codigo,
    'desconto',v_cert.desconto,
    'valor_final',v_cert.valor_final,
    'pagamento_status',v_cert.pagamento_status
  );
end;
$$;

grant execute on function public.aplicar_cupom_certificado_v34(bigint,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. EXCLUSÃO DEFINITIVA PELO GESTOR NÍVEL 4, COM DEVOLUÇÃO SEGURA DAS HORAS
-- -----------------------------------------------------------------------------
create or replace function public.gestor_excluir_certificado_v34_2(
  p_certificado_id bigint,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cert public.certificados%rowtype;
  v_wallet public.carteiras_horas_aluno_v34%rowtype;
  v_horas integer := 0;
  v_devolvidas integer := 0;
  v_auto integer := 0;
  v_havia_uso_cupom boolean := false;
begin
  if v_uid is null or not public.e_gestor(4) then
    raise exception 'A exclusão definitiva exige gestor com nível 4';
  end if;
  if nullif(trim(coalesce(p_motivo,'')),'') is null then
    raise exception 'Informe a justificativa da exclusão';
  end if;

  select * into v_cert
  from public.certificados
  where id = p_certificado_id
  for update;
  if v_cert.id is null then raise exception 'Certificado não encontrado'; end if;

  insert into public.carteiras_horas_aluno_v34(aluno_id)
  values(v_cert.aluno_id) on conflict(aluno_id) do nothing;
  select * into v_wallet
  from public.carteiras_horas_aluno_v34
  where aluno_id = v_cert.aluno_id
  for update;

  v_auto := coalesce(public.horas_automaticas_aluno_v34(v_cert.aluno_id),0);

  if coalesce(v_cert.saldo_processado,false) and coalesce(v_cert.horas_emitidas,0) > 0 then
    v_horas := greatest(0,v_cert.horas_emitidas);
    v_devolvidas := least(v_wallet.horas_utilizadas,v_horas);
    update public.carteiras_horas_aluno_v34
       set horas_utilizadas = greatest(0,horas_utilizadas - v_devolvidas),
           atualizado_em = now()
     where aluno_id = v_cert.aluno_id
     returning * into v_wallet;

    if v_cert.pack_aluno_id is not null then
      update public.packs_alunos_v34
         set quantidade_utilizada = greatest(0,quantidade_utilizada - 1)
       where id = v_cert.pack_aluno_id;
    end if;
  elsif upper(coalesce(v_cert.status,'')) in ('PENDENTE','AGUARDANDO_HORAS') then
    v_horas := greatest(0,coalesce(v_cert.horas_solicitadas,0));
    v_devolvidas := least(v_wallet.horas_reservadas,v_horas);
    update public.carteiras_horas_aluno_v34
       set horas_reservadas = greatest(0,horas_reservadas - v_devolvidas),
           atualizado_em = now()
     where aluno_id = v_cert.aluno_id
     returning * into v_wallet;
  end if;

  select exists(
    select 1 from public.cupons_usos_v34 where certificado_id = v_cert.id
  ) into v_havia_uso_cupom;

  if v_havia_uso_cupom and v_cert.cupom_id is not null then
    delete from public.cupons_usos_v34 where certificado_id = v_cert.id;
    update public.cupons_v34
       set usos_confirmados = greatest(0,usos_confirmados - 1),
           atualizado_em = now()
     where id = v_cert.cupom_id;
  end if;

  insert into public.certificados_exclusoes_v34_2(
    certificado_id_original, aluno_id, curso_id, status_anterior,
    horas_devolvidas, numero_certificado, codigo_validacao,
    motivo, dados_certificado, excluido_por
  ) values(
    v_cert.id, v_cert.aluno_id, v_cert.curso_id, coalesce(v_cert.status,'DESCONHECIDO'),
    v_devolvidas, v_cert.numero_certificado, v_cert.codigo_validacao,
    trim(p_motivo), to_jsonb(v_cert), v_uid
  );

  if v_devolvidas > 0 then
    insert into public.movimentacoes_horas_aluno_v34(
      aluno_id, certificado_id, tipo, horas,
      saldo_automatico, saldo_adicional, saldo_reservado, saldo_utilizado,
      observacao, realizado_por
    ) values(
      v_cert.aluno_id, v_cert.id, 'EXCLUSAO_CERTIFICADO', v_devolvidas,
      v_auto, v_wallet.horas_adicionais, v_wallet.horas_reservadas, v_wallet.horas_utilizadas,
      'Certificado excluído pela gestão. ' || trim(p_motivo), v_uid
    );
  end if;

  delete from public.certificados where id = v_cert.id;

  return jsonb_build_object(
    'ok',true,
    'certificado_id',p_certificado_id,
    'horas_devolvidas',v_devolvidas,
    'mensagem','Certificado excluído, código invalidado e saldo reconciliado.'
  );
end;
$$;

revoke all on function public.gestor_excluir_certificado_v34_2(bigint,text) from public;
grant execute on function public.gestor_excluir_certificado_v34_2(bigint,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. RECONCILIA REGISTROS ANTIGOS CONTRADITÓRIOS
-- Quando há certificado emitido para o curso, solicitações antigas não processadas
-- deixam de aparecer como pendentes ou bloqueadas.
-- -----------------------------------------------------------------------------
with stale as (
  select c.id,c.aluno_id,greatest(0,coalesce(c.horas_solicitadas,0)) as horas
  from public.certificados c
  where upper(coalesce(c.status,'')) in ('PENDENTE','AGUARDANDO_HORAS','BLOQUEADO')
    and coalesce(c.saldo_processado,false) = false
    and exists (
      select 1 from public.certificados e
      where e.aluno_id = c.aluno_id
        and e.curso_id = c.curso_id
        and e.id <> c.id
        and upper(coalesce(e.status,'')) = 'EMITIDO'
    )
), sums as (
  select aluno_id,sum(horas)::integer as total_horas
  from stale
  where horas > 0
  group by aluno_id
)
update public.carteiras_horas_aluno_v34 w
   set horas_reservadas = greatest(0,w.horas_reservadas - least(w.horas_reservadas,s.total_horas)),
       atualizado_em = now()
  from sums s
 where w.aluno_id = s.aluno_id;

update public.certificados c
   set status = 'CANCELADO',
       observacao_gestor = coalesce(nullif(c.observacao_gestor,''),'Solicitação encerrada porque já existe certificado emitido para este curso.'),
       atualizado_em = now()
 where upper(coalesce(c.status,'')) in ('PENDENTE','AGUARDANDO_HORAS','BLOQUEADO')
   and coalesce(c.saldo_processado,false) = false
   and exists (
     select 1 from public.certificados e
     where e.aluno_id = c.aluno_id
       and e.curso_id = c.curso_id
       and e.id <> c.id
       and upper(coalesce(e.status,'')) = 'EMITIDO'
   );

commit;

select 'ALTITUDE V34.2 aplicada com sucesso' as resultado;
