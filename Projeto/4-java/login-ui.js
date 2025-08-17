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

    function ensureStep1(){
      if (document.getElementById('resetStep1')) return;
      const fp = document.getElementById('forgotPane');
      const sec = document.createElement('section');
      sec.id = 'resetStep1';
      sec.className = 'forgot-pane';
      sec.hidden = true;
      sec.innerHTML = `
        <div class="tabs" style="margin-bottom:8px;">
          <button class="tab-btn" data-tab="ra" id="goRA2">Descobrir RA</button>
          <button class="tab-btn active" data-tab="cpf" id="goCPF2">Redefinir por CPF</button>
        </div>
        <div class="form-group">
          <label for="cpfReset">CPF</label>
          <input id="cpfReset" type="text" placeholder="000.000.000-00" inputmode="numeric" autocomplete="off">
        </div>
        <div class="form-group">
          <label for="dobReset">Data de nascimento</label>
          <input id="dobReset" type="date" placeholder="dd/mm/aaaa">
        </div>
        <div class="forgot-actions" style="justify-content:center;">
          <button type="button" id="btnResetConfirm" class="btn-login">Confirmar</button>
        </div>
        <small id="resetStep1Msg" class="msg"></small>
      `;
      (fp?.parentNode || document.body).insertBefore(sec, (fp ? fp.nextSibling : null));
    }
    
    const form       = document.querySelector('form.login-form');
    const loginBlock = document.getElementById('loginBlock');   // bloco com RA, senha e ENTRAR
    const forgotPane = document.getElementById('forgotPane');   // painel de recuperação
    const forgotLink = document.querySelector('.forgot');

    // elementos do login para ocultar/mostrar quando abrir o painel
    const coreEls = [];
    (loginBlock ? Array.from(loginBlock.children) : Array.from(form.children))
      .forEach(el => { if (el !== forgotPane) coreEls.push(el); });

    
    function _updateFooterText(){
      try {
        const forgot = document.querySelector('.forgot');
        const fp = document.getElementById('forgotPane');
        const s1 = document.getElementById('resetStep1');
        const visible = (fp && !fp.hidden) || (s1 && !s1.hidden);
        if (forgot) forgot.textContent = visible ? 'Voltar ao login' : 'Esqueci minha senha';
      } catch(e){}
    }
    function activateTab(tab) {
      document.querySelectorAll('.tab').forEach(t => (t.hidden = true));
      const tgt = document.getElementById('tab-' + tab); if (tgt) tgt.hidden = false;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    // intercept cpf tab to showStep1
    document.querySelectorAll('.tab-btn[data-tab="cpf"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        try { showStep1(); } catch(err){}
      }, true); // capture to beat default handlers
    });
    
      const b = document.querySelector('.tab-btn[data-tab="' + tab + '"]'); if (b) b.classList.add('active');
    }
    function showForgot(defaultTab = 'cpf') {
      try { const t = document.getElementById('boxTitle') || document.querySelector('.login-title'); if (t && defaultTab==='ra') t.textContent = 'Descobrir RA'; } catch(e){}
      // Ajusta título conforme a aba
      try {
        const t = document.getElementById('boxTitle') || document.querySelector('.login-title');
        if (t) t.textContent = (defaultTab === 'ra') ? 'Descobrir RA' : 'Insira suas informações para redefinir';
      } catch(e){}
      coreEls.forEach(el => (el.hidden = true));
      if (forgotPane) forgotPane.hidden = false;
      activateTab(defaultTab);
      _updateFooterText();
    }
    function backToLogin() {
      try {
        const t = document.getElementById('boxTitle') || document.querySelector('.login-title');
        if (t) t.textContent = 'Informe seu Login';
      } catch(e){}
      if (forgotPane) forgotPane.hidden = true;
      coreEls.forEach(el => (el.hidden = false));
      _updateFooterText();
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


    // Router simples para o link do rodapé: se painel está aberto, volta ao login
    document.addEventListener('click', function _footerRouter(e){
      const a = e.target.closest('.forgot'); if (!a) return;
      const fp = document.getElementById('forgotPane'); const s1 = document.getElementById('resetStep1');
      if ((fp && !fp.hidden) || (s1 && !s1.hidden)) {
        e.preventDefault(); backToLogin(); return;
      }
    }, true);
    

    // hide inline back inside forgotPane (keep only footer link)
    (function hideInlineBack(){
      // CSS kill-switch: esconde qualquer 'voltar ao login' interno do forgotPane
      try {
        const style = document.createElement('style');
        style.textContent = '#forgotPane #backToLogin, #forgotPane .link-back{display:none!important}';
        document.head.appendChild(style);
      } catch(e){}
    })();
    

    function showStep1(){
      ensureStep1();
      const title = document.getElementById('boxTitle') || document.querySelector('.login-title');
      const loginBlock = document.getElementById('loginBlock') || document.querySelector('.login-form')?.closest('div');
      const forgotPane = document.getElementById('forgotPane');
      const step1 = document.getElementById('resetStep1');
      if (title) title.textContent = 'Insira suas informações para redefinir';
      if (loginBlock) loginBlock.hidden = true;
      if (forgotPane) forgotPane.hidden = true;
      if (step1) { step1.hidden = false; step1.style.display = 'block'; }
      const goRA2 = document.getElementById('goRA2'); const goCPF2 = document.getElementById('goCPF2');
      if (goRA2 && !goRA2._wired) { goRA2._wired = true; goRA2.addEventListener('click', e => { e.preventDefault(); showForgot('ra'); }, true); }
      if (goCPF2 && !goCPF2._wired) { goCPF2._wired = true; goCPF2.addEventListener('click', e => { e.preventDefault(); showStep1(); }, true); }
    }
    