// public/js/session.js

async function carregarSessaoAtual() {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Erro ao carregar sessão:", err);
    return null;
  }
}

(async function initSessionUI() {
  const caminho = window.location.pathname;

  const isLoginPage = caminho.endsWith("/login.html");
  const isForgotPage = caminho.endsWith("/esqueceu-senha.html");
  const isAccountPage = caminho.endsWith("/alterar-conta.html");

  // Para login/esqueceu, não precisa validar sessão
  if (isLoginPage || isForgotPage) {
    return;
  }

  const sessionData = await carregarSessaoAtual();

  if (!sessionData) {
    // Se não estiver logado e não for página de conta com token, manda pro login
    const url = new URL(window.location.href);
    const hasToken = url.searchParams.get("token");
    if (!isAccountPage || !hasToken) {
      window.location.href = "/login.html";
    }
    return;
  }

  // Se tiver elementos para mostrar o nome/e-mail, preenche
  const nameEl = document.getElementById("userNameDisplay");
  const emailEl = document.getElementById("userEmailDisplay");

  if (nameEl) nameEl.textContent = sessionData.user?.name || "";
  if (emailEl) emailEl.textContent = sessionData.user?.email || "";
})();
