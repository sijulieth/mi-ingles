// Audio: grabación del micrófono (WAV 16 kHz) y voz del tutor (ElevenLabs con respaldo en la voz del iPhone).
import { db } from './db.js';

/* ---------------- Grabación ---------------- */
let ctx = null;
let stream = null;

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export class MicError extends Error {}

export async function ensureMic() {
  if (stream && stream.getAudioTracks().some(t => t.readyState === 'live')) return stream;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new MicError('Este navegador no permite usar el micrófono. Abre la app desde Safari (o instalada en tu pantalla de inicio) con https.');
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    return stream;
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
      throw new MicError('No tengo permiso para usar el micrófono. En el iPhone ve a Ajustes › Safari › Micrófono (o toca "aA" en la barra de Safari › Ajustes del sitio) y permite el acceso. Luego vuelve a intentarlo.');
    }
    if (e.name === 'NotFoundError') throw new MicError('No se encontró ningún micrófono.');
    throw new MicError('No se pudo iniciar el micrófono: ' + (e.message || e.name));
  }
}

export function releaseMic() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

export class Recorder {
  constructor({ maxSeconds = 90, onLevel = null, onAutoStop = null } = {}) {
    this.maxSeconds = maxSeconds; this.onLevel = onLevel; this.onAutoStop = onAutoStop;
    this.chunks = []; this.recording = false;
  }
  async start() {
    const s = await ensureMic();
    const c = audioCtx();
    if (c.state !== 'running') await c.resume();
    this.rate = c.sampleRate;
    this.chunks = [];
    this.source = c.createMediaStreamSource(s);
    this.proc = c.createScriptProcessor(4096, 1, 1);
    this.proc.onaudioprocess = e => {
      if (!this.recording) return;
      const d = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(d));
      if (this.onLevel) {
        let sum = 0; for (let i = 0; i < d.length; i += 16) sum += d[i] * d[i];
        this.onLevel(Math.min(1, Math.sqrt(sum / (d.length / 16)) * 6));
      }
    };
    this.source.connect(this.proc);
    this.proc.connect(c.destination);
    this.recording = true;
    this.startedAt = performance.now();
    this.timer = setTimeout(() => { if (this.recording && this.onAutoStop) this.onAutoStop(); }, this.maxSeconds * 1000);
  }
  stop() {
    this.recording = false;
    clearTimeout(this.timer);
    try { this.source && this.source.disconnect(); this.proc && this.proc.disconnect(); } catch {}
    const seconds = (performance.now() - this.startedAt) / 1000;
    const pcm = merge(this.chunks);
    const down = downsample(pcm, this.rate, 16000);
    const peak = down.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    return { blob: encodeWAV(down, 16000), seconds, silent: peak < 0.02 || seconds < 0.6 };
  }
  cancel() { this.recording = false; clearTimeout(this.timer); try { this.source.disconnect(); this.proc.disconnect(); } catch {} }
}

function merge(chunks) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
export function downsample(buf, from, to) {
  if (to >= from) return buf;
  const ratio = from / to; const len = Math.floor(buf.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.floor(i * ratio), e = Math.min(buf.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = s; j < e; j++) sum += buf[j];
    out[i] = sum / Math.max(1, e - s);
  }
  return out;
}
export function encodeWAV(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([v], { type: 'audio/wav' });
}

/* ---------------- Voz del tutor ---------------- */
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
const EL_BASE = 'https://api.elevenlabs.io/v1';
let audioEl = null;
let unlocked = false;
const cache = new Map();
let cfg = () => ({});
let onNotice = () => {};
let currentStop = null;

export function configureVoice(getSettings, notice) { cfg = getSettings; onNotice = notice || onNotice; }

// iOS exige un toque del usuario antes de reproducir audio: llamar en el primer toque.
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try {
    audioEl = audioEl || new Audio();
    audioEl.setAttribute('playsinline', '');
    audioEl.src = SILENT;
    audioEl.play().catch(() => {});
  } catch {}
  try { audioCtx().resume(); } catch {}
  try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch {}
}

