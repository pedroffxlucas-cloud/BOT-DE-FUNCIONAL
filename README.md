# Bot de Funcional

Bot Discord para painel de funcional ficticia de jogo/servidor privado.

## Rodar

1. Preencha `.env` com token e IDs reais.
2. Registre comandos:

```powershell
npm.cmd run deploy
```

3. Ligue o bot:

```powershell
npm.cmd start
```

## O que precisa no `.env`

- `DISCORD_TOKEN`: token do bot.
- `CLIENT_ID`: Application ID do bot.
- `GUILD_ID`: ID do servidor.
- `APPROVAL_CHANNEL_ID`: canal onde o delegado recebe pedidos.
- `PANEL_CHANNEL_ID`: canal onde o embed do painel de funcional sera publicado.
- `DELEGADO_ROLE_ID`: cargo que aprova/reprova, opcional se a pessoa tiver Gerenciar Servidor.
- `FUNCIONAL_ROLE_ID`: cargo dado automaticamente ao aprovado, opcional.
- `LOG_CHANNEL_ID`: canal de logs, opcional.

Use `/painel-funcional` para enviar o painel no Discord.

Com `PANEL_CHANNEL_ID` configurado, o comando pode ser usado em qualquer canal administrativo e o bot publica o painel automaticamente no canal correto.

## Subir no Render

O bot deve ser criado como `Background Worker`, porque ele fica conectado ao Discord e nao precisa abrir uma porta HTTP.

Configuracao manual:

- Root Directory: `portal-cidadao-seguro/discord-funcional-bot`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variables: copie as chaves do `.env.example`

Configuracao por Blueprint:

- Suba esta pasta para o GitHub.
- No Render, use `New +` > `Blueprint`.
- Escolha o repositorio.
- O Render vai ler `render.yaml`.
- Preencha as variaveis marcadas como secretas.
- Depois do primeiro deploy, abra o Shell/Logs e rode localmente ou em sua maquina:

```powershell
npm.cmd run deploy
```

Esse comando registra os slash commands no seu servidor.
