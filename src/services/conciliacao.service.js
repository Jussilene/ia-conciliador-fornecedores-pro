// src/services/conciliacao.service.js
import { processFile } from "../utils/files.js";
import OpenAI from "openai";
import { logInfo, logWarn, logError } from "../utils/logger.js";

// Cliente OpenAI lazy (só cria se tiver chave)
let openaiClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    logWarn("getOpenAIClient", "OPENAI_API_KEY não configurada");
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
    logInfo("getOpenAIClient", "Cliente OpenAI criado");
  }

  return openaiClient;
}

/**
 * Normaliza textos para comparação robusta:
 * - remove acentos
 * - ignora maiúsculas/minúsculas
 * - remove quebras de linha e múltiplos espaços
 * - remove caracteres especiais estranhos vindos do PDF
 */
function normalizarTexto(str) {
  if (!str) return "";

  return String(str)
    .normalize("NFD") // separa acentos
    .replace(/[\u0300-\u036f]/g, "") // remove marcas de acento
    .replace(/[\r\n]+/g, " ") // remove quebras de linha
    .replace(/\s+/g, " ") // compacta espaços múltiplos em 1
    .replace(/[^\w\s]/g, " ") // remove pontuação estranha
    .trim()
    .toLowerCase();
}

/**
 * Verifica se o fornecedor aparece na razão usando
 * uma busca mais tolerante (fuzzy por tokens).
 *
 * Regras:
 * - Primeiro tenta match exato no texto normalizado inteiro;
 * - Depois quebra em linhas e verifica se, em alguma linha,
 *   pelo menos ~70% das palavras do fornecedor aparecem.
 */
function fornecedorExisteNaRazao(nomeFornecedor, textoRazaoBruto) {
  if (!nomeFornecedor || !textoRazaoBruto) return false;

  const alvo = normalizarTexto(nomeFornecedor);
  if (!alvo) return false;

  const textoNormalizado = normalizarTexto(textoRazaoBruto);

  // 1) Tentativa simples: substring direta no texto todo
  if (textoNormalizado.includes(alvo)) {
    return true;
  }

  // 2) Tentativa por tokens linha a linha (mais tolerante)
  const tokensAlvo = alvo
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 2); // ignora "de", "sa", "e", etc.

  if (tokensAlvo.length === 0) return false;

  const linhas = String(textoRazaoBruto)
    .split(/\r?\n/)
    .map((linha) => normalizarTexto(linha))
    .filter(Boolean);

  for (const linha of linhas) {
    let encontrados = 0;

    for (const token of tokensAlvo) {
      if (linha.includes(token)) {
        encontrados++;
      }
    }

    const score = encontrados / tokensAlvo.length;

    // se encontrou pelo menos 70% das palavras do fornecedor na linha,
    // consideramos que o fornecedor está presente naquela linha
    if (score >= 0.7) {
      return true;
    }
  }

  return false;
}

/**
 * Extrai linhas do texto bruto onde o fornecedor aparece
 * (usando a mesma lógica de score de tokens).
 *
 * Além disso, captura todos os valores monetários da linha
 * (padrão 9.999,99) e guarda o último valor encontrado,
 * que normalmente é o saldo da coluna final.
 */
function extrairLinhasFornecedor(textoBruto, nomeFornecedor) {
  if (!textoBruto || !nomeFornecedor) return [];

  const alvoNorm = normalizarTexto(nomeFornecedor);
  if (!alvoNorm) return [];

  const tokensAlvo = alvoNorm
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  if (tokensAlvo.length === 0) return [];

  const linhas = String(textoBruto).split(/\r?\n/);

  const resultado = [];

  for (const linhaOriginal of linhas) {
    const linhaNorm = normalizarTexto(linhaOriginal);
    if (!linhaNorm) continue;

    let encontrados = 0;
    for (const token of tokensAlvo) {
      if (linhaNorm.includes(token)) encontrados++;
    }

    const score = tokensAlvo.length ? encontrados / tokensAlvo.length : 0;

    // um pouquinho mais tolerante aqui (0.6) para pegar quebra de linha estranha
    if (score >= 0.6) {
      const numerosMonetarios = [];
      const regexValor = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
      let m;
      while ((m = regexValor.exec(linhaOriginal)) !== null) {
        numerosMonetarios.push(m[1]);
      }

      resultado.push({
        linhaOriginal: linhaOriginal.trim(),
        linhaNormalizada: linhaNorm,
        scoreMatch: score,
        numerosMonetarios,
        ultimoNumero: numerosMonetarios.length
          ? numerosMonetarios[numerosMonetarios.length - 1]
          : null,
      });
    }
  }

  return resultado;
}

/**
 * Converte string "42.151,99" em número 42151.99
 */
