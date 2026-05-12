require("dotenv").config();

const http = require("node:http");
const {
  ActionRowBuilder,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { REST, Routes } = require("discord.js");

const { commandPayload } = require("./commands");
const {
  createBoletim,
  createFichaProcurado,
  createRequest,
  findLatestByUserType,
  findRequest,
  updateRequest
} = require("./storage");
const { approvalPayload, closedComponents, panelPayload } = require("./ui");

function cfg(name) {
  const value = process.env[name];
  if (!value || value.includes("COLE_") || value.includes("ID_")) {
    throw new Error(`Configure ${name} no arquivo .env`);
  }
  return value;
}

function optional(name) {
  const value = process.env[name];
  if (!value || value.includes("ID_") || value.includes("SEU_SERVIDOR")) return "";
  return value;
}

function publicError(error) {
  return String(error?.message || error || "erro desconhecido").slice(0, 1400);
}

function requestId() {
  return `FUNC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
}

function canReview(member) {
  const roleId = optional("DELEGADO_ROLE_ID");
  return Boolean((roleId && member.roles.cache.has(roleId)) || member.permissions.has(PermissionFlagsBits.ManageGuild));
}

function configuredFunctionalRoles() {
  const fallbackLabels = ["DHPP", "GER", "PCESP"];
  return optional("FUNCTIONAL_ROLES")
    .split(",")
    .map((item, index) => {
      const clean = item.trim();
      if (!clean) return null;
      const parts = clean.includes(":") ? clean.split(":") : [fallbackLabels[index], clean];
      const [label, id] = parts.map(part => part?.trim());
      if (!label || !id || id.includes("ID_DO_")) return null;
      return { label, id };
    })
    .filter(Boolean);
}

function normalizeRoleLabel(value) {
  return String(value || "").trim().toUpperCase();
}

async function roleAccessReport(guild) {
  await guild.roles.fetch();
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const configured = configuredFunctionalRoles();

  if (!configured.length) {
    return {
      ok: false,
      lines: ["Nenhuma funcional configurada em FUNCTIONAL_ROLES."]
    };
  }

  const hasManageRoles = Boolean(botMember?.permissions.has(PermissionFlagsBits.ManageRoles));
  const lines = [
    `Permissão Gerenciar Cargos: ${hasManageRoles ? "OK" : "FALTA"}`,
    `Cargo mais alto do bot: ${botMember?.roles.highest?.name || "não localizado"}`
  ];

  let ok = hasManageRoles && Boolean(botMember);
  for (const item of configured) {
    const role = guild.roles.cache.get(item.id);
    if (!role) {
      lines.push(`${item.label}: cargo não encontrado (${item.id})`);
      ok = false;
      continue;
    }

    if (role.managed || role.id === guild.id) {
      lines.push(`${item.label}: cargo inválido/gerenciado`);
      ok = false;
      continue;
    }

    const editable = Boolean(role.editable);
    lines.push(`${item.label}: ${role.name} | ${editable ? "OK para setar" : "bot abaixo do cargo ou sem permissão"}`);
    if (!editable) ok = false;
  }

  return { ok, lines };
}

async function resolveRequestedRole(guild, roleLabel) {
  const label = normalizeRoleLabel(roleLabel);
  const configured = configuredFunctionalRoles();
  const found = configured.find(item => {
    const configuredLabel = normalizeRoleLabel(item.label);
    return configuredLabel === label || configuredLabel === `AGENTE ${label}` || normalizeRoleLabel(`AGENTE ${configuredLabel}`) === label;
  });
  if (!found) {
    const valid = configured.map(item => item.label).join(", ") || "nenhuma funcional configurada. Confira se FUNCTIONAL_ROLES está no Render e se o serviço foi redeployado.";
    throw new Error(`Funcional "${roleLabel}" não configurada. Use uma destas: ${valid}`);
  }

  const role = await guild.roles.fetch(found.id).catch(() => null);
  if (!role) throw new Error(`Cargo da funcional "${found.label}" não encontrado. Confira FUNCTIONAL_ROLES.`);
  if (!role.editable) {
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const botTopRole = botMember?.roles.highest;
    throw new Error([
      `Não consigo setar "${role.name}".`,
      `Cargo mais alto do bot: "${botTopRole?.name || "não localizado"}" (posição ${botTopRole?.position ?? "?"}).`,
      `Cargo alvo: "${role.name}" (posição ${role.position}).`,
      "No Discord, arraste o cargo do bot para ficar ACIMA desse cargo. Administrador não ignora hierarquia de cargos."
    ].join(" "));
  }
  return role;
}

function requestModal() {
  return new ModalBuilder()
    .setCustomId("funcional:submit")
    .setTitle("Se registrando...")
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("passport")
        .setLabel("Qual seu passaporte (ID)?")
        .setPlaceholder("ID do seu personagem na cidade")
        .setRequired(true)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("characterName")
        .setLabel("Nome e sobrenome do personagem")
        .setPlaceholder("Nome Sobrenome")
        .setRequired(true)
        .setMaxLength(60)
        .setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("age")
        .setLabel("Idade do personagem")
        .setPlaceholder("32")
        .setRequired(true)
        .setMaxLength(3)
        .setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("roleLabel")
        .setLabel("Qual funcional deseja?")
        .setPlaceholder("AGENTE DHPP, AGENTE GER ou AGENTE PCESP")
        .setRequired(true)
        .setMaxLength(40)
        .setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("authorizedBy")
        .setLabel("Quem autorizou sua funcional?")
        .setPlaceholder("Nome do delegado/responsável")
        .setRequired(true)
        .setMaxLength(60)
        .setStyle(TextInputStyle.Short))
    );
}

function denyModal(id) {
  return new ModalBuilder()
    .setCustomId(`funcional:deny-submit:${id}`)
    .setTitle("Reprovar funcional")
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo da reprovação")
      .setPlaceholder("Explique o motivo")
      .setRequired(true)
      .setMaxLength(500)
      .setStyle(TextInputStyle.Paragraph)));
}

async function dm(userId, content) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
    return true;
  } catch (error) {
    console.error("Falha ao enviar DM:", error);
    return false;
  }
}

async function dmPayload(userId, payload) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(payload);
    return true;
  } catch (error) {
    console.error("Falha ao enviar DM:", error);
    return false;
  }
}

function boletimDm(request) {
  const url = optional("DELEGACIA_URL") || "https://portal-pc-508e2.web.app/delegacia-eletronica.html";
  return [
    "**Boletim de ocorrência registrado.**",
    `Número do boletim de ocorrência: **${request.id}**`,
    "",
    "Acompanhe a ocorrência pelo site:",
    url
  ].join("\n");
}

function funcionalRecebidaDm(request) {
  return [
    "**Solicitação de funcional recebida.**",
    `Protocolo: **${request.id}**`,
    "",
    "Seu pedido foi enviado para análise da autoridade responsável.",
    "Você receberá uma mensagem aqui quando for aprovado ou reprovado."
  ].join("\n");
}

async function sendBoletimToUser(userId, number) {
  const request = await createBoletim(userId, number);
  await dm(userId, boletimDm(request));
  return request;
}

function fichaProcuradoEmbed(request) {
  const isProcurado = request.status === "Procurado";
  const embed = new EmbedBuilder()
    .setColor(isProcurado ? 0xf1c40f : 0xc0392b)
    .setTitle(isProcurado ? "Ficha de procurado" : "Ficha criminal")
    .setDescription("Registro ficcional da cidade para acompanhamento da ocorrência.")
    .addFields(
      { name: "Número da ficha", value: request.id, inline: true },
      { name: "Status", value: request.status || "Preso", inline: true },
      { name: "DADOS DO ACUSADO", value: "\u200b", inline: false },
      { name: "NOME COMPLETO", value: request.nome || "Não informado", inline: false },
      { name: "CPF", value: request.cpf || request.passaporte || "Não informado", inline: true },
      { name: "TIPIFICAÇÃO CRIMINAL", value: request.tipificacaoCriminal || request.motivo || "Não especificado", inline: false },
      { name: "MATERIAL APREENDIDO", value: request.materialApreendido || "Não há", inline: false },
      { name: "Autoridade responsável", value: request.autorizadoPor || "Autoridade policial", inline: false }
    )
    .setFooter({ text: "Ambiente imersivo/ficcional. Não é órgão público real." })
    .setTimestamp(new Date(request.createdAt || Date.now()));

  if (request.observacoes) {
    embed.addFields({ name: "Observações", value: request.observacoes.slice(0, 1000), inline: false });
  }

  if (/^https?:\/\//i.test(request.fotoUrl || "")) {
    embed.setThumbnail(request.fotoUrl);
  }

  return embed;
}

async function sendFichaProcurado(data) {
  const request = await createFichaProcurado(data);
  const embed = fichaProcuradoEmbed(request);
  const dmSent = await dmPayload(request.userId, {
    content: "Sua ficha foi registrada no sistema da cidade.",
    embeds: [embed]
  });

  const guildId = optional("GUILD_ID");
  const guild = guildId ? await client.guilds.fetch(guildId).catch(() => null) : null;
  const channelId = optional("PROCURADO_CHANNEL_ID") || optional("LOG_CHANNEL_ID");
  if (guild && channelId) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({ content: `<@${request.userId}>`, embeds: [embed] }).catch(() => null);
    }
  }

  return { request, dmSent };
}

async function log(guild, embed) {
  const channelId = optional("LOG_CHANNEL_ID");
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function startHealthServer() {
  const port = Number(process.env.PORT || 3000);
  const server = http.createServer((request, response) => {
    if (request.method === "POST" && request.url === "/boletim") {
      let raw = "";
      request.on("data", chunk => {
        raw += chunk;
        if (raw.length > 10000) request.destroy();
      });
      request.on("end", async () => {
        try {
          const data = JSON.parse(raw || "{}");
          const expectedToken = optional("BOLETIM_API_TOKEN");
          if (expectedToken && data.token !== expectedToken) {
            response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: false, error: "token inválido" }));
            return;
          }

          if (!data.discordId || !data.numero) {
            response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: false, error: "envie discordId e numero" }));
            return;
          }

          const saved = await sendBoletimToUser(String(data.discordId), String(data.numero));
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: true, boletim: saved.id }));
        } catch (error) {
          response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: false, error: publicError(error) }));
        }
      });
      return;
    }

    if (request.method === "POST" && ["/procurado", "/ficha-criminal"].includes(request.url)) {
      let raw = "";
      request.on("data", chunk => {
        raw += chunk;
        if (raw.length > 25000) request.destroy();
      });
      request.on("end", async () => {
        try {
          const data = JSON.parse(raw || "{}");
          const expectedToken = optional("FICHA_API_TOKEN") || optional("BOLETIM_API_TOKEN");
          if (expectedToken && data.token !== expectedToken) {
            response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: false, error: "token invalido" }));
            return;
          }

          if (!data.discordId) {
            response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: false, error: "envie discordId" }));
            return;
          }

          if (request.url === "/ficha-criminal" && !data.status) data.status = "Ficha criminal";
          const saved = await sendFichaProcurado(data);
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({
            ok: true,
            ficha: saved.request.id,
            dmEnviada: saved.dmSent
          }));
        } catch (error) {
          response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: false, error: publicError(error) }));
        }
      });
      return;
    }

    const payload = {
      ok: true,
      service: "funcional-rp-bot",
      bot: client.user?.tag || "starting",
      uptime: Math.round(process.uptime())
    };
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Health server ouvindo na porta ${port}`);
  });
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(cfg("DISCORD_TOKEN"));
  await rest.put(Routes.applicationGuildCommands(cfg("CLIENT_ID"), cfg("GUILD_ID")), { body: commandPayload() });
  console.log("Slash commands registrados/atualizados.");
}

