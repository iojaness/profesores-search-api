const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway: si usas la URL pública necesitas SSL; con la interna no
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;