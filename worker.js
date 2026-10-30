
export default {
  async fetch(request, env) {
    const origem = "https://luhkneubl.github.io";
    const headers = {
      "Access-Control-Allow-Origin": origem,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    const enviar = (dados, status = 200) =>
      new Response(JSON.stringify(dados), { status, headers });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return enviar({ erro: "Método não permitido" }, 405);
    }

    if (request.headers.get("Origin") !== origem) {
      return enviar({ erro: "Origem não permitida" }, 403);
    }

    let mensagem;
    try {
      const corpo = await request.json();
      mensagem = corpo.mensagem;
    } catch {
      return enviar({ erro: "Mensagem inválida" }, 400);
    }

    if (typeof mensagem !== "string" || !mensagem.trim()) {
      return enviar({ erro: "Mensagem vazia" }, 400);
    }

    if (!env.GEMINI_API_KEY) {
      return enviar({ erro: "Chave Gemini não configurada" }, 503);
    }

    const base = "https://generativelanguage.googleapis.com/v1beta";
    const autenticacao = { "x-goog-api-key": env.GEMINI_API_KEY };

    const instrucao =
      "Você é J.A.R.V.I.S., assistente da senhora Preis. " +
      "Responda em português brasileiro, com extrema educação, " +
      "inteligência, humor seco britânico e sarcasmo sutil. " +
      "Seja natural e prestativo. Pode discordar respeitosamente. " +
      "Não afirme realizar ações que não pode executar.";

    async function consultar(modelo) {
      const resposta = await fetch(
        `${base}/models/${encodeURIComponent(modelo)}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            ...autenticacao,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: instrucao }]
            },
            contents: [{
              role: "user",
              parts: [{ text: mensagem.trim().slice(0, 1000) }]
            }],
            generationConfig: { maxOutputTokens: 500 }
          })
        }
      );

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        return {
          erro: dados.error?.message || `Google ${resposta.status}`,
          status: resposta.status
        };
      }

      const texto = dados.candidates?.[0]?.content?.parts
        ?.map(parte => parte.text || "").join("").trim();

      return { texto };
    }

    try {
      const lista = await fetch(`${base}/models?pageSize=100`, {
        headers: autenticacao,
        signal: AbortSignal.timeout(10000)
      });

      if (!lista.ok) {
        return enviar({
          erro: `Não foi possível consultar os modelos: Google ${lista.status}`
        }, 502);
      }

      const dadosLista = await lista.json();
      const modelos = (dadosLista.models || [])
        .filter(modelo =>
          modelo.supportedGenerationMethods?.includes("generateContent")
        )
        .map(modelo => modelo.name.replace(/^models\//, ""))
        .filter(nome => nome.includes("flash"))
        .sort((a, b) => {
          if (a === "gemini-3.8-flash") return -1;
          if (b === "gemini-3.8-flash") return 1;
          return a.localeCompare(b);
        })
        .slice(0, 4);

      if (!modelos.length) {
        return enviar({
          erro: "Nenhum modelo Flash compatível encontrado."
        }, 502);
      }

      let ultimoErro = "Nenhum modelo respondeu.";

      for (const modelo of modelos) {
        try {
          const resultado = await consultar(modelo);

          if (resultado.texto) {
            return enviar({ resposta: resultado.texto });
          }

          ultimoErro = `${modelo}: ${resultado.erro || "Resposta vazia"}`;

          if (![404, 429, 500, 502, 503, 504].includes(resultado.status)) {
            break;
          }
        } catch (erro) {
          ultimoErro = `${modelo}: tempo de espera ou conexão`;
        }
      }

      return enviar({
        erro: `Não consegui consultar os modelos. ${ultimoErro}`
      }, 502);

    } catch (erro) {
      return enviar({
        erro: "Falha ao consultar os modelos do Google."
      }, 502);
    }
  }
};
