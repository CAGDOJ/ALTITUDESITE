-- =============================================================================
-- ALTITUDE — ATUALIZAÇÃO FINAL V14 / CERTIFICADOS, ABAS E SINCRONIZAÇÃO
-- Corrige liberação de certificados, avaliações, conteúdo de módulos,
-- nomes em caixa alta e atualização em tempo real.
-- Pode ser executada mais de uma vez.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. CAMPOS NECESSÁRIOS
-- -----------------------------------------------------------------------------
alter table public.alunos
  add column if not exists atualizado_em timestamp with time zone not null default now(),
  add column if not exists codigo_carteirinha uuid default gen_random_uuid();

alter table public.modulos
  add column if not exists conteudo text,
  add column if not exists resumo text,
  add column if not exists carga_horaria integer default 0,
  add column if not exists updated_at timestamp with time zone default now();

alter table public.cursos
  add column if not exists nivel text default 'BASICO',
  add column if not exists nota_minima numeric default 70,
  add column if not exists avaliacao_media numeric default 0,
  add column if not exists avaliacoes_total integer default 0,
  add column if not exists acessos_total integer default 0,
  add column if not exists matriculas_total integer default 0,
  add column if not exists destaque boolean default false;

alter table public.certificados
  add column if not exists codigo_validacao uuid default gen_random_uuid(),
  add column if not exists numero_certificado text,
  add column if not exists nome_aluno text,
  add column if not exists nome_curso text,
  add column if not exists nota_final numeric default 0,
  add column if not exists horas_solicitadas integer default 0,
  add column if not exists horas_emitidas integer default 0,
  add column if not exists solicitado_em timestamp with time zone,
  add column if not exists liberado_em timestamp with time zone,
  add column if not exists liberado_por uuid references auth.users(id),
  add column if not exists observacao_gestor text,
  add column if not exists periodo_inicio date,
  add column if not exists periodo_fim date,
  add column if not exists matricula_id bigint references public.matriculas(id),
  add column if not exists saldo_processado boolean not null default false,
  add column if not exists liberacao_excepcional boolean not null default false,
  add column if not exists atualizado_em timestamp with time zone default now();

-- -----------------------------------------------------------------------------
-- 2. NOMES SEMPRE EM CAIXA ALTA
-- -----------------------------------------------------------------------------
create or replace function public.altitude_nome_caixa_alta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.nome is not null then
    new.nome := upper(trim(regexp_replace(new.nome, '\s+', ' ', 'g')));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_alunos_nome_caixa_alta on public.alunos;
create trigger trg_alunos_nome_caixa_alta
before insert or update of nome on public.alunos
for each row execute function public.altitude_nome_caixa_alta();

do $$
begin
  if to_regclass('public.gestores') is not null then
    execute 'drop trigger if exists trg_gestores_nome_caixa_alta on public.gestores';
    execute 'create trigger trg_gestores_nome_caixa_alta before insert or update of nome on public.gestores for each row execute function public.altitude_nome_caixa_alta()';
  end if;
end $$;

update public.alunos set nome = upper(trim(regexp_replace(nome, '\s+', ' ', 'g'))) where nome is not null;
do $$ begin
  if to_regclass('public.gestores') is not null then
    execute 'update public.gestores set nome = upper(trim(regexp_replace(nome, ''\s+'', '' '', ''g''))) where nome is not null';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. AVALIAÇÃO DOS CURSOS APÓS CONCLUSÃO
-- -----------------------------------------------------------------------------
create table if not exists public.avaliacoes_cursos (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  curso_id bigint not null references public.cursos(id) on delete cascade,
  nota integer not null check (nota between 1 and 5),
  comentario text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint avaliacoes_cursos_aluno_curso_unique unique (aluno_id, curso_id)
);

create index if not exists avaliacoes_cursos_curso_idx
  on public.avaliacoes_cursos(curso_id, atualizado_em desc);

create or replace function public.atualizar_metricas_avaliacao_curso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_id bigint := coalesce(new.curso_id, old.curso_id);
begin
  update public.cursos c
  set avaliacao_media = coalesce((select round(avg(a.nota)::numeric, 2) from public.avaliacoes_cursos a where a.curso_id = v_curso_id), 0),
      avaliacoes_total = (select count(*)::integer from public.avaliacoes_cursos a where a.curso_id = v_curso_id)
  where c.id = v_curso_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_avaliacoes_cursos_metricas on public.avaliacoes_cursos;
create trigger trg_avaliacoes_cursos_metricas
after insert or update or delete on public.avaliacoes_cursos
for each row execute function public.atualizar_metricas_avaliacao_curso();

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
  v_aprovado boolean;
  v_progresso numeric;
  v_result public.avaliacoes_cursos%rowtype;
begin
  if v_uid is null then raise exception 'Entre no portal para avaliar o curso.'; end if;
  if p_nota < 1 or p_nota > 5 then raise exception 'A nota deve estar entre 1 e 5.'; end if;

  select m.progresso into v_progresso
  from public.matriculas m
  where m.aluno_id = v_uid and m.curso_id = p_curso_id
  order by m.criada_em desc limit 1;

  select exists(
    select 1 from public.resultados_provas r
    where r.aluno_id = v_uid and r.curso_id = p_curso_id and r.aprovado = true
  ) into v_aprovado;

  if coalesce(v_progresso, 0) < 100 or not coalesce(v_aprovado, false) then
    raise exception 'A avaliação é liberada após a conclusão e aprovação no curso.';
  end if;

  insert into public.avaliacoes_cursos(aluno_id, curso_id, nota, comentario)
  values (v_uid, p_curso_id, p_nota, nullif(trim(coalesce(p_comentario, '')), ''))
  on conflict (aluno_id, curso_id) do update
  set nota = excluded.nota,
      comentario = excluded.comentario,
      atualizado_em = now()
  returning * into v_result;

  return to_jsonb(v_result);
end;
$$;

