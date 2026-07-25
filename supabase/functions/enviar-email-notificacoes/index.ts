// ALTITUDE — envio de notificações transacionais por e-mail
// Acionado por Database Webhook na tabela public.email_notificacoes.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type QueueRecord = {
  id: number;
  destinatario: string;
  nome_destinatario?: string | null;
  evento: string;
  assunto: string;
  dados?: Record<string, unknown> | null;
  status: string;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: QueueRecord;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-altitude-webhook",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmail(record: QueueRecord, siteUrl: string) {
  const data = record.dados ?? {};
  const nome = escapeHtml(record.nome_destinatario || "Aluno(a)");
  const curso = escapeHtml(data.curso || "");
  const protocolo = escapeHtml(data.protocolo || "");
  const status = escapeHtml(data.status || "");
  const mensagem = escapeHtml(data.mensagem || "");
  const horas = escapeHtml(data.horas || "");

  let intro = "Há uma nova atualização no Portal Altitude.";
  let detail = "";
  let actionLabel = "Acessar o Portal Altitude";
  let actionUrl = siteUrl;

  switch (record.evento) {
    case "CHAMADO_ABERTO_GESTAO":
      intro = "Um novo chamado foi aberto e precisa de atendimento.";
      detail = `
        <p><strong>Protocolo:</strong> ${protocolo}</p>
        <p><strong>Aluno:</strong> ${escapeHtml(data.aluno || "")}</p>
        <p><strong>Assunto:</strong> ${escapeHtml(data.assunto || "")}</p>
        <p><strong>Mensagem:</strong> ${mensagem}</p>`;
      actionLabel = "Abrir Portal de Gestão";
      actionUrl = `${siteUrl}/Projeto/1-html/14-login-gestor.html`;
      break;
    case "CHAMADO_ATUALIZADO_ALUNO":
      intro = "Seu chamado recebeu uma atualização da equipe Altitude.";
      detail = `
        <p><strong>Protocolo:</strong> ${protocolo}</p>
        <p><strong>Status:</strong> ${status}</p>
        ${mensagem ? `<p><strong>Resposta:</strong> ${mensagem}</p>` : ""}`;
      actionLabel = "Acompanhar chamado";
      actionUrl = `${siteUrl}/Projeto/1-html/11-portaldoaluno.html#atendimento`;
      break;
    case "CERTIFICADO_EM_CONTAGEM":
      intro = "Seu certificado está aguardando o prazo para liberação.";
      detail = `
        <p><strong>Curso:</strong> ${curso}</p>
        <p><strong>Carga solicitada:</strong> ${horas}h</p>
        <p>O download será liberado automaticamente quando o prazo de contagem for concluído.</p>`;
      actionLabel = "Acompanhar certificado";
      actionUrl = `${siteUrl}/Projeto/1-html/11-portaldoaluno.html#certificados`;
      break;
    case "CERTIFICADO_EMITIDO":
      intro = "Seu certificado foi liberado pela Instituição Altitude.";
      detail = `
        <p><strong>Curso:</strong> ${curso}</p>
        <p><strong>Carga horária:</strong> ${horas}h</p>
        <p>O PDF e o QR Code de autenticação já estão disponíveis no Portal do Aluno.</p>`;
      actionLabel = "Baixar certificado";
      actionUrl = `${siteUrl}/Projeto/1-html/11-portaldoaluno.html#certificados`;
      break;
    case "CERTIFICADO_BLOQUEADO":
      intro = "Há uma atualização na situação do seu certificado.";
      detail = `
        <p><strong>Curso:</strong> ${curso}</p>
        <p><strong>Status:</strong> BLOQUEADO</p>
        ${mensagem ? `<p><strong>Observação:</strong> ${mensagem}</p>` : ""}`;
      actionLabel = "Consultar situação";
      actionUrl = `${siteUrl}/Projeto/1-html/11-portaldoaluno.html#certificados`;
      break;
    case "CERTIFICADO_CANCELADO":
      intro = "Sua solicitação de certificado foi cancelada.";
      detail = `
        <p><strong>Curso:</strong> ${curso}</p>
        ${mensagem ? `<p><strong>Motivo:</strong> ${mensagem}</p>` : ""}`;
      actionLabel = "Consultar certificados";
      actionUrl = `${siteUrl}/Projeto/1-html/11-portaldoaluno.html#certificados`;
      break;
  }

  const html = `<!doctype html>
  <html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#17324a">
    <div style="max-width:620px;margin:0 auto;padding:28px 16px">
      <div style="background:#0c3f62;padding:20px 24px;border-radius:18px 18px 0 0;color:#fff">
        <div style="font-size:22px;font-weight:800;letter-spacing:.5px">ALTITUDE</div>
        <div style="font-size:13px;opacity:.82;margin-top:4px">Instituição de Educação e Tecnologia</div>
      </div>
      <div style="background:#fff;padding:28px 24px;border:1px solid #dbe6ee;border-top:0;border-radius:0 0 18px 18px">
        <p style="margin-top:0">Olá, <strong>${nome}</strong>.</p>
        <h1 style="font-size:22px;line-height:1.3;margin:14px 0;color:#0c3f62">${escapeHtml(record.assunto)}</h1>
        <p style="font-size:16px;line-height:1.6">${intro}</p>
        <div style="background:#f6fafc;border:1px solid #dbe6ee;border-radius:12px;padding:16px;margin:20px 0;font-size:15px;line-height:1.55">${detail}</div>
        <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#11a9b4;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">${actionLabel}</a>
        <p style="font-size:12px;line-height:1.5;color:#65798a;margin:24px 0 0">Esta é uma mensagem automática da Instituição Altitude. Não compartilhe códigos de autenticação ou senhas por e-mail.</p>
      </div>
    </div>
  </body></html>`;

  return { html, actionUrl };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const webhookSecret = Deno.env.get("EMAIL_WEBHOOK_SECRET") || "";
  const providedSecret = req.headers.get("x-altitude-webhook") || "";
  if (!webhookSecret || providedSecret !== webhookSecret) {
    return Response.json({ error: "Não autorizado." }, { status: 401, headers: corsHeaders });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  const siteUrl = (Deno.env.get("SITE_URL") || "https://www.portalaltitude.com.br").replace(/\/$/, "");
  if (!resendKey || !emailFrom) {
    return Response.json({ error: "RESEND_API_KEY ou EMAIL_FROM não configurado." }, { status: 500, headers: corsHeaders });
  }

  const payload = (await req.json()) as WebhookPayload;
  const record = payload.record;
  if (!record?.id || !record.destinatario) {
    return Response.json({ error: "Registro de notificação inválido." }, { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: current, error: readError } = await supabase
    .from("email_notificacoes")
    .select("*")
    .eq("id", record.id)
    .maybeSingle();

  if (readError || !current) {
    return Response.json({ error: readError?.message || "Notificação não encontrada." }, { status: 404, headers: corsHeaders });
  }
  if (current.status === "ENVIADO") {
    return Response.json({ ok: true, duplicate: true }, { headers: corsHeaders });
  }

  await supabase.from("email_notificacoes").update({
    status: "PROCESSANDO",
    tentativas: Number(current.tentativas || 0) + 1,
    atualizado_em: new Date().toISOString(),
  }).eq("id", current.id);

  const { html } = buildEmail(current as QueueRecord, siteUrl);
  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
      "Idempotency-Key": `altitude-email-${current.id}`,
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [current.destinatario],
      subject: current.assunto,
      html,
    }),
  });

  const responseBody = await send.json().catch(() => ({}));
  if (!send.ok) {
    const message = responseBody?.message || responseBody?.error || `Resend HTTP ${send.status}`;
    await supabase.from("email_notificacoes").update({
      status: "ERRO",
      ultimo_erro: String(message).slice(0, 1000),
      atualizado_em: new Date().toISOString(),
    }).eq("id", current.id);
    return Response.json({ error: message }, { status: 502, headers: corsHeaders });
  }

  await supabase.from("email_notificacoes").update({
    status: "ENVIADO",
    enviado_em: new Date().toISOString(),
    ultimo_erro: null,
    provedor_id: responseBody?.id || null,
    atualizado_em: new Date().toISOString(),
  }).eq("id", current.id);

  return Response.json({ ok: true, id: responseBody?.id }, { headers: corsHeaders });
});
