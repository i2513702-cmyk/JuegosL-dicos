with open('js/games/carrera.js','r',encoding='utf-8-sig') as f:
    s = f.read()

old = """    function paintRanking() {
      const sorted = players.slice().sort((a, b) => b.pos - a.pos || b.id.localeCompare(a.id));
      rankingEl.innerHTML = '';
      sorted.forEach((p, i) => {
        const medal = i === 0 ? '👑 1º' : i === 1 ? '2º' : i === 2 ? '3º' : '4º';
        const chip = ui.el('div', 'l-chip' + (p.id === players[state.turn].id ? ' l-chip-active' : ''), '');
        chip.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(i), 22));
        chip.appendChild(ui.el('span', 'text-xs font-extrabold ' + (i === 0 ? 'text-amber-600' : 'text-slate-700'), medal));
        chip.appendChild(ui.el('span', 'text-xs font-semibold truncate', p.nombre));
        chip.appendChild(ui.el('span', 'text-[10px] text-slate-400', p.pos + '/' + TOTAL));
        rankingEl.appendChild(chip);
      });
    }"""

neu = """    function paintRanking() {
      const lista = (est && est.asientos) ? est.asientos : players;
      const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
      const turno = (est && typeof est.turno === 'number') ? est.turno : state.turn;
      const sorted = lista.slice().sort((a, b) => (b.pos||0) - (a.pos||0) || String(a.id||'').localeCompare(String(b.id||'')));
      rankingEl.innerHTML = '';
      sorted.forEach((p, i) => {
        const medal = i === 0 ? '👑 1º' : i === 1 ? '2º' : i === 2 ? '3º' : '4º';
        const active = lista[turno] && p.id === lista[turno].id;
        const chip = ui.el('div', 'l-chip' + (active ? ' l-chip-active' : ''), '');
        chip.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(i), 22));
        chip.appendChild(ui.el('span', 'text-xs font-extrabold ' + (i === 0 ? 'text-amber-600' : 'text-slate-700'), medal));
        chip.appendChild(ui.el('span', 'text-xs font-semibold truncate', esc(p.nombre)));
        chip.appendChild(ui.el('span', 'text-[10px] text-slate-400', (p.pos||0) + '/' + trackL));
        rankingEl.appendChild(chip);
      });
    }"""

if old in s:
    s2 = s.replace(old, neu)
    with open('js/games/carrera.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('no')
