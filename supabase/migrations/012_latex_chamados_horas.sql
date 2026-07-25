-- =============================================================================
-- ALTITUDE - ATUALIZACAO 12
-- Importacao de cursos em LaTeX, historico de chamados para o aluno,
-- resolucao comentada das provas e correcao da contagem de 8h por dia util.
-- Pode ser executada mais de uma vez.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. CAMPOS NECESSARIOS PARA LATEX, QUINTA ALTERNATIVA E RESOLUCAO
-- -----------------------------------------------------------------------------
alter table public.modulos
  add column if not exists conteudo_latex text;

alter table public.questoes
  add column if not exists e text,
  add column if not exists resolucao text,
  add column if not exists ordem integer,
  add column if not exists enunciado_latex text;

update public.questoes
set ordem = id::integer
where ordem is null;

-- Remove checks antigos que limitavam a resposta correta a A-D.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.questoes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%correta%'
  loop
    execute format('alter table public.questoes drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.questoes
  drop constraint if exists questoes_correta_altitude_check;
alter table public.questoes
  add constraint questoes_correta_altitude_check
  check (upper(trim(correta)) in ('A','B','C','D','E'));

create index if not exists questoes_prova_ordem_idx
  on public.questoes(prova_id, ordem, id);

-- -----------------------------------------------------------------------------
-- 2. CHAMADOS: O ALUNO LE TODO O HISTORICO E PODE RESPONDER
-- -----------------------------------------------------------------------------
alter table public.chamados enable row level security;
alter table public.chamado_interacoes enable row level security;

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
      and c.status not in ('CANCELADO')
  )
);

grant select, insert on public.chamado_interacoes to authenticated;

create or replace function public.aluno_detalhar_chamado(p_chamado_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_resultado jsonb;
begin
  if v_uid is null then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'chamado', to_jsonb(c),
    'interacoes', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.criado_em, i.id)
      from public.chamado_interacoes i
      where i.chamado_id = c.id
    ), '[]'::jsonb)
  )
  into v_resultado
  from public.chamados c
  where c.id = p_chamado_id
    and c.aluno_id = v_uid;

  if v_resultado is null then
    raise exception 'Chamado nao encontrado.' using errcode = 'P0002';
  end if;

  return v_resultado;
end;
$$;

