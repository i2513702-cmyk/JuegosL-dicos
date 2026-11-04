with open('js/games/carrera.js','r',encoding='utf-8-sig') as f:
    s = f.read()

old = """    function setTurnUI() {
      const p = players[state.turn];
      const s = ui.teamStyle(p.color);
      turnEl.innerHTML = '';
      turnEl.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(state.turn), 24));
      turnEl.appendChild(document.createTextNode(' Turno: '));
      turnEl.appendChild(ui.el('b', '', p.nombre));
      turnEl.appendChild(document.createTextNode(' · Posición ' + Math.min(p.pos, TOTAL) + '/' + TOTAL + ' · Racha 🔥x' + p.streak));
      renderSkills();
      paintRanking();
    }"""

neu = """    function setTurnUI() {
      const lista = (est && est.asientos) ? est.asientos : players;
      const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
      const turno = (est && typeof est.turno === 'number') ? est.turno : state.turn;
      const p = lista[turno] || lista[0] || {};
      const sstyle = ui.teamStyle ? ui.teamStyle(p.color) : '';
      turnEl.innerHTML = '';
      turnEl.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(turno), 24));
      turnEl.appendChild(document.createTextNode(' Turno: '));
      turnEl.appendChild(ui.el('b', '', esc(p.nombre)));
      turnEl.appendChild(document.createTextNode(' · Posición ' + Math.min(p.pos || 0, trackL) + '/' + trackL + ' · Racha 🔥x' + (p.streak || 0)));
      renderSkills();
      paintRanking();
    }"""

if old in s:
    s2 = s.replace(old, neu)
    with open('js/games/carrera.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
