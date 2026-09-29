/* ============================================================
 * LudoApp games/conquista.js
 * CONQUISTA DE TERRITORIOS: mapa en zonas; responder bien
 * conquista una zona neutral o ataca una zona rival; el rival
 * puede defender respondiendo. Vista de mapa con color por
 * equipo y contador de zonas controladas.
 * ============================================================ */
window.App = window.App || {};
App.games = App.games || {};
App.games.conquista = (function (ui) {
  const MODE = 'conquista';

  function init(config) {
    const root = config.container;
    const engine = App.questionEngine.createEngine({
      courseId: config.courseId,
      categoryId: config.categoryId,
      difficultyId: config.difficultyId
    });
    const ROWS = config.rows || 6;
    const COLS = config.cols || 6;
    const TOTAL = ROWS * COLS;
    const MAJORITY = Math.floor(TOTAL / 2) + 1;
    const colors = ['rojo', 'verde', 'azul', 'amarillo'];

    const players = config.players.map((p, i) => ({
      ...p, color: colors[i % 4], zonas: 0, streak: 0, pendHint: false, pendComodin: false
    }));
    const baseCells = [[0, 0], [0, COLS - 1], [ROWS - 1, COLS - 1], [ROWS - 1, 0]];

    const zones = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) zones.push({ r, c, owner: null });
    }
    players.forEach((_, pi) => {
      const [br, bc] = baseCells[pi % baseCells.length];
      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) zones[br * COLS + bc].owner = pi;
    });
    const state = { turn: 0, ended: false, target: null, busy: false };

    root.innerHTML = '';
    root.appendChild(ui.el('div', 'text-center text-xl font-extrabold text-slate-900 mb-2', '🗺️ Conquista de Territorios'));
    root.appendChild(ui.el('div', 'text-center text-xs text-slate-500 mb-3', 'Meta: controlar <b>' + MAJORITY + '</b> de ' + TOTAL + ' zonas · Responde bien para conquistar una zona adyacente'));

    const counters = ui.el('div', 'flex flex-wrap gap-2 justify-center mb-3', '');
    root.appendChild(counters);
    const mapEl = ui.el('div', 'cq-map', '');
    root.appendChild(mapEl);

    function paintCounters() {
      App.gamekit.renderChips(counters, players, {
        activeIdx: state.turn,
        extra: (p) => p.zonas + ' zonas (' + Math.round(p.zonas / TOTAL * 100) + '%)'
      });
    }

    function legalTargets(pi) {
      const owned = zones.filter((z) => z.owner === pi);
      const ok = [];
      zones.forEach((z) => {
        if (z.owner === pi) return;
        const adj = owned.some((o) => Math.abs(o.r - z.r) + Math.abs(o.c - z.c) === 1);
        if (adj) ok.push(z);
      });
      return ok;
    }

    function paintMap() {
      mapEl.innerHTML = '';
      mapEl.style.setProperty('--cq-cols', COLS);
      zones.forEach((z, idx) => {
        const btn = ui.el('button', 'cq-zone' + (z.owner === null ? ' cq-neutral' : ''), '');
        if (z.owner === null) {
          btn.appendChild(ui.el('span', 'cq-flag', '🌫️'));
        } else {
          const ch = players[z.owner].avatar || App.avatars.pick(z.owner);
          const cnv = document.createElement('canvas');
          cnv.width = cnv.height = 24;
          cnv.className = 'avatar-canvas';
          const g = cnv.getContext('2d');
          App.avatars.drawIcon(g, 4, 4, 1, ch, 'right');
          btn.appendChild(cnv);
          const s = ui.teamStyle(players[z.owner].color);
          btn.style.background = s.color + '14';
          btn.style.borderColor = s.color;
          btn.title = players[z.owner].nombre;
        }
        if (state.target === idx) btn.classList.add('cq-target');
        btn.addEventListener('click', () => { if (state.ended) return; selectZone(idx); });
        mapEl.appendChild(btn);
      });
    }

    function selectZone(idx) {
      if (state.ended || state.busy) return;
      const z = zones[idx];
      const pi = state.turn;
      if (z.owner === pi) return;
      const legal = legalTargets(pi).some((x) => zones.indexOf(x) === idx);
      if (!legal) { ui.toast('Debes elegir una zona adyacente a las tuyas', 'warn'); return; }
      state.target = idx;
      paintMap();
      paintCounters();
      ui.toast('🎯 Atacando ' + (z.owner === null ? 'zona neutral' : 'zona de ' + players[z.owner].nombre), 'info');
      resolveTurn(pi, idx);
    }

    /* ---- pregunta ---- */
    const qArea = ui.el('div', 'mt-2', '');
    root.appendChild(qArea);
    const hud = ui.el('div', 'flex flex-wrap items-center justify-between gap-2 mb-2', '');
    hud.innerHTML = '<div class="text-sm font-bold" id="cq-turn"></div><div id="cq-skills" class="flex flex-wrap gap-2"></div>';
    root.appendChild(hud);
    const turnEl = hud.querySelector('#cq-turn');
    const skillsEl = hud.querySelector('#cq-skills');

    const profileOf = (id) => App.storage.getById('players', id);

    function setTurnUI() {
      const p = players[state.turn];
      turnEl.innerHTML = '';
      turnEl.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(state.turn), 26));
      turnEl.appendChild(document.createTextNode(' Turno de '));
      turnEl.appendChild(ui.el('b', '', p.nombre));
      turnEl.appendChild(document.createTextNode(' · elige una zona'));
      renderSkills(p);
      paintCounters();
    }

    function renderSkills(p) {
      const pr = profileOf(p.id);
      if (!pr) { skillsEl.innerHTML = ''; return; }
      const list = [['pista', '💡', 'Pista'], ['comodin', '🃏', 'Comodín']];
      App.gamekit.renderSkills(skillsEl, list.map(([sk, ic, nm]) => ({
        key: sk, icono: ic, nombre: nm, amount: (pr.skills || {})[sk] || 0
      })), (sk) => {
        if (state.ended) return;
        App.progression.useSkill(pr, sk);
        if (sk === 'pista') p.pendHint = true;
        if (sk === 'comodin') p.pendComodin = true;
        ui.sound('dice');
        renderSkills(p);
      }, state.ended);
    }

    function askPlayer(p) {
      if (p.pendComodin) {
        p.pendComodin = false;
        const q = engine.draw();
        const res = App.progression.recordAnswer(profileOf(p.id), {
          question: q, selectedIndex: q.respuesta_correcta,
          difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId
        });
        return Promise.resolve({ correct: true, achievements: res.achievements });
      }
      const q = engine.draw();
      const ctx = { engine, question: q, extraBadges: [] };
      let hinted = p.pendHint;
      p.pendHint = false;
      return new Promise((resolve) => {
        ui.question(ctx, qArea, {
          onHint: () => { if (hinted) { hinted = false; return true; } return false; },
          onAnswered: (r) => {
            const res = App.progression.recordAnswer(profileOf(p.id), {
              question: q, selectedIndex: r.selectedIndex,
              difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId
            });
            resolve({ correct: res.correct, achievements: res.achievements });
          }
        });
      });
    }

    async function conquer(pi, idx) {
      zones[idx].owner = pi;
      players[pi].zonas++;
      state.target = null;
      paintMap();
      paintCounters();
      ui.sound('correct');
      ui.confetti(mapEl);
      ui.toast('🏴 ' + players[pi].nombre + ' conquistó el territorio', 'success');
      if (players[pi].zonas >= MAJORITY) return endGame(pi);
      nextTurn(pi);
    }

    async function defend(attacker, rivalIdx, idx) {
      ui.toast('🛡️ ' + players[rivalIdx].nombre + ' tiene derecho a defender', 'info');
      qArea.innerHTML = '';
      const dflabel = ui.el('div', 'text-center text-sm font-bold mb-2', '🛡️ La defensa de ' + players[rivalIdx].nombre);
      qArea.appendChild(dflabel);
      const res = await askPlayer(players[rivalIdx]);
      if (res.correct) {
        ui.sound('correct');
        players[rivalIdx].streak++;
        ui.toast('✅ Territorio defendido por ' + players[rivalIdx].nombre, 'success');
        state.target = null;
        paintMap();
        return nextTurn(attacker);
      }
      await conquer(attacker, idx);
    }

    async function resolveTurn(pi, idx) {
      const z = zones[idx];
      state.busy = true;
      setTurnUI();
      qArea.innerHTML = '';
      qArea.appendChild(ui.el('div', 'text-center text-sm font-bold mb-2',
        '⚔️ ' + players[pi].nombre + ' ataca ' + (z.owner === null ? 'zona neutral de la casilla ' + (idx + 1) : 'el territorio de ' + players[z.owner].nombre)));
      const res = await askPlayer(players[pi]);
      if (state.ended) return;
      if (res.correct) {
        res.achievements.forEach((a) => ui.toast('🏅 Logro: ' + a.titulo, 'success'));
        if (z.owner === null) {
          players[pi].streak++;
          await conquer(pi, idx);
        } else {
          await defend(pi, z.owner, idx);
        }
      } else {
        players[pi].streak = 0;
        ui.sound('wrong');
        ui.toast(players[pi].nombre + ' falló: no hay conquista', 'error');
        state.target = null;
        paintMap();
        const next = ui.el('button', 'btn-primary w-full mt-3', 'Siguiente turno →');
        next.addEventListener('click', () => nextTurn(state.turn));
        qArea.appendChild(next);
      }
    }

    function nextTurn(fromIdx) {
      if (state.ended) return;
      state.turn = (fromIdx + 1) % players.length;
      state.target = null;
      state.busy = false;
      setTurnUI();
      paintMap();
      ui.toast('🗺️ Le toca a ' + players[state.turn].nombre + ': elige una zona', 'info');
      qArea.innerHTML = '';
    }

    function standings() {
      return players.slice().sort((a, b) => b.zonas - a.zonas || b.id.localeCompare(a.id));
    }

    function bonusOf(winner) {
      return App.gamekit.bonusForPlayer(winner, profileOf, MODE);
    }

    function endGame(winIdx) {
      if (state.ended) return;
      state.ended = true;
      state.busy = true;
      const win = players[winIdx];
      const bonus = bonusOf(win);
      const st = players.map((p, i) => ({ id: p.id, nombre: p.nombre, color: p.color, puntos: p.zonas, subtitulo: p.zonas + ' zonas' }));
      if (App.session && App.session.record) App.session.record(config, st, MODE);
      App.gamekit.podium(root, st.map((s, i) => ({
        nombre: s.nombre, icono: '🗺️', rank: i + 1, subtitulo: s.subtitulo,
        campo1Label: 'Zonas', campo1: s.puntos, campo2Label: 'Meta ', campo2: MAJORITY
      })), { title: '🏆 ¡' + win.nombre + ' conquistó el mapa!', subtitle: win.nombre + ' controla ' + win.zonas + ' de ' + TOTAL + ' zonas', bonus });
    }

    function startTimer() {
      App.gamekit.timerBox(root, config.timeSeconds, () => {
        if (state.ended) return;
        state.ended = true;
        state.busy = true;
        const ranked = standings();
        const win = ranked[0];
        const bonus = bonusOf(win);
        const st = ranked.map((p) => ({
          id: p.id, nombre: p.nombre, color: p.color,
          puntos: p.zonas, subtitulo: p.zonas + ' zonas'
        }));
        if (App.session && App.session.record) App.session.record(config, st, MODE);
        App.gamekit.podium(root, st.map((s, i) => ({
          nombre: s.nombre, icono: '🗺️', rank: i + 1,
          subtitulo: s.subtitulo, campo1Label: 'Zonas', campo1: s.puntos, campo2Label: 'Meta ', campo2: MAJORITY
        })), { title: '⏱️ Tiempo agotado', subtitle: 'Gana quien controla más zonas', bonus });
      });
    }

    startTimer();
    setTurnUI();
    paintMap();
  }

  return { init, MODE };
})(App.ui);