create or replace function public.aluno_responder_chamado(
  p_chamado_id bigint,
  p_mensagem text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_chamado public.chamados%rowtype;
  v_mensagem text := trim(coalesce(p_mensagem, ''));
begin
  if v_uid is null then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;
  if length(v_mensagem) < 2 then
    raise exception 'Escreva uma mensagem valida.';
  end if;

  select * into v_chamado
  from public.chamados
  where id = p_chamado_id
    and aluno_id = v_uid
  for update;

  if not found then
    raise exception 'Chamado nao encontrado.' using errcode = 'P0002';
  end if;
  if v_chamado.status = 'CANCELADO' then
    raise exception 'Este chamado foi cancelado e nao aceita novas mensagens.';
  end if;

  insert into public.chamado_interacoes(chamado_id, autor_id, autor_tipo, mensagem)
  values (p_chamado_id, v_uid, 'ALUNO', v_mensagem);

  update public.chamados
  set status = case when status = 'RESOLVIDO' then 'EM_ANDAMENTO' else status end,
      atualizado_em = now(),
      resolvido_em = case when status = 'RESOLVIDO' then null else resolvido_em end
  where id = p_chamado_id;

  return public.aluno_detalhar_chamado(p_chamado_id);
end;
$$;

revoke all on function public.aluno_detalhar_chamado(bigint) from public;
revoke all on function public.aluno_responder_chamado(bigint,text) from public;
grant execute on function public.aluno_detalhar_chamado(bigint) to authenticated;
grant execute on function public.aluno_responder_chamado(bigint,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. CONTAGEM AUTOMATICA: SOMENTE DIAS UTEIS COMPLETOS
-- Ex.: matricula ontem = 8h hoje; matricula hoje = 0h.
-- O fuso utilizado e o de Belem/PA.
-- -----------------------------------------------------------------------------
create or replace function public.horas_automaticas_curso(p_aluno_id uuid, p_curso_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select least(
    greatest(0, coalesce(c.carga_horaria, 0)),
    public.dias_uteis_inclusivos(
      (m.criada_em at time zone 'America/Belem')::date,
      ((current_timestamp at time zone 'America/Belem')::date - 1)
    ) * 8
  )::integer
  from public.matriculas m
  join public.cursos c on c.id = m.curso_id
  where m.aluno_id = p_aluno_id
    and m.curso_id = p_curso_id
  order by m.criada_em asc, m.id asc
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 4. PROVA SEGURA COM A-E E RESOLUCAO SOMENTE DEPOIS DA ENTREGA
-- -----------------------------------------------------------------------------
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
    raise exception 'Usuario nao autenticado';
  end if;

  if not exists (
    select 1 from public.matriculas m
    where m.aluno_id = v_uid
      and m.curso_id = p_curso_id
      and m.status in ('ATIVA', 'CONCLUIDA')
      and m.progresso >= 100
  ) then
    raise exception 'Conclua todos os modulos antes de iniciar a prova';
  end if;

  select p.* into v_prova
  from public.provas p
  where p.curso_id = p_curso_id
  order by case when p.modulo_id is null then 0 else 1 end, p.id
  limit 1;

  if v_prova.id is null then
    return jsonb_build_object(
      'encontrada', false,
      'curso_id', p_curso_id,
      'mensagem', 'A prova ainda nao foi cadastrada.'
    );
  end if;

  select coalesce(c.nota_minima, 70) into v_nota_minima
  from public.cursos c where c.id = p_curso_id;

  -- Nao envia gabarito nem resolucao antes da entrega.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'enunciado', q.enunciado,
      'a', q.a,
      'b', q.b,
      'c', q.c,
      'd', q.d,
      'e', q.e
    ) order by coalesce(q.ordem, q.id::integer), q.id
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
  v_correcao jsonb;
begin
  if v_uid is null then
    raise exception 'Usuario nao autenticado';
  end if;
  if jsonb_typeof(coalesce(p_respostas, '[]'::jsonb)) <> 'array' then
    raise exception 'Formato de respostas invalido';
  end if;

  select p.curso_id, coalesce(c.nota_minima, 70)
  into v_curso_id, v_nota_minima
  from public.provas p
  join public.cursos c on c.id = p.curso_id
  where p.id = p_prova_id;

  if v_curso_id is null then
    raise exception 'Prova nao encontrada ou sem curso vinculado';
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

  select count(*) into v_total
  from public.questoes q where q.prova_id = p_prova_id;
  if v_total = 0 then raise exception 'A prova nao possui questoes'; end if;

  select count(*) into v_respondidas
  from (
    select distinct r.questao_id
    from jsonb_to_recordset(coalesce(p_respostas, '[]'::jsonb))
      as r(questao_id bigint, resposta text)
    join public.questoes q on q.id = r.questao_id and q.prova_id = p_prova_id
    where upper(trim(coalesce(r.resposta, ''))) in ('A','B','C','D','E')
  ) respostas_validas;

  if v_respondidas <> v_total then
    raise exception 'Responda todas as questoes antes de finalizar';
  end if;

  select count(*) into v_acertos
  from jsonb_to_recordset(coalesce(p_respostas, '[]'::jsonb))
    as r(questao_id bigint, resposta text)
  join public.questoes q on q.id = r.questao_id and q.prova_id = p_prova_id
  where upper(trim(r.resposta)) = upper(trim(q.correta));

  v_nota := round((v_acertos::numeric / v_total::numeric) * 100, 0);
  v_aprovado := v_nota >= v_nota_minima;

  select coalesce(max(tentativa), 0) + 1 into v_tentativa
  from public.resultados_provas
  where aluno_id = v_uid and prova_id = p_prova_id;

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
    v_uid, p_prova_id, q.id, upper(trim(r.resposta)),
    upper(trim(r.resposta)) = upper(trim(q.correta)),
    v_resultado_id, now()
  from jsonb_to_recordset(coalesce(p_respostas, '[]'::jsonb))
    as r(questao_id bigint, resposta text)
  join public.questoes q on q.id = r.questao_id and q.prova_id = p_prova_id;

  -- O gabarito e a resolucao sao devolvidos somente agora, apos a gravacao.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'questao_id', q.id,
      'enunciado', q.enunciado,
      'resposta_aluno', upper(trim(r.resposta)),
      'resposta_correta', upper(trim(q.correta)),
      'correto', upper(trim(r.resposta)) = upper(trim(q.correta)),
      'alternativa_correta', case upper(trim(q.correta))
        when 'A' then q.a when 'B' then q.b when 'C' then q.c
        when 'D' then q.d when 'E' then q.e else null end,
      'resolucao', coalesce(nullif(trim(q.resolucao), ''), 'Resolucao nao cadastrada.')
    ) order by coalesce(q.ordem, q.id::integer), q.id
  ), '[]'::jsonb)
  into v_correcao
  from jsonb_to_recordset(coalesce(p_respostas, '[]'::jsonb))
    as r(questao_id bigint, resposta text)
  join public.questoes q on q.id = r.questao_id and q.prova_id = p_prova_id;

  return jsonb_build_object(
    'resultado_id', v_resultado_id,
    'curso_id', v_curso_id,
    'prova_id', p_prova_id,
    'nota', v_nota,
    'nota_minima', v_nota_minima,
    'total_questoes', v_total,
    'acertos', v_acertos,
    'aprovado', v_aprovado,
    'tentativa', v_tentativa,
    'correcao', v_correcao
  );
