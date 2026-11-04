with open('js/games/conquista.js','r',encoding='utf-8-sig') as f:
    s = f.read()

old = "    const players = config.players.map((p, i) => ({\n      ...p, color: colors[i % 4], zonas: 0, streak: 0, pendHint: false, pendComodin: false\n    }));\n    const baseCells = [[0, 0], [0, COLS - 1], [ROWS - 1, COLS - 1], [ROWS - 1, 0]];\n\n    const zones = [];\n    for (let r = 0; r < ROWS; r++) {\n      for (let c = 0; c < COLS; c++) zones.push({ r, c, owner: null });\n    }\n    players.forEach((_, pi) => {\n      const [br, bc] = baseCells[pi % baseCells.length];\n      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) zones[br * COLS + bc].owner = pi;\n    });\n    const state = { turn: 0, ended: false, target: null, busy: false };"
neu = "    const players = config.players.map((p, i) => ({\n      ...p, color: colors[i % 4], zonas: 0, streak: 0, pendHint: false, pendComodin: false\n    }));\n    const baseCells = [[0, 0], [0, COLS - 1], [ROWS - 1, COLS - 1], [ROWS - 1, 0]];\n\n    const zones = [];\n    for (let r = 0; r < ROWS; r++) {\n      for (let c = 0; c < COLS; c++) zones.push({ r, c, owner: null });\n    }\n    players.forEach((_, pi) => {\n      const [br, bc] = baseCells[pi % baseCells.length];\n      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) zones[br * COLS + bc].owner = pi;\n    });\n    const state = { turn: 0, ended: false, target: null, busy: false };\n    const mapaInit = zones.map((z)=> z.owner);\n    const est = { asientos: players, turno: state.turn, fase: 'elegir', rows: ROWS, cols: COLS, mapa: mapaInit, espera: { asiento: state.turn, que: 'elegir' } };"

if old in s:
    s2 = s.replace(old, neu)
    with open('js/games/conquista.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
