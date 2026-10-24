// Inicio, progreso, expresiones, ajustes y evaluación semanal.
import { APP_VERSION, S, register, go, level, weekInfo, totalMinutes, practiceDays, weeklyDue, weeklyCount, lastEval, saveSettings, saveProfile, saveEval, recordErrors, topErrors, deleteCard, deleteError, updateCard, minutesByDay, loadAll, aiReady } from './store.js';
import { mount, esc, toast, icon, navBar, loading, downloadJSON } from './ui.js';
import { levelName, overallLevel, SKILLS, isMastered, isDue, blendLevels, buildPlan } from './srs.js';
import { MODES, DIAG_LISTENING } from './curriculum.js';
import { detectModel, cleanKey } from './gemini.js';
import { speak, unlockAudio, getUsage, elevenSubscription, elevenVoices, releaseMic, testElevenVoice } from './voice.js';
import { elevenPatch } from './onboarding.js';
import { micHTML, bindMic } from './mic.js';
import { weeklyTasks, weeklyEval } from './tutor.js';
import { db, uid, todayStr } from './db.js';

/* ---------------- Inicio ---------------- */
register('home', () => {
  const p = S.profile || {};
  const wk = weekInfo();
  const target = S.settings.weeklyTarget || 5;
  const due = S.cards.filter(c => isDue(c)).length;
  const today = S.sessions.filter(s => s.date === todayStr());
  const unfinished = [...today].reverse().find(s => !s.completed && s.stepIndex < s.steps.length);
  const practicedToday = today.reduce((a, s) => a + (s.activeMinutes || 0), 0);
  const hour = new Date().getHours();
  const hi = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const ov = overallLevel(p.levels);
  const msg = wk.practiced >= target ? '¡Meta semanal cumplida! Todo lo extra suma.'
    : practicedToday >= 3 ? 'Ya practicaste hoy. ¡Bien hecho!'
    : wk.practiced === 0 ? 'Una semana nueva, un comienzo nuevo.'
    : `Llevas ${wk.practiced} de ${target} días esta semana. Descansar también está bien.`;

  mount(`<main class="screen">
    <div class="hello"><div class="muted small">${hi}${p.name ? ', ' + esc(p.name) : ''}</div><h1>¿Hablamos un poco de inglés?</h1></div>
    ${!aiReady() ? `<div class="notice err" style="margin-bottom:12px">Falta conectar Gemini. <a href="#" id="toSettings">Ir a Ajustes</a></div>` : ''}
    ${!navigator.onLine ? `<div class="notice" style="margin-bottom:12px">Estás sin conexión. Puedes repasar tus expresiones, pero el tutor necesita internet.</div>` : ''}
    <div class="card">
      <div class="row"><b class="grow">Esta semana</b><span class="small muted">${wk.practiced}/${target} días · ${Math.round(wk.minutes)} min</span></div>
      <div class="week">${wk.days.map(d => `<div class="d">${d.label}<div class="dot ${d.minutes >= 3 ? 'done' : ''} ${d.today ? 'today' : ''}">${d.minutes >= 3 ? '✓' : ''}</div></div>`).join('')}</div>
      <p class="small muted" style="margin:10px 0 0">${msg}</p>
    </div>
    ${weeklyDue() ? `<div class="card warm" style="margin-top:12px"><div class="row"><div class="grow"><b>Tu evaluación ${weeklyCount() % 4 === 3 ? 'mensual' : 'semanal'} está lista</b><div class="small">Unos 8 minutos. Así medimos tu progreso real.</div></div><button class="btn sm accent" id="weekly">Hacerla</button></div></div>` : ''}
    <div class="cta">
      ${unfinished ? `<button class="btn accent big block" id="resume" style="margin-bottom:10px">Continuar sesión de hoy (${MODES[unfinished.mode].steps.length - unfinished.stepIndex} actividades)</button>` : ''}
      <button class="btn primary big block" id="start">${icon.mic} Comenzar mi práctica · 40 min</button>
    </div>
    <div class="small muted" style="margin:4px 0 8px">¿Día complicado? Una sesión corta también cuenta:</div>
    <div class="quick">${[20, 10, 5].map(m => `<button class="btn outline" data-mode="${m}">${m} min</button>`).join('')}</div>
    <div class="stat-row" style="margin-top:16px">
      <div class="stat"><b>${levelName(ov)}</b><span>nivel estimado</span></div>
      <div class="stat"><b>${due}</b><span>para repasar</span></div>
      <div class="stat"><b>${practiceDays()}</b><span>días practicados</span></div>
    </div>
    ${p.nextWeekGoal ? `<div class="card soft" style="margin-top:12px"><div class="tiny muted" style="font-weight:700">OBJETIVO DE LA SEMANA</div><div class="small">${esc(p.nextWeekGoal)}</div></div>` : ''}
  </main>${navBar('home')}`);

  const startSession = (mode) => {
    unlockAudio();
    if (!aiReady()) { toast('Primero conecta Gemini en Ajustes.'); go('settings'); return; }
    go('session', { mode });
  };
  document.getElementById('start').onclick = () => startSession(40);
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => startSession(Number(b.dataset.mode)));
  const r = document.getElementById('resume'); if (r) r.onclick = () => { unlockAudio(); go('session', { resumeId: unfinished.id }); };
  const w = document.getElementById('weekly'); if (w) w.onclick = () => { unlockAudio(); go('weekly'); };
  const ts = document.getElementById('toSettings'); if (ts) ts.onclick = e => { e.preventDefault(); go('settings'); };
});

