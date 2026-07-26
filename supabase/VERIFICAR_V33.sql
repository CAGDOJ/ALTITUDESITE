-- ALTITUDE V33 — verificação rápida
select to_regclass('public.auditoria_redefinicoes_senha') as auditoria_senha,
       to_regclass('public.solicitacoes_redefinicao_senha') as solicitacoes_senha;
