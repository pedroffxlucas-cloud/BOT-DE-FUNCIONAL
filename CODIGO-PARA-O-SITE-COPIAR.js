/*
  Cole este exemplo no backend/API do site depois de gerar o boletim.
  O site precisa ter:
  - process.env.BOT_API_URL
  - process.env.BOT_API_TOKEN
*/

async function enviarBoletimParaDiscord({ discordId, numero }) {
  if (!discordId) throw new Error("Falta discordId da pessoa.");
  if (!numero) throw new Error("Falta numero do boletim.");

  const response = await fetch(process.env.BOT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: process.env.BOT_API_TOKEN,
      discordId,
      numero
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Erro ao avisar o bot.");
  }

  return data;
}

// Exemplo de uso depois que o site gerar o boletim:
// await enviarBoletimParaDiscord({
//   discordId: "123456789012345678",
//   numero: "BO-2026-000123"
// });

module.exports = { enviarBoletimParaDiscord };
