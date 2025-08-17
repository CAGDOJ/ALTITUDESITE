// UI do login: “Esqueci minha senha” que substitui o formulário, abas, máscara, olho
(function () {
  const onlyDigits = v => (v || '').replace(/\D+/g, '');
  const maskCPF = v => {
    let s = onlyDigits(v).slice(0, 11);
    return s.replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  document.addEventListener('DOMContentLoaded', () => {
    const form       = document.querySelector('form.login-form');
    const loginBlock = document.getElementById('loginBlock');   // bloco com RA, senha e ENTRAR
    const forgotPane = document.getElementById('forgotPane');   // painel de recuperação
    const forgotLink = document.querySelector('.forgot');

    // elementos do login para ocultar/mostrar quando abrir o painel
    const coreEls = [];
    (loginBlock ? Array.from(loginBlock.children) : Array.from(form.children))
      .forEach(el => { if (el !== forgotPane) coreEls.push(el); });

    function activateTab(tab) {
      document.querySelectorAll('.tab').forEach(t => (t.hidden = true));
      const tgt = document.getElementById('tab-' + tab); if (tgt) tgt.hidden = false;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const b = document.querySelector('.tab-btn[data-tab="' + tab + '"]'); if (b) b.classList.add('active');
    }
    function showForgot(defaultTab = 'cpf') {
      coreEls.forEach(el => (el.hidden = true));
      if (forgotPane) forgotPane.hidden = false;
      activateTab(defaultTab);
    }
    function backToLogin() {
      if (forgotPane) forgotPane.hidden = true;
      coreEls.forEach(el => (el.hidden = false));
    }

    if (forgotLink) forgotLink.addEventListener('click', e => { e.preventDefault(); showForgot('cpf'); });
    const backBtn = document.getElementById('backToLogin'); if (backBtn) backBtn.addEventListener('click', backToLogin);

    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

    const cpfRec = document.getElementById('cpfRecovery');
    if (cpfRec) cpfRec.addEventListener('input', e => e.target.value = maskCPF(e.target.value));

    // Buscar RA por nome
    const btnFindRA = document.getElementById('btnFindRA');
    if (btnFindRA) btnFindRA.addEventListener('click', async () => {
      const name = (document.getElementById('fullNameRecovery')?.value || '').trim();
      const hint = document.getElementById('raResult');
      if (!name) { hint.textContent = 'Informe o nome completo.'; hint.className = 'msg err'; return; }
      hint.textContent = 'Procurando...'; hint.className = 'msg';
      try {
        if (!window.sb) throw new Error('Conexão indisponível.');
        const { data, error } = await sb.from('alunos').select('ra').ilike('nome', name).limit(1);
        if (error || !data?.length) { hint.textContent = 'Nome não encontrado.'; hint.className = 'msg err'; return; }
        hint.textContent = 'Seu RA é: ' + (data[0].ra || '(não cadastrado)'); hint.className = 'msg ok';
      } catch (e) {
        console.error(e); hint.textContent = 'Não foi possível buscar o RA.'; hint.className = 'msg err';
      }
    });

    // Redefinir por CPF (envia e-mail via Supabase Auth)
    const btnResetCpf = document.getElementById('btnResetByCpf');
    if (btnResetCpf) btnResetCpf.addEventListener('click', async () => {
      const cpf  = onlyDigits(document.getElementById('cpfRecovery')?.value);
      const hint = document.getElementById('cpfResult');
      if (!cpf || cpf.length !== 11) { hint.textContent = 'CPF inválido.'; hint.className = 'msg err'; return; }
      hint.textContent = 'Validando CPF...'; hint.className = 'msg';
      try {
        if (!window.sb) throw new Error('Conexão indisponível.');
        const { data, error } = await sb.from('alunos').select('email').eq('cpf', cpf).single();
        if (error || !data?.email) { hint.textContent = 'CPF não encontrado.'; hint.className = 'msg err'; return; }
        const redirect = location.origin + '/Projeto/1-html/nova-senha.html';
        const { error: resetErr } = await sb.auth.resetPasswordForEmail(data.email, { redirectTo: redirect });
        if (resetErr) throw resetErr;
        hint.textContent = 'Enviamos o link de redefinição para ' + data.email + '.'; hint.className = 'msg ok';
      } catch (e) {
        console.error(e);
        const m = (e?.message || '').toLowerCase();
        hint.textContent = m.includes('rate limit') ? 'Muitas tentativas. Aguarde e tente novamente.' : 'Não foi possível enviar o link.';
        hint.className = 'msg err';
      }
    });

    // Olho da senha
    document.addEventListener('click', ev => {
      const btn = ev.target.closest('.toggle-pass'); if (!btn) return;
      const input = document.getElementById(btn.getAttribute('data-target')); if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      const icon = btn.querySelector('i');
      if (icon) icon.className = (input.type === 'password') ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
    });
  });
})();


// ===== 3-ETAPAS: confirmação (CPF+Nasc), nova senha, redirecionamento =====
(function () {
  const onlyDigits = v => (v || '').replace(/\D+/g, '');
  const maskCPF = v => {
    let s = onlyDigits(v).slice(0, 11);
    return s.replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };
  const toYMD = (v) => {
    // aceita "YYYY-MM-DD" do input date e também "DD/MM/YYYY"
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return v;
  };

  // estado temporário
  let foundUser = null; // { nome, email }

  document.addEventListener('DOMContentLoaded', () => {
    const sb = window.sb;
    const title = document.getElementById('boxTitle');
    const loginBlock = document.getElementById('loginBlock');
    const step1 = document.getElementById('resetStep1');
    const step1Msg = document.getElementById('resetStep1Msg');
    const linkForgot = document.getElementById('linkForgot');
    const cpfEl = document.getElementById('cpfReset');
    const dobEl = document.getElementById('dobReset');

    const overlay = document.getElementById('resetOverlay');
    const helloName = document.getElementById('helloName');
    const newPass = document.getElementById('newPass');
    const newPass2 = document.getElementById('newPass2');
    const btnDoReset = document.getElementById('btnDoReset');
    const finalMsg = document.getElementById('resetFinalMsg');

    function showStep1() {
      // esconde bloco de login e mostra step1
      if (title) title.textContent = 'Insira suas informações para redefinir';
      if (loginBlock) loginBlock.hidden = true;
      if (document.getElementById('forgotPane')) document.getElementById('forgotPane').hidden = true;
      if (step1){ step1.hidden = false; step1.style.display = 'block'; }
      step1Msg.textContent = '';
    }
    function backToLogin() {
      if (title) title.textContent = 'Informe seu Login';
      if (loginBlock) loginBlock.hidden = false;
      if (step1){ step1.hidden = true; step1.style.display = ''; }
      if (overlay) overlay.hidden = true;
    }
    function openOverlay(name) {
      helloName.textContent = `Olá ${name}`;
      overlay.hidden = false;
      finalMsg.textContent = '';
      newPass.value = '';
      newPass2.value = '';
      // armazena para retorno via e-mail recovery
      try {
        localStorage.setItem('pendingResetName', name);
        localStorage.setItem('pendingResetEmail', foundUser?.email || '');
      } catch(e) {}
    }
    function closeOverlay() {
      overlay.hidden = true;
    }

    if (linkForgot) linkForgot.addEventListener('click', (e) => {
      e.preventDefault();
      showStep1();
    });
    const cancelBtn = document.getElementById('btnResetCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', backToLogin);
    const closeBtn = document.getElementById('resetClose');
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);

    if (cpfEl) cpfEl.addEventListener('input', e => e.target.value = maskCPF(e.target.value));

    // Etapa 1: confirmar por CPF + nascimento
    const btnConfirm = document.getElementById('btnResetConfirm');
    if (btnConfirm) btnConfirm.addEventListener('click', async () => {
      step1Msg.textContent = '';
      const cpfDigits = onlyDigits(cpfEl?.value || '');
      const birthYMD = toYMD(dobEl?.value || '');

      if (!cpfDigits || cpfDigits.length !== 11) {
        step1Msg.textContent = 'Informe um CPF válido.';
        step1Msg.className = 'msg err';
        return;
      }
      if (!birthYMD) {
        step1Msg.textContent = 'Informe a data de nascimento.';
        step1Msg.className = 'msg err';
        return;
      }
      if (!window.sb) {
        step1Msg.textContent = 'Conexão indisponível.';
        step1Msg.className = 'msg err';
        return;
      }
      btnConfirm.disabled = true; btnConfirm.textContent = 'Validando...';
      try {
        // Tenta checar por duas colunas possíveis: "nascimento" OU "data_nascimento"
        let resp = await sb.from('alunos').select('nome,email,nascimento,data_nascimento')
          .eq('cpf', cpfDigits).limit(1);
        if (resp.error) throw resp.error;
        let row = (resp.data && resp.data[0]) || null;

        if (!row) {
          step1Msg.textContent = 'CPF não encontrado.';
          step1Msg.className = 'msg err';
          return;
        }
        // normaliza possíveis formatos
        const stored = row.nascimento || row.data_nascimento || '';
        const storedYMD = toYMD(String(stored));
        if (!storedYMD || storedYMD !== birthYMD) {
          step1Msg.textContent = 'Data de nascimento não confere.';
          step1Msg.className = 'msg err';
          return;
        }
        foundUser = { nome: row.nome || 'aluno(a)', email: String(row.email||'').toLowerCase() };
        // Abre a sobreposição com "Olá Fulano"
        openOverlay(foundUser.nome);
      } catch (e) {
        console.error(e);
        step1Msg.textContent = 'Não foi possível validar os dados.';
        step1Msg.className = 'msg err';
      } finally {
        btnConfirm.disabled = false; btnConfirm.textContent = 'Confirmar';
      }
    });

    // Validação simples de senha igual
    function checkMatch() {
      const msg = document.getElementById('match-ok');
      if (!msg) return;
      if (newPass.value && newPass2.value) {
        if (newPass.value === newPass2.value && newPass.value.length >= 6) {
          msg.textContent = 'Senha Válida ✔️';
          msg.className = 'msg ok';
        } else {
          msg.textContent = 'As senhas não coincidem (mínimo 6 caracteres).';
          msg.className = 'msg err';
        }
      } else {
        msg.textContent = '';
      }
    }
    if (newPass) newPass.addEventListener('input', checkMatch);
    if (newPass2) newPass2.addEventListener('input', checkMatch);

    // Utilitário: detecta se já temos sessão de recuperação
    async function hasRecoverySession() {
      try {
        // quando o usuário volta do e-mail, a URL traz type=recovery e há uma sessão temporária
        const hash = location.hash || '';
        if (hash.includes('type=recovery')) return true;
        const { data } = await sb.auth.getSession();
        // na recuperação, costuma haver uma session temporária também
        return !!data?.session;
      } catch (e) { return false; }
    }

    // Etapa 2: salvar nova senha
    if (btnDoReset) btnDoReset.addEventListener('click', async () => {
      finalMsg.textContent = '';
      const p1 = newPass.value.trim();
      const p2 = newPass2.value.trim();
      if (!p1 || p1.length < 6) {
        finalMsg.textContent = 'A senha deve ter pelo menos 6 caracteres.';
        finalMsg.className = 'msg err';
        return;
      }
      if (p1 !== p2) {
        finalMsg.textContent = 'As senhas não coincidem.';
        finalMsg.className = 'msg err';
        return;
      }
      if (!foundUser?.email) {
        finalMsg.textContent = 'Não foi possível identificar o aluno.';
        finalMsg.className = 'msg err';
        return;
      }

      btnDoReset.disabled = true; btnDoReset.textContent = 'Salvando...';
      try {
        if (await hasRecoverySession()) {
          // Já temos sessão de recuperação ativa -> podemos atualizar direto
          const { error } = await sb.auth.updateUser({ password: p1 });
          if (error) throw error;
          finalMsg.textContent = 'Senha alterada com sucesso! Redirecionando...';
          finalMsg.className = 'msg ok';
          setTimeout(() => {
            window.location.href = '/Projeto/1-html/11-portaldoaluno.html';
          }, 800);
        } else {
          // Sem sessão de recuperação: enviamos o e-mail automático e explicamos
          const redirect = location.origin + location.pathname + '#type=recovery';
          const { error } = await sb.auth.resetPasswordForEmail(foundUser.email, { redirectTo: redirect });
          if (error) throw error;
          finalMsg.innerHTML = 'Enviamos um link para <b>' + foundUser.email +
            '</b>. Abra-o e você voltará para esta tela; então clique novamente em "Salvar nova senha".';
          finalMsg.className = 'msg ok';
        }
      } catch (e) {
        console.error(e);
        const m = (e?.message || '').toLowerCase();
        finalMsg.textContent = m.includes('rate limit') ? 'Muitas tentativas. Aguarde alguns minutos.' : 'Não foi possível alterar a senha.';
        finalMsg.className = 'msg err';
      } finally {
        btnDoReset.disabled = false; btnDoReset.textContent = 'Salvar nova senha';
      }
    });

    // Caso o usuário tenha voltado de um link de recuperação, reabrimos o modal
    (async function resumeIfRecovery() {
      try {
        const fromRecovery = (location.hash || '').includes('type=recovery');
        if (!fromRecovery) return;
        // recarrega as infos armazenadas
        const name = localStorage.getItem('pendingResetName') || 'aluno(a)';
        if (title) title.textContent = 'Insira suas informações para redefinir';
        if (loginBlock) loginBlock.hidden = true;
        if (step1){ step1.hidden = false; step1.style.display = 'block'; }
        // pula direto para a sobreposição para o usuário só digitar a senha
        openOverlay(name);
      } catch(e){}
    })();
  });
})();
