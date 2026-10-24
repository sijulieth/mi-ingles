// Instrucciones pedagógicas y llamadas a la IA para cada actividad.
import { generateJSON, audioPart } from './gemini.js';
import { levelName } from './srs.js';
import { addUsage } from './voice.js';

let getAI = () => ({});
export function configureTutor(fn) { getAI = fn; }

async function ask(system, contents, opts = {}) {
  const { key, model } = getAI();
  const out = await generateJSON({ key, model, system, contents, ...opts });
  addUsage({ geminiCalls: 1 }).catch(() => {});
  return out;
}
const user = (...parts) => ({ role: 'user', parts: parts.map(p => typeof p === 'string' ? { text: p } : p) });
const model = text => ({ role: 'model', parts: [{ text }] });

export function levelGuide(level) {
  const l = level ?? 1.5;
  if (l < 1.6) return `Student level: A1 (beginner). Use very short, simple sentences (max ~15 words per reply), present simple, high-frequency words. Speak like a patient friend. Offer two simple options when she struggles ("Do you like tea or coffee?"). Rephrase rather than translate. If she is totally stuck, add a short Spanish hint in help_es.`;
  if (l < 2.6) return `Student level: A2 (elementary). Short natural sentences (max ~25 words per reply). Present, past simple, going to, can/could. Everyday topics. Rephrase difficult words with simpler ones. Ask one question at a time.`;
  if (l < 3.6) return `Student level: B1 (intermediate). Natural conversational English (max ~40 words per reply), common phrasal verbs, present perfect, conditionals. Ask for reasons, examples and feelings ("Why do you think so?", "What happened next?"). Use Spanish only if she asks.`;
  return `Student level: B2 (upper-intermediate). Natural speed and vocabulary (max ~55 words per reply), idioms when appropriate, nuance. Push her to elaborate, compare, argue and defend opinions, and respond to counter-arguments. English only unless she explicitly asks for Spanish.`;
}

function profileBlock(ctx) {
  const p = ctx.profile || {};
  const errs = (ctx.errors || []).slice(0, 6).map(e => `- ${e.pattern || e.corrected} (seen ${e.count}x)`).join('\n') || '- none recorded yet';
  const chunks = (ctx.targetChunks || []).slice(0, 8).map(c => `- "${c.en}"`).join('\n') || '- none';
  return `ABOUT THE STUDENT: Spanish-speaking adult with limited time.${p.about ? ` In her own words: ${p.about}.` : ''} Learning conversational English${p.goal ? ` with a working goal of ${p.goal}` : ''}. Interests: ${(p.interests || []).join(', ') || 'not specified'}.
Current estimated level: ${levelName(ctx.level)}.
Recurring errors to watch for (and create natural chances to practise):
${errs}
Expressions she is learning (try to use them naturally and give her chances to use them):
${chunks}`;
}

/* ---------------- Conversación ---------------- */
export function tutorSystem(ctx) {
  const { persona, scenario } = ctx;
  return `You are ${persona.name}, an AI English conversation partner with the personality of someone from ${persona.from} (${persona.vibe}). You sound like a real, warm native speaker, not a textbook. You are an AI tutor: never claim to be human; if asked, say you're an AI conversation partner.

TODAY'S SITUATION (task-based): ${scenario.task}
Guide the conversation through this real-life task, but react genuinely to what she says, ask open and follow-up questions, share small bits about "yourself" to keep it natural, and avoid rigid or repetitive patterns. Never ask more than one question per reply.

${levelGuide(ctx.level)}

${profileBlock(ctx)}

CORRECTION POLICY:
- Let her finish. Always respond to the MEANING first.
- Correct at most ONE error per turn, and only if it hurts understanding, is a recurring error, or is a clear basic grammar error for her level. Ignore minor slips and acceptable variants of English (US/UK, contractions, informal style).
- Do not correct on two consecutive turns unless meaning was unclear.
- When you correct, do it inside your reply as a natural recast, e.g. "Oh nice! Yesterday you went to the supermarket — what did you buy?" and ALSO fill the "correction" field.
- If she speaks Spanish or asks how to say something, give her the English phrase, then invite her to say it herself.
- Encourage thinking in English: don't translate everything; help her infer meaning from context.

OUTPUT: Respond ONLY with JSON:
{"transcript": "exactly what the student said (in the language she used; for audio, transcribe faithfully including mistakes)",
 "reply": "your spoken reply in English (natural, level-appropriate, ends with at most one question)",
 "correction": null or {"original": "her phrase", "corrected": "corrected phrase", "natural": "a more natural way a native would say it", "explanation_es": "brief reason in Spanish (max 20 words)", "type": "grammar|vocabulary|naturalness|comprehension"},
 "help_es": "" or a short tip in Spanish ONLY when she seems stuck or asked for help,
 "unclear": false or true if the audio was empty/unintelligible (then reply asks her to repeat kindly)}`;
}

