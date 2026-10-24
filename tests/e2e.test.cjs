// Prueba de flujo completo en un navegador móvil simulado, con Gemini y ElevenLabs simulados.
// Uso: node tests/e2e.test.cjs  (requiere playwright y un servidor en http://localhost:8765)
const { chromium, devices } = require(process.env.PW || 'playwright');
const assert = require('assert');

const SILENT_WAV = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', 'base64');
const calls = { gemini: [], eleven: 0 };
let lastVoiceUrl = '';

function geminiReply(body) {
  const sys = (body.systemInstruction && body.systemInstruction.parts[0].text) || '';
  const all = JSON.stringify(body.contents);
  const hasAudio = all.includes('inlineData');
  if (sys.includes('certified CEFR oral examiner') && all.includes('Speaking task')) {
    return { levels: { listening: 2.4, speaking: 2.0, pronunciation: 2.1, grammar: 1.9, vocabulary: 2.2, fluency: 1.8 }, transcripts: ['Hello my name is Ana', '', '', ''], strengths_es: ['Buena comprensión'], priorities_es: ['Pasado simple', 'Fluidez', 'Sonido th'], errors: [{ original: 'I have 30 years', corrected: 'I am 30 years old', explanation_es: 'La edad se dice con "to be".', pattern: 'age with to be' }], pron_problem_ids: ['th'], summary_es: 'Tu nivel estimado es A2. Es una estimación de la IA.' };
  }
  if (sys.includes('certified CEFR oral examiner')) {
    return { levels: { listening: 2.8, speaking: 2.5, pronunciation: 2.3, grammar: 2.2, vocabulary: 2.5, fluency: 2.2 }, transcripts: [], progress_es: 'Mejoraste en conversación.', evidence_es: ['Usaste el pasado correctamente.'], next_week_goal_es: 'Usar "It depends on…" en tres conversaciones.', errors: [] };
  }
  if (sys.includes('AI English conversation partner')) {
    if (all.includes('Start the conversation now')) return { transcript: '', reply: 'Hi Ana! I’m Emma. How was your weekend?', correction: null, help_es: '' };
    return { transcript: hasAudio ? 'Yesterday I go to the park with my family.' : 'typed', reply: 'Oh nice, you went to the park! What did you do there?', correction: { original: 'Yesterday I go', corrected: 'Yesterday I went', natural: 'Yesterday I went to the park', explanation_es: 'Con "yesterday" usamos pasado.', type: 'grammar' }, help_es: '', unclear: false };
  }
  if (sys.includes('listening dialogues')) {
    return { title: 'En el parque', context_es: 'Dos amigos hablan.', lines: [{ speaker: 'A', name: 'Kate', text: 'Hey, how was your weekend?' }, { speaker: 'B', name: 'Tom', text: 'Great, we went hiking.' }], gist: { q: '¿De qué hablan?', options: ['Del fin de semana', 'Del trabajo', 'De comida'], answer: 0 }, details: [{ q: '¿Qué hizo Tom?', options: ['Cocinar', 'Caminata', 'Dormir'], answer: 1 }], chunks: [{ en: 'How was your weekend?', es: '¿Qué tal tu fin de semana?' }] };
  }
  if (sys.includes('analysing a Spanish-speaking')) {
    return { top_errors: [{ original: 'Yesterday I go', corrected: 'Yesterday I went', natural: 'Yesterday I went to the park', explanation_es: 'Pasado con yesterday.', category: 'grammar', pattern: 'past simple after yesterday' }], chunks: [{ en: 'We had a great time.', es: 'La pasamos muy bien.' }], used_chunks: [], scores: { speaking: 3, grammar: 2, vocabulary: 3, fluency: 3, interaction: 4 }, level_evidence: { speaking: 2.2 }, summary_es: 'Muy bien: hablaste con confianza.', exit_challenge: { prompt_en: 'What did you do last Sunday?', prompt_es: '¿Qué hiciste el domingo?', target: 'went' } };
  }
  if (sys.includes('pronunciation coach')) return { heard: 'I think they are both there', score: 78, intelligibility: 'alta', tips_es: ['Saca la lengua en "think".'], problem_ids: ['th'], praise_es: '¡Bien!' };
  if (sys.includes('target sentence')) return { heard: 'Yesterday I went to the park', ok: true, feedback_es: 'Perfecto.' };
  if (sys.includes('evaluate a short spoken answer')) return { transcript: 'I went to the park', task_completed: true, used_target: true, score: 4, feedback_es: 'Muy bien.', better_version: 'Last Sunday I went to the park with my girls.' };
  return { reply: 'ok' };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ ...devices['iPhone 13'], permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await context.route('https://generativelanguage.googleapis.com/**', async route => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: { models: [{ name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.1-flash-live-preview', supportedGenerationMethods: ['bidiGenerateContent'] }] } });
    const body = JSON.parse(req.postData());
    assert.equal(req.headers()['x-goog-api-key'], 'AIzaTEST');
    calls.gemini.push(body);
    route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(geminiReply(body)) }] } }], usageMetadata: {} } });
  });
  await context.route('https://api.elevenlabs.io/**', async route => {
    const url = route.request().url();
    if (url.includes('/voices')) return route.fulfill({ json: { voices: [{ voice_id: 'v1', name: 'Rachel', labels: { accent: 'american', gender: 'female' } }, { voice_id: 'v2', name: 'George', labels: { accent: 'british', gender: 'male' } }, { voice_id: 'v3', name: 'Adam', labels: { accent: 'american', gender: 'male' } }] } });
    if (url.includes('/user/subscription')) return route.fulfill({ json: { character_count: 1200, character_limit: 121000, tier: 'creator' } });
    calls.eleven++; lastVoiceUrl = url;
    assert.equal(route.request().headers()['xi-api-key'], 'sk_TEST');
    route.fulfill({ body: SILENT_WAV, contentType: 'audio/mpeg' });
  });

  const step = async (name, fn) => { await fn(); console.log('✓', name); };
  const click = sel => page.locator(sel).first().click();
  const record = async () => { await click('#mic'); await page.waitForTimeout(1300); await click('#mic'); };

  await page.goto('http://localhost:8765/');
  await step('Bienvenida y consentimiento', async () => {
    await page.getByText('Tu inglés, todos los días').first().waitFor();
    await click('#go');
    await click('#ok'); await click('#go');
  });
  await step('Perfil', async () => {
    await page.fill('#name', 'Ana');
    await click('[data-k="familia"]'); await click('[data-k="viajes"]');
    await click('#go');
  });
  await step('Clave de Gemini y detección de modelo', async () => {
    await page.fill('#k', 'AIzaTEST'); await click('#go');
    await page.getByText('La voz del tutor').first().waitFor();
  });
  await step('ElevenLabs: cargar voces y elegir', async () => {
    await page.fill('#k', 'sk_TEST'); await page.fill('#vid', 'v1'); await page.fill('#vides', 'es77');
    await click('#testEs'); await page.getByText('La voz funciona').first().waitFor();
    assert.ok(lastVoiceUrl.includes('/text-to-speech/es77'));
    await click('#test'); await page.getByText('La voz funciona').first().waitFor();
    await click('#load'); await page.getByText('Tus voces').first().waitFor();
    await click('[data-pick="v1"]'); assert.equal(await page.inputValue('#vid'), 'v1');
    await click('#go');
  });
  await step('Prueba de micrófono (permiso y grabación)', async () => {
    await page.getByText('Probemos tu micrófono').first().waitFor();
    await record();
    await page.locator('audio').waitFor();
    await click('#go');
  });
  await step('Diagnóstico: escucha + habla', async () => {
    await click('#go');
    for (let i = 0; i < 4; i++) { await page.locator('.opt').first().waitFor(); await page.locator('.opt').nth(1).click(); }
    for (let i = 0; i < 4; i++) {
      await page.locator('#mic').waitFor();
      if (i < 2) await record(); else await click('#skip');
      await page.waitForTimeout(200);
    }
    await page.getByText('Nivel estimado').first().waitFor({ timeout: 10000 });
    const txt = await page.textContent('main');
    assert.ok(txt.includes('A2'), 'debería mostrar A2');
    assert.ok(txt.includes('Tu plan hacia B2'));
    await click('#go');
  });
  await step('Inicio muestra nivel y repasos', async () => {
    await page.getByText('Comenzar mi práctica').first().waitFor();
    assert.ok((await page.textContent('main')).includes('A2'));
  });

  await step('Sesión completa de 40 min: repaso', async () => {
    await click('#start');
    await page.getByText('Ver respuesta').first().waitFor();
    await click('#reveal'); await click('[data-g="2"]');
    await click('#reveal'); await click('[data-g="0"]');
    await click('#skipAll');
    await click('#nextStep');
  });
  await step('Comprensión auditiva con preguntas', async () => {
    await page.getByText('En el parque').first().waitFor();
    await click('#play');
    await page.locator('#quiz .opt').first().waitFor({ timeout: 15000 });
    await page.locator('#quiz .opt').nth(0).click();
    await page.getByText('Ahora los detalles').first().waitFor();
    await page.locator('#quiz .opt').nth(1).click();
    await page.getByText('Con apoyo de texto').first().waitFor();
    await click('#nextStep');
  });
  await step('Conversación por voz con corrección', async () => {
    await page.locator('.msg.tutor').first().waitFor();
    await page.waitForFunction(() => !document.getElementById('mic').disabled && document.getElementById('mic-state').textContent.includes('Toca'), null, { timeout: 15000 });
    await record();
    await page.locator('.msg.me').first().waitFor();
    await page.locator('.fix').first().waitFor();
    assert.ok((await page.textContent('.fix')).includes('went'));
    await page.locator('.fix [data-es]').first().click(); await page.waitForTimeout(300);
    assert.ok(lastVoiceUrl.includes('/text-to-speech/es77'), 'la explicación usa la voz en español');
    await page.locator('.msg.tutor').nth(1).waitFor();
  });
  await step('Recuperar sesión tras cerrar la app', async () => {
    page.once('dialog', d => d.accept());
    await click('#close');
    await page.getByText('Continuar sesión de hoy').first().waitFor();
    await page.reload();
    await page.getByText('Continuar sesión de hoy').first().waitFor();
    await click('#resume');
    await page.locator('.msg.me').first().waitFor();
    const n = await page.locator('.msg').count();
    assert.ok(n >= 3, 'la conversación se restauró');
    await page.locator('#endConvo').evaluate(el => el.classList.remove('hidden'));
    await click('#endConvo');
  });
  await step('Pronunciación (shadowing con puntaje)', async () => {
    await page.getByText('Pronunciación · shadowing').first().waitFor();
    await page.waitForFunction(() => !document.getElementById('mic').disabled);
    await record();
    await page.getByText('/100').first().waitFor();
    await click('#nxt'); await click('#skipP'); await click('#skipP');
    await click('#nextStep');
  });
  await step('Corrección y consolidación', async () => {
    await page.getByText('Muy bien: hablaste con confianza.').first().waitFor();
    await click('#start');
    await page.waitForFunction(() => !document.getElementById('mic').disabled);
    await record();
    await page.getByText('¡Muy bien!').first().waitFor();
    await click('#nxtE');
    await page.getByText('Expresiones nuevas de hoy').first().waitFor();
    await click('#nextStep');
  });
  await step('Reto final y resumen', async () => {
    await page.getByText('What did you do last Sunday?').first().waitFor();
    await page.waitForFunction(() => !document.getElementById('mic').disabled);
    await record();
    await page.getByText('Terminar sesión').first().waitFor();
    await click('#nextStep');
    await page.getByText('¡Sesión completada!').first().waitFor();
    await click('#home');
  });
  await step('Progreso, calendario y errores', async () => {
    await click('[data-nav="progress"]');
    await page.getByText('Nivel por habilidad').first().waitFor();
    const txt = await page.textContent('main');
    assert.ok(txt.includes('past simple after yesterday') || txt.includes('Yesterday I went'), 'error recurrente visible');
  });
  await step('Expresiones: listar y eliminar', async () => {
    await click('[data-nav="words"]');
    const before = await page.locator('#list .list-item').count();
    assert.ok(before >= 4, 'hay expresiones');
    page.once('dialog', d => d.accept());
    await page.locator('[data-del]').first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#list .list-item').count(), before - 1);
  });
  await step('Evaluación semanal (forzada) actualiza niveles con tope', async () => {
    await page.evaluate(async () => {
      const req = indexedDB.open('mi-ingles');
      await new Promise(r => req.onsuccess = r);
      const tx = req.result.transaction('evals', 'readwrite');
      const os = tx.objectStore('evals');
      const all = await new Promise(r => { const g = os.getAll(); g.onsuccess = () => r(g.result); });
      all.forEach(e => { e.createdAt -= 8 * 86400000; os.put(e); });
      await new Promise(r => tx.oncomplete = r);
    });
    await click('[data-nav="progress"]');
    await click('#weekly');
    await click('#go');
    for (let i = 0; i < 2; i++) { await page.locator('.opt').first().waitFor(); await page.locator('.opt').first().click(); await page.waitForTimeout(150); }
    for (let i = 0; i < 3; i++) { await page.locator('#mic').waitFor(); await record(); await page.waitForTimeout(200); }
    await page.getByText('OBJETIVO DE LA PRÓXIMA SEMANA').first().waitFor({ timeout: 10000 });
    await click('#home');
    await page.getByText('Usar "It depends on…"').first().waitFor();
  });
  await step('Ajustes: datos, tope de ElevenLabs, exportar sin claves', async () => {
    await click('[data-nav="settings"]');
    await page.getByText('creator').first().waitFor();
    const txt = await page.textContent('main');
    assert.ok(/Usados este mes desde la app: [1-9]/.test(txt), 'se contabilizan caracteres de ElevenLabs');
    const [dl] = await Promise.all([page.waitForEvent('download'), click('#export')]);
    const data = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
    const s = data.kv.find(k => k.key === 'settings').value;
    assert.equal(s.geminiKey, ''); assert.equal(s.elevenKey, '');
    assert.ok(data.sessions.length >= 1 && data.cards.length >= 3);
  });
  await step('Ajustes: cambiar el ID de voz a mano y probarlo', async () => {
    await page.fill('#evid', 'custom123'); await click('#evtest');
    await page.getByText('La voz funciona').first().waitFor();
    await click('#save'); await page.waitForTimeout(300);
    const id = await page.evaluate(async () => { const r = indexedDB.open('mi-ingles'); await new Promise(x => r.onsuccess = x); return new Promise(x => { const g = r.result.transaction('kv').objectStore('kv').get('settings'); g.onsuccess = () => x(g.result.value.elevenVoiceId); }); });
    assert.equal(id, 'custom123');
    assert.ok(lastVoiceUrl.includes('/text-to-speech/custom123'));
  });
  await step('Respaldo: sin ElevenLabs usa la voz del sistema', async () => {
    const before = calls.eleven;
    await page.uncheck('#ue'); await click('#save');
    await click('#testVoice'); await page.waitForTimeout(400);
    assert.equal(calls.eleven, before);
  });
  await step('Modo oscuro', async () => {
    await page.selectOption('#theme', 'dark'); await click('#save');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 3000 });
    await page.screenshot({ path: 'tests/shot-settings-dark.png' });
  });

  await page.selectOption('#theme', 'light'); await click('#save');
  await click('[data-nav="home"]');
  await page.screenshot({ path: 'tests/shot-home.png' });
  await click('[data-nav="progress"]');
  await page.screenshot({ path: 'tests/shot-progress.png', fullPage: true });

  const audioCalls = calls.gemini.filter(b => JSON.stringify(b.contents).includes('"mimeType":"audio/wav"')).length;
  console.log(`\nLlamadas a Gemini: ${calls.gemini.length} (${audioCalls} con audio WAV) · síntesis ElevenLabs: ${calls.eleven}`);
  const real = errors.filter(e => !/ERR_|Failed to load resource|NotSupportedError|play\(\)/.test(e));
  if (real.length) { console.log('Errores de página:', real); process.exitCode = 1; }
  else console.log('Sin errores de JavaScript.');
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
