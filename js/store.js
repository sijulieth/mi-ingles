// Estado de la app, acceso a datos y navegación.
import { db, uid, todayStr } from './db.js';
import { newCard, overallLevel } from './srs.js';

export const DEFAULT_SETTINGS = {
  geminiKey: '', geminiModel: '',
  elevenKey: '', useEleven: true, elevenVoiceId: '', elevenVoiceName: '', elevenAltVoiceId: '',
  elevenVoicesByAccent: {}, autoAccents: true, elevenMonthlyCap: 120000,
  ttsSpeed: 1, showTranscript: true, theme: 'auto', weeklyTarget: 5,
};

export const S = { settings: { ...DEFAULT_SETTINGS }, profile: null, cards: [], errors: [], sessions: [], evals: [] };

export async function loadAll() {
  S.settings = { ...DEFAULT_SETTINGS, ...(await db.getKV('settings', {})) };
  S.profile = await db.getKV('profile', null);
  S.cards = await db.all('cards');
  S.errors = await db.all('errors');
  S.sessions = (await db.all('sessions')).sort((a, b) => a.startedAt - b.startedAt);
  S.evals = (await db.all('evals')).sort((a, b) => a.createdAt - b.createdAt);
  applyTheme();
}

export async function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await db.setKV('settings', S.settings);
  applyTheme();
}
export async function saveProfile(patch) {
  S.profile = { ...(S.profile || {}), ...patch };
  await db.setKV('profile', S.profile);
}

export function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

export const level = () => overallLevel(S.profile?.levels) ?? 1.5;
export const aiReady = () => !!(S.settings.geminiKey && S.settings.geminiModel);

/* ---------- Tarjetas y errores ---------- */
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9' ]/g, '').trim();

export async function addCards(items, source = '') {
  const existing = new Set(S.cards.map(c => norm(c.en)));
  const fresh = [];
  for (const it of items) {
    if (!it || !it.en || existing.has(norm(it.en))) continue;
    existing.add(norm(it.en));
    fresh.push(newCard({ ...it, source }));
  }
  if (fresh.length) { await db.putMany('cards', fresh); S.cards.push(...fresh); }
  return fresh;
}
export async function updateCard(card) {
  await db.put('cards', card);
  const i = S.cards.findIndex(c => c.id === card.id);
  if (i >= 0) S.cards[i] = card; else S.cards.push(card);
}
export async function deleteCard(id) { await db.del('cards', id); S.cards = S.cards.filter(c => c.id !== id); }

export async function markChunksUsed(list) {
  const set = new Set((list || []).map(norm));
  for (const c of S.cards) {
    if (set.has(norm(c.en))) { await updateCard({ ...c, usedSpontaneously: (c.usedSpontaneously || 0) + 1 }); }
  }
}

// Registra errores, agrupando por patrón para detectar los recurrentes.
export async function recordErrors(list, { makeCards = true } = {}) {
  const newCardsItems = [];
  for (const e of list || []) {
    if (!e || !e.corrected) continue;
    const key = norm(e.pattern || e.corrected);
    let rec = S.errors.find(x => norm(x.pattern || x.corrected) === key);
    if (rec) {
      rec = { ...rec, count: rec.count + 1, lastSeen: Date.now(), original: e.original || rec.original, corrected: e.corrected, natural: e.natural || rec.natural, explanation: e.explanation_es || rec.explanation };
      S.errors = S.errors.map(x => x.id === rec.id ? rec : x);
    } else {
      rec = { id: uid(), pattern: e.pattern || '', category: e.category || e.type || 'grammar', original: e.original || '', corrected: e.corrected, natural: e.natural || '', explanation: e.explanation_es || '', count: 1, firstSeen: Date.now(), lastSeen: Date.now() };
      S.errors.push(rec);
    }
    await db.put('errors', rec);
    if (makeCards) newCardsItems.push({ en: e.natural || e.corrected, es: e.explanation_es || 'Versión correcta', wrong: e.original || '', type: 'correction' });
  }
  if (newCardsItems.length) await addCards(newCardsItems, 'correction');
}
export async function deleteError(id) { await db.del('errors', id); S.errors = S.errors.filter(e => e.id !== id); }
export const topErrors = (n = 6) => [...S.errors].sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen).slice(0, n);

/* ---------- Sesiones y evaluaciones ---------- */
export async function saveSession(sess) {
  await db.put('sessions', sess);
  const i = S.sessions.findIndex(s => s.id === sess.id);
  if (i >= 0) S.sessions[i] = sess; else S.sessions.push(sess);
}
export async function saveEval(ev) {
  await db.put('evals', ev);
  S.evals = S.evals.filter(e => e.id !== ev.id).concat(ev).sort((a, b) => a.createdAt - b.createdAt);
}

export function minutesByDay() {
  const m = {};
  for (const s of S.sessions) m[s.date] = (m[s.date] || 0) + (s.activeMinutes || 0);
  return m;
}
export function weekInfo(ref = new Date()) {
  const d = new Date(ref); const dow = (d.getDay() + 6) % 7; // lunes = 0
  const monday = new Date(d); monday.setDate(d.getDate() - dow); monday.setHours(0, 0, 0, 0);
  const byDay = minutesByDay();
  const days = [...Array(7)].map((_, i) => {
    const x = new Date(monday); x.setDate(monday.getDate() + i);
    const key = todayStr(x);
    return { key, label: 'LMMJVSD'[i], minutes: byDay[key] || 0, today: key === todayStr() };
  });
  return { days, practiced: days.filter(x => x.minutes >= 3).length, minutes: days.reduce((a, b) => a + b.minutes, 0) };
}
export const totalMinutes = () => Math.round(S.sessions.reduce((a, s) => a + (s.activeMinutes || 0), 0));
export const practiceDays = () => new Set(S.sessions.filter(s => (s.activeMinutes || 0) >= 3).map(s => s.date)).size;

export function lastEval() { return S.evals[S.evals.length - 1] || null; }
export function weeklyDue() {
  const last = lastEval();
  if (!last) return false;
  const days = (Date.now() - last.createdAt) / 86400000;
  const since = S.sessions.filter(s => s.startedAt > last.createdAt && (s.activeMinutes || 0) >= 3).length;
  return days >= 7 && since >= 3;
}
export const weeklyCount = () => S.evals.filter(e => e.type === 'weekly').length;

/* ---------- Navegación ---------- */
const routes = {};
export function register(name, fn) { routes[name] = fn; }
let current = null;
export async function go(name, params = {}) {
  if (current && current.cleanup) { try { current.cleanup(); } catch {} }
  current = { name };
  const r = routes[name];
  if (!r) throw new Error('Pantalla desconocida: ' + name);
  const cleanup = await r(params);
  if (typeof cleanup === 'function') current.cleanup = cleanup;
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => go(b.dataset.nav)));
}
export const currentRoute = () => current && current.name;
