with open('js/games/conquista.js','r',encoding='utf-8-sig') as f:
    s = f.read()

old = """    function paintMap() {
      mapEl.innerHTML = '';
      zones.forEach((z, idx) => {
        const btn = ui.el('button', 'cq-zone' + (z.owner === null ? ' cq-neutral' : ''), '');
        if (inScene) {
          /* la parcela se alinea con la retícula del SVG (tablero 40..640 x 20..360
             en un lienzo de 680x380), en % para que escale en celular */
          btn.style.left = (SCENE.BOARD_X + z.c * SCENE.CELL_W) / SCENE.W * 100 + '%';
          btn.style.top = (SCENE.BOARD_Y + z.r * SCENE.CELL_H) / SCENE.H * 100 + '%';
          btn.style.width = SCENE.CELL_W / SCENE.W * 100 + '%';
          btn.style.height = SCENE.CELL_H / SCENE.H * 100 + '%';
        } else {
          /* sin escenario: las celdas las mide la retícula CSS del grid */
          btn.style.position = 'static';
          btn.style.width = '100%';
          btn.style.height = '100%';
        }
        if (z.owner === null) {
          btn.appendChild(ui.el('span', 'cq-flag', '🌫️'));
        } else {
          const ch = players[z.owner].avatar || App.avatars.pick(z.owner);
          const cnv = document.createElement('canvas');
          cnv.width = cnv.height = 26;
          cnv.className = 'avatar-canvas';
          const g = cnv.getContext('2d');
          App.avatars.drawIcon(g, 5, 5, 1, ch, 'right');
          btn.appendChild(cnv);
          const s = ui.teamStyle(players[z.owner].color);
          /* solo un velo del color del equipo: se ve el terreno debajo */
          btn.style.background = s.color + '38';
          btn.style.boxShadow = 'inset 0 0 0 2px ' + s.color;
          btn.title = players[z.owner].nombre;
        }
        if (state.target === idx) btn.classList.add('cq-target');
        btn.addEventListener('click', () => { if (state.ended) return; selectZone(idx); });
        mapEl.appendChild(btn);
      });
    }"""

neu = """    function paintMap() {
      mapEl.innerHTML = '';
      const listaAs = (est && est.asientos) ? est.asientos : players;
      const mapa = (est && est.mapa) ? est.mapa : zones.map((z)=> z.owner);
      const rowsM = (est && est.rows) ? est.rows : ROWS;
      const colsM = (est && est.cols) ? est.cols : COLS;
      for (let r = 0; r < rowsM; r++) {
        for (let c = 0; c < colsM; c++) {
          const idx = r * colsM + c;
          const owner = mapa[idx];
          const btn = ui.el('button', 'cq-zone' + (owner === null || owner === undefined ? ' cq-neutral' : ''), '');
          if (inScene) {
            btn.style.left = (SCENE.BOARD_X + c * SCENE.CELL_W) / SCENE.W * 100 + '%';
            btn.style.top = (SCENE.BOARD_Y + r * SCENE.CELL_H) / SCENE.H * 100 + '%';
            btn.style.width = SCENE.CELL_W / SCENE.W * 100 + '%';
            btn.style.height = SCENE.CELL_H / SCENE.H * 100 + '%';
          } else {
            btn.style.position = 'static';
            btn.style.width = '100%';
            btn.style.height = '100%';
          }
          if (owner === null || owner === undefined) {
            btn.appendChild(ui.el('span', 'cq-flag', '🌫️'));
          } else {
            const pOwner = listaAs[owner] || players[owner];
            if (pOwner) {
              const ch = pOwner.avatar || (App.avatars && App.avatars.pick ? App.avatars.pick(owner) : null);
              const cnv = document.createElement('canvas');
              cnv.width = cnv.height = 26;
              cnv.className = 'avatar-canvas';
              const g = cnv.getContext('2d');
              if (g && ch && App.avatars && App.avatars.drawIcon) App.avatars.drawIcon(g, 5, 5, 1, ch, 'right');
              btn.appendChild(cnv);
              const sStyle = ui.teamStyle ? ui.teamStyle(pOwner.color) : { color: '#94a3b8' };
              btn.style.background = (sStyle.color || '#94a3b8') + '38';
              btn.style.boxShadow = 'inset 0 0 0 2px ' + (sStyle.color || '#94a3b8');
              btn.title = pOwner.nombre || '';
            }
          }
          if (state.target === idx) btn.classList.add('cq-target');
          btn.addEventListener('click', () => { if (state.ended) return; selectZone(idx); });
          mapEl.appendChild(btn);
        }
      }
    }"""

if old in s:
    s2 = s.replace(old, neu)
    with open('js/games/conquista.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
