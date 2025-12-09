// src/routes/auth.routes.js
import express from "express";

const router = express.Router();

// 🔐 "Banco de dados" em memória (por enquanto)
const users = [
  {
    id: 1,
    email: "admju@empresa.com",
    name: "admju",
    password: "123456",
    role: "admin",
  },
  {
    id: 2,
    email: "admb@empresa.com",
    name: "admB",
    password: "123456",
    role: "admin",
  },
  {
    id: 3,
    email: "teste@empresa.com",
    name: "teste",
    password: "123456",
    role: "user",
  },
];

function findUserByEmail(email) {
  if (!email) return null;
  return users.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase()
  );
}

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      message: "Informe e-mail e senha.",
    });
  }

  const user = findUserByEmail(email);

  if (!user || user.password !== password) {
    return res.status(401).json({
      ok: false,
      message: "E-mail ou senha inválidos.",
    });
  }

  // 🔒 Cria uma sessão bem simples em cookie
  res.cookie("sessionUserEmail", user.email, {
    httpOnly: true, // não acessível via JS (produção)
    sameSite: "lax",
    secure: false, // em produção: true com HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  });

  return res.json({
    ok: true,
    message: "Login realizado com sucesso.",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie("sessionUserEmail");
  return res.json({
    ok: true,
    message: "Logout realizado.",
  });
});

// GET /api/auth/me → usado pelo session.js para mostrar "Logado como"
router.get("/me", (req, res) => {
  const sessionEmail = req.cookies?.sessionUserEmail;

  if (!sessionEmail) {
    return res.status(401).json({
      ok: false,
      message: "Não autenticado.",
    });
  }

  const user = findUserByEmail(sessionEmail);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "Sessão inválida.",
    });
  }

  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

export default router;
