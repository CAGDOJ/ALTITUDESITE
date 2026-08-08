import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const maskEmail = (value: string) => {
  const [user, domain] = value.split("@");
  if (!domain) return "e-mail cadastrado";
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"*".repeat(Math.max(3, user.length - visible.length))}@${domain}`;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl = (Deno.env.get("SITE_URL") || "https://www.portalaltitude.com.br").replace(/\/$/, "");
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const action = String(body.acao || "corrigir_email").toLowerCase();
    const cpf = digits(body.cpf);
    const nascimento = String(body.data_nascimento || "").trim();
    const password = String(body.senha || "");
    const newEmail = normalizeEmail(body.novo_email);

    if (!['corrigir_email','reenviar_confirmacao'].includes(action)) return json({ ok: false, error: "Ação inválida." }, 400);
    if (cpf.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || !password) {
      return json({ ok: false, error: "Informe CPF, data de nascimento e a senha cadastrada." }, 400);
    }
    if (action === 'corrigir_email' && !validEmail(newEmail)) {
      return json({ ok: false, error: "Informe um novo e-mail válido." }, 400);
    }

    // Limite simples por CPF. A tabela é criada pela migration V37.
    try {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count } = await admin.from('solicitacoes_correcao_email_v37')
        .select('id', { count: 'exact', head: true })
        .eq('cpf', cpf)
        .gte('criado_em', since);
      if ((count || 0) >= 5) return json({ ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, 429);
      await admin.from('solicitacoes_correcao_email_v37').insert({ cpf, acao: action, sucesso: false });
    } catch (_) {
      // Compatibilidade durante a implantação inicial.
    }

    const { data: aluno, error: alunoError } = await admin.from('alunos')
      .select('user_id,nome,email,cpf,data_nascimento,status')
      .eq('cpf', cpf)
      .maybeSingle();
    if (alunoError) throw alunoError;
    if (!aluno?.user_id || String(aluno.data_nascimento || '') !== nascimento) {
      return json({ ok: false, error: "Os dados informados não conferem com o cadastro." }, 400);
    }

    const { data: authData, error: authGetError } = await admin.auth.admin.getUserById(aluno.user_id);
    if (authGetError || !authData?.user) return json({ ok: false, error: "Conta de acesso não localizada." }, 404);
    if (authData.user.email_confirmed_at) {
      return json({ ok: false, error: "Este e-mail já foi confirmado. A correção automática é exclusiva para contas ainda não confirmadas." }, 409);
    }

    const currentEmail = normalizeEmail(aluno.email || authData.user.email);
    if (!currentEmail) return json({ ok: false, error: "O cadastro não possui e-mail para validação." }, 400);

    // Confirma posse da senha cadastrada. Em conta não confirmada, senha correta
    // normalmente retorna EMAIL_NOT_CONFIRMED; senha errada retorna credencial inválida.
    const signIn = await anon.auth.signInWithPassword({ email: currentEmail, password });
    if (signIn.error) {
      const message = String(signIn.error.message || '').toLowerCase();
      const correctButUnconfirmed = message.includes('email not confirmed') || message.includes('email_not_confirmed');
      if (!correctButUnconfirmed) return json({ ok: false, error: "A senha informada não confere." }, 401);
    } else if (signIn.data?.session) {
      await anon.auth.signOut().catch(() => undefined);
    }

    let destination = currentEmail;
    if (action === 'corrigir_email') {
      if (newEmail === currentEmail) return json({ ok: false, error: "O novo e-mail é igual ao endereço já cadastrado." }, 400);

      const { data: duplicate } = await admin.from('alunos').select('user_id').ilike('email', newEmail).neq('user_id', aluno.user_id).limit(1);
      if (duplicate?.length) return json({ ok: false, error: "Este novo e-mail já pertence a outro cadastro." }, 409);

      const oldMeta = authData.user.user_metadata || {};
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(aluno.user_id, {
        email: newEmail,
        email_confirm: false,
        user_metadata: { ...oldMeta, perfil: 'ALUNO', nome: aluno.nome, status: aluno.status || 'ATIVO' }
      });
      if (authUpdateError) throw authUpdateError;

      const { error: profileUpdateError } = await admin.from('alunos')
        .update({ email: newEmail, atualizado_em: new Date().toISOString() })
        .eq('user_id', aluno.user_id);
      if (profileUpdateError) {
        await admin.auth.admin.updateUserById(aluno.user_id, { email: currentEmail, email_confirm: false }).catch(() => undefined);
        throw profileUpdateError;
      }
      destination = newEmail;

      try {
        await admin.from('auditoria_correcao_email_v37').insert({
          aluno_id: aluno.user_id,
          email_anterior: currentEmail,
          email_novo: newEmail,
          acao: 'CORRIGIR_EMAIL_NAO_CONFIRMADO'
        });
      } catch (_) {}
    }

    const { error: resendError } = await anon.auth.resend({
      type: 'signup',
      email: destination,
      options: { emailRedirectTo: `${siteUrl}/login/?confirmacao=sucesso` }
    });
    if (resendError) throw resendError;

    try {
      await admin.from('solicitacoes_correcao_email_v37').insert({ cpf, acao: `${action}_SUCESSO`, sucesso: true });
    } catch (_) {}

    return json({ ok: true, email_mascarado: maskEmail(destination) });
  } catch (error) {
    console.error('corrigir-email-cadastro:', error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
