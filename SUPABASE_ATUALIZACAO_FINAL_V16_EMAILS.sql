-- =============================================================================
-- ALTITUDE — ATUALIZAÇÃO FINAL V16
-- Notificações por e-mail de chamados e certificados.
-- Execute após a V15. Pode ser executada mais de uma vez.
-- =============================================================================

begin;

-- Garante os campos usados pelas notificações, mesmo em bancos parcialmente atualizados.
alter table public.chamados
  add column if not exists ultima_resposta text,
  add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists public.email_notificacoes (
  id bigint generated always as identity primary key,
  destinatario text not null,
  nome_destinatario text,
  evento text not null,
  assunto text not null,
  dados jsonb not null default '{}'::jsonb,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE','PROCESSANDO','ENVIADO','ERRO','CANCELADO')),
  tentativas integer not null default 0,
  deduplicacao text unique,
  provedor_id text,
  ultimo_erro text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  enviado_em timestamp with time zone
);

create index if not exists email_notificacoes_status_idx
  on public.email_notificacoes(status, criado_em);

alter table public.email_notificacoes enable row level security;

drop policy if exists gestor_le_email_notificacoes_v16 on public.email_notificacoes;
create policy gestor_le_email_notificacoes_v16
  on public.email_notificacoes for select to authenticated
  using (public.e_gestor(2));

grant select on public.email_notificacoes to authenticated;

create or replace function public.altitude_email_gestao_v16()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select lower(trim(g.email))
       from public.gestores g
      where g.status = 'ATIVO'
        and nullif(trim(g.email),'') is not null
      order by g.nivel_acesso desc, g.criado_em asc
      limit 1),
    'altitudesecretaria@gmail.com'
  );
$$;

create or replace function public.altitude_enfileirar_email_v16(
  p_destinatario text,
  p_nome text,
  p_evento text,
  p_assunto text,
  p_dados jsonb,
  p_deduplicacao text
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id bigint;
begin
  if nullif(trim(coalesce(p_destinatario,'')),'') is null then
    return null;
  end if;

  insert into public.email_notificacoes(
    destinatario,nome_destinatario,evento,assunto,dados,deduplicacao
  ) values(
    lower(trim(p_destinatario)),nullif(trim(coalesce(p_nome,'')),''),
    upper(trim(p_evento)),trim(p_assunto),coalesce(p_dados,'{}'::jsonb),
    nullif(trim(coalesce(p_deduplicacao,'')),'')
  )
  on conflict(deduplicacao) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- Novo chamado: avisa a gestão.
create or replace function public.trg_email_novo_chamado_v16()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_aluno public.alunos%rowtype;
begin
  select * into v_aluno from public.alunos where user_id = new.aluno_id;
  perform public.altitude_enfileirar_email_v16(
    public.altitude_email_gestao_v16(),
    'SECRETARIA ALTITUDE',
    'CHAMADO_ABERTO_GESTAO',
    'Novo chamado no Portal Altitude — ' || coalesce(new.protocolo, new.id::text),
    jsonb_build_object(
      'protocolo',coalesce(new.protocolo,new.id::text),
      'aluno',coalesce(v_aluno.nome,'ALUNO'),
      'assunto',new.assunto,
      'mensagem',new.mensagem,
      'status',new.status
    ),
    format('chamado-aberto-%s',new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_email_novo_chamado_v16 on public.chamados;
create trigger trg_email_novo_chamado_v16
after insert on public.chamados
for each row execute function public.trg_email_novo_chamado_v16();

-- Mudança de status/resposta: avisa o aluno.
create or replace function public.trg_email_chamado_atualizado_v16()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_aluno public.alunos%rowtype;
  v_stamp text;
begin
  if coalesce(new.status,'') is not distinct from coalesce(old.status,'')
     and coalesce(new.ultima_resposta,'') is not distinct from coalesce(old.ultima_resposta,'')
     and coalesce(new.prioridade,'') is not distinct from coalesce(old.prioridade,'') then
    return new;
  end if;

  select * into v_aluno from public.alunos where user_id = new.aluno_id;
  v_stamp := to_char(coalesce(new.atualizado_em,now()),'YYYYMMDDHH24MISSMS');

  perform public.altitude_enfileirar_email_v16(
    v_aluno.email,
    v_aluno.nome,
    'CHAMADO_ATUALIZADO_ALUNO',
    'Atualização do chamado ' || coalesce(new.protocolo,new.id::text),
    jsonb_build_object(
      'protocolo',coalesce(new.protocolo,new.id::text),
      'status',new.status,
      'mensagem',coalesce(new.ultima_resposta,''),
      'prioridade',new.prioridade
    ),
    format('chamado-atualizado-%s-%s',new.id,v_stamp)
  );
  return new;
end;
$$;

drop trigger if exists trg_email_chamado_atualizado_v16 on public.chamados;
create trigger trg_email_chamado_atualizado_v16
after update on public.chamados
for each row execute function public.trg_email_chamado_atualizado_v16();

-- Mudança de certificado: avisa o aluno.
create or replace function public.trg_email_certificado_v16()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_evento text;
  v_assunto text;
  v_horas integer;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_aluno from public.alunos where user_id = new.aluno_id;
  select * into v_curso from public.cursos where id = new.curso_id;
  v_horas := greatest(0,coalesce(nullif(new.horas_emitidas,0),nullif(new.horas_solicitadas,0),0));

  case upper(coalesce(new.status,''))
    when 'AGUARDANDO_HORAS' then
      v_evento := 'CERTIFICADO_EM_CONTAGEM';
      v_assunto := 'Contagem de horas autorizada — ' || coalesce(v_curso.titulo,new.nome_curso,'Curso');
    when 'EMITIDO' then
      v_evento := 'CERTIFICADO_EMITIDO';
      v_assunto := 'Certificado liberado — ' || coalesce(v_curso.titulo,new.nome_curso,'Curso');
    when 'BLOQUEADO' then
      v_evento := 'CERTIFICADO_BLOQUEADO';
      v_assunto := 'Atualização do certificado — ' || coalesce(v_curso.titulo,new.nome_curso,'Curso');
    when 'CANCELADO' then
      v_evento := 'CERTIFICADO_CANCELADO';
      v_assunto := 'Solicitação de certificado cancelada — ' || coalesce(v_curso.titulo,new.nome_curso,'Curso');
    else
      return new;
  end case;

  perform public.altitude_enfileirar_email_v16(
    v_aluno.email,
    v_aluno.nome,
    v_evento,
    v_assunto,
    jsonb_build_object(
      'curso',coalesce(v_curso.titulo,new.nome_curso,'Curso'),
      'status',new.status,
      'horas',v_horas,
      'mensagem',coalesce(new.observacao_gestor,''),
      'numero_certificado',new.numero_certificado,
      'liberar_em',new.liberar_em
    ),
    format('certificado-%s-%s-%s',new.id,lower(new.status),to_char(coalesce(new.atualizado_em,now()),'YYYYMMDDHH24MISSMS'))
  );
  return new;
end;
$$;

drop trigger if exists trg_email_certificado_v16 on public.certificados;
create trigger trg_email_certificado_v16
after insert or update on public.certificados
for each row execute function public.trg_email_certificado_v16();

-- Realtime para o gestor consultar o histórico de envios sem recarregar.
do $$
begin
  begin
    alter publication supabase_realtime add table public.email_notificacoes;
  exception when duplicate_object then null;
  end;
end $$;

commit;

select 'Atualização final V16 de e-mails aplicada com sucesso' as resultado;
