/* ============================================================
 * LudoApp games/ludo.js
 * LUDO EDUCATIVO: tablero clásico 15x15, fichas que se mueven
 * casilla por casilla, dado animado, casillas especiales
 * (⭐ seguro, ❓ reto, ⬆ avance, ⏪ retroceso) y condición de
 * victoria evaluada por código (llegar a la META).
 * ============================================================ */
window.App = window.App || {};
App.games = App.games || {};
App.games.ludo = (function (ui) {
  const MODE = 'ludo';

  const PATH = [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
  const START = [0, 13, 26, 39];
  const SAFE = { 0: 1, 8: 1, 13: 1, 21: 1, 26: 1, 34: 1, 39: 1, 47: 1 };
  const RETO = { 5: 1, 18: 1, 31: 1, 44: 1 };
  const AVANCE = { 11: 1, 24: 1, 37: 1, 50: 1 };
  const RETRO = { 3: 1, 16: 1, 29: 1, 42: 1 };
  const HOME_STRETCH = [
    [[7,1],[7,2],[7,3],[7,4],[7,5]],
    [[1,7],[2,7],[3,7],[4,7],[5,7]],
    [[7,13],[7,12],[7,11],[7,10],[7,9]],
    [[13,7],[12,7],[11,7],[10,7],[9,7]]
  ];
  const CENTER = [7, 7];
  const BASE_ORIGIN = [[0,0],[0,9],[9,9],[9,0]];
  const YARD_SLOTS = [[1,1],[1,4],[4,1],[4,4]];
  const N = 15;

  function init(config) {
    const root = config.container;
    const engine = App.questionEngine.createEngine({
      courseId: config.courseId,
      categoryId: config.categoryId,
      difficultyId: config.difficultyId
    });
    const colors = ['rojo', 'verde', 'azul', 'amarillo'];
    const players = config.players.map((p, i) => ({ ...p, color: colors[i % 4] }));
    const state = {
      players: players.map((p) => ({ ...p, tokens: [{ tp: -1 }, { tp: -1 }, { tp: -1 }, { tp: -1 }] })),
      turn: 0,
      ended: false,
      extra: 0,
      pendingHint: false,
      pendingComodin: false
    };

    root.innerHTML = '';
    const frame = ui.el('div', 'l-board-frame', '');
    frame.innerHTML = '<div class="ludo-grid"></div><div class="ludo-tokens"></div>';
    root.appendChild(frame);
    const gridEl = frame.querySelector('.ludo-grid');
    const tokensEl = frame.querySelector('.ludo-tokens');

    const pathCoord = {};
    PATH.forEach((c, i) => { pathCoord[c.join('-')] = i; });
    const homeCoord = {};
    HOME_STRETCH.forEach((lane, pi) => lane.forEach((c) => { homeCoord[c.join('-')] = pi; }));

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const key = r + '-' + c;
        const cell = ui.el('div', 'l-cell', '');
        let owner = -1;
        BASE_ORIGIN.forEach((o, pi) => {
          if (r >= o[0] && r <= o[0] + 5 && c >= o[1] && c <= o[1] + 5) owner = pi;
        });
        const isYard = owner !== -1 && YARD_SLOTS.some((s) => BASE_ORIGIN[owner][0] + s[0] === r && BASE_ORIGIN[owner][1] + s[1] === c);
        const inHome = homeCoord[key];
        const inCenter = key === '7-7';
        const isPath = pathCoord[key] !== undefined;

if (owner !== -1 && owner < state.players.length) {
          cell.classList.add('l-base', 'l-base-' + state.players[owner].color);
          if (isYard) cell.appendChild(ui.el('span', 'l-yard', ''));
        } else if (inCenter) {
          cell.classList.add('l-meta');
          cell.appendChild(ui.el('span', '', '🏆'));
        } else if (inHome && inHome < state.players.length) {
          cell.classList.add('l-home', 'l-home-' + state.players[inHome].color);
        } else if (isPath) {
          const g = pathCoord[key];
          cell.classList.add('l-path');
          if (SAFE[g]) cell.appendChild(ui.el('span', 'l-sp l-star', '⭐'));
          else if (RETO[g]) cell.appendChild(ui.el('span', 'l-sp l-reto', '❓'));
          else if (AVANCE[g]) cell.appendChild(ui.el('span', 'l-sp l-up', '⬆'));
          else if (RETRO[g]) cell.appendChild(ui.el('span', 'l-sp l-back', '⏪'));
          cell.appendChild(ui.el('span', 'l-idx', String(g)));
        } else {
          cell.classList.add('l-empty');
        }
        gridEl.appendChild(cell);
      }
    }

    function gridCellFor(pi, tp, tokIdx) {
      if (tp < 0) {
        const o = BASE_ORIGIN[pi];
        const s = YARD_SLOTS[tokIdx];
        return [o[0] + s[0], o[1] + s[1]];
      }
      if (tp >= 56) return CENTER;
      if (tp < 51) return PATH[(START[pi] + tp) % 52];
      return HOME_STRETCH[pi][tp - 51];
    }

    const tokenEls = {};
    state.players.forEach((p, pi) => {
      p.tokens.forEach((t, ti) => {
        const ch = p.avatar || App.avatars.pick(pi);
        const dot = ui.el('div', 'l-token l-token-' + p.color, '');
        const cnv = document.createElement('canvas');
        cnv.width = cnv.height = 26;
        cnv.className = 'avatar-canvas';
        const g = cnv.getContext('2d');
        App.avatars.drawIcon(g, 5, 5, 1, ch, 'right');
        dot.appendChild(cnv);
        tokensEl.appendChild(dot);
        tokenEls[pi + '-' + ti] = dot;
      });
    });
    function place(pi, ti) {
      const t = state.players[pi].tokens[ti];
      const [r, c] = gridCellFor(pi, t.tp, ti);
      const dot = tokenEls[pi + '-' + ti];
      dot.style.left = ((c + 0.5) / N * 100) + '%';
      dot.style.top = ((r + 0.5) / N * 100) + '%';
      dot.style.zIndex = t.tp >= 56 ? 30 : 10;
    }
    state.players.forEach((p, pi) => p.tokens.forEach((t, ti) => place(pi, ti)));

    function stepsAnim(pi, ti, delta) {
      const t = state.players[pi].tokens[ti];
      const dot = tokenEls[pi + '-' + ti];
      if (dot) dot.classList.add('l-run');
      let guard = Math.abs(delta);
      return new Promise((resolve) => {
        const step = () => {
          if (guard-- <= 0) {
            if (dot) dot.classList.remove('l-run');
            return resolve(t.tp);
          }
          const dir = delta > 0 ? 1 : -1;
          t.tp = Math.max(-1, Math.min(56, t.tp + dir));
          if (t.tp === 56) state.players[pi].finished = true;
          place(pi, ti);
          setTimeout(step, 250);
        };
        setTimeout(step, 30);
      });
    }

    /* ---------- HUD ---------- */
    const hud = ui.el('div', 'space-y-3 mt-4');
    hud.innerHTML = [
      '<div class="flex items-center justify-between">',
      '<div id="lu-turn" class="font-bold text-sm"></div>',
      '<div class="flex items-center gap-2"><span class="text-xs text-slate-500">Dado</span><div id="lu-dice" class="dice-box">🎲</div></div>',
      '</div>',
      '<div id="lu-players" class="flex flex-wrap gap-2 justify-center"></div>',
      '<div id="lu-skills" class="flex flex-wrap gap-2 justify-center"></div>'
    ].join('');
    root.appendChild(hud);
    const turnEl = hud.querySelector('#lu-turn');
    const diceEl = hud.querySelector('#lu-dice');
    const playersChips = hud.querySelector('#lu-players');
    const skillsEl = hud.querySelector('#lu-skills');

    function leader(toks) { return Math.max.apply(null, toks.map((t) => t.tp)); }
    function leaderPos(p) {
      const m = leader(p.tokens);
      return m < 0 ? 'En base' : (m >= 56 ? '🏆 META' : 'Casilla ' + (m + 1) + '/56');
    }
    function renderAvatars() {
      playersChips.innerHTML = '';
      const act = state.players[state.turn];
      state.players.forEach((p, i) => {
        const chip = ui.el('div', 'l-chip' + (p.id === act.id ? ' l-chip-active' : ''), '');
        chip.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(i), 22));
        chip.appendChild(ui.el('span', 'text-xs font-semibold truncate', p.nombre));
        chip.appendChild(ui.el('span', 'l-chip-pos', leaderPos(p)));
        playersChips.appendChild(chip);
      });
    }
    function renderSkills() {
      const pr = App.storage.getById('players', state.players[state.turn].id);
      if (!pr) { skillsEl.innerHTML = ''; return; }
      const list = [['pista', '💡', 'Pista'], ['comodin', '🃏', 'Comodín'], ['impulso', '🚀', 'Impulso']];
      skillsEl.innerHTML = '';
      list.forEach(([sk, ic, nm]) => {
        const n = (pr.skills || {})[sk] || 0;
        const btn = ui.el('button', 'skill-btn' + (n === 0 ? ' skill-btn-empty' : ''), ic + ' ' + nm + ' ×' + n);
        if (n > 0) btn.addEventListener('click', () => {
          App.progression.useSkill(pr, sk);
          if (sk === 'pista') state.pendingHint = true;
          if (sk === 'comodin') state.pendingComodin = true;
          if (sk === 'impulso') state.extra += 2;
          ui.sound('dice');
          renderSkills();
        });
        skillsEl.appendChild(btn);
      });
    }
    function setTurnUI() {
      const p = state.players[state.turn];
      turnEl.innerHTML = '';
      turnEl.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(state.turn), 24));
      turnEl.appendChild(document.createTextNode(' Turno de '));
      turnEl.appendChild(ui.el('b', '', p.nombre));
      renderAvatars();
      renderSkills();
    }

    /* ---------- dado ---------- */
    function rollDice() {
      return new Promise((resolve) => {
        let n = 0;
        const timer = setInterval(() => {
          diceEl.textContent = 1 + Math.floor(Math.random() * 6);
          ui.sound('dice');
          if (++n >= 12) {
            clearInterval(timer);
            const val = 1 + Math.floor(Math.random() * 6);
            diceEl.textContent = val;
            resolve(val);
          }
        }, 60);
      });
    }

    /* ---------- pregunta ---------- */
    const qArea = ui.el('div', 'mt-4', '');
    root.appendChild(qArea);

    const profileOf = (p) => App.storage.getById('players', p.id);

    function askPlayer(p) {
      if (state.pendingComodin) {
        state.pendingComodin = false;
        const q = engine.draw();
        const res = App.progression.recordAnswer(profileOf(p), {
          question: q, selectedIndex: q.respuesta_correcta,
          difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId
        });
        qArea.innerHTML = '';
        qArea.appendChild(ui.el('div', 'q-card bg-amber-50 border-amber-300',
          '<div class="font-bold text-amber-800">🃏 Comodín: acierto automático</div>' +
          '<p class="q-text-sm">' + q.enunciado + '</p>' +
          '<p class="q-ok-sm"><strong>Respuesta:</strong> ' + q.opciones[q.respuesta_correcta] + '</p>'));
        ui.sound('correct');
        return Promise.resolve({ correct: true, question: q, achievements: res.achievements });
      }

      const q = engine.draw();
      const ctx = { engine, question: q, extraBadges: [] };
      let hinted = state.pendingHint;
      state.pendingHint = false;
      return new Promise((resolve) => {
        ui.question(ctx, qArea, {
          onHint: () => {
            if (hinted) { hinted = false; return true; }
            return false;
          },
          onAnswered: (res) => {
            const prog = App.progression.recordAnswer(profileOf(p), {
              question: q, selectedIndex: res.selectedIndex,
              difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId
            });
            resolve({ correct: prog.correct, question: q, achievements: prog.achievements });
          }
        });
      });
    }

    /* ---------- casillas especiales ---------- */
    function specialOn(pi, tp) {
      if (tp < 0 || tp >= 51) return null;
      const g = (START[pi] + tp) % 52;
      if (RETO[g]) return 'reto';
      if (AVANCE[g]) return 'avance';
      if (RETRO[g]) return 'retro';
      return null;
    }

    async function handleSpecial(p, pi, ti) {
      const t = p.tokens[ti];
      const sp = specialOn(pi, t.tp);
      if (!sp) return;
      if (sp === 'avance') {
        ui.toast('⬆️ Avance rápido +2', 'warn');
        await stepsAnim(pi, ti, 2);
      } else if (sp === 'retro') {
        if (t.tp > 1) {
          ui.toast('⏪ Retroceso -2', 'error');
          ui.shake(frame);
          await stepsAnim(pi, ti, -2);
        } else ui.toast('⏪ Retroceso (mínimo 0)');
      } else if (sp === 'reto') {
        ui.toast('❓ RETO: pregunta extra para +2', 'warn');
        ui.sound('dice');
        const res = await askPlayer(p);
        if (res.correct) {
          ui.floatText(frame, '+2 reto superado', 'ft-ok');
          await stepsAnim(pi, ti, 2);
        } else ui.toast('Reto fallado: no hay avance extra', 'error');
      }
    }

    /* ---------- turno ---------- */
    function leaderToken(p) {
      let leader = 0;
      p.tokens.forEach((t, i) => { if (t.tp > p.tokens[leader].tp) leader = i; });
      return leader;
    }

    function startTurn() {
      qArea.innerHTML = '';
      const pi = state.turn;
      const p = state.players[pi];
      setTurnUI();
      const rollBtn = ui.el('button', 'btn-primary w-full mt-3', '🎲 Lanzar dado');
      rollBtn.addEventListener('click', async () => {
        rollBtn.disabled = true;
        rollBtn.classList.add('opacity-60');
        const d = await rollDice();
        ui.toast(p.nombre + ' lanzó un ' + d, 'info');
        const res = await askPlayer(p);
        if (state.ended) return;
        if (res.correct) {
          const total = d + state.extra;
          if (state.extra) state.extra = 0;
          await stepsAnim(pi, leaderToken(p), total);
          await handleSpecial(p, pi, leaderToken(p));
          if (p.tokens.some((t) => t.tp >= 56)) return endGame(pi);
          if (res.achievements && res.achievements.length) {
            res.achievements.forEach((a) => ui.toast('🏅 Logro: ' + a.titulo, 'success'));
          }
        } else {
          ui.toast(p.nombre + ' falló: no avanza. Racha a cero.', 'error');
        }
        if (!state.ended) nextTurn();
      });
      qArea.appendChild(rollBtn);
    }

    function nextTurn() {
      if (state.ended) return;
      state.turn = (state.turn + 1) % state.players.length;
      startTurn();
    }

    /* ---------- resultados ---------- */
    function standings() {
      return state.players.map((p) => {
        const pr = profileOf(p);
        const lead = leader(p.tokens);
        return {
          id: p.id, nombre: p.nombre, color: p.color, avatar: p.avatar || App.avatars.pick(state.players.indexOf(p)),
          casilla: lead, puntos: (pr ? pr.puntos : 0),
          subtitulo: lead >= 56 ? '¡Llegó a la META!' : 'Casilla ' + Math.max(0, lead + 1) + '/56'
        };
      }).sort((a, b) => b.casilla - a.casilla || b.puntos - a.puntos);
    }

    function podiumFrom(st, title, bonus) {
      const box = ui.el('div', 'mt-4 space-y-3', '');
      st.forEach((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
        const row = ui.el('div', 'fin-row', '');
        row.appendChild(ui.el('span', 'text-2xl', medal));
        row.appendChild(App.avatars.badge(s.avatar || App.avatars.pick(i), 24));
        const mid = ui.el('div', 'flex-1', '');
        mid.appendChild(ui.el('b', '', s.nombre));
        mid.appendChild(ui.el('span', 'text-xs text-slate-500', ' ' + s.subtitulo));
        row.appendChild(mid);
        row.appendChild(ui.el('div', 'text-sm', '<b>' + s.puntos + '</b> pts'));
        box.appendChild(row);
      });
      root.appendChild(ui.el('div', 'fin-title', title));
      root.appendChild(box);
      if (bonus) root.appendChild(ui.el('div', 'bonus-summary', bonus));
    }

    function bonusOf(winner) {
      const aw = App.progression.awardWin(profileOf(winner), MODE);
      return ui.bonusParagraph([{
        nombre: winner.nombre, xp: aw.bonuses.xp, monedas: aw.bonuses.monedas,
        logros: (aw.achievements || []).map((a) => a.icono + ' ' + a.titulo)
      }]);
    }

    function endGame(winnerIdx) {
      if (state.ended) return;
      state.ended = true;
      const st = standings();
      const winner = state.players[winnerIdx];
      const bonus = bonusOf(winner);
      if (App.session && App.session.record) App.session.record(config, st, MODE);
      ui.sound('win');
      ui.confetti(root);
      ui.toast('🏆 ' + winner.nombre + ' ganó el Ludo Educativo', 'success');
      podiumFrom(st, '🎉 ¡' + winner.nombre + ' llegó a la META y gana!', bonus);
    }

    function startTimer() {
      const wrap = ui.el('div', 'mb-3', '');
      wrap.innerHTML = '<div class="tb"><div class="tb-fill"></div><span class="tb-label">00:00</span></div>';
      root.insertBefore(wrap, frame);
      const t = ui.timerBar(wrap, config.timeSeconds, () => {
        if (state.ended) return;
        state.ended = true;
        const st = standings();
        const win = st[0];
        const bonus = bonusOf(win);
        if (App.session && App.session.record) App.session.record(config, st, MODE);
        ui.sound('win');
        ui.toast('⏱️ Tiempo agotado. ' + win.nombre + ' lidera la clasificación.', 'success');
        podiumFrom(st, '⏱️ Tiempo agotado — clasificación final', bonus);
      });
      t.start();
    }

    startTimer();
    startTurn();
  }

  return { init, MODE };
})(App.ui);