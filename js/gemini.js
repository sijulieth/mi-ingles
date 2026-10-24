// Cliente de Gemini (Google AI Studio). Las llamadas van directo desde el teléfono a Google.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class AIError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) { super(message); this.status = status; this.retryable = retryable; }
}

function friendly(status, body) {
  const msg = (body && body.error && body.error.message) || '';
  if (/location is not supported/i.test(msg)) return new AIError('Google no ofrece la API de Gemini en tu ubicación actual.', { status });
  if (status === 400 && /api key/i.test(msg)) return new AIError('La clave de Gemini no es válida. Revísala en Ajustes.', { status });
  if (status === 403) return new AIError('La clave de Gemini no tiene permiso. Revisa las restricciones de la clave en Google AI Studio.', { status });
  if (status === 404) return new AIError('El modelo de Gemini configurado ya no existe. Ve a Ajustes y pulsa "Detectar modelo".', { status });
  if (status === 429) return new AIError('Se alcanzó el límite de uso de Gemini por ahora. Espera un minuto e inténtalo de nuevo.', { status, retryable: true });
  if (status >= 500) return new AIError('Gemini tuvo un problema temporal. Inténtalo de nuevo.', { status, retryable: true });
  return new AIError(`Error de Gemini (${status}). ${msg.slice(0, 140)}`, { status });
}

// Limpia la clave: al copiar en el iPhone se cuelan espacios, saltos o caracteres invisibles.
export const cleanKey = k => String(k || '').replace(/[^A-Za-z0-9_\-]/g, '');

async function call(path, key, body, { signal, method = 'POST' } = {}) {
  key = cleanKey(key);
  if (!key) throw new AIError('Falta la clave de Gemini. Agrégala en Ajustes.');
  if (!navigator.onLine) throw new AIError('Sin conexión a internet. Revisa tu conexión e inténtalo de nuevo.', { retryable: true });
  const opts = { method, signal, body: body ? JSON.stringify(body) : undefined };
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, { ...opts, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key } });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // Segundo intento con la clave en la dirección (formato alternativo que admite Google).
    try {
      const sep = path.includes('?') ? '&' : '?';
      res = await fetch(`${BASE}/${path}${sep}key=${encodeURIComponent(key)}`, { ...opts, headers: body ? { 'Content-Type': 'application/json' } : undefined });
    } catch (e2) {
      if (e2.name === 'AbortError') throw e2;
      throw new AIError(`No se pudo conectar con Gemini (${e2.name}: ${e2.message || 'sin detalle'}). Revisa tu internet y desactiva bloqueadores de contenido o VPN si usas alguno.`, { retryable: true });
    }
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(friendly(res.status, data), { raw: data });
  return data;
}

// Elige el modelo "flash" más reciente que soporte generateContent.
export async function detectModel(key) {
  const data = await call('models?pageSize=200', key, null, { method: 'GET' });
  const models = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .filter(n => /^gemini-[\d.]+-flash/.test(n) && !/(lite|live|tts|image|audio|embedding|robotics|computer|thinking-exp)/.test(n));
  if (!models.length) throw new AIError('No encontré un modelo Gemini Flash disponible para tu clave.');
  const ver = n => parseFloat((n.match(/^gemini-([\d.]+)/) || [])[1] || 0);
  const score = n => ver(n) * 100 - (/preview|exp/.test(n) ? 1 : 0) - (/-\d{2}-\d{4}|\d{3,}$/.test(n) ? 0.5 : 0);
  models.sort((a, b) => score(b) - score(a));
  return { best: models[0], all: models };
}

function thinkingFor(model) {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: 'low' };
  return null;
}

function extractText(data) {
  const cand = data && data.candidates && data.candidates[0];
  if (!cand) {
    const block = data && data.promptFeedback && data.promptFeedback.blockReason;
    throw new AIError(block ? 'Gemini bloqueó la respuesta. Intenta reformular.' : 'Gemini no devolvió respuesta.', { retryable: true });
  }
  const parts = (cand.content && cand.content.parts) || [];
  return parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
}

export function parseJSON(text) {
  if (!text) throw new AIError('Respuesta vacía de Gemini.', { retryable: true });
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
  throw new AIError('No pude interpretar la respuesta de Gemini. Inténtalo de nuevo.', { retryable: true });
}

// Convierte un Blob a base64 (sin prefijo data:).
export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
export const audioPart = (b64, mimeType = 'audio/wav') => ({ inlineData: { mimeType, data: b64 } });

/**
 * Genera JSON. `contents` sigue el formato de Gemini: [{role:'user'|'model', parts:[...]}].
 */
export async function generateJSON({ key, model, system, contents, temperature = 0.7, signal, onUsage }) {
  const base = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: 4096 },
  };
  const thinking = thinkingFor(model);
  const body = thinking ? { ...base, generationConfig: { ...base.generationConfig, thinkingConfig: thinking } } : base;
  let data;
  try {
    data = await call(`models/${encodeURIComponent(model)}:generateContent`, key, body, { signal });
  } catch (e) {
    // Si el modelo no acepta la configuración de razonamiento, reintenta sin ella.
    if (thinking && e.status === 400 && /think/i.test(JSON.stringify(e.raw || ''))) {
      data = await call(`models/${encodeURIComponent(model)}:generateContent`, key, base, { signal });
    } else if (e.retryable && e.status === 429) {
      await new Promise(r => setTimeout(r, 2500));
      data = await call(`models/${encodeURIComponent(model)}:generateContent`, key, body, { signal });
    } else throw e;
  }
  if (onUsage) onUsage(data.usageMetadata || {});
  return parseJSON(extractText(data));
}

export async function testKey(key) {
  const { best } = await detectModel(key);
  return best;
}
