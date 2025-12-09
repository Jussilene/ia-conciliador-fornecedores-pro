// public/js/auth.js

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await res.json()
    : null;

  if (!res.ok) {
    const msg = payload?.error || "Erro na requisição.";
    throw new Error(msg);
  }

  return payload;
}

// Helper pra pegar querystring (token reset)
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// ======================= LOGIN =======================
(function setupLogin() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("togglePassword");
  const msgEl = document.getElementById("loginMessage");

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      togglePassword.textContent = isPassword ? "ocultar" : "mostrar";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.classList.add("hidden");
    msgEl.textContent = "";

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: emailInput.value,
          password: passwordInput.value,
        }),
      });

      msgEl.textContent = "Login realizado com sucesso. Redirecionando...";
      msgEl.classList.remove("hidden");
      msgEl.classList.remove("text-rose-300");
      msgEl.classList.add("text-emerald-300");

      setTimeout(() => {
        window.location.href = "/index.html";
      }, 800);
    } catch (err) {
      msgEl.textContent = err.message || "Erro ao fazer login.";
      msgEl.classList.remove("hidden");
      msgEl.classList.remove("text-emerald-300");
      msgEl.classList.add("text-rose-300");
    }
  });
})();

// =================== ESQUECEU SENHA ===================
(function setupForgotPassword() {
  const form = document.getElementById("forgotForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const msgEl = document.getElementById("forgotMessage");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.classList.add("hidden");
    msgEl.textContent = "";

    try {
      const data = await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: emailInput.value }),
      });

      msgEl.textContent = data.message;
      msgEl.classList.remove("hidden");
    } catch (err) {
      msgEl.textContent = err.message || "Erro ao solicitar recuperação.";
      msgEl.classList.remove("hidden");
    }
  });
})();

// =================== MINHA CONTA / RESET =============
(function setupAccount() {
  const form = document.getElementById("accountForm");
  if (!form) return;

  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const newPasswordInput = document.getElementById("newPassword");
  const toggleNewPassword = document.getElementById("toggleNewPassword");
  const msgEl = document.getElementById("accountMessage");
  const deviceInfoEl = document.getElementById("deviceInfo");
  const modeInfoEl = document.getElementById("accountModeInfo");
  const accountFields = document.getElementById("accountFields");

  const resetToken = getQueryParam("token");
  const isResetMode = !!resetToken;

  if (toggleNewPassword && newPasswordInput) {
    toggleNewPassword.addEventListener("click", () => {
      const isPassword = newPasswordInput.type === "password";
      newPasswordInput.type = isPassword ? "text" : "password";
      toggleNewPassword.textContent = isPassword ? "ocultar" : "mostrar";
    });
  }

  async function loadAccount() {
    if (isResetMode) {
      // Modo "redefinir senha pelo link"
      modeInfoEl.textContent =
        "Você está redefinindo a senha pelo link enviado por e-mail. Nome e e-mail não serão alterados.";
      accountFields.classList.add("hidden");
      if (deviceInfoEl) deviceInfoEl.textContent = "";
      return;
    }

    modeInfoEl.textContent =
      "Você está editando os dados da sua conta logada.";

    try {
      const data = await api("/api/auth/me", {
        method: "GET",
      });

      if (nameInput) nameInput.value = data.user?.name || "";
      if (emailInput) emailInput.value = data.user?.email || "";

      if (deviceInfoEl && data.session?.deviceInfo) {
        deviceInfoEl.textContent = `Sessão ativa em: ${data.session.deviceInfo}`;
      }
    } catch (err) {
      console.error(err);
      modeInfoEl.textContent = "Não foi possível carregar seus dados.";
    }
  }

  loadAccount();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.classList.add("hidden");
    msgEl.textContent = "";

    try {
      if (isResetMode) {
        // Só senha nova
        if (!newPasswordInput.value || newPasswordInput.value.length < 6) {
          throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
        }

        const data = await api("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({
            token: resetToken,
            password: newPasswordInput.value,
          }),
        });

        msgEl.textContent = data.message;
        msgEl.classList.remove("hidden");
        msgEl.classList.add("text-emerald-300");

        setTimeout(() => {
          window.location.href = "/login.html";
        }, 1200);
        return;
      }

      // Modo conta logada
      const payload = {
        name: nameInput.value,
        email: emailInput.value,
        newPassword: newPasswordInput.value || undefined,
      };

      const data = await api("/api/auth/update-account", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      msgEl.textContent = data.message;
      msgEl.classList.remove("hidden");
      msgEl.classList.add("text-emerald-300");
    } catch (err) {
      msgEl.textContent = err.message || "Erro ao salvar dados.";
      msgEl.classList.remove("hidden");
      msgEl.classList.remove("text-emerald-300");
      msgEl.classList.add("text-rose-300");
    }
  });
})();
