const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

function json(response, status, payload) {
  response.status(status).set("content-type", "application/json; charset=utf-8").send(payload);
}

function botBaseUrl() {
  return String(process.env.BOT_API_BASE_URL || "https://bot-de-funcional.onrender.com").replace(/\/+$/, "");
}

function botToken(kind) {
  if (kind === "ficha") return process.env.FICHA_API_TOKEN || process.env.BOT_API_TOKEN || "";
  return process.env.BOT_API_TOKEN || "";
}

async function forwardToBot(path, body, kind) {
  const response = await fetch(`${botBaseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, token: botToken(kind) })
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { ok: false, error: text || "resposta invalida do bot" };
  }

  if (!response.ok) {
    const message = data?.error || `erro ${response.status} ao chamar bot`;
    throw new Error(message);
  }

  return data;
}

function normalizePath(url) {
  return new URL(url, "https://firebase.local").pathname.replace(/^\/api/, "") || "/";
}

exports.api = onRequest({ cors: true, region: "southamerica-east1" }, async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      json(response, 200, { ok: true, service: "firebase-bot-bridge" });
      return;
    }

    const path = normalizePath(request.url);
    const body = request.body || {};

    if (path === "/boletim") {
      if (!body.discordId || !body.numero) {
        json(response, 400, { ok: false, error: "envie discordId e numero" });
        return;
      }

      const result = await forwardToBot("/boletim", {
        discordId: String(body.discordId),
        numero: String(body.numero)
      }, "boletim");
      json(response, 200, result);
      return;
    }

    if (path === "/ficha-criminal" || path === "/procurado") {
      if (!body.discordId) {
        json(response, 400, { ok: false, error: "envie discordId" });
        return;
      }

      const result = await forwardToBot("/ficha-criminal", {
        discordId: String(body.discordId),
        numero: body.numero,
        nomeCompleto: body.nomeCompleto || body.nome,
        cpf: body.cpf,
        tipificacaoCriminal: body.tipificacaoCriminal || body.tipificacao || body.crime,
        materialApreendido: body.materialApreendido || body.material,
        presoPor: body.presoPor || body.agente,
        fotoUrl: body.fotoUrl || body.foto,
        observacoes: body.observacoes || body.obs,
        status: body.status || "Ficha criminal"
      }, "ficha");
      json(response, 200, result);
      return;
    }

    json(response, 404, { ok: false, error: "rota nao encontrada" });
  } catch (error) {
    logger.error(error);
    json(response, 500, { ok: false, error: String(error.message || error).slice(0, 500) });
  }
});
