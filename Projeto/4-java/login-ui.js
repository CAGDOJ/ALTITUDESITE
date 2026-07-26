(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

  function setMessage(id, text, ok = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || "";
    el.className = `msg ${ok ? "ok" : "err"}`;
  }

  async function resolveRecoveryEmail(identifier) {
    const raw = String(identifier || "").trim();
    if (!raw) throw new Error("Informe seu RA, CPF ou e-mail.");
    if (raw.includes("@")) return raw.toLowerCase();
    const digits = onlyDigits(raw);
    const value = digits.length === 11 ? digits : raw.toUpperCase();
    const { data, error } = await window.sb.rpc("resolver_email_aluno", { p_identificador: value });
    if (error || !data) throw new Error("Não encontramos uma conta com esses dados.");
    return String(data).toLowerCase();
  }

  function openRecovery() {
    $("loginBlock")?.setAttribute("hidden", "");
    $("forgotPane")?.removeAttribute("hidden");
    const title = $("boxTitle");
    if (title) title.textContent = "Redefinir senha";
    const link = $("linkForgot");
    if (link) link.textContent = "Voltar ao login";
  }

  function backToLogin() {
    $("forgotPane")?.setAttribute("hidden", "");
    $("loginBlock")?.removeAttribute("hidden");
    const title = $("boxTitle");
    if (title) title.textContent = "Informe seu Login";
    const link = $("linkForgot");
    if (link) link.textContent = "Esqueci minha senha";
    setMessage("recoveryMessage", "", true);
  }

  async function sendRecovery() {
    const button = $("btnSendRecovery");
    const identifier = String($("recoveryIdentifier")?.value || "").trim();
    if (!identifier) return setMessage("recoveryMessage", "Informe seu RA, CPF ou e-mail.", false);

    try {
      button.disabled = true;
      button.textContent = "Enviando...";

      // Primeira opção: função transacional do Portal Altitude (Resend ou fallback Supabase).
      const result = await window.sb.functions.invoke("recuperar-senha", {
        body: { identificador: identifier }
      });
      if (result.error || !result.data?.ok) {
        // Compatibilidade enquanto a Edge Function ainda não tiver sido publicada.
        const email = await resolveRecoveryEmail(identifier);
        const redirectTo = "https://www.portalaltitude.com.br/Projeto/1-html/4-login.html?recovery=1";
        const { error } = await window.sb.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
      }

      setMessage("recoveryMessage", "Se os dados estiverem cadastrados, o link será enviado em instantes. Verifique também spam e lixo eletrônico.", true);
    } catch (error) {
      const message = /rate|limit/i.test(error.message || "")
        ? "Muitas tentativas. Aguarde alguns minutos e tente novamente."
        : (error.message || "Não foi possível enviar o link agora. Solicite ajuda à instituição.");
      setMessage("recoveryMessage", message, false);
    } finally {
      button.disabled = false;
      button.textContent = "Enviar link de redefinição";
    }
  }

  function showResetModal() {
    const overlay = $("resetOverlay");
    if (!overlay) return;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("newPass")?.focus(), 50);
  }

  function closeResetModal() {
    const overlay = $("resetOverlay");
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }

  async function saveNewPassword() {
    const p1 = $("newPass")?.value || "";
    const p2 = $("newPass2")?.value || "";
    if (p1.length < 8) return setMessage("resetFinalMsg", "A senha deve ter no mínimo 8 caracteres.", false);
    if (p1 !== p2) return setMessage("resetFinalMsg", "As senhas não coincidem.", false);
    const button = $("btnDoReset");
    try {
      button.disabled = true;
      button.textContent = "Salvando...";
      const { error } = await window.sb.auth.updateUser({ password: p1 });
      if (error) throw error;
      setMessage("resetFinalMsg", "Senha atualizada. Você já pode entrar.", true);
      setTimeout(async () => {
        await window.sb.auth.signOut();
        history.replaceState({}, document.title, "/Projeto/1-html/4-login.html");
        location.reload();
      }, 1000);
    } catch (error) {
      setMessage("resetFinalMsg", error.message || "Não foi possível atualizar a senha.", false);
    } finally {
      button.disabled = false;
      button.textContent = "Salvar nova senha";
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    window.sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) showResetModal();
    });

    $("linkForgot")?.addEventListener("click", (event) => {
      event.preventDefault();
      const open = !$("forgotPane")?.hasAttribute("hidden");
      open ? backToLogin() : openRecovery();
    });
    $("btnSendRecovery")?.addEventListener("click", sendRecovery);
    $("recoveryIdentifier")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); sendRecovery(); }
    });
    $("btnDoReset")?.addEventListener("click", saveNewPassword);
    $("resetClose")?.addEventListener("click", closeResetModal);
    $("resetOverlay")?.addEventListener("click", (event) => { if (event.target.id === "resetOverlay") closeResetModal(); });

    const params = new URLSearchParams(location.search);
    if (params.get("recovery") === "1" || location.hash.includes("type=recovery")) {
      // Give Supabase time to exchange the recovery token for a session.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const { data } = await window.sb.auth.getSession();
      if (data?.session) showResetModal();
      else setMessage("recoveryMessage", "O link expirou ou já foi utilizado. Solicite outro link.", false);
    }
  });
})();
