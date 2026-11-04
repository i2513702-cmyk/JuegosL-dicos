# LudoApp · Juegos Lúdicos

Plataforma de juegos educativos para el aula: los estudiantes responden preguntas para avanzar en **Ludo, Batalla, Carrera y Conquista**, y el docente puede observar las partidas en vivo.

## Inicio rápido

```bash
npm install
npm run live      # http://localhost:8787  (servidor en vivo con Socket.IO)
```

Otros dispositivos en la misma WiFi: `http://IP-de-tu-PC:8787`.

## Estructura

| Carpeta / archivo | Contenido |
|---|---|
| `index.html`, `ver.html`, `live.html`, `partida.html` | Páginas: app principal, vista docente, quiz tipo Kahoot, partida en red |
| `js/core/` | Motor de preguntas, progresión, almacenamiento, sincronización, avatares |
| `js/games/` | Los cuatro juegos |
| `js/shared/ludo-rules.js` | Reglas de Ludo compartidas entre cliente y servidor |
| `servidor-live.js` | Servidor en vivo (producción): sync, quiz, observación docente |
| `servidor/` | Lógica de partidas en red y preguntas |
| `servidor.js` | Servidor local simple (usado por las pruebas de navegador) |
| `api/`, `db/`, `scripts/` | API opcional con Supabase, esquema SQL y semillas |
| `avatares/` | Sistema de avatares y su documentación |
| `.archivo/` | Copias antiguas (no se sirven ni se despliegan) |

## Variables de entorno

| Variable | Uso |
|---|---|
| `HOST_KEY` | **Obligatoria en producción.** Clave del docente; si falta, cualquiera puede ser host |
| `PORT` | Puerto (por defecto 8787) |
| `LUDO_DATA_FILE` | Archivo donde se guarda el sync (opcional) |

La API de Supabase (`npm run api`) necesita un `.env` con `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY` y `APP_SECRET` (ver `.env.example`). El servidor en vivo no lo necesita.

## Pruebas

```bash
npm test                 # reglas de Ludo, preguntas y partidas por socket
npm run test:navegador   # pruebas de interfaz (requieren Microsoft Edge en Windows)
```

## Despliegue

Ver [`DESPLIEGUE.md`](DESPLIEGUE.md) (Render o Railway, una sola réplica).

## Antes de usarlo con estudiantes

- Cambia las claves de demo (`1234`) de `js/core/data.js`.
- Define `HOST_KEY` en el servicio de despliegue.
- No hagas `push` en plena clase: el servidor se reinicia y se pierden las sesiones.
