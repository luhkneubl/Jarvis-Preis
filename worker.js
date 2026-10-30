
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
      return enviar({
        erro: "Chave Gemini não configurada."
      }, 503);
    }

    const base =
      "https://generativelanguage.googleapis.com/v1beta";

    const autenticacao = {
      "x-goog-api-key": env.GEMINI_API_KEY
    };

    const instrucao =
      "Você é J.A.R.V.I.S., assistente pessoal da senhora Preis. " +
      "Responda em português brasileiro, com extrema educação, " +
      "inteligência e humor seco britânico. " +
      "Use sarcasmo sutil quando apropriado. " +
      "Seja natural, prestativo e conciso. " +
      "Pode discordar respeitosamente. " +
      "Não afirme realizar ações que não pode executar.";

    async function consultar(modelo) {
      const resposta = await fetch(
        `${base}/models/${encodeURIComponent(modelo)}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(12000),
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
              parts: [{
                text: mensagem.trim().slice(0, 1000)
              }]
            }],
            generationConfig: {
              maxOutputTokens: 500
            }
          })
        }
      );

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        return {
          erro: dados.error?.message ||
            `Google ${resposta.status}`,
          status: resposta.status
        };
      }

      const texto = dados.candidates?.[0]?.content?.parts
        ?.map(parte => parte.text || "")
        .join("")
        .trim();

      return {
        texto,
        erro: texto ? null : "Resposta vazia"
      };
    }

    try {
      const lista = await fetch(
        `${base}/models?pageSize=100`,
        {
          headers: autenticacao,
          signal: AbortSignal.timeout(10000)
        }
      );

      if (!lista.ok) {
        return enviar({
          erro: `Falha ao consultar modelos: Google ${lista.status}`
        }, 502);
      }

      const dadosLista = await lista.json();

      const modelos = (dadosLista.models || [])
        .filter(modelo =>
          modelo.supportedGenerationMethods?.includes(
            "generateContent"
          )
        )
        .map(modelo =>
          modelo.name.replace(/^models\//, "")
        )
        .filter(nome =>
          nome.includes("flash") &&
          !/tts|audio|live|image|embedding|native/i.test(nome)
        )
        .sort((a, b) => {
          if (a === "gemini-3.8-flash") return -1;
          if (b === "gemini-3.8-flash") return 1;
          return a.localeCompare(b);
        })
        .slice(0, 5);

      if (!modelos.length) {
        return enviar({
          erro: "Nenhum modelo Flash de texto encontrado."
        }, 502);
      }

      const erros = [];

      for (const modelo of modelos) {
        try {
          const resultado = await consultar(modelo);

          if (resultado.texto) {
            return enviar({
              resposta: resultado.texto
            });
          }

          erros.push(
            `${modelo}: ${resultado.erro || "Resposta vazia"}`
          );

          if (
            resultado.status &&
            ![404, 429, 500, 502, 503, 504].includes(
              resultado.status
            )
          ) {
            break;
          }

        } catch (erro) {
          erros.push(
            `${modelo}: tempo de espera ou falha de conexão`
          );
        }
      }

      return enviar({
        erro: `Modelos testados: ${erros.join(" | ")}`
      }, 502);

    } catch (erro) {
      return enviar({
        erro: "Falha ao consultar a lista de modelos do Google."
      }, 502);
    }
  }
};
