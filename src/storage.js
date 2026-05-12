const fs = require("node:fs/promises");
const path = require("node:path");

const file = path.join(__dirname, "..", "data", "requests.json");

async function allRequests() {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return [];
  }
}

async function saveRequests(items) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(items, null, 2));
}

async function createRequest(request) {
  const items = await allRequests();
  items.unshift(request);
  await saveRequests(items);
  return request;
}

async function findRequest(id) {
  return (await allRequests()).find(item => item.id === id) || null;
}

async function findLatestByUser(userId) {
  return (await allRequests()).find(item => item.userId === userId) || null;
}

async function findLatestByUserType(userId, type) {
  return (await allRequests()).find(item => item.userId === userId && item.type === type) || null;
}

async function createBoletim(userId, number) {
  return createRequest({
    id: String(number).trim().toUpperCase(),
    userId,
    type: "boletim-site",
    status: "Registrado",
    createdAt: new Date().toISOString()
  });
}

async function createFichaProcurado(data) {
  const generatedId = `PROC-${Date.now().toString(36).toUpperCase()}`;
  return createRequest({
    id: String(data.numero || generatedId).trim().toUpperCase(),
    userId: String(data.discordId || data.userId || "").trim(),
    type: "ficha-procurado",
    status: data.status || "Preso",
    nome: String(data.nomeCompleto || data.nome || "Não informado").trim(),
    cpf: String(data.cpf || data.passaporte || data.idCidade || "Não informado").trim(),
    passaporte: String(data.passaporte || data.idCidade || data.cpf || "Não informado").trim(),
    tipificacaoCriminal: String(data.tipificacaoCriminal || data.tipificacao || data.crime || data.motivo || "Não especificado").trim(),
    materialApreendido: String(data.materialApreendido || data.material || "Não há").trim(),
    motivo: String(data.motivo || data.crime || data.tipificacaoCriminal || "Ocorrência registrada").trim(),
    autorizadoPor: String(data.autorizadoPor || data.presopor || data.presoPor || data.agente || "Autoridade policial").trim(),
    fotoUrl: String(data.fotoUrl || data.foto || data.avatarUrl || "").trim(),
    observacoes: String(data.observacoes || data.obs || "").trim(),
    createdAt: new Date().toISOString()
  });
}

async function updateRequest(id, patch) {
  const items = await allRequests();
  const index = items.findIndex(item => item.id === id);
  if (index === -1) return null;
  items[index] = { ...items[index], ...patch, updatedAt: new Date().toISOString() };
  await saveRequests(items);
  return items[index];
}

module.exports = {
  createBoletim,
  createFichaProcurado,
  createRequest,
  findLatestByUser,
  findLatestByUserType,
  findRequest,
  updateRequest
};
