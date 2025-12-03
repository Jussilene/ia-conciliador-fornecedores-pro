// src/index.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fornecedoresRoutes from "./routes/fornecedores.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// servir arquivos estáticos do front (pasta public)
app.use(express.static(path.join(__dirname, "..", "public")));

// futuro: arquivos gerados
app.use("/outputs", express.static(path.join(__dirname, "..", "outputs")));

// rota de status (continua igual)
app.get("/", (req, res) => {
  return res.json({
    status: "ok",
    message: "IA Conciliador de Fornecedores - API Online 🚀",
  });
});

// rota para abrir o painel do front
app.get("/fornecedores", (req, res) => {
  return res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// rotas principais da API
app.use("/api/fornecedores", fornecedoresRoutes);

export default app;