/* ---------------- Progreso ---------------- */
register('progress', () => {
  const p = S.profile || {};
  const lv = p.levels || {};
  const start = p.startLevels || {};
  const wk = weekInfo();
  const mastered = S.cards.filter(isMastered).length;
  const spontaneous = S.cards.filter(c => (c.usedSpontaneously || 0) > 0);
  const listen = S.sessions.filter(s => s.listening && s.listening.total).slice(-6);
  const listenPct = listen.length ? Math.round(listen.reduce((a, s) => a + s.listening.correct / s.listening.total, 0) / listen.length * 100) : null;
  const pron = S.sessions.flatMap(s => s.pron || []).slice(-15);
  const pronAvg = pron.length ? Math.round(pron.reduce((a, x) => a + x.score, 0) / pron.length) : null;
  const scored = S.sessions.filter(s => s.analysis && s.analysis.scores).slice(-5);
  const avgScore = k => scored.length ? (scored.reduce((a, s) => a + (Number(s.analysis.scores[k]) || 0), 0) / scored.length).toFixed(1) : '—';
  const last = lastEval();
  const errs = topErrors(5);

  // Calendario del mes
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const mins = minutesByDay();
  const mn = now.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const monthName = mn.charAt(0).toUpperCase() + mn.slice(1);
  const cells = [...Array(offset)].map(() => '<div class="c empty"></div>').concat([...Array(days)].map((_, i) => {
    const key = todayStr(new Date(now.getFullYear(), now.getMonth(), i + 1));
    const m = mins[key] || 0;
    return `<div class="c ${m >= 30 ? 'p2' : m >= 3 ? 'p1' : ''} ${key === todayStr() ? 'today' : ''}" title="${Math.round(m)} min">${i + 1}</div>`;
  }));

  mount(`<main class="screen">
    <div class="topbar"><div class="title">Tu progreso</div></div>
    <div class="stat-row">
      <div class="stat"><b>${totalMinutes()}</b><span>minutos en total</span></div>
      <div class="stat"><b>${practiceDays()}</b><span>días practicados</span></div>
      <div class="stat"><b>${wk.practiced}/${S.settings.weeklyTarget || 5}</b><span>días esta semana</span></div>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="row"><h3 class="grow" style="margin:0">Nivel por habilidad</h3><span class="badge">${levelName(overallLevel(lv))}</span></div>
      <div class="stack" style="margin-top:10px">${SKILLS.map(([k, label]) => {
        const d = (lv[k] ?? 0) - (start[k] ?? lv[k] ?? 0);
        return `<div class="skill"><span class="small">${label}</span><span class="small"><span class="lvl">${levelName(lv[k])}</span>${d > 0.05 ? ` <span class="badge">+${d.toFixed(1)}</span>` : ''}</span><div class="bar"><i style="width:${Math.min(100, ((lv[k] || 0) / 5) * 100)}%"></i></div></div>`;
      }).join('')}</div>
      <p class="tiny muted" style="margin:10px 0 0">Estimaciones de la IA basadas en tus evaluaciones${last ? ` (última: ${new Date(last.createdAt).toLocaleDateString('es')})` : ''}. No equivalen a una certificación oficial (para eso existen exámenes como Cambridge, IELTS o TOEFL).</p>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Evidencia reciente</h3>
      <div class="list-item"><div class="grow"><div class="t">Comprensión de audio</div><div class="s">Últimos diálogos</div></div><b>${listenPct != null ? listenPct + '%' : '—'}</b></div>
      <div class="list-item"><div class="grow"><div class="t">Mantener una conversación</div><div class="s">Promedio últimas sesiones</div></div><b>${avgScore('interaction')}/5</b></div>
      <div class="list-item"><div class="grow"><div class="t">Gramática funcional</div><div class="s">Promedio últimas sesiones</div></div><b>${avgScore('grammar')}/5</b></div>
      <div class="list-item"><div class="grow"><div class="t">Fluidez y desarrollo de ideas</div><div class="s">Promedio últimas sesiones</div></div><b>${avgScore('fluency')}/5</b></div>
      <div class="list-item"><div class="grow"><div class="t">Pronunciación e inteligibilidad</div><div class="s">Shadowing reciente</div></div><b>${pronAvg != null ? pronAvg + '/100' : '—'}</b></div>
      <div class="list-item"><div class="grow"><div class="t">Expresiones dominadas</div><div class="s">${spontaneous.length} usadas espontáneamente en conversación</div></div><b>${mastered}</b></div>
    </div>

    ${p.nextWeekGoal ? `<div class="card tint" style="margin-top:12px"><div class="tiny" style="font-weight:700">OBJETIVO DE LA PRÓXIMA SEMANA</div><div>${esc(p.nextWeekGoal)}</div></div>` : ''}

    <div class="card" style="margin-top:12px">
      <h3>${esc(monthName)}</h3>
      <div class="cal">${'LMMJVSD'.split('').map(d => `<div class="h">${d}</div>`).join('')}${cells.join('')}</div>
      <p class="tiny muted" style="margin:8px 0 0">Claro: practicaste. Oscuro: 30 min o más. Los días de descanso no rompen nada.</p>
    </div>

    ${errs.length ? `<div class="card" style="margin-top:12px"><h3>Errores que más se repiten</h3>${errs.map(e => `<div class="list-item"><div class="grow"><div class="t">${esc(e.natural || e.corrected)}</div><div class="s">${esc(e.pattern || e.explanation)} · ${e.count}×</div></div></div>`).join('')}</div>` : ''}

    ${p.plan ? `<div class="card" style="margin-top:12px"><h3>Plan hacia ${esc(p.plan.goal)}</h3><div class="timeline">${p.plan.stages.map(s => {
      const nowBand = levelName(overallLevel(lv)).replace('+', '');
      return `<div class="tl ${s.band === nowBand ? 'now' : ''}"><b>${esc(s.band)}</b> <span class="tiny muted">· meses ${Math.floor(s.from) + 1}–${Math.max(Math.ceil(s.to), Math.floor(s.from) + 1)}</span><div class="small">${esc(s.focus)}</div></div>`;
    }).join('')}</div><p class="tiny muted" style="margin:0">El plan se recalcula con cada evaluación semanal.</p></div>` : ''}

    <div class="row" style="margin-top:12px"><button class="btn outline block" id="weekly">Hacer evaluación ahora</button></div>
    <details style="margin-top:12px"><summary>Historial de evaluaciones</summary>${[...S.evals].reverse().map(e => `<div class="list-item"><div class="grow"><div class="t">${e.type === 'diagnostic' ? 'Diagnóstico inicial' : e.monthly ? 'Evaluación mensual' : 'Evaluación semanal'}</div><div class="s">${new Date(e.createdAt).toLocaleDateString('es')} · ${levelName(overallLevel(e.levels))}</div></div></div>`).join('') || '<p class="small muted">Aún no hay evaluaciones.</p>'}</details>
  </main>${navBar('progress')}`);
  document.getElementById('weekly').onclick = () => { unlockAudio(); go('weekly'); };
});

