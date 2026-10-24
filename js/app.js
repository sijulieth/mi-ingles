// Punto de entrada.
import { S, loadAll, go } from './store.js';
import { configureVoice, unlockAudio } from './voice.js';
import { configureTutor } from './tutor.js';
import { toast, mount, esc } from './ui.js';
import './onboarding.js';
import './session.js';
import './screens.js';

configureVoice(() => S.settings, msg => toast(msg, 5000));
configureTutor(() => ({ key: S.settings.geminiKey, model: S.settings.geminiModel }));

// El primer toque en cualquier parte desbloquea el audio en iOS.
document.addEventListener('touchend', unlockAudio, { once: true, passive: true });
document.addEventListener('click', unlockAudio, { once: true });

window.addEventListener('offline', () => toast('Sin conexión. El tutor necesita internet; tu progreso queda guardado.'));
window.addEventListener('online', () => toast('Conexión recuperada.'));
window.addEventListener('unhandledrejection', e => { console.error(e.reason); if (e.reason && e.reason.message) toast(e.reason.message, 5000); });

async function boot() {
  try {
    await loadAll();
  } catch (e) {
    mount(`<main class="screen no-nav"><h1>No se pudo abrir tu progreso</h1><p class="muted">${esc(e.message || e)}</p><p class="small">Si estás en una ventana privada de Safari, ábrela en una normal: el modo privado no permite guardar datos.</p></main>`);
    return;
  }
  const p = S.profile;
  if (!p || !p.consentAt) return go('welcome');
  if (!S.settings.geminiKey) return go('keys');
  if (!p.levels) return go('diag');
  go('home');
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Hay una versión nueva. Cierra y vuelve a abrir la app para actualizar. Tu progreso no se pierde.', 7000);
      });
    });
  }).catch(() => {});
}

boot();
