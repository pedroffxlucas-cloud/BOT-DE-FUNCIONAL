const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

function commandPayload() {
  return [
    new SlashCommandBuilder()
      .setName("painel-funcional")
      .setDescription("Envia o painel de solicitação de funcional.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName("minha-funcional")
      .setDescription("Mostra o status do seu último pedido."),
    new SlashCommandBuilder()
      .setName("meu-boletim")
      .setDescription("Mostra o número do seu último boletim de ocorrência."),
    new SlashCommandBuilder()
      .setName("registrar-boletim")
      .setDescription("Vincula um número de boletim ao seu Discord.")
      .addStringOption(option =>
        option
          .setName("numero")
          .setDescription("Número do boletim de ocorrência gerado no site")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("diagnostico-cargos")
      .setDescription("Mostra se o bot consegue setar os cargos de funcional.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  ].map(command => command.toJSON());
}

module.exports = { commandPayload };
