// src/routes/fornecedores.routes.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

// 👉 Aqui usamos os CONTROLLERS, que já tratam rodada1, rodada2, rodada3 e rodada4
import {
  uploadRelatorios as uploadRelatoriosController,
  conciliarRodada1 as conciliarRodadaController,
} from "../controllers/fornecedores.controller.js";

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

/**
 * ROTA 1: /api/fornecedores/upload
 * Apenas processa os arquivos (Rodada 1 = pré-processamento)
 *
 * 👉 Usa o controller.uploadRelatorios, que por sua vez chama prepararRodada1
 */
router.post(
  "/upload",
  upload.fields([
    { name: "razao", maxCount: 1 },
    { name: "balancete", maxCount: 1 },
    { name: "contas_pagar", maxCount: 1 },
    { name: "pagamentos", maxCount: 1 },
    { name: "notas_fiscais", maxCount: 1 },
  ]),
  uploadRelatoriosController
);

/**
 * ROTA 2: /api/fornecedores/conciliar/rodada1
 * Faz o upload + conciliação com IA.
 *
 * 👉 Agora quem decide se é Rodada 1, 2, 3 ou 4 é o controller.conciliarRodada1,
 *    que já tem o switch:
 *      - rodada1  -> conciliarRodada1Service
 *      - rodada2  -> conciliarRodada2Service
 *      - rodada3  -> conciliarRodada3Service
 *      - rodada4  -> conciliarRodada4Service  ✅
 */
router.post(
  "/conciliar/rodada1",
  upload.fields([
    { name: "razao", maxCount: 1 },
    { name: "balancete", maxCount: 1 },
    { name: "contas_pagar", maxCount: 1 },
    { name: "pagamentos", maxCount: 1 },
    { name: "notas_fiscais", maxCount: 1 },
  ]),
  conciliarRodadaController
);

export default router;
