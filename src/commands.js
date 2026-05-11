const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

function commandPayload() {
  return [
    new SlashCommandBuilder()
      .setName("painel-funcional")
      .setDescription("Envia o painel de solicitacao de funcional.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName("minha-funcional")
      .setDescription("Mostra o status do seu ultimo pedido.")
  ].map(command => command.toJSON());
}

module.exports = { commandPayload };
