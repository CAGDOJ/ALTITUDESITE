-- Verificação rápida da V30
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'modulos'
  and column_name in ('created_at','criado_em','updated_at','conteudo_latex','carga_horaria','pdf_url')
order by column_name;
