/* ===== login-ui.js (UNIFICADO) =====
   Fluxo completo de recuperação em 3 etapas + ajustes de UI
   - "Esqueci minha senha" abre RA e permanece lá
   - Aba "Redefinir por CPF" abre CPF + Data de nascimento (Step1)
   - Campo "Nome completo" (Descobrir RA) fica CAIXA ALTA e sem acentos/pontuação
   - Remove "voltar ao login" interno do painel; mantém só o do rodapé
   - Modal "Definir nova senha" (Step2) + integração Supabase (reset/update)
   - Rodapé alterna: Esqueci minha senha <-> Voltar ao login
*/
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    // ---------- Utils ----------
    const onlyDigits = v => (v || '').replace(/\D+/g, '');
    const maskCPF = v => {
      let s = onlyDigits(v).slice(0, 11);
      return s.replace(/(\d{3})(\d)/, '$1.$2')
              .replace(/(\d{3})(\d)/, '$1.$2')
              .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    };
    const toYMD = (v) => {
      if (!v) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      return v;
    };
    // Nome em CAIXA ALTA sem acentos/pontuação (para Descobrir RA)
    function sanitizeNameUpper(v){
      if (!v) return '';
      try { v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch(e){}
      v = v.replace(/[^A-Za-z\s]/g, ''); // só letras e espaço
      return v.toUpperCase().replace(/\s{2,}/g,' ').trimStart();
    }

    // ---------- Elementos-base ----------
    const sb = window.sb; // supabase client deve estar disponível
    const title      = document.getElementById('boxTitle') || document.querySelector('.login-title');
    const loginBlock = document.getElementById('loginBlock') || document.querySelector('.login-form')?.closest('div');
    const forgotPane = document.getElementById('forgotPane');
    const forgotLinks = Array.from(document.querySelectorAll('.forgot, .login-options .forgot'));

    // Esconde "voltar" interno do painel (mantém só o rodapé)
    (function hideInlineBack(){
      const style = document.createElement('style');
      style.textContent = '#forgotPane #backToLogin, #forgotPane .link-back{display:none!important}';
      document.head.appendChild(style);
    )();

    // Nome (Descobrir RA) -> CAIXA ALTA sem acentos
    (function bindNameUpper(){
      const nameEl = document.getElementById('fullNameRecovery');
      if (!nameEl) return;
      nameEl.addEventListener('input', () => {
        const cur = nameEl.value;
        const next = sanitizeNameUpper(cur);
        if (next !== cur) {
          const pos = nameEl.selectionStart;
          nameEl.value = next;
          try { nameEl.setSelectionRange(pos, pos); } catch(e){}
        }
      });
      nameEl.addEventListener('blur',  () => { nameEl.value = sanitizeNameUpper(nameEl.value).trim(); });
    )();

    // ---------- Step1 (CPF + Data) & Modal (Nova Senha) ----------
    function ensureStep1(){
      if (document.getElementById('resetStep1')) return;
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
      (forgotPane?.parentNode || document.body).insertBefore(sec, (forgotPane ? forgotPane.nextSibling : null));
    }
    function ensureOverlay(){
      if (document.getElementById('resetOverlay')) return;
      const wrap = document.createElement('div');
      wrap.id = 'resetOverlay';
      wrap.hidden = true;
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;z-index:2000;';
      wrap.innerHTML = `
        <div style="position:relative;width:min(480px,94vw);background:#fff;border:1px solid #e6eef5;border-radius:10px;box-shadow:0 18px 50px rgba(10,61,98,.2);padding:20px 18px 18px;">
          <button type="button" id="resetClose" style="position:absolute;right:12px;top:8px;border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#6b7280;">×</button>
          <h3 style="margin:0 0 4px 0;color:#0a3d62;font-size:1.25rem;"> <span id="helloName">Olá</span> </h3>
          <p style="margin:0 0 10px 0;color:#334155;font-size:.95rem;">Defina sua nova senha de acesso.</p>

          <div class="form-group has-icon">
            <label for="newPass">Senha</label>
            <input id="newPass" type="password" placeholder="Insira sua nova senha" autocomplete="new-password" minlength="6">
            <button type="button" class="toggle-pass" data-target="newPass" aria-label="Mostrar/ocultar senha"><i class="fa-regular fa-eye"></i></button>
          </div>

          <div class="form-group has-icon">
            <label for="newPass2">Confirmar senha</label>
            <input id="newPass2" type="password" placeholder="Confirme sua nova senha" autocomplete="new-password" minlength="6">
            <button type="button" class="toggle-pass" data-target="newPass2" aria-label="Mostrar/ocultar senha"><i class="fa-regular fa-eye"></i></button>
          </div>
          <small id="match-ok" class="msg"></small>

          <div class="forgot-actions" style="justify-content:flex-end;">
            <button type="button" id="btnDoReset" class="btn-login">Salvar nova senha</button>
          </div>
          <small id="resetFinalMsg" class="msg"></small>
        </div>
      `;
      document.body.appendChild(wrap);
    }
    ensureStep1();
    ensureOverlay();

    const step1        = document.getElementById('resetStep1');
    const cpfEl        = document.getElementById('cpfReset');
    const dobEl        = document.getElementById('dobReset');
    const step1Msg     = document.getElementById('resetStep1Msg');
    const btnConfirm   = document.getElementById('btnResetConfirm');
    const overlay      = document.getElementById('resetOverlay');
    const helloName    = document.getElementById('helloName');
    const newPass      = document.getElementById('newPass');
    const newPass2     = document.getElementById('newPass2');
    const btnDoReset   = document.getElementById('btnDoReset');
    const finalMsg     = document.getElementById('resetFinalMsg');

    cpfEl?.addEventListener('input', e => e.target.value = maskCPF(e.target.value));

    // ---------- Rodapé ----------
    function setFooterAsBack(){
      const links = Array.from(document.querySelectorAll('.forgot, .login-options .forgot'));
      links.forEach(fl => { if (!fl) return;
        fl.textContent = 'Voltar ao login';
        fl.onclick = ev => { ev.preventDefault(); backToLogin(); };
      });
    }
    function setFooterAsForgot(){
      const links = Array.from(document.querySelectorAll('.forgot, .login-options .forgot'));
      links.forEach(fl => { if (!fl) return;
        fl.textContent = 'Esqueci minha senha';
        fl.onclick = ev => { ev.preventDefault(); showForgotRA(); };
      });
    }
    function updateFooterLink(){
      const s1 = step1 && !step1.hidden;
      const fp = forgotPane && !forgotPane.hidden;
      (s1 || fp) ? setFooterAsBack() : setFooterAsForgot();
    }

    // ---------- Navegação ----------
    function showStep1(){
      if (title) title.textContent = 'Insira suas informações para redefinir a senha';
      if (loginBlock) loginBlock.hidden = true;
      if (forgotPane) forgotPane.hidden = true;
      if (step1) { step1.hidden = false; step1.style.display = 'block'; }
      const goRA2  = document.getElementById('goRA2');
      const goCPF2 = document.getElementById('goCPF2');
      goRA2?.classList.remove('active'); goCPF2?.classList.add('active');
      if (goRA2 && !goRA2._wired){ goRA2._wired = true; goRA2.addEventListener('click', e => { e.preventDefault(); showForgotRA(); }); }
      if (goCPF2 && !goCPF2._wired){ goCPF2._wired = true; goCPF2.addEventListener('click', e => { e.preventDefault(); showStep1(); }); }
      updateFooterLink();
      rebindForgotLinks();
    }
    function showForgotRA(){
      if (title) title.textContent = 'Descobrir RA';
      if (step1) { step1.hidden = true; step1.style.display = ''; }
      if (loginBlock) loginBlock.hidden = true;
      if (forgotPane) forgotPane.hidden = false;
      try {
        document.querySelectorAll('.tab').forEach(t => (t.hidden = true));
        const tgt = document.getElementById('tab-ra'); if (tgt) tgt.hidden = false;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.tab-btn[data-tab="ra"]')?.classList.add('active');
      } catch(e){}
      updateFooterLink();
      rebindForgotLinks();
    }
    function backToLogin(){
      if (title) title.textContent = 'Informe seu Login';
      if (forgotPane) forgotPane.hidden = true;
      if (step1) { step1.hidden = true; step1.style.display = ''; }
      if (overlay) overlay.hidden = true;
      if (loginBlock) loginBlock.hidden = false;
      updateFooterLink();
      rebindForgotLinks();
    }

    // Footer: abre RA quando está no login; volta ao login quando está no RA/CPF
    function rebindForgotLinks() {
      forgotLinks.forEach(link => {
        const clone = link.cloneNode(true);
        clone.removeAttribute('onclick');
        link.parentNode.replaceChild(clone, link);
        clone.addEventListener('click', ev => {
          ev.preventDefault(); ev.stopImmediatePropagation();
          const s1 = step1 && !step1.hidden;
          const fp = forgotPane && !forgotPane.hidden;
          (s1 || fp) ? backToLogin() : showForgotRA();
          setTimeout(() => { try { updateFooterLink(); } catch(e){} }, 0);
        });
      });
    )();

    // Clicar na aba "Redefinir por CPF" SEMPRE abre o Step1
    document.addEventListener('click', function(e){
      const btn = e.target.closest('.tab-btn[data-tab="cpf"]');
      if (!btn) return;
      e.preventDefault(); e.stopImmediatePropagation();
      showStep1();
    }, true);

    // ---------- Lógica: validar CPF+Data e abrir modal ----------
    let foundEmail = null;
    btnConfirm?.addEventListener('click', async () => {
      step1Msg.textContent = '';
      const cpfDigits = onlyDigits(cpfEl?.value || '');
      const birthYMD = toYMD(dobEl?.value || '');
      if (cpfDigits.length !== 11) { step1Msg.textContent = 'Informe um CPF válido.'; step1Msg.className = 'msg err'; return; }
      if (!birthYMD)           { step1Msg.textContent = 'Informe a data de nascimento.'; step1Msg.className = 'msg err'; return; }
      if (!sb)                 { step1Msg.textContent = 'Conexão indisponível.';        step1Msg.className = 'msg err'; return; }

      btnConfirm.disabled = true; btnConfirm.textContent = 'Validando...';
      try {
        const { data, error } = await sb.from('alunos').select('nome,email,nascimento,data_nascimento').eq('cpf', cpfDigits).limit(1);
        if (error) throw error;
        const row = data && data[0];
        if (!row) { step1Msg.textContent = 'CPF não encontrado.'; step1Msg.className = 'msg err'; return; }
        const storedYMD = toYMD(String(row.nascimento || row.data_nascimento || ''));
        if (storedYMD !== birthYMD) { step1Msg.textContent = 'Data de nascimento não confere.'; step1Msg.className = 'msg err'; return; }
        // ok -> abre modal
        foundEmail = String(row.email || '').toLowerCase();
        helloName.textContent = 'Olá ' + (row.nome || 'aluno(a)');
        overlay.hidden = false;
        try { localStorage.setItem('pendingResetName', row.nome || 'aluno(a)'); localStorage.setItem('pendingResetEmail', foundEmail); } catch(e){}
      } catch (e) {
        console.error(e);
        step1Msg.textContent = 'Não foi possível validar os dados.'; step1Msg.className = 'msg err';
      } finally {
        btnConfirm.disabled = false; btnConfirm.textContent = 'Confirmar';
      }
    });

    // Validação visual das senhas
    function checkMatch() {
      const a = newPass.value, b = newPass2.value, msg = document.getElementById('match-ok');
      if (!msg) return;
      if (a && b) {
        if (a === b && a.length >= 6) { msg.textContent = 'Senha Válida ✔️'; msg.className = 'msg ok'; }
        else { msg.textContent = 'As senhas não coincidem (mínimo 6 caracteres).'; msg.className = 'msg err'; }
      } else { msg.textContent = ''; }
    }
    newPass?.addEventListener('input', checkMatch);
    newPass2?.addEventListener('input', checkMatch);

    // Salvar nova senha (com sessão de recovery) ou enviar link
    function hasRecoverySession(){ return (location.hash || '').includes('type=recovery'); }
    btnDoReset?.addEventListener('click', async () => {
      finalMsg.textContent = '';
      const p1 = (newPass.value || '').trim(), p2 = (newPass2.value || '').trim();
      if (p1.length < 6) { finalMsg.textContent = 'A senha deve ter pelo menos 6 caracteres.'; finalMsg.className = 'msg err'; return; }
      if (p1 !== p2)     { finalMsg.textContent = 'As senhas não coincidem.';              finalMsg.className = 'msg err'; return; }
      if (!foundEmail)   { finalMsg.textContent = 'Não foi possível identificar o aluno.'; finalMsg.className = 'msg err'; return; }

      btnDoReset.disabled = true; btnDoReset.textContent = 'Salvando...';
      try {
        if (hasRecoverySession()) {
          const { error } = await sb.auth.updateUser({ password: p1 });
          if (error) throw error;
          finalMsg.textContent = 'Senha alterada com sucesso! Redirecionando...'; finalMsg.className = 'msg ok';
          setTimeout(() => { window.location.href = '/Projeto/1-html/11-portaldoaluno.html'; }, 800);
        } else {
          const redirect = location.origin + location.pathname + '#type=recovery';
          const { error } = await sb.auth.resetPasswordForEmail(foundEmail, { redirectTo: redirect });
          if (error) throw error;
          finalMsg.innerHTML = 'Enviamos um link para <b>' + foundEmail + '</b>. Abra-o e você voltará para esta tela; então clique novamente em "Salvar nova senha".';
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

    // Fechar modal
    document.getElementById('resetClose')?.addEventListener('click', () => (overlay.hidden = true));

    // Voltar de e-mail de recovery: abre modal direto
    (function resumeIfRecovery(){
      if (!(location.hash || '').includes('type=recovery')) return;
      try {
        const name = localStorage.getItem('pendingResetName') || 'aluno(a)';
        const email = localStorage.getItem('pendingResetEmail') || '';
        if (email) {
          showStep1();
          helloName.textContent = 'Olá ' + name;
          overlay.hidden = false;
        }
      } catch(e){}
    )();
  });
)();