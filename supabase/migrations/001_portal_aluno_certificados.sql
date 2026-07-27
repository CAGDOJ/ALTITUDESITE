-- ALTITUDE - Portal do aluno, provas seguras e certificados verificáveis
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

create extension if not exists pgcrypto;

-- Ajustes de estrutura sem remover dados existentes.
alter table public.chamados
  add column if not exists categoria text default 'OUTRO';

alter table public.certificados
  add column if not exists codigo_validacao uuid,
  add column if not exists numero_certificado text,
  add column if not exists nome_aluno text,
  add column if not exists nome_curso text,
  add column if not exists nota_final numeric default 0,
  add column if not exists valido_ate date,
  add column if not exists atualizado_em timestamp with time zone default now();

alter table public.resultados_provas
  add column if not exists tentativa integer default 1,
  add column if not exists finalizado_em timestamp with time zone default now();

alter table public.respostas_prova
  add column if not exists resultado_id bigint;

with dados_certificado as (
  select
    c.id,
    coalesce(c.codigo_validacao, gen_random_uuid()) as codigo,
    a.nome as aluno_nome_atual,
    cu.titulo as curso_titulo_atual
  from public.certificados c
  join public.alunos a on a.user_id = c.aluno_id
  join public.cursos cu on cu.id = c.curso_id
)
update public.certificados c
set codigo_validacao = d.codigo,
    nome_aluno = coalesce(c.nome_aluno, d.aluno_nome_atual),
    nome_curso = coalesce(c.nome_curso, d.curso_titulo_atual),
    numero_certificado = coalesce(
      c.numero_certificado,
      'ALT-' || to_char(coalesce(c.emitido_em, now()), 'YYYY') || '-' ||
      upper(substr(replace(d.codigo::text, '-', ''), 1, 12))
    ),
    atualizado_em = coalesce(c.atualizado_em, now())
from dados_certificado d
where d.id = c.id;

alter table public.certificados
  alter column codigo_validacao set default gen_random_uuid();

create unique index if not exists certificados_codigo_validacao_uidx
  on public.certificados(codigo_validacao);

create unique index if not exists certificados_numero_uidx
  on public.certificados(numero_certificado)
  where numero_certificado is not null;

create index if not exists matriculas_aluno_curso_idx
  on public.matriculas(aluno_id, curso_id);
create index if not exists materiais_curso_modulo_idx
  on public.materiais(curso_id, modulo_id);
create index if not exists provas_curso_idx
  on public.provas(curso_id);
create index if not exists questoes_prova_idx
  on public.questoes(prova_id);
create index if not exists resultados_aluno_curso_idx
  on public.resultados_provas(aluno_id, curso_id, criado_em desc);
create index if not exists certificados_aluno_curso_idx
  on public.certificados(aluno_id, curso_id, status);

-- Uma matrícula por aluno/curso, desde que não existam duplicidades antigas.
do $$
begin
  if not exists (
    select 1
    from public.matriculas
    group by aluno_id, curso_id
    having count(*) > 1
  ) then
    execute 'create unique index if not exists matriculas_aluno_curso_uidx on public.matriculas(aluno_id, curso_id)';
  else
    raise notice 'Há matrículas duplicadas. O índice único não foi criado até que sejam regularizadas.';
  end if;
end $$;

