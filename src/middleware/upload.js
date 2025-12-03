import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// garante que a pasta /uploads existe
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/\s+/g, "_");
    cb(null, `${timestamp}-${safeOriginal}`);
  },
});

function fileFilter(req, file, cb) {
  const allowedExt = [".pdf", ".xls", ".xlsx", ".csv", ".txt"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Tipo de arquivo não permitido. Use PDF, Excel, CSV ou TXT."
      )
    );
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});

// campos que vamos aceitar no formulário
export const uploadFornecedores = upload.fields([
  { name: "razao", maxCount: 1 },
  { name: "balancete", maxCount: 1 },
  { name: "contas_pagar", maxCount: 1 },
  { name: "pagamentos", maxCount: 1 },
]);

export default uploadFornecedores;
