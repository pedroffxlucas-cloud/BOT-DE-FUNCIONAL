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
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { REST, Routes } = require("discord.js");

const { commandPayload } = require("./commands");
const { createRequest, findLatestByUser, findRequest, updateRequest } = require("./storage");
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
  return optional("FUNCTIONAL_ROLES")
    .split(",")
    .map(item => {
      const [label, id] = item.split(":").map(part => part?.trim());
      if (!label || !id || id.includes("ID_DO_")) return null;
      return { label, id };
    })
    .filter(Boolean);
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

async function roleSelectPayload(guild) {
  await guild.roles.fetch();
  const roles = configuredFunctionalRoles()
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role && !item.role.managed && item.role.id !== guild.id);

  if (!roles.length) {
    return {
      content: "Nenhum cargo configurado. No Render, preencha FUNCTIONAL_ROLES assim: `AGENTE DHPP:id,AGENTE GER:id,AGENTE PCESP:id`.",
      ephemeral: true,
      components: []
    };
  }

  return {
    content: "Escolha o cargo que deseja receber:",
    ephemeral: true,
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("funcional:role-select")
        .setPlaceholder("Selecionar cargo")
        .addOptions(roles.slice(0, 25).map(item => ({
          label: item.label.slice(0, 100),
          value: item.role.id,
          description: `Setar ${item.label}`.slice(0, 100)
        })))
    )]
  };
}

async function dm(userId, content) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
  } catch {}
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
        const request = await findLatestByUser(interaction.user.id);
        await interaction.reply({
          content: request
            ? `Pedido **${request.id}** | Status: **${request.status}**${request.reviewReason ? `\nMotivo: ${request.reviewReason}` : ""}`
            : "Você ainda não tem pedido registrado.",
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
        await interaction.reply(await roleSelectPayload(interaction.guild));
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

        const updated = await updateRequest(id, {
          status: "Aprovado",
          reviewedBy: interaction.user.id,
          reviewReason: "Aprovado pelo delegado"
        });

        const roleId = optional("FUNCIONAL_ROLE_ID");
        if (roleId) {
          const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
          if (member) await member.roles.add(roleId).catch(error => console.error("Erro ao entregar FUNCIONAL_ROLE_ID:", error));
        }

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("Funcional aprovada")
          .setDescription(`Pedido **${updated.id}** aprovado por <@${interaction.user.id}>.`)
          .addFields(
            { name: "Personagem", value: updated.characterName, inline: true },
            { name: "Passaporte/ID", value: updated.passport, inline: true }
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
          passport: interaction.fields.getTextInputValue("passport").replace(/\D/g, "").slice(0, 10),
          characterName: interaction.fields.getTextInputValue("characterName").trim(),
          age: interaction.fields.getTextInputValue("age").replace(/\D/g, "").slice(0, 3),
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
        await interaction.reply({ content: `Pedido enviado. Protocolo: **${request.id}**`, ephemeral: true });
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

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== "funcional:role-select") return;

      const roleId = interaction.values[0];
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (!role || role.managed || role.id === interaction.guild.id) {
        await interaction.reply({ content: "Cargo inválido ou indisponível.", ephemeral: true });
        return;
      }

      if (!configuredFunctionalRoles().some(item => item.id === role.id)) {
        await interaction.reply({ content: "Esse cargo não está configurado para funcional.", ephemeral: true });
        return;
      }

      const member = interaction.member;
      if (!member) {
        await interaction.reply({ content: "Não consegui localizar seu usuário no servidor.", ephemeral: true });
        return;
      }

      try {
        await member.roles.add(role);
      } catch (error) {
        console.error("Erro ao setar cargo:", error);
        await interaction.reply({
          content: `Não consegui setar esse cargo.\nMotivo: \`${publicError(error)}\`\nConfira se o cargo do bot está acima desse cargo e se ele tem permissão **Gerenciar Cargos**.`,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({ content: `Cargo ${role} setado com sucesso.`, ephemeral: true });
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
