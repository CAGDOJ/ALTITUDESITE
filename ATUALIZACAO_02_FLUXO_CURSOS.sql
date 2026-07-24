-- ALTITUDE - Atualização 02
-- Fluxo completo de cursos: catálogo público, matrícula, módulos, materiais,
-- prova, avaliação, métricas, certificado e rascunhos criados com IA.
--
-- IMPORTANTE:
-- 1. Execute este arquivo APÓS ATUALIZACAO_BANCO_PORTAL_ALUNO.sql.
-- 2. O script é idempotente e pode ser executado novamente para aplicar correções.

begin;

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. ESTRUTURA DOS CURSOS
-- =============================================================================
alter table public.cursos
  add column if not exists nivel text not null default 'BASICO',
  add column if not exists nota_minima numeric not null default 70,
  add column if not exists destaque boolean not null default false,
  add column if not exists visualizacoes bigint not null default 0,
  add column if not exists cliques bigint not null default 0,
  add column if not exists matriculas_total bigint not null default 0,
  add column if not exists avaliacao_media numeric not null default 0,
  add column if not exists avaliacoes_total bigint not null default 0,
  add column if not exists publicado_em timestamp with time zone,
  add column if not exists gerado_por_ia boolean not null default false,
  add column if not exists revisado_em timestamp with time zone,
  add column if not exists slug text,
  add column if not exists publico_alvo text,
  add column if not exists objetivos text;

alter table public.modulos
  add column if not exists conteudo text,
  add column if not exists resumo text;

-- Ajusta valores antigos antes das constraints.
update public.cursos
set nivel = 'BASICO'
where nivel is null or nivel not in ('BASICO', 'INTERMEDIARIO', 'AVANCADO');

update public.cursos
set nota_minima = 70
where nota_minima is null or nota_minima < 0 or nota_minima > 100;

