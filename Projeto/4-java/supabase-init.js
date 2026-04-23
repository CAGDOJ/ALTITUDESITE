// === Inicialização global do Supabase ===
(function () {
  const SUPABASE_URL = "https://qwidlndoyhzvsrggwsba.supabase.co"; 
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3aWRsbmRveWh6dnNyZ2d3c2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NDY4MjUsImV4cCI6MjA5MjIyMjgyNX0.CPcmbAC9KXLgdLVoAY_lRqjFyVzLLMiv38vKR2DFJeE"; // 👈 cola aqui a chave ANON completa

  // cria o cliente global
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✅ Supabase conectado:", window.sb);
})();


