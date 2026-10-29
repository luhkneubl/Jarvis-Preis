export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "https://luhkneubl.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ erro: "Metodo nao permitido" }), {
        status: 405, headers
      });
    }

    if (request.headers.get("Origin") !== "https://luhkneubl.github.io") {
      return new Response(JSON.stringify({ erro: "Origem nao permitida" }), {
        status: 403, headers
      });
    }

    try {
      const { mensagem } = await request.json();
      if (typeof mensagem !== "string" || !mensagem.trim()) {
        return new Response(JSON.stringify({ erro: "Mensagem vazia" }), {
          status: 400, headers
        });
      }

      if (!env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({ erro: "Chave nao configurada" }), {
          status: 503, headers
        });
      }

      const resposta = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "Voce e J.A.R.V.I.S., assistente pessoal da senhora Preis. Responda em portugues brasileiro, com extrema educacao, inteligencia e humor seco britanico. Use sarcasmo sutil quando apropriado. Seja natural, prestativo e conciso. Pode discordar respeitosamente. Nao afirme executar acoes que nao pode executar."
              }]
            },
            contents: [{
              role: "user",
              parts: [{ text: mensagem.slice(0, 1000) }]
            }],
            generationConfig: { maxOutputTokens: 500 }
          })
        }
      );

      if (!resposta.ok) {
        return new Response(JSON.stringify({
         erro: "Gemini indisponivel (Google: " + resposta.status + ")",
          status: resposta.status
        }), { status: 502, headers });
      }

      const dados = await resposta.json();
      const texto = dados.candidates?.[0]?.content?.parts
        ?.map(parte => parte.text || "").join("").trim();

      return new Response(JSON.stringify({
        resposta: texto || "Perdoe-me, senhora Preis. Nao consegui formular uma resposta."
      }), { headers });
    } catch (erro) {
      return new Response(JSON.stringify({
        erro: "Falha ao processar mensagem"
      }), { status: 500, headers });
    }
  }
};

