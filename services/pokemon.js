const pool = require('../db-pg');

const FULL = `
  SELECT p.id, p.name, p.height, p.weight, p.image,
         p.has_gender_difference, p.image_female, p.has_alternate_forms,
         COALESCE((SELECT json_agg(t.type_name ORDER BY t.slot)
                   FROM pokemon_types t WHERE t.pokemon_id = p.id), '[]') AS types,
         COALESCE((SELECT json_agg(m.move_name ORDER BY m.move_name)
                   FROM pokemon_moves m WHERE m.pokemon_id = p.id), '[]') AS moves,
         (SELECT row_to_json(s) FROM (
            SELECT hp, attack, defense, special_attack, special_defense, speed
            FROM pokemon_stats WHERE pokemon_id = p.id) s) AS stats,
         COALESCE((SELECT json_agg(json_build_object('name', f.form_name, 'image', f.image) ORDER BY f.id)
                   FROM pokemon_forms f WHERE f.pokemon_id = p.id), '[]') AS forms
  FROM pokemon p`;

function toApi(r) {
  const s = r.stats || {};
  return {
    id: r.id,
    name: r.name,
    height: r.height,
    weight: r.weight,
    image: r.image,
    types: r.types,
    moves: r.moves.length ? r.moves : ['NA'],
    stats: {
      hp: s.hp ?? 0,
      attack: s.attack ?? 0,
      defense: s.defense ?? 0,
      specialAttack: s.special_attack ?? 0,
      specialDefense: s.special_defense ?? 0,
      speed: s.speed ?? 0,
    },
    hasGenderDifference: r.has_gender_difference,
    imageFemale: r.image_female,
    hasAlternateForms: r.has_alternate_forms,
    forms: r.forms,
  };
}

async function listPokemon({ limit = 50, offset = 0, type } = {}) {
  limit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  offset = Math.max(parseInt(offset, 10) || 0, 0);
  const params = [limit, offset];
  let where = '';
  if (type) {
    params.push(String(type).toLowerCase());
    where = `WHERE EXISTS (SELECT 1 FROM pokemon_types t
                           WHERE t.pokemon_id = p.id AND lower(t.type_name) = $3)`;
  }
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.image,
            COALESCE((SELECT json_agg(t.type_name ORDER BY t.slot)
                      FROM pokemon_types t WHERE t.pokemon_id = p.id), '[]') AS types
     FROM pokemon p ${where} ORDER BY p.id LIMIT $1 OFFSET $2`,
    params
  );
  return rows;
}

async function getPokemon(query) {
  const q = String(query).trim().toLowerCase();
  let rows;
  if (/^\d+$/.test(q)) {
    ({ rows } = await pool.query(`${FULL} WHERE p.id = $1`, [parseInt(q, 10)]));
  } else {
    ({ rows } = await pool.query(`${FULL} WHERE lower(p.name) = $1`, [q]));
    if (!rows.length) {
      ({ rows } = await pool.query(
        `${FULL} WHERE p.name ILIKE $1 ORDER BY p.id LIMIT 1`, [`%${q}%`]));
    }
  }
  if (!rows.length) {
    const err = new Error('Pokémon no encontrado');
    err.status = 404;
    throw err;
  }
  return toApi(rows[0]);
}

module.exports = { listPokemon, getPokemon };