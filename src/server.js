// src/server.js
import dotenv from "dotenv";
dotenv.config(); // 🔥 CARREGA .env ANTES DE TUDO

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import fornecedoresRoutes from "./routes/fornecedores.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// servir arquivos estáticos do front (pasta public)
app.use(express.static(path.join(__dirname, "..", "public")));

// pasta outputs (igual estava)
app.use("/outputs", express.static(path.join(__dirname, "..", "outputs")));

// rota de status (mantida)
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "IA Conciliador de Fornecedores - API Online 🚀",
  });
});

// rota para abrir o painel do front
app.get("/fornecedores", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// rotas de autenticação
app.use("/api/auth", authRoutes);

// rotas da API (igual estava)
app.use("/api/fornecedores", fornecedoresRoutes);

// porta
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