/* ---------------- Expresiones y errores ---------------- */
register('words', ({ tab = 'cards' } = {}) => {
  const cards = [...S.cards].sort((a, b) => b.createdAt - a.createdAt);
  const errs = topErrors(100);
  const status = c => isMastered(c) ? ['Dominada', ''] : c.reps === 0 ? ['Nueva', 'warm'] : [`Repasar ${isDue(c) ? 'hoy' : 'en ' + Math.max(1, Math.ceil((c.due - Date.now()) / 86400000)) + ' d'}`, 'warm'];
  mount(`<main class="screen">
    <div class="topbar"><div class="title">Mis expresiones</div></div>
    <div class="chips" style="margin-bottom:12px">
      <button class="chip ${tab === 'cards' ? 'on' : ''}" data-tab="cards">Expresiones (${cards.length})</button>
      <button class="chip ${tab === 'errors' ? 'on' : ''}" data-tab="errors">Errores (${errs.length})</button>
    </div>
    ${tab === 'cards' ? `
      <input type="text" id="q" placeholder="Buscar…" style="margin-bottom:8px">
      <div class="card" style="padding:4px 14px" id="list">${cards.map(c => { const [st, cls] = status(c); return `
        <div class="list-item" data-text="${esc((c.en + ' ' + c.es).toLowerCase())}">
          <button class="icon-btn" data-say="${c.id}" aria-label="Escuchar">${icon.play}</button>
          <div class="grow"><div class="t">${esc(c.en)}</div><div class="s">${esc(c.es)}</div><span class="badge ${cls}">${st}</span>${c.usedSpontaneously ? ' <span class="badge">La usaste ✓</span>' : ''}</div>
          <button class="icon-btn" data-edit="${c.id}" aria-label="Editar">✎</button>
          <button class="icon-btn" data-del="${c.id}" aria-label="Eliminar">${icon.trash}</button>
        </div>`; }).join('') || '<p class="small muted">Aún no hay expresiones. Aparecerán tras tus sesiones.</p>'}</div>`
    : `<div class="card" style="padding:4px 14px">${errs.map(e => `
        <div class="list-item"><div class="grow"><div class="s"><s>${esc(e.original)}</s></div><div class="t">${esc(e.natural || e.corrected)}</div><div class="s">${esc(e.explanation)} · visto ${e.count}×</div></div>
          <button class="icon-btn" data-delerr="${e.id}" aria-label="Eliminar">${icon.trash}</button></div>`).join('') || '<p class="small muted">Sin errores registrados todavía.</p>'}</div>
      <p class="tiny muted">Si un error no es correcto, elimínalo: la IA también se equivoca.</p>`}
  </main>${navBar('words')}`);
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go('words', { tab: b.dataset.tab }));
  const q = document.getElementById('q');
  if (q) q.oninput = () => { const v = q.value.toLowerCase(); document.querySelectorAll('#list .list-item').forEach(el => el.classList.toggle('hidden', !el.dataset.text.includes(v))); };
  document.querySelectorAll('[data-say]').forEach(b => b.onclick = () => { unlockAudio(); speak(S.cards.find(c => c.id === b.dataset.say).en); });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('¿Eliminar esta expresión?')) { await deleteCard(b.dataset.del); go('words', { tab }); } });
  document.querySelectorAll('[data-delerr]').forEach(b => b.onclick = async () => { if (confirm('¿Eliminar este error?')) { await deleteError(b.dataset.delerr); go('words', { tab }); } });
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
    const c = S.cards.find(x => x.id === b.dataset.edit);
    const en = prompt('Expresión en inglés:', c.en); if (en == null) return;
    const es = prompt('Significado en español:', c.es); if (es == null) return;
    await updateCard({ ...c, en: en.trim() || c.en, es: es.trim() });
    go('words', { tab });
  });
});