-- Relações que estavam ausentes. NOT VALID preserva dados antigos e protege novos registros.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materiais_modulo_id_fkey') then
    alter table public.materiais
      add constraint materiais_modulo_id_fkey foreign key (modulo_id)
      references public.modulos(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'provas_modulo_id_fkey') then
    alter table public.provas
      add constraint provas_modulo_id_fkey foreign key (modulo_id)
      references public.modulos(id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'modulos_curso_id_fkey') then
    alter table public.modulos
      add constraint modulos_curso_id_fkey foreign key (curso_id)
      references public.cursos(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'resultados_provas_aluno_id_fkey') then
    alter table public.resultados_provas
      add constraint resultados_provas_aluno_id_fkey foreign key (aluno_id)
      references public.alunos(user_id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'resultados_provas_curso_id_fkey') then
    alter table public.resultados_provas
      add constraint resultados_provas_curso_id_fkey foreign key (curso_id)
      references public.cursos(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'resultados_provas_prova_id_fkey') then
    alter table public.resultados_provas
      add constraint resultados_provas_prova_id_fkey foreign key (prova_id)
      references public.provas(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'respostas_prova_aluno_id_fkey') then
    alter table public.respostas_prova
      add constraint respostas_prova_aluno_id_fkey foreign key (aluno_id)
      references public.alunos(user_id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'respostas_prova_prova_id_fkey') then
    alter table public.respostas_prova
      add constraint respostas_prova_prova_id_fkey foreign key (prova_id)
      references public.provas(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'respostas_prova_questao_id_fkey') then
    alter table public.respostas_prova
      add constraint respostas_prova_questao_id_fkey foreign key (questao_id)
      references public.questoes(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'respostas_prova_resultado_id_fkey') then
    alter table public.respostas_prova
      add constraint respostas_prova_resultado_id_fkey foreign key (resultado_id)
      references public.resultados_provas(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'certificados_pagamento_id_fkey') then
    alter table public.certificados
      add constraint certificados_pagamento_id_fkey foreign key (pagamento_id)
      references public.pagamentos(id) on delete set null not valid;
  end if;
end $$;

-- Progresso real por módulo.
create table if not exists public.progresso_modulos (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  curso_id bigint not null references public.cursos(id) on delete cascade,
  modulo_id bigint not null references public.modulos(id) on delete cascade,
  concluido boolean not null default false,
  concluido_em timestamp with time zone,
  atualizado_em timestamp with time zone not null default now(),
  unique (aluno_id, modulo_id)
);

create index if not exists progresso_modulos_aluno_curso_idx
  on public.progresso_modulos(aluno_id, curso_id);

