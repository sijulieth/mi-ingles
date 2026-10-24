// Contenido pedagógico base. La IA lo amplía y personaliza en cada sesión.

// Tutores de IA. El acento se introduce de forma gradual según el nivel.
export const PERSONAS = [
  { id: 'emma', name: 'Emma', from: 'Seattle, USA', accent: 'american', gender: 'female', minLevel: 0,
    vibe: 'warm, curious, a bit funny; works as a graphic designer and loves hiking and coffee' },
  { id: 'jake', name: 'Jake', from: 'Chicago, USA', accent: 'american', gender: 'male', minLevel: 0,
    vibe: 'friendly, relaxed dad of two; teaches high-school science and cooks on weekends' },
  { id: 'olivia', name: 'Olivia', from: 'Manchester, UK', accent: 'british', gender: 'female', minLevel: 2.6,
    vibe: 'chatty nurse, loves gardening, travel stories and dry humour' },
  { id: 'liam', name: 'Liam', from: 'Sydney, Australia', accent: 'australian', gender: 'male', minLevel: 3.4,
    vibe: 'easygoing surfer turned project manager; direct, upbeat, uses some Aussie expressions' },
];

export function pickPersona(level, recentIds = []) {
  const ok = PERSONAS.filter(p => (level ?? 1) >= p.minLevel);
  const fresh = ok.filter(p => !recentIds.includes(p.id));
  const pool = fresh.length ? fresh : ok;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Escenarios basados en tareas reales, por nivel (1=A1 ... 4=B2).
export const SCENARIOS = [
  // A1
  { id: 'intro', level: 1, title: 'Presentarte', task: 'Introduce yourself: name, where you live, family, what you do.',
    chunks: [['Nice to meet you.', 'Encantada de conocerte.'], ['I live in…', 'Vivo en…'], ['I have two kids.', 'Tengo dos hijos.'], ['What about you?', '¿Y tú?']] },
  { id: 'cafe', level: 1, title: 'Pedir en una cafetería', task: 'Order a drink and something to eat in a café, ask the price.',
    chunks: [['Can I have a…, please?', '¿Me das un…, por favor?'], ['How much is it?', '¿Cuánto cuesta?'], ['For here or to go?', '¿Para tomar aquí o para llevar?'], ['That’s all, thanks.', 'Eso es todo, gracias.']] },
  { id: 'routine', level: 1, title: 'Tu día a día', task: 'Talk about your daily routine: mornings, kids, work, evenings.',
    chunks: [['I usually get up at…', 'Normalmente me levanto a las…'], ['In the morning, I…', 'Por la mañana, yo…'], ['I take my kids to school.', 'Llevo a mis hijos al colegio.'], ['After that,…', 'Después de eso,…']] },
  { id: 'likes', level: 1, title: 'Gustos y tiempo libre', task: 'Talk about what you like doing in your free time.',
    chunks: [['I really like…', 'Me gusta mucho…'], ['I’m not a big fan of…', 'No me encanta…'], ['In my free time,…', 'En mi tiempo libre,…'], ['How about you?', '¿Y a ti?']] },
  { id: 'directions', level: 1, title: 'Pedir direcciones', task: 'Ask how to get to a place and understand simple directions.',
    chunks: [['Excuse me, where is…?', 'Disculpa, ¿dónde está…?'], ['Is it far from here?', '¿Está lejos de aquí?'], ['Go straight and turn left.', 'Sigue derecho y gira a la izquierda.'], ['Could you repeat that?', '¿Podrías repetirlo?']] },
  // A2
  { id: 'weekend', level: 2, title: 'Contar tu fin de semana', task: 'Tell what you did last weekend and ask about theirs.',
    chunks: [['Last weekend, I went to…', 'El fin de semana pasado fui a…'], ['It was really fun.', 'Fue muy divertido.'], ['We had a great time.', 'La pasamos muy bien.'], ['How was your weekend?', '¿Qué tal tu fin de semana?']] },
  { id: 'shopping', level: 2, title: 'De compras', task: 'Buy clothes: ask for a size, try something on, return an item.',
    chunks: [['Do you have this in a medium?', '¿Lo tienes en talla M?'], ['Can I try it on?', '¿Me lo puedo probar?'], ['I’d like to return this.', 'Quisiera devolver esto.'], ['It doesn’t fit.', 'No me queda bien.']] },
  { id: 'doctor', level: 2, title: 'En el médico', task: 'Explain to a doctor that your child feels sick and ask what to do.',
    chunks: [['She’s had a fever since…', 'Tiene fiebre desde…'], ['It hurts here.', 'Le duele aquí.'], ['Should I give her…?', '¿Debería darle…?'], ['How often should she take it?', '¿Cada cuánto debe tomarlo?']] },
  { id: 'plans', level: 2, title: 'Hacer planes', task: 'Make plans with a friend: suggest, accept, decline and agree on a time.',
    chunks: [['Are you free on…?', '¿Estás libre el…?'], ['How about…?', '¿Qué tal si…?'], ['I’d love to, but…', 'Me encantaría, pero…'], ['Let’s meet at…', 'Quedemos a las…']] },
  { id: 'hotel', level: 2, title: 'Viaje y hotel', task: 'Check in at a hotel, ask about breakfast and solve a small problem with the room.',
    chunks: [['I have a reservation under…', 'Tengo una reserva a nombre de…'], ['What time is breakfast?', '¿A qué hora es el desayuno?'], ['There’s a problem with…', 'Hay un problema con…'], ['Could you send someone up?', '¿Podría enviar a alguien?']] },
  // B1
  { id: 'experience', level: 3, title: 'Narrar una experiencia', task: 'Tell a story about a memorable or difficult experience, with details and feelings.',
    chunks: [['I’ll never forget the time…', 'Nunca olvidaré la vez que…'], ['At first, I thought…', 'Al principio pensé…'], ['It turned out that…', 'Resultó que…'], ['Looking back,…', 'Mirando hacia atrás,…']] },
  { id: 'opinions', level: 3, title: 'Dar tu opinión', task: 'Share and justify your opinion about screen time for children.',
    chunks: [['In my opinion,…', 'En mi opinión,…'], ['It depends on…', 'Depende de…'], ['I see your point, but…', 'Entiendo tu punto, pero…'], ['What do you think?', '¿Qué opinas?']] },
  { id: 'work', level: 3, title: 'Hablar de trabajo', task: 'Describe your job or the job you would like, your responsibilities and challenges.',
    chunks: [['I’m in charge of…', 'Estoy a cargo de…'], ['The hardest part is…', 'Lo más difícil es…'], ['I’ve been working there for…', 'Llevo trabajando allí…'], ['I’m thinking about…', 'Estoy pensando en…']] },
  { id: 'problem', level: 3, title: 'Resolver un imprevisto', task: 'Your flight was cancelled. Explain the situation and negotiate a solution.',
    chunks: [['I was wondering if…', 'Me preguntaba si…'], ['Is there any way…?', '¿Hay alguna forma de…?'], ['That would be great.', 'Eso sería genial.'], ['I’m afraid that doesn’t work for me.', 'Me temo que eso no me sirve.']] },
  { id: 'parenting', level: 3, title: 'Crianza y familia', task: 'Talk about the joys and challenges of raising young kids and balancing time.',
    chunks: [['It’s a lot to juggle.', 'Es mucho que equilibrar.'], ['The best part is…', 'Lo mejor es…'], ['I try to make time for…', 'Intento sacar tiempo para…'], ['It can be exhausting, but…', 'Puede ser agotador, pero…']] },
  // B2
  { id: 'debate', level: 4, title: 'Debate', task: 'Debate whether remote work is better than office work. Defend your position and respond to counter-arguments.',
    chunks: [['On the one hand,… on the other hand,…', 'Por un lado,… por otro,…'], ['That’s a fair point, however…', 'Es un punto válido, sin embargo…'], ['The way I see it,…', 'Tal como yo lo veo,…'], ['It’s not that simple.', 'No es tan simple.']] },
  { id: 'explain', level: 4, title: 'Explicar un proceso', task: 'Explain in detail how to do something you know well, anticipating questions.',
    chunks: [['The first thing you need to do is…', 'Lo primero que tienes que hacer es…'], ['Make sure you…', 'Asegúrate de…'], ['Otherwise,…', 'De lo contrario,…'], ['Does that make sense?', '¿Tiene sentido?']] },
  { id: 'news', level: 4, title: 'Comentar una noticia', task: 'Discuss a recent news topic: summarize it, give your view and speculate about consequences.',
    chunks: [['From what I’ve read,…', 'Por lo que he leído,…'], ['It’s likely that…', 'Es probable que…'], ['I wouldn’t be surprised if…', 'No me sorprendería que…'], ['That raises the question of…', 'Eso plantea la pregunta de…']] },
  { id: 'interview', level: 4, title: 'Entrevista de trabajo', task: 'Role-play a job interview: strengths, weaknesses, a challenge you overcame.',
    chunks: [['One of my strengths is…', 'Una de mis fortalezas es…'], ['I’d say that…', 'Diría que…'], ['A good example of that is…', 'Un buen ejemplo de eso es…'], ['I learned a lot from…', 'Aprendí mucho de…']] },
  { id: 'complain', level: 4, title: 'Reclamar con diplomacia', task: 'Make a polite but firm complaint about a service and reach an agreement.',
    chunks: [['I’d like to raise an issue about…', 'Quisiera plantear un problema sobre…'], ['To be honest, I expected…', 'Para ser sincera, esperaba…'], ['Would it be possible to…?', '¿Sería posible…?'], ['I’d appreciate it if…', 'Te agradecería si…']] },
];

export function pickScenario(level, recentIds = [], interests = []) {
  const band = Math.max(1, Math.min(4, Math.round(level ?? 1.5)));
  // Mezcla el nivel actual con repaso del nivel anterior (intercalado).
  let pool = SCENARIOS.filter(s => s.level === band || s.level === band - 1 && Math.random() < 0.25);
  const fresh = pool.filter(s => !recentIds.includes(s.id));
  if (fresh.length) pool = fresh;
  const tagged = pool.filter(s => interests.some(i => s.title.toLowerCase().includes(i) || s.task.toLowerCase().includes(i)));
  const final = tagged.length && Math.random() < 0.5 ? tagged : pool;
  return final[Math.floor(Math.random() * final.length)];
}

// Sonidos difíciles típicos para hispanohablantes.
export const PRON_FOCUS = [
  { id: 'i-ee', title: 'i corta vs. ii larga', tip: 'En "ship" la i es corta y relajada; en "sheep" es larga y tensa.', words: ['ship / sheep', 'live / leave', 'it / eat'], sentence: 'Please sit in this seat.' },
  { id: 'th', title: 'Sonido th', tip: 'Pon la punta de la lengua entre los dientes y sopla suave.', words: ['think', 'three', 'this', 'mother'], sentence: 'I think they’re both there.' },
  { id: 's-cluster', title: 's inicial sin "e"', tip: 'No digas "es-pain": empieza directamente con la s.', words: ['Spain', 'school', 'street', 'study'], sentence: 'She studies Spanish at school.' },
  { id: 'ed', title: 'Terminación -ed', tip: 'Suena /t/ (walked), /d/ (played) o /id/ solo tras t o d (wanted).', words: ['walked', 'played', 'wanted', 'needed'], sentence: 'I walked home and cooked dinner.' },
  { id: 'v-b', title: 'v vs. b', tip: 'La v se hace con el labio inferior tocando los dientes de arriba.', words: ['very / berry', 'vote / boat', 'have'], sentence: 'We have a very big van.' },
  { id: 'h', title: 'h aspirada', tip: 'La h inglesa es un soplo suave, no la j española fuerte.', words: ['hello', 'happy', 'house', 'who'], sentence: 'Her house is behind the hill.' },
  { id: 'schwa', title: 'Sonido schwa y acento', tip: 'Las sílabas no acentuadas se reducen a un sonido neutro "uh".', words: ['banana', 'about', 'problem', 'today'], sentence: 'I was about to call you today.' },
  { id: 'final-cons', title: 'Consonantes finales', tip: 'Pronuncia la consonante final: no es lo mismo "car" que "card".', words: ['cold', 'help', 'friend', 'asked'], sentence: 'My friend asked for help.' },
  { id: 'linking', title: 'Unir palabras', tip: 'En inglés las palabras se encadenan: "turn it off" suena "tur-ni-toff".', words: ['turn it off', 'pick it up', 'an apple'], sentence: 'Could you pick it up at eight?' },
];

export function pickPronFocus(problemIds = [], recent = []) {
  const prioritized = PRON_FOCUS.filter(p => problemIds.includes(p.id) && !recent.includes(p.id));
  const pool = prioritized.length ? prioritized : PRON_FOCUS.filter(p => !recent.includes(p.id));
  const list = pool.length ? pool : PRON_FOCUS;
  return list[Math.floor(Math.random() * list.length)];
}

// Diagnóstico: escucha (A1→B2) y habla (A1→B2).
export const DIAG_LISTENING = [
  { level: 1, text: 'Hi! My name is Sarah. I have a brother and a sister. My brother is ten years old.',
    q: '¿Cuántos años tiene el hermano de Sarah?', options: ['Siete', 'Diez', 'Doce'], answer: 1 },
  { level: 2, text: 'I usually take the bus to work, but yesterday it was raining so hard that my husband drove me instead. I got there twenty minutes early!',
    q: '¿Qué pasó ayer?', options: ['Llegó tarde al trabajo por el bus', 'Su esposo la llevó y llegó temprano', 'Se quedó en casa por la lluvia'], answer: 1 },
  { level: 3, text: 'To be honest, I was planning to move to a bigger apartment this year, but prices have gone up so much that I’ve decided to stay where I am and maybe redecorate instead.',
    q: '¿Qué decidió la persona?', options: ['Mudarse a un apartamento más grande', 'Quedarse y quizás redecorar', 'Comprar una casa este año'], answer: 1 },
  { level: 4, text: 'While I can see why companies are pushing people back to the office, I’d argue the real issue isn’t location at all — it’s whether managers actually trust their teams to get the job done without constant supervision.',
    q: 'Según la persona, ¿cuál es el problema de fondo?', options: ['La ubicación de la oficina', 'La confianza de los jefes en sus equipos', 'Que la gente no quiere trabajar'], answer: 1 },
];

export const DIAG_SPEAKING = [
  { level: 1, prompt: 'Introduce yourself. What’s your name, where do you live, and who do you live with?', es: 'Preséntate: nombre, dónde vives y con quién.' },
  { level: 2, prompt: 'Describe a typical day in your life, from morning to night.', es: 'Describe un día normal en tu vida.' },
  { level: 3, prompt: 'Tell me about a trip or an experience you’ll never forget. What happened, and how did you feel?', es: 'Cuéntame una experiencia que nunca olvidarás.' },
  { level: 4, prompt: 'Some people think children shouldn’t have smartphones until they’re teenagers. Do you agree? Explain your reasons and consider the other side.', es: '¿Los niños deberían tener celular? Argumenta y considera la otra postura.' },
];

export const INTERESTS = [
  ['familia', 'Familia y crianza'], ['trabajo', 'Trabajo'], ['viajes', 'Viajes'], ['comida', 'Cocina y comida'],
  ['series', 'Series y películas'], ['música', 'Música'], ['salud', 'Salud y bienestar'], ['deporte', 'Deporte'],
  ['compras', 'Compras'], ['tecnología', 'Tecnología'], ['naturaleza', 'Naturaleza'], ['libros', 'Libros'],
];

// Duración de cada paso (minutos) según el modo de sesión.
export const MODES = {
  40: { label: 'Sesión completa', steps: [['review', 5], ['listening', 7], ['conversation', 15], ['pronunciation', 5], ['corrections', 5], ['exit', 3]] },
  20: { label: '20 minutos', steps: [['review', 3], ['listening', 4], ['conversation', 8], ['corrections', 3], ['exit', 2]] },
  10: { label: '10 minutos', steps: [['review', 2], ['conversation', 6], ['corrections', 2]] },
  5:  { label: '5 minutos', steps: [['review', 2], ['conversation', 3]] },
};
export const STEP_NAMES = {
  review: 'Repaso activo', listening: 'Comprensión auditiva', conversation: 'Conversación',
  pronunciation: 'Pronunciación', corrections: 'Corrección', exit: 'Reto final',
};
