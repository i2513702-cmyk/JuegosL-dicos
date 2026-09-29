/* ============================================================
 * LudoApp core/progressionEngine.js
 * Sistema de progresión COMPARTIDO por los 4 modos:
 * puntos, XP, monedas, niveles, rachas, logros, habilidades
 * y ranking global.
 * ============================================================ */
window.App = window.App || {};
App.progression = (function () {
  const REWARDS = {
    dif_facil: { puntos: 10, xp: 12, monedas: 5 },
    dif_media: { puntos: 20, xp: 24, monedas: 10 },
    dif_dificil: { puntos: 30, xp: 40, monedas: 20 }
  };

  const SKILLS = {
    pista: { id: 'pista', nombre: 'Pista', icono: '💡', coste: 20, desc: 'Elimina 2 opciones incorrectas de la pregunta actual.' },
    comodin: { id: 'comodin', nombre: 'Comodín', icono: '🃏', coste: 50, desc: 'Convierte una pregunta en acierto automático.' },
    doble_dano: { id: 'doble_dano', nombre: 'Doble daño', icono: '⚔️', coste: 30, desc: 'Batalla: tu próximo ataque causa el doble de daño.' },
    escudo: { id: 'escudo', nombre: 'Escudo', icono: '🛡️', coste: 25, desc: 'Batalla: bloquea el próximo ataque del rival.' },
    impulso: { id: 'impulso', nombre: 'Impulso', icono: '🚀', coste: 35, desc: 'Ludo / Carrera: avance extra de +2 en tu próxima jugada.' },
    cura: { id: 'cura', nombre: 'Curación', icono: '❤️', coste: 40, desc: 'Batalla: recupera 20 de vida.' }
  };

  const ACHIEVEMENTS = [
    { id: 'primer_paso', titulo: 'Primer paso', icono: '🌱', desc: 'Acierta tu primera pregunta.' },
    { id: 'racha_5', titulo: 'En racha', icono: '🔥', desc: 'Logra 5 aciertos consecutivos.' },
    { id: 'racha_10', titulo: 'Imparable', icono: '⚡', desc: 'Logra 10 aciertos consecutivos.' },
    { id: 'nivel_3', titulo: 'Constancia', icono: '🌟', desc: 'Alcanza el nivel 3.' },
    { id: 'nivel_5', titulo: 'Experto', icono: '💎', desc: 'Alcanza el nivel 5.' },
    { id: 'banquero', titulo: 'Banquero', icono: '💰', desc: 'Acumula 100 monedas ganadas.' },
    { id: 'primer_win', titulo: 'Primera victoria', icono: '🏆', desc: 'Gana tu primera partida.' },
    { id: 'tetracampeon', titulo: 'Ganó los 4 modos', icono: '👑', desc: 'Gana los cuatro modos de juego.' },
    { id: 'conquistador', titulo: 'Conquistador', icono: '🗺️', desc: 'Gana una partida de Conquista de Territorios.' },
    { id: 'velocista', titulo: 'Velocista', icono: '🏁', desc: 'Gana una partida de Carrera de Preguntas.' },
    { id: 'estratega', titulo: 'Estratega', icono: '⚔️', desc: 'Gana una partida de Batalla de Preguntas.' },
    { id: 'ludo_master', titulo: 'Maestro del Ludo', icono: '🎲', desc: 'Gana una partida de Ludo Educativo.' },
    { id: 'maraton', titulo: 'Maratonista', icono: '🏃', desc: 'Acumula 50 respuestas correctas en total.' }
  ];

  function f(x) { return Math.round(x); }

  function streakMultiplier(streak) {
    return 1 + Math.min(streak, 10) * 0.1; // racha 10 => x2.0
  }

  function computeRewards(difficultyId, streak, correct) {
    const base = REWARDS[difficultyId] || REWARDS.dif_facil;
    if (!correct) return { base, mult: 1, puntos: 0, xp: 2, monedas: 0 };
    const mult = streakMultiplier(streak);
    return { base, mult, puntos: base.puntos, xp: f(base.xp * mult), monedas: f(base.monedas * mult) };
  }

  function getLevel(xp) {
    const nivel = 1 + Math.floor(xp / 100);
    return { nivel, xpParaSiguiente: nivel * 100, baseDelNivel: (nivel - 1) * 100 };
  }

  function checkAchievements(player) {
    const checks = {
      primer_paso: () => player.correctas >= 1,
      racha_5: () => player.rachaMax >= 5,
      racha_10: () => player.rachaMax >= 10,
      nivel_3: () => player.nivel >= 3,
      nivel_5: () => player.nivel >= 5,
      banquero: () => (player.monedasGanadas || 0) >= 100,
      primer_win: () => (player.modosGanados || []).length >= 1,
      tetracampeon: () => (player.modosGanados || []).length >= 4,
      conquistador: () => (player.modosGanados || []).indexOf('conquista') !== -1,
      velocista: () => (player.modosGanados || []).indexOf('carrera') !== -1,
      estratega: () => (player.modosGanados || []).indexOf('batalla') !== -1,
      ludo_master: () => (player.modosGanados || []).indexOf('ludo') !== -1,
      maraton: () => player.correctas >= 50
    };
    const earned = player.logros || [];
    const nuevos = [];
    ACHIEVEMENTS.forEach((a) => {
      if (earned.indexOf(a.id) === -1 && checks[a.id] && checks[a.id]()) {
        earned.push(a.id);
        nuevos.push(a);
      }
    });
    player.logros = earned;
    return nuevos;
  }

  function save(player) {
    App.storage.update('players', player.id, player);
  }

  function getPlayer(id) {
    return App.storage.getById('players', id);
  }

  function ensureSkills(player) {
    if (!player.skills) player.skills = {};
    App.SKILLS_KEYS = App.SKILLS_KEYS || Object.keys(SKILLS);
    App.SKILLS_KEYS.forEach((k) => { if (!player.skills[k]) player.skills[k] = 0; });
  }

  function recordAnswer(player, opts) {
    /* opts: {question, selectedIndex, difficultyId, mode, courseId} */
    const correct = App.questionEngine.check(opts.question, opts.selectedIndex);
    const oldStreak = player.racha || 0;
    const newStreak = correct ? oldStreak + 1 : 0;
    player.racha = newStreak;
    if (correct) {
      player.rachaMax = Math.max(player.rachaMax || 0, newStreak);
      player.correctas = (player.correctas || 0) + 1;
    } else {
      player.incorrectas = (player.incorrectas || 0) + 1;
      player.racha = 0;
    }

    const r = computeRewards(opts.difficultyId, newStreak, correct);
    player.xp = (player.xp || 0) + r.xp;
    player.puntos = (player.puntos || 0) + r.puntos;
    const coinsGained = r.monedas;
    player.monedas = (player.monedas || 0) + r.monedas;
    if (correct) player.monedasGanadas = (player.monedasGanadas || 0) + coinsGained;

    if (!player.modeStats) player.modeStats = {};
    const m = player.modeStats[opts.mode] || (player.modeStats[opts.mode] = { correctas: 0, incorrectas: 0, xp: 0, victorias: 0 });
    if (correct) m.correctas++; else m.incorrectas++;
    m.xp += r.xp;

    const lvl = getLevel(player.xp);
    player.nivel = lvl.nivel;

    ensureSkills(player);
    const nuevosLogros = checkAchievements(player);
    save(player);

    App.storage.endpoint('POST', '/answers', {
      playerId: player.id,
      questionId: opts.question.id,
      courseId: opts.courseId,
      mode: opts.mode,
      correcto: correct,
      opcionElegida: opts.selectedIndex,
      dificultadId: opts.difficultyId,
      xp: r.xp,
      monedas: r.monedas,
      puntos: r.puntos
    });

    return { correct: correct, rewards: r, achievements: nuevosLogros, question: opts.question };
  }

  function awardWin(player, mode) {
    const wins = player.modosGanados || [];
    if (wins.indexOf(mode) === -1) wins.push(mode);
    player.modosGanados = wins;
    player.xp = (player.xp || 0) + 50;
    player.monedas = (player.monedas || 0) + 30;
    const lvl = getLevel(player.xp);
    player.nivel = lvl.nivel;
    if (!player.modeStats) player.modeStats = {};
    const m = player.modeStats[mode] || (player.modeStats[mode] = { correctas: 0, incorrectas: 0, xp: 0, victorias: 0 });
    m.victorias = (m.victorias || 0) + 1;
    m.xp += 50;
    ensureSkills(player);
    const nuevos = checkAchievements(player);
    save(player);
    return { bonuses: { xp: 50, monedas: 30 }, achievements: nuevos };
  }

  function buySkill(player, skillId) {
    const s = SKILLS[skillId];
    if (!s) return { ok: false, reason: 'Habilidad inexistente.' };
    if ((player.monedas || 0) < s.coste) return { ok: false, reason: 'No tienes suficientes monedas.' };
    ensureSkills(player);
    player.monedas -= s.coste;
    player.skills[skillId] = (player.skills[skillId] || 0) + 1;
    save(player);
    return { ok: true, skill: s };
  }

  function useSkill(player, skillId) {
    ensureSkills(player);
    if (!player.skills[skillId]) return false;
    player.skills[skillId]--;
    save(player);
    return true;
  }

  function hasSkill(player, skillId) {
    ensureSkills(player);
    return player.skills[skillId] > 0;
  }

  function ranking(filter) {
    filter = filter || {};
    const players = App.storage.getPlayers().filter((p) => p.rol !== 'docente');
    let list = players.map((p) => {
      let xp = p.xp || 0;
      let correctas = p.correctas || 0;
      let victorias = 0;
      if (filter.mode && p.modeStats && p.modeStats[filter.mode]) {
        xp = p.modeStats[filter.mode].xp || 0;
        correctas = p.modeStats[filter.mode].correctas || 0;
        victorias = p.modeStats[filter.mode].victorias || 0;
      }
      return {
        id: p.id, nombre: p.nombre, xp, nivel: getLevel(xp).nivel,
        correctas, victorias, rachaMax: p.rachaMax || 0,
        modosGanados: p.modosGanados || []
      };
    });
    if (filter.courseId) {
      const qMap = {};
      App.storage.getQuestions().forEach((q) => { qMap[q.id] = q.course_id; });
      const attempts = App.storage.getAttempts().filter((a) => a.courseId === filter.courseId);
      list = players.map((p) => {
        const mine = attempts.filter((a) => a.playerId === p.id);
        return {
          id: p.id, nombre: p.nombre,
          xp: mine.reduce((s, a) => s + (a.xp || 0), 0),
          nivel: getLevel(mine.reduce((s, a) => s + (a.xp || 0), 0)).nivel,
          correctas: mine.filter((a) => a.correcto).length,
          victorias: 0,
          rachaMax: p.rachaMax || 0,
          modosGanados: p.modosGanados || []
        };
      });
    }
    list.sort((a, b) => b.xp - a.xp);
    return list;
  }

  function getPlayerProfile(id) {
    const p = getPlayer(id);
    if (!p) return null;
    ensureSkills(p);
    const lvl = getLevel(p.xp);
    return {
      id: p.id,
      nombre: p.nombre,
      rol: p.rol,
      xp: p.xp,
      monedas: p.monedas,
      puntos: p.puntos,
      correctas: p.correctas,
      incorrectas: p.incorrectas,
      racha: p.racha,
      rachaMax: p.rachaMax,
      nivel: lvl.nivel,
      xpParaSiguiente: lvl.xpParaSiguiente,
      xpNivelBase: lvl.baseDelNivel,
      logros: (p.logros || []).map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean),
      modosGanados: p.modosGanados || [],
      skills: p.skills,
      modeStats: p.modeStats || {}
    };
  }

  return {
    REWARDS, SKILLS, ACHIEVEMENTS,
    computeRewards, streakMultiplier, getLevel,
    recordAnswer, awardWin,
    buySkill, useSkill, hasSkill, getPlayer, getPlayerProfile,
    ranking
  };
})();