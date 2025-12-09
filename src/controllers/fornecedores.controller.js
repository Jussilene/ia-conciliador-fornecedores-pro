// src/controllers/fornecedores.controller.js
import {
  prepararRodada1,
  conciliarRodada1 as conciliarRodada1Service,
  conciliarRodada2 as conciliarRodada2Service,
  conciliarRodada3 as conciliarRodada3Service,
  conciliarRodada4 as conciliarRodada4Service,
} from "../services/conciliacao.service.js";

import { logInfo, logError } from "../utils/logger.js";

/**
 * Helper simples para tentar detectar nomes de fornecedores
 * no texto da razão (modo "todos os fornecedores").
 *
 * Obs: é heurístico, não quebra se não achar nada – só devolve lista vazia.
 * (Atualmente não está sendo usado porque a conciliação é sempre 1 fornecedor por vez.)
 */
function detectarFornecedoresNaRazao(uploadProcessado) {
  const textoRazao =
    uploadProcessado?.relatorios?.razao?.processado?.conteudoTexto || "";

  if (!textoRazao) return [];

  const linhas = String(textoRazao).split(/\r?\n/);
  const candidatos = new Set();

  for (const linha of linhas) {
    const trimmed = linha.trim();
    if (!trimmed) continue;

    // Remove números e sinais, deixando letras/espaços
    const onlyLetters = trimmed.replace(/[^A-Za-zÀ-ÿ\s]/g, " ");
    const nome = onlyLetters.replace(/\s+/g, " ").trim();

    if (nome.length < 5) continue;

    const parts = nome.split(" ");
    if (parts.length < 2) continue;

    const lettersOnly = nome.replace(/\s/g, "");
    if (!lettersOnly) continue;

    const uppercaseLetters = lettersOnly.replace(
      /[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g,
      ""
    );
    if (uppercaseLetters.length < 3) continue;

    const ratioUpper = uppercaseLetters.length / lettersOnly.length;
    if (ratioUpper < 0.6) continue;

    candidatos.add(nome);
  }

  return Array.from(candidatos);
}

/**
 * Endpoint simples: só faz o upload + leitura dos arquivos
 * (Rodada 1 = pré-processamento)
 */
export async function uploadRelatorios(req, res) {
  try {
    const { fornecedor } = req.body || {};

    logInfo("uploadRelatorios", "Requisição recebida", {
      fornecedor,
      files: Object.keys(req.files || {}),
    });

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

    logInfo("uploadRelatorios", "Arquivos processados com sucesso", {
      fornecedor,
      relatorios: Object.keys(resultado?.relatorios || {}),
    });

    return res.status(200).json(resultado);
  } catch (err) {
    logError(
      "uploadRelatorios",
      "Erro no uploadRelatorios",
      { message: err.message, stack: err.stack }
    );
    return res.status(500).json({
      error: "Erro interno ao processar relatórios de fornecedores.",
      detalhe: err.message,
    });
  }
}

/**
 * Endpoint completo de conciliação (apenas 1 fornecedor por vez):
 * - Faz o upload + leitura (dentro dos services)
 * - Em seguida chama a IA para montar a conciliação
 * - Suporta Rodada 1, 2, 3 e 4 (Notas Fiscais)
 */
export async function conciliarRodada1(req, res) {
  try {
    const { fornecedor, rodada } = req.body || {};

    const arquivos = {
      razao: req.files?.razao?.[0] || null,
      balancete: req.files?.balancete?.[0] || null,
      contas_pagar: req.files?.contas_pagar?.[0] || null,
      pagamentos: req.files?.pagamentos?.[0] || null,
      notas_fiscais: req.files?.notas_fiscais?.[0] || null,
    };

    logInfo("conciliarRodada1Controller", "Requisição recebida", {
      fornecedor,
      rodada,
      files: Object.keys(req.files || {}),
    });

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

    if (!fornecedor) {
      return res.status(400).json({
        error: "Informe o nome do fornecedor no campo 'fornecedor'.",
      });
    }

    // Normaliza a rodada (fallback = rodada1)
    const rodadaSelecionada = (rodada || "rodada1")
      .toString()
      .trim()
      .toLowerCase();

    let resultado;

    if (rodadaSelecionada === "rodada2") {
      resultado = await conciliarRodada2Service({
        fornecedor,
        arquivos,
        simulacao: false,
      });
    } else if (rodadaSelecionada === "rodada3") {
      resultado = await conciliarRodada3Service({
        fornecedor,
        arquivos,
        simulacao: false,
      });
    } else if (rodadaSelecionada === "rodada4") {
      resultado = await conciliarRodada4Service({
        fornecedor,
        arquivos,
        simulacao: false,
      });
    } else {
      resultado = await conciliarRodada1Service({
        fornecedor,
        arquivos,
        simulacao: false,
      });
    }

    logInfo("conciliarRodada1Controller", "Conciliação concluída", {
      fornecedor,
      rodada: rodadaSelecionada,
      status: resultado?.conciliacao?.status || resultado?.status || null,
    });

    return res.status(200).json({
      ...resultado,
      rodada: rodadaSelecionada,
    });
  } catch (err) {
    logError(
      "conciliarRodada1Controller",
      "Erro em conciliarRodada1",
      { message: err.message, stack: err.stack }
    );

    return res.status(500).json({
      error: "Erro interno ao executar conciliação.",
      detalhe: err.message,
    });
  }
}
