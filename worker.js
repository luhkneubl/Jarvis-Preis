
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
      return enviar({ erro: "JSON inválido" }, 400);
    }

    if (typeof mensagem !== "string" || !mensagem.trim()) {
      return enviar({ erro: "Mensagem vazia" }, 400);
    }

    if (!env.GEMINI_API_KEY) {
      return enviar({ erro: "Chave Gemini não configurada" }, 503);
    }

    try {
      const resposta = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/models/gemini-2.5-flash:generateContent:",
        {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "Você é J.A.R.V.I.S., assistente pessoal da senhora Preis. Fale em português brasileiro. Seja extremamente educado, inteligente e prestativo, com humor seco britânico e sarcasmo sutil. Seja natural e conciso. Pode discordar respeitosamente. Não afirme realizar ações que não pode executar."
              }]
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
        const codigo = resposta.status;
        const detalhe = dados.error?.message || "Sem detalhes";

        return enviar({
          erro: `Google ${codigo}: ${detalhe}`,
          status: codigo
        }, 502);
      }

      const texto = dados.candidates?.[0]?.content?.parts
        ?.map(parte => parte.text || "")
        .join("")
        .trim();

      return enviar({
        resposta: texto ||
          "Perdoe-me, senhora Preis. Não consegui formular uma resposta."
      });

    } catch (erro) {
      if (erro.name === "TimeoutError" ||
          erro.name === "AbortError") {
        return enviar({
          erro: "O Google demorou mais de 20 segundos para responder."
        }, 504);
      }

      return enviar({
        erro: "Falha de comunicação com o Google."
      }, 502);
    }
  }
};
