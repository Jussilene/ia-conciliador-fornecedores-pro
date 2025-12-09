// src/controllers/auth.controller.js
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserPassword,
  setResetToken,
  findUserByResetToken,
  clearResetToken,
  updateUserProfile,
} from "../models/user.model.js";
import {
  createSession,
  deleteSessionByToken,
  deleteSessionsByUser,
} from "../models/session.model.js";
import { getDeviceInfoFromRequest } from "../middleware/auth.middleware.js";
import { sendEmail } from "../utils/sendEmail.js";

// helper: cria token aleatório
function gerarTokenAleatorio(bytes = 48) {
  return crypto.randomBytes(bytes).toString("hex");
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Informe e-mail e senha para entrar." });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

    const senhaOk = await bcrypt.compare(password, user.password_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

    const token = gerarTokenAleatorio(32);
    const deviceInfo = getDeviceInfoFromRequest(req);

    await createSession(user.id, token, deviceInfo);

    // cookie HTTP-only
    res.cookie("session_token", token, {
      httpOnly: true,
      sameSite: "lax",
      // secure: true, // quando estiver em https
      maxAge: 1000 * 60 * 60 * 8, // 8h
    });

    return res.json({
      message: "Login realizado com sucesso.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      session: {
        deviceInfo,
      },
    });
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).json({ error: "Erro ao fazer login." });
  }
}

// POST /api/auth/logout
export async function logout(req, res) {
  try {
    const token =
      req.cookies?.session_token ||
      req.headers["x-session-token"] ||
      null;

    if (token) {
      await deleteSessionByToken(token);
    }

    res.clearCookie("session_token");
    return res.json({ message: "Logout realizado com sucesso." });
  } catch (err) {
    console.error("Erro no logout:", err);
    return res.status(500).json({ error: "Erro ao fazer logout." });
  }
}

// GET /api/auth/me
export async function me(req, res) {
  try {
    const { user, sessionInfo } = req;
    if (!user) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    return res.json({
      user,
      session: sessionInfo,
    });
  } catch (err) {
    console.error("Erro no /me:", err);
    return res.status(500).json({ error: "Erro ao carregar sessão." });
  }
}

// POST /api/auth/forgot-password
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Informe o e-mail cadastrado." });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // não entrega se existe ou não
      return res.json({
        message:
          "Se o e-mail estiver cadastrado, você receberá as instruções em instantes.",
      });
    }

    const token = gerarTokenAleatorio(32);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min

    await setResetToken(user.id, token, expiresAt);

    const resetLink = `${req.protocol}://${req.get(
      "host"
    )}/alterar-conta.html?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: "Recuperação de senha – IA Conciliador de Fornecedores PRO",
      html: `
        <p>Olá, ${user.name}!</p>
        <p>Recebemos um pedido para redefinir sua senha.</p>
        <p>Clique no link abaixo para criar uma nova senha (válido por 30 minutos):</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Se você não fez essa solicitação, apenas ignore este e-mail.</p>
      `,
    });

    return res.json({
      message:
        "Se o e-mail estiver cadastrado, você receberá as instruções em instantes.",
    });
  } catch (err) {
    console.error("Erro no forgotPassword:", err);
    return res
      .status(500)
      .json({ error: "Erro ao solicitar recuperação de senha." });
  }
}

// POST /api/auth/reset-password
export async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json({ error: "Token e nova senha são obrigatórios." });
    }

    const user = await findUserByResetToken(token);
    if (!user) {
      return res
        .status(400)
        .json({ error: "Token inválido ou expirado. Solicite novamente." });
    }

    await updateUserPassword(user.id, password);
    await clearResetToken(user.id);
    await deleteSessionsByUser(user.id);

    return res.json({
      message: "Senha alterada com sucesso. Faça login novamente.",
    });
  } catch (err) {
    console.error("Erro no resetPassword:", err);
    return res
      .status(500)
      .json({ error: "Erro ao redefinir a senha. Tente novamente." });
  }
}

// POST /api/auth/update-account  (nome, e-mail, senha opcional)
export async function updateAccount(req, res) {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const { name, email, newPassword } = req.body;

    if (!name || !email) {
      return res
        .status(400)
        .json({ error: "Nome e e-mail são obrigatórios." });
    }

    await updateUserProfile(user.id, { name, email });

    if (newPassword && newPassword.trim().length >= 6) {
      await updateUserPassword(user.id, newPassword.trim());
      await deleteSessionsByUser(user.id); // derruba sessões antigas
    }

    return res.json({
      message: "Dados atualizados com sucesso.",
      user: { id: user.id, name, email },
    });
  } catch (err) {
    console.error("Erro no updateAccount:", err);
    return res
      .status(500)
      .json({ error: "Erro ao atualizar dados da conta." });
  }
}
