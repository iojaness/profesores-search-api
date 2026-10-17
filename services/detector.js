const mysql = require('../db');                       // MySQL (docentes)
const pg = require('../db-pg');                       // Postgres (pokémon)
const { fruitsCollection } = require('../db-mongo');  // Mongo (frutas)

const TTL = 3 * 1000; // refresca los nombres cada 3 segundos
let cache = null;
let cacheAt = 0;
let loading = null;

// minúsculas, sin tildes, solo letras/números separados por un espacio
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function add(map, key, label) {
  if (key && key !== 'na' && !map.has(key)) map.set(key, label);
}

async function construir() {
  const [pk, fr, dc] = await Promise.allSettled([
    pg.query('SELECT name FROM pokemon'),
    fruitsCollection().then((c) =>
      c.find({}, { projection: { _id: 0, name: 1, romanName: 1 } }).toArray()
    ),
    mysql.query('SELECT NOMBRE FROM Profesores'),
  ]);

  const idx = { pokemon: new Map(), fruta: new Map(), docente: new Map() };
  let fallos = 0;

  // Pokémon
  if (pk.status === 'fulfilled') {
    for (const r of pk.value.rows) add(idx.pokemon, norm(r.name), r.name);
  } else {
    fallos++;
    console.error('detector pokemon:', pk.reason?.message);
    if (cache) idx.pokemon = cache.pokemon;
  }

  // Frutas
  if (fr.status === 'fulfilled') {
    for (const f of fr.value) {
      for (const campo of [f.name, f.romanName]) {
        const n = norm(campo);
        add(idx.fruta, n, f.name);
        add(idx.fruta, n.replace(/ no mi$/, ''), f.name);          // "mera mera no mi" -> "mera mera"
        const primera = n.split(' ')[0];
        if (primera.length >= 4) add(idx.fruta, primera, f.name);   // "mera"
      }
    }
  } else {
    fallos++;
    console.error('detector fruta:', fr.reason?.message);
    if (cache) idx.fruta = cache.fruta;
  }

  // Docentes
  if (dc.status === 'fulfilled') {
    const [filas] = dc.value;
    for (const { NOMBRE } of filas) {
      const n = norm(NOMBRE);
      add(idx.docente, n, NOMBRE);                                  // nombre completo
      for (const t of n.split(' ')) {
        if (t.length >= 4) add(idx.docente, t, NOMBRE);             // "perez"
      }
    }
  } else {
    fallos++;
    console.error('detector docente:', dc.reason?.message);
    if (cache) idx.docente = cache.docente;
  }

  if (fallos === 3 && !cache) {
    const err = new Error('No se pudo consultar ninguna base de datos');
    err.status = 503;
    throw err;
  }
  return idx;
}

async function indice() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  if (!loading) {
    loading = construir()
      .then((i) => {
        cache = i;
        cacheAt = Date.now();
        return i;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

// Devuelve las entidades registradas que aparecen en el prompt
async function detectar(prompt) {
  const idx = await indice();
  const hay = ` ${norm(prompt)} `;
  const vistos = new Set();
  const hits = [];
  for (const [tipo, mapa] of Object.entries(idx)) {
    for (const [clave, nombre] of mapa) {
      if (hay.includes(` ${clave} `) && !vistos.has(`${tipo}:${nombre}`)) {
        vistos.add(`${tipo}:${nombre}`);
        hits.push({ tipo, nombre });
      }
    }
  }
  return hits.slice(0, 5);
}

module.exports = { detectar };