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
- `FUNCTIONAL_ROLES`: funcionais/cargos aceitos no formulário, no formato `DHPP:id,GER:id,PCESP:id`.
- `LOG_CHANNEL_ID`: canal de logs, opcional.

Use `/painel-funcional` para enviar o painel no Discord.

Com `PANEL_CHANNEL_ID` configurado, o comando pode ser usado em qualquer canal administrativo e o bot publica o painel automaticamente no canal correto.

No formulário, o usuário informa a funcional desejada, por exemplo `DHPP`. Se ela existir em `FUNCTIONAL_ROLES`, o bot entrega o cargo automaticamente quando o pedido for aprovado. O cargo do bot precisa estar acima dos cargos que ele vai setar e o bot precisa da permissão `Gerenciar Cargos`.

Use `/diagnostico-cargos` no Discord para o bot dizer se consegue setar cada cargo configurado.

Permissões necessárias no invite/configuração do bot:

- Ver canais
- Enviar mensagens
- Usar comandos de aplicativo
- Gerenciar cargos

No Discord, arraste o cargo do bot para ficar acima de `AGENTE DHPP`, `AGENTE GER` e `AGENTE PCESP`. Sem isso, o Discord bloqueia a entrega do cargo mesmo que o código esteja certo.

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
