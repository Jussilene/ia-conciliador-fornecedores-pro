// src/routes/fornecedores.routes.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import {
  prepararRodada1,
  realizarConciliacao,
} from "../services/conciliacao.service.js";

const router = Router();

// Configuração do Multer (upload)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/\s+/g, "_");
    cb(null, `${timestamp}-${sanitized}`);
  },
});

const upload = multer({ storage });

// ----- ROTA 1: upload simples -----
router.post(
  "/upload",
  upload.fields([
    { name: "razao", maxCount: 1 },
    { name: "balancete", maxCount: 1 },
    { name: "contas_pagar", maxCount: 1 },
    { name: "pagamentos", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const fornecedor = req.body.fornecedor || "FORNECEDOR_NAO_INFORMADO";

      const arquivos = {
        razao: req.files?.razao?.[0] || null,
        balancete: req.files?.balancete?.[0] || null,
        contas_pagar: req.files?.contas_pagar?.[0] || null,
        pagamentos: req.files?.pagamentos?.[0] || null,
      };

      const resultado = await prepararRodada1({ fornecedor, arquivos });

      return res.json(resultado);
    } catch (err) {
      console.error("[routes/upload] Erro:", err.message);
      return res.status(500).json({
        error: "Erro ao processar upload.",
        detail: err.message,
      });
    }
  }
);

// ----- ROTA 2: conciliação + IA (Rodada 1 completa) -----
router.post(
  "/conciliar/rodada1",
  upload.fields([
    { name: "razao", maxCount: 1 },
    { name: "balancete", maxCount: 1 },
    { name: "contas_pagar", maxCount: 1 },
    { name: "pagamentos", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const fornecedor = req.body.fornecedor || "FORNECEDOR_NAO_INFORMADO";

      const arquivos = {
        razao: req.files?.razao?.[0] || null,
        balancete: req.files?.balancete?.[0] || null,
        contas_pagar: req.files?.contas_pagar?.[0] || null,
        pagamentos: req.files?.pagamentos?.[0] || null,
      };

      // Rodada 1: leitura + normalização
      const uploadProcessado = await prepararRodada1({ fornecedor, arquivos });

      // Rodada 2: conciliação com IA
      // 🔹 AJUSTE IMPORTANTE: passar relatoriosProcessados corretamente
      const conciliacao = await realizarConciliacao({
        fornecedor,
        relatoriosProcessados: uploadProcessado.relatorios,
        simulacao: false,
      });

      return res.json({
        fornecedor,
        etapa: "rodada1",
        uploadProcessado,
        conciliacao,
      });
    } catch (err) {
      console.error("[routes/conciliar/rodada1] Erro:", err.message);
      return res.status(500).json({
        error: "Erro ao executar conciliação (Rodada 1 + IA).",
        detail: err.message,
      });
    }
  }
);

export default router;
