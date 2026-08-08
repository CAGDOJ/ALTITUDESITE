(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const show = (id, message, error = false) => {
    const box = $(id); if (!box) return;
    box.textContent = message; box.className = `form-message show${error ? ' error' : ''}`;
  };
  const setBusy = (button, busy, label) => {
    if (!button) return;
    if (busy) { button.dataset.text = button.textContent; button.disabled = true; button.textContent = label; }
    else { button.disabled = false; button.textContent = button.dataset.text || button.textContent; }
  };

  async function login(event) {
    event.preventDefault();
    const button = event.submitter;
    setBusy(button, true, 'Verificando acesso...');
    try {
      const gestorId = $('gestorIdLogin').value.trim().toUpperCase();
      const password = $('gestorSenhaLogin').value;
      const { data: email, error: resolveError } = await sb.rpc('resolver_email_gestor', { p_gestor_id: gestorId });
      if (resolveError || !email) throw new Error('ID de gestor não encontrado ou inativo.');
      await sb.auth.signOut({ scope: 'local' }).catch(() => {});
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.session) throw new Error('ID de gestor ou senha inválidos.');
      const { data: profile, error: profileError } = await sb.rpc('obter_meu_perfil_gestor');
      if (profileError || !Array.isArray(profile) || !profile.length) {
        await sb.auth.signOut();
        throw new Error('Esta conta não possui acesso ao Portal de Gestão.');
      }
      location.href = '/portaldogestor/';
    } catch (error) {
      show('gestorLoginMsg', error.message || 'Não foi possível entrar.', true);
    } finally { setBusy(button, false); }
  }


  document.addEventListener('DOMContentLoaded', async () => {
    const { data } = await sb.auth.getUser();
    if (data?.user) {
      const { data: profile } = await sb.rpc('obter_meu_perfil_gestor');
      if (Array.isArray(profile) && profile.length) location.href = '/portaldogestor/';
    }
    $('formLoginGestor')?.addEventListener('submit', login);
    document.querySelectorAll('.toggle-password').forEach(btn => btn.addEventListener('click', () => {
      const input = $(btn.dataset.target); if (input) input.type = input.type === 'password' ? 'text' : 'password';
    }));
  });
})();
