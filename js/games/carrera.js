/* ============================================================
 * LudoApp games/carrera.js
 * CARRERA DE PREGUNTAS: pista lineal, cada acierto avanza,
 * rachas de aciertos otorgan velocidad extra, obstáculos
 * restan avance y hay marcador de posición 1º-4º en vivo.
 * ============================================================ */
window.App = window.App || {};
App.games = App.games || {};
App.games.carrera = (function (ui) {
  const MODE = 'carrera';

  function init(config) {
    const root = config.container;
    const engine = App.questionEngine.createEngine({
      courseId: config.courseId,
      categoryId: config.categoryId,
      difficultyId: config.difficultyId
    });
    const TOTAL = config.trackLength || 30;
    const OBSTACLES = [4, 9, 14, 19, 24, 27];
    const colors = ['rojo', 'verde', 'azul', 'amarillo'];

    const players = config.players.map((p, i) => ({
      ...p, color: colors[i % 4], pos: 0, streak: 0, finished: false
    }));
    const state = { turn: 0, ended: false, pendHint: false, pendComodin: false, extra: 0 };

    root.innerHTML = '';
    const title = ui.el('div', 'text-center text-xl font-extrabold text-slate-900 mb-2', '🏁 Carrera de Preguntas');
    root.appendChild(title);

    /* ---- pista ---- */
    const track = ui.el('div', 'track-wrap', '');
    const cells = ui.el('div', 'track-cells', '');
    for (let i = 0; i < TOTAL; i++) {
      const cell = ui.el('div', 'tr-cell' + (OBSTACLES.indexOf(i) !== -1 ? ' tr-cell-obs' : ''),
        OBSTACLES.indexOf(i) !== -1 ? '⚠️' : String(i + 1));
      if (i === TOTAL) cell;
      cells.appendChild(cell);
    }
    cells.appendChild(ui.el('div', 'tr-meta', '🏁'));
    track.appendChild(cells);
    const trackTokens = ui.el('div', 'track-tokens', '');
    track.appendChild(trackTokens);
    root.appendChild(track);

    const tokenEls = [];
    players.forEach((p, i) => {
      const t = ui.el('div', 'tr-token', '');
      const cnv = document.createElement('canvas');
      cnv.width = cnv.height = 34;
      cnv.className = 'avatar-canvas';
      const g = cnv.getContext('2d');
      const ch = p.avatar || App.avatars.pick(i);
      g.fillStyle = ch.armor + '2e';
      g.beginPath(); g.arc(17, 17, 16, 0, Math.PI * 2); g.fill();
      App.avatars.drawIcon(g, 1, 1, 2, ch, 'right');
      t.appendChild(cnv);
      t.title = p.nombre;
      t.classList.add('tr-token-avatar');
      trackTokens.appendChild(t);
      tokenEls.push(t);
    });

    function paintTrack() {
      players.forEach((p, i) => {
        const t = tokenEls[i];
        t.style.left = (p.pos / TOTAL * 100) + '%';
        t.style.top = (20 + (i % 2) * 34) + '%';
        if (p.finished) t.style.opacity = 0.6;
      });
    }
    paintTrack();

    /* ---- marcador en vivo ---- */
    const rankingEl = ui.el('div', 'flex flex-wrap gap-2 justify-center mb-3', '');
    root.appendChild(rankingEl);
    function paintRanking() {
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
    }
    paintRanking();

    /* ---- HUD de turno y habilidades ---- */
    const hud = ui.el('div', 'flex flex-wrap items-center justify-between gap-2 mb-2', '');
    hud.innerHTML = '<div class="text-sm font-bold" id="cr-turn"></div><div id="cr-skills" class="flex flex-wrap gap-2"></div>';
    root.appendChild(hud);
    const turnEl = hud.querySelector('#cr-turn');
    const skillsEl = hud.querySelector('#cr-skills');

    function setTurnUI() {
      const p = players[state.turn];
      const s = ui.teamStyle(p.color);
      turnEl.innerHTML = '';
      turnEl.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(state.turn), 24));
      turnEl.appendChild(document.createTextNode(' Turno: '));
      turnEl.appendChild(ui.el('b', '', p.nombre));
      turnEl.appendChild(document.createTextNode(' · Posición ' + Math.min(p.pos, TOTAL) + '/' + TOTAL + ' · Racha 🔥x' + p.streak));
      renderSkills();
      paintRanking();
    }

    function renderSkills() {
      const pr = App.storage.getById('players', players[state.turn].id);
      if (!pr) { skillsEl.innerHTML = ''; return; }
      const list = [['pista', '💡', 'Pista'], ['comodin', '🃏', 'Comodín'], ['impulso', '🚀', 'Impulso']];
      App.gamekit.renderSkills(skillsEl, list.map(([sk, ic, nm]) => ({
        key: sk, icono: ic, nombre: nm, amount: (pr.skills || {})[sk] || 0,
        on: sk === 'impulso' && state.extra > 0,
        label: sk === 'impulso' && state.extra > 0 ? ' (activo)' : ''
      })), (sk) => {
        if (state.ended) return;
        App.progression.useSkill(pr, sk);
        if (sk === 'pista') state.pendHint = true;
        if (sk === 'comodin') state.pendComodin = true;
        if (sk === 'impulso') state.extra += 2;
        ui.sound('dice');
        renderSkills();
      }, state.ended);
    }

    /* ---- pregunta ---- */
    const qArea = ui.el('div', 'mt-2', '');
    root.appendChild(qArea);
    const profileOf = (id) => App.storage.getById('players', id);

    function askPlayer(p) {
      if (state.pendComodin) {
        state.pendComodin = false;
        const q = engine.draw();
        const res = App.progression.recordAnswer(profileOf(p.id), {
          question: q, selectedIndex: q.respuesta_correcta,
          difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId
        });
        qArea.innerHTML = '';
        qArea.appendChild(ui.el('div', 'q-card bg-amber-50 border-amber-300',
          '<div class="font-bold text-amber-800">🃏 Comodín: acierto automático</div><p class="q-text-sm">' + q.enunciado + '</p>'));
        ui.sound('correct');
        return Promise.resolve({ correct: true, achievements: res.achievements });
      }

      const q = engine.draw();
      const ctx = { engine, question: q, extraBadges: [] };
      let hinted = state.pendHint;
      state.pendHint = false;
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

    /* ---- movimiento ---- */
    function slideAnim(p, delta, onStep) {
      return new Promise((resolve) => {
        let target = p.pos + delta;
        target = Math.max(0, Math.min(TOTAL, target));
        if (target === p.pos) return resolve(false);
        const el = tokenEls[players.indexOf(p)];
        if (el) el.classList.add('tr-run');
        const dir = target > p.pos ? 1 : -1;
        const step = () => {
          p.pos = Math.max(0, Math.min(TOTAL, p.pos + dir));
          paintTrack();
          onStep && onStep();
          if (p.pos === target) {
            if (el) el.classList.remove('tr-run');
            return resolve(true);
          }
          setTimeout(step, 220);
        };
        setTimeout(step, 30);
      });
    }

    /* ---- turno ---- */
    function startTurn() {
      qArea.innerHTML = '';
      const p = players[state.turn];
      setTurnUI();
      const rollBtn = ui.el('button', 'btn-primary w-full mt-3', '🎯 Responder para avanzar');
      rollBtn.addEventListener('click', async () => {
        rollBtn.disabled = true;
        rollBtn.classList.add('opacity-60');
        const res = await askPlayer(p);
        if (state.ended) return;
        if (res.correct) {
          p.streak++;
          let steps = 1 + (p.streak >= 2 ? 1 : 0) + (p.streak >= 4 ? 1 : 0);
          if (state.extra) { steps += state.extra; state.extra = 0; }
          ui.sound('correct');
          ui.toast(p.nombre + ' avanza +' + steps + (p.streak >= 2 ? ' (racha x' + p.streak + ' 🔥)' : ''), 'success');
          await slideAnim(p, steps, () => {});
          if (p.pos >= TOTAL) return endGame(p.id);
          if (OBSTACLES.indexOf(p.pos) !== -1) {
            ui.toast('⚠️ ¡Obstáculo! -2 casillas', 'warn');
            ui.shake(track);
            await slideAnim(p, -2, () => {});
          }
          res.achievements.forEach((a) => ui.toast('🏅 Logro: ' + a.titulo, 'success'));
        } else {
          p.streak = 0;
          const fall = 1 + Math.floor(Math.random() * 2);
          ui.sound('wrong');
          ui.toast(p.nombre + ' falló: retrocede ' + fall + ' (resbalón)', 'error');
          await slideAnim(p, -fall, () => {});
        }
        if (!state.ended) nextTurn();
      });
      qArea.appendChild(rollBtn);
    }

    function nextTurn() {
      if (state.ended) return;
      state.turn = (state.turn + 1) % players.length;
      startTurn();
    }

    function standings() {
      return players.slice().sort((a, b) => b.pos - a.pos || b.id.localeCompare(a.id));
    }

    function bonusOf(winner) {
      return App.gamekit.bonusForPlayer(winner, profileOf, MODE);
    }

    function endGame(winnerId) {
      if (state.ended) return;
      state.ended = true;
      const winner = players.find((p) => p.id === winnerId);
      const bonus = bonusOf(winner);
      const st = standings().map((p) => ({
        id: p.id, nombre: p.nombre, color: p.color,
        puntos: p.pos + (p.pos >= TOTAL ? 100 : 0), subtitulo: p.pos >= TOTAL ? '¡Cruzó la meta!' : 'Casilla ' + p.pos + '/' + TOTAL
      }));
      if (App.session && App.session.record) App.session.record(config, st, MODE);
      ui.sound('win');
      ui.confetti(root);
      ui.toast('🏁 ' + winner.nombre + ' ganó la Carrera', 'success');
      ui.podium(root, st.map((s, i) => ({
        nombre: s.nombre, icono: '🏁', rank: i + 1, subtitulo: s.subtitulo,
        campo1Label: 'Posición', campo1: Math.min(s.puntos, TOTAL), campo2Label: '', campo2: ''
      })), { title: '🎉 ¡' + winner.nombre + ' cruzó la meta!', subtitle: 'Resultado de la Carrera de Preguntas', bonus });
    }

    function startTimer() {
      App.gamekit.timerBox(root, config.timeSeconds, () => {
        if (state.ended) return;
        state.ended = true;
        const st = standings();
        const win = st[0];
        const bonus = bonusOf(win);
        const mapped = st.map((p) => ({
          id: p.id, nombre: p.nombre, color: p.color,
          puntos: p.pos, subtitulo: 'Casilla ' + p.pos + '/' + TOTAL
        }));
        if (App.session && App.session.record) App.session.record(config, mapped, MODE);
        App.gamekit.podium(root, mapped.map((s, i) => ({
          nombre: s.nombre, icono: '🏁', rank: i + 1, subtitulo: s.subtitulo,
          campo1Label: 'Casilla', campo1: s.puntos, campo2Label: '', campo2: ''
        })), { title: '⏱️ Tiempo agotado', subtitle: 'Clasificación de la Carrera', bonus });
      });
    }

    startTimer();
    startTurn();
  }

  return { init, MODE };
})(App.ui);