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

    function 
activateTab(tab) {
      const step1 = document.getElementById('resetStep1');
      const title = document.getElementById('boxTitle');
      const loginBlock = document.getElementById('loginBlock');
      const forgotPane = document.getElementById('forgotPane');

      if (tab === 'cpf') {
        // Esconde o painel padrão e mostra nosso fluxo CPF+Nascimento
        if (forgotPane) forgotPane.hidden = true;
        if (loginBlock) loginBlock.hidden = true;
        if (step1) { step1.hidden = false; step1.style.display = 'block'; try { step1.querySelectorAll('.link-back,#backToLogin').forEach(el=>el.remove()); } catch(e){} }
        if (title) title.textContent = 'Insira suas informações para redefinir';
        return;
      }

      // Volta para a aba de RA (e garante que nosso step1 suma)
      if (step1) { step1.hidden = true; step1.style.display = ''; }
      if (forgotPane) forgotPane.hidden = false;
      if (title) title.textContent = 'Informe seu Login';

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

    if (forgotLink) forgotLink.addEventListener('click', e => { e.preventDefault(); showForgot('ra'); });
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


// ===== Fluxo CPF+Nascimento -> modal nova senha =====
(function () {
  const onlyDigits = v => (v || '').replace(/\D+/g, '');
  const toYMD = (v) => {
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return v;
  };
  document.addEventListener('DOMContentLoaded', () => {
    const sb = window.sb;
    const cpfEl = document.getElementById('cpfReset');
    const dobEl = document.getElementById('dobReset');
    const msgEl = document.getElementById('resetStep1Msg');
    
    const goRA2 = document.getElementById('goRA2');
    const goCPF2 = document.getElementById('goCPF2');
    if (goRA2) goRA2.addEventListener('click', (e) => { e.preventDefault(); showForgotRA(); });
    if (goCPF2) goCPF2.addEventListener('click', (e) => { e.preventDefault(); showStep1(); });
    const btnConfirm = document.getElementById('btnResetConfirm');

    const overlay = document.getElementById('resetOverlay');
    const helloName = document.getElementById('helloName');
    const newPass = document.getElementById('newPass');
    const newPass2 = document.getElementById('newPass2');
    const btnSave = document.getElementById('btnDoReset');
    const finalMsg = document.getElementById('resetFinalMsg');

    let currentEmail = null;

    if (cpfEl) cpfEl.addEventListener('input', e => {
      e.target.value = onlyDigits(e.target.value).slice(0,11).replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    });

    function openOverlay(name, email) {
      helloName.textContent = 'Olá ' + (name || 'aluno(a)');
      currentEmail = (email||'').toLowerCase();
      overlay.hidden = false;
      finalMsg.textContent = '';
      newPass.value = '';
      newPass2.value = '';
    }
    function hasRecovery() {
      const h = location.hash||'';
      return h.includes('type=recovery');
    }

    if (btnConfirm) btnConfirm.addEventListener('click', async () => {
      msgEl.textContent = '';
      const cpfDigits = onlyDigits(cpfEl?.value||'');
      const birth = toYMD(dobEl?.value||'');
      if (cpfDigits.length !== 11) { msgEl.textContent='Informe um CPF válido.'; msgEl.className='msg err'; return; }
      if (!birth) { msgEl.textContent='Informe a data de nascimento.'; msgEl.className='msg err'; return; }
      if (!sb) { msgEl.textContent='Conexão indisponível.'; msgEl.className='msg err'; return; }

      btnConfirm.disabled = True; btnConfirm.textContent='Validando...';
      try {
        const { data, error } = await sb.from('alunos').select('nome,email,nascimento,data_nascimento').eq('cpf', cpfDigits).limit(1);
        if (error) throw error;
        const row = data && data[0];
        if (!row) { msgEl.textContent='CPF não encontrado.'; msgEl.className='msg err'; return; }
        const storedYMD = toYMD(String(row.nascimento || row.data_nascimento || ''));
        if (storedYMD !== birth) { msgEl.textContent='Data de nascimento não confere.'; msgEl.className='msg err'; return; }
        openOverlay(row.nome, row.email);
      } catch (e) {
        console.error(e);
        msgEl.textContent='Não foi possível validar os dados.'; msgEl.className='msg err';
      } finally {
        btnConfirm.disabled = false; btnConfirm.textContent='Confirmar';
      }
    });

    function checkMatch() {
      const hint = document.getElementById('match-ok');
      if (!hint) return;
      const a = newPass.value, b = newPass2.value;
      if (a && b) {
        if (a === b && a.length >= 6) { hint.textContent='Senha Válida ✔️'; hint.className='msg ok'; }
        else { hint.textContent='As senhas não coincidem (mínimo 6 caracteres).'; hint.className='msg err'; }
      } else { hint.textContent=''; }
    }
    if (newPass) newPass.addEventListener('input', checkMatch);
    if (newPass2) newPass2.addEventListener('input', checkMatch);

    if (btnSave) btnSave.addEventListener('click', async () => {
      finalMsg.textContent='';
      if (!currentEmail) { finalMsg.textContent='Não foi possível identificar o aluno.'; finalMsg.className='msg err'; return; }
      const p1 = (newPass.value||'').trim(), p2 = (newPass2.value||'').trim();
      if (p1.length < 6) { finalMsg.textContent='A senha deve ter pelo menos 6 caracteres.'; finalMsg.className='msg err'; return; }
      if (p1 !== p2) { finalMsg.textContent='As senhas não coincidem.'; finalMsg.className='msg err'; return; }

      try {
        if (hasRecovery()) {
          const { error } = await sb.auth.updateUser({ password: p1 });
          if (error) throw error;
          finalMsg.textContent='Senha alterada! Redirecionando...'; finalMsg.className='msg ok';
          setTimeout(() => location.href='/Projeto/1-html/11-portaldoaluno.html', 800);
        } else {
          const redirect = location.origin + location.pathname + '#type=recovery';
          const { error } = await sb.auth.resetPasswordForEmail(currentEmail, { redirectTo: redirect });
          if (error) throw error;
          finalMsg.innerHTML='Enviamos um link para <b>' + currentEmail + '</b>. Abra-o, volte a esta tela e clique em "Salvar nova senha".';
          finalMsg.className='msg ok';
        }
      } catch (e) {
        console.error(e);
        finalMsg.textContent='Não foi possível alterar a senha.'; finalMsg.className='msg err';
      }
    });

    const closeBtn = document.getElementById('resetClose');
    if (closeBtn) closeBtn.addEventListener('click', () => (overlay.hidden = true));
  });
})();

    // Estado inicial do rodapé
    try { updateFooterLink(); } catch(e){}
