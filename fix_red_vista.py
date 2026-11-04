with open('js/red.js','r',encoding='utf-8-sig') as f:
    s = f.read()

old = """  /* --------------------------- juego --------------------------- */
  function vistaJuego() {
    const NET = App.net;
    enJuego = true;
    soltar();
    raiz.innerHTML = '';
    raiz.classList.add('game-view');
    App.ludoInGame = true;
    const cont = ui.el('div', '', '');
    raiz.appendChild(cont);
    const sala = NET.sala ? NET.sala() : {};
    const juego = sala.juego || 'ludo';
    try {
      if (juego === 'ludo' && App.games && App.games.ludo && typeof App.games.ludo.initNet === 'function') {
        App.games.ludo.initNet({ container: cont, codigo: NET.codigo(), rol: NET.rol(), yo: NET.yo() });
        return;
      }
      if (App.games && App.games[juego] && typeof App.games[juego].initNet === 'function') {
        App.games[juego].initNet({ container: cont, codigo: NET.codigo(), rol: NET.rol(), yo: NET.yo() });
        return;
      }
      cont.appendChild(ui.el('div', 'p-4 text-amber-700 bg-amber-50 rounded', 'Este juego en red aún no tiene vista cliente (falta initNet). Juego: ' + esc(juego)));
    } catch (e) {
      console.error(e);
      cont.appendChild(ui.el('div', 'p-4 text-rose-50 bg-rose-50 rounded', 'No se pudo dibujar la partida: ' + esc(e.message)));
    }
  }"""

neu = """  /* --------------------------- juego --------------------------- */
  function vistaJuego() {
    const NET = App.net;
    enJuego = true;
    soltar();
    raiz.innerHTML = '';
    raiz.classList.add('game-view');
    App.ludoInGame = true;
    const sala = NET.sala ? NET.sala() : {};
    const juego = sala.juego || 'ludo';
    const ESCENARIOS = {
      ludo: { file: 'tablero-ludo.svg', w: 384, h: 384 },
      batalla: { file: 'campo-de-batalla.svg', w: 680, h: 380 },
      carrera: { file: 'pista-de-carreras.svg', w: 680, h: 380 },
      conquista: { file: 'terreno-de-conquista.svg', w: 680, h: 380 }
    };
    const stage = ui.el('div', 'game-stage', '');
    const board = ui.el('div', 'game-board', '');
    const side = ui.el('div', 'game-side', '');
    const escDef = ESCENARIOS[juego];
    if (escDef) {
      const escena = ui.el('div', 'escena', '');
      escena.style.aspectRatio = escDef.w + ' / ' + escDef.h;
      if (escDef.w === escDef.h) escena.classList.add('escena-cuadrada');
      const bg = document.createElement('img');
      bg.className = 'escenario-capa';
      bg.src = 'escenarios-estaticos/' + escDef.file;
      bg.alt = '';
      bg.setAttribute('aria-hidden', 'true');
      bg.width = escDef.w; bg.height = escDef.h;
      bg.decoding = 'async';
      escena.appendChild(bg);
      const capa = ui.el('div', 'escena-capa', '');
      escena.appendChild(capa);
      board.appendChild(escena);
      stage.appendChild(board);
    } else {
      stage.appendChild(board);
    }
    stage.appendChild(side);
    raiz.appendChild(stage);
    try {
      const cfg = { container: side, codigo: NET.codigo(), rol: NET.rol(), yo: NET.yo ? NET.yo() : null };
      if (escDef) { cfg.escena = board.querySelector('.escena'); cfg.escenaCapa = board.querySelector('.escena-capa'); cfg.escenaSize = { w: escDef.w, h: escDef.h }; }
      if (juego === 'ludo' && App.games && App.games.ludo && typeof App.games.ludo.initNet === 'function') {
        App.games.ludo.initNet(cfg);
        return;
      }
      if (App.games && App.games[juego] && typeof App.games[juego].initNet === 'function') {
        App.games[juego].initNet(cfg);
        return;
      }
      side.appendChild(ui.el('div', 'p-4 text-amber-700 bg-amber-50 rounded', 'Este juego en red aún no tiene vista cliente (falta initNet). Juego: ' + esc(juego)));
    } catch (e) {
      console.error(e);
      side.appendChild(ui.el('div', 'p-4 text-rose-700 bg-rose-50 rounded', 'No se pudo dibujar la partida: ' + esc(e.message)));
    }
  }"""

if old in s:
    s2 = s.replace(old, neu)
    with open('js/red.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