end;
$$;

revoke all on function public.obter_prova_aluno(bigint) from public;
revoke all on function public.finalizar_prova(bigint,jsonb) from public;
grant execute on function public.obter_prova_aluno(bigint) to authenticated;
grant execute on function public.finalizar_prova(bigint,jsonb) to authenticated;

create or replace function public.obter_correcao_resultado_prova(p_resultado_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_resultado public.resultados_provas%rowtype;
  v_correcao jsonb;
begin
  if v_uid is null then raise exception 'Usuario nao autenticado'; end if;

  select * into v_resultado
  from public.resultados_provas
  where id = p_resultado_id and aluno_id = v_uid;
  if not found then raise exception 'Resultado nao encontrado.' using errcode = 'P0002'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'questao_id', q.id,
      'enunciado', q.enunciado,
      'resposta_aluno', r.resposta,
      'resposta_correta', upper(trim(q.correta)),
      'correto', r.correto,
      'alternativa_correta', case upper(trim(q.correta))
        when 'A' then q.a when 'B' then q.b when 'C' then q.c
        when 'D' then q.d when 'E' then q.e else null end,
      'resolucao', coalesce(nullif(trim(q.resolucao), ''), 'Resolucao nao cadastrada.')
    ) order by coalesce(q.ordem, q.id::integer), q.id
  ), '[]'::jsonb)
  into v_correcao
  from public.respostas_prova r
  join public.questoes q on q.id = r.questao_id
  where r.resultado_id = p_resultado_id
    and r.aluno_id = v_uid;

  return to_jsonb(v_resultado) || jsonb_build_object('correcao', v_correcao);
end;
$$;

