require("dotenv").config();

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

function cfg(name) {
  const value = process.env[name];
  if (!value || value.includes("COLE_") || value.includes("ID_")) {
    throw new Error(`Preencha ${name} no arquivo .env`);
  }
  return value;
}

const commands = [
  new SlashCommandBuilder()
    .setName("painel-funcional")
    .setDescription("Envia o painel de solicitacao de funcional.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("minha-funcional")
    .setDescription("Mostra o status do seu ultimo pedido.")
].map(command => command.toJSON());

async function main() {
  const rest = new REST({ version: "10" }).setToken(cfg("DISCORD_TOKEN"));
  await rest.put(Routes.applicationGuildCommands(cfg("CLIENT_ID"), cfg("GUILD_ID")), { body: commands });
  console.log("Comandos registrados com sucesso.");
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
