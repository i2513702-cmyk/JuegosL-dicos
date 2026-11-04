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
  const esc = function(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ var map={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}; return map[c] || c; }); };

  function init(config) {
    const root = config.container;
    const engine = App.questionEngine.createEngine({
      courseId: config.courseId,
      categoryId: config.categoryId,
      difficultyId: config.difficultyId
    });
    const TOTAL = config.trackLength || 14;
    /* Obstaculos fuera del tramo inicial: la primera casilla de RACHA bonifica +2
       (streak>=2) y un obstaculo ahi (-2) cancelaba el avance y devolvia a los
       corredores a su posicion previa. Se evitan cadenas (13 -> 11, 9 -> 7). */
    const OBSTACLES = [6, 9, 13];
    const colors = ['rojo', 'verde', 'azul', 'amarillo'];

    const players = config.players.map((p, i) => ({
      ...p, color: colors[i % 4], pos: 0, streak: 0, finished: false
    }));
    const state = { turn: 0, ended: false, pendHint: false, pendComodin: false, extra: 0 };
    const est = { asientos: players, turno: state.turn, fase: 'avanzar', trackLength: TOTAL, extra: state.extra, espera: { asiento: state.turn, que: 'avanzar' } };

    root.innerHTML = '';
    const title = ui.el('div', 'text-center text-xl font-extrabold text-slate-900 mb-2', '🏁 Carrera de Preguntas');
    root.appendChild(title);

    /* ---- pista ---- */
    /* En modo escena el asfalto y la linea de meta YA estan dibujados en el SVG
       (pista-de-carreras.svg: asfalto de y=190 a 380, salida en x=14 y meta en
       x=600), asi que aqui solo se colocan los avatares y los obstaculos sobre
       esa pintura, sin recuadros propios. */
    const inScene = !!config.escenaCapa;
    const SCENE = { W: 680, H: 380, ROAD_TOP: 190, ROAD_BOTTOM: 380, START_X: 14, FINISH_X: 600 };
    /* el avatar mide 11% del ancho de la pista (ver .tr-en-escena .tr-token.tr-token-avatar);
       usar un half fijo evita que el clamp salte al primer repintado, cuando
       offsetWidth todavia no esta resuelto (los dos corredores se desplazaban). */
    const TOKEN_HALF = SCENE.W * 0.11 / 2;
    const track = ui.el('div', 'track-wrap' + (inScene ? ' tr-en-escena' : ''), '');
    const cells = ui.el('div', 'track-cells', '');
    if (!inScene) {
      for (let i = 0; i < TOTAL; i++) {
        const cell = ui.el('div', 'tr-cell' + (OBSTACLES.indexOf(i) !== -1 ? ' tr-cell-obs' : ''),
          OBSTACLES.indexOf(i) !== -1 ? '⚠️' : String(i + 1));
        cells.appendChild(cell);
      }
      cells.appendChild(ui.el('div', 'tr-meta', '🏁'));
    } else {
      OBSTACLES.forEach((i) => {
        if (i >= TOTAL) return;   /* pista corta: ese obstaculo no existe */
        const mark = ui.el('div', 'tr-obs', '⚠️');
        placeOnRoad(mark, i, 0, 7);
        cells.appendChild(mark);
      });
    }
    track.appendChild(cells);
    const trackTokens = ui.el('div', 'track-tokens', '');
    track.appendChild(trackTokens);
    if (inScene) config.escenaCapa.appendChild(track); else root.appendChild(track);

    /* coloca un elemento sobre el asfalto del SVG (en % de la escena).
       El ancho del avatar se descuenta para que no sobresalga por los lados. */
    function placeOnRoad(node, pos, lane, half, dx, dy) {
      half = half || node.offsetWidth / 2 || 17;
      const min = SCENE.START_X + half + 2;
      const max = SCENE.FINISH_X - half - 2;
      let x = SCENE.START_X + (pos / TOTAL) * (SCENE.FINISH_X - SCENE.START_X) + (dx || 0);
      x = Math.max(min, Math.min(max, x));
      const y = 247 + (lane % 2) * 76 + (dy || 0);   /* los dos carriles centrales del asfalto */
      node.style.left = (x / SCENE.W * 100) + '%';
      node.style.top = ((y - SCENE.ROAD_TOP) / (SCENE.ROAD_BOTTOM - SCENE.ROAD_TOP) * 100) + '%';
    }

    /* Varias fichas en la MISMA casilla y carril se apilan exactamente (parece una
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
    }

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

    /* Bandera de meta para quien llega primero. */
    function markFinished(p, i) {
      p.finished = true;
      const el = tokenEls[i];
      if (!el) return;
      el.classList.add('tr-finish');
      const flag = ui.el('span', 'tr-flag', '\uD83C\uDFC1');
      el.appendChild(flag);
    }

    function paintTrack() {
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
    }
    paintTrack();

    /* ---- marcador en vivo ---- */
    const rankingEl = ui.el('div', 'flex flex-wrap gap-2 justify-center mb-3', '');
    root.appendChild(rankingEl);
    function paintRanking() {
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
    }
    paintRanking();

    /* ---- HUD de turno y habilidades ---- */
    const hud = ui.el('div', 'flex flex-wrap items-center justify-between gap-2 mb-2', '');
    hud.innerHTML = '<div class="text-sm font-bold" id="cr-turn"></div><div id="cr-skills" class="flex flex-wrap gap-2"></div>';
    root.appendChild(hud);
    const turnEl = hud.querySelector('#cr-turn');
    const skillsEl = hud.querySelector('#cr-skills');

    function setTurnUI() {
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
          setTimeout(step, 130);
        };
        setTimeout(step, 20);
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
          if (p.pos >= TOTAL) {
            markFinished(p, state.turn);
            ui.sound('win');
            ui.toast('🏁 ' + p.nombre + ' cruzó la meta y gana la Carrera', 'success');
            ui.confetti(root);
            /* pequeño descanso para ver la bandera antes del podio */
            await new Promise((r) => setTimeout(r, 700));
            return endGame(p.id);
          }
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
      ui.toast('🏁 ' + winner.nombre + ' ganó la Carrera', 'success');
      App.gamekit.podium(root, st.map((s, i) => ({
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



  function initNet(config) {
    const NET = App.net;
    if (!NET) {
      if (config.container) config.container.appendChild(ui.el('p', 'text-sm text-slate-400', 'La partida en red no está disponible.'));
      return;
    }
    const root = config.container;
    const rol = config.rol || (NET.rol ? NET.rol() : 'alumno');
    const codigo = config.codigo || (NET.codigo ? NET.codigo() : '');
    const escFn = esc;
    const SH = ['▲', '◆', '●', '■'];

    let est = NET.estado() ? JSON.parse(JSON.stringify(NET.estado())) : null;
    let preg = NET.pregunta ? NET.pregunta() : null;
    let fin = NET.fin ? NET.fin() : null;
    let registro = NET.registro ? NET.registro() : null;
    let venc = NET.vencimientos ? NET.vencimientos() : {};
    let off = (venc && venc.off) ? venc.off : 0;
    let turnoVence = venc ? venc.turno : null;
    let partidaVence = venc ? venc.partida : null;
    let enviando = false;
    let vivo = true;

    const TOTAL = (est && est.trackLength) ? est.trackLength : (config.trackLength || 14);

    root.innerHTML = '';
    root.appendChild(ui.el('div', 'text-center text-xl font-extrabold text-slate-900 mb-1', '🏁 Carrera de Preguntas'));
    const hd = ui.el('div', 'text-center text-xs text-slate-400 mb-1', 'Sala <b>' + escFn(codigo) + '</b>' + (rol === 'docente' ? ' · Vista del docente' : ''));
    const tm = ui.el('div', 'text-center text-xs font-bold text-amber-500 mb-2', '');
    root.appendChild(hd);
    root.appendChild(tm);

    const inScene = !!config.escenaCapa;
    const SCENE = { W: 680, H: 380, ROAD_TOP: 190, ROAD_BOTTOM: 380, START_X: 14, FINISH_X: 600 };
    const TOKEN_HALF = SCENE.W * 0.11 / 2;
    const OBSTACLES = [6, 9, 13];

    const track = ui.el('div', 'track-wrap' + (inScene ? ' tr-en-escena' : ''), '');
    const cells = ui.el('div', 'track-cells', '');
    if (!inScene) {
      for (let i = 0; i < TOTAL; i++) {
        const cell = ui.el('div', 'tr-cell' + (OBSTACLES.indexOf(i) !== -1 ? ' tr-cell-obs' : ''), OBSTACLES.indexOf(i) !== -1 ? '⚠️' : String(i + 1));
        cells.appendChild(cell);
      }
      cells.appendChild(ui.el('div', 'tr-meta', '🏁'));
    } else {
      OBSTACLES.forEach((i) => {
        if (i >= TOTAL) return;
        const mark = ui.el('div', 'tr-obs', '⚠️');
        placeOnRoadNet(mark, i, 0, 7);
        cells.appendChild(mark);
      });
    }
    track.appendChild(cells);
    const trackTokens = ui.el('div', 'track-tokens', '');
    track.appendChild(trackTokens);
    if (inScene && config.escenaCapa) config.escenaCapa.appendChild(track);
    else root.appendChild(track);

    function placeOnRoadNet(node, pos, lane, half, dx, dy) {
      const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
      half = half || (node.offsetWidth / 2) || 17;
      const min = SCENE.START_X + half + 2;
      const max = SCENE.FINISH_X - half - 2;
      let x = SCENE.START_X + ((pos || 0) / trackL) * (SCENE.FINISH_X - SCENE.START_X) + (dx || 0);
      x = Math.max(min, Math.min(max, x));
      const y = 247 + ((lane || 0) % 2) * 76 + (dy || 0);
      node.style.left = (x / SCENE.W * 100) + '%';
      node.style.top = ((y - SCENE.ROAD_TOP) / (SCENE.ROAD_BOTTOM - SCENE.ROAD_TOP) * 100) + '%';
    }

    function crowdOffsetNet(pos, i) {
      const mates = [];
      const lista = (est && est.asientos) ? est.asientos : [];
      lista.forEach((p, j) => {
        if (j !== i && (p.pos || 0) === pos && (j % 2) === (i % 2)) mates.push(j);
      });
      const order = mates.filter((j) => j < i).length;
      return ([[0, 0], [-9, -9], [9, -9], [0, -14]][order]) || [0, 0];
    }

    const tokenEls = [];
    const listaAsientosInit = () => (est && est.asientos) ? est.asientos : (NET.sala() ? NET.sala().jugadores : []);
    function resolveAvatar(p, i) {
      if (p && typeof p.avatar === 'object' && p.avatar) return p.avatar;
      return App.avatars.pick(((p && +p.avatar) || i) % 16);
    }

    function asegurarFichas() {
      const lista = listaAsientosInit();
      if (!lista.length) return;
      if (tokenEls.length === lista.length && trackTokens.childElementCount === lista.length) return;
      trackTokens.innerHTML = '';
      tokenEls.length = 0;
      lista.forEach((p, i) => {
        const t = ui.el('div', 'tr-token tr-token-avatar', '');
        const cnv = document.createElement('canvas');
        cnv.width = cnv.height = 34;
        cnv.className = 'avatar-canvas';
        const g = cnv.getContext('2d');
        const ch = resolveAvatar(p, i);
        if (g && ch) {
          g.fillStyle = (ch.armor || '#999') + '2e';
          g.beginPath(); g.arc(17, 17, 16, 0, Math.PI * 2); g.fill();
          App.avatars.drawIcon(g, 1, 1, 2, ch, 'right');
        }
        t.appendChild(cnv);
        t.title = p.nombre || '';
        trackTokens.appendChild(t);
        tokenEls.push(t);
      });
    }

    function markFinishedNet(i) {
      const el = tokenEls[i];
      if (!el || el.classList.contains('tr-finish')) return;
      el.classList.add('tr-finish');
      el.appendChild(ui.el('span', 'tr-flag', '🏁'));
    }

    function paintTrackNet() {
      asegurarFichas();
      const lista = listaAsientosInit();
      const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
      lista.forEach((p, i) => {
        const t = tokenEls[i];
        if (!t) return;
        const pos = Math.min(p.pos || 0, trackL);
        if (inScene) {
          const offC = crowdOffsetNet(pos, i);
          placeOnRoadNet(t, pos, i, TOKEN_HALF, offC[0], offC[1]);
        } else {
          t.style.left = (pos / trackL * 100) + '%';
          t.style.top = (20 + (i % 2) * 34) + '%';
        }
        if (pos >= trackL) markFinishedNet(i);
        t.style.opacity = pos >= trackL ? 1 : 0.98;
      });
    }

    const rankingEl = ui.el('div', 'flex flex-wrap gap-2 justify-center mb-3', '');
    root.appendChild(rankingEl);
    function paintRankingNet() {
      const lista = listaAsientosInit();
      const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
      const turno = (est && typeof est.turno === 'number') ? est.turno : 0;
      const sorted = lista.map((p, idx) => ({ ...p, _idx: idx })).sort((a, b) => (b.pos || 0) - (a.pos || 0) || a._idx - b._idx);
      rankingEl.innerHTML = '';
      sorted.forEach((p, i) => {
        const medal = i === 0 ? '👑 1º' : i === 1 ? '2º' : i === 2 ? '3º' : '4º';
        const active = p._idx === turno;
        const chip = ui.el('div', 'l-chip' + (active ? ' l-chip-active' : ''), '');
        chip.appendChild(App.avatars.badge(resolveAvatar(p, p._idx), 22));
        chip.appendChild(ui.el('span', 'text-xs font-extrabold ' + (i === 0 ? 'text-amber-600' : 'text-slate-700'), medal));
        chip.appendChild(ui.el('span', 'text-xs font-semibold truncate', escFn(p.nombre)));
        chip.appendChild(ui.el('span', 'text-[10px] text-slate-400', (p.pos || 0) + '/' + trackL));
        rankingEl.appendChild(chip);
      });
    }

    const hud = ui.el('div', 'flex flex-wrap items-center justify-between gap-2 mb-2', '');
    hud.innerHTML = '<div class="text-sm font-bold" id="cr-turn-net"></div>';
    root.appendChild(hud);
    const turnEl = hud.querySelector('#cr-turn-net');
    const qArea = ui.el('div', 'mt-2', '');
    root.appendChild(qArea);
    const docControls = ui.el('div', 'mt-3', '');
    root.appendChild(docControls);

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

    function renderDocenteControls() {
      docControls.innerHTML = '';
      if (rol !== 'docente') return;
      const fila = ui.el('div', 'flex gap-2 mt-2', '');
      const saltar = ui.el('button', 'btn-ghost text-xs flex-1', '⏭ Saltar turno');
      saltar.addEventListener('click', () => NET.saltar().then((r) => { if (r && !r.ok && ui.toast) ui.toast(r.mensaje || r.error, 'warn'); }));
      const cerrar = ui.el('button', 'btn-ghost text-xs flex-1', '✕ Cerrar sala');
      cerrar.addEventListener('click', () => {
        if (confirm('¿Cerrar la sala? Se acaba la partida para todos.')) NET.cerrar().then(() => App.go('inicio'));
      });
      fila.append(saltar, cerrar);
      docControls.appendChild(fila);
    }

    function setTurnUINet() {
      const lista = listaAsientosInit();
      const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
      const turno = (est && typeof est.turno === 'number') ? est.turno : 0;
      const p = lista[turno] || lista[0] || {};
      turnEl.innerHTML = '';
      turnEl.appendChild(App.avatars.badge(resolveAvatar(p, turno), 24));
      turnEl.appendChild(document.createTextNode(' Turno: '));
      turnEl.appendChild(ui.el('b', '', escFn(p.nombre)));
      turnEl.appendChild(document.createTextNode(' · Posición ' + Math.min(p.pos || 0, trackL) + '/' + trackL + ' · Racha 🔥x' + (p.racha || p.streak || 0)));
      paintRankingNet();
    }

    function slideAnimNet(idx, fromPos, toPos) {
      return new Promise((resolve) => {
        const lista = listaAsientosInit();
        const p = lista[idx];
        if (!p) return resolve(false);
        const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
        let cur = Math.max(0, Math.min(trackL, fromPos));
        const target = Math.max(0, Math.min(trackL, toPos));
        if (cur === target) { paintTrackNet(); return resolve(false); }
        p.pos = cur;
        const el = tokenEls[idx];
        if (el) el.classList.add('tr-run');
        const dir = target > cur ? 1 : -1;
        const step = () => {
          cur = Math.max(0, Math.min(trackL, cur + dir));
          p.pos = cur;
          paintTrackNet();
          if (cur === target) {
            if (el) el.classList.remove('tr-run');
            return resolve(true);
          }
          setTimeout(step, 130);
        };
        setTimeout(step, 20);
      });
    }

    function mostrarPregunta() {
      qArea.innerHTML = '';
      if (!preg || !preg.enunciado) {
        qArea.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', 'Cargando pregunta…'));
        return;
      }
      const card = ui.el('div', 'q-card', '');
      card.appendChild(ui.el('div', 'text-xs text-slate-400 mb-1', escFn(preg.categoria || '') + (preg.dificultad ? ' · ' + escFn(preg.dificultad) : '')));
      card.appendChild(ui.el('h3', 'q-text text-slate-900', escFn(preg.enunciado)));
      const list = ui.el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4', '');
      const yo = () => (rol === 'docente' ? null : (NET.yo ? NET.yo() : null));
      const puedo = est && est.espera && est.espera.asiento === yo();
      (preg.opciones || []).forEach((op, i) => {
        const b = ui.el('button', 'opt-btn s' + i, '<span class="opt-key">' + SH[i % 4] + '</span><span class="opt-label">' + escFn(op) + '</span>');
        if (!puedo) b.disabled = true;
        b.addEventListener('click', () => {
          if (enviando) return;
          enviando = true;
          list.querySelectorAll('.opt-btn').forEach((x) => { x.disabled = true; });
          NET.accion({ tipo: 'responder', eleccion: i }).then((r) => {
            enviando = false;
            if (!r || !r.ok) {
              if (ui.toast) ui.toast((r && (r.mensaje || r.error)) || 'No se pudo responder', 'error');
              pintarNet();
            }
          });
        });
        list.appendChild(b);
      });
      card.appendChild(list);
      qArea.appendChild(card);
      if (!puedo && est && est.espera) {
        const lista = listaAsientosInit();
        const nom = (lista[est.espera.asiento] && lista[est.espera.asiento].nombre) || ('Jugador ' + (est.espera.asiento + 1));
        qArea.appendChild(ui.el('p', 'text-xs text-slate-400 mt-2 text-center', escFn(nom) + ' está respondiendo…'));
      }
    }

    function pintarPodio() {
      const f = fin || (est && { ganador: est.ganador, motivo: est.motivoFin, clasificacion: [] });
      if (!f) return;
      qArea.innerHTML = '';
      const trackL = (est && est.trackLength) ? est.trackLength : TOTAL;
      const lista = (f.clasificacion && f.clasificacion.length)
        ? f.clasificacion.map((c) => ({ nombre: c.nombre, pos: c.pos || 0 }))
        : listaAsientosInit().slice().sort((a, b) => (b.pos || 0) - (a.pos || 0));
      const winName = lista[0] ? lista[0].nombre : 'Ganador';
      const podWrap = ui.el('div', '', '');
      qArea.appendChild(podWrap);
      if (App.gamekit && App.gamekit.podium) {
        App.gamekit.podium(podWrap, lista.map((s, i) => ({
          nombre: s.nombre, icono: '🏁', rank: i + 1,
          subtitulo: s.pos >= trackL ? '¡Cruzó la meta!' : ('Casilla ' + s.pos + '/' + trackL),
          campo1Label: 'Posición', campo1: Math.min(s.pos, trackL), campo2Label: '', campo2: ''
        })), { title: '🎉 ¡' + winName + ' gana la Carrera!', subtitle: 'Resultado de la Carrera de Preguntas' });
      }
      if (registro) {
        qArea.appendChild(ui.el('p', 'text-sm text-center mt-2', 'Respondiste bien <b>' + ((registro.respuestas || []).filter((r) => r.correcto).length) + '</b> de <b>' + ((registro.respuestas || []).length) + '</b> preguntas.'));
      }
    }

    function pintarNet() {
      if (!vivo || !document.body.contains(root)) { limpiarNet(); return; }
      tm.textContent = reloj();
      paintTrackNet();
      setTurnUINet();
      renderDocenteControls();

      const finNow = fin || (est && est.fase === 'terminada');
      if (finNow) return pintarPodio();

      qArea.innerHTML = '';
      const yo = () => (rol === 'docente' ? null : (NET.yo ? NET.yo() : null));
      const esMiTurno = () => est && est.espera && est.espera.asiento === yo();
      if (!est) {
        qArea.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', 'Esperando el estado de la partida…'));
        return;
      }
      if (est.fase === 'avanzar') {
        if (esMiTurno()) {
          const b = ui.el('button', 'btn-primary w-full mt-3', '🎯 Responder para avanzar');
          b.addEventListener('click', () => {
            if (enviando) return;
            enviando = true;
            b.disabled = true;
            NET.accion({ tipo: 'avanzar' }).then((r) => {
              enviando = false;
              if (!r || !r.ok) {
                b.disabled = false;
                if (ui.toast) ui.toast((r && (r.mensaje || r.error)) || 'No se pudo avanzar', 'error');
              }
            });
          });
          qArea.appendChild(b);
        } else {
          const lista = listaAsientosInit();
          const nom = est.espera && lista[est.espera.asiento] ? lista[est.espera.asiento].nombre : '';
          qArea.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', '🎯 Turno de <b>' + escFn(nom) + '</b>: preparándose para avanzar…'));
        }
      } else if (est.fase === 'responder') {
        if (preg && preg.v === est.v) mostrarPregunta();
        else {
          const lista = listaAsientosInit();
          const nom = est.espera && lista[est.espera.asiento] ? lista[est.espera.asiento].nombre : '';
          qArea.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', '⏳ <b>' + escFn(nom) + '</b> está respondiendo su pregunta…'));
        }
      }
    }

    const offs = [];
    const tickNet = setInterval(() => {
      if (!vivo || !document.body.contains(root)) { limpiarNet(); return; }
      tm.textContent = reloj();
    }, 250);

    function limpiarNet() {
      if (!vivo) return;
      vivo = false;
      clearInterval(tickNet);
      offs.forEach((fn) => { try { fn(); } catch (e) {} });
    }
    function alCerrarNet() { limpiarNet(); if (ui.toast) ui.toast('El docente cerró la sala', 'warn'); App.go(rol === 'docente' ? 'inicio' : 'red'); }
    function alExpulsarNet() { limpiarNet(); if (ui.toast) ui.toast('El docente te sacó de la sala', 'warn'); App.go('red'); }

    offs.push(NET.on('estado', (p) => {
      if (!p) return;
      const prev = est ? JSON.parse(JSON.stringify(est)) : null;
      est = p.estado ? JSON.parse(JSON.stringify(p.estado)) : est;
      turnoVence = p.turnoVence || null;
      partidaVence = p.partidaVence || null;
      off = (p.ahora || Date.now()) - Date.now();
      const evs = p.eventos || [];
      const lista = listaAsientosInit();

      evs.forEach((ev) => {
        const nom = (lista[ev.asiento] && lista[ev.asiento].nombre) || ('Jugador ' + (ev.asiento + 1));
        if (ev.t === 'respondida' && ev.asiento === (NET.yo ? NET.yo() : -1)) {
          ui.sound(ev.correcto ? 'correct' : 'wrong');
        }
        if (ev.t === 'mover') {
          const from = (typeof ev.desde === 'number') ? ev.desde : (prev && prev.asientos && prev.asientos[ev.asiento] ? prev.asientos[ev.asiento].pos : 0);
          const to = (typeof ev.hasta === 'number') ? ev.hasta : (lista[ev.asiento] ? lista[ev.asiento].pos : 0);
          const delta = to - from;
          if (delta > 0) ui.toast('🏃 ' + nom + ' avanza +' + delta, 'success');
          else if (delta < 0) { ui.toast('⚠️ ' + nom + ' retrocede ' + Math.abs(delta), 'warn'); ui.shake(track); }
          slideAnimNet(ev.asiento, from, to).then(() => { paintTrackNet(); paintRankingNet(); });
        } else if (ev.t === 'obstaculo') {
          ui.toast('⚠️ ¡Obstáculo! -2 casillas', 'warn');
          ui.shake(track);
        } else if (ev.t === 'meta') {
          markFinishedNet(ev.asiento);
          ui.sound('win');
          ui.confetti(root);
          ui.toast('🏁 ¡' + nom + ' cruzó la meta!', 'success');
        }
      });
      pintarNet();
    }));
    offs.push(NET.on('pregunta', (q) => { preg = q; enviando = false; pintarNet(); }));
    offs.push(NET.on('sala', () => pintarNet()));
    offs.push(NET.on('fin', (f) => { fin = f; ui.sound('win'); ui.confetti(root); pintarNet(); }));
    offs.push(NET.on('registro', (r) => { registro = r; pintarNet(); }));
    try { offs.push(NET.on('cerrada', alCerrarNet)); } catch (e) {}
    try { offs.push(NET.on('expulsado', alExpulsarNet)); } catch (e) {}

    pintarNet();
  }

  return { init, initNet, MODE };
})(App.ui);