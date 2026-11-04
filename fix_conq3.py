with open('js/games/conquista.js','r',encoding='utf-8-sig') as f:
    s = f.read()

old = """    function paintCounters() {
      App.gamekit.renderChips(counters, players, {
        activeIdx: state.turn,
        extra: (p) => p.zonas + ' zonas (' + Math.round(p.zonas / TOTAL * 100) + '%)'
      });
    }"""

neu = """    function paintCounters() {
      const lista = (est && est.asientos) ? est.asientos : players;
      const rowsM = (est && est.rows) ? est.rows : ROWS;
      const colsM = (est && est.cols) ? est.cols : COLS;
      const totalM = rowsM * colsM;
      const turno = (est && typeof est.turno === 'number') ? est.turno : state.turn;
      if (App.gamekit && App.gamekit.renderChips) {
        App.gamekit.renderChips(counters, lista, {
          activeIdx: turno,
          extra: (p) => (p.zonas || 0) + ' zonas (' + Math.round((p.zonas || 0) / totalM * 100) + '%)'
        });
      } else {
        counters.innerHTML = '';
        lista.forEach((p,i)=>{
          const chip = ui.el('div','l-chip'+(turno===i?' l-chip-active':''),'');
          chip.appendChild(ui.el('span','text-xs', esc(p.nombre)+' '+(p.zonas||0)));
          counters.appendChild(chip);
        });
      }
    }"""

if old in s:
    s2 = s.replace(old, neu)
    with open('js/games/conquista.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
