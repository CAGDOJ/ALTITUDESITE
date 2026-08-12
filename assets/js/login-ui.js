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
    $("wrongEmailPane")?.setAttribute("hidden", "");
    $("loginBlock")?.setAttribute("hidden", "");
    document.querySelector(".account-recovery-links")?.setAttribute("hidden", "");
    $("forgotPane")?.removeAttribute("hidden");
    const title = $("boxTitle");
    if (title) title.textContent = "Redefinir senha";
    const link = $("linkForgot");
    if (link) link.textContent = "Voltar ao login";
  }

  function backToLogin() {
    $("forgotPane")?.setAttribute("hidden", "");
    $("wrongEmailPane")?.setAttribute("hidden", "");
    document.querySelector(".account-recovery-links")?.removeAttribute("hidden");
    $("loginBlock")?.removeAttribute("hidden");
    const title = $("boxTitle");
    if (title) title.textContent = "Informe seu Login";
    const link = $("linkForgot");
    if (link) link.textContent = "Esqueci minha senha";
    setMessage("recoveryMessage", "", true);
    setMessage("wrongEmailMessage", "", true);
  }

  function openWrongEmail() {
    $("forgotPane")?.setAttribute("hidden", "");
    $("loginBlock")?.setAttribute("hidden", "");
    document.querySelector(".account-recovery-links")?.setAttribute("hidden", "");
    $("wrongEmailPane")?.removeAttribute("hidden");
    const title = $("boxTitle");
    if (title) title.textContent = "Corrigir e-mail";
    setMessage("wrongEmailMessage", "", true);
  }

  async function sendRecovery() {
    const button = $("btnSendRecovery");
    const identifier = String($("recoveryIdentifier")?.value || "").trim();
    if (!identifier) return setMessage("recoveryMessage", "Informe seu RA, CPF ou e-mail.", false);

    try {
      button.disabled = true;
      button.textContent = "Enviando...";

      const result = await window.sb.functions.invoke("recuperar-senha", {
        body: { identificador: identifier }
      });
      if (result.error || !result.data?.ok) {
        const email = await resolveRecoveryEmail(identifier);
        const redirectTo = "https://www.portalaltitude.com.br/login/?recovery=1";
        const { error } = await window.sb.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
      }

      setMessage("recoveryMessage", "Se os dados estiverem cadastrados, o link será enviado em instantes. Verifique também spam e lixo eletrônico.", true);
    } catch (error) {
      const message = /rate|limit/i.test(error.message || "")
        ? "Muitas tentativas. Aguarde alguns minutos e tente novamente."
        : (error.message || "Não foi possível enviar o link agora.");
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
    setMessage("resetFinalMsg", "", true);
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
      setMessage("resetFinalMsg", "Senha redefinida com sucesso. Você já pode entrar.", true);
      setTimeout(async () => {
        await window.sb.auth.signOut();
        history.replaceState({}, document.title, "/login/?senha=redefinida");
        location.reload();
      }, 1100);
    } catch (error) {
      setMessage("resetFinalMsg", error.message || "Não foi possível atualizar a senha.", false);
    } finally {
      button.disabled = false;
      button.textContent = "Salvar nova senha";
    }
  }

  async function callEmailCorrection(acao) {
    const cpf = onlyDigits($("wrongEmailCpf")?.value || "");
    const nascimento = String($("wrongEmailBirth")?.value || "");
    const senha = String($("wrongEmailPassword")?.value || "");
    const novoEmail = String($("wrongEmailNew")?.value || "").trim().toLowerCase();
    const novoEmail2 = String($("wrongEmailNew2")?.value || "").trim().toLowerCase();
    const fix = acao === "corrigir_email";

    if (cpf.length !== 11) return setMessage("wrongEmailMessage", "Informe um CPF válido.", false);
    if (!nascimento) return setMessage("wrongEmailMessage", "Informe a data de nascimento.", false);
    if (!senha) return setMessage("wrongEmailMessage", "Informe a senha cadastrada.", false);
    if (fix) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoEmail)) return setMessage("wrongEmailMessage", "Informe um novo e-mail válido.", false);
      if (novoEmail !== novoEmail2) return setMessage("wrongEmailMessage", "Os novos e-mails não coincidem.", false);
    }

    const button = fix ? $("btnFixWrongEmail") : $("btnResendConfirmation");
    const original = button?.textContent || "Enviar";
    try {
      if (button) { button.disabled = true; button.textContent = "Validando..."; }
      const { data, error } = await window.sb.functions.invoke("corrigir-email-cadastro", {
        body: {
          acao,
          cpf,
          data_nascimento: nascimento,
          senha,
          novo_email: fix ? novoEmail : null
        }
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Não foi possível concluir a solicitação.");
      setMessage("wrongEmailMessage", fix
        ? "E-mail corrigido. Enviamos uma nova confirmação para o endereço informado."
        : `Nova confirmação enviada${data?.email_mascarado ? ` para ${data.email_mascarado}` : ""}.`, true);
      if (fix) {
        $("wrongEmailPassword").value = "";
        $("wrongEmailNew").value = "";
        $("wrongEmailNew2").value = "";
      }
    } catch (error) {
      const raw = String(error?.message || "");
      const msg = /confirmed|confirmad/i.test(raw)
        ? "Este e-mail já foi confirmado. Para trocar o endereço de uma conta ativa, entre no portal ou procure a gestão."
        : raw || "Não foi possível validar os dados.";
      setMessage("wrongEmailMessage", msg, false);
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  async function prepareRecoverySession() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const recoveryRequested = params.get("recovery") === "1" || location.hash.includes("type=recovery") || Boolean(code);
    const authError = params.get("error_description") || params.get("error");
    if (authError) {
      openRecovery();
      setMessage("recoveryMessage", "O link expirou, já foi utilizado ou é inválido. Solicite outro link.", false);
      return;
    }
    if (!recoveryRequested) return;

    try {
      if (code) {
        const { error } = await window.sb.auth.exchangeCodeForSession(code);
        if (error && !/already|session/i.test(error.message || "")) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 180));
      const { data } = await window.sb.auth.getSession();
      if (data?.session) {
        history.replaceState({}, document.title, "/login/?recovery=1");
        showResetModal();
      } else {
        openRecovery();
        setMessage("recoveryMessage", "O link expirou ou já foi utilizado. Solicite outro link.", false);
      }
    } catch (_) {
      openRecovery();
      setMessage("recoveryMessage", "Não foi possível validar o link. Solicite uma nova redefinição.", false);
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
    $("linkWrongEmail")?.addEventListener("click", (event) => {
      event.preventDefault();
      const open = !$("wrongEmailPane")?.hasAttribute("hidden");
      open ? backToLogin() : openWrongEmail();
    });
    $("btnSendRecovery")?.addEventListener("click", sendRecovery);
    $("recoveryIdentifier")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); sendRecovery(); }
    });
    $("btnFixWrongEmail")?.addEventListener("click", () => callEmailCorrection("corrigir_email"));
    $("btnResendConfirmation")?.addEventListener("click", () => callEmailCorrection("reenviar_confirmacao"));
    $("btnDoReset")?.addEventListener("click", saveNewPassword);
    $("resetClose")?.addEventListener("click", closeResetModal);
    $("resetOverlay")?.addEventListener("click", (event) => { if (event.target.id === "resetOverlay") closeResetModal(); });

    const params = new URLSearchParams(location.search);
    if (params.get("corrigir-email") === "1") openWrongEmail();
    if (params.get("senha") === "redefinida") {
      const title = $("boxTitle");
      if (title) title.textContent = "Senha redefinida com sucesso";
    }
    if (params.get("confirmacao") === "sucesso") {
      const title = $("boxTitle");
      if (title) title.textContent = "E-mail confirmado — faça seu login";
    }
    await prepareRecoverySession();
  });
})();