-- Retorna os módulos e materiais sem expor dados de outros alunos.
create or replace function public.obter_modulos_curso(p_curso_id bigint)
returns table (
  modulo_id bigint,
  titulo text,
  descricao text,
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
  limit 1;

  if not found then
    raise exception 'Matrícula não encontrada';
  end if;

  select count(*) into v_total
  from public.modulos m
  where m.curso_id = p_curso_id
    and coalesce(m.publicado, false) = true;

  if v_total = 0 then
    return query
    select
      null::bigint,
      'Conteúdo do curso'::text,
      coalesce(c.descricao, 'Materiais disponibilizados para este curso.')::text,
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

  select m.curso_id into v_curso_id
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

  insert into public.progresso_modulos as progresso_atual
    (aluno_id, curso_id, modulo_id, concluido, concluido_em, atualizado_em)
  values
    (v_uid, v_curso_id, p_modulo_id, true, now(), now())
  on conflict (aluno_id, modulo_id)
  do update set
    concluido = true,
    concluido_em = coalesce(progresso_atual.concluido_em, now()),
    atualizado_em = now();

  select count(*) into v_total
  from public.modulos m
  where m.curso_id = v_curso_id
    and coalesce(m.publicado, false) = true;

  select count(*) into v_concluidos
  from public.progresso_modulos pm
  join public.modulos m on m.id = pm.modulo_id
  where pm.aluno_id = v_uid
    and pm.curso_id = v_curso_id
    and pm.concluido = true
    and coalesce(m.publicado, false) = true;

  v_progresso := case when v_total = 0 then 0 else round((v_concluidos::numeric / v_total::numeric) * 100, 0) end;

  update public.matriculas
  set progresso = v_progresso,
      status = case when v_progresso >= 100 then 'CONCLUIDA' else status end
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

  if exists (
    select 1 from public.modulos
    where curso_id = p_curso_id and coalesce(publicado, false) = true
  ) then
    raise exception 'Este curso possui módulos e deve ser concluído módulo a módulo';
  end if;

  update public.matriculas
  set progresso = 100,
      status = 'CONCLUIDA'
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and status in ('ATIVA', 'CONCLUIDA');

  if not found then
    raise exception 'Matrícula não encontrada';
  end if;

  return 100;
end;
$$;

-- A prova é enviada sem o gabarito.
create or replace function public.obter_prova_aluno(p_curso_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prova public.provas%rowtype;
  v_progresso numeric;
  v_questoes jsonb;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select progresso into v_progresso
  from public.matriculas
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and status in ('ATIVA', 'CONCLUIDA')
  limit 1;

  if not found then
    raise exception 'Matrícula não encontrada';
  end if;

  if coalesce(v_progresso, 0) < 100 then
    raise exception 'Conclua os módulos antes de iniciar a prova';
  end if;

  select * into v_prova
  from public.provas
  where curso_id = p_curso_id
  order by id
  limit 1;

  if v_prova.id is null then
    return jsonb_build_object('encontrada', false, 'mensagem', 'Nenhuma prova cadastrada para este curso.');
  end if;

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
    'nota_minima', 70,
    'questoes', v_questoes
  );
end;
$$;

-- Correção dentro do banco: o gabarito nunca precisa ir para o navegador.
create or replace function public.finalizar_prova(p_prova_id bigint, p_respostas jsonb)
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
  v_aprovado boolean;
  v_tentativa integer;
  v_resultado_id bigint;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if jsonb_typeof(p_respostas) <> 'array' then
    raise exception 'Formato de respostas inválido';
  end if;

  select curso_id into v_curso_id
  from public.provas
  where id = p_prova_id;

  if v_curso_id is null then
    raise exception 'Prova não encontrada';
  end if;

  if not exists (
    select 1 from public.matriculas
    where aluno_id = v_uid
      and curso_id = v_curso_id
      and progresso >= 100
  ) then
    raise exception 'Conclua o curso antes de finalizar a prova';
  end if;

  select count(*) into v_total
  from public.questoes
  where prova_id = p_prova_id;

  select count(*) into v_respondidas
  from (
    select distinct (r.item->>'questao_id')::bigint as questao_id
    from jsonb_array_elements(p_respostas) as r(item)
    join public.questoes q
      on q.id = (r.item->>'questao_id')::bigint
     and q.prova_id = p_prova_id
    where upper(r.item->>'resposta') in ('A', 'B', 'C', 'D')
  ) respostas_validas;

  if v_total = 0 then
    raise exception 'A prova não possui questões';
  end if;

  if v_respondidas <> v_total then
    raise exception 'Responda todas as questões antes de finalizar';
  end if;

  select count(*) into v_acertos
  from jsonb_array_elements(p_respostas) as r(item)
  join public.questoes q
    on q.id = (r.item->>'questao_id')::bigint
   and q.prova_id = p_prova_id
  where upper(r.item->>'resposta') = upper(q.correta);

  v_nota := round((v_acertos::numeric / v_total::numeric) * 100, 0);
  v_aprovado := v_nota >= 70;

  select coalesce(max(tentativa), 0) + 1 into v_tentativa
  from public.resultados_provas
  where aluno_id = v_uid
    and prova_id = p_prova_id;

  insert into public.resultados_provas
    (aluno_id, curso_id, prova_id, nota, total_questoes, acertos, aprovado, tentativa, criado_em, finalizado_em)
  values
    (v_uid, v_curso_id, p_prova_id, v_nota, v_total, v_acertos, v_aprovado, v_tentativa, now(), now())
  returning id into v_resultado_id;

  insert into public.respostas_prova
    (aluno_id, prova_id, questao_id, resposta, correto, resultado_id, criado_em)
  select
    v_uid,
    p_prova_id,
    q.id,
    upper(r.item->>'resposta'),
    upper(r.item->>'resposta') = upper(q.correta),
    v_resultado_id,
    now()
  from jsonb_array_elements(p_respostas) as r(item)
  join public.questoes q
    on q.id = (r.item->>'questao_id')::bigint
   and q.prova_id = p_prova_id;

  return jsonb_build_object(
    'resultado_id', v_resultado_id,
    'tentativa', v_tentativa,
    'nota', v_nota,
    'acertos', v_acertos,
    'total_questoes', v_total,
    'aprovado', v_aprovado,
    'nota_minima', 70
  );
end;
$$;

-- Emissão autorizada somente após curso e prova concluídos.
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

  select * into v_aluno
  from public.alunos
  where user_id = v_uid;

  select c.* into v_curso
  from public.cursos c
  join public.matriculas m on m.curso_id = c.id
  where c.id = p_curso_id
    and m.aluno_id = v_uid
    and m.progresso >= 100
  limit 1;

  if v_curso.id is null then
    raise exception 'Curso ainda não foi concluído';
  end if;

  select * into v_resultado
  from public.resultados_provas
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and aprovado = true
    and nota >= 70
  order by nota desc, criado_em desc
  limit 1;

  if v_resultado.id is null then
    raise exception 'Aprovação na prova ainda não registrada';
  end if;

  select * into v_cert
  from public.certificados
  where aluno_id = v_uid
    and curso_id = p_curso_id
    and status = 'EMITIDO'
  order by id desc
  limit 1;

  if v_cert.id is null then
    v_numero := 'ALT-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(v_codigo::text, '-', ''), 1, 12));

    insert into public.certificados
      (aluno_id, curso_id, status, emitido_em, horas_emitidas, criado_em,
       codigo_validacao, numero_certificado, nome_aluno, nome_curso, nota_final, atualizado_em)
    values
      (v_uid, p_curso_id, 'EMITIDO', now(), coalesce(v_curso.carga_horaria, 0), now(),
       v_codigo, v_numero, v_aluno.nome, v_curso.titulo, v_resultado.nota, now())
    returning * into v_cert;
  end if;

  return to_jsonb(v_cert);
end;
$$;

-- Consulta pública usada pelo QR Code. Retorna somente os dados necessários à autenticação.
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
      'mensagem', 'Certificado não encontrado na base oficial da ALTITUDE CENTRO UNIVERSITÁRIO.'
    );
  end if;

  v_valido := v_cert.status = 'EMITIDO'
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
    'emitido_em', v_cert.emitido_em,
    'valido_ate', v_cert.valido_ate,
    'mensagem', case
      when v_valido then 'Certificado autêntico e válido.'
      else 'O registro existe, mas o certificado não está válido.'
    end
  );
