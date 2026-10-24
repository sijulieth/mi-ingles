// Pruebas de la lógica sin navegador: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import { review, newCard, pickReview, levelName, overallLevel, blendLevels, buildPlan, isMastered } from '../js/srs.js';
import { encodeWAV, downsample } from '../js/voice.js';
import { parseJSON } from '../js/gemini.js';
import { pickScenario, pickPersona, MODES, SCENARIOS, PERSONAS } from '../js/curriculum.js';
import { weeklyTasks, levelGuide } from '../js/tutor.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('SRS: "Bien" espacia 1 → 4 → ~10 días', () => {
  let c = newCard({ en: 'It depends on…', es: 'Depende de…' });
  const now = Date.now();
  c = review(c, 2, now); assert.equal(c.interval, 1);
  c = review(c, 2, now); assert.equal(c.interval, 4);
  c = review(c, 2, now); assert.ok(c.interval >= 9 && c.interval <= 11, c.interval);
});
t('SRS: "Otra vez" reinicia y vuelve en minutos', () => {
  let c = review(review(newCard({ en: 'a', es: 'b' }), 2), 2);
  const r = review(c, 0);
  assert.equal(r.interval, 0); assert.equal(r.reps, 0); assert.equal(r.lapses, 1);
  assert.ok(r.due - Date.now() < 15 * 60 * 1000);
});
t('SRS: tarjeta dominada a partir de 21 días', () => {
  let c = newCard({ en: 'x', es: 'y' });
  for (let i = 0; i < 6; i++) c = review(c, 3);
  assert.ok(isMastered(c));
});
t('SRS: el repaso prioriza correcciones', () => {
  const a = { ...newCard({ en: 'a', es: '' }), due: 0 };
  const b = { ...newCard({ en: 'b', es: '', type: 'correction' }), due: 0 };
  assert.equal(pickReview([a, b], 5)[0].en, 'b');
});
t('Niveles: nombres MCER', () => {
  assert.equal(levelName(1.0), 'A1'); assert.equal(levelName(2.7), 'A2+'); assert.equal(levelName(3.1), 'B1'); assert.equal(levelName(4.0), 'B2'); assert.equal(levelName(0.6), 'Pre-A1');
});
t('Niveles: el global lo limita la habilidad más débil', () => {
  const ov = overallLevel({ listening: 4, speaking: 4, pronunciation: 4, grammar: 4, vocabulary: 4, fluency: 2 });
  assert.ok(ov < 3.6, ov);
});
t('Niveles: la evaluación semanal no salta más de 0.5', () => {
  const r = blendLevels({ speaking: 2.0 }, { speaking: 4.5 });
  assert.equal(r.speaking, 2.5);
  const d = blendLevels({ speaking: 3.0 }, { speaking: 2.9 });
  assert.ok(d.speaking >= 2.9 && d.speaking <= 3.0, d.speaking);
});
t('Plan: de A2 a B2 con etapas y tiempo estimado', () => {
  const p = buildPlan({ listening: 2.2, speaking: 2.0, pronunciation: 2.1, grammar: 2.0, vocabulary: 2.2, fluency: 1.9 }, 'B2');
  assert.ok(p.stages.length >= 2); assert.equal(p.stages[p.stages.length - 1].band, 'B2');
  assert.ok(p.estimatedMonths > 6 && p.estimatedMonths < 20, p.estimatedMonths);
});
t('Plan: meta B1 termina en B1', () => {
  const p = buildPlan({ listening: 1.2, speaking: 1.0, pronunciation: 1.0, grammar: 1.0, vocabulary: 1.1, fluency: 1.0 }, 'B1');
  assert.equal(p.stages[p.stages.length - 1].band, 'B1');
});
t('Audio: WAV de 16 kHz con cabecera correcta', async () => {
  const pcm = new Float32Array(48000).map((_, i) => Math.sin(i / 10));
  const down = downsample(pcm, 48000, 16000);
  assert.equal(down.length, 16000);
  const blob = encodeWAV(down, 16000);
  assert.equal(blob.size, 44 + 32000);
  assert.equal(blob.type, 'audio/wav');
});
t('Gemini: interpreta JSON con o sin bloques de código', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('Sure! {"reply":"hi"} hope it helps'), { reply: 'hi' });
});
t('Currículo: escenarios y tutores según nivel', () => {
  for (let i = 0; i < 30; i++) {
    const s = pickScenario(1.2, [], []); assert.ok([1].includes(s.level) || s.level === 0, s.level);
    const p = pickPersona(1.2); assert.ok(p.minLevel <= 1.2);
  }
  assert.ok(SCENARIOS.every(s => s.chunks.length >= 4));
  assert.ok(PERSONAS.some(p => p.accent === 'british'));
});
t('Sesiones: la completa suma 40 min y la corta 5', () => {
  const sum = m => MODES[m].steps.reduce((a, [, x]) => a + x, 0);
  assert.equal(sum(40), 40); assert.equal(sum(20), 20); assert.equal(sum(10), 10); assert.equal(sum(5), 5);
});
t('Evaluación: la mensual agrega una tarea MCER', () => {
  assert.equal(weeklyTasks(2.0, false).length + 1, weeklyTasks(2.0, true).length);
  assert.match(levelGuide(4.2), /B2/);
});
console.log(`\n${n} pruebas pasaron`);
