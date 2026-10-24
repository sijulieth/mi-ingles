// Sesión diaria: repaso, escucha, conversación, pronunciación, corrección y reto final.
import { S, register, go, level, saveSession, addCards, updateCard, recordErrors, markChunksUsed, topErrors, saveProfile } from './store.js';
import { mount, esc, toast, icon, loading, fmtTime } from './ui.js';
import { speak, stopSpeaking, releaseMic, unlockAudio } from './voice.js';
import { micHTML, bindMic } from './mic.js';
import { MODES, STEP_NAMES, SCENARIOS, PERSONAS, pickScenario, pickPersona, pickPronFocus, PRON_FOCUS } from './curriculum.js';
import { review, pickReview, levelName } from './srs.js';
import * as T from './tutor.js';
import { uid, todayStr } from './db.js';

function recentIds(field, n = 4) { return S.sessions.slice(-n).map(s => s[field]).filter(Boolean); }

function createSession(mode) {
  const lv = level();
  const scenario = pickScenario(lv, recentIds('scenarioId', 6), S.profile?.interests || []);
  const persona = pickPersona(lv, recentIds('personaId', 2));
  return {
    id: uid(), date: todayStr(), startedAt: Date.now(), mode, completed: false, stepIndex: 0,
    steps: MODES[mode].steps.map(([name, min]) => ({ name, target: min * 60, activeSec: 0, done: false })),
    scenarioId: scenario.id, personaId: persona.id, level: lv,
    transcript: [], inlineCorrections: [], listening: null, pron: [], analysis: null, exit: null,
    reviewed: 0, newChunks: 0, activeMinutes: 0,
  };
}

