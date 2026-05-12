async function enviarBoletimParaDiscord({ discordId, numero }) {
  const resposta = await fetch("/api/boletim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ discordId, numero })
  });

  const dados = await resposta.json();
  if (!resposta.ok || !dados.ok) throw new Error(dados.error || "Falha ao enviar boletim");
  return dados;
}

async function enviarFichaCriminalParaDiscord({
  discordId,
  numero,
  nomeCompleto,
  cpf,
  tipificacaoCriminal,
  materialApreendido,
  presoPor,
  fotoUrl,
  observacoes
}) {
  const resposta = await fetch("/api/ficha-criminal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      discordId,
      numero,
      nomeCompleto,
      cpf,
      tipificacaoCriminal,
      materialApreendido,
      presoPor,
      fotoUrl,
      observacoes
    })
  });

  const dados = await resposta.json();
  if (!resposta.ok || !dados.ok) throw new Error(dados.error || "Falha ao enviar ficha criminal");
  return dados;
}

window.enviarBoletimParaDiscord = enviarBoletimParaDiscord;
window.enviarFichaCriminalParaDiscord = enviarFichaCriminalParaDiscord;