export async function openingLine(ctx) {
  const out = await ask(tutorSystem(ctx), [user(`Start the conversation now. Greet her by name ("${ctx.profile?.name || ''}" if given), introduce yourself in one short sentence, and open today's situation with one easy question. Return JSON with transcript "", correction null.`)], { temperature: 0.9 });
  return out.reply || `Hi! I'm ${ctx.persona.name}. How are you today?`;
}

/**
 * history: [{role:'tutor'|'me', text}]
 * input: { audioB64 } o { text }
 */
export async function conversationTurn(ctx, history, input, extra = {}) {
  const contents = [user('(Conversation starts.)')];
  for (const h of history.slice(-16)) {
    if (h.role === 'tutor') contents.push(model(JSON.stringify({ reply: h.text })));
    else contents.push(user(h.text));
  }
  // Gemini exige alternar user/model: une mensajes consecutivos del mismo rol.
  const merged = [];
  for (const c of contents) {
    const last = merged[merged.length - 1];
    if (last && last.role === c.role) last.parts.push(...c.parts); else merged.push({ role: c.role, parts: [...c.parts] });
  }
  const notes = [];
  if (extra.correctedLastTurn) notes.push('You corrected her last turn: do NOT correct this turn unless meaning is unclear.');
  if (extra.wantsHelp) notes.push('She tapped "help in Spanish": include a short helpful hint in help_es (what she could say, with an example in English).');
  if (extra.wrapUp) notes.push('Time is almost up: respond, then wrap up warmly in 1-2 sentences (no new question).');
  const instr = `${notes.join(' ')} Respond with the JSON format.`;
  const final = input.audioB64
    ? user(audioPart(input.audioB64), `[Student's spoken turn is the audio above. Transcribe it faithfully, then respond.] ${instr}`)
    : user(`${input.text}\n\n[${instr}]`);
  if (merged.length && merged[merged.length - 1].role === 'user') merged[merged.length - 1].parts.push(...final.parts);
  else merged.push(final);
  const out = await ask(tutorSystem(ctx), merged, { temperature: 0.8 });
  return {
    transcript: String(out.transcript || input.text || '').trim(),
    reply: String(out.reply || '').trim() || 'Sorry, could you say that again?',
    correction: out.correction && out.correction.corrected ? out.correction : null,
    help_es: out.help_es || '',
    unclear: !!out.unclear,
  };
}

/* ---------------- Comprensión auditiva ---------------- */
export async function makeListening(ctx) {
  const sys = `You write short, natural listening dialogues for an adult Spanish speaker learning conversational English. ${levelGuide(ctx.level)}`;
  const lines = ctx.level < 2 ? '6-8' : ctx.level < 3 ? '8-10' : '10-12';
  const prompt = `Write a natural everyday dialogue related to: "${ctx.scenario.task}". Two speakers with first names (one woman "A", one man "B"). ${lines} lines total, realistic spoken English (fillers like "well", "oh", contractions), not a textbook. Weave in 2-3 of these expressions if natural: ${(ctx.targetChunks || []).map(c => c.en).join(' | ') || 'any useful chunks'}.
Return JSON:
{"title": "short title in Spanish",
 "context_es": "one sentence in Spanish describing the situation (no spoilers)",
 "lines": [{"speaker": "A"|"B", "name": "Name", "text": "..."}],
 "gist": {"q": "question in Spanish about the main idea", "options": ["...","...","..."], "answer": 0},
 "details": [{"q": "question in Spanish about a detail", "options": ["...","...","..."], "answer": 0}, {"q": "...", "options": ["...","...","..."], "answer": 0}],
 "chunks": [{"en": "useful expression from the dialogue", "es": "Spanish meaning"}] (2-3 items)}
Vary the position of the correct answer.`;
  return ask(sys, [user(prompt)], { temperature: 0.9 });
}

