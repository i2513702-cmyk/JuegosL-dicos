@echo off
rem ========================================
rem  LudoApp - servidor local de demo
rem  Comparte las salas entre navegadores
rem  de esta misma PC (Edge, Opera GX, ...)
rem  Uso: doble clic sobre este archivo.
rem ========================================
cd /d "%~dp0"
echo.
echo  Arrancando LudoApp local en http://localhost:8787 ...
echo  Abri este enlace en Edge Y en Opera GX para que se vean las salas.
echo.
start http://localhost:8787
node servidor.js
pause