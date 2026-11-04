with open('js/games/carrera.js','r',encoding='utf-8-sig') as f:
    s = f.read()

old = """    function paintTrack() {
      players.forEach((p, i) => {
        const t = tokenEls[i];
        if (inScene) {
          const off = crowdOffset(Math.min(p.pos, TOTAL), i);
          placeOnRoad(t, Math.min(p.pos, TOTAL), i, TOKEN_HALF, off[0], off[1]);
        } else {
          t.style.left = (p.pos / TOTAL * 100) + '%';
          t.style.top = (20 + (i % 2) * 34) + '%';
        }
        if (p.finished) {
            t.style.opacity = 1;
          } else {
            t.style.opacity = 0.98;
          }
      });
    }"""

neu = """    function paintTrack() {
      const lista = (est && est.asientos) ? est.asientos : players;
      const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
      lista.forEach((p, i) => {
        const t = tokenEls[i];
        if (!t) return;
        if (inScene) {
          const off = crowdOffset(Math.min(p.pos, trackL), i);
          placeOnRoad(t, Math.min(p.pos, trackL), i, TOKEN_HALF, off[0], off[1]);
        } else {
          t.style.left = ((p.pos || 0) / trackL * 100) + '%';
          t.style.top = (20 + (i % 2) * 34) + '%';
        }
        if (p.finished) {
            t.style.opacity = 1;
          } else {
            t.style.opacity = 0.98;
          }
      });
    }"""

if old in s:
    s2 = s.replace(old, neu)
    with open('js/games/carrera.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
