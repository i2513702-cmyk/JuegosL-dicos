with open('js/games/carrera.js','r',encoding='utf-8-sig') as f:
    s = f.read()
old = "    const players = config.players.map((p, i) => ({\n      ...p, color: colors[i % 4], pos: 0, streak: 0, finished: false\n    }));\n    const state = { turn: 0, ended: false, pendHint: false, pendComodin: false, extra: 0 };\n"
neu = "    const players = config.players.map((p, i) => ({\n      ...p, color: colors[i % 4], pos: 0, streak: 0, finished: false\n    }));\n    const state = { turn: 0, ended: false, pendHint: false, pendComodin: false, extra: 0 };\n    const est = { asientos: players, turno: state.turn, fase: 'avanzar', trackLength: TOTAL, extra: state.extra, espera: { asiento: state.turn, que: 'avanzar' } };\n"
if old in s:
    s2 = s.replace(old, neu)
    with open('js/games/carrera.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
