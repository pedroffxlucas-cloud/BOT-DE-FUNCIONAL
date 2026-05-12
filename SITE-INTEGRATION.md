# Integração do site com o bot

O site precisa chamar a API do bot depois que gerar o boletim de ocorrência.

## Variáveis do site

Crie um `.env` no projeto do site com:

```env
BOT_API_URL=https://bot-de-funcional.onrender.com/boletim
BOT_API_TOKEN=troque_por_um_token_secreto_igual_ao_do_render
```

No Render do bot, adicione a mesma chave:

```env
BOLETIM_API_TOKEN=troque_por_um_token_secreto_igual_ao_do_render
```

## Dados necessários

O site precisa ter:

- `discordId`: ID do Discord da pessoa.
- `numero`: número do boletim gerado pelo site.

Sem `discordId`, o bot não consegue saber para quem enviar a DM.

## Exemplo JavaScript

```js
async function avisarBotSobreBoletim({ discordId, numero }) {
  const response = await fetch(process.env.BOT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: process.env.BOT_API_TOKEN,
      discordId,
      numero
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erro ao avisar bot: ${text}`);
  }

  return response.json();
}
```

Chame essa função logo depois que o site gerar o boletim.

## Exemplo com valores

```js
await avisarBotSobreBoletim({
  discordId: "123456789012345678",
  numero: "BO-2026-000123"
});
```
