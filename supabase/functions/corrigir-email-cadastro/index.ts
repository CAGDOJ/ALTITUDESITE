import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-altitude-client, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const formatCpf = (value: string) => {
  const x = digits(value);
  return x.length === 11 ? x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : value;
};
const maskEmail = (value: string) => {
  const [user, domain] = value.split("@");
  if (!user || !domain) return "e-mail cadastrado";
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"*".repeat(Math.max(3, user.length - visible.length))}@${domain}`;
};

function firstKeyFromJsonEnv(name: string) {
  try {
    const raw = Deno.env.get(name);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return "";
    return String(parsed.default || parsed.service_role || parsed.anon || parsed.publishable || Object.values(parsed)[0] || "");
  } catch (error) {
    console.warn(`Não foi possível ler ${name}:`, error);
    return "";
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as any).message || "Erro desconhecido.");
  return String(error || "Erro desconhecido.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, etapa: "METODO", error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publicKey = firstKeyFromJsonEnv("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const adminKey = firstKeyFromJsonEnv("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const siteUrl = (Deno.env.get("SITE_URL") || "https://www.portalaltitude.com.br").replace(/\/$/, "");

    if (!supabaseUrl || !publicKey || !adminKey) {
      console.error("Configuração incompleta", { hasUrl: !!supabaseUrl, hasPublic: !!publicKey, hasAdmin: !!adminKey });
      return json({ ok: false, etapa: "CONFIGURACAO", error: "Configuração do servidor incompleta para corrigir o e-mail." }, 500);
    }

    const admin = createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const publico = createClient(supabaseUrl, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const body = await req.json().catch(() => ({}));
    let action = String(body.acao || body.action || "corrigir_email").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (["corrigir", "corrigir_email_cadastro"].includes(action)) action = "corrigir_email";
    if (["reenviar", "reenviar_confirmacao_atual"].includes(action)) action = "reenviar_confirmacao";

    const cpf = digits(body.cpf);
    const nascimento = String(body.data_nascimento || body.dataNascimento || "").trim();
    const password = String(body.senha || body.password || "");
    const newEmail = normalizeEmail(body.novo_email || body.novoEmail || body.email_novo || "");

    console.log("CORRIGIR_EMAIL_INICIO", { action, cpfFinal: cpf.slice(-4), nascimento, hasPassword: !!password, hasNewEmail: !!newEmail });

    if (!["corrigir_email", "reenviar_confirmacao"].includes(action)) {
      return json({ ok: false, etapa: "ACAO", error: "Ação inválida." }, 400);
    }
    if (cpf.length !== 11) return json({ ok: false, etapa: "CPF", error: "Informe um CPF válido com 11 números." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return json({ ok: false, etapa: "DATA_NASCIMENTO", error: "Informe uma data de nascimento válida." }, 400);
    if (!password) return json({ ok: false, etapa: "SENHA", error: "Informe a senha cadastrada." }, 400);
    if (action === "corrigir_email" && !validEmail(newEmail)) return json({ ok: false, etapa: "NOVO_EMAIL", error: "Informe um novo e-mail válido." }, 400);

    try {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count } = await admin.from("solicitacoes_correcao_email_v37")
        .select("id", { count: "exact", head: true })
        .eq("cpf", cpf)
        .gte("criado_em", since);
      if ((count || 0) >= 8) return json({ ok: false, etapa: "LIMITE_TENTATIVAS", error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, 429);
      await admin.from("solicitacoes_correcao_email_v37").insert({ cpf, acao: action, sucesso: false });
    } catch (error) {
      console.warn("Controle de tentativas indisponível:", errorMessage(error));
    }

    // Busca por CPF em formato normal ou formatado.
    const { data: candidatos, error: alunoError } = await admin.from("alunos")
      .select("user_id,nome,email,cpf,data_nascimento,status")
      .in("cpf", [cpf, formatCpf(cpf)])
      .limit(2);
    if (alunoError) {
      console.error("BUSCAR_ALUNO", alunoError);
      return json({ ok: false, etapa: "BUSCAR_ALUNO", error: `Erro ao consultar o cadastro: ${alunoError.message}` }, 500);
    }
    const aluno = (candidatos || []).find((item: any) => digits(item.cpf) === cpf);
    if (!aluno?.user_id) return json({ ok: false, etapa: "ALUNO_NAO_ENCONTRADO", error: "Não encontramos um cadastro com esse CPF." }, 404);

    const nascimentoBanco = String(aluno.data_nascimento || "").slice(0, 10);
    if (nascimentoBanco !== nascimento) {
      return json({ ok: false, etapa: "VALIDAR_DATA_NASCIMENTO", error: "CPF ou data de nascimento não conferem com o cadastro." }, 400);
    }

    const { data: authData, error: authGetError } = await admin.auth.admin.getUserById(aluno.user_id);
    if (authGetError) {
      console.error("BUSCAR_USUARIO_AUTH", { userId: aluno.user_id, message: authGetError.message, status: (authGetError as any)?.status, code: (authGetError as any)?.code });
      return json({ ok: false, etapa: "BUSCAR_USUARIO_AUTH", error: `Erro ao consultar a conta de acesso: ${authGetError.message}` }, 500);
    }
    const authUser = authData?.user;
    if (!authUser) return json({ ok: false, etapa: "USUARIO_AUTH_AUSENTE", error: "O cadastro existe, mas a conta de acesso não foi encontrada." }, 404);
    if (authUser.email_confirmed_at) {
      return json({ ok: false, etapa: "CONTA_JA_CONFIRMADA", error: "Este e-mail já foi confirmado. A correção automática é permitida apenas para contas ainda não confirmadas." }, 409);
    }

    const currentEmail = normalizeEmail(authUser.email || aluno.email);
    if (!currentEmail) return json({ ok: false, etapa: "EMAIL_ATUAL_AUSENTE", error: "O cadastro não possui um e-mail atual válido." }, 400);

    const signIn = await publico.auth.signInWithPassword({ email: currentEmail, password });
    let passwordOk = false;
    if (!signIn.error) {
      passwordOk = true;
      if (signIn.data?.session) await publico.auth.signOut().catch(() => undefined);
    } else {
      const message = String(signIn.error.message || "").toLowerCase();
      passwordOk = message.includes("email not confirmed") || message.includes("email_not_confirmed");
    }
    if (!passwordOk) return json({ ok: false, etapa: "VALIDAR_SENHA", error: "A senha informada não confere com o cadastro." }, 401);

    if (action === "reenviar_confirmacao") {
      const { error: resendError } = await publico.auth.resend({
        type: "signup",
        email: currentEmail,
        options: { emailRedirectTo: `${siteUrl}/login/?confirmacao=sucesso` },
      });
      if (resendError) {
        console.error("REENVIAR_CONFIRMACAO", resendError);
        return json({ ok: false, etapa: "REENVIAR_CONFIRMACAO", error: `Não foi possível reenviar a confirmação: ${resendError.message}` }, 500);
      }
      return json({ ok: true, etapa: "REENVIO_CONCLUIDO", mensagem: "Enviamos novamente o e-mail de confirmação.", email_mascarado: maskEmail(currentEmail) });
    }

    if (newEmail === currentEmail) return json({ ok: false, etapa: "EMAIL_IGUAL", error: "O novo e-mail é igual ao endereço já cadastrado. Use a opção de reenviar confirmação." }, 400);

    const { data: duplicate, error: duplicateError } = await admin.from("alunos")
      .select("user_id,email")
      .ilike("email", newEmail)
      .neq("user_id", aluno.user_id)
      .limit(1);
    if (duplicateError) return json({ ok: false, etapa: "VERIFICAR_EMAIL", error: `Erro ao verificar o novo e-mail: ${duplicateError.message}` }, 500);
    if (duplicate?.length) return json({ ok: false, etapa: "EMAIL_EM_USO", error: "Este novo e-mail já está vinculado a outro aluno." }, 409);

    const oldMeta = authUser.user_metadata || {};
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(aluno.user_id, {
      email: newEmail,
      email_confirm: false,
      user_metadata: { ...oldMeta, perfil: "ALUNO", nome: aluno.nome, status: aluno.status || "ATIVO" },
    } as any);
    if (authUpdateError) {
      console.error("ATUALIZAR_EMAIL_AUTH", authUpdateError);
      return json({ ok: false, etapa: "ATUALIZAR_EMAIL_AUTH", error: `Não foi possível alterar o e-mail da conta: ${authUpdateError.message}` }, 500);
    }

    const { error: profileUpdateError } = await admin.from("alunos")
      .update({ email: newEmail, atualizado_em: new Date().toISOString() })
      .eq("user_id", aluno.user_id);
    if (profileUpdateError) {
      console.error("ATUALIZAR_ALUNO", profileUpdateError);
      await admin.auth.admin.updateUserById(aluno.user_id, { email: currentEmail, email_confirm: false } as any).catch(() => undefined);
      return json({ ok: false, etapa: "ATUALIZAR_ALUNO", error: `Não foi possível atualizar o cadastro: ${profileUpdateError.message}` }, 500);
    }

    try {
      await admin.from("auditoria_correcao_email_v37").insert({
        aluno_id: aluno.user_id,
        email_anterior: currentEmail,
        email_novo: newEmail,
        acao: "CORRIGIR_EMAIL_NAO_CONFIRMADO",
      });
    } catch (error) {
      console.warn("Auditoria não registrada:", errorMessage(error));
    }

    const { error: resendError } = await publico.auth.resend({
      type: "signup",
      email: newEmail,
      options: { emailRedirectTo: `${siteUrl}/login/?confirmacao=sucesso` },
    });
    if (resendError) {
      console.error("ENVIAR_CONFIRMACAO_NOVO_EMAIL", resendError);
      // Faz rollback para o aluno não ficar preso em um endereço sem confirmação.
      await admin.auth.admin.updateUserById(aluno.user_id, { email: currentEmail, email_confirm: false } as any).catch(() => undefined);
      await admin.from("alunos").update({ email: currentEmail, atualizado_em: new Date().toISOString() }).eq("user_id", aluno.user_id).catch(() => undefined);
      return json({ ok: false, etapa: "ENVIAR_CONFIRMACAO_NOVO_EMAIL", error: `O e-mail não foi alterado porque não conseguimos enviar a nova confirmação: ${resendError.message}` }, 500);
    }

    try {
      await admin.from("solicitacoes_correcao_email_v37").insert({ cpf, acao: "CORRIGIR_EMAIL_SUCESSO", sucesso: true });
    } catch (_) {}

    return json({
      ok: true,
      etapa: "CORRECAO_CONCLUIDA",
      mensagem: "E-mail corrigido com sucesso. Enviamos uma nova confirmação para o endereço informado.",
      email_mascarado: maskEmail(newEmail),
    });
  } catch (error) {
    console.error("ERRO_NAO_TRATADO", error);
    return json({ ok: false, etapa: "ERRO_INTERNO", error: `Erro interno: ${errorMessage(error)}` }, 500);
  }
});
