import { normalizarTexto, parseValorMonetario } from "../textoHelpers.js";

export function extrairTitulosAbertos(texto, fornecedor) {
  if (!texto || !fornecedor) return 0;

  const linhas = texto.split(/\r?\n/);
  const alvoNorm = normalizarTexto(fornecedor);

  let totalAbertos = 0;

  for (const linha of linhas) {
    const linhaNorm = normalizarTexto(linha);
    if (!linhaNorm.includes(alvoNorm)) continue;

    // Encontrar valores monetários
    const valores = [...linha.matchAll(/(\d{1,3}(\.\d{3})*,\d{2})/g)];
    if (valores.length === 0) continue;

    // O último valor é geralmente o SALDO da NF
    const ultimoValor = valores[valores.length - 1][1];
    const num = parseValorMonetario(ultimoValor);

    if (num && num > 0) {
      totalAbertos += num;
    }
  }

  return totalAbertos;
}