register('session', ({ mode = 40, resumeId } = {}) => {
  unlockAudio();
  let sess = resumeId ? S.sessions.find(s => s.id === resumeId) : null;
  if (sess) sess = structuredClone(sess); else sess = createSession(mode);
  const scenario = SCENARIOS.find(s => s.id === sess.scenarioId) || SCENARIOS[0];
  const persona = PERSONAS.find(p => p.id === sess.personaId) || PERSONAS[0];
  const learning = S.cards.filter(c => c.interval < 21).sort((a, b) => b.lapses - a.lapses).slice(0, 4);
  const ctx = {
    profile: S.profile, level: sess.level, persona, scenario, errors: topErrors(6),
    targetChunks: [...scenario.chunks.map(([en, es]) => ({ en, es })), ...learning],
  };

  let busy = false;
  let stepCleanup = null;
  const setBusy = b => { busy = b; };
  const tick = setInterval(() => {
    if (busy || document.hidden) return;
    const st = sess.steps[sess.stepIndex];
    if (!st) return;
    st.activeSec++;
    updateTimer();
    if (st.activeSec % 15 === 0) persist();
  }, 1000);

  const persist = async () => {
    sess.activeMinutes = Math.round(sess.steps.reduce((a, s) => a + s.activeSec, 0) / 6) / 10;
    await saveSession(sess);
  };

  mount(`<main class="screen no-nav">
    <div class="session-top">
      <button class="icon-btn" id="close" aria-label="Salir">${icon.close}</button>
      <div class="steps" id="steps"></div>
      <div class="timer" id="timer"></div>
    </div>
    <div id="body" style="flex:1;display:flex;flex-direction:column"></div>
  </main>`);
  const body = document.getElementById('body');

  const renderSteps = () => {
    document.getElementById('steps').innerHTML = sess.steps.map((s, i) => `<i class="${s.done ? 'done' : i === sess.stepIndex ? 'cur' : ''}"></i>`).join('');
  };
  const updateTimer = () => {
    const st = sess.steps[sess.stepIndex];
    if (!st) return;
    const rem = st.target - st.activeSec;
    const el = document.getElementById('timer');
    if (el) el.textContent = rem >= 0 ? fmtTime(rem) : '+' + fmtTime(-rem);
    if (rem === 0) { const n = document.getElementById('nextStep'); if (n) n.classList.add('primary'); }
  };
  const remaining = () => { const st = sess.steps[sess.stepIndex]; return st ? st.target - st.activeSec : 0; };

  document.getElementById('close').onclick = async () => {
    const ok = window.confirm('¿Salir de la sesión? Tu progreso de hoy se guarda y puedes continuar después.');
    if (!ok) return;
    stopSpeaking();
    await persist();
    go('home');
  };

  const stepHead = (kicker, title, sub = '') => `<div class="step-head"><div class="kicker">${esc(kicker)}</div><h2>${title}</h2>${sub ? `<p class="small muted" style="margin:0">${sub}</p>` : ''}</div>`;
  const nextBtn = (label = 'Siguiente actividad') => `<button class="btn outline block" id="nextStep" style="margin-top:14px">${label} ${icon.next}</button>`;
  const bindNext = () => { const b = document.getElementById('nextStep'); if (b) b.onclick = () => completeStep(); };

  async function completeStep() {
    stopSpeaking();
    if (stepCleanup) { try { stepCleanup(); } catch {} stepCleanup = null; }
    sess.steps[sess.stepIndex].done = true;
    sess.stepIndex++;
    await persist();
    runStep();
  }

  function runStep() {
    renderSteps(); updateTimer();
    const st = sess.steps[sess.stepIndex];
    if (!st) return finish();
    const fn = STEPS[st.name];
    stepCleanup = null;
    const r = fn();
    if (typeof r === 'function') stepCleanup = r;
  }

  /* ---------- 1. Repaso activo ---------- */
  function stepReview() {
    let queue = pickReview(S.cards, 15);
    const startReview = async () => {
      if (queue.length < 4) {
        const fresh = await addCards(scenario.chunks.map(([en, es]) => ({ en, es })), 'scenario:' + scenario.id);
        queue = queue.concat(fresh.length ? fresh : S.cards.filter(c => !queue.includes(c)).sort(() => Math.random() - 0.5).slice(0, 4));
      }
      show(0);
    };
    const show = (i) => {
      const c = queue[i];
      if (!c || remaining() < -60) {
        body.innerHTML = `${stepHead('Repaso activo', '¡Repaso listo!')}
          <div class="card tint">Repasaste ${sess.reviewed} expresiones. Las que te costaron volverán pronto; las que dominas, en unos días.</div>${nextBtn()}`;
        bindNext(); return;
      }
      const isFix = c.type === 'correction' && c.wrong;
      body.innerHTML = `${stepHead('Repaso activo', isFix ? '¿Cómo lo dirías bien?' : 'Dilo en inglés, en voz alta', `${i + 1} de ${queue.length} · intenta recordarlo antes de mirar`)}
        <div class="card flash">
          ${isFix ? `<div class="small muted">Tú dijiste:</div><div class="prompt"><s>${esc(c.wrong)}</s></div><div class="small muted" style="margin-top:6px">${esc(c.es)}</div>`
            : `<div class="prompt">${esc(c.es || '…')}</div>${c.example ? `<div class="small muted" style="margin-top:6px">${esc(c.example)}</div>` : ''}`}
          <div class="answer hidden" id="ans">${esc(c.en)}</div>
        </div>
        <div id="ctrl" style="margin-top:14px"><button class="btn primary big block" id="reveal">Ver respuesta</button></div>
        <button class="btn ghost block" id="skipAll" style="margin-top:6px">Terminar repaso</button>`;
      document.getElementById('skipAll').onclick = () => show(queue.length);
      document.getElementById('reveal').onclick = () => {
        document.getElementById('ans').classList.remove('hidden');
        speak(c.en);
        const nexts = [0, 1, 2, 3].map(g => review(c, g));
        const lbl = n => n.interval === 0 ? 'hoy' : n.interval === 1 ? '1 día' : `${n.interval} días`;
        document.getElementById('ctrl').innerHTML = `
          <div class="row" style="margin-bottom:8px"><button class="btn sm outline" id="again">${icon.replay} Escuchar</button><span class="small muted">¿Qué tan fácil fue recordarlo?</span></div>
          <div class="grade">
            <button class="btn" data-g="0">Otra vez<small>${lbl(nexts[0])}</small></button>
            <button class="btn" data-g="1">Difícil<small>${lbl(nexts[1])}</small></button>
            <button class="btn primary" data-g="2">Bien<small>${lbl(nexts[2])}</small></button>
            <button class="btn" data-g="3">Fácil<small>${lbl(nexts[3])}</small></button>
          </div>`;
        document.getElementById('again').onclick = () => speak(c.en);
        document.querySelectorAll('[data-g]').forEach(b => b.onclick = async () => {
          const g = Number(b.dataset.g);
          await updateCard(nexts[g]);
          sess.reviewed++;
          if (g === 0) queue.push(nexts[0]);
          show(i + 1);
        });
      };
    };
    startReview();
  }

  /* ---------- 2. Comprensión auditiva ---------- */
  function stepListening() {
    let data = sess.listeningData || null;
    let phase = 'blind';
    let answers = [];
    const speed = ctx.level < 2 ? 0.85 : ctx.level < 3 ? 0.92 : 1;
    let stopFlag = false;

    const playAll = async (sp = speed) => {
      stopFlag = false;
      for (let i = 0; i < data.lines.length; i++) {
        if (stopFlag) break;
        const l = data.lines[i];
        document.querySelectorAll('.line').forEach((el, j) => el.style.background = j === i ? 'var(--primary-soft)' : '');
        await speak(l.text, { speed: sp, voice: l.speaker === 'B' ? 'alt' : 'tutor' });
      }
      document.querySelectorAll('.line').forEach(el => el.style.background = '');
    };

    const load = async () => {
      body.innerHTML = stepHead('Comprensión auditiva', 'Preparando un diálogo…') + loading('Creando un diálogo a tu nivel');
      setBusy(true);
      try {
        data = await T.makeListening(ctx);
        if (!data || !Array.isArray(data.lines) || !data.lines.length) throw new Error('El diálogo llegó vacío.');
        sess.listeningData = data; persist();
      } catch (e) {
        setBusy(false);
        body.innerHTML = `${stepHead('Comprensión auditiva', 'No se pudo crear el diálogo')}<div class="notice err">${esc(e.message)}</div>
          <button class="btn primary block" id="retry" style="margin-top:12px">Reintentar</button>${nextBtn('Saltar esta actividad')}`;
        document.getElementById('retry').onclick = load; bindNext(); return;
      }
      setBusy(false);
      render();
    };

    const quiz = (qs, onDone) => {
      let i = 0;
      const one = () => {
        const q = qs[i];
        if (!q) return onDone();
        document.getElementById('quiz').innerHTML = `<h3>${esc(q.q)}</h3><div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}</div>`;
        document.querySelectorAll('#quiz .opt').forEach(b => b.onclick = () => {
          const k = Number(b.dataset.k);
          const ok = k === Number(q.answer);
          answers.push(ok);
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) document.querySelectorAll('#quiz .opt')[q.answer]?.classList.add('right');
          document.querySelectorAll('#quiz .opt').forEach(x => x.disabled = true);
          setTimeout(() => { i++; one(); }, ok ? 700 : 1600);
        });
      };
      one();
    };

    const render = () => {
      if (phase === 'blind') {
        body.innerHTML = `${stepHead('Comprensión auditiva', esc(data.title || 'Escucha el diálogo'), esc(data.context_es || ''))}
          <div class="card center stack">
            <p class="small" style="margin:0">Primero escucha <b>sin texto</b>. Concéntrate en la idea general.</p>
            <button class="btn primary big" id="play">${icon.play} Escuchar</button>
            <div class="row" style="justify-content:center"><button class="btn sm outline" id="slow">${icon.turtle} Más lento</button><button class="btn sm ghost" id="stop">Detener</button></div>
          </div>
          <div id="quiz" style="margin-top:16px"></div>`;
        document.getElementById('play').onclick = async () => { await playAll(); askGist(); };
        document.getElementById('slow').onclick = async () => { await playAll(Math.max(0.75, speed - 0.12)); askGist(); };
        document.getElementById('stop').onclick = () => { stopFlag = true; stopSpeaking(); };
        let asked = false;
        const askGist = () => { if (asked) return; asked = true; quiz([data.gist].filter(Boolean), () => { phase = 'details'; render(); }); };
      } else if (phase === 'details') {
        body.innerHTML = `${stepHead('Comprensión auditiva', 'Ahora los detalles', 'Escúchalo otra vez si lo necesitas.')}
          <div class="row"><button class="btn sm primary" id="play">${icon.play} Escuchar de nuevo</button><button class="btn sm outline" id="slow">${icon.turtle} Lento</button></div>
          <div id="quiz" style="margin-top:16px"></div>`;
        document.getElementById('play').onclick = () => playAll();
        document.getElementById('slow').onclick = () => playAll(Math.max(0.75, speed - 0.12));
        quiz(data.details || [], async () => { phase = 'text'; await finishListening(); render(); });
      } else {
        const score = answers.length ? Math.round(answers.filter(Boolean).length / answers.length * 100) : null;
        body.innerHTML = `${stepHead('Comprensión auditiva', 'Con apoyo de texto', score != null ? `Acertaste ${answers.filter(Boolean).length} de ${answers.length}. Toca una línea para escucharla.` : '')}
          <div class="card" style="padding:6px 14px">${data.lines.map((l, i) => `<div class="line" data-i="${i}" role="button" tabindex="0"><b>${esc(l.name || l.speaker)}</b><span>${esc(l.text)}</span></div>`).join('')}</div>
          ${(data.chunks || []).length ? `<div class="card tint" style="margin-top:12px"><h3>Expresiones para guardar</h3>${data.chunks.map(c => `<div class="small"><b>${esc(c.en)}</b> — ${esc(c.es)}</div>`).join('')}<p class="tiny muted" style="margin:6px 0 0">Ya están en tu repaso.</p></div>` : ''}
          <div class="row" style="margin-top:10px"><button class="btn sm outline" id="all">${icon.play} Escuchar todo</button></div>
          ${nextBtn()}`;
        document.querySelectorAll('.line').forEach(el => el.onclick = () => { const l = data.lines[el.dataset.i]; speak(l.text, { voice: l.speaker === 'B' ? 'alt' : 'tutor' }); });
        document.getElementById('all').onclick = () => playAll();
        bindNext();
      }
    };

    const finishListening = async () => {
      const correct = answers.filter(Boolean).length;
      sess.listening = { correct, total: answers.length, score: answers.length ? correct / answers.length : null };
      const fresh = await addCards((data.chunks || []).map(c => ({ en: c.en, es: c.es })), 'listening');
      sess.newChunks += fresh.length;
      persist();
    };

    if (data) { phase = 'text'; render(); } else load();
    return () => { stopFlag = true; };
  }

  /* ---------- 3. Conversación ---------- */
  function stepConversation() {
    let correctedLast = false;
    let ended = false;
    const hideText = S.settings.showTranscript === false;
    const tools = `<button class="btn sm outline" id="rep">${icon.replay} Repetir</button>
      <button class="btn sm outline" id="slow">${icon.turtle} Lento</button>
      <button class="btn sm outline" id="help">${icon.help} Ayuda</button>
      <button class="btn sm outline" id="type" aria-label="Escribir">${icon.keyboard}</button>`;
    body.innerHTML = `${stepHead(`Conversación con ${persona.name}`, esc(scenario.title), `${esc(persona.name)} es una IA de ${esc(persona.from)}. Habla con naturalidad: los errores son parte del proceso.`)}
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <label class="small row" style="gap:6px"><input type="checkbox" id="tx" ${hideText ? '' : 'checked'}> Mostrar texto</label>
        <button class="btn sm ghost hidden" id="endConvo">Terminar conversación</button>
      </div>
      <div class="chat" id="chat"></div>
      ${micHTML('mic', tools)}`;
    const chat = document.getElementById('chat');
    const showTx = () => document.getElementById('tx').checked;
    document.getElementById('tx').onchange = () => { chat.querySelectorAll('.msg.tutor').forEach(m => m.classList.toggle('blur', !showTx())); saveSettingsQuiet({ showTranscript: showTx() }); };

    const add = (html) => { chat.insertAdjacentHTML('beforeend', html); chat.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' }); };
    const addTutor = t => add(`<div class="msg tutor ${showTx() ? '' : 'blur'}"><div class="who">${esc(persona.name)}</div>${esc(t)}</div>`);
    const addMe = t => add(`<div class="msg me">${esc(t)}</div>`);
    const esBtn = t => `<button class="btn sm ghost" data-es="${esc(t)}" aria-label="Escuchar en español" style="min-height:32px;padding:2px 8px">🔊 Escuchar</button>`;
    const addFix = c => add(`<div class="fix"><div class="small muted">Mejor así:</div><div class="wrong">${esc(c.original)}</div><div class="right">${esc(c.natural || c.corrected)}</div>${c.explanation_es ? `<div class="small" style="margin-top:4px">${esc(c.explanation_es)}</div>${esBtn(c.explanation_es)}` : ''}</div>`);
    const addHelp = t => add(`<div class="help-es">💡 ${esc(t)}${esBtn(t)}</div>`);
    chat.addEventListener('click', e => { const b = e.target.closest('[data-es]'); if (b) speak(b.dataset.es, { lang: 'es' }); });

    // Reconstruye la conversación al reanudar.
    for (const t of sess.transcript) {
      if (t.role === 'tutor') addTutor(t.text); else addMe(t.text);
      if (t.correction) addFix(t.correction);
      if (t.help) addHelp(t.help);
    }

    const lastTutor = () => [...sess.transcript].reverse().find(t => t.role === 'tutor')?.text || '';
    const say = async (text, sp = 1) => { mic.set('speak'); await speak(text, { speed: sp, accent: persona.accent, gender: persona.gender }); if (mic.state === 'speak') mic.set('idle'); };

    const handleTurn = async (input, extra = {}) => {
      if (ended) return;
      setBusy(true); mic.set('busy');
      try {
        const wrapUp = remaining() < 60;
        const history = sess.transcript.map(t => ({ role: t.role, text: t.text }));
        const r = await T.conversationTurn(ctx, history, input, { correctedLastTurn: correctedLast, wrapUp, ...extra });
        if (r.unclear) {
          setBusy(false);
          mic.set('idle', 'No te entendí bien. Toca e inténtalo otra vez.');
          if (r.reply) { addTutor(r.reply); await say(r.reply); }
          return;
        }
        if (!extra.hidden) { addMe(r.transcript); sess.transcript.push({ role: 'me', text: r.transcript, correction: r.correction, help: r.help_es || '' }); }
        else if (sess.transcript.length) { const lastMe = [...sess.transcript].reverse().find(t => t.role === 'me'); if (lastMe && r.help_es) lastMe.help = r.help_es; }
        if (r.correction) { addFix(r.correction); sess.inlineCorrections.push(r.correction); }
        if (r.help_es) addHelp(r.help_es);
        correctedLast = !!r.correction;
        addTutor(r.reply);
        sess.transcript.push({ role: 'tutor', text: r.reply });
        persist();
        setBusy(false);
        await say(r.reply);
        if (wrapUp) {
          document.getElementById('endConvo').classList.remove('hidden');
          document.getElementById('endConvo').classList.add('primary');
        }
      } catch (e) {
        setBusy(false);
        toast(e.message || 'Algo falló.', 6000);
        mic.set('idle');
      }
    };

    const mic = bindMic('mic', { maxSeconds: 90, onAudio: ({ b64 }) => handleTurn({ audioB64: b64 }) });
    document.getElementById('rep').onclick = () => { const t = lastTutor(); if (t) say(t); };
    document.getElementById('slow').onclick = () => { const t = lastTutor(); if (t) say(t, 0.78); };
    document.getElementById('help').onclick = () => handleTurn({ text: '[The student tapped HELP: she does not know what to say or did not understand. Give a short hint in Spanish in help_es with a model answer in English, and re-ask your question more simply.]' }, { wantsHelp: true, hidden: true });
    document.getElementById('type').onclick = () => {
      const t = window.prompt('Escribe tu respuesta en inglés (o en español si necesitas ayuda):');
      if (t && t.trim()) handleTurn({ text: t.trim() });
    };
    document.getElementById('endConvo').onclick = () => { ended = true; completeStep(); };
    const watch = setInterval(() => { if (remaining() < 0) document.getElementById('endConvo')?.classList.remove('hidden'); }, 2000);

    const start = async () => {
      if (sess.transcript.length) { mic.set('idle', 'Seguimos donde quedamos. Toca para hablar'); return; }
      setBusy(true); mic.set('busy', `${persona.name} se está conectando…`);
      try {
        const opener = await T.openingLine(ctx);
        sess.transcript.push({ role: 'tutor', text: opener });
        addTutor(opener);
        persist();
        setBusy(false);
        await say(opener);
      } catch (e) {
        setBusy(false);
        mic.set('off');
        add(`<div class="notice err">${esc(e.message)}</div>`);
        add(`<button class="btn primary block" id="retryConvo">Reintentar</button>`);
        document.getElementById('retryConvo').onclick = () => { document.getElementById('retryConvo').remove(); start(); };
      }
    };
    start();
    return () => { clearInterval(watch); mic.cancel(); };
  }

  /* ---------- 4. Pronunciación ---------- */
  function stepPronunciation() {
    const recent = recentIds('pronFocus', 3);
    const focus = PRON_FOCUS.find(p => p.id === sess.pronFocus) || pickPronFocus(S.profile?.pronProblems || [], recent);
    sess.pronFocus = focus.id;
    const phrases = [focus.sentence, ...scenario.chunks.slice(0, 2).map(c => c[0].replace(/…/g, '').trim())];
    let i = 0;
    const render = () => {
      const target = phrases[i];
      if (!target) {
        body.innerHTML = `${stepHead('Pronunciación', '¡Buen trabajo!')}<div class="card tint">Practicaste ${sess.pron.length} frases. Seguiremos trabajando "${esc(focus.title)}" en próximas sesiones.</div>${nextBtn()}`;
        bindNext(); return;
      }
      body.innerHTML = `${stepHead('Pronunciación · shadowing', esc(focus.title), esc(focus.tip))}
        ${i === 0 ? `<div class="chips" style="margin-bottom:12px">${focus.words.map(w => `<button class="chip" data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div>` : ''}
        <div class="card center"><div class="small muted">Frase ${i + 1} de ${phrases.length}: escucha e imita el ritmo y la entonación</div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-round);margin:10px 0">${esc(target)}</div>
          <div class="row" style="justify-content:center"><button class="btn sm primary" id="play">${icon.play} Escuchar</button><button class="btn sm outline" id="slow">${icon.turtle} Lento</button></div></div>
        <div id="fb" style="margin-top:12px"></div>
        <div style="flex:1"></div>
        ${micHTML('mic', `<button class="btn sm ghost" id="skipP">Siguiente frase</button>`)}`;
      document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => speak(b.dataset.w.replace('/', ',')));
      document.getElementById('play').onclick = () => speak(target);
      document.getElementById('slow').onclick = () => speak(target, { speed: 0.75 });
      document.getElementById('skipP').onclick = () => { i++; render(); };
      speak(target);
      const mic = bindMic('mic', {
        maxSeconds: 20,
        onAudio: async ({ b64 }) => {
          setBusy(true);
          try {
            const r = await T.evalPronunciation(b64, target, focus);
            setBusy(false);
            const sc = Math.max(0, Math.min(100, Number(r.score) || 0));
            sess.pron.push({ target, score: sc, focus: focus.id });
            if ((r.problem_ids || []).length) {
              const set = new Set([...(S.profile.pronProblems || []), ...r.problem_ids]);
              saveProfile({ pronProblems: [...set].slice(-8) });
            }
            persist();
            const color = sc >= 80 ? 'var(--good)' : sc >= 55 ? 'var(--warn)' : 'var(--bad)';
            document.getElementById('fb').innerHTML = `<div class="card">
              <div class="row"><b style="font-size:26px;color:${color}">${sc}</b><span class="small muted">/100 · inteligibilidad ${esc(r.intelligibility || '')}</span></div>
              <div class="small muted">Escuché: “${esc(r.heard || '')}”</div>
              ${(r.tips_es || []).map(t => `<div class="small">• ${esc(t)}</div>`).join('')}
              ${r.praise_es ? `<div class="small" style="margin-top:6px">${esc(r.praise_es)}</div>` : ''}
              <div class="row" style="margin-top:10px"><button class="btn sm outline" id="again">Intentar otra vez</button><button class="btn sm primary" id="nxt">Siguiente ${icon.next}</button></div></div>`;
            document.getElementById('again').onclick = () => { document.getElementById('fb').innerHTML = ''; mic.set('idle'); };
            document.getElementById('nxt').onclick = () => { i++; render(); };
            mic.set('idle', 'Puedes intentarlo otra vez');
          } catch (e) { setBusy(false); throw e; }
        },
      });
      stepCleanup = () => mic.cancel();
    };
    render();
  }

  /* ---------- 5. Corrección y consolidación ---------- */
  async function ensureAnalysis() {
    if (sess.analysis) return sess.analysis;
    const studentTurns = sess.transcript.filter(t => t.role === 'me').length;
    if (studentTurns < 1) return null;
    const a = await T.analyzeConversation(ctx, sess.transcript, sess.inlineCorrections, S.cards);
    sess.analysis = a;
    await recordErrors(a.top_errors || []);
    const fresh = await addCards((a.chunks || []).map(c => ({ en: c.en, es: c.es })), 'analysis');
    sess.newChunks += fresh.length;
    await markChunksUsed(a.used_chunks || []);
    await persist();
    return a;
  }

  function stepCorrections() {
    const load = async () => {
      body.innerHTML = stepHead('Corrección y consolidación', 'Revisando tu conversación…') + loading('Buscando tus 3 errores más útiles');
      setBusy(true);
      let a;
      try { a = await ensureAnalysis(); }
      catch (e) {
        setBusy(false);
        body.innerHTML = `${stepHead('Corrección', 'No se pudo analizar')}<div class="notice err">${esc(e.message)}</div><button class="btn primary block" id="retry" style="margin-top:12px">Reintentar</button>${nextBtn('Saltar')}`;
        document.getElementById('retry').onclick = load; bindNext(); return;
      }
      setBusy(false);
      const errs = (a && a.top_errors && a.top_errors.length) ? a.top_errors
        : topErrors(3).map(e => ({ original: e.original, corrected: e.corrected, natural: e.natural, explanation_es: e.explanation }));
      showSummary(a, errs);
    };
    const showSummary = (a, errs) => {
      body.innerHTML = `${stepHead('Corrección y consolidación', 'Así te fue')}
        ${a && a.summary_es ? `<div class="card tint">${esc(a.summary_es)}</div>` : ''}
        ${errs.length ? `<p class="small muted" style="margin-top:12px">Vamos a practicar ${errs.length === 1 ? 'el error más útil' : `los ${errs.length} errores más útiles`}: escucha la versión natural y dila tú.</p>
          <button class="btn primary big block" id="start">Practicar correcciones</button>`
          : `<div class="card soft" style="margin-top:12px">¡No encontré errores importantes hoy! 🎉</div>${nextBtn()}`}`;
      const s = document.getElementById('start');
      if (s) s.onclick = () => practice(errs, 0); else bindNext();
    };
    const practice = (errs, i) => {
      const e = errs[i];
      if (!e) {
        const chunks = (sess.analysis && sess.analysis.chunks) || [];
        body.innerHTML = `${stepHead('Corrección y consolidación', 'Expresiones nuevas de hoy')}
          ${chunks.length ? `<div class="card" style="padding:4px 14px">${chunks.map((c, k) => `<div class="list-item"><button class="icon-btn" data-k="${k}" aria-label="Escuchar">${icon.play}</button><div class="grow"><div class="t">${esc(c.en)}</div><div class="s">${esc(c.es)}</div></div></div>`).join('')}</div><p class="tiny muted">Se agregaron a tu repaso espaciado.</p>` : '<p class="muted">Hoy no hay expresiones nuevas.</p>'}
          ${nextBtn()}`;
        document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => speak(chunks[b.dataset.k].en));
        bindNext(); return;
      }
      const target = e.natural || e.corrected;
      body.innerHTML = `${stepHead('Corrección', `Error ${i + 1} de ${errs.length}`)}
        <div class="card stack">
          <div><div class="tiny muted">Lo que dijiste</div><div><s>${esc(e.original)}</s></div></div>
          <div><div class="tiny muted">Correcto</div><div style="font-weight:600">${esc(e.corrected)}</div></div>
          ${e.natural && e.natural !== e.corrected ? `<div><div class="tiny muted">Más natural</div><div style="font-weight:700;color:var(--primary)">${esc(e.natural)}</div></div>` : ''}
          ${e.explanation_es ? `<div class="small">${esc(e.explanation_es)} <button class="btn sm ghost" id="playEs" style="min-height:32px;padding:2px 8px">🔊</button></div>` : ''}
          <button class="btn sm outline" id="play" style="align-self:flex-start">${icon.play} Escuchar</button>
        </div>
        <div id="fb" style="margin-top:12px"></div>
        <div style="flex:1"></div>
        ${micHTML('mic', `<button class="btn sm ghost" id="skipE">Siguiente</button>`)}`;
      document.getElementById('play').onclick = () => speak(target);
      const pe = document.getElementById('playEs'); if (pe) pe.onclick = () => speak(e.explanation_es, { lang: 'es' });
      document.getElementById('skipE').onclick = () => practice(errs, i + 1);
      speak(target);
      const mic = bindMic('mic', {
        maxSeconds: 20,
        onAudio: async ({ b64 }) => {
          setBusy(true);
          let r;
          try { r = await T.checkRepeat(b64, target); } finally { setBusy(false); }
          document.getElementById('fb').innerHTML = `<div class="card ${r.ok ? 'tint' : 'warm'}"><b>${r.ok ? '¡Muy bien!' : 'Casi…'}</b> <span class="small">${esc(r.feedback_es || '')}</span><div class="tiny muted">Escuché: “${esc(r.heard || '')}”</div>
            <div class="row" style="margin-top:8px">${r.ok ? '' : `<button class="btn sm outline" id="retryE">Otra vez</button>`}<button class="btn sm primary" id="nxtE">Siguiente ${icon.next}</button></div></div>`;
          document.getElementById('nxtE').onclick = () => practice(errs, i + 1);
          const re = document.getElementById('retryE'); if (re) re.onclick = () => { document.getElementById('fb').innerHTML = ''; speak(target); };
          mic.set('idle', r.ok ? 'Puedes pasar a la siguiente' : 'Escucha y vuelve a intentarlo');
        },
      });
      stepCleanup = () => mic.cancel();
    };
    load();
  }

  /* ---------- 6. Reto final ---------- */
  function stepExit() {
    const challenge = (sess.analysis && sess.analysis.exit_challenge && sess.analysis.exit_challenge.prompt_en)
      ? sess.analysis.exit_challenge
      : { prompt_en: `${scenario.task.replace(/\.$/, '')} — tell me in a few sentences.`, prompt_es: `Reto: ${scenario.title}. Responde en unas frases, sin ayuda.`, target: scenario.chunks[0][0] };
    body.innerHTML = `${stepHead('Reto final · sin ayuda', esc(challenge.prompt_en))}
      <details><summary class="small muted">Ver en español</summary><p class="small">${esc(challenge.prompt_es || '')}</p></details>
      ${challenge.target ? `<div class="card soft small">Intenta usar: <b>${esc(challenge.target)}</b></div>` : ''}
      <div id="fb" style="margin-top:12px"></div>
      <div style="flex:1"></div>
      ${micHTML('mic', `<button class="btn sm outline" id="rep">${icon.replay} Escuchar</button>`)}`;
    document.getElementById('rep').onclick = () => speak(challenge.prompt_en, { accent: persona.accent, gender: persona.gender });
    speak(challenge.prompt_en, { accent: persona.accent, gender: persona.gender });
    const mic = bindMic('mic', {
      maxSeconds: 75,
      onAudio: async ({ b64 }) => {
        setBusy(true);
        let r;
        try { r = await T.evalExit(b64, challenge, ctx.level); } finally { setBusy(false); }
        sess.exit = { challenge, ...r };
        persist();
        const stars = '★'.repeat(Math.max(1, Math.min(5, r.score || 1))) + '☆'.repeat(5 - Math.max(1, Math.min(5, r.score || 1)));
        document.getElementById('fb').innerHTML = `<div class="card stack">
          <div style="font-size:22px;color:var(--accent)">${stars}</div>
          <div class="small">${esc(r.feedback_es || '')}</div>
          ${r.better_version ? `<div><div class="tiny muted">Una versión más natural</div><div style="font-weight:600">${esc(r.better_version)}</div><button class="btn sm outline" id="bv" style="margin-top:6px">${icon.play} Escuchar</button></div>` : ''}
        </div>${nextBtn('Terminar sesión')}`;
        const bv = document.getElementById('bv'); if (bv) bv.onclick = () => speak(r.better_version);
        bindNext();
        mic.set('off');
      },
    });
    return () => mic.cancel();
  }

  const STEPS = { review: stepReview, listening: stepListening, conversation: stepConversation, pronunciation: stepPronunciation, corrections: stepCorrections, exit: stepExit };

  /* ---------- Resumen ---------- */
  async function finish() {
    clearInterval(tick);
    releaseMic();
    sess.completed = true;
    sess.finishedAt = Date.now();
    await persist();
    // En sesiones cortas sin paso de corrección, analiza en segundo plano para registrar errores.
    if (!sess.analysis && sess.transcript.some(t => t.role === 'me')) ensureAnalysis().catch(() => {});
    const tomorrow = Date.now() + 86400000;
    const dueTomorrow = S.cards.filter(c => c.due <= tomorrow).length;
    const sc = sess.analysis && sess.analysis.scores;
    document.getElementById('steps').innerHTML = sess.steps.map(() => '<i class="done"></i>').join('');
    document.getElementById('timer').textContent = '';
    body.innerHTML = `<div class="step-head center" style="margin-top:10px"><div style="font-size:48px">🎉</div><h1>¡Sesión completada!</h1><p class="muted">Hablaste inglés hoy. Eso es lo que más cuenta.</p></div>
      <div class="stat-row"><div class="stat"><b>${Math.round(sess.activeMinutes)}</b><span>min activos</span></div>
        <div class="stat"><b>${sess.transcript.filter(t => t.role === 'me').length}</b><span>turnos hablados</span></div>
        <div class="stat"><b>${sess.newChunks}</b><span>expresiones nuevas</span></div></div>
      ${sess.analysis && sess.analysis.summary_es ? `<div class="card tint" style="margin-top:12px">${esc(sess.analysis.summary_es)}</div>` : ''}
      ${sc ? `<div class="card" style="margin-top:12px"><h3>Hoy</h3>${[['speaking', 'Conversación'], ['grammar', 'Gramática'], ['vocabulary', 'Vocabulario'], ['fluency', 'Fluidez']].map(([k, l]) => `<div class="skill" style="margin-bottom:6px"><span class="small">${l}</span><span class="small lvl">${sc[k] || '—'}/5</span><div class="bar"><i style="width:${(sc[k] || 0) * 20}%"></i></div></div>`).join('')}</div>` : ''}
      <p class="small muted center" style="margin-top:12px">Mañana tendrás ${dueTomorrow} expresiones para repasar.</p>
      <button class="btn primary big block" id="home" style="margin-top:8px">Volver al inicio</button>`;
    document.getElementById('home').onclick = () => go('home');
  }

  runStep();
  return () => { clearInterval(tick); stopSpeaking(); if (stepCleanup) try { stepCleanup(); } catch {} ; releaseMic(); };
}, );

function saveSettingsQuiet(patch) { import('./store.js').then(m => m.saveSettings(patch)); }
