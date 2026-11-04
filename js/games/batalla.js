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
  const esc = function(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ var map={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}; return map[c] || c; }); };
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
    // est compatible con servidor
    const asientosEst = parts.map((p, i) => ({ id: p.id, nombre: p.nombre, avatar: p.avatar, equipo: i % 2, hp: MAX_HP }));
    const est = { asientos: asientosEst, equipos: [[0],[1]].map((_,ei)=> asientosEst.map((_,idx)=> idx).filter((idx)=> asientosEst[idx].equipo===ei)), equipoHp: [teams[0].hp, teams[1].hp], equipoShield: [0,0], turno: 0, fase: 'preguntar', espera: { asiento: 0, que: 'responder' }, hpTotal: MAX_HP };

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





  function initNet(config) {
    const NET = App.net;
    const escFn = esc;
    if (!NET) {
      if (config.container) config.container.appendChild(ui.el('p', 'text-sm text-slate-400', 'La partida en red no está disponible.'));
      return;
    }
    const root = config.container;
    const rol = config.rol || (NET.rol ? NET.rol() : 'alumno');
    const codigo = config.codigo || (NET.codigo ? NET.codigo() : '');
    const SH = ['▲', '◆', '●', '■'];

    let est = NET.estado ? JSON.parse(JSON.stringify(NET.estado())) : null;
    let preg = NET.pregunta ? NET.pregunta() : null;
    let fin = NET.fin ? NET.fin() : null;
    let registro = NET.registro ? NET.registro() : null;
    let venc = NET.vencimientos ? NET.vencimientos() : {};
    let off = (venc && venc.off) ? venc.off : 0;
    let turnoVence = venc ? venc.turno : null;
    let partidaVence = venc ? venc.partida : null;
    let enviando = false;
    let vivo = true;
    const poses = ['idle', 'idle'];

    root.innerHTML = '';
    root.appendChild(ui.el('div', 'ba-title text-center text-xl font-extrabold text-slate-900 mb-1', '⚔️ Batalla de Preguntas'));
    const hd = ui.el('div', 'text-center text-xs text-slate-400 mb-1', 'Sala <b>' + escFn(codigo) + '</b>' + (rol === 'docente' ? ' · Vista del docente' : ''));
    const tm = ui.el('div', 'text-center text-xs font-bold text-amber-500 mb-2', '');
    root.appendChild(hd);
    root.appendChild(tm);

    const inScene = !!config.escenaCapa;
    const arena = ui.el('div', 'ba-arena' + (inScene ? ' ba-en-escena' : ''), '');
    arena.innerHTML =
      '<div class="ba-fighter"><canvas id="ba-canvas-a" class="avatar-canvas ba-canvas"></canvas><div class="ba-pose" id="ba-pose-a"></div></div>' +
      '<div class="ba-vs">⚔️<br>VS</div>' +
      '<div class="ba-fighter"><canvas id="ba-canvas-b" class="avatar-canvas ba-canvas"></canvas><div class="ba-pose" id="ba-pose-b"></div></div>';
    if (inScene && config.escenaCapa) config.escenaCapa.appendChild(arena);
    else root.appendChild(arena);

    function fighterFrame(i) { return arena.querySelectorAll('.ba-fighter')[i] || null; }

    function mountPixelHP() {
      [0, 1].forEach((i) => {
        const frame = fighterFrame(i);
        if (!frame || frame.querySelector('.ba-hpbox')) return;
        const box = ui.el('div', 'ba-hpbox ba-hpbox-' + i, '');
        box.innerHTML =
          '<span class="ba-hpbox-name"></span>' +
          '<div class="ba-hpbox-bar"><i class="ba-hpbox-fill"></i><b class="ba-hpbox-pct">100%</b></div>';
        frame.appendChild(box);
      });
    }
    mountPixelHP();

    function getTeamsData() {
      const lista = (est && est.asientos) ? est.asientos : (NET.sala() ? NET.sala().jugadores : []);
      const eqIdx = (est && est.equipos) ? est.equipos : [
        lista.map((_, idx) => idx).filter((idx) => idx % 2 === 0),
        lista.map((_, idx) => idx).filter((idx) => idx % 2 === 1)
      ];
      const maxInd = (est && est.hpTotal) ? est.hpTotal : 100;
      return [0, 1].map((ei) => {
        const members = (eqIdx[ei] || []).map((idx) => lista[idx]).filter(Boolean);
        const totalMax = Math.max(1, members.length * maxInd);
        const hp = (est && est.equipoHp && typeof est.equipoHp[ei] === 'number') ? est.equipoHp[ei] : totalMax;
        const shield = (est && est.equipoShield && est.equipoShield[ei]) ? est.equipoShield[ei] : 0;
        const name = members.map((m) => m.nombre).join(', ') || ('Equipo ' + (ei === 0 ? 'A' : 'B'));
        const firstIdx = (eqIdx[ei] && eqIdx[ei][0]) || ei;
        const rawAv = members[0] ? members[0].avatar : firstIdx;
        const avatar = (typeof rawAv === 'object' && rawAv) ? rawAv : App.avatars.pick((+rawAv || firstIdx) % 16);
        return { members, hp, totalMax, maxInd, shield, name, avatar, color: ei === 0 ? 'rojo' : 'azul', pose: poses[ei] };
      });
    }

    function renderArenaNet(F) {
      const fr = (typeof F === 'number' && !isNaN(F)) ? F : 0;
      const teams = getTeamsData();
      teams.forEach((t, i) => {
        const cnv = arena.querySelector('#ba-canvas-' + (i === 0 ? 'a' : 'b'));
        if (!cnv) return;
        const W = 160, H = 160, ps = 8, bx = 16, by = 32;
        cnv.width = W; cnv.height = H;
        const g = cnv.getContext('2d');
        g.clearRect(0, 0, W, H);
        const cx = W / 2;

        g.beginPath(); g.arc(cx, H / 2, H / 2 - 4, 0, Math.PI * 2);
        g.fillStyle = i === 0 ? 'rgba(220,38,38,0.08)' : 'rgba(37,99,235,0.08)';
        g.fill();
        g.strokeStyle = i === 0 ? 'rgba(220,38,38,0.4)' : 'rgba(37,99,235,0.4)';
        g.lineWidth = 2; g.stroke();

        const pose = t.pose || 'idle';
        const dir = i === 0 ? 1 : -1;
        const pr = (fr % 28) / 28;
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
        }

        g.save();
        g.translate(cx + dx, 144 + dy);
        g.rotate(rot);
        g.scale(sx, sy);
        g.translate(-cx, -144);
        if (App.avatars && App.avatars.drawBody) {
          App.avatars.drawBody(g, bx, by, ps, t.avatar, pose, i === 0 ? 'right' : 'left');
        }
        g.restore();

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
          g.restore();
        } else if (pose === 'defend') {
          const a = 0.35 + 0.3 * Math.sin(pr * Math.PI * 2);
          const rr = ps * 4 + Math.abs(Math.sin(pr * Math.PI * 2)) * ps * 3;
          g.save();
          g.strokeStyle = 'rgba(99,102,241,' + a + ')';
          g.lineWidth = 2 + 2 * Math.abs(Math.sin(pr * Math.PI * 2));
          g.beginPath(); g.arc(bx + 8 * ps, by + 7 * ps, rr, 0, Math.PI * 2); g.stroke();
          g.restore();
        }

        const poseTxt = pose === 'attack' ? '⚔️ Atacando' : pose === 'defend' ? '🛡️ Defendiendo' : '✨ Listo';
        const cap = arena.querySelector('#ba-pose-' + (i === 0 ? 'a' : 'b'));
        if (cap && cap.textContent !== poseTxt) cap.textContent = poseTxt;
        if (cap) cap.className = 'ba-pose' + (pose === 'idle' ? '' : ' ba-pose-active');
      });
    }

    const roster = ui.el('div', 'ba-roster mb-4', '');
    root.appendChild(roster);
    const statusLine = ui.el('div', 'text-center text-sm font-semibold text-slate-600 mb-2', '');
    root.appendChild(statusLine);
    const qArea = ui.el('div', 'mt-2', '');
    root.appendChild(qArea);
    const docControls = ui.el('div', 'mt-3', '');
    root.appendChild(docControls);

    function paintHPNet() {
      const teams = getTeamsData();
      const vocero = (est && est.espera) ? est.espera.asiento : 0;
      const turnTeam = vocero % 2;

      teams.forEach((t, i) => {
        const frame = fighterFrame(i);
        const box = frame && frame.querySelector('.ba-hpbox');
        if (!box) return;
        const pct = Math.max(0, Math.min(100, Math.round(t.hp / t.totalMax * 100)));
        box.querySelector('.ba-hpbox-fill').style.width = pct + '%';
        box.querySelector('.ba-hpbox-pct').textContent = pct + '%';
        box.querySelector('.ba-hpbox-name').textContent = t.name;
        box.classList.toggle('ba-hpbox-turn', turnTeam === i);
        box.classList.toggle('ba-hpbox-low', pct <= 30);
        box.classList.toggle('ba-hpbox-mid', pct > 30 && pct <= 55);
        box.classList.toggle('ba-hpbox-shield', t.shield > 0);
      });

      roster.innerHTML = '';
      teams.forEach((t, ti) => {
        const perMemberHp = t.members.length ? Math.round(t.hp / t.members.length) : t.hp;
        t.members.forEach((m) => {
          const hp = typeof m.hp === 'number' ? m.hp : perMemberHp;
          const pct = Math.max(0, Math.min(100, hp / t.maxInd * 100));
          const row = ui.el('div', 'ba-hp-row ba-' + t.color, '');
          row.innerHTML = '<span class="ba-hp-name"></span><span class="ba-hp-track"><i></i></span><span class="ba-hp-num"></span>';
          row.querySelector('.ba-hp-name').textContent = m.nombre;
          row.querySelector('.ba-hp-track i').style.width = pct + '%';
          row.querySelector('.ba-hp-num').textContent = Math.round(hp);
          row.classList.toggle('is-turn', turnTeam === ti);
          row.classList.toggle('is-low', pct <= 30);
          row.classList.toggle('is-shield', t.shield > 0);
          roster.appendChild(row);
        });
      });
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

    function mostrarPregunta() {
      qArea.innerHTML = '';
      if (!preg || !preg.enunciado) {
        qArea.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', 'Cargando pregunta…'));
        return;
      }
      const card = ui.el('div', 'q-card', '');
      card.appendChild(ui.el('div', 'text-xs text-slate-400 mb-1',
        escFn(preg.categoria || 'Pregunta del equipo') + (preg.dificultad ? ' · ' + escFn(preg.dificultad) : '')));
      card.appendChild(ui.el('h3', 'q-text text-slate-900', escFn(preg.enunciado)));
      const list = ui.el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4', '');
      const yoSeat = rol === 'docente' ? null : (NET.yo ? NET.yo() : null);
      const portavoz = (est && est.espera) ? est.espera.asiento : ((est && typeof est.portavoz === 'number') ? est.portavoz : null);
      const puedo = (portavoz !== null && yoSeat !== null && portavoz === yoSeat);

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

      if (!puedo) {
        const lista = (est && est.asientos) ? est.asientos : [];
        const nom = (portavoz !== null && lista[portavoz]) ? lista[portavoz].nombre : ('Jugador ' + ((portavoz || 0) + 1));
        qArea.appendChild(ui.el('p', 'text-xs text-slate-400 mt-2 text-center', 'Responde el vocero: <b>' + escFn(nom) + '</b>'));
      }
    }

    function pintarPodioNet() {
      qArea.innerHTML = '';
      const teams = getTeamsData();
      const ganadorIdx = teams[0].hp >= teams[1].hp ? 0 : 1;
      const win = teams[ganadorIdx];
      const st = teams.map((t) => ({
        nombre: t.name, color: t.color, puntos: t.hp, subtitulo: 'Vida restante'
      })).sort((a, b) => b.puntos - a.puntos);

      const podWrap = ui.el('div', '', '');
      qArea.appendChild(podWrap);
      if (App.gamekit && App.gamekit.podium) {
        App.gamekit.podium(podWrap, st.map((s, i) => ({
          nombre: s.nombre, icono: '⚔️', rank: i + 1,
          subtitulo: s.subtitulo, campo1Label: 'Vida', campo1: s.puntos, campo2Label: '', campo2: ''
        })), { title: '🏆 ¡' + win.name + ' gana la Batalla!', subtitle: 'Partida en red finalizada' });
      }
      if (registro) {
        qArea.appendChild(ui.el('p', 'text-sm text-center mt-2', 'Respondiste bien <b>' +
          ((registro.respuestas || []).filter((r) => r.correcto).length) + '</b> de <b>' + ((registro.respuestas || []).length) + '</b> preguntas.'));
      }
    }

    function pintarNet() {
      if (!vivo || !document.body.contains(root)) { limpiarNet(); return; }
      tm.textContent = reloj();
      paintHPNet();
      renderDocenteControls();

      const lista = (est && est.asientos) ? est.asientos : [];
      const portavoz = (est && est.espera) ? est.espera.asiento : ((est && typeof est.portavoz === 'number') ? est.portavoz : 0);
      const p = lista[portavoz] || {};
      const teams = getTeamsData();
      const eqActual = teams[portavoz % 2] || teams[0];
      statusLine.innerHTML = 'Turno de <b>' + escFn(eqActual.name) + '</b> · Vocero: <b>' + escFn(p.nombre || ('Jugador ' + (portavoz + 1))) + '</b>';

      const finNow = fin || (est && est.fase === 'terminada');
      if (finNow) { pintarPodioNet(); return; }

      qArea.innerHTML = '';
      if (!est) {
        qArea.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', 'Esperando el estado de la partida…'));
        return;
      }

      const yoSeat = rol === 'docente' ? null : (NET.yo ? NET.yo() : null);
      const esVocero = (portavoz !== null && yoSeat !== null && portavoz === yoSeat);

      if (est.fase === 'preguntar' || est.fase === 'responder') {
        if (preg && preg.v === est.v) mostrarPregunta();
        else qArea.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', 'Esperando a que el equipo en turno responda…'));
      } else if (est.fase === 'accion') {
        if (esVocero) {
          const box = ui.el('div', 'q-card text-center',
            '<div class="text-lg font-extrabold text-emerald-700 mb-1">✓ ¡Acertaron!</div>' +
            '<p class="text-sm text-slate-600 mb-3">Elijan su acción:</p>' +
            '<div class="grid grid-cols-2 gap-2">' +
            '<button id="ba-net-att" class="btn-danger">⚔️ Atacar</button>' +
            '<button id="ba-net-def" class="btn-ghost">🛡️ Defender</button>' +
            '</div>');
          qArea.appendChild(box);
          const btnAtt = box.querySelector('#ba-net-att');
          const btnDef = box.querySelector('#ba-net-def');
          btnAtt.addEventListener('click', () => {
            if (enviando) return;
            enviando = true; btnAtt.disabled = true; btnDef.disabled = true;
            NET.accion({ tipo: 'atacar' }).then((r) => {
              enviando = false;
              if (!r || !r.ok) { btnAtt.disabled = false; btnDef.disabled = false; if (ui.toast) ui.toast((r && (r.mensaje || r.error)) || 'No se pudo atacar', 'error'); }
            });
          });
          btnDef.addEventListener('click', () => {
            if (enviando) return;
            enviando = true; btnAtt.disabled = true; btnDef.disabled = true;
            NET.accion({ tipo: 'defender' }).then((r) => {
              enviando = false;
              if (!r || !r.ok) { btnAtt.disabled = false; btnDef.disabled = false; if (ui.toast) ui.toast((r && (r.mensaje || r.error)) || 'No se pudo defender', 'error'); }
            });
          });
        } else {
          qArea.appendChild(ui.el('p', 'text-sm text-slate-400 text-center', '✨ <b>' + escFn(p.nombre || 'El vocero') + '</b> está eligiendo entre Atacar o Defender…'));
        }
      }
    }

    let animFrame = 0;
    const animTimer = setInterval(() => {
      if (!vivo || !document.body.contains(root)) { limpiarNet(); return; }
      animFrame++;
      renderArenaNet(animFrame);
    }, 33);

    const tickNet = setInterval(() => {
      if (!vivo || !document.body.contains(root)) { limpiarNet(); return; }
      tm.textContent = reloj();
    }, 250);

    const offs = [];
    function limpiarNet() {
      if (!vivo) return;
      vivo = false;
      clearInterval(animTimer);
      clearInterval(tickNet);
      offs.forEach((fn) => { try { fn(); } catch (e) {} });
    }
    function alCerrarNet() { limpiarNet(); if (ui.toast) ui.toast('El docente cerró la sala', 'warn'); App.go(rol === 'docente' ? 'inicio' : 'red'); }
    function alExpulsarNet() { limpiarNet(); if (ui.toast) ui.toast('El docente te sacó de la sala', 'warn'); App.go('red'); }

    offs.push(NET.on('estado', (p) => {
      if (!p) return;
      const prevHp = (est && est.equipoHp) ? est.equipoHp.slice() : null;
      const prevShield = (est && est.equipoShield) ? est.equipoShield.slice() : null;
      est = p.estado ? JSON.parse(JSON.stringify(p.estado)) : est;
      turnoVence = p.turnoVence || null;
      partidaVence = p.partidaVence || null;
      off = (p.ahora || Date.now()) - Date.now();

      (p.eventos || []).forEach((ev) => {
        if (ev.t === 'respondida' && ev.asiento === (NET.yo ? NET.yo() : -1)) {
          ui.sound(ev.correcto ? 'correct' : 'wrong');
          ui.toast(ev.correcto ? '✅ ¡Correcto!' : '❌ Incorrecto', ev.correcto ? 'success' : 'error');
        }
      });

      if (prevHp && est && est.equipoHp) {
        [0, 1].forEach((ei) => {
          const diff = prevHp[ei] - est.equipoHp[ei];
          if (diff > 0) {
            const attacker = 1 - ei;
            poses[attacker] = 'attack';
            poses[ei] = 'defend';
            const frame = fighterFrame(ei);
            ui.shake(frame && frame.querySelector('.ba-canvas'));
            const box = frame && frame.querySelector('.ba-hpbox');
            if (box) ui.flash(box, 'ba-hpbox-hit', 400);
            ui.floatText(roster, '-' + diff + ' HP', 'ft-hit');
            ui.sound('hit');
            setTimeout(() => { poses[0] = 'idle'; poses[1] = 'idle'; }, 900);
          } else if (prevShield && prevShield[ei] > 0 && (!est.equipoShield || est.equipoShield[ei] === 0)) {
            poses[1 - ei] = 'attack';
            poses[ei] = 'defend';
            ui.floatText(roster, '🛡️ BLOQUEADO', 'ft-warn');
            setTimeout(() => { poses[0] = 'idle'; poses[1] = 'idle'; }, 900);
          } else if (est.equipoShield && est.equipoShield[ei] > (prevShield ? prevShield[ei] : 0)) {
            poses[ei] = 'defend';
            ui.toast('🛡️ Escudo activado', 'info');
            setTimeout(() => { poses[ei] = 'idle'; }, 700);
          }
        });
      }
      pintarNet();
    }));
    offs.push(NET.on('pregunta', (q) => { preg = q; enviando = false; pintarNet(); }));
    offs.push(NET.on('sala', () => pintarNet()));
    offs.push(NET.on('fin', (f) => { fin = f; ui.sound('win'); ui.confetti(root); pintarNet(); }));
    offs.push(NET.on('registro', (r) => { registro = r; pintarNet(); }));
    try { offs.push(NET.on('cerrada', alCerrarNet)); } catch (e) {}
    try { offs.push(NET.on('expulsado', alExpulsarNet)); } catch (e) {}

    renderArenaNet(0);
    pintarNet();
  }

  return { init, initNet, MODE };
})(App.ui);