update public.cursos
set publicado_em = coalesce(publicado_em, criado_em, now())
where publicado = true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cursos_nivel_check'
      and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos
      add constraint cursos_nivel_check
      check (nivel in ('BASICO', 'INTERMEDIARIO', 'AVANCADO'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cursos_nota_minima_check'
      and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos
      add constraint cursos_nota_minima_check
      check (nota_minima between 0 and 100);
  end if;
end $$;

-- Slug simples e único para futuras páginas individuais.
update public.cursos
set slug = lower(trim(both '-' from regexp_replace(
  translate(
    titulo,
    'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
  ),
  '[^a-zA-Z0-9]+', '-', 'g'
))) || '-' || id::text
where slug is null or trim(slug) = '';

create unique index if not exists cursos_slug_uidx
  on public.cursos(slug)
  where slug is not null;

create index if not exists cursos_catalogo_idx
  on public.cursos(publicado, destaque desc, matriculas_total desc, cliques desc, criado_em desc);

create index if not exists modulos_curso_ordem_idx
  on public.modulos(curso_id, ordem, id);

-- Toda prova criada a partir de um módulo recebe automaticamente o curso correto.
update public.provas p
set curso_id = m.curso_id
from public.modulos m
where p.modulo_id = m.id
  and (p.curso_id is null or p.curso_id <> m.curso_id);

create or replace function public.preencher_curso_da_prova()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.modulo_id is not null then
    select m.curso_id
      into new.curso_id
    from public.modulos m
    where m.id = new.modulo_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preencher_curso_da_prova on public.provas;
create trigger trg_preencher_curso_da_prova
before insert or update of modulo_id on public.provas
for each row execute function public.preencher_curso_da_prova();

-- =============================================================================
-- 2. AVALIAÇÕES DOS CURSOS
-- =============================================================================
create table if not exists public.avaliacoes_cursos (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  curso_id bigint not null references public.cursos(id) on delete cascade,
  nota integer not null check (nota between 1 and 5),
  comentario text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  unique (aluno_id, curso_id)
);

create index if not exists avaliacoes_cursos_curso_idx
  on public.avaliacoes_cursos(curso_id, criado_em desc);

create or replace function public.recalcular_avaliacao_curso(p_curso_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cursos c
  set avaliacao_media = coalesce((
        select round(avg(a.nota)::numeric, 2)
        from public.avaliacoes_cursos a
        where a.curso_id = p_curso_id
      ), 0),
      avaliacoes_total = (
        select count(*)
        from public.avaliacoes_cursos a
        where a.curso_id = p_curso_id
      )
  where c.id = p_curso_id;
end;
$$;

create or replace function public.trg_recalcular_avaliacao_curso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_id bigint;
begin
  v_curso_id := case when tg_op = 'DELETE' then old.curso_id else new.curso_id end;
  perform public.recalcular_avaliacao_curso(v_curso_id);

  if tg_op = 'UPDATE' and old.curso_id is distinct from new.curso_id then
    perform public.recalcular_avaliacao_curso(old.curso_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_avaliacoes_cursos_metricas on public.avaliacoes_cursos;
create trigger trg_avaliacoes_cursos_metricas
after insert or update or delete on public.avaliacoes_cursos
for each row execute function public.trg_recalcular_avaliacao_curso();

-- =============================================================================
-- 3. MÉTRICAS DAS MATRÍCULAS
-- =============================================================================
create or replace function public.recalcular_matriculas_curso(p_curso_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cursos c
  set matriculas_total = (
    select count(*)
    from public.matriculas m
    where m.curso_id = p_curso_id
      and m.status in ('ATIVA', 'CONCLUIDA')
  )
  where c.id = p_curso_id;
end;
$$;

create or replace function public.trg_recalcular_matriculas_curso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_id bigint;
begin
  v_curso_id := case when tg_op = 'DELETE' then old.curso_id else new.curso_id end;
  perform public.recalcular_matriculas_curso(v_curso_id);

  if tg_op = 'UPDATE' and old.curso_id is distinct from new.curso_id then
    perform public.recalcular_matriculas_curso(old.curso_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_matriculas_metricas on public.matriculas;
create trigger trg_matriculas_metricas
after insert or update or delete on public.matriculas
for each row execute function public.trg_recalcular_matriculas_curso();

update public.cursos c
set matriculas_total = (
  select count(*)
  from public.matriculas m
  where m.curso_id = c.id
    and m.status in ('ATIVA', 'CONCLUIDA')
);

update public.cursos c
set avaliacao_media = coalesce((
      select round(avg(a.nota)::numeric, 2)
      from public.avaliacoes_cursos a
      where a.curso_id = c.id
    ), 0),
    avaliacoes_total = (
      select count(*)
      from public.avaliacoes_cursos a
      where a.curso_id = c.id
    );

-- =============================================================================
-- 4. CATÁLOGO PÚBLICO, CLIQUES E MATRÍCULA
-- =============================================================================
drop function if exists public.listar_cursos_publicos();
create function public.listar_cursos_publicos()
returns table (
  id bigint,
  titulo text,
  descricao text,
  categoria text,
  carga_horaria integer,
  capa_url text,
  nivel text,
  nota_minima numeric,
  destaque boolean,
  visualizacoes bigint,
  cliques bigint,
  matriculas_total bigint,
  avaliacao_media numeric,
  avaliacoes_total bigint,
  total_modulos bigint,
  total_materiais bigint,
  total_questoes bigint,
  criado_em timestamp with time zone
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.titulo,
    c.descricao,
    c.categoria,
    c.carga_horaria,
    c.capa_url,
    c.nivel,
    c.nota_minima,
    c.destaque,
    c.visualizacoes,
    c.cliques,
    c.matriculas_total,
    c.avaliacao_media,
    c.avaliacoes_total,
    (
      select count(*)
      from public.modulos md
      where md.curso_id = c.id
        and coalesce(md.publicado, false) = true
    ) as total_modulos,
    (
      select count(*)
      from public.materiais mt
      where mt.curso_id = c.id
    ) as total_materiais,
    (
      select count(*)
      from public.questoes q
      join public.provas p on p.id = q.prova_id
      where p.curso_id = c.id
    ) as total_questoes,
    c.criado_em
  from public.cursos c
  where c.publicado = true
  order by
    c.destaque desc,
    (c.matriculas_total * 4 + c.cliques + c.visualizacoes / 4) desc,
    c.avaliacao_media desc,
    c.criado_em desc;
$$;

create or replace function public.registrar_interacao_curso(
  p_curso_id bigint,
  p_tipo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.cursos
    where id = p_curso_id and publicado = true
  ) then
    return;
  end if;

  if upper(coalesce(p_tipo, '')) = 'VISUALIZACAO' then
    update public.cursos
    set visualizacoes = visualizacoes + 1
    where id = p_curso_id;
  elsif upper(coalesce(p_tipo, '')) = 'CLIQUE' then
    update public.cursos
    set cliques = cliques + 1
    where id = p_curso_id;
  end if;
end;
$$;

create or replace function public.matricular_em_curso(p_curso_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_matricula public.matriculas%rowtype;
begin
  if v_uid is null then
    raise exception 'Faça login para se inscrever';
  end if;

  if not exists (
    select 1 from public.alunos a
    where a.user_id = v_uid
      and a.status = 'ATIVO'
  ) then
    raise exception 'Cadastro de aluno ativo não encontrado';
  end if;

  if not exists (
    select 1 from public.cursos c
    where c.id = p_curso_id
      and c.publicado = true
  ) then
    raise exception 'Curso indisponível para matrícula';
  end if;

  select *
    into v_matricula
  from public.matriculas m
  where m.aluno_id = v_uid
    and m.curso_id = p_curso_id
  order by m.id desc
  limit 1;

  if v_matricula.id is null then
    insert into public.matriculas
      (aluno_id, curso_id, status, progresso, criada_em)
    values
      (v_uid, p_curso_id, 'ATIVA', 0, now())
    returning * into v_matricula;
  elsif v_matricula.status in ('CANCELADA', 'TRANCADA') then
    update public.matriculas
    set status = 'ATIVA'
    where id = v_matricula.id
    returning * into v_matricula;
  end if;

  perform public.registrar_interacao_curso(p_curso_id, 'CLIQUE');
  perform public.recalcular_matriculas_curso(p_curso_id);

  return jsonb_build_object(
    'matricula_id', v_matricula.id,
    'curso_id', v_matricula.curso_id,
    'status', v_matricula.status,
    'progresso', v_matricula.progresso
  );
end;
$$;

create or replace function public.avaliar_curso(
  p_curso_id bigint,
  p_nota integer,
  p_comentario text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_avaliacao public.avaliacoes_cursos%rowtype;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_nota < 1 or p_nota > 5 then
    raise exception 'A nota deve estar entre 1 e 5';
  end if;

  if not exists (
    select 1
    from public.matriculas m
    where m.aluno_id = v_uid
      and m.curso_id = p_curso_id
      and m.progresso >= 100
      and m.status in ('ATIVA', 'CONCLUIDA')
  ) then
    raise exception 'Conclua o curso antes de avaliá-lo';
  end if;

  if not exists (
    select 1
    from public.resultados_provas r
    where r.aluno_id = v_uid
      and r.curso_id = p_curso_id
      and r.aprovado = true
  ) then
    raise exception 'A avaliação é liberada após a aprovação';
  end if;

  insert into public.avaliacoes_cursos
    (aluno_id, curso_id, nota, comentario, criado_em, atualizado_em)
  values
    (v_uid, p_curso_id, p_nota, nullif(trim(coalesce(p_comentario, '')), ''), now(), now())
  on conflict (aluno_id, curso_id)
  do update set
    nota = excluded.nota,
    comentario = excluded.comentario,
    atualizado_em = now()
  returning * into v_avaliacao;

  perform public.recalcular_avaliacao_curso(p_curso_id);
  return to_jsonb(v_avaliacao);
end;
$$;

-- =============================================================================
-- 5. CONTEÚDO, PROVA E CERTIFICADO
-- =============================================================================
-- A assinatura muda para incluir o conteúdo escrito do módulo.
drop function if exists public.obter_modulos_curso(bigint);
create function public.obter_modulos_curso(p_curso_id bigint)
returns table (
  modulo_id bigint,
  titulo text,
  descricao text,
  conteudo text,
  ordem integer,
  pdf_url text,
  video_url text,
  concluido boolean,
  materiais jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total integer;
  v_progresso numeric;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select m.progresso
    into v_progresso
  from public.matriculas m
  where m.aluno_id = v_uid
    and m.curso_id = p_curso_id
    and m.status in ('ATIVA', 'CONCLUIDA')
  order by m.id desc
  limit 1;

  if not found then
    raise exception 'Matrícula não encontrada';
  end if;

  select count(*)
    into v_total
  from public.modulos m
  where m.curso_id = p_curso_id
    and coalesce(m.publicado, false) = true;

  -- Compatibilidade com cursos antigos sem módulos.
  if v_total = 0 then
    return query
    select
      null::bigint,
      'Conteúdo do curso'::text,
      coalesce(c.descricao, 'Materiais disponibilizados para este curso.')::text,
      null::text,
      1,
      null::text,
      null::text,
      coalesce(v_progresso, 0) >= 100,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', mt.id,
            'tipo', mt.tipo,
            'titulo', mt.titulo,
            'url', mt.url
          ) order by mt.id
        )
        from public.materiais mt
        where mt.curso_id = p_curso_id
      ), '[]'::jsonb)
    from public.cursos c
    where c.id = p_curso_id;
    return;
  end if;

  return query
  select
    md.id,
    md.titulo,
    md.descricao,
    md.conteudo,
    coalesce(md.ordem, 1),
    md.pdf_url,
    md.video_url,
    coalesce(pm.concluido, false),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', mt.id,
          'tipo', mt.tipo,
          'titulo', mt.titulo,
          'url', mt.url
        ) order by mt.id
      )
      from public.materiais mt
      where mt.curso_id = p_curso_id
        and mt.modulo_id = md.id
    ), '[]'::jsonb)
  from public.modulos md
  left join public.progresso_modulos pm
    on pm.modulo_id = md.id
   and pm.aluno_id = v_uid
  where md.curso_id = p_curso_id
    and coalesce(md.publicado, false) = true
  order by coalesce(md.ordem, 1), md.id;
end;
$$;

create or replace function public.marcar_modulo_concluido(p_modulo_id bigint)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_curso_id bigint;
  v_total integer;
  v_concluidos integer;
  v_progresso numeric;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select m.curso_id
    into v_curso_id
  from public.modulos m
  where m.id = p_modulo_id
    and coalesce(m.publicado, false) = true;

  if v_curso_id is null then
    raise exception 'Módulo não encontrado';
  end if;

  if not exists (
    select 1 from public.matriculas mt
    where mt.aluno_id = v_uid
      and mt.curso_id = v_curso_id
      and mt.status in ('ATIVA', 'CONCLUIDA')
  ) then
    raise exception 'Matrícula não encontrada';
  end if;

  insert into public.progresso_modulos
    (aluno_id, curso_id, modulo_id, concluido, concluido_em, atualizado_em)
  values
    (v_uid, v_curso_id, p_modulo_id, true, now(), now())
  on conflict (aluno_id, modulo_id)
  do update set
    concluido = true,
    concluido_em = coalesce(public.progresso_modulos.concluido_em, now()),
    atualizado_em = now();

  select count(*)
    into v_total
  from public.modulos m
  where m.curso_id = v_curso_id
    and coalesce(m.publicado, false) = true;

  select count(*)
    into v_concluidos
  from public.progresso_modulos pm
  join public.modulos m on m.id = pm.modulo_id
  where pm.aluno_id = v_uid
    and pm.curso_id = v_curso_id
    and pm.concluido = true
    and coalesce(m.publicado, false) = true;

  v_progresso := case
    when v_total = 0 then 100
    else round((v_concluidos::numeric / v_total::numeric) * 100, 2)
  end;

  update public.matriculas
  set progresso = v_progresso,
      status = case when v_progresso >= 100 then 'CONCLUIDA' else 'ATIVA' end
  where aluno_id = v_uid
    and curso_id = v_curso_id;

  return v_progresso;
end;
$$;

create or replace function public.concluir_conteudo_geral(p_curso_id bigint)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not exists (
    select 1 from public.matriculas m
    where m.aluno_id = v_uid
      and m.curso_id = p_curso_id
      and m.status in ('ATIVA', 'CONCLUIDA')
  ) then
    raise exception 'Matrícula não encontrada';
  end if;

  update public.matriculas
  set progresso = 100,
      status = 'CONCLUIDA'
  where aluno_id = v_uid
    and curso_id = p_curso_id;

  return 100;
end;
$$;

create or replace function public.obter_prova_aluno(p_curso_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prova public.provas%rowtype;
  v_questoes jsonb;
  v_nota_minima numeric;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not exists (
    select 1 from public.matriculas m
    where m.aluno_id = v_uid
      and m.curso_id = p_curso_id
      and m.status in ('ATIVA', 'CONCLUIDA')
      and m.progresso >= 100
  ) then
    raise exception 'Conclua todos os módulos antes de iniciar a prova';
  end if;

  select p.*
    into v_prova
  from public.provas p
  where p.curso_id = p_curso_id
  order by case when p.modulo_id is null then 0 else 1 end, p.id
  limit 1;

  if v_prova.id is null then
    return jsonb_build_object(
      'encontrada', false,
      'curso_id', p_curso_id,
      'mensagem', 'A prova ainda não foi cadastrada.'
    );
  end if;

  select coalesce(c.nota_minima, 70)
    into v_nota_minima
  from public.cursos c
  where c.id = p_curso_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'enunciado', q.enunciado,
      'a', q.a,
      'b', q.b,
      'c', q.c,
      'd', q.d
    ) order by q.id
  ), '[]'::jsonb)
    into v_questoes
  from public.questoes q
  where q.prova_id = v_prova.id;

  return jsonb_build_object(
    'encontrada', true,
    'id', v_prova.id,
    'titulo', v_prova.titulo,
    'curso_id', p_curso_id,
    'nota_minima', v_nota_minima,
    'questoes', v_questoes
  );
