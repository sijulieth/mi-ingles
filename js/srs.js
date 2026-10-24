// Repetición espaciada (variante simple de SM-2) y utilidades de nivel MCER.
import { uid, todayStr } from './db.js';

const DAY = 86400000;

export function newCard({ en, es, example = '', type = 'chunk', source = '', wrong = '' }) {
  return {
    id: uid(), en: en.trim(), es: (es || '').trim(), example, type, source, wrong,
    ease: 2.4, interval: 0, reps: 0, lapses: 0,
    due: Date.now(), createdAt: Date.now(), lastReview: null, usedSpontaneously: 0,
  };
}

// grade: 0 = otra vez, 1 = difícil, 2 = bien, 3 = fácil
export function review(card, grade, now = Date.now()) {
  const c = { ...card, lastReview: now };
  if (grade === 0) {
    c.lapses += 1; c.reps = 0; c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * 60 * 1000; // vuelve en esta misma sesión o la próxima
    return c;
  }
  c.reps += 1;
  if (grade === 1) c.ease = Math.max(1.3, c.ease - 0.15);
  if (grade === 3) c.ease = Math.min(3.0, c.ease + 0.15);
  let next;
  if (c.reps === 1) next = grade === 3 ? 3 : 1;
  else if (c.reps === 2) next = grade === 1 ? 2 : grade === 3 ? 7 : 4;
  else next = Math.round(Math.max(1, c.interval) * (grade === 1 ? 1.2 : c.ease) * (grade === 3 ? 1.3 : 1));
  c.interval = Math.min(next, 180);
  c.due = startOfDay(now) + c.interval * DAY + 4 * 3600 * 1000;
  return c;
}

export const isDue = (card, now = Date.now()) => card.due <= now;
export const isMastered = card => card.interval >= 21;
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

export function pickReview(cards, max, now = Date.now()) {
  const due = cards.filter(c => isDue(c, now)).sort((a, b) => a.due - b.due);
  // Prioriza correcciones de errores y tarjetas falladas.
  due.sort((a, b) => (b.type === 'correction') - (a.type === 'correction') || b.lapses - a.lapses);
  return due.slice(0, max);
}

/* ---------- Niveles MCER ----------
   Escala numérica: 1.0 = A1, 2.0 = A2, 3.0 = B1, 4.0 = B2, 5.0 = C1.
   2.5 significa "A2 consolidado, camino a B1". */
export const SKILLS = [
  ['listening', 'Comprensión auditiva'],
  ['speaking', 'Conversación'],
  ['pronunciation', 'Pronunciación'],
  ['grammar', 'Gramática funcional'],
  ['vocabulary', 'Vocabulario'],
  ['fluency', 'Fluidez'],
];
const NAMES = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1'];

export function levelName(n) {
  if (n == null || isNaN(n)) return '—';
  const v = Math.max(0.5, Math.min(5.2, n));
  const base = Math.floor(v);
  const frac = v - base;
  const name = NAMES[Math.max(0, Math.min(5, base))];
  if (base < 1) return 'Pre-A1';
  return frac >= 0.6 ? `${name}+` : name;
}
export const levelBand = n => NAMES[Math.max(1, Math.min(5, Math.floor(n || 1)))];
export const overallLevel = levels => {
  if (!levels) return null;
  const vals = SKILLS.map(([k]) => levels[k]).filter(v => typeof v === 'number');
  if (!vals.length) return null;
  // El nivel global lo limita la habilidad más débil (exige evidencia en todas).
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals);
  return Math.round((avg * 0.6 + min * 0.4) * 10) / 10;
};

// Actualiza niveles con evidencia de una evaluación, limitando el salto por semana.
export function blendLevels(prev, evidence, maxStep = 0.5) {
  const out = { ...(prev || {}) };
  for (const [k] of SKILLS) {
    const e = Number(evidence?.[k]);
    if (!isFinite(e)) continue;
    const p = typeof out[k] === 'number' ? out[k] : e;
    let next = p * 0.4 + e * 0.6;
    next = Math.max(p - maxStep, Math.min(p + maxStep, next));
    out[k] = Math.round(next * 10) / 10;
  }
  return out;
}

// Plan anual orientativo desde el nivel actual hasta la meta.
export function buildPlan(levels, goal = 'B2', startDate = new Date()) {
  const cur = overallLevel(levels) ?? 1.5;
  const goalN = { A2: 2, B1: 3, B2: 4 }[goal] || 4;
  const target = goalN + 0.6; // "meta+" para llegar con margen
  // Meses estimados por banda, con 40 min diarios (~20 h/mes).
  const monthsPerBand = { 0: 1.5, 1: 2.5, 2: 3.5, 3: 4.5, 4: 5 };
  const stages = [];
  let lvl = cur, month = 0;
  const focus = {
    1: 'Fundamentos: presentarte, rutinas, pedir cosas, sonidos básicos y expresiones cotidianas.',
    2: 'Conversaciones cotidianas: compras, citas, contar lo que hiciste, describir personas y lugares.',
    3: 'Independencia: narrar experiencias, dar opiniones, resolver imprevistos, entender distintos hablantes.',
    4: 'Fluidez B2: argumentar, explicar con detalle, debatir, matices y expresiones idiomáticas.',
  };
  while (lvl < target && stages.length < 6) {
    const band = Math.max(1, Math.min(4, Math.floor(lvl)));
    const end = Math.min(target, band + 1);
    const span = (end - lvl) * (monthsPerBand[band] || 4);
    stages.push({
      band: NAMES[band], from: Math.round(month * 10) / 10, to: Math.round((month + span) * 10) / 10,
      focus: focus[band],
      milestone: band < 4 ? `Evidencia oral de ${NAMES[band + 1]} en la evaluación mensual` : 'Simulación de tareas orales B2 aprobada',
    });
    month += span; lvl = end;
  }
  return {
    goal, createdAt: Date.now(), startLevel: cur,
    estimatedMonths: Math.round(month * 10) / 10,
    fitsInYear: month <= 12.5,
    stages,
    startDate: todayStr(startDate),
  };
}
