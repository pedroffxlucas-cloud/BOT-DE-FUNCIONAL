require("dotenv").config();

const {
  ActionRowBuilder,
  Client,
  EmbedBuilder,
  Events,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

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

function requestId() {
  return `FUNC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
}

function canReview(member) {
  const roleId = optional("DELEGADO_ROLE_ID");
  return Boolean((roleId && member.roles.cache.has(roleId)) || member.permissions.has(PermissionFlagsBits.ManageGuild));
}

function requestModal() {
  return new ModalBuilder()
    .setCustomId("funcional:submit")
    .setTitle("Se registrando...")
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("passport").setLabel("Qual seu passaporte (ID)?").setPlaceholder("ID do seu personagem na cidade")
        .setRequired(true).setMaxLength(10).setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("characterName").setLabel("Nome e sobrenome do personagem").setPlaceholder("Nome Sobrenome")
        .setRequired(true).setMaxLength(60).setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("age").setLabel("Idade do personagem").setPlaceholder("32")
        .setRequired(true).setMaxLength(3).setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("phone").setLabel("Telefone/contato").setPlaceholder("Ex.: 555-0100")
        .setRequired(false).setMaxLength(25).setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("reason").setLabel("Por que quer a funcional?").setPlaceholder("Fale sua area, experiencia ou motivo")
        .setRequired(false).setMaxLength(500).setStyle(TextInputStyle.Paragraph))
    );
}

function denyModal(id) {
  return new ModalBuilder()
    .setCustomId(`funcional:deny-submit:${id}`)
    .setTitle("Reprovar funcional")
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId("reason").setLabel("Motivo da reprovacao").setPlaceholder("Explique o motivo")
      .setRequired(true).setMaxLength(500).setStyle(TextInputStyle.Paragraph)));
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

const client = new Client({ intents: [] });

client.once(Events.ClientReady, bot => {
  console.log(`Bot online como ${bot.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "painel-funcional") {
        const panelChannelId = optional("PANEL_CHANNEL_ID");
        if (panelChannelId) {
          const channel = await interaction.guild.channels.fetch(panelChannelId).catch(() => null);
          if (!channel?.isTextBased()) {
            await interaction.reply({ content: "Canal do painel nao encontrado. Confira PANEL_CHANNEL_ID.", ephemeral: true });
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
          content: request ? `Pedido **${request.id}** | Status: **${request.status}**${request.reviewReason ? `\nMotivo: ${request.reviewReason}` : ""}` : "Voce ainda nao tem pedido registrado.",
          ephemeral: true
        });
        return;
      }
    }

    if (interaction.isButton()) {
      const [scope, action, id] = interaction.customId.split(":");
      if (scope !== "funcional") return;

      if (action === "open") {
        await interaction.showModal(requestModal());
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
          await interaction.reply({ content: "Pedido inexistente ou ja analisado.", ephemeral: true });
          return;
        }

        const updated = await updateRequest(id, { status: "Aprovado", reviewedBy: interaction.user.id, reviewReason: "Aprovado pelo delegado" });
        const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
        const roleId = optional("FUNCIONAL_ROLE_ID");
        if (member && roleId) await member.roles.add(roleId).catch(() => null);

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71).setTitle("Funcional aprovada")
          .setDescription(`Pedido **${updated.id}** aprovado por <@${interaction.user.id}>.`)
          .addFields({ name: "Personagem", value: updated.characterName, inline: true }, { name: "Passaporte/ID", value: updated.passport, inline: true })
          .setTimestamp();
        await interaction.update({ embeds: [embed], components: closedComponents(id, true) });
        await dm(request.userId, `Sua funcional foi **aprovada**. Pedido: ${updated.id}`);
        await log(interaction.guild, embed);
      }
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
          phone: interaction.fields.getTextInputValue("phone")?.trim() || "",
          reason: interaction.fields.getTextInputValue("reason")?.trim() || "",
          status: "Pendente",
          createdAt: new Date().toISOString()
        });

        const channel = await interaction.guild.channels.fetch(cfg("APPROVAL_CHANNEL_ID")).catch(() => null);
        if (!channel?.isTextBased()) {
          await interaction.reply({ content: "Canal de aprovacao nao encontrado.", ephemeral: true });
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
          await interaction.reply({ content: "Pedido inexistente ou ja analisado.", ephemeral: true });
          return;
        }
        const reason = interaction.fields.getTextInputValue("reason").trim();
        const updated = await updateRequest(id, { status: "Reprovado", reviewedBy: interaction.user.id, reviewReason: reason });
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c).setTitle("Funcional reprovada")
          .setDescription(`Pedido **${updated.id}** reprovado por <@${interaction.user.id}>.`)
          .addFields({ name: "Personagem", value: updated.characterName, inline: true }, { name: "Motivo", value: reason })
          .setTimestamp();
        await interaction.update({ embeds: [embed], components: closedComponents(id, false) });
        await dm(request.userId, `Sua funcional foi **reprovada**. Pedido: ${updated.id}\nMotivo: ${reason}`);
        await log(interaction.guild, embed);
      }
    }
  } catch (error) {
    console.error(error);
    const payload = { content: "Erro ao processar essa acao. Veja o console do bot.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
  }
});

client.login(cfg("DISCORD_TOKEN"));
