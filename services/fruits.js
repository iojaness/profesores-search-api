const { fruitsCollection } = require('../db-mongo');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function listFruits() {
  const col = await fruitsCollection();
  return col.find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
}

async function getFruit(query) {
  const col = await fruitsCollection();
  const q = String(query).trim().toLowerCase();
  const proj = { projection: { _id: 0 } };
  let found;

  if (/^\d+$/.test(q)) {
    found = await col.findOne({ id: parseInt(q, 10) }, proj);
  } else {
    const safe = escapeRegex(q);
    const ex = new RegExp(`^${safe}$`, 'i');
    const pa = new RegExp(safe, 'i');
    found =
      (await col.findOne({ $or: [{ name: ex }, { romanName: ex }] }, proj)) ||
      (await col.findOne({ $or: [{ name: pa }, { romanName: pa }] }, proj));
  }
  if (!found) {
    const err = new Error('Fruta no encontrada');
    err.status = 404;
    throw err;
  }
  return found;
}

module.exports = { listFruits, getFruit };