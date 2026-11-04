# LudoApp en vivo · despliegue (Render o Railway)

## 1. Desplegar
**Render (gratis):** render.com → New → Web Service → conecta el repo (detecta `render.yaml`) → plan Free.
**Railway:** railway.com → New Project → Deploy from GitHub repo (rama `main`). Ejecuta `npm start` solo.
En ambos: en *Environment / Variables* agrega `HOST_KEY` = una clave que solo conozca el docente.
Railway: Settings → Networking → *Generate Domain*. Usa **una sola réplica** (las salas viven en memoria).

## 2. Observar partidas en vivo (docente ↔ grupos)
1. El docente prepara sus preguntas en `index.html` → **Panel docente → 📝 Preguntas** (desde el navegador que usará en clase).
2. El docente abre **`/ver.html`**, escribe la clave (`HOST_KEY`) y pulsa **Crear sesión de observación**.
   Aparece un **CÓDIGO** (5 caracteres). Sus preguntas se envían solas a los grupos.
3. Cada grupo (2 a 4 estudiantes por dispositivo) abre **`/index.html`**, inicia sesión (acceso rápido de alumno),
   pulsa **📡 Docente**, escribe el código y el nombre del grupo (ej. "Mesa 1").
4. En **Jugar en grupo** eligen juego, curso, integrantes y pulsan **Empezar partida**.
5. En `/ver.html` aparece un recuadro por grupo con su partida en vivo. **⤢** amplía un grupo, **✕** lo saca.

> La partida corre en el dispositivo de cada grupo (por turnos, como siempre). Lo que ve el docente es una
> transmisión de esa pantalla (solo lectura). Si se cierra la sesión o se reinicia el servidor, los grupos
> deben volver a entrar con el código.

## 3. Otras funciones
- **Quiz estilo Kahoot:** `/live.html` (sin cambios).
- **Salas con código de sala (modo anterior):** ahora también sincronizan en línea (`/api/sync`).
  Ojo: ese modo sigue ejecutando el juego en el dispositivo del docente.

## 4. Notas
- Plan gratis de Render: se duerme tras ~15 min sin uso; abre la URL 1 o 2 minutos antes de la clase.
- No hagas `push` a `main` en plena clase: el servidor se reinicia y se pierden las sesiones activas.
- Local: `npm install && npm run live` → http://localhost:8787 (otros dispositivos en la misma WiFi: http://IP-de-tu-PC:8787).
