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
