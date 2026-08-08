// === Inicialização global do Supabase ===
// Mantém sessões separadas para ALUNO e GESTOR no mesmo navegador.
// Isso evita que entrar no Portal de Gestão desconecte ou substitua a sessão do aluno.
(function () {
  'use strict';

  const SUPABASE_URL = 'https://qwidlndoyhzvsrggwsba.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3aWRsbmRveWh6dnNyZ2d3c2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NDY4MjUsImV4cCI6MjA5MjIyMjgyNX0.CPcmbAC9KXLgdLVoAY_lRqjFyVzLLMiv38vKR2DFJeE';

  const path = String(window.location.pathname || '').toLowerCase();
  const isGestor = path.includes('/portaldogestor') || path.includes('/login-gestor') || path.includes('12-portaldogestor') || path.includes('14-login-gestor');
  const authContext = isGestor ? 'gestor' : 'aluno';
  const storageKey = isGestor ? 'altitude-auth-gestor-v17' : 'altitude-auth-aluno-v17';

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    global: {
      headers: {
        'x-altitude-client': `portal-${authContext}-v17`
      }
    }
  });

  window.sb = client;
  window.ALTITUDE_AUTH_CONTEXT = authContext;
  if (isGestor) window.sbGestor = client;
  else window.sbAluno = client;

  console.info(`Supabase conectado no contexto ${authContext}.`);
})();