export function stopSpeaking() {
  if (currentStop) { currentStop(); currentStop = null; }
}

async function monthUsage() {
  const month = new Date().toISOString().slice(0, 7);
  const u = await db.getKV('usage', {});
  if (u.month !== month) return { month, elevenChars: 0, geminiCalls: 0, fallbacks: 0 };
  return { elevenChars: 0, geminiCalls: 0, fallbacks: 0, ...u };
}
export async function addUsage(patch) {
  const u = await monthUsage();
  for (const [k, v] of Object.entries(patch)) u[k] = (u[k] || 0) + v;
  await db.setKV('usage', u);
  return u;
}
export const getUsage = monthUsage;

/**
 * Habla un texto en inglés. opts: { voice: 'tutor'|'alt', accent, speed, cheap }
 * cheap = usar la voz del iPhone para ahorrar créditos (repasos cortos).
 */
export async function speak(text, opts = {}) {
  stopSpeaking();
  text = String(text || '').trim();
  if (!text) return;
  const s = cfg();
  const speed = clamp((opts.speed ?? 1) * (s.ttsSpeed || 1), 0.7, 1.2);
  const useEleven = s.elevenKey && s.useEleven !== false && !opts.cheap;
  if (useEleven) {
    const u = await monthUsage();
    const cap = Number(s.elevenMonthlyCap) || 0;
    if (cap && u.elevenChars + text.length > cap) {
      if (!speak._capWarned) { onNotice('Llegaste al tope mensual de ElevenLabs que configuraste. Uso la voz del iPhone.'); speak._capWarned = true; }
    } else {
      const voiceId = pickElevenVoice(s, opts);
      if (voiceId) {
        try { return await playEleven(text, voiceId, speed, s.elevenKey); }
        catch (e) {
          await addUsage({ fallbacks: 1 });
          if (!speak._failWarned) { onNotice(e.message + ' Uso la voz del iPhone por ahora.'); speak._failWarned = true; }
        }
      }
    }
  }
  return speakSystem(text, { speed, accent: opts.accent });
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function pickElevenVoice(s, opts) {
  if (opts.voice === 'alt' && s.elevenAltVoiceId) return s.elevenAltVoiceId;
  const map = s.elevenVoicesByAccent || {};
  // La voz elegida por la estudiante manda para el tutor principal (acento americano).
  if (opts.accent && opts.accent !== 'american' && s.autoAccents !== false) {
    const k = `${opts.accent}-${opts.gender || 'female'}`;
    const alt = `${opts.accent}-${opts.gender === 'male' ? 'female' : 'male'}`;
    if (map[k] || map[alt]) return map[k] || map[alt];
  }
  if (opts.voice === 'male' && map['american-male']) return map['american-male'];
  return s.elevenVoiceId;
}

async function playEleven(text, voiceId, speed, key) {
  const ck = `${voiceId}|${speed}|${text}`;
  let url = cache.get(ck);
  if (!url) {
    if (!navigator.onLine) throw new Error('Sin conexión.');
    let res;
    try {
      res = await fetch(`${EL_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75, speed } }),
      });
    } catch { throw new Error('No se pudo conectar con ElevenLabs.'); }
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = (j.detail && (j.detail.message || j.detail.status)) || ''; } catch {}
      if (res.status === 401) throw new Error('La clave de ElevenLabs no es válida o no tiene permiso de "Text to Speech".');
      if (res.status === 429 || /quota|credits/i.test(detail)) throw new Error('ElevenLabs: sin créditos o límite alcanzado.');
      throw new Error(`ElevenLabs respondió con un error (${res.status}).`);
    }
    const blob = await res.blob();
    url = URL.createObjectURL(blob);
    cache.set(ck, url);
    if (cache.size > 120) { const first = cache.keys().next().value; URL.revokeObjectURL(cache.get(first)); cache.delete(first); }
    await addUsage({ elevenChars: text.length });
  }
  return playUrl(url);
}

function playUrl(url) {
  return new Promise((resolve) => {
    audioEl = audioEl || new Audio();
    audioEl.setAttribute('playsinline', '');
    audioEl.preservesPitch = true;
    audioEl.playbackRate = 1;
    audioEl.src = url;
    let done = false;
    const finish = () => { if (done) return; done = true; audioEl.onended = audioEl.onerror = null; currentStop = null; resolve(); };
    audioEl.onended = finish;
    audioEl.onerror = finish;
    currentStop = () => { try { audioEl.pause(); } catch {} finish(); };
    audioEl.play().catch(() => {
      // Si iOS bloquea la reproducción, no dejamos la app colgada.
      onNotice('Toca la pantalla una vez para permitir el audio y vuelve a pulsar "Repetir".');
      finish();
    });
  });
}

let sysVoices = [];
function loadSysVoices() { try { sysVoices = speechSynthesis.getVoices() || []; } catch {} }
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadSysVoices();
  speechSynthesis.onvoiceschanged = loadSysVoices;
}
function bestSystemVoice(accent) {
  const lang = { british: 'en-GB', australian: 'en-AU' }[accent] || 'en-US';
  const cand = sysVoices.filter(v => v.lang && v.lang.replace('_', '-').startsWith(lang));
  const pool = cand.length ? cand : sysVoices.filter(v => v.lang && v.lang.startsWith('en'));
  const rank = v => (/(premium|enhanced|mejorada)/i.test(v.name) ? 3 : 0) + (/(samantha|ava|zoe|daniel|karen|evan)/i.test(v.name) ? 1 : 0) + (v.localService ? 0.5 : 0);
  return pool.sort((a, b) => rank(b) - rank(a))[0] || null;
}

export function speakSystem(text, { speed = 1, accent } = {}) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = bestSystemVoice(accent);
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'en-US';
    u.rate = clamp(speed * 0.95, 0.6, 1.2);
    let done = false;
    const finish = () => { if (done) return; done = true; currentStop = null; resolve(); };
    u.onend = finish; u.onerror = finish;
    currentStop = () => { speechSynthesis.cancel(); finish(); };
    speechSynthesis.speak(u);
    // Salvavidas: algunos iPhone no disparan onend.
    setTimeout(finish, 2000 + text.length * 120 / u.rate);
  });
}

/* ---------------- Cuenta de ElevenLabs ---------------- */
export async function elevenVoices(key) {
  const res = await fetch(`${EL_BASE}/voices`, { headers: { 'xi-api-key': key } });
  if (res.status === 401) throw new Error('La clave de ElevenLabs no es válida o no tiene permiso para leer voces ("Voices: read").');
  if (!res.ok) throw new Error(`No pude leer tus voces de ElevenLabs (${res.status}).`);
  const data = await res.json();
  return (data.voices || []).map(v => ({
    id: v.voice_id, name: v.name,
    accent: String((v.labels && v.labels.accent) || '').toLowerCase(),
    gender: String((v.labels && v.labels.gender) || '').toLowerCase(),
    category: v.category, preview: v.preview_url,
  }));
}

export async function elevenSubscription(key) {
  try {
    const res = await fetch(`${EL_BASE}/user/subscription`, { headers: { 'xi-api-key': key } });
    if (!res.ok) return null;
    const d = await res.json();
    return { used: d.character_count, limit: d.character_limit, resetAt: d.next_character_count_reset_unix ? d.next_character_count_reset_unix * 1000 : null, tier: d.tier };
  } catch { return null; }
}

// Asigna automáticamente voces por acento para los distintos tutores.
export function mapVoicesByAccent(voices) {
  const out = {};
  for (const accent of ['american', 'british', 'australian']) {
    for (const gender of ['female', 'male']) {
      const v = voices.find(x => x.accent.includes(accent) && x.gender === gender);
      if (v) out[`${accent}-${gender}`] = v.id;
    }
  }
  return out;
}
