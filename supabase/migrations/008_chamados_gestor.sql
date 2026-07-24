-- =============================================================================
-- ALTITUDE - ATUALIZACAO 08
-- CORRECAO COMPLETA DO ATENDIMENTO / CHAMADOS NO PORTAL DO GESTOR
-- Pode ser executada mais de uma vez.
-- =============================================================================

begin;

-- 1. Estrutura minima e compatibilidade com bancos anteriores.
alter table public.chamados
  add column if not exists categoria text default 'OUTRO',
  add column if not exists atualizado_em timestamp with time zone not null default now(),
  add column if not exists prioridade_definida_por uuid,
  add column if not exists ultima_resposta text,
  add column if not exists respondido_em timestamp with time zone;

update public.chamados
set
  prioridade = coalesce(prioridade, 'MEDIA'),
  status = coalesce(status, 'ABERTO'),
  categoria = coalesce(nullif(trim(categoria), ''), 'OUTRO'),
  atualizado_em = coalesce(atualizado_em, criado_em, now());

create table if not exists public.chamado_interacoes (
  id bigint generated always as identity primary key,
  chamado_id bigint not null references public.chamados(id) on delete cascade,
  autor_id uuid not null,
  autor_tipo text not null check (autor_tipo in ('ALUNO', 'GESTOR')),
  mensagem text not null,
  criado_em timestamp with time zone not null default now()
);

create index if not exists chamados_status_criado_idx
  on public.chamados(status, criado_em desc);

create index if not exists chamados_aluno_criado_idx
  on public.chamados(aluno_id, criado_em desc);

create index if not exists chamado_interacoes_chamado_criado_idx
  on public.chamado_interacoes(chamado_id, criado_em);

-- 2. Funcao central de autorizacao do gestor.
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

-- 3. RLS: aluno ve os proprios chamados; gestor ativo gerencia todos.
alter table public.chamados enable row level security;
alter table public.chamado_interacoes enable row level security;

drop policy if exists aluno_insere_proprio_chamado on public.chamados;
create policy aluno_insere_proprio_chamado
on public.chamados
for insert
to authenticated
with check (
  aluno_id = auth.uid()
  and prioridade = 'MEDIA'
  and status = 'ABERTO'
);

drop policy if exists aluno_le_proprios_chamados on public.chamados;
create policy aluno_le_proprios_chamados
on public.chamados
for select
to authenticated
using (aluno_id = auth.uid());

drop policy if exists gestor_gerencia_chamados on public.chamados;
create policy gestor_gerencia_chamados
on public.chamados
for all
to authenticated
using (public.e_gestor(1))
with check (public.e_gestor(1));

drop policy if exists aluno_le_interacoes_proprias on public.chamado_interacoes;
create policy aluno_le_interacoes_proprias
on public.chamado_interacoes
for select
to authenticated
using (
  exists (
    select 1
    from public.chamados c
    where c.id = chamado_id
      and c.aluno_id = auth.uid()
  )
);

drop policy if exists aluno_insere_interacao_propria on public.chamado_interacoes;
create policy aluno_insere_interacao_propria
on public.chamado_interacoes
for insert
to authenticated
with check (
  autor_id = auth.uid()
  and autor_tipo = 'ALUNO'
  and exists (
    select 1
    from public.chamados c
    where c.id = chamado_id
      and c.aluno_id = auth.uid()
      and c.status not in ('RESOLVIDO', 'CANCELADO')
  )
);

drop policy if exists gestor_gerencia_interacoes on public.chamado_interacoes;
create policy gestor_gerencia_interacoes
on public.chamado_interacoes
for all
to authenticated
using (public.e_gestor(1))
with check (public.e_gestor(1));

grant select, insert, update on public.chamados to authenticated;
grant select, insert, update on public.chamado_interacoes to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 4. RPC segura: lista os chamados com os dados essenciais do aluno.
create or replace function public.gestor_listar_chamados()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if not public.e_gestor(1) then
    raise exception 'Acesso restrito a gestores ativos.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb)
  into v_resultado
  from (
    select
      c.id,
      c.protocolo,
      c.aluno_id,
      c.assunto,
      c.mensagem,
      c.categoria,
      c.status,
      c.prioridade,
      c.criado_em,
      c.atualizado_em,
      c.resolvido_em,
      c.respondido_em,
      c.ultima_resposta,
      c.prioridade_definida_por,
      a.nome as aluno_nome,
      a.email as aluno_email,
      a.ra as aluno_ra,
      a.telefone as aluno_telefone
    from public.chamados c
    left join public.alunos a on a.user_id = c.aluno_id
  ) x;

  return v_resultado;
end;
$$;

