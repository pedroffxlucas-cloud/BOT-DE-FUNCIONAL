require("dotenv").config();

const { REST, Routes } = require("discord.js");
const { commandPayload } = require("./commands");

function cfg(name) {
  const value = process.env[name];
  if (!value || value.includes("COLE_") || value.includes("ID_")) {
    throw new Error(`Preencha ${name} no arquivo .env`);
  }
  return value;
}

async function main() {
  const rest = new REST({ version: "10" }).setToken(cfg("DISCORD_TOKEN"));
  await rest.put(Routes.applicationGuildCommands(cfg("CLIENT_ID"), cfg("GUILD_ID")), { body: commandPayload() });
  console.log("Comandos registrados com sucesso.");
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
