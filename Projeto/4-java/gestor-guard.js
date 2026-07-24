(() => {
  'use strict';
  window.GESTOR_AUTH_READY = (async () => {
    try {
      const { data, error } = await sb.auth.getUser();
      if (error || !data?.user) throw new Error('NOT_AUTHENTICATED');
      const { data: profiles, error: profileError } = await sb.rpc('obter_meu_perfil_gestor');
      if (profileError || !Array.isArray(profiles) || !profiles.length) throw new Error('NOT_MANAGER');
      const profile = profiles[0];
      window.GESTOR_ATUAL = profile;
      const level = Number(profile.nivel_acesso || 1);
      document.querySelectorAll('[data-min-level]').forEach((element) => {
        const allowed = level >= Number(element.dataset.minLevel || 1);
        element.hidden = !allowed;
        element.classList.toggle('access-hidden', !allowed);
      });
      document.body.classList.remove('gestor-auth-pending');
      document.documentElement.classList.add('gestor-autorizado');
      return profile;
    } catch (error) {
      console.warn('Acesso de gestão recusado:', error.message);
      location.replace('14-login-gestor.html');
      return null;
    }
  })();
})();
