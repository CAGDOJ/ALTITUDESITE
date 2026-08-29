# ALTITUDE — V42 (pacote público para GitHub)

Este pacote contém o frontend público da V42 e consolida as atualizações 101–117 sobre a V41.

## Principais ajustes da V42
- exclusão de aluno e redefinição de senha com backend administrativo V42;
- motor LaTeX revisado, imagens por URL e alinhamento controlado pelo próprio LaTeX;
- editor/montagem de curso reorganizado e pré-visualização atualizada após alterações;
- ações compactas e padronizadas no Portal do Gestor;
- painel de tráfego/alcance e conversão;
- correções de cursos aptos, nota mínima e prova com todas as questões cadastradas;
- trilha de módulos corrigida;
- solicitação/aprovação de certificados em PACK, com cupom e liberação conforme horas;
- menu hambúrguer do Gestor no mobile.

## Importante
Os recursos que alteram banco/Auth exigem também o pacote privado `ALTITUDESITE_V42_SUPABASE_PRIVADO.zip`.
Execute o SQL V42 e publique as Edge Functions conforme o arquivo de deploy antes de validar exclusão de aluno, senha, provas agregadas, PACKs e proxy de imagens LaTeX.

## Não incluído neste repositório
- SQL/migrations privadas;
- dumps, exports ou registros reais do banco;
- Edge Functions administrativas;
- chaves administrativas/service-role;
- backups e arquivos privados de implantação.

A URL do projeto e a chave pública/anon do Supabase podem existir no frontend por serem credenciais de cliente. A proteção dos dados deve ser feita por RLS e funções server-side. Nunca publique `service_role`, secret keys, dumps ou backups no GitHub.
