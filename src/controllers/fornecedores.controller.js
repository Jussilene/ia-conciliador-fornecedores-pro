// src/controllers/fornecedores.controller.js
import {
  prepararRodada1,
  conciliarRodada1 as conciliarRodada1Service,
  conciliarRodada2 as conciliarRodada2Service,
  conciliarRodada3 as conciliarRodada3Service,
  conciliarRodada4 as conciliarRodada4Service,
} from "../services/conciliacao.service.js";

/**
 * Endpoint simples: só faz o upload + leitura dos arquivos
 * (Rodada 1 = pré-processamento)
 */
export async function uploadRelatorios(req, res) {
  try {
    const { fornecedor } = req.body || {};

    if (!fornecedor) {
      return res.status(400).json({
        error: "Informe o nome do fornecedor no campo 'fornecedor'.",
      });
    }

    const arquivos = {
      razao: req.files?.razao?.[0] || null,
      balancete: req.files?.balancete?.[0] || null,
      contas_pagar: req.files?.contas_pagar?.[0] || null,
      pagamentos: req.files?.pagamentos?.[0] || null,
      notas_fiscais: req.files?.notas_fiscais?.[0] || null,
    };

    if (
      !arquivos.razao &&
      !arquivos.balancete &&
      !arquivos.contas_pagar &&
      !arquivos.pagamentos &&
      !arquivos.notas_fiscais
    ) {
      return res.status(400).json({
        error:
          "Nenhum arquivo foi enviado. Envie pelo menos um relatório (razão, balancete, contas_pagar, pagamentos ou notas_fiscais).",
      });
    }

    const resultado = await prepararRodada1({ fornecedor, arquivos });

    return res.status(200).json(resultado);
  } catch (err) {
    console.error("[controllers/fornecedores] Erro no uploadRelatorios:", err);
    return res.status(500).json({
      error: "Erro interno ao processar relatórios de fornecedores.",
      detalhe: err.message,
    });
  }
}

/**
 * Endpoint completo de conciliação:
 * - Faz o upload + leitura (prepararRodada1)
 * - Em seguida chama a IA para montar a conciliação
 * - Suporta Rodada 1, 2, 3 e 4 (Notas Fiscais)
 */
export async function conciliarRodada1(req, res) {
  try {
    const { fornecedor, rodada } = req.body || {};

    if (!fornecedor) {
      return res.status(400).json({
        error: "Informe o nome do fornecedor no campo 'fornecedor'.",
      });
    }

    const arquivos = {
      razao: req.files?.razao?.[0] || null,
      balancete: req.files?.balancete?.[0] || null,
      contas_pagar: req.files?.contas_pagar?.[0] || null,
      pagamentos: req.files?.pagamentos?.[0] || null,
      notas_fiscais: req.files?.notas_fiscais?.[0] || null,
    };

    if (
      !arquivos.razao &&
      !arquivos.balancete &&
      !arquivos.contas_pagar &&
      !arquivos.pagamentos &&
      !arquivos.notas_fiscais
    ) {
      return res.status(400).json({
        error:
          "Nenhum arquivo foi enviado. Envie pelo menos um relatório (razão, balancete, contas_pagar, pagamentos ou notas_fiscais).",
      });
    }

    // 🔹 Normaliza a rodada (fallback = rodada1)
    const rodadaSelecionada = (rodada || "rodada1")
      .toString()
      .trim()
      .toLowerCase();

    let resultado;

    if (rodadaSelecionada === "rodada2") {
      // Fornecedor estratégico (versão PRO)
      resultado = await conciliarRodada2Service({
        fornecedor,
        arquivos,
        simulacao: false,
      });
    } else if (rodadaSelecionada === "rodada3") {
      // Auditoria mensal (versão PRO)
      resultado = await conciliarRodada3Service({
        fornecedor,
        arquivos,
        simulacao: false,
      });
    } else if (rodadaSelecionada === "rodada4") {
      // Cruzamento com Notas Fiscais (versão PRO)
      resultado = await conciliarRodada4Service({
        fornecedor,
        arquivos,
        simulacao: false,
      });
    } else {
      // Conciliação padrão (Rodada 1)
      resultado = await conciliarRodada1Service({
        fornecedor,
        arquivos,
        simulacao: false,
      });
    }

    return res.status(200).json({
      ...resultado,
      rodada: rodadaSelecionada,
    });
  } catch (err) {
    console.error("[controllers/fornecedores] Erro em conciliarRodada1:", err);
    return res.status(500).json({
      error: "Erro interno ao executar conciliação.",
      detalhe: err.message,
    });
  }
}