function parseValorMonetario(valorStr) {
  if (!valorStr) return null;
  const limpo = String(valorStr)
    .replace(/\./g, "")
    .replace(/[^\d,-]/g, "")
    .replace(",", ".");
  const num = Number.parseFloat(limpo);
  return Number.isFinite(num) ? num : null;
}

/**
 * Monta indicadores objetivos de saldo para o fornecedor
 * em cada relatório (usando texto COMPLETO, não apenas amostra).
 *
 * Isso é usado para:
 * - dar pistas mais confiáveis para a IA;
 * - impedir que a IA invente divergência de saldo
 *   quando os relatórios, na prática, batem.
 */
function montarIndicadoresFornecedor(fornecedor, textosPorRelatorio = {}) {
  const indicadoresFornecedor = {};
  const saldosNumericosPorRelatorio = {};

  const chavesRelatorios = ["balancete", "contas_pagar", "razao"];

  for (const chave of chavesRelatorios) {
    const texto = textosPorRelatorio[chave] || "";
    const linhasFornecedor = extrairLinhasFornecedor(texto, fornecedor);

    const saldosEncontrados = [];

    for (const linha of linhasFornecedor) {
      if (!linha.ultimoNumero) continue;
      const valorNum = parseValorMonetario(linha.ultimoNumero);
      if (valorNum !== null) {
        saldosEncontrados.push({
          texto: linha.ultimoNumero,
          numero: valorNum,
          linhaOriginal: linha.linhaOriginal,
        });
      }
    }

    if (saldosEncontrados.length > 0) {
      saldosNumericosPorRelatorio[chave] = saldosEncontrados.map(
        (s) => s.numero
      );
    }

    indicadoresFornecedor[chave] = {
      linhasFornecedor,
      saldosEncontrados,
    };
  }

  // Avaliação automática simples dos saldos
  let avaliacaoAutomaticaSaldo = {
    status: "dados_insuficientes",
    descricao:
      "Não foi possível comparar saldos de forma automática com segurança.",
  };

  const todasChavesComSaldo = Object.keys(saldosNumericosPorRelatorio);
  if (todasChavesComSaldo.length >= 2) {
    const todosValores = todasChavesComSaldo.flatMap(
      (k) => saldosNumericosPorRelatorio[k]
    );

    const min = Math.min(...todosValores);
    const max = Math.max(...todosValores);

    if (Number.isFinite(min) && Number.isFinite(max)) {
      const diff = Math.abs(max - min);

      // Se a diferença máxima for menor ou igual a 0,10
      // consideramos que são, na prática, o mesmo saldo.
      if (diff <= 0.1) {
        avaliacaoAutomaticaSaldo = {
          status: "saldos_iguais",
          descricao:
            "Os saldos identificados automaticamente nos relatórios são praticamente iguais para o fornecedor.",
          valorReferenciaAproximado: Number(((min + max) / 2).toFixed(2)),
        };
      } else {
        avaliacaoAutomaticaSaldo = {
          status: "saldos_diferentes",
          descricao:
            "Foram encontrados saldos numéricos diferentes entre os relatórios para este fornecedor.",
        };
      }
    }
  }

  return { indicadoresFornecedor, avaliacaoAutomaticaSaldo };
}

/**
 * Rodada 1: processamento inicial dos arquivos enviados
 * - Lê PDFs / Excel via processFile
 * - Normaliza em um formato padrão
 */
export async function prepararRodada1({ fornecedor, arquivos }) {
  logInfo("prepararRodada1", "Iniciando processamento de arquivos", {
    fornecedor,
    arquivos: Object.keys(arquivos || {}),
  });

  const resultado = {};

  for (const [chave, fileInfo] of Object.entries(arquivos || {})) {
    if (!fileInfo) continue;

    const processado = await processFile(fileInfo);

    resultado[chave] = {
      nomeOriginal: fileInfo.originalname,
      caminho: fileInfo.path,
      mimetype: fileInfo.mimetype,
      processado,
    };
  }

  logInfo("prepararRodada1", "Arquivos processados", {
    fornecedor,
    relatorios: Object.keys(resultado),
  });

  return {
    fornecedor,
    status: "arquivos_processados",
    mensagem:
      "Arquivos lidos e convertidos com sucesso. Pronto para iniciar a conciliação (Rodada 1).",
    relatorios: resultado,
  };
}

/**
 * Função base de conciliação com IA (usada por TODAS as rodadas)
 * - Usa os relatórios já processados
 * - Gera diagnóstico de conciliação (estrutura JSON)
 */
