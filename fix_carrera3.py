with open('js/games/carrera.js','r',encoding='utf-8-sig') as f:
    s = f.read()

old = """    /* Varias fichas en la MISMA casilla y carril se apilan exactamente (parece una
       sola) y, al separarse, "aparece" una copia del primer personaje. Se dispersan
       un poco para que cada corredor se distinga siempre. */
    function crowdOffset(pos, i) {
      const mates = [];
      players.forEach((p, j) => {
        if (j !== i && p.pos === pos && (j % 2) === (i % 2)) mates.push(j);
      });
      const order = mates.filter((j) => j < i).length;
      return ([[0, 0], [-9, -9], [9, -9], [0, -14]][order]) || [0, 0];
    }"""

neu = """    /* Varias fichas en la MISMA casilla y carril se apilan exactamente (parece una
       sola) y, al separarse, "aparece" una copia del primer personaje. Se dispersan
       un poco para que cada corredor se distinga siempre. */
    function crowdOffset(pos, i) {
      const mates = [];
      const lista = (est && est.asientos) ? est.asientos : players;
      lista.forEach((p, j) => {
        if (j !== i && (p.pos || 0) === pos && (j % 2) === (i % 2)) mates.push(j);
      });
      const order = mates.filter((j) => j < i).length;
      return ([[0, 0], [-9, -9], [9, -9], [0, -14]][order]) || [0, 0];
    }"""

if old in s:
    s2 = s.replace(old, neu)
    with open('js/games/carrera.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
