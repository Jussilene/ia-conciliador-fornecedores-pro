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
 * Lê arquivo de texto (txt / csv / etc.)
 */
export function readText(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return text || "";
  } catch (err) {
    console.error("[utils/files] Erro ao ler texto:", err.message);
    return "";
  }
}

/**
 * Detecta automaticamente o tipo de arquivo e processa
 *
 * IMPORTANTE:
 * - Sempre que possível, preenche:
 *    - tipo
 *    - conteudoTexto (string)
 *    - preview (primeiras linhas)
 *    - tamanhoTexto (length)
 * - Para Excel, também devolve "linhas" (array de objetos)
 */
export async function processFile(fileInfo) {
  if (!fileInfo) return null;

  const { mimetype, path } = fileInfo;
  const lowerPath = path.toLowerCase();

  // Helper para montar preview + tamanho
  function montarResumoTexto(text, tipo, extra = {}) {
    const conteudoTexto = text || "";
    const tamanhoTexto = conteudoTexto.length;
    const preview = conteudoTexto.slice(0, 1200);

    return {
      tipo,
      conteudoTexto,
      tamanhoTexto,
      preview,
      ...extra,
    };
  }

  // 🔹 PDF
  if (mimetype === "application/pdf" || lowerPath.endsWith(".pdf")) {
    const text = await readPDF(path);
    return montarResumoTexto(text, "pdf");
  }

  // 🔹 Excel / planilha (xlsx/xls ou mimetype de planilha)
  if (
    mimetype.includes("excel") ||
    mimetype.includes("spreadsheet") ||
    lowerPath.endsWith(".xlsx") ||
    lowerPath.endsWith(".xls")
  ) {
    const rows = readExcel(path);

    // Converte as linhas em um texto "linearizado" para a IA
    const linhasComoTexto = rows
      .map((row) => Object.values(row).join(" | "))
      .join("\n");

    return montarResumoTexto(linhasComoTexto, "excel", {
      linhas: rows,
    });
  }

  // 🔹 CSV / TXT / similares
  if (
    mimetype.startsWith("text/") ||
    lowerPath.endsWith(".csv") ||
    lowerPath.endsWith(".txt")
  ) {
    const text = readText(path);
    return montarResumoTexto(text, "texto");
  }

  // 🔹 Outros formatos (não tratados ainda)
  return {
    tipo: "desconhecido",
    conteudoTexto: null,
    tamanhoTexto: 0,
    preview: null,
  };
}
