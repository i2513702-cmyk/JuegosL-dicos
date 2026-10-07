/* ============================================================
 * LudoApp games/batalla.js
 * BATALLA DE PREGUNTAS: 1v1 o equipo vs equipo.
 * Cada acierto permite atacar (restar vida) o defenderse
 * (bloquear). Barras de vida animadas y habilidades con
 * monedas/XP (doble daño, escudo, comodín, pista, curación).
 * ============================================================ */
window.App = window.App || {};
App.games = App.games || {};
App.games.batalla = (function (ui) {
  const MODE = 'batalla';
  const BASE_DMG = { dif_facil: 12, dif_media: 16, dif_dificil: 22 };
  const WIN_PTS = 60;

  function init(config) {
    const root = config.container;
    const engine = App.questionEngine.createEngine({
      courseId: config.courseId,
      categoryId: config.categoryId,
      difficultyId: config.difficultyId
    });
    const colors = ['rojo', 'azul'];

    /* si hay más de 2 participantes se forman 2 equipos */
    const parts = config.players.map((p, i) => ({ ...p, color: i % 2 }));
    const MAX_HP = config.hpTotal || 100;
    const teams = [
      { members: parts.filter((p) => p.color === 0), hp: 0, color: colors[0], shield: 0, streak: 0, doubleReady: false, pendHint: false, pendComodin: false },
      { members: parts.filter((p) => p.color === 1), hp: 0, color: colors[1], shield: 0, streak: 0, doubleReady: false, pendHint: false, pendComodin: false }
    ];
    teams.forEach((t, i) => {
      t.name = t.members.map((m) => m.nombre).join(', ') || 'Equipo ' + (i + 1);
      t.pose = 'idle';
      t.avatar = (t.members[0] && t.members[0].avatar) || App.avatars.pick(i);
      /* cada participante tiene su propia vida; la del equipo es la suma */
      t.members.forEach((m) => { m.hp = MAX_HP; });
      t.hp = t.members.length * MAX_HP;
    });
    function syncHP(t) {
      t.hp = t.members.reduce((s, m) => s + Math.max(0, m.hp || 0), 0);
    }

    const state = { turn: 0, ended: false, busy: false };
    const cur = () => teams[state.turn];
    const rival = () => teams[1 - state.turn];

    root.innerHTML = '';
    root.appendChild(ui.el('div', 'ba-title text-center text-xl font-extrabold text-slate-900 mb-2', '⚔️ Batalla de Preguntas'));

    /* arena con los avatares de cada equipo */
    /* En modo escena, los peleadores se paran sobre las plataformas que ya
       dibuja campo-de-batalla.svg (suelo en y~215, 左右 en x=45 y x=475). */
    const inScene = !!config.escenaCapa;
    const arena = ui.el('div', 'ba-arena' + (inScene ? ' ba-en-escena' : ''), '');
    arena.innerHTML =
      '<div class="ba-fighter"><canvas id="ba-canvas-a" class="avatar-canvas ba-canvas"></canvas><div class="ba-pose" id="ba-pose-a"></div></div>' +
      '<div class="ba-vs">⚔️<br>VS</div>' +
      '<div class="ba-fighter"><canvas id="ba-canvas-b" class="avatar-canvas ba-canvas"></canvas><div class="ba-pose" id="ba-pose-b"></div></div>';
    if (inScene) config.escenaCapa.appendChild(arena); else root.appendChild(arena);

    /* ---- motor de animación de los avatares (30 fps) ----
     * Cada pose animada de verdad: respiración en reposo (idle),
     * embestida + tajo (attack), bloqueo/agachada (defend) y
     * aura de curación con destellos (heal). El bucle redibuja
     * la arena mientras la partida esté activa. */
    function renderArena(F) {
      const fr = (typeof F === 'number' && !isNaN(F)) ? F : 0;
      teams.forEach((t, i) => {
        const cnv = arena.querySelector('#ba-canvas-' + (i === 0 ? 'a' : 'b'));
        const W = 160, H = 160, ps = 8, bx = 16, by = 32;
        cnv.width = W; cnv.height = H;
        const g = cnv.getContext('2d');
        g.clearRect(0, 0, W, H);
        const cx = W / 2;

        /* fondo de la arena del equipo */
        g.beginPath(); g.arc(cx, H / 2, H / 2 - 4, 0, Math.PI * 2);
        g.fillStyle = i === 0 ? 'rgba(220,38,38,0.08)' : 'rgba(37,99,235,0.08)';
        g.fill();
        g.strokeStyle = i === 0 ? 'rgba(220,38,38,0.4)' : 'rgba(37,99,235,0.4)';
        g.lineWidth = 2; g.stroke();

        const pose = t.pose || 'idle';
        const dir = i === 0 ? 1 : -1; /* el equipo rojo ataca hacia la derecha */
        const pr = (fr % 28) / 28;    /* progreso 0..1 de la pose en curso */
        let dx = 0, dy = 0, rot = 0, sx = 1, sy = 1;

        if (pose === 'idle') {
          dy = Math.sin(fr * 0.14) * 1.6;
          sx = 1 + Math.sin(fr * 0.14) * 0.012;
        } else if (pose === 'attack') {
          const phase = pr < 0.26 ? pr / 0.26 : pr < 0.64 ? 1 : Math.max(0, 1 - (pr - 0.64) / 0.36);
          dx = phase * 15 * dir;
          rot = (1 - phase) * 0.12 * -dir;
          sy = 1 - 0.09 * phase;
        } else if (pose === 'defend') {
          const bounce = Math.abs(Math.sin(pr * Math.PI * 2));
          dy = bounce * 5;
          sx = 1 + 0.14 * bounce;
          sy = 1 - 0.16 * bounce;
        } else if (pose === 'heal') {
          dy = Math.sin(fr * 0.3) * 1.2;
          sx = sy = 1 + Math.sin(pr * Math.PI * 4) * 0.03;
        }

        /* cuerpo del avatar, anclado a los pies para escalar/rotar de forma natural */
        g.save();
        g.translate(cx + dx, 144 + dy);
        g.rotate(rot);
        g.scale(sx, sy);
        g.translate(-cx, -144);
        App.avatars.drawBody(g, bx, by, ps, t.avatar, pose, i === 0 ? 'right' : 'left');
        g.restore();

        /* efectos por pose (encima del sprite) */
        if (pose === 'attack' && pr > 0.24 && pr < 0.68) {
          const kill = Math.max(0, 1 - Math.abs(pr - 0.46) / 0.22);
          const bx0 = bx + dx + (i === 0 ? 13 : 3) * ps;
          const by0 = by + dy + 7 * ps;
          g.save();
          g.lineCap = 'round';
          g.strokeStyle = 'rgba(255,235,140,' + (0.85 * kill) + ')';
          g.lineWidth = 2 + 3 * kill;
          for (let k = 0; k < 3; k++) {
            const a = -0.9 + k * 0.55;
            g.beginPath();
            g.moveTo(bx0, by0);
            g.quadraticCurveTo(bx0 + dir * ps * 6, by0 + a * ps * 3, bx0 + dir * ps * 12, by0 + a * ps * 4.5);
            g.stroke();
          }
          g.strokeStyle = 'rgba(255,190,70,' + (0.5 * kill) + ')';
          g.lineWidth = 4 + 3 * kill;
          g.beginPath();
          g.moveTo(bx0, by0);
          g.lineTo(bx0 + dir * ps * 11, by0 - ps * 3);
          g.lineTo(bx0 + dir * ps * 8, by0 + ps * 1.5);
          g.stroke();
          g.restore();
        } else if (pose === 'defend') {
          const a = 0.35 + 0.3 * Math.sin(pr * Math.PI * 2);
          const rr = ps * 4 + Math.abs(Math.sin(pr * Math.PI * 2)) * ps * 3;
          g.save();
          g.strokeStyle = 'rgba(99,102,241,' + a + ')';
          g.lineWidth = 2 + 2 * Math.abs(Math.sin(pr * Math.PI * 2));
          g.beginPath(); g.arc(bx + 8 * ps, by + 7 * ps, rr, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = 'rgba(99,102,241,' + (a * 0.45) + ')';
          g.lineWidth = 3;
          g.beginPath(); g.arc(bx + 8 * ps, by + 7 * ps, rr + ps * 2, 0, Math.PI * 2); g.stroke();
          g.restore();
        } else if (pose === 'heal') {
          const a = 0.4 + 0.4 * Math.sin(pr * Math.PI * 4);
          const gx0 = bx + 8 * ps;
          const gy0 = by - 3 * ps;
          const rad = g.createRadialGradient(gx0, gy0, ps * 1.5, gx0, gy0, ps * 8);
          rad.addColorStop(0, 'rgba(111,208,138,' + a + ')');
          rad.addColorStop(1, 'rgba(111,208,138,0)');
          g.fillStyle = rad;
          g.beginPath(); g.arc(gx0, gy0, ps * 8, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#bff0cf';
          for (let k = 0; k < 6; k++) {
            const syy = by - 20 - ((fr * 2 + k * 21) % 52);
            const sxx = bx + dx + ((k * 31) % 15) * ps + Math.sin(fr * 0.4 + k) * 3;
            g.fillRect(sxx, syy, ps * 0.7, ps * 0.7);
          }
        }

        const poseTxt = pose === 'attack' ? '⚔️ Atacando' : pose === 'defend' ? '🛡️ Defendiendo' : pose === 'heal' ? '❤️ Curando' : '✨ Listo';
        const cap = arena.querySelector('#ba-pose-' + (i === 0 ? 'a' : 'b'));
        if (cap.textContent !== poseTxt) cap.textContent = poseTxt;
        cap.className = 'ba-pose' + (pose === 'idle' ? '' : ' ba-pose-active');
      });
    }
    renderArena(0);
    let animFrame = 0;
    const animTimer = setInterval(() => {
      if (state.ended) { clearInterval(animTimer); return; }
      animFrame++;
      renderArena(animFrame);
    }, 33);

    /* Barra de vida minimalista flotante: UNA caja por peleador,
       encima de su propia cabeza dentro de la escena. */
    function fighterFrame(i) {
      return arena.querySelectorAll('.ba-fighter')[i] || null;
    }

    function mountPixelHP() {
      teams.forEach((t, i) => {
        const frame = fighterFrame(i);
        if (!frame) return;
        const box = ui.el('div', 'ba-hpbox ba-hpbox-' + i);
        box.innerHTML =
          '<span class="ba-hpbox-name"></span>' +
          '<div class="ba-hpbox-bar"><i class="ba-hpbox-fill"></i><b class="ba-hpbox-pct">100%</b></div>';
        frame.appendChild(box);
      });
    }

    function paintPixelHP() {
      teams.forEach((t, i) => {
        const frame = fighterFrame(i);
        const box = frame && frame.querySelector('.ba-hpbox');
        if (!box) return;
        const total = MAX_HP * Math.max(1, t.members.length);
        const pct = Math.max(0, Math.round(t.hp / total * 100));
        box.querySelector('.ba-hpbox-fill').style.width = pct + '%';
        box.querySelector('.ba-hpbox-pct').textContent = pct + '%';
        box.querySelector('.ba-hpbox-name').textContent = t.name;
        box.classList.toggle('ba-hpbox-turn', state.turn === i);
        box.classList.toggle('ba-hpbox-low', pct <= 30);
        box.classList.toggle('ba-hpbox-mid', pct > 30 && pct <= 55);
        box.classList.toggle('ba-hpbox-shield', t.shield > 0);
      });
    }

    /* Marcador minimalista: UNA fila con barra por participante */
    const roster = ui.el('div', 'ba-roster mb-4', '');
    const rosterRows = [];
    teams.forEach((t, ti) => {
      t.members.forEach((m) => {
        const row = ui.el('div', 'ba-hp-row ba-' + t.color, '');
        row.innerHTML =
          '<span class="ba-hp-name"></span>' +
          '<span class="ba-hp-track"><i></i></span>' +
          '<span class="ba-hp-num"></span>';
        row.querySelector('.ba-hp-name').textContent = m.nombre;
        roster.appendChild(row);
        rosterRows.push({ ti, member: m, row, fill: row.querySelector('.ba-hp-track i'), num: row.querySelector('.ba-hp-num') });
      });
    });
    root.appendChild(roster);
    mountPixelHP();

    function paintHP() {
      rosterRows.forEach((r) => {
        const t = teams[r.ti];
        const hp = Math.max(0, r.member.hp || 0);
        const pct = hp / MAX_HP * 100;
        r.fill.style.width = pct + '%';
        r.num.textContent = Math.round(hp);
        r.row.classList.toggle('is-turn', state.turn === r.ti);
        r.row.classList.toggle('is-low', pct <= 30);
        r.row.classList.toggle('is-shield', t.shield > 0);
      });
      paintPixelHP();
    }

    paintHP();
    renderArena();

    const statusLine = ui.el('div', 'text-center text-sm font-semibold text-slate-600 mb-2', '');
    root.appendChild(statusLine);

    const skillRow = ui.el('div', 'flex flex-wrap gap-2 justify-center mb-3', '');
    root.appendChild(skillRow);
    const qArea = ui.el('div', 'mt-2', '');
    root.appendChild(qArea);

    const profileOf = (id) => App.storage.getById('players', id);

    function renderSkills() {
      const t = cur();
      const gamekit = App.gamekit;
      const list = [
        ['pista', '💡', 'Pista'], ['comodin', '🃏', 'Comodín'],
        ['doble_dano', '💥', 'Doble daño'], ['escudo', '🛡️', 'Escudo'], ['cura', '❤️', 'Curación']
      ];
      const minCounts = {};
      t.members.forEach((m) => {
        const pr = profileOf(m.id);
        if (!pr || !pr.skills) return;
        list.forEach(([sk]) => { minCounts[sk] = Math.min(minCounts[sk] === undefined ? 99 : minCounts[sk], pr.skills[sk] || 0); });
      });
      gamekit.renderSkills(skillRow, list.map(([sk, ic, nm]) => {
        const on = (sk === 'doble_dano' && t.doubleReady) || (sk === 'escudo' && t.shield > 0);
        return { key: sk, icono: ic, nombre: nm, amount: minCounts[sk] || 0, on, label: on ? ' (activo)' : '' };
      }), (sk) => useSkill(t, sk), state.ended);
      skillRow.classList.toggle('skill-locked', !!state.busy);
    }

    function useSkill(t, sk) {
      if (state.ended || state.busy) return;
      const owner = t.members.find((m) => { const pr = profileOf(m.id); return pr && (pr.skills || {})[sk] > 0; });
      if (!owner) return;
      const pr = profileOf(owner.id);
      App.progression.useSkill(pr, sk);
      if (sk === 'pista') { t.pendHint = true; ui.toast('💡 Pista lista', 'info'); }
      if (sk === 'comodin') { t.pendComodin = true; ui.toast('🃏 Comodín activo', 'info'); }
      if (sk === 'doble_dano') { t.doubleReady = true; ui.toast('💥 Doble daño preparado', 'warn'); }
      if (sk === 'escudo') { t.shield = 1; ui.toast('🛡️ Escudo activo', 'info'); paintHP(); }
      if (sk === 'cura') healAnim(t);
      renderSkills();
    }

    /* Curacion: cura a cada integrante del equipo, aura verde y texto flotante. */
    function healAnim(t) {
      let gained = 0;
      t.members.forEach((m) => {
        const before = m.hp || 0;
        m.hp = Math.min(MAX_HP, before + 25);
        gained += m.hp - before;
      });
      syncHP(t);
      t.pose = 'heal';
      const box = arena.querySelector('.ba-hpbox-' + (t.color === 'rojo' ? 0 : 1));
      if (box) { box.classList.remove('ba-hpbox-heal'); void box.offsetWidth; box.classList.add('ba-hpbox-heal'); }
      renderArena();
      ui.sound('correct');
      ui.floatText(roster, '\u2764\uFE0F +' + gained, 'ft-heal');
      ui.toast(gained > 0 ? '\u2764\uFE0F Curacion: +' + gained + ' de vida' : '\u2764\uFE0F Ya estas al maximo de vida', gained > 0 ? 'success' : 'info');
      paintHP();
      setTimeout(() => { if (t.pose === 'heal') t.pose = 'idle'; renderArena(); }, 900);
    }

    function damageAnim(t, amount, showBlock) {
      const idx = t.color === 'rojo' ? 0 : 1;
      const frame = fighterFrame(idx);
      ui.shake(frame && frame.querySelector('.ba-canvas'));
      const box = frame && frame.querySelector('.ba-hpbox');
      if (box && amount > 0) ui.flash(box, 'ba-hpbox-hit', 400);
      if (showBlock) {
        ui.floatText(roster, '🛡️ BLOQUEADO', 'ft-warn');
      } else if (amount > 0) {
        ui.floatText(roster, '-' + amount + ' HP', 'ft-hit');
        ui.sound('hit');
      }
      if (amount > 0) {
        /* el daño se reparte entre los integrantes vivos del equipo */
        const living = t.members.filter((m) => (m.hp || 0) > 0);
        if (living.length) {
          const per = Math.round(amount / living.length);
          let left = amount;
          living.forEach((m, i) => {
            const take = i === living.length - 1 ? left : Math.min(per, left);
            m.hp = Math.max(0, (m.hp || 0) - take);
            left -= take;
          });
        }
        syncHP(t);
      }
      paintHP();
    }

    function recordTeam(t, opts) {
      /* registra la respuesta de cada integrante; tolera fichas inexistentes */
      const corrects = [];
      let correct = false;
      t.members.forEach((m) => {
        try {
          const res = App.progression.recordAnswer(profileOf(m.id), opts);
          if (res) {
            if (!corrects.length) correct = res.correct;
            corrects.push(res);
          }
        } catch (e) { console.error(e); }
      });
      const achievements = corrects.reduce((acc, c) => acc.concat(c.achievements || []), []);
      return { correct: corrects.length ? correct : opts.fallbackCorrect, achievements };
    }

    function askTeam(t) {
      if (t.pendComodin) {
        t.pendComodin = false;
        const q = engine.draw();
        const rec = recordTeam(t, {
          question: q, selectedIndex: q.respuesta_correcta,
          difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId,
          fallbackCorrect: true
        });
        qArea.innerHTML = '';
        qArea.appendChild(ui.el('div', 'q-card bg-amber-50 border-amber-300',
          '<div class="font-bold text-amber-800">🃏 Comodín: acierto automático</div><p class="q-text-sm">' + q.enunciado + '</p>'));
        ui.sound('correct');
        return Promise.resolve({ correct: true, q, dif: q.difficulty_id, achievements: rec.achievements });
      }

      const q = engine.draw();
      const ctx = { engine, question: q, extraBadges: [] };
      let hinted = t.pendHint;
      t.pendHint = false;
      return new Promise((resolve) => {
        ui.question(ctx, qArea, {
          onHint: () => {
            if (hinted) { hinted = false; return true; }
            return false;
          },
          onAnswered: (r) => {
            const rec = recordTeam(t, {
              question: q, selectedIndex: r.selectedIndex,
              difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId,
              fallbackCorrect: !!r.correct
            });
            resolve({ correct: rec.correct, q, dif: q.difficulty_id, achievements: rec.achievements });
          }
        });
      });
    }

    function actionPanel(t, res) {
      qArea.innerHTML = '';
      const dmgBase = BASE_DMG[res.dif] || 12;
      const bonus = Math.min(t.streak, 5) * 2;
      const normalDmg = dmgBase + bonus;
      const box = ui.el('div', 'q-card text-center',
        '<div class="text-lg font-extrabold text-emerald-700 mb-1">✓ ¡Acertaron!</div>' +
        '<p class="text-sm text-slate-600 mb-3">Elijan su acción:' + (t.doubleReady ? ' 💥 Doble daño listo.' : '') + '</p>' +
        '<div class="grid grid-cols-2 gap-2">' +
        '<button id="ba-att" class="btn-danger">⚔️ Atacar (' + (t.doubleReady ? normalDmg * 2 : normalDmg) + ')</button>' +
        '<button id="ba-def" class="btn-ghost">🛡️ Defender</button>' +
        '</div>');
      qArea.appendChild(box);
      box.querySelector('#ba-att').addEventListener('click', async () => {
        if (state.busy) return;
        state.busy = true;
        renderSkills();
        let dmg = normalDmg;
        if (t.doubleReady) { dmg *= 2; }
        t.doubleReady = false;
        const rv = rival();
        t.pose = 'attack';
        rv.pose = 'defend';
        renderArena();
        await new Promise((r) => setTimeout(r, 900));
        if (rv.shield > 0) { rv.shield = 0; damageAnim(rv, 0, true); }
        else damageAnim(rv, dmg, false);
        state.busy = false;
        renderSkills();
        finishAction(t, rv);
      });
      box.querySelector('#ba-def').addEventListener('click', async () => {
        if (state.busy) return;
        state.busy = true;
        renderSkills();
        t.shield = 1;
        t.pose = 'defend';
        renderArena();
        await new Promise((r) => setTimeout(r, 700));
        paintHP();
        ui.toast('🛡️ ' + t.name + ' se prepara para bloquear', 'info');
        state.busy = false;
        renderSkills();
        finishAction(t, rival());
      });
    }

    function finishAction(t, rv) {
      if (rv.hp <= 0) return endGame(state.turn);
      if (t.streak >= 5) t.streak = 5;
      nextTurn();
    }

    function nextTurn() {
      if (state.ended) return;
      state.turn = 1 - state.turn;
      startTurn();
    }

    function startTurn() {
      const t = cur();
      teams.forEach((tm) => { tm.pose = 'idle'; });
      renderArena();
      setStatus('Turno de <b>' + t.name + '</b>');
      renderSkills();
      paintHP();
      askTeam(t).then((res) => {
        if (state.ended) { qArea.innerHTML = ''; return; }
        if (res.correct) {
          t.streak++;
          (res.achievements || []).forEach((a) => ui.toast('🏅 Logro: ' + a.titulo, 'success'));
          actionPanel(t, res);
        } else {
          t.streak = 0;
          ui.sound('wrong');
          ui.toast(t.name + ' falló la pregunta. Racha a cero.', 'error');
          const next = ui.el('button', 'btn-primary w-full mt-3', 'Siguiente turno →');
          next.addEventListener('click', nextTurn);
          qArea.appendChild(next);
        }
      }).catch((e) => {
        console.error(e);
        ui.toast('⚠️ No se pudo procesar la respuesta: ' + e.message, 'error');
        state.busy = false;
        renderSkills();
      });
    }

    function setStatus(html) {
      statusLine.innerHTML = html;
    }

    function bonusOf(win) {
      return App.gamekit.bonusForTeam(win.members, profileOf, MODE);
    }

    function endGame(winIdx) {
      if (state.ended) return;
      state.ended = true;
      const win = teams[winIdx];
      const bonus = bonusOf(win);
      const st = teams.map((t, i) => ({
        id: t.members[0] && t.members[0].id, nombre: t.name, color: t.color,
        puntos: t.hp, subtitulo: 'Vida restante'
      })).sort((a, b) => b.puntos - a.puntos);
      if (App.session && App.session.record) App.session.record(config, st, MODE);
      App.gamekit.podium(root, st.map((s, i) => ({
        nombre: s.nombre, icono: '⚔️', rank: i + 1,
        subtitulo: s.subtitulo, campo1Label: 'Vida', campo1: s.puntos,
        campo2Label: '', campo2: ''
      })), { title: '🏆 ¡' + win.name + ' gana la Batalla!', subtitle: 'Barra de vida del rival eliminada', bonus });
    }

    function startTimer() {
      App.gamekit.timerBox(root, config.timeSeconds, () => {
        if (state.ended) return;
        state.ended = true;
        const win = teams[0].hp >= teams[1].hp ? teams[0] : teams[1];
        const bonus = bonusOf(win);
        const st = teams.map((tm, i) => ({
          id: tm.members[0] && tm.members[0].id, nombre: tm.name, color: tm.color,
          puntos: tm.hp, subtitulo: 'Vida restante'
        })).sort((a, b) => b.puntos - a.puntos);
        if (App.session && App.session.record) App.session.record(config, st, MODE);
        App.gamekit.podium(root, st.map((s, i) => ({
          nombre: s.nombre, icono: '⚔️', rank: i + 1, subtitulo: s.subtitulo,
          campo1Label: 'Vida', campo1: s.puntos, campo2Label: '', campo2: ''
        })), { title: '⏱️ Tiempo agotado', subtitle: 'Gana el equipo con más vida', bonus });
      });
    }

    startTimer();
    startTurn();
  }

  return { init, MODE };
})(App.ui);