alter table public.avaliacoes_cursos enable row level security;
drop policy if exists avaliacoes_leitura_publica_v12 on public.avaliacoes_cursos;
create policy avaliacoes_leitura_publica_v12 on public.avaliacoes_cursos for select using (true);
drop policy if exists aluno_gerencia_propria_avaliacao_v12 on public.avaliacoes_cursos;
create policy aluno_gerencia_propria_avaliacao_v12 on public.avaliacoes_cursos
for all to authenticated using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());
grant select on public.avaliacoes_cursos to anon, authenticated;
grant execute on function public.avaliar_curso(bigint, integer, text) to authenticated;

-- Recalcula médias existentes.
update public.cursos c
set avaliacao_media = coalesce((select round(avg(a.nota)::numeric, 2) from public.avaliacoes_cursos a where a.curso_id = c.id), 0),
    avaliacoes_total = (select count(*)::integer from public.avaliacoes_cursos a where a.curso_id = c.id);

-- -----------------------------------------------------------------------------
-- 4. CONTEÚDO COMPLETO DOS MÓDULOS PARA O PORTAL DO ALUNO
-- -----------------------------------------------------------------------------
create or replace function public.obter_modulos_curso_v12(p_curso_id bigint)
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
  if v_uid is null then raise exception 'Usuário não autenticado'; end if;

  select m.progresso into v_progresso
  from public.matriculas m
  where m.aluno_id=v_uid and m.curso_id=p_curso_id and m.status in ('ATIVA','CONCLUIDA')
  order by m.criada_em desc limit 1;
  if not found then raise exception 'Matrícula não encontrada'; end if;

  select count(*) into v_total from public.modulos md
  where md.curso_id=p_curso_id and coalesce(md.publicado,false)=true;

  if v_total=0 then
    return query
    select null::bigint, 'Conteúdo do curso'::text,
           coalesce(c.descricao,'Materiais disponibilizados para este curso.')::text,
           coalesce(c.descricao,'Conteúdo em preparação.')::text,
           1, null::text, null::text, coalesce(v_progresso,0)>=100,
           coalesce((select jsonb_agg(jsonb_build_object('id',mt.id,'tipo',mt.tipo,'titulo',mt.titulo,'url',mt.url) order by mt.id)
                     from public.materiais mt where mt.curso_id=p_curso_id), '[]'::jsonb)
    from public.cursos c where c.id=p_curso_id;
    return;
  end if;

  return query
  select md.id, md.titulo, md.descricao,
         coalesce(nullif(md.conteudo,''), nullif(md.resumo,''), md.descricao, 'Conteúdo em preparação.')::text,
         coalesce(md.ordem,1), md.pdf_url, md.video_url,
         coalesce(pm.concluido,false),
         coalesce((select jsonb_agg(jsonb_build_object('id',mt.id,'tipo',mt.tipo,'titulo',mt.titulo,'url',mt.url) order by mt.id)
                   from public.materiais mt where mt.curso_id=p_curso_id and mt.modulo_id=md.id), '[]'::jsonb)
  from public.modulos md
  left join public.progresso_modulos pm on pm.modulo_id=md.id and pm.aluno_id=v_uid
  where md.curso_id=p_curso_id and coalesce(md.publicado,false)=true
  order by coalesce(md.ordem,1), md.id;
end;
$$;

revoke all on function public.obter_modulos_curso_v12(bigint) from public;
grant execute on function public.obter_modulos_curso_v12(bigint) to authenticated;

drop function if exists public.obter_modulos_curso(bigint);
create or replace function public.obter_modulos_curso(p_curso_id bigint)
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
language sql
security definer
set search_path = public
as $$
  select * from public.obter_modulos_curso_v12(p_curso_id);
$$;

