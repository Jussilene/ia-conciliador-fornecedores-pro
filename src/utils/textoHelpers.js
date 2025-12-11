// src/utils/textoHelpers.js

/**
 * Normaliza textos para comparação:
 * - remove acentos
 * - tudo minúsculo
 * - compacta espaços
 */
export function normalizarTexto(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Extrai valores monetários como strings "999,99" ou "9.999,99"
 */
export function extrairValoresMonetarios(texto) {
  const regex = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  return Array.from(texto.match(regex) || []);
}

/**
 * Converte string "9.999,99" em número 9999.99
 */
export function parseValorMonetario(valorStr) {
  if (!valorStr) return null;

  const limpo = String(valorStr)
    .replace(/\./g, "")
    .replace(",", ".");

  const num = Number.parseFloat(limpo);
  return Number.isFinite(num) ? num : null;
}
