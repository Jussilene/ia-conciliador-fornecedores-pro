// src/routes/fornecedores.routes.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

// 👉 Aqui usamos os CONTROLLERS, que já tratam rodada1, rodada2, rodada3 e 4
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
 * 🔧 Middleware para normalizar req.files
 *
 * Se usarmos upload.any(), o Multer preenche req.files como ARRAY:
 *   [{ fieldname: "razao", ... }, { fieldname: "balancete", ... }]
 *
 * Suas controllers esperam o formato:
 *   req.files.razao[0], req.files.balancete[0], etc.
 *
 * Então este helper converte o array nesse formato.
 */
function normalizarFiles(req, res, next) {
  if (Array.isArray(req.files)) {
    const map = {};
    for (const file of req.files) {
      if (!map[file.fieldname]) {
        map[file.fieldname] = [];
      }
      map[file.fieldname].push(file);
    }
    req.files = map;
  }
  next();
}

/**
 * ROTA 1: /api/fornecedores/upload
 * Apenas processa os arquivos (Rodada 1 = pré-processamento)
 *
 * 👉 Usa o controller.uploadRelatorios, que por sua vez chama prepararRodada1
 *
 * 🔁 Aqui usamos upload.any() para não dar "Unexpected field".
 * Em seguida, o normalizarFiles deixa tudo no formato que a controller espera.
 */
router.post(
  "/upload",
  upload.any(),      // aceita qualquer campo de arquivo
  normalizarFiles,   // converte array -> objeto por nome do campo
  uploadRelatoriosController
);

/**
 * ROTA 2: /api/fornecedores/conciliar/rodada1
 * Faz o upload + conciliação com IA.
 *
 * 👉 Quem decide se é Rodada 1, 2, 3 ou 4 é o controller.conciliarRodada1,
 *    que já tem o switch:
 *      - rodada1  -> conciliarRodada1Service
 *      - rodada2  -> conciliarRodada2Service
 *      - rodada3  -> conciliarRodada3Service
 *      - rodada4  -> conciliarRodada4Service
 *
 * 🔁 Mesma lógica: upload.any() + normalizarFiles para evitar MulterError.
 */
router.post(
  "/conciliar/rodada1",
  upload.any(),
  normalizarFiles,
  conciliarRodadaController
);

export default router;
