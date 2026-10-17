const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function preguntar(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('Falta GEMINI_API_KEY en el servidor');
    err.status = 500;
    throw err;
  }

  const r = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error?.message || 'Error al consultar Gemini');
    err.status = r.status === 429 ? 429 : 502;
    throw err;
  }

  const texto = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();

  if (!texto) {
    const err = new Error('Gemini no devolvió texto (posible bloqueo de contenido)');
    err.status = 502;
    throw err;
  }
  return texto;
}

module.exports = { preguntar };