/* ---------------- Ajustes ---------------- */
register('settings', async () => {
  const s = S.settings;
  const usage = await getUsage();
  mount(`<main class="screen">
    <div class="topbar"><div class="title">Ajustes</div></div>
    <div class="stack">
      <div class="card stack">
        <h3>Gemini (cerebro del tutor)</h3>
        <label class="field"><span>Clave de API</span><input type="password" id="gk" value="${esc(s.geminiKey)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="AIza…"></label>
        <label class="field"><span>Modelo</span><input type="text" id="gm" value="${esc(s.geminiModel)}" autocapitalize="off" spellcheck="false"></label>
        <div class="row"><button class="btn sm outline" id="detect">Detectar modelo</button><a class="small" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Obtener clave</a></div>
        <p class="tiny muted" style="margin:0">Llamadas este mes: ${usage.geminiCalls || 0}. Consulta tus límites en aistudio.google.com.</p>
      </div>

      <div class="card stack">
        <h3>ElevenLabs (voz del tutor)</h3>
        <label class="toggle"><span>Usar ElevenLabs</span><input type="checkbox" id="ue" ${s.useEleven !== false && s.elevenKey ? 'checked' : ''}></label>
        <label class="field"><span>Clave de API</span><input type="password" id="ek" value="${esc(s.elevenKey)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk_…"></label>
        <label class="field"><span>ID de la voz</span><input type="text" id="evid" value="${esc(s.elevenVoiceId)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ej.: 21m00Tcm4TlvDq8ikWAM"></label>
        <p class="tiny muted" style="margin:0">En ElevenLabs › Voices, abre la voz, toca ⋯ y elige "Copy voice ID".${s.elevenVoiceName ? ` Voz actual: <b>${esc(s.elevenVoiceName)}</b>.` : ''}</p>
        <div class="row wrap"><button class="btn sm outline" id="evtest">${icon.play} Probar esta voz</button><button class="btn sm ghost" id="voices">Elegir de mis voces</button></div>
        <label class="field"><span>ID de la voz en español (explicaciones)</span><input type="text" id="evides" value="${esc(s.elevenVoiceIdEs || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Opcional"></label>
        <button class="btn sm outline" id="evtestEs" style="align-self:flex-start">${icon.play} Probar voz en español</button>
        <div id="evmsg"></div>
        <div id="vbox"></div>
        <label class="field"><span>Tope mensual de caracteres (0 = sin tope)</span><input type="number" id="cap" min="0" step="10000" value="${Number(s.elevenMonthlyCap) || 0}"></label>
        <div class="small">Usados este mes desde la app: <b>${(usage.elevenChars || 0).toLocaleString('es')}</b> caracteres${usage.fallbacks ? ` · ${usage.fallbacks} veces con voz del iPhone por error` : ''}</div>
        <div id="sub" class="small muted"></div>
        <p class="tiny muted" style="margin:0">Flash v2.5 cuesta entre 0,5 y 1 crédito por carácter según tu plan. Una sesión de 40 min usa ~8.000–10.000 caracteres. Al llegar al tope se usa la voz del iPhone.</p>
        <label class="toggle"><span>Acentos variados según el nivel</span><input type="checkbox" id="aa" ${s.autoAccents !== false ? 'checked' : ''}></label>
      </div>

      <div class="card stack">
        <h3>Práctica</h3>
        <label class="field"><span>Velocidad de la voz: <b id="spv">${Math.round((s.ttsSpeed || 1) * 100)}%</b></span><input type="range" id="sp" min="0.75" max="1.15" step="0.05" value="${s.ttsSpeed || 1}"></label>
        <button class="btn sm outline" id="testVoice" style="align-self:flex-start">${icon.play} Probar voz</button>
        <label class="toggle"><span>Mostrar texto del tutor en la conversación</span><input type="checkbox" id="tx" ${s.showTranscript !== false ? 'checked' : ''}></label>
        <label class="field"><span>Días de práctica por semana (meta flexible)</span><select id="wt">${[3, 4, 5, 6, 7].map(n => `<option ${Number(s.weeklyTarget || 5) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>Sobre ti (para personalizar al tutor)</span><textarea id="about">${esc(S.profile?.about || '')}</textarea></label>
        <label class="field"><span>Meta de nivel</span><select id="goal">${['B1', 'B2'].map(g => `<option ${(S.profile?.goal || 'B2') === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="field"><span>Tema</span><select id="theme">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>

      <button class="btn primary big block" id="save">Guardar ajustes</button>

      <div class="card stack">
        <h3>Mis datos</h3>
        <p class="small muted" style="margin:0">Todo tu progreso vive en este teléfono. Exporta una copia de vez en cuando (por ejemplo a Archivos o iCloud Drive).</p>
        <button class="btn outline block" id="view">Ver mis datos de aprendizaje</button>
        <div id="dataView"></div>
        <button class="btn outline block" id="export">Exportar copia de seguridad</button>
        <label class="btn outline block" style="cursor:pointer">Importar copia<input type="file" id="import" accept="application/json,.json" class="hidden"></label>
        <button class="btn outline block" id="rediag">Repetir el diagnóstico inicial</button>
        <button class="btn danger block" id="wipe">Borrar todos mis datos</button>
      </div>

      <details class="card"><summary>Modo de prueba</summary>
        <p class="small muted">Carga datos de ejemplo (14 días de sesiones) para ver el panel de progreso. No usa la IA. Puedes borrarlos con "Borrar todos mis datos".</p>
        <button class="btn outline block" id="demo">Cargar datos de prueba</button>
      </details>
      <p class="tiny muted center">Mi Inglés · versión ${APP_VERSION} · las grabaciones de voz no se guardan</p>
    </div>
  </main>${navBar('settings')}`);

  const $ = id => document.getElementById(id);
  if (s.elevenKey) elevenSubscription(s.elevenKey).then(sub => {
    if (sub && $('sub')) $('sub').textContent = `Cuenta ElevenLabs (${sub.tier}): ${sub.used.toLocaleString('es')} de ${sub.limit.toLocaleString('es')} créditos usados${sub.resetAt ? ` · se renueva el ${new Date(sub.resetAt).toLocaleDateString('es')}` : ''}.`;
  });
  $('sp').oninput = () => $('spv').textContent = Math.round($('sp').value * 100) + '%';
  $('detect').onclick = async () => {
    try { $('detect').disabled = true; const { best, all } = await detectModel(cleanKey($('gk').value)); $('gm').value = best; toast(`Modelo: ${best} (${all.length} disponibles)`); }
    catch (e) { toast(e.message, 6000); } finally { $('detect').disabled = false; }
  };
  let voiceList = [];
  const testV = async (id, text) => {
    unlockAudio();
    const key = $('ek').value.trim();
    if (!key || !id) { toast('Escribe la clave y el ID de la voz.'); return; }
    $('evmsg').innerHTML = loading('Generando una frase de prueba…');
    try { await testElevenVoice(key, id, text); $('evmsg').innerHTML = '<div class="small" style="color:var(--good)">✓ La voz funciona. Toca "Guardar ajustes" para usarla.</div>'; }
    catch (e) { $('evmsg').innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  };
  $('evtest').onclick = () => testV($('evid').value.trim(), 'Hi there! This is how I sound. Is this speed comfortable for you?');
  $('evtestEs').onclick = () => testV($('evides').value.trim(), 'Hola, esta es la voz que te explicará las correcciones en español.');
  $('voices').onclick = async () => {
    const key = $('ek').value.trim();
    if (!key) { toast('Pega tu clave de ElevenLabs.'); return; }
    $('vbox').innerHTML = loading('Leyendo voces…');
    try {
      voiceList = await elevenVoices(key);
      $('vbox').innerHTML = `<select id="vsel">${voiceList.map(v => `<option value="${esc(v.id)}" ${v.id === s.elevenVoiceId ? 'selected' : ''}>${esc(v.name)} ${v.accent ? '· ' + esc(v.accent) : ''} ${v.gender ? '· ' + esc(v.gender) : ''}</option>`).join('')}</select>`;
      $('vsel').onchange = () => { $('evid').value = $('vsel').value; };
      $('evid').value = $('vsel').value;
    } catch (e) { $('vbox').innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  };
  const collect = () => {
    const patch = {
      geminiKey: cleanKey($('gk').value), geminiModel: $('gm').value.trim(),
      elevenKey: $('ek').value.trim(), useEleven: $('ue').checked, autoAccents: $('aa').checked,
      elevenMonthlyCap: Math.max(0, Number($('cap').value) || 0), ttsSpeed: Number($('sp').value),
      showTranscript: $('tx').checked, weeklyTarget: Number($('wt').value), theme: $('theme').value,
    };
    const ep = elevenPatch(patch.elevenKey, $('evid').value.trim(), voiceList);
    return { ...patch, ...ep, elevenVoiceIdEs: $('evides').value.trim(), useEleven: $('ue').checked && ep.useEleven };
  };
  $('testVoice').onclick = async () => { unlockAudio(); await saveSettings(collect()); speak('Hi there! This is how I sound. Is this speed comfortable for you?'); };
  $('save').onclick = async () => {
    await saveSettings(collect());
    if (S.profile) await saveProfile({ about: $('about').value.trim().slice(0, 400) });
    const goal = $('goal').value;
    if (S.profile && goal !== S.profile.goal) await saveProfile({ goal, plan: buildPlan(S.profile.levels, goal) });
    toast('Ajustes guardados');
  };
  $('view').onclick = async () => {
    const data = await db.exportAll();
    $('dataView').innerHTML = `<pre class="data">${esc(JSON.stringify({ perfil: data.kv.find(k => k.key === 'profile')?.value, expresiones: data.cards.length, errores: data.errors, sesiones: data.sessions.map(x => ({ fecha: x.date, minutos: x.activeMinutes, modo: x.mode, completa: x.completed })), evaluaciones: data.evals }, null, 2))}</pre>`;
  };
  $('export').onclick = async () => { downloadJSON(await db.exportAll(), `mi-ingles-copia-${todayStr()}.json`); toast('Copia exportada (sin tus claves de API).'); };
  $('import').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); if (!confirm('Esto reemplazará tus datos actuales con los de la copia. ¿Continuar?')) return; await db.importAll(data); await loadAll(); toast('Copia importada'); go('home'); }
    catch (err) { toast(err.message || 'No se pudo importar.', 6000); }
  };
  $('rediag').onclick = () => { if (confirm('¿Repetir el diagnóstico? Tu historial se conserva.')) go('diag'); };
  $('wipe').onclick = async () => {
    if (!confirm('¿Borrar TODO tu progreso, expresiones y claves de este teléfono? No se puede deshacer.')) return;
    if (!confirm('Última confirmación: ¿borrar todo?')) return;
    await db.wipe(); await loadAll(); go('welcome');
  };
  $('demo').onclick = async () => { await loadDemoData(); toast('Datos de prueba cargados'); go('progress'); };
});

/* ---------------- Evaluación semanal / mensual ---------------- */
register('weekly', () => {
  const monthly = weeklyCount() % 4 === 3;
  const lv = level();
  const tasks = weeklyTasks(lv, monthly);
  const li = DIAG_LISTENING[Math.max(0, Math.min(3, Math.round(lv) - 1))];
  const li2 = DIAG_LISTENING[Math.max(0, Math.min(3, Math.round(lv)))];
  const st = { phase: 'intro', i: 0, audios: [], listening: [] };
  const shell = inner => mount(`<main class="screen no-nav"><div class="session-top"><button class="icon-btn" id="close" aria-label="Salir">${icon.close}</button><div class="steps">${[...Array(tasks.length + 1)].map((_, k) => `<i class="${st.phase === 'intro' ? '' : k < st.i + (st.phase === 'speak' ? 1 : 0) ? 'done' : ''}"></i>`).join('')}</div></div>${inner}</main>`);
  const bindClose = () => document.getElementById('close').onclick = () => { if (confirm('¿Salir de la evaluación? No se guardará.')) { releaseMic(); go('home'); } };
  const render = () => {
    if (st.phase === 'intro') {
      shell(`<div class="step-head"><div class="kicker">${monthly ? 'Evaluación mensual' : 'Evaluación semanal'}</div><h1>Midamos tu progreso</h1></div>
        <p class="muted">Una pregunta de escucha y ${tasks.length} tareas orales reales. Responde sin ayuda, como en una conversación. Con esto actualizamos tu nivel por habilidad${monthly ? ' e incluimos una simulación de tarea del MCER' : ''}.</p>
        <div style="flex:1"></div><button class="btn primary big block" id="go">Comenzar</button>`);
      bindClose();
      document.getElementById('go').onclick = () => { st.phase = 'listen'; render(); };
    } else if (st.phase === 'listen') {
      const item = st.listening.length === 0 ? li : li2;
      shell(`<div class="step-head"><div class="kicker">Escucha</div><h2>${esc(item.q)}</h2></div>
        <button class="btn primary" id="play">${icon.play} Escuchar</button>
        <div class="opts" style="margin-top:14px">${item.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}</div>`);
      bindClose();
      document.getElementById('play').onclick = () => speak(item.text);
      speak(item.text);
      document.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        st.listening.push({ level: item.level, correct: Number(b.dataset.k) === item.answer });
        if (st.listening.length < 2 && li2 !== li) render(); else { st.phase = 'speak'; render(); }
      });
    } else if (st.phase === 'speak') {
      const t = tasks[st.i];
      shell(`<div class="step-head"><div class="kicker">Tarea oral ${st.i + 1} de ${tasks.length}</div><h2>${esc(t.prompt)}</h2>
        <details><summary class="small muted">Ver en español</summary><p class="small">${esc(t.es)}</p></details></div>
        <button class="btn sm outline" id="rep" style="align-self:flex-start">${icon.replay} Escuchar</button>
        <div style="flex:1"></div>${micHTML('mic', `<button class="btn sm ghost" id="skip">Saltar</button>`)}`);
      bindClose();
      document.getElementById('rep').onclick = () => speak(t.prompt);
      speak(t.prompt);
      const next = () => { if (st.i < tasks.length - 1) { st.i++; render(); } else { st.phase = 'analyze'; render(); } };
      const mic = bindMic('mic', { maxSeconds: 90, onAudio: async ({ b64 }) => { st.audios[st.i] = b64; next(); } });
      document.getElementById('skip').onclick = () => { mic.cancel(); st.audios[st.i] = null; next(); };
    } else if (st.phase === 'analyze') {
      releaseMic();
      shell(`<div style="flex:1;display:flex;flex-direction:column;justify-content:center" class="center stack"><div class="wave" style="height:40px"><i></i><i></i><i></i><i></i><i></i></div><h2>Evaluando…</h2><div id="err"></div></div>`);
      analyze().catch(e => {
        document.getElementById('err').innerHTML = `<div class="notice err">${esc(e.message)}</div><button class="btn primary block" id="retry" style="margin-top:10px">Reintentar</button>`;
        document.getElementById('retry').onclick = render;
      });
    }
  };
  const analyze = async () => {
    const last = lastEval();
    const recent = S.sessions.filter(s => !last || s.startedAt > last.createdAt).map(s => ({
      date: s.date, minutes: s.activeMinutes, listening: s.listening && s.listening.score, scores: s.analysis && s.analysis.scores,
      level_evidence: s.analysis && s.analysis.level_evidence, exit: s.exit && s.exit.score, pron: (s.pron || []).map(x => x.score),
    })).slice(-10);
    const out = await weeklyEval({ levels: S.profile.levels }, st.audios, tasks, st.listening, recent);
    const prev = S.profile.levels;
    const levels = blendLevels(prev, out.levels || {}, monthly ? 0.6 : 0.5);
    await saveEval({ id: uid(), type: 'weekly', monthly, createdAt: Date.now(), date: todayStr(), levels, prevLevels: prev, raw: out.levels, progress: out.progress_es, evidence: out.evidence_es, transcripts: out.transcripts, goal: out.next_week_goal_es });
    await recordErrors(out.errors || []);
    await saveProfile({ levels, nextWeekGoal: out.next_week_goal_es || '', plan: buildPlan(levels, S.profile.goal || 'B2') });
    mount(`<main class="screen no-nav">
      <div class="step-head"><div class="kicker">Resultado</div><h1>${levelName(overallLevel(levels))}</h1></div>
      <p>${esc(out.progress_es || '')}</p>
      <div class="card stack">${SKILLS.map(([k, l]) => { const d = (levels[k] || 0) - (prev[k] || 0); return `<div class="skill"><span class="small">${l}</span><span class="small"><span class="lvl">${levelName(levels[k])}</span> ${Math.abs(d) >= 0.05 ? `<span class="badge ${d < 0 ? 'warm' : ''}">${d > 0 ? '+' : ''}${d.toFixed(1)}</span>` : ''}</span><div class="bar"><i style="width:${(levels[k] / 5) * 100}%"></i></div></div>`; }).join('')}
        <p class="tiny muted" style="margin:0">Estimación de la IA, no certificación oficial. Los cambios se limitan cada semana para exigir evidencia sostenida.</p></div>
      ${(out.evidence_es || []).length ? `<div class="card soft" style="margin-top:12px"><h3>Lo que observé</h3>${out.evidence_es.map(x => `<div class="small">• ${esc(x)}</div>`).join('')}</div>` : ''}
      ${out.next_week_goal_es ? `<div class="card tint" style="margin-top:12px"><div class="tiny" style="font-weight:700">OBJETIVO DE LA PRÓXIMA SEMANA</div><div>${esc(out.next_week_goal_es)}</div></div>` : ''}
      <button class="btn primary big block" id="home" style="margin-top:16px">Volver al inicio</button></main>`);
    document.getElementById('home').onclick = () => go('home');
  };
  render();
});

