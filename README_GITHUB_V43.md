# ALTITUDE V43 — pacote público para GitHub

Base: V42. Esta entrega consolida as correções posteriores (118–127) e os ajustes visuais relatados entre elas.

Principais pontos:
- Pagamento do aluno: CTA "Efetuar pagamento" com rótulo/contraste garantidos.
- Botões de ações do Gestor compactos e consistentes; pagamentos corrigidos.
- Cursos e conteúdos sem rolagem horizontal no desktop; ações 3/3 e código visual sequencial sem alterar IDs reais.
- Console: correção do fechamento de diálogos com foco e do acesso a dataset em callback assíncrono.
- Alunos: diagnóstico automático entre public.alunos e Supabase Auth, aviso de divergência e ação "Reparar conta".
- Exclusão definitiva: frontend aguarda resposta real e recarrega a lista após confirmação do backend.
- Recuperação de senha: exibe e-mail mascarado quando a Edge Function V43 estiver publicada.
- Solicitar certificado: avaliação existente pode ser alterada somente nessa tela.
- LaTeX/PDF: imagens externas passam pelo proxy e são rasterizadas em PNG antes do jsPDF.
- Áreas: removida lista hardcoded do seletor; catálogo oficial + categorias reais dos cursos.

Não publique no GitHub o pacote ALTITUDESITE_V43_SUPABASE_PRIVADO.