revoke all on function public.obter_correcao_resultado_prova(bigint) from public;
grant execute on function public.obter_correcao_resultado_prova(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. IMPORTACAO ATOMICA DOS DADOS EXTRAIDOS DO LATEX
-- Os PDFs sao gerados no navegador e seus URLs chegam no JSON.
-- -----------------------------------------------------------------------------
create or replace function public.gestor_importar_curso_latex(
  p_curso_id bigint,
  p_payload jsonb,
  p_substituir boolean default false,
  p_publicar_modulos boolean default false,
  p_atualizar_curso boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso jsonb := coalesce(p_payload->'curso', '{}'::jsonb);
  v_modulo jsonb;
  v_questao jsonb;
  v_modulo_id bigint;
  v_primeiro_modulo_id bigint;
  v_prova_id bigint;
  v_modulos integer := 0;
  v_questoes integer := 0;
  v_ordem_questao integer := 0;
  v_tem_questoes boolean := false;
begin
  if auth.uid() is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito a gestao academica.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cursos where id = p_curso_id) then
    raise exception 'Curso nao encontrado.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_payload->'modulos', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload->'modulos', '[]'::jsonb)) = 0 then
    raise exception 'O arquivo LaTeX nao possui modulos validos.';
  end if;

  if coalesce(p_atualizar_curso, true) then
    update public.cursos
    set titulo = coalesce(nullif(trim(v_curso->>'titulo'), ''), titulo),
        categoria = coalesce(nullif(upper(trim(v_curso->>'categoria')), ''), categoria),
        carga_horaria = case
          when coalesce(v_curso->>'carga_horaria', '') ~ '^\d+$'
            then greatest(1, (v_curso->>'carga_horaria')::integer)
          else carga_horaria end,
        descricao = coalesce(nullif(trim(v_curso->>'descricao'), ''), descricao),
        nivel = case
          when upper(trim(coalesce(v_curso->>'nivel',''))) in ('BASICO','INTERMEDIARIO','AVANCADO')
            then upper(trim(v_curso->>'nivel')) else nivel end,
        nota_minima = case
          when coalesce(v_curso->>'nota_minima','') ~ '^\d+(\.\d+)?$'
            then least(100, greatest(0, (v_curso->>'nota_minima')::numeric))
          else nota_minima end,
        revisado_em = now()
    where id = p_curso_id;
  end if;

  if coalesce(p_substituir, false) then
    delete from public.materiais where curso_id = p_curso_id;
    delete from public.provas where curso_id = p_curso_id;
    delete from public.modulos where curso_id = p_curso_id;
  end if;

  for v_modulo in
    select value from jsonb_array_elements(p_payload->'modulos')
  loop
    insert into public.modulos(
      curso_id, titulo, descricao, conteudo, conteudo_latex,
      ordem, pdf_url, video_url, publicado, criado_em, updated_at
    ) values (
      p_curso_id,
      coalesce(nullif(trim(v_modulo->>'titulo'), ''), 'Modulo ' || (v_modulos + 1)),
      nullif(trim(v_modulo->>'descricao'), ''),
      nullif(v_modulo->>'conteudo', ''),
      nullif(v_modulo->>'conteudo_latex', ''),
      coalesce(nullif(v_modulo->>'ordem','')::integer, v_modulos + 1),
      nullif(trim(v_modulo->>'pdf_url'), ''),
      nullif(trim(v_modulo->>'video_url'), ''),
      coalesce(p_publicar_modulos, false),
      now(), now()
    ) returning id into v_modulo_id;

    if v_primeiro_modulo_id is null then v_primeiro_modulo_id := v_modulo_id; end if;
    v_modulos := v_modulos + 1;

    if nullif(trim(v_modulo->>'pdf_url'), '') is not null then
      insert into public.materiais(curso_id, modulo_id, tipo, titulo, url, criado_em)
      values (
        p_curso_id, v_modulo_id, 'PDF',
        'Apostila — ' || coalesce(nullif(trim(v_modulo->>'titulo'), ''), 'Modulo ' || v_modulos),
        trim(v_modulo->>'pdf_url'), now()
      );
    end if;

    if jsonb_typeof(coalesce(v_modulo->'questoes', '[]'::jsonb)) = 'array'
       and jsonb_array_length(coalesce(v_modulo->'questoes', '[]'::jsonb)) > 0 then
      v_tem_questoes := true;
    end if;
  end loop;

  if v_tem_questoes then
    insert into public.provas(curso_id, modulo_id, titulo, criado_em)
    values (
      p_curso_id,
      v_primeiro_modulo_id,
      coalesce(nullif(trim(v_curso->>'titulo'), ''), 'Curso') || ' — Avaliacao final',
      now()
    ) returning id into v_prova_id;

    for v_modulo in
      select value from jsonb_array_elements(p_payload->'modulos')
    loop
      for v_questao in
        select value from jsonb_array_elements(coalesce(v_modulo->'questoes', '[]'::jsonb))
      loop
        v_ordem_questao := v_ordem_questao + 1;
        insert into public.questoes(
          prova_id, enunciado, enunciado_latex,
          a, b, c, d, e, correta, resolucao, ordem
        ) values (
          v_prova_id,
          trim(v_questao->>'enunciado'),
          nullif(v_questao->>'enunciado_latex', ''),
          trim(v_questao->>'a'), trim(v_questao->>'b'),
          trim(v_questao->>'c'), trim(v_questao->>'d'),
          nullif(trim(v_questao->>'e'), ''),
          upper(trim(v_questao->>'correta')),
          nullif(trim(v_questao->>'resolucao'), ''),
          coalesce(nullif(v_questao->>'ordem','')::integer, v_ordem_questao)
        );
        v_questoes := v_questoes + 1;
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'curso_id', p_curso_id,
    'modulos_importados', v_modulos,
    'questoes_importadas', v_questoes,
    'prova_id', v_prova_id
  );
end;
$$;

revoke all on function public.gestor_importar_curso_latex(bigint,jsonb,boolean,boolean,boolean) from public;
grant execute on function public.gestor_importar_curso_latex(bigint,jsonb,boolean,boolean,boolean) to authenticated;

commit;

select 'Atualizacao 12 aplicada com sucesso' as resultado;
