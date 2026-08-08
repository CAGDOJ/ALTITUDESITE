const sb = window.sb;

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) {
    console.error("Supabase não carregado no headerAuth.js");
    return;
  }

  try {
    const { data, error } = await sb.auth.getUser();
    if (error) {
      console.error("Erro ao obter usuário:", error);
      return;
    }

    const user = data?.user;
    if (!user) return;

    const nomeTopo = document.getElementById("nomeUsuarioTopo");
    const emailTopo = document.getElementById("emailUsuarioTopo");

    if (nomeTopo) nomeTopo.textContent = user.email || "Usuário";
    if (emailTopo) emailTopo.textContent = user.email || "—";
  } catch (err) {
    console.error("Erro no headerAuth.js:", err);
  }
});