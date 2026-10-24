const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const swaggerUiDist = require('swagger-ui-dist');
const pool = require('./db');
const spec = require('./swagger');
const fruits = require('./services/fruits');
const pokemon = require('./services/pokemon');
const gemini = require('./services/gemini');
const proveedoresIa = require('./services/proveedoresIa');
const { detectar } = require('./services/detector');

const PORT = process.env.PORT || 3000;
const CORS = { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*' };
const UI_DIR = swaggerUiDist.getAbsoluteFSPath();

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.map': 'application/json',
};

function responder(res, status, datos) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(datos));
}

const DOCS_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>API de Docentes - Consulta</title>
  <link rel="stylesheet" href="/api-docs/assets/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api-docs/assets/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui', tryItOutEnabled: true });
  </script>
</body>
</html>`;

// Sirve los archivos de swagger-ui-dist (css, js)
function servirAsset(res, nombre) {
  const archivo = path.basename(nombre); // evita path traversal (../)
  const ruta = path.join(UI_DIR, archivo);

  fs.stat(ruta, (err, stat) => {
    if (err || !stat.isFile()) {
      return responder(res, 404, { ok: false, error: 'No encontrado' });
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(archivo)] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    fs.createReadStream(ruta).pipe(res);
  });
}

async function findProfesor(nombre) {
  try {
    // Escapa % y _ para que se busquen como texto literal
    const patron = `%${nombre.replace(/[\\%_]/g, '\\$&')}%`;
    const [rows] = await pool.query(
      `SELECT id, NOMBRE, TITULO, UNIVERSIDAD, DISCIPLINA, DESCRIPCION, FOTO
         FROM Profesores
        WHERE NOMBRE LIKE ?
        ORDER BY NOMBRE
        LIMIT 1`,
      [patron]
    );

    if (rows.length === 0) return { ok: true, found: false };

    const p = rows[0];
    return {
      ok: true,
      found: true,
      id: p.id,
      NOMBRE: p.NOMBRE,
      TITULO: p.TITULO,
      UNIVERSIDAD: p.UNIVERSIDAD,
      DISCIPLINA: p.DISCIPLINA,
      DESCRIPCION: p.DESCRIPCION,
      FOTO: p.FOTO,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Error al consultar la base de datos' };
  }
}

// ---------- Documentación (comentarios leídos por swagger-jsdoc) ----------

/**
 * @openapi
 * components:
 *   schemas:
 *     ProfesorResultado:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: true
 *         found:
 *           type: boolean
 *           description: false si no hay coincidencias (no vienen los demás campos)
 *           example: true
 *         id:
 *           type: integer
 *           example: 1
 *         NOMBRE:
 *           type: string
 *           example: Juan Pérez
 *         TITULO:
 *           type: string
 *           example: Magíster en Ingeniería de Software
 *         UNIVERSIDAD:
 *           type: string
 *           example: UNINPAHU
 *         DISCIPLINA:
 *           type: string
 *           example: Ingeniería de Sistemas
 *         DESCRIPCION:
 *           type: string
 *           nullable: true
 *           example: Docente e investigador en ingeniería de software
 *         FOTO:
 *           type: string
 *           nullable: true
 *           example: https://ejemplo.com/foto.jpg
 *     Error:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           example: Mensaje de error
 */

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verifica que el servicio esté activo
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Servicio activo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
function health(res) {
  responder(res, 200, { status: 'ok' });
}

/**
 * @openapi
 * /profe/{nombre}:
 *   get:
 *     summary: Busca un docente por nombre
 *     description: Búsqueda parcial e insensible a mayúsculas y tildes. Devuelve solo la primera coincidencia.
 *     tags: [Docentes]
 *     parameters:
 *       - in: path
 *         name: nombre
 *         required: true
 *         description: Nombre completo o parcial del docente
 *         schema:
 *           type: string
 *           example: demo
 *     responses:
 *       200:
 *         description: Resultado de la búsqueda (revisa el campo found)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProfesorResultado'
 *       400:
 *         description: Falta el nombre
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error interno o de base de datos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
async function profe(res, rutaCompleta) {
  const nombre = decodeURIComponent(rutaCompleta.split('/')[2] || '').trim();

  if (!nombre) {
    return responder(res, 400, { ok: false, error: 'Falta el nombre' });
  }

  const result = await findProfesor(nombre);
  responder(res, result.ok ? 200 : 500, result);
}

/**
 * @openapi
 * /api/fruit:
 *   get:
 *     summary: Lista todas las frutas del diablo
 *     tags: [Frutas]
 *     responses:
 *       200:
 *         description: Lista de frutas
 * /api/fruit/{query}:
 *   get:
 *     summary: Busca una fruta por nombre o número
 *     tags: [Frutas]
 *     parameters:
 *       - in: path
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *           example: mera
 *     responses:
 *       200:
 *         description: Fruta encontrada
 *       404:
 *         description: Fruta no encontrada
 * /api/pokemon:
 *   get:
 *     summary: Lista Pokémon (paginado)
 *     tags: [Pokémon]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de Pokémon
 * /api/pokemon/{query}:
 *   get:
 *     summary: Busca un Pokémon por nombre o número
 *     tags: [Pokémon]
 *     parameters:
 *       - in: path
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *           example: pikachu
 *     responses:
 *       200:
 *         description: Pokémon encontrado
 *       404:
 *         description: Pokémon no encontrado
 */
async function extraRoutes(res, url) {
  const p = url.pathname;
  try {
    if (p === '/api/fruit') {
      responder(res, 200, await fruits.listFruits());
      return true;
    }
    let m = p.match(/^\/api\/fruit\/([^/]+)$/);
    if (m) {
      responder(res, 200, await fruits.getFruit(decodeURIComponent(m[1])));
      return true;
    }

    if (p === '/api/pokemon') {
      responder(res, 200, await pokemon.listPokemon(Object.fromEntries(url.searchParams)));
      return true;
    }
    m = p.match(/^\/api\/pokemon\/([^/]+)$/);
    if (m) {
      responder(res, 200, await pokemon.getPokemon(decodeURIComponent(m[1])));
      return true;
    }
  } catch (e) {
    console.error(e);
    responder(res, e.status || 500, { ok: false, error: e.message });
    return true;
  }
  return false;
}

// ---------- IA (Gemini) ----------

function leerJson(req, max = 20_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > max) {
        reject(Object.assign(new Error('Body demasiado grande'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @openapi
 * /api/ia:
 *   post:
 *     summary: Pregunta a la IA sobre un docente, fruta o Pokémon registrado
 *     description: Solo consulta a Gemini si el prompt menciona algo que existe en las bases de datos.
 *     tags: [IA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt:
 *                 type: string
 *                 example: ¿Qué tipo de Pokémon es pikachu?
 *               proveedor:
 *                 type: string
 *                 enum: [gemini, groq, openrouter]
 *                 default: gemini
 *                 description: Servicio de IA a usar
 *               timeoutMs:
 *                 type: integer
 *                 description: Tiempo máximo de espera en ms (5000 a 160000; por defecto 40000)
 *                 example: 40000
 *     responses:
 *       200:
 *         description: Respuesta (ia=false si no se consultó a Gemini)
 *       400:
 *         description: Prompt inválido
 *       502:
 *         description: Error al consultar el proveedor de IA
 *       503:
 *         description: Proveedor no configurado en el servidor
 *       504:
 *         description: El proveedor no respondió a tiempo
 */
// Datos de lo detectado en el prompt, para los proveedores que no usan services/gemini.js
async function obtenerContexto(coincidencias) {
  const partes = [];
  for (const c of coincidencias.slice(0, 5)) {
    try {
      let datos;
      if (c.tipo === 'pokemon') datos = await pokemon.getPokemon(c.nombre);
      else if (c.tipo === 'fruta') datos = await fruits.getFruit(c.nombre);
      else if (c.tipo === 'docente') datos = await findProfesor(c.nombre);
      if (datos) partes.push({ tipo: c.tipo, nombre: c.nombre, datos });
    } catch (e) {
      console.error('contexto IA', c, e.message);
    }
  }
  return JSON.stringify(partes).slice(0, 12_000);
}

async function ia(req, res) {
  try {
    const { prompt, proveedor = 'gemini', timeoutMs } = await leerJson(req);
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return responder(res, 400, { ok: false, error: 'Falta el campo "prompt"' });
    }
    if (prompt.length > 4000) {
      return responder(res, 400, { ok: false, error: 'El prompt es demasiado largo (máx. 4000 caracteres)' });
    }

    if (typeof proveedor !== 'string' || !proveedoresIa.PROVEEDORES[proveedor]) {
      return responder(res, 400, { ok: false, error: 'Proveedor de IA no válido' });
    }

    const coincidencias = await detectar(prompt);
    if (coincidencias.length === 0) {
      return responder(res, 200, {
        ok: true,
        ia: false,
        coincidencias: [],
        texto: 'Solo puedo responder preguntas sobre docentes, frutas del diablo o Pokémon registrados en la db.',
      });
    }

    const texto = await proveedoresIa.preguntar({
      proveedor,
      prompt: prompt.trim(),
      timeoutMs,
      gemini,
      contexto: proveedor === 'gemini' ? undefined : await obtenerContexto(coincidencias),
    });
    responder(res, 200, { ok: true, ia: true, proveedor, coincidencias, texto });
  } catch (e) {
    console.error(e);
    responder(res, e.status || 500, { ok: false, error: e.message });
  }
}

// ---------- Servidor ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ruta = url.pathname;

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    if (req.method === 'POST' && ruta === '/api/ia') return await ia(req, res);

    if (req.method !== 'GET') {
      return responder(res, 405, { ok: false, error: 'Método no permitido' });
    }

    if (ruta === '/') {
      res.writeHead(302, { Location: '/api-docs' });
      return res.end();
    }

    if (ruta === '/health') return health(res);

    if (ruta === '/openapi.json') return responder(res, 200, spec);

    if (ruta === '/api-docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(DOCS_HTML);
    }

    if (ruta.startsWith('/api-docs/assets/')) {
      return servirAsset(res, ruta.slice('/api-docs/assets/'.length));
    }

    if (ruta.startsWith('/profe/')) return await profe(res, ruta);

    if (await extraRoutes(res, url)) return;

    responder(res, 404, { ok: false, error: 'No encontrado' });
  } catch (err) {
    console.error(err);
    responder(res, 500, { ok: false, error: err.message });
  }
});

// 0.0.0.0 es obligatorio en Railway
server.listen(PORT, '0.0.0.0', () => console.log(`Docentes (consulta) escuchando en puerto ${PORT}`));

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});