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
    /* En modo escena el tablero ya viene dibujado en tablero-ludo.svg con la
       misma geometria (15x15, celda 24, margen 12 sobre 384x384), asi que aqui
       solo se colocan las fichas encima; sin escena se conserva la rejilla DOM. */
    const inScene = !!config.escenaCapa;
    const BOARD = { W: 384, H: 384, CELL: 24, MARGIN: 12 };
    const frame = ui.el('div', 'l-board-frame' + (inScene ? ' l-en-escena' : ''), '');
    frame.innerHTML = '<div class="ludo-grid"></div><div class="ludo-tokens"></div>';
    if (inScene) config.escenaCapa.appendChild(frame); else root.appendChild(frame);
    const gridEl = frame.querySelector('.ludo-grid');
    const tokensEl = frame.querySelector('.ludo-tokens');

    const pathCoord = {};
    PATH.forEach((c, i) => { pathCoord[c.join('-')] = i; });
    const homeCoord = {};
    HOME_STRETCH.forEach((lane, pi) => lane.forEach((c) => { homeCoord[c.join('-')] = pi; }));

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (inScene) break;          /* con escenario la imagen ya es el tablero */
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
    /* posicion de una casilla del SVG, en % de la escena */
    function cellPct(rc) {
      const x = BOARD.MARGIN + rc[1] * BOARD.CELL + BOARD.CELL / 2;
      const y = BOARD.MARGIN + rc[0] * BOARD.CELL + BOARD.CELL / 2;
      return { left: x / BOARD.W * 100, top: y / BOARD.H * 100 };
    }
    /* varias fichas en la misma casilla se separan un poco para verse todas */
    function crowdOffset(pi, ti) {
      const t = state.players[pi].tokens[ti];
      if (t.tp < 0 || t.tp >= 56) return [0, 0];
      const g = t.tp < 51 ? (START[pi] + t.tp) % 52 : -1;
      const rc = gridCellFor(pi, t.tp, ti);
      let n = 0;
      for (let p2 = 0; p2 < state.players.length; p2++) {
        state.players[p2].tokens.forEach((o, oi) => {
          if (o.tp < 0 || o.tp >= 56) return;
          const g2 = o.tp < 51 ? (START[p2] + o.tp) % 52 : -1;
          const same = g2 === g ? gridCellFor(p2, o.tp, oi).join(',') === rc.join(',') : false;
          if (same && (p2 < pi || (p2 === pi && oi < ti))) n++;
        });
      }
      const off = [[0, 0], [-5, -5], [5, -5], [-5, 5], [5, 5], [0, -7], [0, 7], [-7, 0], [7, 0]];
      return off[n % off.length];
    }

    function place(pi, ti) {
      const t = state.players[pi].tokens[ti];
      const [r, c] = gridCellFor(pi, t.tp, ti);
      const dot = tokenEls[pi + '-' + ti];
      let p;
      if (inScene) {
        p = cellPct([r, c]);
        const [dx, dy] = crowdOffset(pi, ti);
        dot.style.left = (p.left + dx) + '%';
        dot.style.top = (p.top + dy) + '%';
      } else {
        dot.style.left = ((c + 0.5) / N * 100) + '%';
        dot.style.top = ((r + 0.5) / N * 100) + '%';
      }
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
      const act = state.players[state.turn];
      App.gamekit.renderChips(playersChips, state.players, {
        activeId: act.id, extra: (p) => leaderPos(p)
      });
    }
    function renderSkills() {
      const pr = App.storage.getById('players', state.players[state.turn].id);
      if (!pr) { skillsEl.innerHTML = ''; return; }
      const list = [['pista', '💡', 'Pista'], ['comodin', '🃏', 'Comodín'], ['impulso', '🚀', 'Impulso']];
      App.gamekit.renderSkills(skillsEl, list.map(([sk, ic, nm]) => ({
        key: sk, icono: ic, nombre: nm, amount: (pr.skills || {})[sk] || 0,
        on: sk === 'impulso' && state.extra > 0,
        label: sk === 'impulso' && state.extra > 0 ? ' (activo)' : ''
      })), (sk) => {
        App.progression.useSkill(pr, sk);
        if (sk === 'pista') state.pendingHint = true;
        if (sk === 'comodin') state.pendingComodin = true;
        if (sk === 'impulso') state.extra += 2;
        ui.sound('dice');
        renderSkills();
      }, state.ended);
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
      /* gamekit invoca profileOf con el id del jugador */
      return App.gamekit.bonusForPlayer(winner, (id) => App.storage.getById('players', id), MODE);
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
      App.gamekit.timerBox(root, config.timeSeconds, () => {
        if (state.ended) return;
        state.ended = true;
        const st = standings();
        const win = st[0];
        const bonus = bonusOf(win);
        if (App.session && App.session.record) App.session.record(config, st, MODE);
        ui.sound('win');
        ui.toast('⏱️ Tiempo agotado. ' + win.nombre + ' lidera la clasificación.', 'success');
        podiumFrom(st, '⏱️ Tiempo agotado — clasificación final', bonus);
      }, frame);
    }

    startTimer();
    startTurn();
  }

  /* ============================================================
   * MODO RED: el servidor lleva la partida y esta misma vista la dibuja.
   * Comparte tablero, constantes, fichas y estilos con el modo local.
   * config = { container, escenaCapa?, codigo, rol, yo }
   * ============================================================ */
  function initNet(config) {
    const NET = App.net;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (!NET) {
      config.container.appendChild(ui.el('p', 'text-sm text-slate-400', 'La partida en red no está disponible.'));
      return;
    }

    const root = config.container;
    const rol = config.rol || NET.rol() || 'alumno';
    const codigo = config.codigo || NET.codigo() || '';
    const SH = ['▲', '◆', '●', '■'];
    const BOARD = { W: 384, H: 384, CELL: 24, MARGIN: 12 };
    const META = 56;
    const COLORES = ['rojo', 'verde', 'azul', 'amarillo'];

    let est = NET.estado();
    let preg = NET.pregunta();
    let fin = NET.fin();
    let registro = NET.registro();
    let log = [];
    let venc = NET.vencimientos();
    let off = venc.off || 0;
    let turnoVence = venc.turno;
    let partidaVence = venc.partida;
    let enviando = false;
    let vivo = true;
    const visualPos = {};

    const enEscena = !!config.escenaCapa;
    const frame = ui.el('div', 'l-board-frame' + (enEscena ? ' l-en-escena' : ''), '');
    frame.innerHTML = '<div class="ludo-grid"></div><div class="ludo-tokens"></div>';
    if (enEscena) config.escenaCapa.appendChild(frame); else root.appendChild(frame);
    const gridEl = frame.querySelector('.ludo-grid');
    const tokensEl = frame.querySelector('.ludo-tokens');

    if (!enEscena) {
      const pathCoord = {};
      PATH.forEach((c, i) => { pathCoord[c.join('-')] = i; });
      const homeCoord = {};
      HOME_STRETCH.forEach((lane, pi) => lane.forEach((c) => { homeCoord[c.join('-')] = pi; }));
      const n = (NET.sala() && NET.sala().jugadores.length) || 4;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const key = r + '-' + c;
          const cell = ui.el('div', 'l-cell', '');
          let owner = -1;
          BASE_ORIGIN.forEach((o, pi) => { if (r >= o[0] && r <= o[0] + 5 && c >= o[1] && c <= o[1] + 5) owner = pi; });
          const inHome = homeCoord[key];
          if (owner !== -1 && owner < n) {
            cell.classList.add('l-base', 'l-base-' + COLORES[owner]);
            if (YARD_SLOTS.some((s) => BASE_ORIGIN[owner][0] + s[0] === r && BASE_ORIGIN[owner][1] + s[1] === c)) cell.appendChild(ui.el('span', 'l-yard', ''));
          } else if (key === '7-7') {
            cell.classList.add('l-meta');
            cell.appendChild(ui.el('span', '', '🏆'));
          } else if (inHome !== undefined && inHome < n) {
            cell.classList.add('l-home', 'l-home-' + COLORES[inHome]);
          } else if (pathCoord[key] !== undefined) {
            const g = pathCoord[key];
            cell.classList.add('l-path');
            if (SAFE[g]) cell.appendChild(ui.el('span', 'l-sp l-star', '⭐'));
            else if (RETO[g]) cell.appendChild(ui.el('span', 'l-sp l-reto', '❓'));
            else if (AVANCE[g]) cell.appendChild(ui.el('span', 'l-sp l-up', '⬆'));
            else if (RETRO[g]) cell.appendChild(ui.el('span', 'l-sp l-back', '⏪'));
            cell.appendChild(ui.el('span', 'l-idx', String(g)));
          } else cell.classList.add('l-empty');
          gridEl.appendChild(cell);
        }
      }
    }

    function celdaDe(asiento, pos, tokIdx) {
      if (pos < 0) {
        const o = BASE_ORIGIN[asiento] || BASE_ORIGIN[0];
        const s = YARD_SLOTS[tokIdx || 0];
        return [o[0] + s[0], o[1] + s[1]];
      }
      if (pos >= META) return CENTER.slice();
      if (pos < 51) return PATH[(START[asiento] + pos) % 52].slice();
      return (HOME_STRETCH[asiento] || HOME_STRETCH[0])[Math.min(4, pos - 51)].slice();
    }

    function pct(rc) {
      if (enEscena) {
        const x = BOARD.MARGIN + rc[1] * BOARD.CELL + BOARD.CELL / 2;
        const y = BOARD.MARGIN + rc[0] * BOARD.CELL + BOARD.CELL / 2;
        return { left: x / BOARD.W * 100, top: y / BOARD.H * 100 };
      }
      return { left: (rc[1] + 0.5) / N * 100, top: (rc[0] + 0.5) / N * 100 };
    }

    const listaAsientos = () => (est ? est.asientos : (NET.sala() ? NET.sala().jugadores : []));
    const tokenEls = {};

    function resolveAvatar(a, i) {
      if (a && typeof a.avatar === 'object' && a.avatar) return a.avatar;
      return App.avatars.pick(((a && +a.avatar) || i) % 16);
    }

    function asegurarFichas() {
      const lista = listaAsientos();
      if (!lista.length) return;
      if (tokensEl.childElementCount === lista.length * 4) return;
      tokensEl.innerHTML = '';
      lista.forEach((a, pi) => {
        if (visualPos[pi] === undefined) visualPos[pi] = (est && typeof a.pos === 'number') ? a.pos : -1;
        for (let ti = 0; ti < 4; ti++) {
          const dot = ui.el('div', 'l-token l-token-' + (a.color || COLORES[pi % 4]), '');
          const cnv = document.createElement('canvas');
          cnv.width = cnv.height = 26;
          cnv.className = 'avatar-canvas';
          const g = cnv.getContext('2d');
          App.avatars.drawIcon(g, 5, 5, 1, resolveAvatar(a, pi), 'right');
          dot.appendChild(cnv);
          tokensEl.appendChild(dot);
          tokenEls[pi + '-' + ti] = dot;
        }
      });
    }

    function colocar() {
      const lista = listaAsientos();
      if (!lista.length) return;
      asegurarFichas();
      const n = lista.length;
      const ocupadas = lista.map((_, i) => celdaDe(i, visualPos[i] !== undefined ? visualPos[i] : -1, 0).join(','));
      lista.forEach((a, pi) => {
        for (let ti = 0; ti < 4; ti++) {
          const dot = tokenEls[pi + '-' + ti];
          if (!dot) continue;
          const pos = ti === 0 ? (visualPos[pi] !== undefined ? visualPos[pi] : (est ? a.pos : -1)) : -1;
          const rc = celdaDe(pi, pos, ti);
          const p = pct(rc);
          const repetida = ti === 0 && pos >= 0 && ocupadas.some((o, k) => k !== pi && o === rc.join(','));
          const dx = repetida ? (pi - (n - 1) / 2) * 1.6 : 0;
          dot.style.left = (p.left + dx) + '%';
          dot.style.top = p.top + '%';
          dot.style.zIndex = pos >= META ? 30 : (ti === 0 ? 15 : 10);
        }
      });
    }

    function stepsAnimNet(pi, fromPos, toPos) {
      const dot = tokenEls[pi + '-0'];
      if (dot) dot.classList.add('l-run');
      let cur = fromPos;
      return new Promise((resolve) => {
        const step = () => {
          if (cur === toPos) {
            if (dot) dot.classList.remove('l-run');
            return resolve();
          }
          cur += (toPos > cur ? 1 : -1);
          visualPos[pi] = cur;
          colocar();
          setTimeout(step, 220);
        };
        setTimeout(step, 30);
      });
    }

    /* ---------- HUD idéntico al local ---------- */
    root.innerHTML = '';
    const hd = ui.el('div', 'text-xs text-slate-400 text-center mb-1', '');
    const tm = ui.el('div', 'text-xs font-bold text-amber-400 text-center mb-2', '');
    const hud = ui.el('div', 'space-y-3 mt-1', '');
    hud.innerHTML = [
      '<div class="flex items-center justify-between">',
      '<div id="lu-turn-net" class="font-bold text-sm flex items-center gap-1"></div>',
      '<div class="flex items-center gap-2"><span class="text-xs text-slate-500">Dado</span><div id="lu-dice-net" class="dice-box">🎲</div></div>',
      '</div>',
      '<div id="lu-players-net" class="flex flex-wrap gap-2 justify-center"></div>'
    ].join('');
    const act = ui.el('div', 'mt-3', '');
    const lg = ui.el('div', 'text-xs text-slate-400 space-y-1 mt-3', '');

    root.appendChild(hd);
    root.appendChild(tm);
    root.appendChild(hud);
    root.appendChild(act);
    root.appendChild(lg);

    const turnEl = hud.querySelector('#lu-turn-net');
    const diceEl = hud.querySelector('#lu-dice-net');
    const pl = hud.querySelector('#lu-players-net');

    const yo = () => (rol === 'docente' ? null : NET.yo());
    const esMiTurno = () => est && est.espera && est.espera.asiento === yo();
    const nombre = (a) => {
      const lista = listaAsientos();
      return (lista[a] && lista[a].nombre) || ('Jugador ' + (a + 1));
    };

    function animarDadoNet(valFinal) {
      let n = 0;
      const timer = setInterval(() => {
        diceEl.textContent = 1 + Math.floor(Math.random() * 6);
        ui.sound('dice');
        if (++n >= 10) {
          clearInterval(timer);
          diceEl.textContent = valFinal;
        }
      }, 55);
    }

    function reloj() {
      const now = Date.now() + off;
      const p = [];
      if (turnoVence) p.push('⏱ Turno: ' + Math.max(0, Math.ceil((turnoVence - now) / 1000)) + ' s');
      if (partidaVence) {
        const s = Math.max(0, Math.ceil((partidaVence - now) / 1000));
        p.push('🏁 Partida: ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
      }
      return p.join('   ·   ');
    }

    function pintarJugadores() {
      pl.innerHTML = '';
      const lista = listaAsientos();
      const sala = NET.sala();
      const actIdx = (est && est.espera) ? est.espera.asiento : 0;
      const actP = lista[actIdx];

      if (turnEl && actP) {
        turnEl.innerHTML = '';
        turnEl.appendChild(App.avatars.badge(resolveAvatar(actP, actIdx), 24));
        turnEl.appendChild(document.createTextNode(' Turno de '));
        turnEl.appendChild(ui.el('b', '', esc(actP.nombre)));
      }

      lista.forEach((a, i) => {
        const online = !sala || !sala.jugadores[i] || sala.jugadores[i].online;
        const chip = ui.el('div', 'l-chip' + (actIdx === i ? ' l-chip-active' : ''), '');
        chip.appendChild(App.avatars.badge(resolveAvatar(a, i), 22));
        chip.appendChild(ui.el('span', 'text-xs font-semibold', esc(a.nombre) + (yo() === i ? ' (tú)' : '')));
        const pos = est ? (a.pos < 0 ? 'En base' : a.pos >= META ? '🏆 META' : 'Casilla ' + (a.pos + 1) + '/56') : '';
        chip.appendChild(ui.el('span', 'l-chip-pos', pos + (online ? '' : ' · desconectado')));
        pl.appendChild(chip);
      });
    }

    function pintarLog() {
      lg.innerHTML = '';
      if (!log.length) return;
      log.slice(0, 5).forEach((l) => lg.appendChild(ui.el('div', '', esc(l))));
    }

    function registrar(evs) {
      (evs || []).forEach((ev) => {
        let t = null;
        if (ev.t === 'dado') {
          t = '🎲 ' + nombre(ev.asiento) + ' sacó ' + ev.valor;
          animarDadoNet(ev.valor);
          ui.toast(nombre(ev.asiento) + ' lanzó un ' + ev.valor, 'info');
        } else if (ev.t === 'respondida') {
          t = (ev.correcto ? '✅ ' : '❌ ') + nombre(ev.asiento) + (ev.correcto ? ' acertó' : ' falló');
          if (ev.asiento === yo()) {
            ui.sound(ev.correcto ? 'correct' : 'wrong');
            ui.toast(ev.correcto ? '✅ ¡Correcto!' : '❌ Incorrecto: no avanza', ev.correcto ? 'success' : 'error');
          }
        } else if (ev.t === 'especial') {
          if (ev.tipo === 'avance') {
            t = '⬆ ' + nombre(ev.asiento) + ' avanza +2';
            ui.toast('⬆️ Avance rápido +2', 'warn');
          } else if (ev.tipo === 'retroceso') {
            t = '⏪ ' + nombre(ev.asiento) + ' retrocede 2';
            ui.toast('⏪ Retroceso -2', 'error');
            ui.shake(frame);
          } else {
            t = '❓ ' + nombre(ev.asiento) + ' cae en un reto';
            ui.toast('❓ RETO: pregunta extra para +2', 'warn');
          }
        } else if (ev.t === 'turno-saltado') {
          t = '⏭ Turno de ' + nombre(ev.asiento) + ' saltado';
        }
        if (t) log.unshift(t);
      });
      log = log.slice(0, 5);
    }

    function preguntar() {
      act.innerHTML = '';
      const card = ui.el('div', 'q-card', '');
      card.appendChild(ui.el('div', 'text-xs text-slate-400 mb-1',
        esc(preg.categoria || '') + (preg.dificultad ? ' · ' + esc(preg.dificultad) : '')));
      card.appendChild(ui.el('h3', 'q-text text-slate-900', esc(preg.enunciado)));
      const list = ui.el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4', '');
      const puedo = esMiTurno();
      preg.opciones.forEach((op, i) => {
        const b = ui.el('button', 'opt-btn s' + i,
          '<span class="opt-key">' + SH[i % 4] + '</span><span class="opt-label">' + esc(op) + '</span>');
        if (!puedo) b.disabled = true;
        b.addEventListener('click', () => {
          if (enviando) return;
          enviando = true;
          act.querySelectorAll('.opt-btn').forEach((x) => { x.disabled = true; });
          NET.accion({ tipo: 'responder', eleccion: i }).then((r) => {
            enviando = false;
            if (!r || !r.ok) {
              ui.toast((r && (r.mensaje || r.error)) || 'No se pudo responder', 'error');
              pintar();
            }
          });
        });
        list.appendChild(b);
      });
      card.appendChild(list);
      act.appendChild(card);
      if (!puedo) act.appendChild(ui.el('p', 'text-xs text-slate-400 mt-2 text-center', nombre(est.espera.asiento) + ' está respondiendo…'));
    }

    function pintarFinal() {
      const f = fin || (est && { ganador: est.ganador, motivo: est.motivoFin, clasificacion: [] });
      if (!f) return;
      const g = (f.clasificacion || []).find((c) => c.asiento === f.ganador);
      act.innerHTML = '';
      act.appendChild(ui.el('div', 'fin-title', '🎉 ¡' + esc(g ? g.nombre : nombre(f.ganador)) + ' gana el Ludo!'));
      act.appendChild(ui.el('p', 'text-sm text-slate-400 text-center mb-2',
        f.motivo === 'meta' ? 'Llegó primero a la META' : 'Iba más adelantado cuando se acabó el tiempo'));
      (f.clasificacion || []).forEach((c, k) => {
        const row = ui.el('div', 'fin-row', '');
        row.appendChild(ui.el('span', 'text-2xl', ['🥇', '🥈', '🥉', '🏅'][k] || '🏅'));
        row.appendChild(App.avatars.badge(resolveAvatar(c, c.asiento), 24));
        row.appendChild(ui.el('div', 'flex-1', '<b>' + esc(c.nombre) + '</b><span class="text-xs text-slate-400"> ' +
          (c.llego ? '¡Llegó a la META!' : c.pos < 0 ? 'En base' : 'Casilla ' + (c.pos + 1) + '/56') + '</span>'));
        act.appendChild(row);
      });
      if (registro) act.appendChild(ui.el('p', 'text-sm text-center mt-2', 'Respondiste bien <b>' +
        registro.respuestas.filter((r) => r.correcto).length + '</b> de <b>' + registro.respuestas.length + '</b> preguntas.'));
      const volver = ui.el('button', 'btn-primary w-full mt-3', 'Volver al inicio');
      volver.addEventListener('click', () => { limpiar(); App.go(rol === 'docente' ? 'inicio' : 'red'); });
      act.appendChild(volver);
      if (rol === 'docente') {
        const cerrar = ui.el('button', 'btn-ghost w-full mt-2', 'Cerrar sala');
        cerrar.addEventListener('click', () => NET.cerrar().then(() => App.go('inicio')));
        act.appendChild(cerrar);
      }
    }

    function pintar() {
      if (!vivo || !document.body.contains(frame)) { limpiar(); return; }
      colocar();
      hd.innerHTML = 'Sala <b>' + esc(codigo) + '</b> · Ludo Educativo' + (rol === 'docente' ? ' · Vista del docente' : '');
      tm.textContent = reloj();
      pintarJugadores();
      pintarLog();

      if (fin || (est && est.fase === 'terminada')) return pintarFinal();

      act.innerHTML = '';
      if (!est) {
        act.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', 'Esperando el estado de la partida…'));
      } else if (est.fase === 'tirar') {
        diceEl.textContent = '🎲';
        if (esMiTurno()) {
          const b = ui.el('button', 'btn-primary w-full mt-2', '🎲 Lanzar dado');
          b.addEventListener('click', () => {
            b.disabled = true;
            NET.accion({ tipo: 'tirar' }).then((r) => {
              if (!r || !r.ok) {
                b.disabled = false;
                ui.toast((r && (r.mensaje || r.error)) || 'No se pudo tirar', 'error');
              }
            });
          });
          act.appendChild(b);
        } else {
          act.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', '🎲 Turno de <b>' + esc(nombre(est.espera.asiento)) + '</b>: va a lanzar el dado…'));
        }
      } else if (est.fase === 'responder') {
        if (est.dado) diceEl.textContent = est.dado;
        if (est.pendiente && est.pendiente.tipo === 'reto') act.appendChild(ui.el('p', 'text-sm text-amber-400 font-bold mb-2 text-center', '❓ Reto: acierta y avanzas 2 casillas más'));
        if (preg && preg.v === est.v) preguntar();
        else act.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', '⏳ <b>' + esc(nombre(est.espera.asiento)) + '</b> está respondiendo…'));
      }

      if (rol === 'docente') {
        const fila = ui.el('div', 'flex gap-2 mt-3', '');
        const saltar = ui.el('button', 'btn-ghost text-xs flex-1', '⏭ Saltar turno');
        saltar.addEventListener('click', () => NET.saltar().then((r) => { if (!r.ok) ui.toast(r.mensaje || r.error, 'warn'); }));
        const cerrar = ui.el('button', 'btn-ghost text-xs flex-1', '✕ Cerrar sala');
        cerrar.addEventListener('click', () => {
          if (confirm('¿Cerrar la sala? Se acaba la partida para todos.')) NET.cerrar().then(() => App.go('inicio'));
        });
        fila.append(saltar, cerrar);
        act.appendChild(fila);
      }
    }

    const offs = [];
    function limpiar() {
      if (!vivo) return;
      vivo = false;
      offs.forEach((fn) => { try { fn(); } catch (e) {} });
      clearInterval(tick);
    }
    function alCerrar() { limpiar(); ui.toast('El docente cerró la sala', 'warn'); App.go('inicio'); }
    function alExpulsar() { limpiar(); ui.toast('El docente te sacó de la sala', 'warn'); App.go('red'); }

    offs.push(NET.on('estado', (p) => {
      if (!p) return;
      const prev = est ? JSON.parse(JSON.stringify(est)) : null;
      est = p.estado || null;
      turnoVence = p.turnoVence || null;
      partidaVence = p.partidaVence || null;
      off = (p.ahora || Date.now()) - Date.now();
      registrar(p.eventos);

      if (est && est.asientos) {
        est.asientos.forEach((a, pi) => {
          const oldP = (prev && prev.asientos && prev.asientos[pi]) ? prev.asientos[pi].pos : (visualPos[pi] !== undefined ? visualPos[pi] : a.pos);
          if (typeof oldP === 'number' && typeof a.pos === 'number' && oldP !== a.pos) {
            stepsAnimNet(pi, oldP, a.pos);
          } else {
            visualPos[pi] = a.pos;
          }
        });
      }
      pintar();
    }));
    offs.push(NET.on('pregunta', (q) => { preg = q; pintar(); }));
    offs.push(NET.on('sala', () => pintar()));
    offs.push(NET.on('fin', (f) => { fin = f; ui.sound('win'); ui.confetti(root); pintar(); }));
    offs.push(NET.on('registro', (r) => { registro = r; pintar(); }));
    offs.push(NET.on('cerrada', alCerrar));
    offs.push(NET.on('expulsado', alExpulsar));

    const tick = setInterval(() => {
      if (!vivo || !document.body.contains(frame)) { limpiar(); return; }
      tm.textContent = reloj();
    }, 250);

    pintar();
  }

  return { init, initNet, MODE };
})(App.ui);