/* ---------------- Pronunciación ---------------- */
export async function evalPronunciation(audioB64, target, focus) {
  const sys = `You are an English pronunciation coach for Spanish speakers. Be encouraging and specific, focus on intelligibility over accent. Explain in simple Spanish.`;
  const prompt = `The student tried to say: "${target}".${focus ? ` Today's focus: ${focus.title} (${focus.tip}).` : ''}
Listen to the audio and return JSON:
{"heard": "what you actually heard", "score": 0-100 (intelligibility and accuracy), "intelligibility": "alta|media|baja",
 "tips_es": ["max 2 short concrete tips in Spanish, e.g. which word/sound to fix and how"],
 "problem_ids": ["ids among: i-ee, th, s-cluster, ed, v-b, h, schwa, final-cons, linking — only if clearly heard"],
 "praise_es": "one short encouraging sentence in Spanish"}
If the audio is silent or unrelated, score 0 and say so in tips_es.`;
  return ask(sys, [user(audioPart(audioB64), prompt)], { temperature: 0.3 });
}

/* ---------------- Análisis tras la conversación ---------------- */
export async function analyzeConversation(ctx, transcript, inlineCorrections, knownChunks) {
  const sys = `You are an expert ESL teacher (CEFR) analysing a Spanish-speaking adult's spoken conversation. Prioritise the most useful and recurring errors. Distinguish real errors from acceptable variants. Explanations in brief, friendly Spanish.`;
  const convo = transcript.map(t => `${t.role === 'me' ? 'STUDENT' : 'TUTOR'}: ${t.text}`).join('\n');
  const prompt = `Conversation (student turns are speech transcriptions):
${convo}

Corrections already made during the chat: ${JSON.stringify(inlineCorrections.slice(0, 8))}
Expressions she is learning: ${JSON.stringify(knownChunks.slice(0, 40).map(c => c.en))}
Her estimated level: ${levelName(ctx.level)}. Recurring errors on record: ${JSON.stringify((ctx.errors || []).slice(0, 8).map(e => e.pattern))}

Return JSON:
{"top_errors": [ up to 3 most important, each {"original": "...", "corrected": "...", "natural": "...", "explanation_es": "max 25 words", "category": "grammar|vocabulary|pronunciation|naturalness", "pattern": "short generic label in English, e.g. 'past simple after yesterday', 'missing subject it', 'false friend: actually'"} ],
 "chunks": [ 3-4 useful natural expressions she could have used today, each {"en": "...", "es": "..."} ],
 "used_chunks": [ expressions from the learning list that she used correctly and spontaneously ],
 "scores": {"speaking": 1-5, "grammar": 1-5, "vocabulary": 1-5, "fluency": 1-5, "interaction": 1-5},
 "level_evidence": {"speaking": CEFR number 1.0-5.0, "grammar": n, "vocabulary": n, "fluency": n},
 "summary_es": "2 short encouraging sentences in Spanish: what went well and the main thing to improve",
 "exit_challenge": {"prompt_en": "one open question related to today's topic that invites her to use today's corrected structures or new expressions (level-appropriate)", "prompt_es": "Spanish translation of the challenge", "target": "expression or structure she should try to use"}}
If the student said very little, still return the structure with what you can.`;
  return ask(sys, [user(prompt)], { temperature: 0.4 });
}

/* ---------------- Repetir una frase corregida ---------------- */
export async function checkRepeat(audioB64, target) {
  const sys = 'You check whether an English learner correctly produced a target sentence. Be fair: accept small accent differences and contractions. Feedback in short Spanish.';
  const prompt = `Target sentence: "${target}". Return JSON {"heard": "...", "ok": true|false, "feedback_es": "max 15 words"}`;
  return ask(sys, [user(audioPart(audioB64), prompt)], { temperature: 0.2 });
}

/* ---------------- Reto final ---------------- */
export async function evalExit(audioB64, challenge, level) {
  const sys = `You evaluate a short spoken answer from a Spanish-speaking English learner (${levelName(level)}). Be honest and encouraging. Feedback in Spanish.`;
  const prompt = `Challenge: "${challenge.prompt_en}" (she should try to use: "${challenge.target}").
Return JSON {"transcript": "...", "task_completed": true|false, "used_target": true|false, "score": 1-5, "feedback_es": "max 30 words: one thing done well + one concrete improvement", "better_version": "a natural improved version of her answer (max 35 words)"}`;
  return ask(sys, [user(audioPart(audioB64), prompt)], { temperature: 0.3 });
}

