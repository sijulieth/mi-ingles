// Incorporación: consentimiento, perfil, claves, prueba de micrófono y diagnóstico.
import { S, register, go, saveSettings, saveProfile, saveEval, recordErrors, addCards } from './store.js';
import { mount, esc, toast, icon, loading } from './ui.js';
import { detectModel, cleanKey } from './gemini.js';
import { elevenVoices, mapVoicesByAccent, speak, unlockAudio, releaseMic, testElevenVoice } from './voice.js';
import { micHTML, bindMic } from './mic.js';
import { DIAG_LISTENING, DIAG_SPEAKING, INTERESTS, SCENARIOS } from './curriculum.js';
import { diagnose } from './tutor.js';
import { buildPlan, levelName, overallLevel, SKILLS } from './srs.js';
import { uid, todayStr } from './db.js';

const shell = (inner, { back } = {}) => `<main class="screen no-nav">
  ${back ? `<div class="topbar"><button class="icon-btn" id="back" aria-label="Atrás">${icon.back}</button></div>` : ''}
  ${inner}</main>`;

function bindBack(to) { const b = document.getElementById('back'); if (b) b.onclick = () => go(to); }

/* 1. Bienvenida */
register('welcome', () => {
  mount(shell(`
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center" class="stack">
      <div style="font-size:54px">🗣️</div>
      <h1>Tu inglés, todos los días</h1>
      <p class="muted">Conversa con un tutor de IA, recibe correcciones útiles y mira cómo mejoras, en sesiones que caben en tu día: 40 minutos, o 5 cuando el día está complicado.</p>
      <div class="card soft small">Primero haremos un diagnóstico corto (unos 10 minutos) para saber desde dónde empiezas. No necesitas prepararte.</div>
    </div>
    <button class="btn primary big block" id="go">Empezar</button>`));
  document.getElementById('go').onclick = () => { unlockAudio(); go('consent'); };
});

/* 2. Consentimiento */
register('consent', () => {
  mount(shell(`
    <h1>Tus datos, bajo tu control</h1>
    <div class="stack">
      <div class="card"><h3>Qué se guarda</h3><p class="small muted" style="margin:0">Tu nivel, expresiones, errores frecuentes e historial de sesiones se guardan <b>solo en este teléfono</b>. Puedes verlos, exportarlos o borrarlos en Ajustes.</p></div>
      <div class="card"><h3>Qué sale del teléfono</h3><p class="small muted" style="margin:0">Tu voz se envía a <b>Google (Gemini)</b> para transcribirla y responderte; la app no guarda las grabaciones. Las frases del tutor se envían como texto a <b>ElevenLabs</b> para convertirlas en voz. Ambos servicios tienen sus propias políticas de privacidad, y en la capa gratuita Google puede usar los datos para mejorar sus productos.</p></div>
      <div class="card"><h3>Tus claves</h3><p class="small muted" style="margin:0">Tus claves de API se guardan solo en este dispositivo y viajan directamente a Google y ElevenLabs. No están escritas en el código de la app.</p></div>
      <label class="toggle card soft"><span>Entiendo y acepto guardar mi progreso de aprendizaje en este teléfono</span><input type="checkbox" id="ok"></label>
    </div>
    <div style="flex:1"></div>
    <button class="btn primary big block" id="go" disabled>Continuar</button>`, { back: true }));
  bindBack('welcome');
  const ok = document.getElementById('ok'), b = document.getElementById('go');
  ok.onchange = () => b.disabled = !ok.checked;
  b.onclick = async () => { await saveProfile({ consentAt: Date.now() }); go('aboutyou'); };
});

