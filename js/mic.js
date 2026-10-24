// Botón grande de micrófono con estados claros: listo, escuchando, procesando, hablando.
import { Recorder, MicError, unlockAudio, stopSpeaking } from './voice.js';
import { blobToBase64 } from './gemini.js';
import { icon, toast } from './ui.js';

const LABELS = {
  idle: 'Toca para hablar',
  rec: 'Te escucho… toca para terminar',
  busy: 'Procesando…',
  speak: 'Hablando… (toca para saltar)',
  off: '',
};

export function micHTML(id = 'mic', extraTools = '') {
  return `<div class="mic-dock">
    <div class="mic-state" id="${id}-state" aria-live="polite">${LABELS.idle}</div>
    <button class="mic" id="${id}" aria-label="Hablar">${icon.mic}</button>
    ${extraTools ? `<div class="mic-tools">${extraTools}</div>` : ''}
  </div>`;
}

/**
 * Conecta el botón. onAudio({b64, seconds, blob}) se llama al terminar de grabar.
 */
export function bindMic(id, { onAudio, maxSeconds = 90, onBusyChange } = {}) {
  const btn = document.getElementById(id);
  const label = document.getElementById(id + '-state');
  let state = 'idle';
  let rec = null;

  const set = (s, text) => {
    state = s;
    btn.classList.toggle('rec', s === 'rec');
    btn.classList.toggle('busy', s === 'busy');
    btn.disabled = s === 'busy' || s === 'off';
    btn.innerHTML = s === 'rec' ? icon.stop : s === 'speak' ? icon.next : icon.mic;
    btn.setAttribute('aria-label', s === 'rec' ? 'Terminar de hablar' : s === 'speak' ? 'Saltar audio' : 'Hablar');
    label.innerHTML = text ?? LABELS[s];
    if (s !== 'rec') btn.style.setProperty('--lvl', 0);
    if (onBusyChange) onBusyChange(s === 'busy');
  };

  const finish = async () => {
    if (!rec) return;
    const r = rec; rec = null;
    const { blob, seconds, silent } = r.stop();
    if (silent) { set('idle', 'No te escuché bien. Toca e inténtalo otra vez.'); return; }
    set('busy');
    try {
      const b64 = await blobToBase64(blob);
      await onAudio({ b64, seconds, blob });
    } catch (e) {
      toast(e.message || 'Algo falló. Inténtalo de nuevo.', 5000);
      set('idle');
    }
  };

  btn.addEventListener('click', async () => {
    unlockAudio();
    if (state === 'speak') { stopSpeaking(); return; }
    if (state === 'rec') { finish(); return; }
    if (state !== 'idle') return;
    try {
      rec = new Recorder({ maxSeconds, onLevel: l => btn.style.setProperty('--lvl', l.toFixed(2)), onAutoStop: finish });
      await rec.start();
      set('rec');
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (e) {
      rec = null;
      set('idle', e instanceof MicError ? 'Micrófono no disponible' : LABELS.idle);
      toast(e.message || 'No se pudo usar el micrófono.', 7000);
    }
  });

  return {
    set,
    get state() { return state; },
    cancel() { if (rec) { rec.cancel(); rec = null; } set('idle'); },
  };
}