/* ---------------- Diagnóstico inicial ---------------- */
export async function diagnose(listeningResults, speakingAudios, items) {
  const sys = `You are a certified CEFR oral examiner. Assess a Spanish-speaking adult learner's English from listening results and spoken answers. Be calibrated and evidence-based: do not overestimate. Use the scale 0.5 (pre-A1), 1.0 A1, 2.0 A2, 3.0 B1, 4.0 B2, 5.0 C1, with decimals for progress within a level (e.g. 2.5 = solid A2). Skipped answers count as evidence of not being able to do that task yet.`;
  const parts = [`Listening results (4 items, increasing difficulty A1→B2): ${JSON.stringify(listeningResults)}`];
  speakingAudios.forEach((a, i) => {
    parts.push(`Speaking task ${i + 1} (targets ${['A1', 'A2', 'B1', 'B2'][i]}): "${items[i].prompt}"`);
    if (a) parts.push(audioPart(a)); else parts.push('(student skipped this task)');
  });
  parts.push(`Return JSON:
{"levels": {"listening": n, "speaking": n, "pronunciation": n, "grammar": n, "vocabulary": n, "fluency": n},
 "transcripts": ["transcription of each answer, '' if skipped"],
 "strengths_es": ["2 short strengths in Spanish"],
 "priorities_es": ["3 short priorities in Spanish"],
 "errors": [up to 4 recurring errors {"original": "...", "corrected": "...", "explanation_es": "...", "pattern": "short English label"}],
 "pron_problem_ids": ["ids among: i-ee, th, s-cluster, ed, v-b, h, schwa, final-cons, linking"],
 "summary_es": "3 sentences in Spanish, warm and honest, explaining the estimated level and that it is an AI estimate, not an official certificate"}`);
  return ask(sys, [user(...parts)], { temperature: 0.2 });
}

/* ---------------- Evaluación semanal / mensual ---------------- */
export function weeklyTasks(level, monthly) {
  const l = level ?? 1.5;
  const tasks = [];
  if (l < 2) tasks.push({ prompt: 'Tell me about your family and what you like to do together.', es: 'Háblame de tu familia y qué les gusta hacer juntas.' });
  else if (l < 3) tasks.push({ prompt: 'What did you do last weekend? Give as many details as you can.', es: '¿Qué hiciste el fin de semana pasado? Da detalles.' });
  else if (l < 4) tasks.push({ prompt: 'Describe a problem you had recently and how you solved it.', es: 'Describe un problema reciente y cómo lo resolviste.' });
  else tasks.push({ prompt: 'Is it better to raise children in a big city or in a small town? Defend your position.', es: '¿Es mejor criar hijos en una ciudad grande o en un pueblo? Defiende tu postura.' });
  tasks.push(l < 2.5
    ? { prompt: 'Imagine you are in a restaurant. Order your food and ask one question about the menu.', es: 'Imagina que estás en un restaurante: pide y haz una pregunta sobre el menú.' }
    : l < 3.5
      ? { prompt: 'Your neighbor’s music is too loud at night. What would you say to them? Role-play it.', es: 'La música del vecino está muy alta de noche. ¿Qué le dirías?' }
      : { prompt: 'Explain the advantages and disadvantages of learning a language with an app, and give your conclusion.', es: 'Ventajas y desventajas de aprender idiomas con una app, y tu conclusión.' });
  tasks.push({ prompt: 'What is something you learned or improved in English this week? Tell me how you used it.', es: '¿Qué aprendiste o mejoraste esta semana en inglés?' });
  if (monthly) tasks.push(l < 3
    ? { prompt: 'Describe your house or apartment and say what you would like to change.', es: 'Describe tu casa y qué te gustaría cambiar.' }
    : { prompt: 'Some say social media does more harm than good. Present both sides and give your opinion with examples.', es: 'Redes sociales: ¿más daño que beneficio? Ambos lados y tu opinión.' });
  return tasks;
}

export async function weeklyEval(ctx, audios, tasks, listening, recentSummary) {
  const sys = `You are a certified CEFR oral examiner assessing weekly progress of a Spanish-speaking adult. Be calibrated, evidence-based and do not overestimate: only rate a skill at a higher level if the evidence clearly shows it. Scale: 1.0 A1, 2.0 A2, 3.0 B1, 4.0 B2, decimals for progress within a level.`;
  const parts = [`Previous estimated levels: ${JSON.stringify(ctx.levels)}.\nListening check this week: ${JSON.stringify(listening)}.\nEvidence from this week's daily sessions: ${JSON.stringify(recentSummary)}`];
  tasks.forEach((t, i) => { parts.push(`Task ${i + 1}: "${t.prompt}"`); parts.push(audios[i] ? audioPart(audios[i]) : '(skipped)'); });
  parts.push(`Return JSON:
{"levels": {"listening": n, "speaking": n, "pronunciation": n, "grammar": n, "vocabulary": n, "fluency": n},
 "transcripts": ["..."],
 "progress_es": "2-3 sentences in Spanish comparing with previous levels, honest and encouraging",
 "evidence_es": ["2-3 concrete observations in Spanish taken from her answers"],
 "next_week_goal_es": "one concrete, achievable goal for next week in Spanish",
 "errors": [up to 3 {"original": "...", "corrected": "...", "explanation_es": "...", "pattern": "..."}]}`);
  return ask(sys, [user(...parts)], { temperature: 0.2 });
}
