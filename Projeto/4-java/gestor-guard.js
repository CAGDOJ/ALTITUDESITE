(() => {
  'use strict';
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function retry(fn, attempts = 4) {
    let last;
    for (let i = 0; i < attempts; i += 1) {
      try { return await fn(); } catch (error) { last = error; if (i < attempts - 1) await wait(250 * (i + 1)); }
    }
    throw last;
  }
  window.GESTOR_AUTH_READY = (async () => {
    try {
      const session = await retry(async () => {
        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        if (!data?.session?.user) throw new Error('NOT_AUTHENTICATED');
        return data.session;
      });
      const profiles = await retry(async () => {
        const { data, error } = await sb.rpc('obter_meu_perfil_gestor');
        if (error) throw error;
        if (!Array.isArray(data) || !data.length) throw new Error('NOT_MANAGER');
        return data;
      });
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
      await sb.auth.signOut({ scope: 'local' }).catch(() => {});
      location.replace('14-login-gestor.html?motivo=sessao');
      return null;
    }
  })();
})();