/* 3. Sobre ti */
register('aboutyou', () => {
  const p = S.profile || {};
  const sel = new Set(p.interests || []);
  mount(shell(`
    <h1>Cuéntame de ti</h1>
    <div class="stack">
      <label class="field"><span>¿Cómo te llamo?</span><input type="text" id="name" value="${esc(p.name || '')}" placeholder="Tu nombre" autocomplete="given-name"></label>
      <label class="field"><span>Algo sobre ti para que el tutor converse de tu vida (opcional)</span><textarea id="about" placeholder="Ej.: tengo dos hijas pequeñas, trabajo en…, me gusta…">${esc(p.about || '')}</textarea>
        <span class="tiny muted" style="font-weight:400">Se guarda solo en este teléfono y se envía a Gemini para personalizar las conversaciones.</span></label>
      <div><span class="small muted" style="font-weight:600">Tu meta de trabajo</span>
        <div class="chips" id="goal" style="margin-top:6px">${['B1', 'B2'].map(g => `<button class="chip ${(p.goal || 'B2') === g ? 'on' : ''}" data-g="${g}">${g}</button>`).join('')}</div>
        <p class="tiny muted" style="margin-top:6px">B1: te defiendes con independencia en situaciones cotidianas. B2: conversas con fluidez y argumentas. Es una meta, no una garantía; la puedes cambiar luego.</p></div>
      <div><span class="small muted" style="font-weight:600">Temas que te gustan</span>
        <div class="chips" id="int" style="margin-top:6px">${INTERESTS.map(([k, l]) => `<button class="chip ${sel.has(k) ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div></div>
    </div>
    <div style="flex:1;min-height:20px"></div>
    <button class="btn primary big block" id="go">Continuar</button>`, { back: true }));
  bindBack('consent');
  let goal = p.goal || 'B2';
  document.querySelectorAll('#goal .chip').forEach(c => c.onclick = () => { goal = c.dataset.g; document.querySelectorAll('#goal .chip').forEach(x => x.classList.toggle('on', x === c)); });
  document.querySelectorAll('#int .chip').forEach(c => c.onclick = () => { c.classList.toggle('on'); sel.has(c.dataset.k) ? sel.delete(c.dataset.k) : sel.add(c.dataset.k); });
  document.getElementById('go').onclick = async () => {
    await saveProfile({ name: document.getElementById('name').value.trim(), about: document.getElementById('about').value.trim().slice(0, 400), goal, interests: [...sel] });
    go('keys');
  };
});

/* 4. Clave de Gemini */
register('keys', () => {
  mount(shell(`
    <h1>Conecta a Gemini</h1>
    <p class="muted">Gemini es el cerebro del tutor: escucha lo que dices, te responde y detecta tus errores.</p>
    <div class="card stack">
      <ol class="small" style="padding-left:18px;margin:0">
        <li>Abre <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e inicia sesión con tu cuenta de Google.</li>
        <li>Pulsa <b>Create API key</b> y cópiala.</li>
        <li>Pégala aquí abajo.</li>
      </ol>
      <label class="field"><span>Clave de Gemini</span><input type="password" id="k" value="${esc(S.settings.geminiKey)}" placeholder="AIza…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <p class="tiny muted" style="margin:0">Tiene capa gratuita con límites por minuto y por día. Recomendado: en Google Cloud restringe la clave a la "Generative Language API".</p>
    </div>
    <div id="msg"></div>
    <div style="flex:1;min-height:20px"></div>
    <button class="btn primary big block" id="go">Probar y continuar</button>`, { back: true }));
  bindBack('aboutyou');
  const b = document.getElementById('go');
  b.onclick = async () => {
    const key = cleanKey(document.getElementById('k').value);
    if (!key) { toast('Pega tu clave de Gemini.'); return; }
    b.disabled = true; b.innerHTML = '<span class="spinner"></span> Probando…';
    try {
      const { best } = await detectModel(key);
      await saveSettings({ geminiKey: key, geminiModel: best });
      toast(`Conectado a ${best}`);
      go('eleven');
    } catch (e) {
      document.getElementById('msg').innerHTML = `<div class="notice err">${esc(e.message)}</div>`;
      b.disabled = false; b.textContent = 'Probar y continuar';
    }
  };
});

/* 5. ElevenLabs */
register('eleven', () => {
  const s = S.settings;
  mount(shell(`
    <h1>La voz del tutor</h1>
    <p class="muted">Con ElevenLabs el tutor suena muy natural. Si prefieres, puedes empezar con la voz del iPhone (gratis) y agregarlo después.</p>
    <div class="card stack">
      <ol class="small" style="padding-left:18px;margin:0">
        <li>En <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener">elevenlabs.io › API Keys</a> crea una clave con permiso de <b>Text to Speech</b>. Recomendado: ponle un límite de créditos.</li>
        <li>En <a href="https://elevenlabs.io/app/voice-library" target="_blank" rel="noopener">Voices</a> abre la voz que te guste, toca <b>⋯</b> y elige <b>Copy voice ID</b>.</li>
      </ol>
      <label class="field"><span>Clave de API de ElevenLabs</span><input type="password" id="k" value="${esc(s.elevenKey)}" placeholder="sk_…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>ID de la voz</span><input type="text" id="vid" value="${esc(s.elevenVoiceId)}" placeholder="Ej.: 21m00Tcm4TlvDq8ikWAM" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <button class="btn outline block" id="test">${icon.play} Probar esta voz</button>
      <label class="field"><span>ID de la voz en español (opcional)</span><input type="text" id="vides" value="${esc(s.elevenVoiceIdEs || '')}" placeholder="Para escuchar las explicaciones" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <button class="btn outline block" id="testEs">${icon.play} Probar voz en español</button>
      <div id="msg"></div>
      <button class="btn ghost block" id="load">¿No tienes el ID? Elegir de mis voces</button>
    </div>
    <div id="voices" class="stack" style="margin-top:12px"></div>
    <div style="flex:1;min-height:20px"></div>
    <button class="btn primary big block" id="go">Continuar</button>
    <button class="btn ghost block" id="skip">Usar la voz del iPhone por ahora</button>`, { back: true }));
  bindBack('keys');
  let voices = [];
  const $ = id => document.getElementById(id);
  const box = $('voices');
  const render = () => {
    const chosen = $('vid').value.trim();
    box.innerHTML = `<h3>Tus voces</h3>
      <div class="card" style="padding:4px 14px">${voices.slice(0, 40).map(v => `
        <div class="list-item">
          <button class="icon-btn" data-prev="${esc(v.id)}" aria-label="Escuchar ${esc(v.name)}">${icon.play}</button>
          <div class="grow"><div class="t">${esc(v.name)}</div><div class="s">${esc([v.accent, v.gender].filter(Boolean).join(' · ') || v.category || '')}</div></div>
          <button class="chip ${chosen === v.id ? 'on' : ''}" data-pick="${esc(v.id)}">${chosen === v.id ? 'Elegida' : 'Elegir'}</button>
        </div>`).join('')}</div>`;
    box.querySelectorAll('[data-prev]').forEach(b => b.onclick = () => tryVoice(b.dataset.prev));
    box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { $('vid').value = b.dataset.pick; render(); });
  };
  const tryVoice = async (id, text = 'Hi! I’m your English conversation partner. Shall we practise together?') => {
    const key = $('k').value.trim();
    if (!key || !id) { toast('Escribe la clave y el ID de la voz.'); return false; }
    $('msg').innerHTML = loading('Generando una frase de prueba…');
    try {
      await testElevenVoice(key, id, text);
      $('msg').innerHTML = '<div class="small" style="color:var(--good)">✓ La voz funciona.</div>';
      return true;
    } catch (e) { $('msg').innerHTML = `<div class="notice err">${esc(e.message)}</div>`; return false; }
  };
  $('test').onclick = () => tryVoice($('vid').value.trim());
  $('testEs').onclick = () => tryVoice($('vides').value.trim(), 'Hola, esta es la voz que te explicará las correcciones en español.');
  $('load').onclick = async () => {
    const key = $('k').value.trim();
    if (!key) { toast('Pega tu clave de ElevenLabs.'); return; }
    box.innerHTML = loading('Leyendo tus voces…');
    try {
      voices = await elevenVoices(key);
      if (!voices.length) throw new Error('Tu cuenta no tiene voces disponibles.');
      if (!$('vid').value.trim()) $('vid').value = (voices.find(v => v.accent.includes('american') && v.gender === 'female') || voices[0]).id;
      render();
    } catch (e) { box.innerHTML = `<div class="notice err">${esc(e.message)} Puedes escribir el ID de la voz directamente.</div>`; }
  };
  $('go').onclick = async () => {
    const key = $('k').value.trim();
    const vid = $('vid').value.trim();
    if (key && !vid) { toast('Escribe el ID de la voz, elígela de tu lista o usa la voz del iPhone.'); return; }
    if (!key && vid) { toast('Falta la clave de API de ElevenLabs.'); return; }
    await saveSettings({ ...elevenPatch(key, vid, voices), elevenVoiceIdEs: $('vides').value.trim() });
    go('mictest');
  };
  $('skip').onclick = async () => { await saveSettings({ useEleven: false }); go('mictest'); };
});

// Ajustes de ElevenLabs a partir de la clave, el ID y (si se cargó) la lista de voces.
export function elevenPatch(key, vid, voices = []) {
  const v = voices.find(x => x.id === vid);
  const alt = voices.find(x => x.id !== vid && x.gender && v && x.gender !== v.gender && /american/.test(x.accent));
  return {
    elevenKey: key, useEleven: !!(key && vid), elevenVoiceId: vid,
    elevenVoiceName: v ? v.name : (vid && vid === S.settings.elevenVoiceId ? S.settings.elevenVoiceName : (vid ? `ID ${vid.slice(0, 6)}…` : '')),
    elevenAltVoiceId: alt ? alt.id : (voices.length ? '' : S.settings.elevenAltVoiceId),
    elevenVoicesByAccent: voices.length ? mapVoicesByAccent(voices) : (vid === S.settings.elevenVoiceId ? S.settings.elevenVoicesByAccent : {}),
  };
}

/* 6. Prueba de micrófono */
register('mictest', () => {
  mount(shell(`
    <h1>Probemos tu micrófono</h1>
    <p class="muted">Toca el botón, di en voz alta <b>"Hello, my name is…"</b> y vuelve a tocarlo. Escucharás tu grabación.</p>
    <div class="card soft small">Si el iPhone pregunta, permite el acceso al micrófono. Busca un lugar tranquilo y habla a unos 20 cm del teléfono.</div>
    <div style="flex:1"></div>
    <div id="res" class="center"></div>
    ${micHTML('mic')}
    <button class="btn primary big block hidden" id="go" style="margin-top:12px">Funciona, continuar</button>`, { back: true }));
  bindBack('eleven');
  const res = document.getElementById('res');
  const mic = bindMic('mic', {
    maxSeconds: 10,
    onAudio: async ({ blob, seconds }) => {
      const url = URL.createObjectURL(blob);
      res.innerHTML = `<p class="small">Grabé ${seconds.toFixed(1)} s. Escúchate:</p><audio controls playsinline src="${url}" style="width:100%"></audio>`;
      document.getElementById('go').classList.remove('hidden');
      mic.set('idle', 'Puedes grabar otra vez si quieres');
    },
  });
  document.getElementById('go').onclick = () => go('diag');
  return () => mic.cancel();
});

/* 7. Diagnóstico */
register('diag', () => {
  const st = { phase: 'intro', li: 0, si: 0, listening: [], audios: [] };
  const render = () => {
    if (st.phase === 'intro') {
      mount(shell(`
        <h1>Diagnóstico inicial</h1>
        <p class="muted">Dos partes cortas. Van de fácil a difícil: está bien no entenderlo todo. Lo importante es saber desde dónde empiezas.</p>
        <div class="card stack">
          <div class="row"><span class="badge">1</span><div><b>Escuchar</b><div class="small muted">4 audios cortos y una pregunta en cada uno.</div></div></div>
          <div class="row"><span class="badge">2</span><div><b>Hablar</b><div class="small muted">4 preguntas en inglés. Responde como puedas, hasta 1 minuto cada una. Puedes saltar las que aún no puedas.</div></div></div>
        </div>
        <div style="flex:1"></div>
        <button class="btn primary big block" id="go">Comenzar</button>`, { back: true }));
      bindBack('mictest');
      document.getElementById('go').onclick = () => { unlockAudio(); st.phase = 'listen'; render(); };
    } else if (st.phase === 'listen') {
      const it = DIAG_LISTENING[st.li];
      mount(shell(`
        <div class="session-top"><div class="steps">${DIAG_LISTENING.map((_, i) => `<i class="${i < st.li ? 'done' : i === st.li ? 'cur' : ''}"></i>`).join('')}</div></div>
        <div class="step-head"><div class="kicker">Escuchar · ${st.li + 1} de 4</div><h2>Escucha y responde</h2></div>
        <div class="card center stack">
          <button class="btn primary" id="play">${icon.play} Escuchar</button>
          <button class="btn ghost sm" id="slow">${icon.turtle} Más despacio</button>
          <p class="tiny muted" style="margin:0">Puedes escucharlo hasta 2 veces.</p>
        </div>
        <h3 style="margin-top:18px">${esc(it.q)}</h3>
        <div class="opts">${it.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')}</div>
        <button class="btn ghost block" id="idk" style="margin-top:10px">No lo entendí</button>`));
      let plays = 0;
      const play = async (speed) => { if (plays >= 2) { toast('Ya lo escuchaste dos veces. Elige la respuesta que te parezca.'); return; } plays++; await speak(it.text, { speed }); };
      document.getElementById('play').onclick = () => play(1);
      document.getElementById('slow').onclick = () => play(0.8);
      const answer = (i) => {
        st.listening.push({ level: it.level, correct: i === it.answer, skipped: i == null, plays });
        if (st.li < DIAG_LISTENING.length - 1) { st.li++; render(); } else { st.phase = 'speak'; render(); }
      };
      document.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(Number(b.dataset.i)));
      document.getElementById('idk').onclick = () => answer(null);
      setTimeout(() => play(1), 400);
    } else if (st.phase === 'speak') {
      const it = DIAG_SPEAKING[st.si];
      mount(shell(`
        <div class="session-top"><div class="steps">${DIAG_SPEAKING.map((_, i) => `<i class="${i < st.si ? 'done' : i === st.si ? 'cur' : ''}"></i>`).join('')}</div></div>
        <div class="step-head"><div class="kicker">Hablar · ${st.si + 1} de 4</div><h2>${esc(it.prompt)}</h2>
          <details><summary class="small muted">Ver en español</summary><p class="small">${esc(it.es)}</p></details></div>
        <div class="row"><button class="btn sm outline" id="rep">${icon.replay} Escuchar pregunta</button></div>
        <div style="flex:1"></div>
        ${micHTML('mic')}
        <button class="btn ghost block" id="skip">Todavía no puedo responder esto</button>`));
      document.getElementById('rep').onclick = () => speak(it.prompt);
      speak(it.prompt);
      const next = () => { if (st.si < DIAG_SPEAKING.length - 1) { st.si++; render(); } else { st.phase = 'analyze'; render(); } };
      const mic = bindMic('mic', { maxSeconds: 75, onAudio: async ({ b64 }) => { st.audios[st.si] = b64; next(); } });
      document.getElementById('skip').onclick = () => { mic.cancel(); st.audios[st.si] = null; next(); };
    } else if (st.phase === 'analyze') {
      releaseMic();
      mount(shell(`<div style="flex:1;display:flex;flex-direction:column;justify-content:center" class="center stack">
        <div class="wave" style="height:40px"><i></i><i></i><i></i><i></i><i></i></div>
        <h2>Analizando tus respuestas…</h2><p class="muted">Esto toma unos segundos.</p><div id="err"></div></div>`));
      runDiagnosis(st).catch(e => {
        document.getElementById('err').innerHTML = `<div class="notice err">${esc(e.message)}</div><button class="btn primary block" id="retry" style="margin-top:12px">Reintentar</button>`;
        document.getElementById('retry').onclick = () => render();
      });
    }
  };
  render();
});

async function runDiagnosis(st) {
  const out = await diagnose(st.listening, [0, 1, 2, 3].map(i => st.audios[i] || null), DIAG_SPEAKING);
  const levels = {};
  for (const [k] of SKILLS) {
    const v = Number(out.levels && out.levels[k]);
    levels[k] = isFinite(v) ? Math.max(0.5, Math.min(5, v)) : 1;
  }
  const plan = buildPlan(levels, S.profile.goal || 'B2');
  await saveProfile({ levels, startLevels: levels, diagnosedAt: Date.now(), plan, pronProblems: out.pron_problem_ids || [], diagSummary: out.summary_es || '', strengths: out.strengths_es || [], priorities: out.priorities_es || [] });
  await saveEval({ id: uid(), type: 'diagnostic', createdAt: Date.now(), date: todayStr(), levels, summary: out.summary_es, evidence: out.transcripts || [], strengths: out.strengths_es, priorities: out.priorities_es });
  await recordErrors(out.errors || []);
  // Primeras expresiones para el repaso: escenarios de su banda.
  const band = Math.max(1, Math.min(4, Math.round(overallLevel(levels))));
  const starter = SCENARIOS.filter(s => s.level === band).slice(0, 2).flatMap(s => s.chunks.map(([en, es]) => ({ en, es })));
  await addCards(starter, 'starter');
  go('results');
}

/* 8. Resultados y plan */
register('results', () => {
  const p = S.profile;
  const ov = overallLevel(p.levels);
  const plan = p.plan;
  mount(shell(`
    <div class="step-head"><div class="kicker">Tu punto de partida</div><h1>Nivel estimado: ${levelName(ov)}</h1></div>
    <p>${esc(p.diagSummary)}</p>
    <div class="card stack">${SKILLS.map(([k, label]) => `
      <div class="skill"><span class="small">${label}</span><span class="lvl small">${levelName(p.levels[k])}</span>
      <div class="bar"><i style="width:${Math.min(100, (p.levels[k] / 5) * 100)}%"></i></div></div>`).join('')}
      <p class="tiny muted" style="margin:0">Estimación de la IA, no es una certificación oficial.</p>
    </div>
    ${(p.priorities || []).length ? `<div class="card soft" style="margin-top:12px"><h3>En qué nos enfocaremos</h3><ul class="small" style="margin:0;padding-left:18px">${p.priorities.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <h2 style="margin-top:20px">Tu plan hacia ${esc(plan.goal)}</h2>
    <p class="small muted">Con 40 minutos al día, estimamos unos <b>${plan.estimatedMonths} meses</b>${plan.fitsInYear ? '' : ' (más de un año: lo ajustaremos según tu avance real)'}. Solo subirás de etapa cuando las evaluaciones lo demuestren.</p>
    <div class="timeline">${plan.stages.map((s, i) => `<div class="tl ${i === 0 ? 'now' : ''}"><b>${esc(s.band)} · meses ${Math.floor(s.from) + 1}–${Math.max(Math.ceil(s.to), Math.floor(s.from) + 1)}</b><div class="small">${esc(s.focus)}</div><div class="tiny muted">${esc(s.milestone)}</div></div>`).join('')}</div>
    <button class="btn primary big block" id="go" style="margin-top:12px">Ir a mi práctica</button>`));
  document.getElementById('go').onclick = () => go('home');
});