end;
$$;

-- Proteção dos registros acadêmicos: alunos apenas consultam os próprios dados.
alter table public.certificados enable row level security;
alter table public.resultados_provas enable row level security;
alter table public.respostas_prova enable row level security;
alter table public.progresso_modulos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'certificados' and policyname = 'aluno_le_proprios_certificados'
  ) then
    execute 'create policy aluno_le_proprios_certificados on public.certificados for select to authenticated using (aluno_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'resultados_provas' and policyname = 'aluno_le_proprios_resultados'
  ) then
    execute 'create policy aluno_le_proprios_resultados on public.resultados_provas for select to authenticated using (aluno_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'respostas_prova' and policyname = 'aluno_le_proprias_respostas'
  ) then
    execute 'create policy aluno_le_proprias_respostas on public.respostas_prova for select to authenticated using (aluno_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'progresso_modulos' and policyname = 'aluno_le_proprio_progresso'
  ) then
    execute 'create policy aluno_le_proprio_progresso on public.progresso_modulos for select to authenticated using (aluno_id = auth.uid())';
  end if;
end $$;

revoke insert, update, delete on public.certificados from anon, authenticated;
revoke insert, update, delete on public.resultados_provas from anon, authenticated;
revoke insert, update, delete on public.respostas_prova from anon, authenticated;
revoke insert, update, delete on public.progresso_modulos from anon, authenticated;

revoke all on function public.obter_modulos_curso(bigint) from public;
revoke all on function public.marcar_modulo_concluido(bigint) from public;
revoke all on function public.concluir_conteudo_geral(bigint) from public;
revoke all on function public.obter_prova_aluno(bigint) from public;
revoke all on function public.finalizar_prova(bigint, jsonb) from public;
revoke all on function public.emitir_certificado_curso(bigint) from public;
revoke all on function public.validar_certificado(text) from public;

grant execute on function public.obter_modulos_curso(bigint) to authenticated;
grant execute on function public.marcar_modulo_concluido(bigint) to authenticated;
grant execute on function public.concluir_conteudo_geral(bigint) to authenticated;
grant execute on function public.obter_prova_aluno(bigint) to authenticated;
grant execute on function public.finalizar_prova(bigint, jsonb) to authenticated;
grant execute on function public.emitir_certificado_curso(bigint) to authenticated;
grant execute on function public.validar_certificado(text) to anon, authenticated;
