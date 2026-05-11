const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

function optionalUrl(name) {
  const value = process.env[name];
  if (!value || value.includes("SEU_SERVIDOR")) return null;
  return value;
}

function panelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x232428)
    .setTitle((process.env.PANEL_TITLE || "Painel de Funcional").toUpperCase())
    .setDescription("Solicite sua funcional atraves do painel. Clique no botao abaixo e comece sua jornada dentro da corporacao.")
    .addFields({ name: "Aviso", value: "Formulario ficticio para jogo/servidor privado. Nao envie senha nem dados reais." })
    .setFooter({ text: process.env.PANEL_ORG || "Departamento Civil da Cidade" })
    .setTimestamp();

  const links = [
    ["Duvidas", "DUVIDAS_URL"],
    ["Corregedoria", "CORREGEDORIA_URL"],
    ["Recursos Humanos", "RH_URL"],
    ["ascom", "ASCOM_URL"]
  ].map(([label, key]) => {
    const url = optionalUrl(key);
    return url ? new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url) : null;
  }).filter(Boolean);

  const components = [];
  if (links.length) components.push(new ActionRowBuilder().addComponents(...links));
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("funcional:open").setLabel("Pedir funcional").setStyle(ButtonStyle.Success)
  ));

  return { embeds: [embed], components };
}

function approvalPayload(request) {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Nova solicitacao de funcional")
    .setDescription("O delegado pode aprovar ou reprovar abaixo.")
    .addFields(
      { name: "Solicitante", value: `<@${request.userId}>`, inline: true },
      { name: "Passaporte/ID", value: request.passport, inline: true },
      { name: "Nome", value: request.characterName, inline: true },
      { name: "Idade", value: request.age, inline: true },
      { name: "Contato", value: request.phone || "Nao informado", inline: true },
      { name: "Motivo", value: request.reason || "Nao informado" }
    )
    .setFooter({ text: request.id })
    .setTimestamp(new Date(request.createdAt));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`funcional:approve:${request.id}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`funcional:deny:${request.id}`).setLabel("Reprovar").setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

function closedComponents(id, approved) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`funcional:closed:${id}`)
      .setLabel(approved ? "Aprovado" : "Reprovado")
      .setStyle(approved ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)
  )];
}

module.exports = { approvalPayload, closedComponents, panelPayload };
