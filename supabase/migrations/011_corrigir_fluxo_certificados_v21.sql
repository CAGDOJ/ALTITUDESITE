-- =============================================================================
-- ALTITUDE — CORREÇÃO DO FLUXO DE CERTIFICADOS V21
-- Corrige o status voltando para BLOQUEADO/PENDENTE e restringe RPCs internas.
-- Execute no Supabase: SQL Editor > New query > Run.
-- =============================================================================

begin;

-- 1) REMOVE O TRIGGER ANTIGO QUE SOBRESCREVE QUALQUER DECISÃO DA GESTÃO.
-- Esse trigger recalculava o status pelo pagamento/matrícula em TODO UPDATE,
-- inclusive durante emissão, edição de PDF e liberação automática.
drop trigger if exists trg_sync_certificado_status on public.certificados;

-- A função pode continuar instalada sem efeito, para não quebrar migrations antigas.
comment on function public.sync_certificado_status() is
  'FUNÇÃO LEGADA V21: trigger removido porque conflitava com o fluxo de horas e liberação da gestão.';

-- 2) A FUNÇÃO AUTOMÁTICA DEVE SER EXECUTADA PELO CRON/SERVICE ROLE,
-- não pelo navegador do aluno nem pelo usuário anônimo.
revoke all privileges on function public.processar_certificados_automaticos_v15()
  from public, anon, authenticated;
grant execute on function public.processar_certificados_automaticos_v15()
  to service_role;

-- 3) A EMISSÃO DE BAIXO NÍVEL NÃO PODE SER CHAMADA DIRETAMENTE PELO NAVEGADOR.
-- Gestores continuam usando as funções gestor_* que validam e_gestor().
revoke all privileges on function public.altitude_emitir_certificado_v15(bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.altitude_emitir_certificado_v15(bigint, uuid, text)
  to service_role;

-- 4) A FILA DE E-MAIL TAMBÉM FICA RESTRITA A ROTINAS INTERNAS.
revoke all privileges on function public.altitude_enfileirar_email_v16(text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.altitude_enfileirar_email_v16(text, text, text, text, jsonb, text)
  to service_role;

-- 5) VALIDAÇÃO PÚBLICA SEM EXPOR OBSERVAÇÃO INTERNA DA GESTÃO.
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
    return jsonb_build_object(
      'encontrado', false,
      'valido', false,
      'mensagem', 'Certificado não encontrado na base oficial do Instituto Altitude.'
    );
  end if;

  v_valido := v_cert.status = 'EMITIDO'
    and coalesce(v_cert.horas_emitidas, 0) > 0
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
    'mensagem', case
      when v_valido then 'Certificado autêntico e válido.'
      else 'O registro existe, mas o certificado não está válido.'
    end
  );
end;
$$;

revoke all privileges on function public.validar_certificado(text) from public;
grant execute on function public.validar_certificado(text) to anon, authenticated;

commit;

-- =============================================================================
-- RESULTADO DE CONFERÊNCIA
-- O certificado informado anteriormente não apareceu no diagnóstico pelo número
-- exato. Esta consulta mostra os registros mais recentes para localizar o correto.
-- =============================================================================
select
  c.id,
  c.numero_certificado,
  c.codigo_validacao,
  c.status,
  c.modo_liberacao,
  c.horas_solicitadas,
  c.horas_emitidas,
  c.saldo_processado,
  c.emitido_em,
  c.liberado_em,
  c.liberar_em,
  c.nome_aluno,
  c.nome_curso,
  c.atualizado_em
from public.certificados c
order by c.id desc
limit 50;
