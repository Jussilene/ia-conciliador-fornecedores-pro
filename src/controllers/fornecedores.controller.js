// src/controllers/fornecedores.controller.js
import {
  prepararRodada1,
  realizarConciliacao,
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
    };

    if (
      !arquivos.razao &&
      !arquivos.balancete &&
      !arquivos.contas_pagar &&
      !arquivos.pagamentos
    ) {
      return res.status(400).json({
        error:
          "Nenhum arquivo foi enviado. Envie pelo menos um relatório (razão, balancete, contas_pagar ou pagamentos).",
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
 * Endpoint completo da Rodada 1:
 * - Faz o upload + leitura (mesmo que o /upload)
 * - Em seguida chama a IA para montar a conciliação inicial
 */
export async function conciliarRodada1(req, res) {
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
    };

    if (
      !arquivos.razao &&
      !arquivos.balancete &&
      !arquivos.contas_pagar &&
      !arquivos.pagamentos
    ) {
      return res.status(400).json({
        error:
          "Nenhum arquivo foi enviado. Envie pelo menos um relatório (razão, balancete, contas_pagar ou pagamentos).",
      });
    }

    // 1) Processa os arquivos (Rodada 1)
    const etapaUpload = await prepararRodada1({ fornecedor, arquivos });

    // 2) Chama a IA passando os relatórios já processados
    const conciliacao = await realizarConciliacao({
      fornecedor,
      relatoriosProcessados: etapaUpload.relatorios,
      simulacao: false,
    });

    // 3) Resposta combinando as duas etapas
    return res.status(200).json({
      fornecedor,
      etapa: "rodada1",
      uploadProcessado: etapaUpload,
      conciliacao,
    });
  } catch (err) {
    console.error("[controllers/fornecedores] Erro em conciliarRodada1:", err);
    return res.status(500).json({
      error: "Erro interno ao executar conciliação (Rodada 1).",
      detalhe: err.message,
    });
  }
}