async function editApprovalMessage(interaction, request, embed, components) {
  const channel = await interaction.guild.channels.fetch(request.approvalChannelId).catch(() => null);
  const message = channel?.isTextBased()
    ? await channel.messages.fetch(request.approvalMessageId).catch(() => null)
    : null;

  if (message) {
    await message.edit({ embeds: [embed], components });
  }
}

client.once(Events.ClientReady, bot => {
  console.log(`Bot online como ${bot.user.tag}`);
  registerCommands().catch(error => console.error("Erro ao registrar comandos:", error.message || error));
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "painel-funcional") {
        const panelChannelId = optional("PANEL_CHANNEL_ID");
        if (panelChannelId) {
          const channel = await interaction.guild.channels.fetch(panelChannelId).catch(() => null);
          if (!channel?.isTextBased()) {
            await interaction.reply({ content: "Canal do painel não encontrado. Confira PANEL_CHANNEL_ID.", ephemeral: true });
            return;
          }
          await channel.send(panelPayload());
          await interaction.reply({ content: `Painel de funcional enviado em <#${panelChannelId}>.`, ephemeral: true });
          return;
        }

        await interaction.reply(panelPayload());
        return;
      }

      if (interaction.commandName === "minha-funcional") {
        const request = await findLatestByUserType(interaction.user.id, "funcional");
        await interaction.reply({
          content: request
            ? `Pedido **${request.id}** | Status: **${request.status}**${request.reviewReason ? `\nMotivo: ${request.reviewReason}` : ""}`
            : "Você ainda não tem pedido registrado.",
          ephemeral: true
        });
      }

      if (interaction.commandName === "meu-boletim") {
        const request = await findLatestByUserType(interaction.user.id, "boletim-site");
        if (!request) {
          await interaction.reply({ content: "Você ainda não tem boletim registrado.", ephemeral: true });
          return;
        }
        await interaction.reply({ content: boletimDm(request), ephemeral: true });
      }

      if (interaction.commandName === "minha-ficha") {
        const request = await findLatestByUserType(interaction.user.id, "ficha-procurado");
        if (!request) {
          await interaction.reply({ content: "Você ainda não tem ficha registrada.", ephemeral: true });
          return;
        }
        await interaction.reply({ embeds: [fichaProcuradoEmbed(request)], ephemeral: true });
      }

      if (interaction.commandName === "registrar-boletim") {
        const number = interaction.options.getString("numero", true).trim().toUpperCase();
        const request = await sendBoletimToUser(interaction.user.id, number);
        await interaction.reply({
          content: `Boletim **${request.id}** vinculado ao seu Discord. Use /meu-boletim para consultar novamente.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "diagnostico-cargos") {
        const report = await roleAccessReport(interaction.guild);
        await interaction.reply({
          content: `Diagnóstico de cargos: **${report.ok ? "OK" : "PRECISA AJUSTAR"}**\n${report.lines.map(line => `- ${line}`).join("\n")}`,
          ephemeral: true
        });
      }
      return;
    }

    if (interaction.isButton()) {
      const [scope, action, id] = interaction.customId.split(":");
      if (scope !== "funcional") return;

      if (action === "open") {
        await interaction.showModal(requestModal());
        return;
      }

      if (action === "roles") {
        await interaction.reply({
          content: "A escolha da funcional agora fica dentro do formulário **Pedir funcional**.",
          ephemeral: true
        });
        return;
      }

      if (action === "deny") {
        if (!canReview(interaction.member)) {
          await interaction.reply({ content: "Apenas delegado/cargo autorizado pode reprovar.", ephemeral: true });
          return;
        }
        await interaction.showModal(denyModal(id));
        return;
      }

      if (action === "approve") {
        if (!canReview(interaction.member)) {
          await interaction.reply({ content: "Apenas delegado/cargo autorizado pode aprovar.", ephemeral: true });
          return;
        }

        const request = await findRequest(id);
        if (!request || request.status !== "Pendente") {
          await interaction.reply({ content: "Pedido inexistente ou já analisado.", ephemeral: true });
          return;
        }

        const role = await resolveRequestedRole(interaction.guild, request.roleLabel);
        const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
        if (!member) {
          await interaction.reply({ content: "Não consegui localizar o membro para setar o cargo.", ephemeral: true });
          return;
        }
        await member.roles.add(role);

        const updated = await updateRequest(id, {
          status: "Aprovado",
          reviewedBy: interaction.user.id,
          reviewReason: "Aprovado pelo delegado"
        });

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("Funcional aprovada")
          .setDescription(`Pedido **${updated.id}** aprovado por <@${interaction.user.id}>.`)
          .addFields(
            { name: "Personagem", value: updated.characterName, inline: true },
            { name: "Passaporte/ID", value: updated.passport, inline: true },
            { name: "Funcional", value: `${updated.roleLabel || "Não informado"} (${role.name})`, inline: true }
          )
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: closedComponents(id, true) });
        await dm(request.userId, `Sua funcional foi **aprovada**. Pedido: ${updated.id}`);
        await log(interaction.guild, embed);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "funcional:submit") {
        const request = await createRequest({
          id: requestId(),
          userId: interaction.user.id,
          guildId: interaction.guildId,
          type: "funcional",
          passport: interaction.fields.getTextInputValue("passport").replace(/\D/g, "").slice(0, 10),
          characterName: interaction.fields.getTextInputValue("characterName").trim(),
          age: interaction.fields.getTextInputValue("age").replace(/\D/g, "").slice(0, 3),
          roleLabel: normalizeRoleLabel(interaction.fields.getTextInputValue("roleLabel")),
          authorizedBy: interaction.fields.getTextInputValue("authorizedBy").trim(),
          status: "Pendente",
          createdAt: new Date().toISOString()
        });

        const channel = await interaction.guild.channels.fetch(cfg("APPROVAL_CHANNEL_ID")).catch(() => null);
        if (!channel?.isTextBased()) {
          await interaction.reply({ content: "Canal de aprovação não encontrado.", ephemeral: true });
          return;
        }

        const message = await channel.send(approvalPayload(request));
        await updateRequest(request.id, { approvalMessageId: message.id, approvalChannelId: channel.id });
        const dmSent = await dm(request.userId, funcionalRecebidaDm(request));
        if (!dmSent) {
          await channel.send({
            content: `Aviso: não consegui enviar DM para <@${request.userId}>. Protocolo da funcional: **${request.id}**`
          }).catch(() => null);
        }
        await interaction.reply({
          content: dmSent
            ? `Pedido enviado. Protocolo da funcional: **${request.id}**. Aguarde a análise do delegado.`
            : `Pedido enviado. Protocolo da funcional: **${request.id}**.\nNão consegui enviar no seu privado. Ative mensagens diretas de membros do servidor ou me chame no privado e tente novamente.`,
          ephemeral: true
        });
        return;
      }

      if (interaction.customId.startsWith("funcional:deny-submit:")) {
        const id = interaction.customId.split(":")[2];
        const request = await findRequest(id);
        if (!request || request.status !== "Pendente") {
          await interaction.reply({ content: "Pedido inexistente ou já analisado.", ephemeral: true });
          return;
        }

        const reason = interaction.fields.getTextInputValue("reason").trim();
        const updated = await updateRequest(id, {
          status: "Reprovado",
          reviewedBy: interaction.user.id,
          reviewReason: reason
        });

        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("Funcional reprovada")
          .setDescription(`Pedido **${updated.id}** reprovado por <@${interaction.user.id}>.`)
          .addFields(
            { name: "Personagem", value: updated.characterName, inline: true },
            { name: "Motivo", value: reason }
          )
          .setTimestamp();

        await editApprovalMessage(interaction, request, embed, closedComponents(id, false));
        await interaction.reply({ content: `Pedido **${updated.id}** reprovado.`, ephemeral: true });
        await dm(request.userId, `Sua funcional foi **reprovada**. Pedido: ${updated.id}\nMotivo: ${reason}`);
        await log(interaction.guild, embed);
      }
      return;
    }
  } catch (error) {
    console.error(error);
    const payload = { content: `Erro ao processar essa ação:\n\`${publicError(error)}\``, ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
  }
});

startHealthServer();
client.login(cfg("DISCORD_TOKEN"));
