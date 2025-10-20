// === Inicialização global do Supabase ===
(function () {
  const SUPABASE_URL = "https://mxnvrxqwokvelulzdvmn.supabase.co"; 
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bnZyeHF3b2t2ZWx1bHpkdm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NTQ4MjAsImV4cCI6MjA3MDQzMDgyMH0.DBntQQc91IWYAvMxHknJxjxxFAl5kiWOkc1LUXe_vKE"; // 👈 cola aqui a chave ANON completa

  // cria o cliente global
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✅ Supabase conectado:", SUPABASE_URL);
})();