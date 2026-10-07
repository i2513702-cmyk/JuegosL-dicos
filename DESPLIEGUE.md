# LudoApp en vivo · despliegue gratuito (Render)
1. Sube el repo a GitHub (ya lo está).
2. render.com → New → Web Service → conecta el repo (detecta render.yaml). Plan: Free.
3. En Environment agrega HOST_KEY = una clave que solo conozca el docente.
4. Abre la URL (https://ludoapp-live.onrender.com). Docente: "Crear partida". Alumnos: PIN en su celular.
Nota: el plan gratis se duerme tras ~15 min sin uso; abre la URL 1 minuto antes de la clase.
Local: npm install && npm run live  → http://localhost:8787 (alumnos en la misma WiFi: http://IP-de-tu-PC:8787)
