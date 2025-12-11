import { normalizarTexto, parseValorMonetario } from "../textoHelpers.js";

export function extrairSaldoFinalRazao(texto, fornecedor) {
  if (!texto || !fornecedor) return null;

  const linhas = texto.split(/\r?\n/);
  const alvoNorm = normalizarTexto(fornecedor);

  let ultimoSaldoEncontrado = null;

  for (const linha of linhas) {
    const linhaNorm = normalizarTexto(linha);
    if (!linhaNorm.includes(alvoNorm)) continue;

    const matches = [...linha.matchAll(/(\d{1,3}(\.\d{3})*,\d{2})/g)];
    if (matches.length === 0) continue;

    const ultimoValor = matches[matches.length - 1][1];
    const num = parseValorMonetario(ultimoValor);

    ultimoSaldoEncontrado = num;
  }

  return ultimoSaldoEncontrado;
}