export async function realizarConciliacao({
  fornecedor,
  relatoriosProcessados = {},
  simulacao = false,
}) {
  logInfo("realizarConciliacao", "Iniciando conciliação", {
    fornecedor,
    simulacao,
  });

  const openai = getOpenAIClient();

  // Se não tiver chave, não derruba a API
  if (!openai) {
    logWarn("realizarConciliacao", "OpenAI não configurada. Pulando IA.", {
      fornecedor,
    });

    return {
      fornecedor,
      simulacao,
      status: "erro_openai",
      mensagem:
        "OPENAI_API_KEY não configurada. Adicione sua chave no arquivo .env para habilitar a conciliação com IA.",
    };
  }

  // 🔹 1) PRIMEIRO: usar o TEXTO COMPLETO da razão para checar se o fornecedor existe
  const razaoProcessado = relatoriosProcessados?.razao?.processado || {};
  const razaoTextoCompleto =
    razaoProcessado.conteudoTexto || razaoProcessado.preview || "";

  const fornecedorEncontrado = fornecedorExisteNaRazao(
    fornecedor,
    razaoTextoCompleto
  );

  if (!fornecedorEncontrado) {
    logWarn(
      "realizarConciliacao",
      "Fornecedor não encontrado na razão. Não será feita chamada à IA.",
      { fornecedor }
    );

    // 🚫 Não achou o fornecedor na razão → não chama IA
    const estruturaJson = {
      resumoExecutivo: `Não foram encontrados lançamentos do fornecedor "${fornecedor}" na razão enviada.`,
      composicaoSaldo: [
        {
          fonte: "razao",
          descricao:
            "Razão de fornecedores analisada, porém o fornecedor informado não consta em nenhum lançamento.",
          valorEstimado: 0,
          observacoes:
            "Verifique se o relatório de razão está filtrado corretamente para o período e empresa, ou se há erro no nome do fornecedor.",
        },
      ],
      divergencias: [
        {
          descricao:
            "Fornecedor informado não aparece em nenhum lançamento da razão de fornecedores.",
          tipo: "fornecedor_sem_lancamento",
          referencias: [
            `Fornecedor: ${fornecedor}`,
            "Relatório: Razão de Fornecedores",
          ],
          valorEstimado: 0,
          nivelCriticidade: "alta",
        },
      ],
      pagamentosOrfaos: [],
      titulosVencidosSemContrapartida: [],
      passosRecomendados: [
        "Conferir se o nome do fornecedor está idêntico ao cadastrado no sistema/contabilidade.",
        "Validar se o relatório de razão foi emitido para o CNPJ correto e para o período desejado.",
        "Caso o fornecedor realmente devesse ter lançamentos, solicitar ao responsável a emissão de um novo relatório de razão filtrado corretamente.",
      ],
      observacoesGerais:
        "Como o fornecedor não foi encontrado na amostra do relatório de razão, não é possível prosseguir com a conciliação detalhada até que os relatórios estejam consistentes.",
    };

    return {
      fornecedor,
      simulacao,
      status: "conciliacao_gerada",
      modelo: "regra_local_sem_ia",
      entradaIA: null,
      estrutura: estruturaJson,
      respostaBruta:
        "Fornecedor não encontrado na razão. Diagnóstico gerado sem chamada ao modelo de IA.",
    };
  }

  // 🔹 2) Se chegou aqui, o fornecedor EXISTE na razão → montamos o resumo pra IA

  const relatoriosResumidos = {};

  for (const [chave, info] of Object.entries(relatoriosProcessados || {})) {
    const proc = info?.processado || {};

    relatoriosResumidos[chave] = {
      nomeOriginal: info?.nomeOriginal || null,
      tipo: proc?.tipo || null,
      tamanhoTexto: proc?.tamanhoTexto || null,
      preview: proc?.preview || null,
      // 🔹 Aqui sim, usamos só um TRECHO pra não explodir token
      trechoConteudo: proc?.conteudoTexto
        ? String(proc.conteudoTexto).slice(0, 8000)
        : null,
    };
  }

  // 🔹 2.1) Textos COMPLETOS para montar indicadores objetivos por relatório
  const textosCompletos = {
    razao: razaoTextoCompleto,
    balancete:
      relatoriosProcessados?.balancete?.processado?.conteudoTexto || "",
    contas_pagar:
      relatoriosProcessados?.contas_pagar?.processado?.conteudoTexto || "",
  };

  const { indicadoresFornecedor, avaliacaoAutomaticaSaldo } =
    montarIndicadoresFornecedor(fornecedor, textosCompletos);

  const entradaIA = {
    fornecedor,
    relatorios: relatoriosResumidos,
    indicadoresFornecedor,
    avaliacaoAutomaticaSaldo,
  };

  // 🔹 3) Fluxo normal com IA, com regras mais rígidas para saldo
  const systemPrompt = `
Você é um analista contábil brasileiro especialista em CONCILIAÇÃO DE FORNECEDORES.

Contexto:
- Você recebe RESUMOS de 4 relatórios: razão de fornecedores, balancete, contas a pagar e extrato de pagamentos.
- Para cada relatório, você recebe:
  - nomeOriginal
  - tipo
  - tamanhoTexto
  - preview (primeiras linhas)
  - trechoConteudo (primeira parte do texto real, quando disponível)
- Os textos originais podem ser muito grandes, então você trabalha com AMOSTRAS.

Além disso, você recebe um bloco chamado "indicadoresFornecedor" e um campo "avaliacaoAutomaticaSaldo" gerados por REGRAS AUTOMÁTICAS determinísticas:

- "indicadoresFornecedor" contém, para cada relatório (balancete, contas_pagar, razao):
  - as linhas exatas em que o fornecedor aparece;
  - todos os valores monetários encontrados na linha;
  - o último valor monetário (normalmente o saldo).
- "avaliacaoAutomaticaSaldo" pode ter:
  - status "saldos_iguais" => os saldos numéricos dos relatórios são praticamente iguais;
  - status "saldos_diferentes" => foram encontrados saldos diferentes;
  - status "dados_insuficientes" => não foi possível comparar com segurança.

REGRAS MUITO IMPORTANTES (NÃO DESCUMPRIR):

1) Se "avaliacaoAutomaticaSaldo.status" for "saldos_iguais":
   - NÃO crie divergência do tipo "saldo_diferente".
   - Não diga que algum relatório está com saldo zerado se existe saldo identificado nos indicadores.
   - Deixe claro no "resumoExecutivo" que, em relação ao saldo, os relatórios estão CONSISTENTES para o fornecedor.

2) Se "avaliacaoAutomaticaSaldo.status" for "dados_insuficientes":
   - NÃO afirme que o saldo de algum relatório é zero só porque você não enxergou o valor na amostra.
   - Use frases como "não foi possível localizar o saldo na amostra do relatório de contas a pagar" em vez de declarar que o saldo é zerado.

3) Só considere que há "saldo_diferente" quando:
   - a avaliação automática indicar "saldos_diferentes" OU
   - você enxergar, nos próprios "indicadoresFornecedor", valores evidentemente divergentes entre os relatórios.
   Mesmo assim, deixe claro se a conclusão depende de amostras parciais.

4) Nunca invente NF, datas ou valores específicos que não estejam claramente visíveis nas amostras ou nos indicadores.

5) Sempre responda em PORTUGUÊS DO BRASIL.

6) Sempre que possível, preencha o campo "valorEstimado" nas divergências com uma estimativa em reais do impacto financeiro daquela divergência.

Sua resposta DEVE SER SEMPRE um JSON VÁLIDO e NADA ALÉM DISSO (sem texto fora do JSON).

ESTRUTURA OBRIGATÓRIA DO JSON:

{
  "resumoExecutivo": "texto curto e direto sobre a situação do fornecedor",
  "composicaoSaldo": [
    {
      "fonte": "contas_pagar | balancete | razao | pagamentos | estimado",
      "descricao": "explicação da linha",
      "valorEstimado": 0,
      "observacoes": "se não der para afirmar com 100% de certeza, explique aqui"
    }
  ],
  "divergencias": [
    {
      "descricao": "explicação clara da divergência",
      "tipo": "saldo_diferente | titulo_pago_nao_baixado | titulo_sem_pagamento | fornecedor_sem_lancamento | outro",
      "referencias": ["ex: NF, data, conta contábil, fornecedor, banco etc."],
      "valorEstimado": 0,
      "nivelCriticidade": "baixa | media | alta"
    }
  ],
  "pagamentosOrfaos": [
    {
      "descricao": "pagamento que aparece no extrato mas não aparece no contas a pagar ou razão",
      "valorEstimado": 0,
      "referencias": ["dados que ajudem a localizar no sistema"],
      "nivelRisco": "baixo | medio | alto"
    }
  ],
  "titulosVencidosSemContrapartida": [
    {
      "descricao": "título que aparece aberto mas sem pagamento correspondente",
      "valorEstimado": 0,
      "referencias": ["ex: NF, fornecedor, data de vencimento"],
      "diasEmAtrasoEstimado": 0
    }
  ],
  "passosRecomendados": [
    "passo 1 em linguagem simples",
    "passo 2",
    "passo 3"
  ],
  "observacoesGerais": "comentários adicionais ou limitações dos dados"
}
`;

  const userPrompt = `
Você recebeu um resumo dos relatórios do fornecedor "${fornecedor}", incluindo indicadores numéricos automáticos.

Use esses dados para montar um DIAGNÓSTICO DE CONCILIAÇÃO, apontando:
- composição de saldo,
- divergências,
- pagamentos órfãos,
- títulos vencidos sem contrapartida,
- próximos passos.

LEMBRE-SE:
- Respeite rigorosamente as regras sobre "avaliacaoAutomaticaSaldo" descritas na mensagem de sistema.
- Se os saldos forem considerados iguais pela avaliação automática, NÃO crie divergência de saldo.

DADOS DOS RELATÓRIOS E INDICADORES:
${JSON.stringify(entradaIA, null, 2)}
`;

  try {
    logInfo("realizarConciliacao", "Chamando OpenAI", {
      fornecedor,
      modelo: "gpt-4.1-mini",
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion.choices?.[0]?.message?.content?.trim() || "";

    logInfo("realizarConciliacao", "Resposta da OpenAI recebida", {
      fornecedor,
    });

    let estruturaJson = null;
    try {
      estruturaJson = JSON.parse(rawContent);
    } catch (err) {
      logWarn(
        "realizarConciliacao",
        "Falha ao fazer parse do JSON da IA. Devolvendo texto bruto.",
        { message: err.message }
      );
    }

    return {
      fornecedor,
      simulacao,
      status: estruturaJson ? "conciliacao_gerada" : "conciliacao_texto",
      modelo: "gpt-4.1-mini",
      entradaIA,
      estrutura: estruturaJson,
      respostaBruta: rawContent,
    };
  } catch (err) {
    logError("realizarConciliacao", "Erro na chamada OpenAI", {
      message: err.message,
      stack: err.stack,
    });

    return {
      fornecedor,
      simulacao,
      status: "erro_openai",
      mensagem: "Falha ao gerar conciliação com IA. Veja logs no servidor.",
      detalhe: err.message,
    };
  }
}

/**
 * 🔹 Helpers específicos da versão PRO (Rodada 2)
 */

// Classifica criticidade pela faixa de valor
function classificarCriticidadePorValor(valor) {
  if (typeof valor !== "number" || isNaN(valor)) return null;
  if (valor <= 1000) return "baixa";
  if (valor <= 10000) return "media";
  return "alta";
}

// Eleva o nível de criticidade para fornecedor estratégico
function elevarCriticidade(nivelAtual) {
  if (!nivelAtual) return null;
  const n = String(nivelAtual).toLowerCase();
  if (n === "baixa") return "media";
  if (n === "media") return "alta";
  if (n === "alta") return "alta";
  return n;
}

// Extrai CNPJs/CPFs de textos dos relatórios
function extrairIdentificadoresDeRelatorios(relatoriosProcessados = {}) {
  const textos = [];

  for (const info of Object.values(relatoriosProcessados)) {
    const proc = info?.processado || {};
    if (proc.conteudoTexto) textos.push(String(proc.conteudoTexto));
    if (proc.preview) textos.push(String(proc.preview));
  }

  const tudo = textos.join("\n");

  const cnpjRegex = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
  const cpfRegex = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

  const cnpjs = Array.from(new Set(tudo.match(cnpjRegex) || []));
  const cpfs = Array.from(new Set(tudo.match(cpfRegex) || []));

  return { cnpjs, cpfs };
}

// ⚠️ NOVO HELPER (USADO NA RODADA 3 E AGORA TAMBÉM NA 1)
// Calcula o Sub Total de títulos em aberto para o fornecedor no Contas a Pagar
function calcularSubtotalTitulosContasPagar(textoContas, nomeFornecedor) {
  if (!textoContas || !nomeFornecedor) return null;

  const linhas = extrairLinhasFornecedor(textoContas, nomeFornecedor);
  if (!linhas || !linhas.length) return null;

  // 1) Preferência: linha que contenha "sub total"
  let linhaSub = linhas.find((linha) =>
    linha.linhaNormalizada?.includes("sub total")
  );

  // 2) Fallback: maior valor encontrado nas linhas do fornecedor
  if (!linhaSub) {
    let melhor = null;
    for (const linha of linhas) {
      if (!linha.ultimoNumero) continue;
      const num = parseValorMonetario(linha.ultimoNumero);
      if (num === null) continue;
      if (!melhor || num > melhor.valor) {
        melhor = { linha, valor: num };
      }
    }
    if (!melhor) return null;
    linhaSub = melhor.linha;
  }

  return parseValorMonetario(linhaSub.ultimoNumero);
}

// Aplica regras de faixa de valor + aumento de rigor na estrutura JSON
function aplicarRegrasFornecedorEstrategico(estrutura) {
  if (!estrutura || typeof estrutura !== "object") return;

  // Divergências
  if (Array.isArray(estrutura.divergencias)) {
    estrutura.divergencias = estrutura.divergencias.map((div) => {
      const copia = { ...div };
      let nivel = copia.nivelCriticidade || null;

      // Se tiver valorEstimado, usar faixa de valor
      if (!nivel && typeof copia.valorEstimado === "number") {
        nivel = classificarCriticidadePorValor(copia.valorEstimado);
      }

      // Elevar criticidade por ser fornecedor estratégico
      if (nivel) {
        nivel = elevarCriticidade(nivel);
      } else {
        // Se ainda não tiver nível, para estratégico marcamos como alta
        nivel = "alta";
      }

      copia.nivelCriticidade = nivel;
      return copia;
    });
  }

  // Pagamentos órfãos (ajusta nível de risco)
  if (Array.isArray(estrutura.pagamentosOrfaos)) {
    estrutura.pagamentosOrfaos = estrutura.pagamentosOrfaos.map((p) => {
      const copia = { ...p };
      let nivelRisco = copia.nivelRisco || null;

      if (!nivelRisco && typeof copia.valorEstimado === "number") {
        nivelRisco = classificarCriticidadePorValor(copia.valorEstimado);
      }

      if (nivelRisco) {
        nivelRisco = elevarCriticidade(nivelRisco);
      }

      copia.nivelRisco = nivelRisco || "alta";
      return copia;
    });
  }

  // Títulos vencidos
  if (Array.isArray(estrutura.titulosVencidosSemContrapartida)) {
    estrutura.titulosVencidosSemContrapartida =
      estrutura.titulosVencidosSemContrapartida.map((t) => {
        const copia = { ...t };
        if (typeof copia.valorEstimado === "number") {
          copia.nivelRiscoEstimado = elevarCriticidade(
            classificarCriticidadePorValor(copia.valorEstimado)
          );
        }
        return copia;
      });
  }

  // Observação geral reforçando que a análise é mais rígida
  const obsExtra =
    "Fornecedor marcado como estratégico: critérios de severidade foram reforçados com base em faixas de valor e risco.";
  if (estrutura.observacoesGerais) {
    estrutura.observacoesGerais += " " + obsExtra;
  } else {
    estrutura.observacoesGerais = obsExtra;
  }
}

/**
 * Função auxiliar: executa o fluxo completo de conciliação
 * (prepararRodada1 + realizarConciliacao) e devolve estrutura base.
 */
async function executarConciliacaoBase({
  fornecedor,
  arquivos,
  simulacao = false,
}) {
  logInfo("executarConciliacaoBase", "Iniciando fluxo base", {
    fornecedor,
    simulacao,
    arquivos: Object.keys(arquivos || {}),
  });

  // 1) Processa os arquivos (Rodada 1)
  const etapaUpload = await prepararRodada1({ fornecedor, arquivos });

  logInfo("executarConciliacaoBase", "Upload/processamento concluído", {
    fornecedor,
    relatorios: Object.keys(etapaUpload?.relatorios || {}),
  });

  // 2) Chama a IA passando os relatórios já processados
  const conciliacao = await realizarConciliacao({
    fornecedor,
    relatoriosProcessados: etapaUpload.relatorios,
    simulacao,
  });

  logInfo("executarConciliacaoBase", "Conciliação concluída", {
    fornecedor,
    status: conciliacao?.status,
  });

  // 3) Retorna estrutura base
  return {
    fornecedor,
    uploadProcessado: etapaUpload,
    conciliacao,
  };
}

/**
 * Rodada 1 – conciliação padrão
 */
export async function conciliarRodada1({
  fornecedor,
  arquivos,
  simulacao = false,
}) {
  logInfo("conciliarRodada1Service", "Iniciando Rodada 1", {
    fornecedor,
    simulacao,
  });

  const base = await executarConciliacaoBase({
    fornecedor,
    arquivos,
    simulacao,
  });

  // 🔧 AJUSTE EXTRA: força o valor dos títulos vencidos a seguir
  // o Sub Total do fornecedor no Contas a Pagar (igual Rodada 3),
  // sem mudar estrutura nenhuma – só o número.
  try {
    const relatoriosProcessados = base.uploadProcessado?.relatorios || {};
    const estrutura = base.conciliacao?.estrutura;

    if (estrutura && relatoriosProcessados) {
      const contasTexto =
        relatoriosProcessados?.contas_pagar?.processado?.conteudoTexto || "";

      const subtotalTitulos = calcularSubtotalTitulosContasPagar(
        contasTexto,
        fornecedor
      );

      if (subtotalTitulos !== null && !Number.isNaN(subtotalTitulos)) {
        let titulosArr = estrutura.titulosVencidosSemContrapartida;
        if (!Array.isArray(titulosArr)) {
          titulosArr = [];
        }

        if (titulosArr.length === 0) {
          titulosArr.push({
            descricao:
              "Títulos em aberto no contas a pagar para o fornecedor (subtotal calculado automaticamente).",
            tipo: "titulo_sem_pagamento",
            referencias: [
              `Fornecedor: ${fornecedor}`,
              "Relatório: Contas a Pagar por Fornecedor (Sub Total)",
            ],
            valorEstimado: subtotalTitulos,
            diasEmAtrasoEstimado: null,
          });
        } else {
          titulosArr = titulosArr.map((t, index) => {
            if (index === 0) {
              return {
                ...t,
                valorEstimado: subtotalTitulos,
              };
            }
            return t;
          });
        }

        estrutura.titulosVencidosSemContrapartida = titulosArr;
        // garante que o objeto de conciliação continua apontando para a mesma estrutura
        base.conciliacao.estrutura = estrutura;
      }
    }
  } catch (err) {
    logWarn("conciliarRodada1Service", "Falha ao ajustar subtotal na Rodada 1", {
      message: err.message,
    });
  }

  return {
    ...base,
    etapa: "rodada1",
  };
}

/**
 * Rodada 2 – fornecedores estratégicos (versão PRO)
 */
export async function conciliarRodada2({
  fornecedor,
  arquivos,
  simulacao = false,
}) {
  logInfo("conciliarRodada2Service", "Iniciando Rodada 2 (estratégico)", {
    fornecedor,
    simulacao,
  });

  const base = await executarConciliacaoBase({
    fornecedor,
    arquivos,
    simulacao,
  });

  const relatoriosProcessados = base.uploadProcessado?.relatorios || {};
  const estrutura = base.conciliacao?.estrutura;

  // 🔹 Extrai CNPJ/CPF das amostras dos relatórios
  const identificadores = extrairIdentificadoresDeRelatorios(
    relatoriosProcessados
  );

  if (estrutura && typeof estrutura === "object") {
    // Anexa identificadores na estrutura
    estrutura.identificadoresFornecedor = identificadores;

    // Aplica regras de faixa de valor + rigor maior
    aplicarRegrasFornecedorEstrategico(estrutura);
  }

  // Marca perfil na conciliação
  if (base.conciliacao) {
    base.conciliacao.perfilFornecedor = "estrategico";
  }

  return {
    ...base,
    etapa: "rodada2",
    perfilFornecedor: "estrategico",
  };
}

/**
 * Rodada 3 – Auditoria mensal (versão PRO)
 *
 * 👉 IMPORTANTE:
 * - Usa EXATAMENTE o mesmo fluxo de conciliação da Rodada 1
 *   (mesmos cálculos, mesmos textos, mesma IA).
 * - Só acrescenta um "resumo mensal" por cima do JSON gerado,
 *   sem alterar divergências ou composição de saldo.
 * - 🔧 Ajuste extra: força o valor de títulos vencidos a seguir o
 *   Sub Total do fornecedor no Contas a Pagar (para evitar variação da IA).
 */
export async function conciliarRodada3({
  fornecedor,
  arquivos,
  simulacao = false,
}) {
  logInfo("conciliarRodada3Service", "Iniciando Rodada 3 (auditoria)", {
    fornecedor,
    simulacao,
  });

  // 1) Reaproveita a conciliação padrão (Rodada 1) como base
  const baseRodada1 = await conciliarRodada1({
    fornecedor,
    arquivos,
    simulacao,
  });

  // Garante que a estrutura exista
  if (!baseRodada1.conciliacao) {
    baseRodada1.conciliacao = {};
  }
  if (
    !baseRodada1.conciliacao.estrutura ||
    typeof baseRodada1.conciliacao.estrutura !== "object"
  ) {
    baseRodada1.conciliacao.estrutura = {};
  }

  const relatoriosProcessados = baseRodada1.uploadProcessado?.relatorios || {};
  const estrutura = baseRodada1.conciliacao.estrutura;

  // 🔧 1. Ajuste específico da Rodada 3 para TÍTULOS VENCIDOS
  //    - Calcula o Sub Total do fornecedor no Contas a Pagar
  //    - Força o valorEstimado dos títulos vencidos a seguir esse número
  const contasTexto =
    relatoriosProcessados?.contas_pagar?.processado?.conteudoTexto || "";

  const subtotalTitulos = calcularSubtotalTitulosContasPagar(
    contasTexto,
    fornecedor
  );

  if (subtotalTitulos !== null && !Number.isNaN(subtotalTitulos)) {
    let titulosArr = estrutura.titulosVencidosSemContrapartida;
    if (!Array.isArray(titulosArr)) {
      titulosArr = [];
    }

    if (titulosArr.length === 0) {
      titulosArr.push({
        descricao:
          "Títulos em aberto no contas a pagar para o fornecedor (subtotal calculado automaticamente).",
        tipo: "titulo_sem_pagamento",
        referencias: [
          `Fornecedor: ${fornecedor}`,
          "Relatório: Contas a Pagar por Fornecedor (Sub Total)",
        ],
        valorEstimado: subtotalTitulos,
        diasEmAtrasoEstimado: null,
      });
    } else {
      titulosArr = titulosArr.map((t, index) => {
        if (index === 0) {
          return {
            ...t,
            valorEstimado: subtotalTitulos,
          };
        }
        return t;
      });
    }

    estrutura.titulosVencidosSemContrapartida = titulosArr;
    // como 'estrutura' é o mesmo objeto referenciado em baseRodada1.conciliacao.estrutura,
    // o front já recebe o valor corrigido.
  }

  // 2) Pega as divergências já geradas pela IA
  const divergencias = Array.isArray(estrutura.divergencias)
    ? estrutura.divergencias
    : [];

  // Agrupa divergências por tipo
  const mapaPorTipo = new Map();
  let totalDivergencias = 0;

  divergencias.forEach((div) => {
    const tipo = div.tipo || "outro";
    const valor =
      typeof div.valorEstimado === "number" && !isNaN(div.valorEstimado)
        ? div.valorEstimado
        : 0;

    totalDivergencias++;

    if (!mapaPorTipo.has(tipo)) {
      mapaPorTipo.set(tipo, {
        tipo,
        quantidade: 0,
        valorEstimado: 0,
      });
    }

    const item = mapaPorTipo.get(tipo);
    item.quantidade += 1;
    item.valorEstimado += valor;
  });

  const divergenciasPorTipo = Array.from(mapaPorTipo.values()).map((item) => ({
    ...item,
    valorEstimado: Number(item.valorEstimado.toFixed(2)),
  }));

  // 3) Faz uma contagem aproximada dos lançamentos do fornecedor no mês
  const razaoTexto =
    relatoriosProcessados?.razao?.processado?.conteudoTexto || "";
  const pagamentosTexto =
    relatoriosProcessados?.pagamentos?.processado?.conteudoTexto || "";

  const linhasRazao = extrairLinhasFornecedor(razaoTexto, fornecedor);
  const linhasContas = extrairLinhasFornecedor(contasTexto, fornecedor);
  const linhasPagamentos = extrairLinhasFornecedor(
    pagamentosTexto,
    fornecedor
  );

  const resumoMensal = {
    totalLancamentosRazao: linhasRazao.length || 0,
    totalTitulosContasPagar: linhasContas.length || 0,
    // No extrato da Caixa normalmente não vem o nome do fornecedor,
    // então pode ficar 0 mesmo – indica que não foi possível vincular ao fornecedor.
    totalPagamentos: linhasPagamentos.length || 0,
    totalDivergencias,
  };

  const comentarioAuditoria =
    `No mês analisado para o fornecedor "${fornecedor}", ` +
    `foram identificados aproximadamente ${resumoMensal.totalLancamentosRazao} lançamentos na razão, ` +
    `${resumoMensal.totalTitulosContasPagar} títulos no contas a pagar ` +
    `e ${resumoMensal.totalPagamentos} movimento(s) de pagamento ligados diretamente ao fornecedor nas amostras analisadas. ` +
    `Foram registradas ${totalDivergencias} divergência(s), agrupadas por tipo na visão de auditoria mensal. ` +
    (estrutura.resumoExecutivo
      ? "Resumo da conciliação detalhada: " + estrutura.resumoExecutivo
      : "");

  // 4) Anexa os campos da auditoria mensal na própria estrutura E também em níveis superiores
  estrutura.resumoMensal = resumoMensal;
  estrutura.divergenciasPorTipo = divergenciasPorTipo;
  estrutura.comentarioAuditoria = comentarioAuditoria;

  baseRodada1.conciliacao.resumoMensal = resumoMensal;
  baseRodada1.conciliacao.divergenciasPorTipo = divergenciasPorTipo;
  baseRodada1.conciliacao.comentarioAuditoria = comentarioAuditoria;

  // marca perfil da conciliação
  baseRodada1.conciliacao.perfilFornecedor = "auditoria_mensal";

  logInfo("conciliarRodada3Service", "Resumo mensal gerado", resumoMensal);

  // 5) Marca a etapa corretamente para a UI e devolve também os campos na raiz
  return {
    ...baseRodada1,
    etapa: "rodada3",
    perfilFornecedor: "auditoria_mensal",
    resumoMensal,
    divergenciasPorTipo,
    comentarioAuditoria,
  };
}

/**
 * Rodada 4 – (mantém a mesma lógica que você já tinha – não alterei aqui)
 * Caso você tenha mais código pra Rodada 4 em outro arquivo, é só manter.
 */
export async function conciliarRodada4({
  fornecedor,
  arquivos,
  simulacao = false,
}) {
  // ⚠️ Deixei essa função aqui apenas como placeholder,
  // caso você já tenha implementado em outro arquivo originalmente.
  // Se você já tem a versão completa da rodada 4, substitua este corpo
  // por aquele que está funcionando no seu projeto.
  const base = await executarConciliacaoBase({
    fornecedor,
    arquivos,
    simulacao,
  });

  return {
    ...base,
    etapa: "rodada4",
  };
}