/* ---------------- Datos de prueba ---------------- */
async function loadDemoData() {
  const { newCard } = await import('./srs.js');
  const now = Date.now();
  const sessions = [];
  for (let d = 13; d >= 0; d--) {
    if ([2, 6, 9].includes(d)) continue; // días de descanso
    const date = new Date(now - d * 86400000);
    const mode = d % 5 === 0 ? 10 : 40;
    const mins = mode === 40 ? 36 + (d % 5) : 9;
    sessions.push({
      id: uid(), date: todayStr(date), startedAt: date.getTime(), finishedAt: date.getTime() + mins * 60000, mode, completed: true,
      stepIndex: MODES[mode].steps.length, steps: MODES[mode].steps.map(([name, m]) => ({ name, target: m * 60, activeSec: m * 60, done: true })),
      scenarioId: 'weekend', personaId: 'emma', level: 2.2, activeMinutes: mins, reviewed: 10, newChunks: 3, demo: true,
      transcript: [{ role: 'tutor', text: 'Hi! How was your weekend?' }, { role: 'me', text: 'It was good, I go to the park with my family.' }],
      inlineCorrections: [], listening: mode === 40 ? { correct: 2 + (d % 2), total: 3, score: (2 + (d % 2)) / 3 } : null,
      pron: mode === 40 ? [{ target: 'I think they’re both there.', score: 60 + (13 - d) * 2, focus: 'th' }] : [],
      analysis: { scores: { speaking: 3, grammar: 2 + (d < 7 ? 1 : 0), vocabulary: 3, fluency: 2 + (d < 4 ? 1 : 0), interaction: 3 }, summary_es: 'Sesión de prueba.' },
    });
  }
  await db.putMany('sessions', sessions);
  const cards = [['It depends on…', 'Depende de…'], ['I was wondering if…', 'Me preguntaba si…'], ['What do you think?', '¿Qué opinas?'], ['Last weekend, I went to…', 'El fin de semana pasado fui a…'], ['How about…?', '¿Qué tal si…?']]
    .map(([en, es], i) => ({ ...newCard({ en, es }), interval: [25, 4, 30, 1, 0][i], reps: [5, 2, 6, 1, 0][i], due: now + [20, 2, 25, -1, -1][i] * 86400000, usedSpontaneously: i === 2 ? 2 : 0 }));
  await db.putMany('cards', cards);
  const levels = S.profile?.levels || { listening: 2.4, speaking: 2.1, pronunciation: 2.2, grammar: 2.0, vocabulary: 2.3, fluency: 1.9 };
  if (!S.profile?.levels) await saveProfile({ name: S.profile?.name || 'Prueba', goal: 'B2', levels, startLevels: { listening: 2.0, speaking: 1.8, pronunciation: 2.0, grammar: 1.8, vocabulary: 2.0, fluency: 1.6 }, diagnosedAt: now - 14 * 86400000, plan: buildPlan(levels, 'B2') });
  await db.put('evals', { id: uid(), type: 'weekly', createdAt: now - 7 * 86400000, date: todayStr(new Date(now - 7 * 86400000)), levels, demo: true });
  await recordErrors([{ original: 'Yesterday I go to the supermarket.', corrected: 'Yesterday I went to the supermarket.', explanation_es: 'Con "yesterday" usamos pasado: went.', pattern: 'past simple after yesterday' }]);
  await loadAll();
}