end;
$$;

create or replace function public.finalizar_prova(
  p_prova_id bigint,
  p_respostas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_curso_id bigint;
  v_total integer;
  v_respondidas integer;
  v_acertos integer;
  v_nota numeric;
  v_nota_minima numeric := 70;
  v_aprovado boolean;
  v_tentativa integer;
  v_resultado_id bigint;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if jsonb_typeof(coalesce(p_respostas, '[]'::jsonb)) <> 'array' then
    raise exception 'Formato de respostas inválido';
  end if;

  select p.curso_id, coalesce(c.nota_minima, 70)
    into v_curso_id, v_nota_minima
  from public.provas p
  join public.cursos c on c.id = p.curso_id
  where p.id = p_prova_id;

  if v_curso_id is null then
    raise exception 'Prova não encontrada ou sem curso vinculado';
  end if;

  if not exists (
    select 1 from public.matriculas m
    where m.aluno_id = v_uid
      and m.curso_id = v_curso_id
      and m.progresso >= 100
      and m.status in ('ATIVA', 'CONCLUIDA')
  ) then
    raise exception 'Conclua o curso antes de finalizar a prova';
  end if;

  select count(*)
    into v_total
  from public.questoes q
  where q.prova_id = p_prova_id;

  if v_total = 0 then
    raise exception 'A prova não possui questões';
  end if;

  select count(*)
    into v_respondidas
  from (
    select distinct r.questao_id
    from jsonb_to_recordset(coalesce(p_respostas, '[]'::jsonb))
      as r(questao_id bigint, resposta text)
    join public.questoes q
      on q.id = r.questao_id
     and q.prova_id = p_prova_id
    where upper(trim(coalesce(r.resposta, ''))) in ('A', 'B', 'C', 'D')
  ) respostas_validas;

  if v_respondidas <> v_total then
    raise exception 'Responda todas as questões antes de finalizar';
  end if;

  select count(*)
    into v_acertos
  from jsonb_to_recordset(coalesce(p_respostas, '[]'::jsonb))
    as r(questao_id bigint, resposta text)
  join public.questoes q
    on q.id = r.questao_id
   and q.prova_id = p_prova_id
  where upper(trim(r.resposta)) = upper(q.correta);

  v_nota := round((v_acertos::numeric / v_total::numeric) * 100, 0);
  v_aprovado := v_nota >= v_nota_minima;

  select coalesce(max(tentativa), 0) + 1
    into v_tentativa
  from public.resultados_provas
  where aluno_id = v_uid
    and prova_id = p_prova_id;

  insert into public.resultados_provas
    (aluno_id, curso_id, prova_id, nota, total_questoes, acertos,
     aprovado, tentativa, criado_em, finalizado_em)
  values
    (v_uid, v_curso_id, p_prova_id, v_nota, v_total, v_acertos,
     v_aprovado, v_tentativa, now(), now())
  returning id into v_resultado_id;

  insert into public.respostas_prova
    (aluno_id, prova_id, questao_id, resposta, correto, resultado_id, criado_em)
  select
    v_uid,
    p_prova_id,
    q.id,
    upper(trim(r.resposta)),
    upper(trim(r.resposta)) = upper(q.correta),
    v_resultado_id,
    now()
  from jsonb_to_recordset(coalesce(p_respostas, '[]'::jsonb))
    as r(questao_id bigint, resposta text)
  join public.questoes q
    on q.id = r.questao_id
   and q.prova_id = p_prova_id;

  return jsonb_build_object(
    'resultado_id', v_resultado_id,
    'curso_id', v_curso_id,
    'prova_id', p_prova_id,
    'nota', v_nota,
    'nota_minima', v_nota_minima,
    'total_questoes', v_total,
    'acertos', v_acertos,
    'aprovado', v_aprovado,
    'tentativa', v_tentativa
  );
end;
$$;

create or replace function public.emitir_certificado_curso(p_curso_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_resultado public.resultados_provas%rowtype;
  v_cert public.certificados%rowtype;
  v_codigo uuid := gen_random_uuid();
  v_numero text;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select *
    into v_aluno
  from public.alunos
  where user_id = v_uid;

  if v_aluno.user_id is null then
    raise exception 'Aluno não encontrado';
  end if;

  select c.*
    into v_curso
  from public.cursos c
  join public.matriculas m on m.curso_id = c.id
  where c.id = p_curso_id
    and m.aluno_id = v_uid
    and m.progresso >= 100
    and m.status in ('ATIVA', 'CONCLUIDA')
  order by m.id desc
  limit 1;

  if v_curso.id is null then
    raise exception 'Curso ainda não foi concluído';
  end if;

  select *
    into v_resultado
  from public.resultados_provas
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and aprovado = true
    and nota >= coalesce(v_curso.nota_minima, 70)
  order by nota desc, criado_em desc
  limit 1;

  if v_resultado.id is null then
    raise exception 'Aprovação na prova ainda não registrada';
  end if;

  select *
    into v_cert
  from public.certificados
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and status = 'EMITIDO'
  order by id desc
  limit 1;

  if v_cert.id is null then
    v_numero := 'ALT-' || to_char(now(), 'YYYY') || '-' ||
      upper(substr(replace(v_codigo::text, '-', ''), 1, 12));

    insert into public.certificados
      (aluno_id, curso_id, status, emitido_em, horas_emitidas, criado_em,
       codigo_validacao, numero_certificado, nome_aluno, nome_curso,
       nota_final, atualizado_em)
    values
      (v_uid, p_curso_id, 'EMITIDO', now(), coalesce(v_curso.carga_horaria, 0), now(),
       v_codigo, v_numero, v_aluno.nome, v_curso.titulo,
       v_resultado.nota, now())
    returning * into v_cert;
  end if;

  return to_jsonb(v_cert);
end;
$$;

-- =============================================================================
-- 6. STORAGE PARA CAPAS E MATERIAIS
-- =============================================================================
insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  ('capas_cursos', 'capas_cursos', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('materiais_cursos', 'materiais_cursos', true, 52428800, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'capas_cursos_leitura_publica'
  ) then
    create policy capas_cursos_leitura_publica
      on storage.objects for select
      using (bucket_id = 'capas_cursos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'materiais_cursos_leitura_publica'
  ) then
    create policy materiais_cursos_leitura_publica
      on storage.objects for select
      using (bucket_id = 'materiais_cursos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'autenticado_envia_capas_cursos'
  ) then
    create policy autenticado_envia_capas_cursos
      on storage.objects for insert to authenticated
      with check (bucket_id = 'capas_cursos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'autenticado_atualiza_capas_cursos'
  ) then
    create policy autenticado_atualiza_capas_cursos
      on storage.objects for update to authenticated
      using (bucket_id = 'capas_cursos')
      with check (bucket_id = 'capas_cursos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'autenticado_envia_materiais_cursos'
  ) then
    create policy autenticado_envia_materiais_cursos
      on storage.objects for insert to authenticated
      with check (bucket_id = 'materiais_cursos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'autenticado_atualiza_materiais_cursos'
  ) then
    create policy autenticado_atualiza_materiais_cursos
      on storage.objects for update to authenticated
      using (bucket_id = 'materiais_cursos')
      with check (bucket_id = 'materiais_cursos');
  end if;
end $$;

-- =============================================================================
-- 7. RASCUNHOS GERADOS COM IA
-- =============================================================================
create table if not exists public.curso_ia_rascunhos (
  id bigint generated always as identity primary key,
  criado_por uuid not null references auth.users(id) on delete cascade,
  pedido text not null,
  dados jsonb not null,
  curso_id bigint references public.cursos(id) on delete set null,
  status text not null default 'GERADO'
    check (status in ('GERANDO', 'GERADO', 'APROVADO', 'DESCARTADO', 'ERRO')),
  erro text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

alter table public.avaliacoes_cursos enable row level security;
alter table public.curso_ia_rascunhos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'avaliacoes_cursos'
      and policyname = 'avaliacoes_cursos_leitura_publica'
  ) then
    create policy avaliacoes_cursos_leitura_publica
      on public.avaliacoes_cursos for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'curso_ia_rascunhos'
      and policyname = 'usuario_le_proprios_rascunhos_ia'
  ) then
    create policy usuario_le_proprios_rascunhos_ia
      on public.curso_ia_rascunhos for select to authenticated
      using (criado_por = auth.uid());
  end if;
end $$;

-- =============================================================================
-- 8. PERMISSÕES DAS FUNÇÕES
-- =============================================================================
revoke all on function public.listar_cursos_publicos() from public;
revoke all on function public.registrar_interacao_curso(bigint, text) from public;
revoke all on function public.matricular_em_curso(bigint) from public;
revoke all on function public.avaliar_curso(bigint, integer, text) from public;
revoke all on function public.obter_modulos_curso(bigint) from public;
revoke all on function public.marcar_modulo_concluido(bigint) from public;
revoke all on function public.concluir_conteudo_geral(bigint) from public;
revoke all on function public.obter_prova_aluno(bigint) from public;
revoke all on function public.finalizar_prova(bigint, jsonb) from public;
revoke all on function public.emitir_certificado_curso(bigint) from public;

grant execute on function public.listar_cursos_publicos() to anon, authenticated;
grant execute on function public.registrar_interacao_curso(bigint, text) to anon, authenticated;
grant execute on function public.matricular_em_curso(bigint) to authenticated;
grant execute on function public.avaliar_curso(bigint, integer, text) to authenticated;
grant execute on function public.obter_modulos_curso(bigint) to authenticated;
grant execute on function public.marcar_modulo_concluido(bigint) to authenticated;
grant execute on function public.concluir_conteudo_geral(bigint) to authenticated;
grant execute on function public.obter_prova_aluno(bigint) to authenticated;
grant execute on function public.finalizar_prova(bigint, jsonb) to authenticated;
grant execute on function public.emitir_certificado_curso(bigint) to authenticated;

commit;

-- Depois de executar:
-- 1. Crie/edite um curso no Portal de Gestão.
-- 2. Cadastre módulos publicados e anexe PDF, imagem, vídeo ou link.
-- 3. Crie uma prova com questões e publique o curso.
-- 4. O curso aparecerá automaticamente em Cursos Profissionais.
