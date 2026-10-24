# Mi Inglés: tu app de inglés conversacional

Esta es una app web instalable (PWA) para iPhone. Tiene tres piezas:

- **Tutor:** usa Gemini (Google AI Studio) para escucharte, responderte y corregirte.
- **Voz:** usa ElevenLabs.
- **Respaldo:** si ElevenLabs falla o se acaban los créditos, la app usa automáticamente la voz del iPhone.

## Qué necesitas

| Servicio | Para qué | Costo |
|---|---|---|
| Clave de Gemini en [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Conversación, transcripción, correcciones y evaluaciones | Tiene capa gratuita con límites por minuto y por día. En la capa gratuita, Google puede usar los datos para mejorar sus productos. |
| Clave de ElevenLabs en [elevenlabs.io › API Keys](https://elevenlabs.io/app/settings/api-keys) | Voz natural del tutor | El plan gratuito trae 10.000 créditos al mes, que alcanzan solo para probar unos días. Para uso diario se recomienda el plan Creator (22 USD/mes, 121.000 créditos). |
| Un hosting HTTPS gratuito (GitHub Pages, Netlify o Cloudflare Pages) | Abrir la app en el iPhone | Gratis |

**Consumo estimado:** una sesión de 40 minutos usa unos 8.000–10.000 caracteres de voz. Los modelos Flash cuestan entre 0,5 y 1 crédito por carácter, según el plan. En **Ajustes** puedes poner un tope mensual; al llegar a él, la app pasa a la voz del iPhone.

### Permisos de la clave de ElevenLabs

Al crear la clave en ElevenLabs:

- Activa los permisos **Text to Speech** y **Voices (read)**.
- Si quieres ver tus créditos dentro de la app, activa también **User (read)**.
- Ponle un límite de créditos a la propia clave.

## Publicar la app (una sola vez)

La app necesita HTTPS para que el iPhone permita usar el micrófono. Elige una de estas dos opciones.

**Opción A: Netlify Drop (la más rápida, desde un computador)**

1. Crea una cuenta gratis en netlify.com.
2. Entra en https://app.netlify.com/drop.
3. Arrastra la carpeta `speakdaily` completa.
4. Netlify te dará una dirección del tipo `https://algo.netlify.app`.

**Opción B: GitHub Pages**

1. Crea un repositorio y sube el contenido de la carpeta.
2. En el repositorio, ve a **Settings › Pages** y elige **Deploy from branch** con la rama `main`.

## Instalar en el iPhone

1. Abre la dirección de tu app en **Safari**.
2. Toca **Compartir › Agregar a pantalla de inicio**.
3. Abre la app desde el ícono. La primera vez te pedirá permiso para el micrófono: acéptalo.
4. Si alguna vez rechazaste el permiso del micrófono, actívalo en **Ajustes del iPhone › Apps › Safari › Micrófono**.

## Cómo funciona

1. **Incorporación:** aceptas el consentimiento, cuentas tu meta e intereses, conectas tus claves y pruebas el micrófono.
2. **Diagnóstico:** son 4 audios de escucha y 4 preguntas orales, de A1 a B2. Con eso la app estima tu nivel por habilidad y arma un plan hacia B1 o B2.
3. **Sesión diaria de 40 minutos:**
   - Repaso espaciado
   - Diálogo para escuchar (primero sin texto)
   - Conversación de voz por turnos con un tutor de IA
   - Shadowing de pronunciación
   - Práctica de tus 3 errores más útiles
   - Reto final sin ayuda
4. **Días complicados:** también hay sesiones de 20, 10 y 5 minutos.
5. **Temporizador:** solo cuenta tiempo activo. Se detiene mientras la IA procesa.
6. **Si cierras la app a mitad de sesión:** al volver, aparece el botón "Continuar sesión de hoy".
7. **Evaluación semanal:** cada 7 días (con al menos 3 sesiones) se desbloquea una evaluación. Una de cada cuatro es mensual e incluye una tarea MCER adicional. Los niveles suben como máximo 0,5 por semana, para exigir evidencia sostenida.
8. **Racha flexible:** la meta es de días por semana. Descansar no rompe nada.

## Privacidad y seguridad

- **Tus datos:** el progreso, las expresiones, los errores y las sesiones se guardan **solo en el teléfono** (IndexedDB).
- **Control:** en Ajustes puedes ver, exportar, importar y borrar tus datos. Las copias exportadas no incluyen tus claves.
- **Grabaciones:** tus grabaciones se envían a Gemini para analizarlas y la app no las guarda.
- **Texto del tutor:** se envía a ElevenLabs para convertirlo en voz.
- **Claves:** las claves no están escritas en el código. Se guardan solo en tu dispositivo y viajan directamente a Google y ElevenLabs. Como es una app personal sin servidor, conviene limitarlas:
  - En ElevenLabs, ponle a la clave un límite de créditos y solo los permisos necesarios.
  - En Google Cloud Console, en **Credenciales**, restringe la clave de Gemini a la *Generative Language API* y a la dirección de tu sitio (restricción por sitio web).

## Limitaciones conocidas en iPhone

- **Sin conexión:** el tutor necesita internet. Sin conexión solo funciona el repaso de tarjetas.
- **Segundo plano:** si sales de la app o bloqueas el teléfono, iOS pausa el audio y el micrófono. La sesión se guarda y continúa al volver.
- **Conversación por turnos:** tocas para hablar, tocas para terminar y el tutor responde en unos segundos. No es una llamada de voz continua.
- **Modo privado:** en una pestaña privada de Safari no se guarda el progreso.
- **Datos borrados por iOS:** iOS puede borrar los datos de webs que no se abren en semanas. Instalar la app en la pantalla de inicio lo evita casi siempre, pero exporta una copia de vez en cuando.
- **Niveles:** son estimaciones de la IA, no certificaciones oficiales.

## Actualizar sin perder el progreso

1. Sube los archivos nuevos al mismo hosting.
2. Cambia `VERSION` en `sw.js`.
3. La app avisará que hay una versión nueva. Tus datos no se tocan.

## Pruebas incluidas

- `node tests/logic.test.mjs`: 14 pruebas de repetición espaciada, niveles, plan, audio WAV, interpretación de JSON y sesiones.
- `node tests/e2e.test.cjs`: flujo completo en un iPhone simulado con Gemini y ElevenLabs simulados. Necesita Playwright y un servidor local en el puerto 8765.
  - Cubre registro, micrófono, diagnóstico, sesión completa, corrección, guardado, recuperación de sesión, evaluación semanal, exportación, voz de respaldo y modo oscuro.
- En **Ajustes › Modo de prueba** puedes cargar 14 días de datos de ejemplo para ver el panel.