-- 5. RPC segura: abre um chamado e carrega o historico.
create or replace function public.gestor_detalhar_chamado(p_chamado_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if not public.e_gestor(1) then
    raise exception 'Acesso restrito a gestores ativos.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'chamado', to_jsonb(c),
    'aluno', jsonb_build_object(
      'user_id', a.user_id,
      'nome', a.nome,
      'email', a.email,
      'ra', a.ra,
      'telefone', a.telefone
    ),
    'interacoes', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.criado_em)
      from public.chamado_interacoes i
      where i.chamado_id = c.id
    ), '[]'::jsonb)
  )
  into v_resultado
  from public.chamados c
  left join public.alunos a on a.user_id = c.aluno_id
  where c.id = p_chamado_id;

  if v_resultado is null then
    raise exception 'Chamado nao encontrado.' using errcode = 'P0002';
  end if;

  return v_resultado;
end;
$$;

-- 6. RPC segura: atualiza prioridade e status.
create or replace function public.gestor_atualizar_chamado(
  p_chamado_id bigint,
  p_prioridade text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior public.chamados%rowtype;
  v_atual public.chamados%rowtype;
  v_prioridade text := upper(trim(coalesce(p_prioridade, '')));
  v_status text := upper(trim(coalesce(p_status, '')));
begin
  if not public.e_gestor(1) then
    raise exception 'Acesso restrito a gestores ativos.' using errcode = '42501';
  end if;

  if v_prioridade not in ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE') then
    raise exception 'Prioridade invalida.';
  end if;

  if v_status not in ('ABERTO', 'EM_ANDAMENTO', 'RESOLVIDO', 'CANCELADO') then
    raise exception 'Status invalido.';
  end if;

  select * into v_anterior
  from public.chamados
  where id = p_chamado_id
  for update;

  if not found then
    raise exception 'Chamado nao encontrado.' using errcode = 'P0002';
  end if;

  update public.chamados
  set
    prioridade = v_prioridade,
    status = v_status,
    prioridade_definida_por = auth.uid(),
    atualizado_em = now(),
    resolvido_em = case
      when v_status = 'RESOLVIDO' then coalesce(resolvido_em, now())
      else null
    end
  where id = p_chamado_id
  returning * into v_atual;

  if v_anterior.prioridade is distinct from v_atual.prioridade
     or v_anterior.status is distinct from v_atual.status then
    insert into public.chamado_interacoes (
      chamado_id,
      autor_id,
      autor_tipo,
      mensagem
    ) values (
      p_chamado_id,
      auth.uid(),
      'GESTOR',
      format('Classificacao atualizada: prioridade %s e status %s.',
        replace(v_atual.prioridade, '_', ' '),
        replace(v_atual.status, '_', ' ')
      )
    );
  end if;

  return to_jsonb(v_atual);
end;
$$;

-- 7. RPC segura: responde e opcionalmente altera o status.
create or replace function public.gestor_responder_chamado(
  p_chamado_id bigint,
  p_mensagem text,
  p_acao text default 'RESPONDER'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chamado public.chamados%rowtype;
  v_mensagem text := trim(coalesce(p_mensagem, ''));
  v_acao text := upper(trim(coalesce(p_acao, 'RESPONDER')));
  v_status text;
begin
  if not public.e_gestor(1) then
    raise exception 'Acesso restrito a gestores ativos.' using errcode = '42501';
  end if;

  if length(v_mensagem) < 2 then
    raise exception 'Escreva uma resposta valida.';
  end if;

  if v_acao not in ('RESPONDER', 'RESP_E_ANDAMENTO', 'RESP_RESOLVER') then
    raise exception 'Acao de resposta invalida.';
  end if;

  select * into v_chamado
  from public.chamados
  where id = p_chamado_id
  for update;

  if not found then
    raise exception 'Chamado nao encontrado.' using errcode = 'P0002';
  end if;

  v_status := case
    when v_acao = 'RESP_E_ANDAMENTO' then 'EM_ANDAMENTO'
    when v_acao = 'RESP_RESOLVER' then 'RESOLVIDO'
    else v_chamado.status
  end;

  insert into public.chamado_interacoes (
    chamado_id,
    autor_id,
    autor_tipo,
    mensagem
  ) values (
    p_chamado_id,
    auth.uid(),
    'GESTOR',
    v_mensagem
  );

  update public.chamados
  set
    status = v_status,
    ultima_resposta = v_mensagem,
    respondido_em = now(),
    atualizado_em = now(),
    resolvido_em = case
      when v_status = 'RESOLVIDO' then coalesce(resolvido_em, now())
      else null
    end
  where id = p_chamado_id
  returning * into v_chamado;

  return public.gestor_detalhar_chamado(p_chamado_id);
end;
$$;

revoke all on function public.gestor_listar_chamados() from public;
revoke all on function public.gestor_detalhar_chamado(bigint) from public;
revoke all on function public.gestor_atualizar_chamado(bigint, text, text) from public;
revoke all on function public.gestor_responder_chamado(bigint, text, text) from public;

grant execute on function public.gestor_listar_chamados() to authenticated;
grant execute on function public.gestor_detalhar_chamado(bigint) to authenticated;
grant execute on function public.gestor_atualizar_chamado(bigint, text, text) to authenticated;
grant execute on function public.gestor_responder_chamado(bigint, text, text) to authenticated;

commit;

select 'Atualizacao 08 de chamados aplicada com sucesso' as resultado;
