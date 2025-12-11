// src/utils/excelExport.js
import * as xlsx from "xlsx";

/**
 * Gera um workbook Excel em memória com:
 *  - Aba "Divergencias"
 *  - Aba "TitulosVencidos"
 *  - Aba "PagamentosOrfaos"
 *
 * Retorna { buffer, filename }
 */
export function gerarExcelDivergencias({
  fornecedor,
  rodada,
  divergencias = [],
  titulosVencidos = [],
  pagamentosOrfaos = [],
}) {
  const wb = xlsx.utils.book_new();

  const fornecedorLabel = fornecedor || "";
  const rodadaLabel = rodada || "";

  // 🔹 1) Aba de Divergências
  const sheetDivergencias = xlsx.utils.json_to_sheet(
    divergencias.map((d, idx) => ({
      "#": idx + 1,
      Fornecedor: fornecedorLabel,
      Rodada: rodadaLabel,
      Tipo: d.tipo || "",
      Descricao: d.descricao || "",
      "Valor Estimado": typeof d.valorEstimado === "number" ? d.valorEstimado : "",
      "Nivel Criticidade": d.nivelCriticidade || "",
      Referencias: Array.isArray(d.referencias)
        ? d.referencias.join(" | ")
        : "",
    }))
  );
  xlsx.utils.book_append_sheet(wb, sheetDivergencias, "Divergencias");

  // 🔹 2) Aba de Títulos Vencidos
  const sheetTitulos = xlsx.utils.json_to_sheet(
    titulosVencidos.map((t, idx) => ({
      "#": idx + 1,
      Fornecedor: fornecedorLabel,
      Rodada: rodadaLabel,
      Descricao: t.descricao || "",
      "Valor Estimado": typeof t.valorEstimado === "number" ? t.valorEstimado : "",
      "Dias em Atraso (Estimado)": t.diasEmAtrasoEstimado ?? "",
      Referencias: Array.isArray(t.referencias)
        ? t.referencias.join(" | ")
        : "",
    }))
  );
  xlsx.utils.book_append_sheet(wb, sheetTitulos, "TitulosVencidos");

  // 🔹 3) Aba de Pagamentos Órfãos
  const sheetOrfaos = xlsx.utils.json_to_sheet(
    pagamentosOrfaos.map((p, idx) => ({
      "#": idx + 1,
      Fornecedor: fornecedorLabel,
      Rodada: rodadaLabel,
      Descricao: p.descricao || "",
      "Valor Estimado": typeof p.valorEstimado === "number" ? p.valorEstimado : "",
      "Nivel Risco": p.nivelRisco || "",
      Referencias: Array.isArray(p.referencias)
        ? p.referencias.join(" | ")
        : "",
    }))
  );
  xlsx.utils.book_append_sheet(wb, sheetOrfaos, "PagamentosOrfaos");

  // 🔹 Gera o buffer em memória
  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

  // nome padrão do arquivo
  const slugFornecedor = String(fornecedorLabel || "fornecedor")
    .toLowerCase()
    .replace(/[^\w]+/g, "_");

  const agora = new Date();
  const stamp = `${agora.getFullYear()}-${
    agora.getMonth() + 1
  }-${agora.getDate()}_${agora.getHours()}-${agora.getMinutes()}-${agora.getSeconds()}`;

  const filename = `consolidado_${slugFornecedor}_${rodadaLabel}_${stamp}.xlsx`;

  return { buffer, filename };
}
