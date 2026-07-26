select to_regclass('public.auditoria_redefinicoes_senha') as auditoria_senha,
       to_regclass('public.solicitacoes_redefinicao_senha') as solicitacoes_senha;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('auditoria_redefinicoes_senha','solicitacoes_redefinicao_senha')
order by table_name, ordinal_position;
