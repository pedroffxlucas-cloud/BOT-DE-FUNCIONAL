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

async function createBoletim(userId, number) {
  return createRequest({
    id: String(number).trim().toUpperCase(),
    userId,
    type: "boletim-site",
    status: "Registrado",
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

module.exports = { createBoletim, createRequest, findLatestByUser, findRequest, updateRequest };
