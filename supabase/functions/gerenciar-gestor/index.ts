import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = req.headers.get('Authorization') || '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ ok: false, error: 'Sessão inválida.' }, 401);

    const body = await req.json();
    const action = String(body.acao || '').toLowerCase();
    const callerId = userData.user.id;

    const { count: managerCount, error: countError } = await admin
      .from('gestores').select('*', { count: 'exact', head: true });
    if (countError) throw countError;

    if (action === 'bootstrap') {
      if ((managerCount || 0) > 0) return json({ ok: false, error: 'O primeiro gestor já foi configurado.' }, 403);
      const managerId = String(body.gestor_id || '').trim().toUpperCase();
      const name = String(body.nome || userData.user.user_metadata?.name || '').trim();
      if (!managerId || !name || !userData.user.email) return json({ ok: false, error: 'Nome e ID de gestor são obrigatórios.' }, 400);
      const { error } = await admin.from('gestores').insert({
        user_id: callerId,
        gestor_id: managerId,
        nome: name,
        email: userData.user.email,
        cargo: 'GESTOR',
        nivel_acesso: 4,
        status: 'ATIVO'
      });
      if (error) throw error;
      return json({ ok: true, gestor_id: managerId });
    }

    const { data: caller, error: callerError } = await admin
      .from('gestores').select('*').eq('user_id', callerId).eq('status', 'ATIVO').single();
    if (callerError || !caller) return json({ ok: false, error: 'Acesso de gestão não autorizado.' }, 403);

    if (action === 'redefinir_senha_aluno') {
      if (Number(caller.nivel_acesso) < 2) {
        return json({ ok: false, error: 'Seu acesso não permite redefinir senhas de alunos.' }, 403);
      }

      const alunoId = String(body.aluno_id || '').trim();
      const novaSenha = String(body.nova_senha || '');
      if (!alunoId) return json({ ok: false, error: 'Aluno não informado.' }, 400);
      if (novaSenha.length < 8) return json({ ok: false, error: 'A nova senha deve possuir ao menos 8 caracteres.' }, 400);
      if (!/[A-Z]/.test(novaSenha) || !/[a-z]/.test(novaSenha) || !/\d/.test(novaSenha)) {
        return json({ ok: false, error: 'Use uma senha com letra maiúscula, minúscula e número.' }, 400);
      }

      const { data: aluno, error: alunoError } = await admin
        .from('alunos')
        .select('user_id,nome,email')
        .eq('user_id', alunoId)
        .maybeSingle();
      if (alunoError) throw alunoError;
      if (!aluno?.user_id) return json({ ok: false, error: 'Aluno não encontrado.' }, 404);

      const { error: authError } = await admin.auth.admin.updateUserById(aluno.user_id, {
        password: novaSenha
      });
      if (authError) throw authError;

      // Auditoria sem registrar a senha.
      try {
        await admin.from('auditoria_redefinicoes_senha').insert({
          aluno_id: aluno.user_id,
          aluno_email: aluno.email || null,
          redefinido_por: callerId,
          origem: 'PORTAL_GESTAO'
        });
      } catch (_) {
        // A redefinição continua válida mesmo se a tabela de auditoria ainda não existir.
      }

      return json({ ok: true, aluno_id: aluno.user_id });
    }

    if (action === 'atualizar_acesso_aluno') {
      if (Number(caller.nivel_acesso) < 2) {
        return json({ ok: false, error: 'Seu acesso não permite alterar dados de acesso de alunos.' }, 403);
      }

      const alunoId = String(body.aluno_id || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const nome = String(body.nome || '').trim();
      const telefone = String(body.telefone || '').replace(/\D/g, '') || null;
      const status = String(body.status || 'ATIVO').toUpperCase() === 'INATIVO' ? 'INATIVO' : 'ATIVO';
      const ra = String(body.ra || '').trim().toUpperCase();
      if (!alunoId) return json({ ok: false, error: 'Aluno não informado.' }, 400);
      if (!email || !email.includes('@')) return json({ ok: false, error: 'Informe um e-mail válido.' }, 400);
      if (!nome) return json({ ok: false, error: 'Informe o nome do aluno.' }, 400);

      const { data: alunoAtual, error: alunoError } = await admin
        .from('alunos')
        .select('user_id,nome,email,telefone,status,ra')
        .eq('user_id', alunoId)
        .maybeSingle();
      if (alunoError) throw alunoError;
      if (!alunoAtual?.user_id) return json({ ok: false, error: 'Aluno não encontrado.' }, 404);

      const { data: duplicateEmail, error: duplicateError } = await admin
        .from('alunos')
        .select('user_id')
        .ilike('email', email)
        .neq('user_id', alunoId)
        .limit(1);
      if (duplicateError) throw duplicateError;
      if (duplicateEmail?.length) return json({ ok: false, error: 'Este e-mail já pertence a outro aluno.' }, 409);

      const { error: authError } = await admin.auth.admin.updateUserById(alunoId, {
        email,
        email_confirm: true,
        user_metadata: {
          perfil: 'ALUNO',
          nome,
          status,
          ra: ra || alunoAtual.ra || null
        }
      });
      if (authError) throw authError;

      const { data: alunoAtualizado, error: profileError } = await admin
        .from('alunos')
        .update({ nome, email, telefone, status, ra: ra || alunoAtual.ra, atualizado_em: new Date().toISOString() })
        .eq('user_id', alunoId)
        .select()
        .single();
      if (profileError) {
        // Tenta desfazer o e-mail do Auth para evitar cadastros divergentes.
        await admin.auth.admin.updateUserById(alunoId, {
          email: alunoAtual.email,
          email_confirm: true,
          user_metadata: { perfil: 'ALUNO', nome: alunoAtual.nome, status: alunoAtual.status, ra: alunoAtual.ra || null }
        }).catch(() => undefined);
        throw profileError;
      }

      try {
        await admin.from('auditoria_acessos_alunos_v34_3').insert({
          aluno_id: alunoId,
          alterado_por: callerId,
          acao: 'ATUALIZAR_EMAIL_E_PERFIL',
          valor_anterior: alunoAtual,
          valor_novo: { nome, email, telefone, status, ra: ra || alunoAtual.ra }
        });
      } catch (_) {
        // A alteração permanece válida mesmo antes da migration de auditoria.
      }

      return json({ ok: true, aluno: alunoAtualizado });
    }

    if (action === 'excluir_aluno') {
      if (Number(caller.nivel_acesso) < 4) {
        return json({ ok: false, error: 'Somente a gestão de nível 4 pode excluir alunos.' }, 403);
      }

      const alunoId = String(body.aluno_id || '').trim();
      const confirmacao = String(body.confirmacao || '').trim().toUpperCase();
      const motivo = String(body.motivo || 'Exclusão solicitada pela gestão').trim();
      if (!alunoId) return json({ ok: false, error: 'Aluno não informado.' }, 400);
      if (confirmacao !== 'EXCLUIR') return json({ ok: false, error: 'Confirmação de exclusão inválida.' }, 400);

      const { data: aluno, error: alunoError } = await admin
        .from('alunos')
        .select('*')
        .eq('user_id', alunoId)
        .maybeSingle();
      if (alunoError) throw alunoError;
      if (!aluno?.user_id) return json({ ok: false, error: 'Aluno não encontrado.' }, 404);

      const relatedTables = [
        'matriculas','pagamentos','certificados','chamados','resultados_provas','respostas_prova',
        'progresso_modulos','avaliacoes_cursos','carteiras_horas_curso','movimentacoes_horas',
        'packs_alunos_v34','cupons_usos_v34','carteiras_horas_aluno_v34','movimentacoes_horas_aluno_v34',
        'promocoes_alunos_v34'
      ];
      const counts: Record<string, number> = {};
      for (const table of relatedTables) {
        try {
          const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('aluno_id', alunoId);
          counts[table] = count || 0;
        } catch (_) { counts[table] = 0; }
      }

      try {
        await admin.from('alunos_exclusoes_v37').insert({
          aluno_id_original: alunoId,
          nome: aluno.nome || null,
          email: aluno.email || null,
          cpf: aluno.cpf || null,
          ra: aluno.ra || null,
          motivo,
          dados_aluno: aluno,
          vinculos_resumo: counts,
          excluido_por: callerId
        });
      } catch (archiveError) {
        console.warn('Falha ao registrar auditoria de exclusão:', archiveError);
      }

      // A exclusão do perfil aciona os ON DELETE CASCADE existentes nas tabelas acadêmicas.
      const { error: profileDeleteError } = await admin.from('alunos').delete().eq('user_id', alunoId);
      if (profileDeleteError) throw profileDeleteError;

      const { error: authDeleteError } = await admin.auth.admin.deleteUser(alunoId);
      if (authDeleteError) throw authDeleteError;

      return json({ ok: true, aluno_id: alunoId, vinculos_removidos: counts });
    }

    if (action === 'criar') {
      if (Number(caller.nivel_acesso) < 4) return json({ ok: false, error: 'Somente gestores de nível 4 podem criar acessos.' }, 403);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.senha || '');
      const managerId = String(body.gestor_id || '').trim().toUpperCase();
      const name = String(body.nome || '').trim();
      const cargo = String(body.cargo || 'COLABORADOR').toUpperCase();
      const level = Math.max(1, Math.min(4, Number(body.nivel_acesso || 1)));
      if (!email || !password || password.length < 8 || !managerId || !name) {
        return json({ ok: false, error: 'Informe nome, e-mail, ID e senha inicial com ao menos 8 caracteres.' }, 400);
      }
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { perfil: 'GESTOR', nome: name, cargo }
      });
      if (createError || !created.user) throw createError || new Error('Falha ao criar usuário no Auth.');
      const { error: profileError } = await admin.from('gestores').insert({
        user_id: created.user.id,
        gestor_id: managerId,
        nome: name,
        email,
        telefone: body.telefone || null,
        cargo,
        nivel_acesso: level,
        status: body.status === 'INATIVO' ? 'INATIVO' : 'ATIVO'
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }
      return json({ ok: true, user_id: created.user.id, gestor_id: managerId });
    }

    if (action === 'atualizar') {
      if (Number(caller.nivel_acesso) < 4) return json({ ok: false, error: 'Somente gestores de nível 4 podem alterar acessos.' }, 403);
      const userId = String(body.user_id || '');
      if (!userId) return json({ ok: false, error: 'Usuário não informado.' }, 400);
      const payload = {
        gestor_id: String(body.gestor_id || '').trim().toUpperCase(),
        nome: String(body.nome || '').trim(),
        email: String(body.email || '').trim().toLowerCase(),
        telefone: body.telefone || null,
        cargo: String(body.cargo || 'COLABORADOR').toUpperCase(),
        nivel_acesso: Math.max(1, Math.min(4, Number(body.nivel_acesso || 1))),
        status: body.status === 'INATIVO' ? 'INATIVO' : 'ATIVO'
      };
      const { error: profileError } = await admin.from('gestores').update(payload).eq('user_id', userId);
      if (profileError) throw profileError;
      const authPayload: Record<string, unknown> = { email: payload.email, user_metadata: { perfil: 'GESTOR', nome: payload.nome, cargo: payload.cargo } };
      if (body.senha) {
        if (String(body.senha).length < 8) return json({ ok: false, error: 'A nova senha deve possuir ao menos 8 caracteres.' }, 400);
        authPayload.password = String(body.senha);
      }
      const { error: authError } = await admin.auth.admin.updateUserById(userId, authPayload);
      if (authError) throw authError;
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Ação inválida.' }, 400);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : 'Erro interno.' }, 500);
  }
});
