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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function resolveEmail(admin: ReturnType<typeof createClient>, identifier: string) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    const { data } = await admin.from("alunos").select("email,nome,user_id").eq("email", email).maybeSingle();
    return data || { email, nome: "Aluno(a)", user_id: null };
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    const { data } = await admin.from("alunos").select("email,nome,user_id").eq("cpf", digits).maybeSingle();
    return data || null;
  }

  const { data } = await admin.from("alunos").select("email,nome,user_id").eq("ra", raw.toUpperCase()).maybeSingle();
  return data || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl = (Deno.env.get("SITE_URL") || "https://www.portalaltitude.com.br").replace(/\/$/, "");
    const redirectTo = `${siteUrl}/Projeto/1-html/4-login.html?recovery=1`;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identificador || body.email || "").trim();
    if (!identifier) return json({ ok: false, error: "Informe RA, CPF ou e-mail." }, 400);

    const account = await resolveEmail(admin, identifier);
    // Resposta genérica para não revelar se o cadastro existe.
    if (!account?.email) return json({ ok: true });

    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    let count = 0;
    try {
      const rateResult = await admin
        .from("solicitacoes_redefinicao_senha")
        .select("id", { count: "exact", head: true })
        .eq("email", account.email)
        .gte("criado_em", since);
      count = rateResult.count || 0;
    } catch (_) {
      count = 0;
    }
    if (count > 0) return json({ ok: true, rate_limited: true });

    try {
      await admin.from("solicitacoes_redefinicao_senha").insert({
        email: account.email,
        aluno_id: account.user_id || null,
        origem: "PORTAL_PUBLICO"
      });
    } catch (_) {
      // Compatibilidade quando a migration ainda não foi executada.
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM");

    if (resendKey && emailFrom) {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: account.email,
        options: { redirectTo }
      });
      if (linkError) throw linkError;
      const actionLink = linkData?.properties?.action_link;
      if (!actionLink) throw new Error("O link de recuperação não foi gerado.");

      const send = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [account.email],
          subject: "Redefinição de senha — Portal Altitude",
          html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f2f6f9;font-family:Arial,sans-serif;color:#17324a"><div style="max-width:600px;margin:0 auto;padding:30px 16px"><div style="background:#0a3d62;color:#fff;padding:22px;border-radius:16px 16px 0 0"><strong style="font-size:24px">ALTITUDE</strong><div style="font-size:13px;margin-top:4px">Instituição de Educação e Tecnologia</div></div><div style="background:#fff;border:1px solid #d8e4ec;border-top:0;padding:26px;border-radius:0 0 16px 16px"><p>Olá, <strong>${escapeHtml(account.nome || "Aluno(a)")}</strong>.</p><h1 style="font-size:22px;color:#0a3d62">Redefinir sua senha</h1><p>Use o botão abaixo para criar uma nova senha de acesso ao Portal Altitude.</p><p style="margin:24px 0"><a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#10a6ad;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Criar nova senha</a></p><p style="font-size:13px;color:#65798a">Caso você não tenha solicitado a alteração, ignore esta mensagem. O link é pessoal e não deve ser compartilhado.</p></div></div></body></html>`
        })
      });
      if (!send.ok) {
        const payload = await send.json().catch(() => ({}));
        throw new Error(payload?.message || `Falha ao enviar e-mail (${send.status}).`);
      }
      return json({ ok: true, provider: "resend" });
    }

    // Fallback para o e-mail padrão do Supabase quando o Resend não está configurado.
    const { error: resetError } = await anon.auth.resetPasswordForEmail(account.email, { redirectTo });
    if (resetError) throw resetError;
    return json({ ok: true, provider: "supabase" });
  } catch (error) {
    console.error("recuperar-senha:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
