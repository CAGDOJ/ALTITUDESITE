
// /Projeto/4-java/inputs-helpers.js
document.addEventListener('DOMContentLoaded', () => {
  // ===== Helpers de UI =====
  const getGroup = (el) => el.closest('.form-group') || el.parentElement;
  const getErr = (el, id) => {
    const wrap = getGroup(el);
    let small = wrap.querySelector(`#${id}`);
    if (!small) {
      small = document.createElement('small');
      small.id = id;
      small.className = 'field-error';
      small.style.display = 'block';
      small.style.marginTop = '4px';
      wrap.appendChild(small);
    }
    return small;
  };
  const setOk = (small, msg = '') => { small.style.color = '#2ecc71'; small.textContent = msg; };
  const setErr = (small, msg = '') => { small.style.color = 'crimson'; small.textContent = msg; };

  // ===== Mostrar/Ocultar Senha (olho) =====
  document.querySelectorAll('.eye-toggle').forEach(btn => {
  const input = document.getElementById(btn.dataset.target);
  if (!input) return;

  // começa como "senha oculta"
  btn.setAttribute('aria-pressed', 'false');

  btn.addEventListener('click', () => {
    const showing = btn.getAttribute('aria-pressed') === 'true';
    input.type = showing ? 'password' : 'text';
    btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
    btn.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
  });
});


  // ===== Senhas iguais (✔️/❌) =====
  const pass1 = document.getElementById('password');
  const pass2 = document.getElementById('password2');
  const matchIcon = document.getElementById('match-ok');

  const checkMatch = () => {
    if (!pass1 || !pass2 || !matchIcon) return;
    if (pass1.value && pass2.value) {
      if (pass1.value === pass2.value) {
        matchIcon.textContent = 'Senha Válida ✔️';
        matchIcon.style.color = '#2ecc71';
      } else {
        matchIcon.textContent = 'Senhas não são iguais❌';
        matchIcon.style.color = 'crimson';
      }
    } else {
      matchIcon.textContent = '';
    }
  };
  if (pass1 && pass2) {
    pass1.addEventListener('input', checkMatch);
    pass2.addEventListener('input', checkMatch);
  }

  // ===== CPF: máscara + validação =====
  const cpfEl = document.getElementById('cpf');
  const cpfMask = (v) =>
    v.replace(/\D/g, '')
     .slice(0, 11)
     .replace(/(\d{3})(\d)/, '$1.$2')
     .replace(/(\d{3})(\d)/, '$1.$2')
     .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

  const cpfValido = (raw) => {
    const num = raw.replace(/\D/g, '');
    if (num.length !== 11 || /^(\d)\1{10}$/.test(num)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += parseInt(num.charAt(i)) * (10 - i);
    let d1 = 11 - (s % 11); d1 = d1 > 9 ? 0 : d1;
    if (d1 !== parseInt(num.charAt(9))) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += parseInt(num.charAt(i)) * (11 - i);
    let d2 = 11 - (s % 11); d2 = d2 > 9 ? 0 : d2;
    return d2 === parseInt(num.charAt(10));
  };

  if (cpfEl) {
    const err = getErr(cpfEl, 'err-cpf');
    cpfEl.addEventListener('input', () => {
      cpfEl.value = cpfMask(cpfEl.value);
      const digits = cpfEl.value.replace(/\D/g, '');
      if (digits.length < 11) {
        setErr(err, 'Digite os 11 dígitos do CPF.');
      } else if (!cpfValido(cpfEl.value)) {
        setErr(err, 'CPF inválido.');
      } else {
        setOk(err, 'CPF válido ✔️');
      }
    });
    cpfEl.addEventListener('blur', () => {
      const digits = cpfEl.value.replace(/\D/g, '');
      if (!digits) { err.textContent = ''; return; }
      if (digits.length < 11 || !cpfValido(cpfEl.value)) setErr(err, 'CPF inválido.');
      else setOk(err, 'CPF válido ✔️');
    });
  }

  // ===== E-mail: validação ampla + sugestão de typos =====
  const emailEl = document.getElementById('email');
  if (emailEl) {
    const err = getErr(emailEl, 'err-email');
    const reMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

    // mapa de typos comuns → sugestão
    const suggestions = {
      'gamil.com': 'gmail.com',
      'gmial.com': 'gmail.com',
      'hotamil.com': 'hotmail.com',
      'hotmal.com': 'hotmail.com',
      'outlok.com': 'outlook.com',
      'yaho.com': 'yahoo.com'
    };

    const checkEmail = () => {
      const v = emailEl.value.trim().toLowerCase();
      if (!v) { err.textContent = ''; return; }

      if (!reMail.test(v)) {
        setErr(err, 'E-mail inválido. Ex.: nome@dominio.com');
        return;
      }

      // sugestão de domínio em caso de typo
      const dom = v.split('@')[1] || '';
      if (suggestions[dom]) {
        setOk(err, `Parece que quis dizer ${v.split('@')[0]}@${suggestions[dom]} ?`);
      } else {
        setOk(err, 'E-mail válido ✔️');
      }
    };

    emailEl.addEventListener('input', checkEmail);
    emailEl.addEventListener('blur', checkEmail);
  }

  // ===== (Opcional) Telefone com DDD se existir #phone =====
  const phoneEl = document.getElementById('phone');
  if (phoneEl) {
    const err = getErr(phoneEl, 'err-phone');
    const maskPhone = (v) =>
      v.replace(/\D/g, '')
       .slice(0, 11)
       .replace(/^(\d{2})(\d)/, '($1) $2')
       .replace(/(\d{5})(\d{1,4})$/, '$1-$2');

    phoneEl.addEventListener('input', () => {
      phoneEl.value = maskPhone(phoneEl.value);
      const digits = phoneEl.value.replace(/\D/g, '');
      if (digits.length < 11) {
        setErr(err, 'Informe DDD + número (11 dígitos).');
      } else {
        setOk(err, 'Telefone válido ✔️');
      }
    });
    phoneEl.addEventListener('blur', () => {
      const digits = phoneEl.value.replace(/\D/g, '');
      if (!digits) { err.textContent = ''; return; }
      if (digits.length < 11) setErr(err, 'Informe DDD + número (11 dígitos).');
      else setOk(err, 'Telefone válido ✔️');
    });
  }
});
