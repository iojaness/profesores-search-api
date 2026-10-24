// Proveedores de IA seleccionables desde la app móvil.
//  - gemini     -> usa tu services/gemini.js existente (sin cambios)
//  - groq       -> API compatible con OpenAI (capa gratuita)
//  - openrouter -> API compatible con OpenAI (modelos gratuitos)
//
// Variables de entorno (Railway) por proveedor nuevo:
//   <X>_API_KEY  (obligatoria)   <X>_API_URL (opcional)   <X>_MODEL (opcional)

const PROVEEDORES = {
  gemini: { label: 'Google Gemini' },
  groq: {
    label: 'Groq',
    keyVar: 'GROQ_API_KEY',
    urlVar: 'GROQ_API_URL',
    modelVar: 'GROQ_MODEL',
    urlDefault: 'https://api.groq.com/openai/v1/chat/completions',
    modelDefault: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    label: 'OpenRouter',
    keyVar: 'OPENROUTER_API_KEY',
    urlVar: 'OPENROUTER_API_URL',
    modelVar: 'OPENROUTER_MODEL',
    urlDefault: 'https://openrouter.ai/api/v1/chat/completions',
    modelDefault: 'openrouter/free',
  },
};

const TIMEOUT_MIN = 5_000;
const TIMEOUT_MAX = 160_000;
const TIMEOUT_DEFAULT = 40_000;
const MARGEN = 3_000; // el backend corta un poco antes que la app para poder responder un JSON limpio

const err = (status, message) => Object.assign(new Error(message), { status });

function normalizarTimeout(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return TIMEOUT_DEFAULT;
  return Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, n));
}

function conTimeout(promesa, ms, etiqueta) {
  let timer;
  const limite = new Promise((_, reject) => {
    timer = setTimeout(() => reject(err(504, `${etiqueta} no respondió en ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(timer));
}

async function chatCompatible(p, { prompt, contexto, ms }) {
  const key = process.env[p.keyVar];
  if (!key) throw err(503, `${p.label} no está configurado en el servidor (falta ${p.keyVar})`);

  const url = process.env[p.urlVar] || p.urlDefault;
  const model = process.env[p.modelVar] || p.modelDefault;

  const system =
    'Eres un asistente que responde en español, de forma clara y breve, usando formato Markdown. ' +
    'Responde con base en los datos del contexto; si lo que se pregunta no está en el contexto, buscalo en internet si tiene que ver con el contexto, si no, di que no puedes suministrar esa información porque no tiene que ver con la informacion disponible en la app.' +
    (contexto ? `\n\nContexto (datos registrados):\n${contexto}` : '');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1024,
      }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detalle = data?.error?.message || data?.error || `HTTP ${res.status}`;
      console.error(`[${p.label}]`, res.status, detalle);
      throw err(res.status === 429 ? 429 : 502, `${p.label}: ${typeof detalle === 'string' ? detalle : 'error al consultar'}`);
    }
    const texto = data?.choices?.[0]?.message?.content?.trim();
    if (!texto) throw err(502, `${p.label} devolvió una respuesta vacía`);
    return texto;
  } catch (e) {
    if (e.name === 'AbortError') throw err(504, `${p.label} no respondió en ${Math.round(ms / 1000)} s`);
    throw e.status ? e : err(502, `No se pudo conectar con ${p.label}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{proveedor: string, prompt: string, contexto?: string, timeoutMs?: number, gemini: {preguntar: Function}}} o
 */
async function preguntar({ proveedor, prompt, contexto, timeoutMs, gemini }) {
  const p = PROVEEDORES[proveedor];
  if (!p) throw err(400, `Proveedor de IA no válido: ${proveedor}`);

  const total = normalizarTimeout(timeoutMs);
  const ms = Math.max(TIMEOUT_MIN, total - MARGEN);

  if (proveedor === 'gemini') return conTimeout(gemini.preguntar(prompt), ms, p.label);
  return chatCompatible(p, { prompt, contexto, ms });
}

module.exports = { PROVEEDORES, preguntar, normalizarTimeout };