revoke all on function public.obter_modulos_curso(bigint) from public;
grant execute on function public.obter_modulos_curso(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. FUNÇÕES AUXILIARES PARA PERÍODO ACADÊMICO
-- -----------------------------------------------------------------------------
create or replace function public.altitude_proximo_dia_util(p_data date, p_indice integer)
returns date
language plpgsql
immutable
as $$
declare
  v_data date := p_data;
  v_contador integer := 0;
begin
  while extract(isodow from v_data) in (6,7) loop v_data := v_data + 1; end loop;
  while v_contador < greatest(0, p_indice) loop
    v_data := v_data + 1;
    if extract(isodow from v_data) not in (6,7) then v_contador := v_contador + 1; end if;
  end loop;
  return v_data;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. LIBERAÇÃO ROBUSTA DE CERTIFICADO PELO GESTOR
-- -----------------------------------------------------------------------------
create or replace function public.gestor_liberar_certificado_v12(
  p_certificado_id bigint,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_gestor_ok boolean := false;
  v_cert public.certificados%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_matricula public.matriculas%rowtype;
  v_horas integer;
  v_faltante integer;
  v_disponivel integer;
  v_codigo uuid;
  v_numero text;
  v_inicio date;
  v_fim date;
  v_usadas_antes integer;
begin
  if v_uid is null then raise exception 'Sessão do gestor não encontrada.' using errcode='42501'; end if;

  if to_regclass('public.gestores') is not null then
    select exists(
      select 1 from public.gestores g
      where g.user_id = v_uid and upper(g.status) = 'ATIVO' and coalesce(g.nivel_acesso,1) >= 2
    ) into v_gestor_ok;
  end if;
  if not v_gestor_ok then raise exception 'Acesso restrito à gestão acadêmica.' using errcode='42501'; end if;

  select * into v_cert from public.certificados where id = p_certificado_id for update;
  if not found then raise exception 'Certificado não encontrado.'; end if;
  if v_cert.status = 'EMITIDO' then return to_jsonb(v_cert); end if;

  -- Se já foi emitido e apenas bloqueado, reativa sem consumir as horas novamente.
  if v_cert.status in ('BLOQUEADO','CANCELADO')
     and coalesce(v_cert.horas_emitidas,0) > 0
     and coalesce(v_cert.saldo_processado,false) then
    update public.certificados
    set status='EMITIDO', liberado_em=now(), liberado_por=v_uid,
        observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''), atualizado_em=now()
    where id=v_cert.id returning * into v_cert;
    return to_jsonb(v_cert);
  end if;

  v_horas := greatest(0, coalesce(nullif(v_cert.horas_solicitadas,0), nullif(v_cert.horas_emitidas,0), 0));
  if v_horas < 5 or mod(v_horas,5) <> 0 then
    raise exception 'A solicitação precisa ter pelo menos 5 horas e estar em múltiplos de 5.';
  end if;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id=v_cert.aluno_id and curso_id=v_cert.curso_id
  for update;
  if not found then raise exception 'Valide primeiro as horas do aluno em Gerência de horas.'; end if;

  v_faltante := greatest(0, v_horas - coalesce(v_carteira.horas_reservadas,0));
  v_disponivel := greatest(0, coalesce(v_carteira.horas_validadas,0)-coalesce(v_carteira.horas_reservadas,0)-coalesce(v_carteira.horas_utilizadas,0));
  if v_faltante > v_disponivel then
    raise exception 'Saldo insuficiente. Disponível: %h; solicitado: %h.', v_disponivel, v_horas;
  end if;

  if v_faltante > 0 then
    update public.carteiras_horas_curso
    set horas_reservadas=horas_reservadas+v_faltante, atualizado_em=now()
    where id=v_carteira.id returning * into v_carteira;
  end if;

  select * into v_aluno from public.alunos where user_id=v_cert.aluno_id;
  select * into v_curso from public.cursos where id=v_cert.curso_id;
  select * into v_matricula
  from public.matriculas
  where aluno_id=v_cert.aluno_id and curso_id=v_cert.curso_id
  order by criada_em asc, id asc limit 1;
  if v_matricula.id is null then raise exception 'Matrícula do aluno não encontrada.'; end if;

  v_usadas_antes := coalesce(v_carteira.horas_utilizadas,0);
  v_inicio := public.altitude_proximo_dia_util(v_matricula.criada_em::date, floor(v_usadas_antes/8.0)::integer);
  v_fim := public.altitude_proximo_dia_util(v_matricula.criada_em::date, floor((v_usadas_antes+v_horas-1)/8.0)::integer);

  if v_fim > current_date then
    if not coalesce(v_carteira.liberacao_excepcional,false) then
      raise exception 'O período disponível ainda não comporta %h. Marque liberação excepcional na carteira para credenciar a carga.', v_horas;
    end if;
    v_fim := current_date;
    v_inicio := greatest(v_matricula.criada_em::date, least(v_inicio,current_date));
  end if;

  v_codigo := coalesce(v_cert.codigo_validacao, gen_random_uuid());
  v_numero := coalesce(nullif(v_cert.numero_certificado,''), 'ALT-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(v_codigo::text,'-',''),1,12)));

  update public.carteiras_horas_curso
  set horas_reservadas=greatest(0,horas_reservadas-v_horas),
      horas_utilizadas=horas_utilizadas+v_horas,
      atualizado_em=now()
  where id=v_carteira.id returning * into v_carteira;

  update public.certificados
  set status='EMITIDO', horas_emitidas=v_horas, horas_solicitadas=v_horas,
      codigo_validacao=v_codigo, numero_certificado=v_numero,
      nome_aluno=coalesce(v_aluno.nome,nome_aluno), nome_curso=coalesce(v_curso.titulo,nome_curso),
      emitido_em=coalesce(emitido_em,now()), liberado_em=now(), liberado_por=v_uid,
      observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),
      periodo_inicio=v_inicio, periodo_fim=v_fim,
      saldo_processado=true, atualizado_em=now(), matricula_id=coalesce(matricula_id,v_matricula.id)
  where id=v_cert.id returning * into v_cert;

  if to_regclass('public.movimentacoes_horas') is not null then
    insert into public.movimentacoes_horas(
      carteira_id,aluno_id,curso_id,certificado_id,tipo,horas,
      saldo_validado,saldo_reservado,saldo_utilizado,observacao,realizado_por
    ) values(
      v_carteira.id,v_cert.aluno_id,v_cert.curso_id,v_cert.id,'LIBERACAO_CERTIFICADO',v_horas,
      v_carteira.horas_validadas,v_carteira.horas_reservadas,v_carteira.horas_utilizadas,
      coalesce(nullif(trim(coalesce(p_observacao,'')),''),format('Certificado de %s horas liberado.',v_horas)),v_uid
    );
  end if;

  return to_jsonb(v_cert);
end;
$$;

revoke all on function public.gestor_liberar_certificado_v12(bigint,text) from public;
grant execute on function public.gestor_liberar_certificado_v12(bigint,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. PERMISSÕES DE CONTEÚDO PARA GESTORES
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.cursos to authenticated;
grant select, insert, update, delete on public.modulos to authenticated;
grant select, insert, update, delete on public.materiais to authenticated;
grant select, insert, update, delete on public.provas to authenticated;
grant select, insert, update, delete on public.questoes to authenticated;
grant select, update on public.certificados to authenticated;

-- -----------------------------------------------------------------------------
-- 8. ATUALIZAÇÃO EM TEMPO REAL
-- -----------------------------------------------------------------------------
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'cursos','modulos','materiais','provas','questoes','matriculas',
    'progresso_modulos','resultados_provas','certificados','chamados',
    'chamado_interacoes','avaliacoes_cursos'
  ] loop
    if to_regclass('public.'||v_tabela) is not null then
      begin
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      exception when duplicate_object then null;
      end;
    end if;
  end loop;
end $$;



-- -----------------------------------------------------------------------------
-- 9. REASSOCIA O PRIMEIRO GESTOR E MANTÉM O NOME EM CAIXA ALTA
-- -----------------------------------------------------------------------------
do $$
declare
  v_uid uuid;
begin
  if to_regclass('public.gestores') is not null then
    select id into v_uid
    from auth.users
    where lower(email)=lower('altitudesecretaria@gmail.com')
    order by created_at desc
    limit 1;

    if v_uid is not null then
      update public.gestores
      set user_id=v_uid,
          gestor_id='GST-2026-0001',
          nome='SECRETARIA ALTITUDE',
          email='altitudesecretaria@gmail.com',
          cargo='GESTOR',
          nivel_acesso=4,
          status='ATIVO',
          atualizado_em=now()
      where lower(email)=lower('altitudesecretaria@gmail.com')
         or gestor_id='GST-2026-0001';

      if not found then
        insert into public.gestores(
          user_id,gestor_id,nome,email,cargo,nivel_acesso,status,criado_em,atualizado_em
        ) values(
          v_uid,'GST-2026-0001','SECRETARIA ALTITUDE','altitudesecretaria@gmail.com',
          'GESTOR',4,'ATIVO',now(),now()
        );
      end if;
    end if;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 10. CONTEÚDO DOS DOIS MÓDULOS JÁ CADASTRADOS
-- -----------------------------------------------------------------------------
update public.modulos
set conteudo = $conteudo$
1. O que é computador
Um computador é um equipamento eletrônico capaz de receber, processar, armazenar e apresentar informações. Hardware corresponde à parte física, como processador, memória, HD ou SSD, teclado, mouse e monitor. Software corresponde aos programas e ao sistema operacional.

2. Ligar e desligar com segurança
O sistema deve ser iniciado e encerrado pelos comandos próprios do sistema operacional. Desligar diretamente pela tomada ou pelo botão de energia pode provocar perda de dados e danos aos arquivos.

3. Ambiente do sistema operacional
A área de trabalho, a barra de tarefas, o menu iniciar, os ícones e as janelas são elementos comuns em sistemas como Windows, macOS e Linux. O aluno deve aprender a localizar programas, alternar janelas e reconhecer as principais áreas da tela.

4. Operações com janelas
É possível abrir, minimizar, maximizar, fechar, redimensionar e organizar janelas lado a lado. Essas ações ajudam a trabalhar com mais de um programa ao mesmo tempo.

5. Mouse e teclado
Os principais comandos incluem clique simples, clique duplo, clique direito, arrastar e soltar e rolagem. Atalhos úteis: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+A, Ctrl+S e Alt+Tab.

6. Arquivos e pastas
O aluno deve saber criar pastas, salvar, renomear, copiar, mover, excluir e restaurar arquivos. Extensões como .docx, .pdf, .jpg e .xlsx indicam diferentes tipos de arquivo.

7. Busca, organização e acessibilidade
Use nomes claros, subpastas e a busca do sistema. Recursos como aumento de fonte, contraste, leitor de tela, teclado virtual, brilho e volume tornam o uso mais confortável.

8. Manutenção e segurança
Mantenha o sistema e os programas atualizados, utilize proteção contra ameaças, faça limpeza física simples e tenha cuidado ao conectar pendrives.

Atividade prática: crie uma pasta, organize três arquivos diferentes, copie um texto com Ctrl+C/Ctrl+V, ajuste o tamanho da fonte e restaure um arquivo da lixeira.
$conteudo$,
    resumo='Fundamentos do computador, sistema operacional, arquivos, acessibilidade e segurança.',
    pdf_url='https://www.portalaltitude.com.br/Projeto/5-materiais/apostila-modulo-1-fundamentos-do-computador-e-sistema-operacional.pdf',
    publicado=true,
    updated_at=now()
where lower(titulo) like '%fundamentos do computador%'
   or lower(titulo) like '%sistema operacional%';

update public.modulos
set conteudo = $conteudo$
1. Conceitos básicos da internet
Navegador é o programa usado para acessar sites. URL é o endereço de uma página. Endereços iniciados por https indicam conexão protegida. Redes públicas exigem cuidados adicionais.

2. Navegação
Aprenda a abrir abas, usar a barra de endereços, salvar favoritos, consultar o histórico, realizar downloads e limpar cache e cookies quando necessário.

3. Buscas eficientes
Use palavras-chave específicas, filtros por data ou tipo de arquivo e verifique autor, data, referências e contato da fonte antes de confiar em uma informação.

4. E-mail
Escreva assuntos claros, use saudação e assinatura, anexe arquivos com atenção e entenda os campos Para, Cc e Cco. Organize mensagens em pastas ou marcadores.

5. Segurança e privacidade
Desconfie de links e anexos inesperados, use senhas fortes, ative verificação em duas etapas e evite expor dados pessoais em redes públicas.

6. Armazenamento em nuvem
Serviços como Google Drive e OneDrive permitem salvar, sincronizar e compartilhar arquivos. Revise as permissões de visualização, comentário e edição.

7. Produtividade
Crie documentos, aplique formatação, exporte em PDF e utilize planilhas básicas, incluindo inserção de dados e fórmulas simples como SOMA.

8. Comunicação online
Em videoconferências, controle microfone e câmera, utilize o chat com responsabilidade e compartilhe a tela somente quando necessário.

9. Boas práticas
Faça backups, mantenha senhas seguras, revise permissões de aplicativos e atualize programas.

Atividade prática: envie um e-mail com anexo, salve uma fonte confiável nos favoritos, produza um documento em PDF e crie uma planilha simples com soma.
$conteudo$,
    resumo='Internet, e-mail, segurança, nuvem, comunicação e produtividade digital.',
    pdf_url='https://www.portalaltitude.com.br/Projeto/5-materiais/apostila-modulo-2-internet-comunicacao-e-produtividade-digital.pdf',
    publicado=true,
    updated_at=now()
where lower(titulo) like '%internet%comunica%'
   or lower(titulo) like '%produtividade digital%';

insert into public.materiais(curso_id,modulo_id,tipo,titulo,url)
select m.curso_id,m.id,'PDF','Apostila — '||m.titulo,m.pdf_url
from public.modulos m
where m.pdf_url like 'https://www.portalaltitude.com.br/Projeto/5-materiais/%'
  and not exists(
    select 1 from public.materiais mt
    where mt.modulo_id=m.id and mt.tipo='PDF' and mt.url=m.pdf_url
  );

-- -----------------------------------------------------------------------------
-- 11. LIBERAÇÃO DIRETA E ROBUSTA DE CERTIFICADOS
-- -----------------------------------------------------------------------------
create or replace function public.gestor_liberar_certificado_v13(
  p_certificado_id bigint,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_cert public.certificados%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_matricula public.matriculas%rowtype;
  v_horas integer;
  v_auto integer := 0;
  v_disponivel integer;
  v_codigo uuid;
  v_numero text;
  v_inicio date;
  v_fim date;
  v_usadas_antes integer;
begin
  if v_uid is null or not public.e_gestor(2) then
    raise exception 'Acesso restrito à gestão acadêmica.' using errcode='42501';
  end if;

  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if not found then raise exception 'Certificado não encontrado.'; end if;
  if upper(v_cert.status)='EMITIDO' then return to_jsonb(v_cert); end if;

  if upper(v_cert.status) in ('BLOQUEADO','CANCELADO')
     and coalesce(v_cert.horas_emitidas,0)>0
     and coalesce(v_cert.saldo_processado,false) then
    update public.certificados
    set status='EMITIDO',liberado_em=now(),liberado_por=v_uid,
        observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),
        atualizado_em=now()
    where id=v_cert.id returning * into v_cert;
    return to_jsonb(v_cert);
  end if;

  v_horas := greatest(0,coalesce(nullif(v_cert.horas_solicitadas,0),nullif(v_cert.horas_emitidas,0),0));
  if v_horas<5 or mod(v_horas,5)<>0 then
    raise exception 'A solicitação deve ter pelo menos 5 horas e estar em múltiplos de 5.';
  end if;

  select * into v_matricula
  from public.matriculas
  where aluno_id=v_cert.aluno_id and curso_id=v_cert.curso_id
  order by criada_em asc,id asc limit 1;
  if v_matricula.id is null then raise exception 'Matrícula do aluno não encontrada.'; end if;

  begin
    v_auto := coalesce(public.horas_automaticas_curso(v_cert.aluno_id,v_cert.curso_id),0);
  exception when undefined_function then
    v_auto := least(v_horas,greatest(0,((current_date-v_matricula.criada_em::date)+1)*8));
  end;

  insert into public.carteiras_horas_curso(aluno_id,curso_id)
  values(v_cert.aluno_id,v_cert.curso_id)
  on conflict(aluno_id,curso_id) do nothing;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id=v_cert.aluno_id and curso_id=v_cert.curso_id
  for update;

  -- O clique em “Validar e liberar” também valida automaticamente a carga
  -- quando ela está dentro do limite normal de 8h por dia útil.
  if v_carteira.horas_validadas < v_carteira.horas_utilizadas+v_carteira.horas_reservadas+v_horas then
    if v_horas<=v_auto then
      update public.carteiras_horas_curso
      set horas_validadas=v_carteira.horas_utilizadas+v_carteira.horas_reservadas+v_horas,
          validado_por=v_uid,validado_em=now(),atualizado_em=now()
      where id=v_carteira.id returning * into v_carteira;
    elsif not coalesce(v_carteira.liberacao_excepcional,false) then
      raise exception 'O limite automático atual é %h. Abra Gerência de horas, marque a liberação excepcional e justifique para liberar %h.',
        v_auto,v_horas;
    end if;
  end if;

  v_disponivel := greatest(0,v_carteira.horas_validadas-v_carteira.horas_reservadas-v_carteira.horas_utilizadas);
  if v_carteira.horas_reservadas<v_horas and v_disponivel>0 then
    update public.carteiras_horas_curso
    set horas_reservadas=least(horas_validadas-horas_utilizadas,horas_reservadas+least(v_horas-horas_reservadas,v_disponivel)),
        atualizado_em=now()
    where id=v_carteira.id returning * into v_carteira;
  end if;

  if v_carteira.horas_reservadas<v_horas then
    raise exception 'Saldo insuficiente. Validadas: %h; reservadas: %h; utilizadas: %h; solicitado: %h.',
      v_carteira.horas_validadas,v_carteira.horas_reservadas,v_carteira.horas_utilizadas,v_horas;
  end if;

  select * into v_aluno from public.alunos where user_id=v_cert.aluno_id;
  select * into v_curso from public.cursos where id=v_cert.curso_id;

  v_usadas_antes:=coalesce(v_carteira.horas_utilizadas,0);
  v_inicio:=public.altitude_proximo_dia_util(v_matricula.criada_em::date,floor(v_usadas_antes/8.0)::integer);
  v_fim:=public.altitude_proximo_dia_util(v_matricula.criada_em::date,floor((v_usadas_antes+v_horas-1)/8.0)::integer);
  if v_fim>current_date then
    if not coalesce(v_carteira.liberacao_excepcional,false) then
      raise exception 'O período acadêmico ainda não comporta %h. Use a liberação excepcional na Gerência de horas.',v_horas;
    end if;
    v_fim:=current_date;
    v_inicio:=greatest(v_matricula.criada_em::date,least(v_inicio,current_date));
  end if;

  v_codigo:=coalesce(v_cert.codigo_validacao,gen_random_uuid());
  v_numero:=coalesce(nullif(v_cert.numero_certificado,''),
    'ALT-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(v_codigo::text,'-',''),1,12)));

  update public.carteiras_horas_curso
  set horas_reservadas=greatest(0,horas_reservadas-v_horas),
      horas_utilizadas=horas_utilizadas+v_horas,
      atualizado_em=now()
  where id=v_carteira.id returning * into v_carteira;

  update public.certificados
  set status='EMITIDO',horas_emitidas=v_horas,horas_solicitadas=v_horas,
      codigo_validacao=v_codigo,numero_certificado=v_numero,
      nome_aluno=upper(coalesce(v_aluno.nome,nome_aluno)),
      nome_curso=coalesce(v_curso.titulo,nome_curso),
      emitido_em=coalesce(emitido_em,now()),liberado_em=now(),liberado_por=v_uid,
      observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),
      periodo_inicio=v_inicio,periodo_fim=v_fim,
      saldo_processado=true,atualizado_em=now(),
      matricula_id=coalesce(matricula_id,v_matricula.id)
  where id=v_cert.id returning * into v_cert;

  if to_regclass('public.movimentacoes_horas') is not null then
    insert into public.movimentacoes_horas(
      carteira_id,aluno_id,curso_id,certificado_id,tipo,horas,
      saldo_validado,saldo_reservado,saldo_utilizado,observacao,realizado_por
    ) values(
      v_carteira.id,v_cert.aluno_id,v_cert.curso_id,v_cert.id,
      'LIBERACAO_CERTIFICADO',v_horas,
      v_carteira.horas_validadas,v_carteira.horas_reservadas,v_carteira.horas_utilizadas,
      coalesce(nullif(trim(coalesce(p_observacao,'')),''),
        format('Certificado de %s horas validado e liberado.',v_horas)),v_uid
    );
  end if;

  return to_jsonb(v_cert);
end;
$$;

create or replace function public.gestor_liberar_certificado_direto(
  p_certificado_id bigint,
  p_observacao text default null
)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select public.gestor_liberar_certificado_v13(p_certificado_id,p_observacao);
$$;

revoke all on function public.gestor_liberar_certificado_v13(bigint,text) from public;
revoke all on function public.gestor_liberar_certificado_direto(bigint,text) from public;
grant execute on function public.gestor_liberar_certificado_v13(bigint,text) to authenticated;
grant execute on function public.gestor_liberar_certificado_direto(bigint,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 12. TEMPO REAL PARA ALUNO E GESTÃO
-- -----------------------------------------------------------------------------
do $$
declare v_tabela text;
begin
  foreach v_tabela in array array[
    'alunos','gestores','cursos','modulos','materiais','provas','questoes',
    'matriculas','progresso_modulos','resultados_provas','certificados',
    'certificados_historico','carteiras_horas_curso','movimentacoes_horas',
    'chamados','chamado_interacoes','avaliacoes_cursos'
  ] loop
    if to_regclass('public.'||v_tabela) is not null then
      begin
        execute format('alter table public.%I replica identity full',v_tabela);
      exception when others then null;
      end;
      begin
        execute format('alter publication supabase_realtime add table public.%I',v_tabela);
      exception when duplicate_object then null;
      when others then null;
      end;
    end if;
  end loop;
end $$;

commit;


-- =============================================================================
-- ALTITUDE — CORREÇÕES COMPLEMENTARES V14
-- Status do certificado, catálogo profissional/técnico, RLS e tempo real.
-- Pode ser executado novamente com segurança.
-- =============================================================================

begin;

alter table public.cursos
  add column if not exists tipo_curso text not null default 'PROFISSIONAL',
  add column if not exists visualizacoes bigint not null default 0,
  add column if not exists cliques bigint not null default 0,
  add column if not exists publicado_em timestamp with time zone;

create table if not exists public.gestores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gestor_id text not null unique,
  nome text not null,
  email text not null unique,
  telefone text,
  cargo text not null default 'GESTOR',
  nivel_acesso integer not null default 1,
  status text not null default 'ATIVO',
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

create or replace function public.e_gestor(p_nivel_minimo integer default 1)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.gestores g
    where g.user_id=auth.uid()
      and upper(coalesce(g.status,'INATIVO'))='ATIVO'
      and coalesce(g.nivel_acesso,1)>=greatest(1,least(4,coalesce(p_nivel_minimo,1)))
  );
$$;
revoke all on function public.e_gestor(integer) from public;
grant execute on function public.e_gestor(integer) to anon,authenticated;

update public.cursos
set tipo_curso = case
  when upper(coalesce(tipo_curso,''))='TECNICO' then 'TECNICO'
  else 'PROFISSIONAL'
end;

alter table public.cursos drop constraint if exists cursos_tipo_curso_check;
alter table public.cursos
  add constraint cursos_tipo_curso_check
  check (upper(tipo_curso) in ('PROFISSIONAL','TECNICO'));

-- Catálogo público com distinção entre cursos profissionais e técnicos.
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
  criado_em timestamp with time zone,
  tipo_curso text
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
    coalesce(c.nivel,'BASICO'),
    coalesce(c.nota_minima,70),
    coalesce(c.destaque,false),
    coalesce(c.visualizacoes,0)::bigint,
    coalesce(c.cliques,0)::bigint,
    coalesce(c.matriculas_total,0)::bigint,
    coalesce(c.avaliacao_media,0),
    coalesce(c.avaliacoes_total,0)::bigint,
    (select count(*) from public.modulos md where md.curso_id=c.id and coalesce(md.publicado,false)=true),
    (select count(*) from public.materiais mt where mt.curso_id=c.id),
    (select count(*) from public.questoes q join public.provas p on p.id=q.prova_id where p.curso_id=c.id),
    c.criado_em,
    upper(coalesce(c.tipo_curso,'PROFISSIONAL'))
  from public.cursos c
  where c.publicado=true
  order by c.destaque desc,
           (coalesce(c.matriculas_total,0)*4 + coalesce(c.cliques,0) + coalesce(c.visualizacoes,0)/4) desc,
           c.avaliacao_media desc,
           c.criado_em desc;
$$;

revoke all on function public.listar_cursos_publicos() from public;
grant execute on function public.listar_cursos_publicos() to anon, authenticated;

-- Garante o histórico de status caso atualizações antigas não tenham criado o trigger.
create table if not exists public.certificados_historico (
  id bigint generated always as identity primary key,
  certificado_id bigint not null references public.certificados(id) on delete cascade,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  curso_id bigint not null references public.cursos(id) on delete cascade,
  acao text not null,
  status_anterior text,
  status_novo text not null,
  observacao text,
  realizado_por uuid references auth.users(id),
  criado_em timestamp with time zone not null default now()
);

create or replace function public.registrar_historico_certificado()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='INSERT' then
    insert into public.certificados_historico
      (certificado_id,aluno_id,curso_id,acao,status_anterior,status_novo,observacao,realizado_por)
    values
      (new.id,new.aluno_id,new.curso_id,
       case upper(new.status) when 'EMITIDO' then 'LIBERADO' when 'PENDENTE' then 'SOLICITADO' else upper(new.status) end,
       null,upper(new.status),new.observacao_gestor,auth.uid());
  elsif old.status is distinct from new.status
     or old.observacao_gestor is distinct from new.observacao_gestor then
    insert into public.certificados_historico
      (certificado_id,aluno_id,curso_id,acao,status_anterior,status_novo,observacao,realizado_por)
    values
      (new.id,new.aluno_id,new.curso_id,
       case upper(new.status) when 'EMITIDO' then 'LIBERADO' when 'PENDENTE' then 'REABERTO' else upper(new.status) end,
       upper(old.status),upper(new.status),new.observacao_gestor,auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_certificados_historico on public.certificados;
create trigger trg_certificados_historico
after insert or update on public.certificados
for each row execute function public.registrar_historico_certificado();

-- Liberação V14: confirma no mesmo comando o status EMITIDO e devolve a linha atualizada.
create or replace function public.gestor_liberar_certificado_v14(
  p_certificado_id bigint,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_cert public.certificados%rowtype;
  v_carteira public.carteiras_horas_curso%rowtype;
  v_aluno public.alunos%rowtype;
  v_curso public.cursos%rowtype;
  v_matricula public.matriculas%rowtype;
  v_horas integer;
  v_auto integer:=0;
  v_faltante integer:=0;
  v_disponivel integer:=0;
  v_codigo uuid;
  v_numero text;
  v_inicio date;
  v_fim date;
  v_usadas integer:=0;
begin
  if v_uid is null or not exists(
    select 1 from public.gestores g
    where g.user_id=v_uid and upper(g.status)='ATIVO' and coalesce(g.nivel_acesso,1)>=2
  ) then
    raise exception 'Acesso restrito à gestão acadêmica.' using errcode='42501';
  end if;

  select * into v_cert from public.certificados where id=p_certificado_id for update;
  if not found then raise exception 'Certificado não encontrado.'; end if;

  if upper(coalesce(v_cert.status,''))='EMITIDO' then
    return to_jsonb(v_cert);
  end if;

  select * into v_aluno from public.alunos where user_id=v_cert.aluno_id;
  select * into v_curso from public.cursos where id=v_cert.curso_id;
  select * into v_matricula
  from public.matriculas
  where aluno_id=v_cert.aluno_id and curso_id=v_cert.curso_id
  order by criada_em asc,id asc limit 1;
  if v_matricula.id is null then raise exception 'Matrícula do aluno não encontrada.'; end if;

  v_horas:=greatest(0,coalesce(nullif(v_cert.horas_solicitadas,0),nullif(v_cert.horas_emitidas,0),0));
  if v_horas<5 or mod(v_horas,5)<>0 then
    raise exception 'A solicitação deve possuir pelo menos 5 horas e ser múltipla de 5.';
  end if;

  v_codigo:=coalesce(v_cert.codigo_validacao,gen_random_uuid());
  v_numero:=coalesce(nullif(v_cert.numero_certificado,''),
    'ALT-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(v_codigo::text,'-',''),1,12)));

  -- Reativação de certificado já processado não consome as horas novamente.
  if coalesce(v_cert.saldo_processado,false) and coalesce(v_cert.horas_emitidas,0)>0 then
    update public.certificados
    set status='EMITIDO',
        codigo_validacao=v_codigo,
        numero_certificado=v_numero,
        nome_aluno=upper(coalesce(v_aluno.nome,nome_aluno)),
        nome_curso=coalesce(v_curso.titulo,nome_curso),
        emitido_em=coalesce(emitido_em,now()),
        liberado_em=now(),
        liberado_por=v_uid,
        observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),
        atualizado_em=now()
    where id=v_cert.id
    returning * into v_cert;
    return to_jsonb(v_cert);
  end if;

  insert into public.carteiras_horas_curso(aluno_id,curso_id)
  values(v_cert.aluno_id,v_cert.curso_id)
  on conflict(aluno_id,curso_id) do nothing;

  select * into v_carteira
  from public.carteiras_horas_curso
  where aluno_id=v_cert.aluno_id and curso_id=v_cert.curso_id
  for update;

  begin
    v_auto:=coalesce(public.horas_automaticas_curso(v_cert.aluno_id,v_cert.curso_id),0);
  exception when undefined_function then
    v_auto:=least(coalesce(v_curso.carga_horaria,v_horas),greatest(0,((current_date-v_matricula.criada_em::date)+1)*8));
  end;

  if coalesce(v_carteira.horas_validadas,0)<coalesce(v_carteira.horas_utilizadas,0)+coalesce(v_carteira.horas_reservadas,0)+v_horas then
    if v_horas<=v_auto then
      update public.carteiras_horas_curso
      set horas_validadas=coalesce(horas_utilizadas,0)+coalesce(horas_reservadas,0)+v_horas,
          validado_por=v_uid,validado_em=now(),atualizado_em=now()
      where id=v_carteira.id returning * into v_carteira;
    elsif not coalesce(v_carteira.liberacao_excepcional,false) then
      raise exception 'O limite automático atual é %h. Use a Gerência de horas para credenciar excepcionalmente %h.',v_auto,v_horas;
    end if;
  end if;

  v_faltante:=greatest(0,v_horas-coalesce(v_carteira.horas_reservadas,0));
  v_disponivel:=greatest(0,coalesce(v_carteira.horas_validadas,0)-coalesce(v_carteira.horas_reservadas,0)-coalesce(v_carteira.horas_utilizadas,0));
  if v_faltante>v_disponivel then
    raise exception 'Saldo insuficiente. Validadas: %h; reservadas: %h; utilizadas: %h; solicitadas: %h.',
      v_carteira.horas_validadas,v_carteira.horas_reservadas,v_carteira.horas_utilizadas,v_horas;
  end if;

  if v_faltante>0 then
    update public.carteiras_horas_curso
    set horas_reservadas=coalesce(horas_reservadas,0)+v_faltante,atualizado_em=now()
    where id=v_carteira.id returning * into v_carteira;
  end if;

  v_usadas:=coalesce(v_carteira.horas_utilizadas,0);
  v_inicio:=public.altitude_proximo_dia_util(v_matricula.criada_em::date,floor(v_usadas/8.0)::integer);
  v_fim:=public.altitude_proximo_dia_util(v_matricula.criada_em::date,floor((v_usadas+v_horas-1)/8.0)::integer);
  if v_fim>current_date then
    if not coalesce(v_carteira.liberacao_excepcional,false) then
      raise exception 'O período acadêmico ainda não comporta %h. Use a liberação excepcional na Gerência de horas.',v_horas;
    end if;
    v_fim:=current_date;
    v_inicio:=greatest(v_matricula.criada_em::date,least(v_inicio,current_date));
  end if;

  update public.carteiras_horas_curso
  set horas_reservadas=greatest(0,coalesce(horas_reservadas,0)-v_horas),
      horas_utilizadas=coalesce(horas_utilizadas,0)+v_horas,
      atualizado_em=now()
  where id=v_carteira.id returning * into v_carteira;

  update public.certificados
  set status='EMITIDO',
      horas_emitidas=v_horas,
      horas_solicitadas=v_horas,
      codigo_validacao=v_codigo,
      numero_certificado=v_numero,
      nome_aluno=upper(coalesce(v_aluno.nome,nome_aluno)),
      nome_curso=coalesce(v_curso.titulo,nome_curso),
      emitido_em=coalesce(emitido_em,now()),
      liberado_em=now(),
      liberado_por=v_uid,
      observacao_gestor=nullif(trim(coalesce(p_observacao,'')),''),
      periodo_inicio=v_inicio,
      periodo_fim=v_fim,
      saldo_processado=true,
      atualizado_em=now(),
      matricula_id=coalesce(matricula_id,v_matricula.id)
  where id=v_cert.id returning * into v_cert;

  if upper(v_cert.status)<>'EMITIDO' then
    raise exception 'Falha de consistência: o certificado não foi confirmado como EMITIDO.';
  end if;

  if to_regclass('public.movimentacoes_horas') is not null then
    insert into public.movimentacoes_horas(
      carteira_id,aluno_id,curso_id,certificado_id,tipo,horas,
      saldo_validado,saldo_reservado,saldo_utilizado,observacao,realizado_por
    ) values(
      v_carteira.id,v_cert.aluno_id,v_cert.curso_id,v_cert.id,'LIBERACAO_CERTIFICADO',v_horas,
      v_carteira.horas_validadas,v_carteira.horas_reservadas,v_carteira.horas_utilizadas,
      coalesce(nullif(trim(coalesce(p_observacao,'')),''),format('Certificado de %s horas emitido e liberado.',v_horas)),v_uid
    );
  end if;

  return to_jsonb(v_cert);
end;
$$;

create or replace function public.gestor_liberar_certificado_direto(
  p_certificado_id bigint,
  p_observacao text default null
)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select public.gestor_liberar_certificado_v14(p_certificado_id,p_observacao);
$$;

revoke all on function public.gestor_liberar_certificado_v14(bigint,text) from public;
revoke all on function public.gestor_liberar_certificado_direto(bigint,text) from public;
grant execute on function public.gestor_liberar_certificado_v14(bigint,text) to authenticated;
grant execute on function public.gestor_liberar_certificado_direto(bigint,text) to authenticated;

-- Aluno lê todos os próprios certificados; gestão lê todos.
alter table public.certificados enable row level security;
drop policy if exists aluno_le_proprios_certificados on public.certificados;
create policy aluno_le_proprios_certificados on public.certificados
  for select to authenticated using(aluno_id=auth.uid());
drop policy if exists gestor_le_certificados on public.certificados;
create policy gestor_le_certificados on public.certificados
  for select to authenticated using(public.e_gestor(2));
grant select on public.certificados to authenticated;

alter table public.certificados_historico enable row level security;
drop policy if exists aluno_le_proprio_historico_certificados on public.certificados_historico;
create policy aluno_le_proprio_historico_certificados on public.certificados_historico
  for select to authenticated using(aluno_id=auth.uid());
drop policy if exists gestor_le_historico_certificados on public.certificados_historico;
create policy gestor_le_historico_certificados on public.certificados_historico
  for select to authenticated using(public.e_gestor(2));
grant select on public.certificados_historico to authenticated;

-- Realtime para atualização imediata do portal.
do $$
declare v_tabela text;
begin
  foreach v_tabela in array array['cursos','matriculas','certificados','certificados_historico','carteiras_horas_curso','avaliacoes_cursos'] loop
    if to_regclass('public.'||v_tabela) is not null then
      begin execute format('alter table public.%I replica identity full',v_tabela); exception when others then null; end;
      begin execute format('alter publication supabase_realtime add table public.%I',v_tabela); exception when duplicate_object then null; when others then null; end;
    end if;
  end loop;
end $$;

commit;

select 'Atualização final V14 aplicada com sucesso' as resultado;
