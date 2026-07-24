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
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.session) throw new Error('ID de gestor ou senha inválidos.');
      const { data: profile, error: profileError } = await sb.rpc('obter_meu_perfil_gestor');
      if (profileError || !Array.isArray(profile) || !profile.length) {
        await sb.auth.signOut();
        throw new Error('Esta conta não possui acesso ao Portal de Gestão.');
      }
      location.href = '12-portaldogestor.html';
    } catch (error) {
      show('gestorLoginMsg', error.message || 'Não foi possível entrar.', true);
    } finally { setBusy(button, false); }
  }

  async function bootstrap(event) {
    event.preventDefault();
    const button = event.submitter;
    setBusy(button, true, 'Ativando gestor...');
    try {
      const email = $('bootstrapEmail').value.trim().toLowerCase();
      const password = $('bootstrapSenha').value;
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.session) throw new Error('E-mail ou senha da conta existente estão incorretos.');
      const { data: result, error: fnError } = await sb.functions.invoke('gerenciar-gestor', {
        body: {
          acao: 'bootstrap',
          gestor_id: $('bootstrapGestorId').value.trim().toUpperCase(),
          nome: $('bootstrapNome').value.trim()
        }
      });
      if (fnError) throw fnError;
      if (!result?.ok) throw new Error(result?.error || 'Não foi possível ativar o primeiro gestor.');
      show('bootstrapMsg', 'Primeiro gestor ativado. Abrindo o portal...');
      setTimeout(() => { location.href = '12-portaldogestor.html'; }, 700);
    } catch (error) {
      show('bootstrapMsg', error.message || 'Falha na configuração inicial.', true);
    } finally { setBusy(button, false); }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const { data } = await sb.auth.getUser();
    if (data?.user) {
      const { data: profile } = await sb.rpc('obter_meu_perfil_gestor');
      if (Array.isArray(profile) && profile.length) location.href = '12-portaldogestor.html';
    }
    $('formLoginGestor')?.addEventListener('submit', login);
    $('formPrimeiroGestor')?.addEventListener('submit', bootstrap);
    $('abrirPrimeiroAcesso')?.addEventListener('click', () => { $('loginGestorPane').hidden = true; $('primeiroAcessoPane').hidden = false; });
    $('voltarLoginGestor')?.addEventListener('click', () => { $('primeiroAcessoPane').hidden = true; $('loginGestorPane').hidden = false; });
    document.querySelectorAll('.toggle-password').forEach(btn => btn.addEventListener('click', () => {
      const input = $(btn.dataset.target); if (input) input.type = input.type === 'password' ? 'text' : 'password';
    }));
  });
})();
