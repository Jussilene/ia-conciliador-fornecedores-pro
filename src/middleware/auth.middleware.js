// src/middleware/auth.middleware.js
import { getSessionByToken, touchSession } from "../models/session.model.js";

export async function requireAuth(req, res, next) {
  try {
    const token =
      req.cookies?.session_token ||
      req.headers["x-session-token"] ||
      null;

    if (!token) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const session = await getSessionByToken(token);
    if (!session) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }

    // Atualiza last_seen_at
    await touchSession(token);

    // Anexa user + session na requisição
    req.user = {
      id: session.user_id,
      name: session.user_name,
      email: session.user_email,
    };
    req.sessionInfo = {
      id: session.id,
      token: session.token,
      deviceInfo: session.device_info,
      createdAt: session.created_at,
      lastSeenAt: session.last_seen_at,
    };

    return next();
  } catch (err) {
    console.error("Erro no requireAuth:", err);
    return res.status(500).json({ error: "Erro interno de autenticação." });
  }
}

// Só pra extrair um resumo do device (mobile / desktop)
export function getDeviceInfoFromRequest(req) {
  const ua = req.get("user-agent") || "";
  let tipo = "desktop";

  if (/android|iphone|ipad|mobile/i.test(ua)) {
    tipo = "mobile";
  }

  return `${tipo} - ${ua.substring(0, 120)}`;
}
