import { normalizarTexto, parseValorMonetario } from "../textoHelpers.js";

export function extrairSaldoBalancete(texto, fornecedor) {
  if (!texto || !fornecedor) return null;

  const linhas = texto.split(/\r?\n/);
  const alvoNorm = normalizarTexto(fornecedor);

  for (const linha of linhas) {
    const linhaNorm = normalizarTexto(linha);
    if (!linhaNorm.includes(alvoNorm)) continue;

    // Extrai valores monetários da linha
    const matches = [...linha.matchAll(/(\d{1,3}(\.\d{3})*,\d{2})/g)];
    if (matches.length === 0) continue;

    // O ÚLTIMO valor da linha quase sempre é o SALDO ATUAL
    const ultimoValor = matches[matches.length - 1][1];
    const num = parseValorMonetario(ultimoValor);

    if (num !== null) return num;
  }

  return null; // não encontrado
}
