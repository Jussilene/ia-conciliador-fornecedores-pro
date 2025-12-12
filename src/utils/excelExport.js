// src/utils/excelExport.js
import * as xlsx from "xlsx";

/**
 * Gera um workbook Excel em memória.
 *
 * ✅ Agora as abas terão as colunas:
 * Data | Histórico | Documento | Situação (Liquidado/A Liquidar) | Valor | Nome do Fornecedor
 *
 * Regra:
 * - Se não localizar alguma informação, preencher "Não localizado"
 * - Situação é inferida pelo tipo do item (divergência/título/pagamento órfão),
 *   e também pode tentar deduzir por palavras-chave.
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

  // -----------------------
  // Helpers de extração
  // -----------------------

  function firstMatch(str, regex) {
    if (!str) return null;
    const m = String(str).match(regex);
    return m ? m[0] : null;
  }

  function extrairDataDeTexto(texto) {
    // dd/mm/aaaa
    const d1 = firstMatch(texto, /\b\d{2}\/\d{2}\/\d{4}\b/);
    if (d1) return d1;

    // aaaa-mm-dd
    const d2 = firstMatch(texto, /\b\d{4}-\d{2}-\d{2}\b/);
    if (d2) return d2;

    // dd-mm-aaaa
    const d3 = firstMatch(texto, /\b\d{2}-\d{2}-\d{4}\b/);
    if (d3) return d3;

    return null;
  }

  function extrairDocumentoDeTexto(texto) {
    const t = String(texto || "");

    // NF / NFS-e / Nota Fiscal
    const nf = t.match(
      /\b(NF|NFS-E|NFSE|NOTA\s+FISCAL)\b[\s#:]*([A-Z0-9.\-\/]{3,})/i
    );
    if (nf && nf[2]) return `${nf[1].toUpperCase()} ${nf[2]}`;

    // DUPLICATA / DUPL
    const dupl = t.match(/\b(DUPLICATA|DUPL)\b[\s#:]*([A-Z0-9.\-\/]{3,})/i);
    if (dupl && dupl[2]) return `${dupl[1].toUpperCase()} ${dupl[2]}`;

    // DOCUMENTO / DOC
    const doc = t.match(/\b(DOCUMENTO|DOC)\b[\s#:]*([A-Z0-9.\-\/]{3,})/i);
    if (doc && doc[2]) return `${doc[1].toUpperCase()} ${doc[2]}`;

    // Se tiver algum "código grande" comum (heurístico)
    const cod = t.match(/\b[A-Z0-9]{6,}\b/);
    if (cod) return cod[0];

    return null;
  }

  function extrairValorDeTexto(texto) {
    // padrão brasileiro: 9.999,99
    const m = String(texto || "").match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
    if (!m) return null;
    return m[1];
  }

  function normalizarSituacaoPorTipoETermo(tipo, texto) {
    const t = String(texto || "").toLowerCase();
    const tp = String(tipo || "").toLowerCase();

    // Preferência: pelo tipo
    if (tp === "titulo_pago_nao_baixado") return "Liquidado";
    if (tp === "titulo_sem_pagamento") return "A Liquidar";
    if (tp === "fornecedor_sem_lancamento") return "Não localizado";
    if (tp === "saldo_diferente") return "Não localizado";

    // Pagamentos órfãos normalmente são pagamentos (logo, liquidado)
    if (tp.includes("pagamento")) return "Liquidado";

    // Heurística por palavras
    if (
      t.includes("liquid") ||
      t.includes("pago") ||
      t.includes("pagamento") ||
      t.includes("baixado")
    ) {
      return "Liquidado";
    }

    if (
      t.includes("aberto") ||
      t.includes("a pagar") ||
      t.includes("venc") ||
      t.includes("em atraso") ||
      t.includes("sem pagamento")
    ) {
      return "A Liquidar";
    }

    return "Não localizado";
  }

  function montarLinhaPadrao({ fornecedorNome, tipo, descricao, referencias, valorEstimado }) {
    const refs = Array.isArray(referencias) ? referencias.join(" | ") : "";
    const textoBase = `${descricao || ""} ${refs}`.trim();

    const data = extrairDataDeTexto(textoBase) || "Não localizado";
    const documento = extrairDocumentoDeTexto(textoBase) || "Não localizado";

    // Histórico: como a IA não entrega um campo "histórico" estruturado,
    // a gente usa a própria descrição (e se não tiver, usa refs)
    const historico = (descricao && String(descricao).trim())
      ? String(descricao).trim()
      : (refs ? refs : "Não localizado");

    // Situação
    const situacao = normalizarSituacaoPorTipoETermo(tipo, textoBase);

    // Valor: preferir número (valorEstimado). Se não, tentar puxar do texto
    let valorFinal = "";
    if (typeof valorEstimado === "number" && !Number.isNaN(valorEstimado)) {
      valorFinal = valorEstimado;
    } else {
      const valorTxt = extrairValorDeTexto(textoBase);
      valorFinal = valorTxt ? valorTxt : "Não localizado";
    }

    return {
      Data: data,
      "Histórico": historico,
      Documento: documento,
      "Situação (Liquidado/A Liquidar)": situacao,
      Valor: valorFinal,
      "Nome do Fornecedor": fornecedorNome || "Não localizado",
    };
  }

  // -----------------------
  // 1) Aba Divergencias (com as colunas novas)
  // -----------------------
  const sheetDivergencias = xlsx.utils.json_to_sheet(
    divergencias.map((d) =>
      montarLinhaPadrao({
        fornecedorNome: fornecedorLabel,
        tipo: d.tipo || "",
        descricao: d.descricao || "",
        referencias: d.referencias,
        valorEstimado: d.valorEstimado,
      })
    )
  );
  xlsx.utils.book_append_sheet(wb, sheetDivergencias, "Divergencias");

  // -----------------------
  // 2) Aba TitulosVencidos (com as colunas novas)
  // -----------------------
  const sheetTitulos = xlsx.utils.json_to_sheet(
    titulosVencidos.map((t) =>
      montarLinhaPadrao({
        fornecedorNome: fornecedorLabel,
        tipo: t.tipo || "titulo_sem_pagamento",
        descricao: t.descricao || "",
        referencias: t.referencias,
        valorEstimado: t.valorEstimado,
      })
    )
  );
  xlsx.utils.book_append_sheet(wb, sheetTitulos, "TitulosVencidos");

  // -----------------------
  // 3) Aba PagamentosOrfaos (com as colunas novas)
  // -----------------------
  const sheetOrfaos = xlsx.utils.json_to_sheet(
    pagamentosOrfaos.map((p) =>
      montarLinhaPadrao({
        fornecedorNome: fornecedorLabel,
        tipo: "pagamentos_orfaos",
        descricao: p.descricao || "",
        referencias: p.referencias,
        valorEstimado: p.valorEstimado,
      })
    )
  );
  xlsx.utils.book_append_sheet(wb, sheetOrfaos, "PagamentosOrfaos");

  // -----------------------
  // Gera o buffer em memória
  // -----------------------
  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

  // nome padrão do arquivo (mantendo a mesma lógica)
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
