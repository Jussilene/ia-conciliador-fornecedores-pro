// src/utils/files.js
import fs from "fs";
import { createRequire } from "module";
import * as xlsx from "xlsx";

// pdf-parse (versão Node clássica, 1.1.1)
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

/**
 * Lê arquivo PDF e retorna o texto completo
 */
export async function readPDF(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer); // pdfParse é função ✅
    return data.text || "";
  } catch (err) {
    console.error("[utils/files] Erro ao ler PDF:", err.message);
    return "";
  }
}

/**
 * Lê arquivo Excel e retorna linhas normalizadas (array de objetos)
 */
export function readExcel(filePath) {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
    return rows;
  } catch (err) {
    console.error("[utils/files] Erro ao ler Excel:", err.message);
    return [];
  }
}

/**
 * Detecta automaticamente o tipo de arquivo e processa
 */
export async function processFile(fileInfo) {
  if (!fileInfo) return null;

  const { mimetype, path } = fileInfo;

  // PDF
  if (mimetype === "application/pdf") {
    const text = await readPDF(path);
    return {
      tipo: "pdf",
      conteudoTexto: text,
    };
  }

  // Excel / planilha
  if (
    mimetype.includes("excel") ||
    mimetype.includes("spreadsheet") ||
    path.toLowerCase().endsWith(".xlsx") ||
    path.toLowerCase().endsWith(".xls")
  ) {
    const rows = readExcel(path);
    return {
      tipo: "excel",
      linhas: rows,
    };
  }

  // Outros formatos (podemos tratar depois)
  return {
    tipo: "desconhecido",
    conteudoTexto: null,
  };
}
