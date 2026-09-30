/* ============================================================
 * LudoApp core/gamekit.js
 * Micro-framework ligero (~4 KB) compartido por los 4 juegos.
 * Centraliza los bloques que antes se duplicaban en cada modo:
 *  - chips de jugador con avatar (ludo, carrera, conquista)
 *  - fila de habilidades con contador (todos los modos)
 *  - temporizador con markup único (todos los modos)
 *  - párrafo de bonus por archivo/equipo
 *  - pódium final (sonido + confeti + pódium)
 * No añade dependencias externas: funciona igual offline.
 * ============================================================ */
window.App = window.App || {};
App.gamekit = (function () {
  /* resolución perezosa de App.ui: el micro-framework funciona aunque se cargue
   * antes que ui/ui.js (evita ReferenceError en los 4 juegos). */
  const U = () => App.ui;
  function avatarOf(p, i) {
    return (p && p.avatar) || App.avatars.pick(typeof i === 'number' ? i : 0);
  }

  /* ---- chip de jugador con su avatar ---- */
  function chip(opts) {
    const el = U().el('div', 'l-chip' + (opts.active ? ' l-chip-active' : ''), '');
    el.appendChild(App.avatars.badge(avatarOf(opts.player, opts.index), opts.size || 22));
    if (opts.name) el.appendChild(U().el('span', 'text-xs font-semibold truncate', opts.name));
    if (opts.extra) el.appendChild(U().el('span', 'text-[10px] text-slate-400', opts.extra));
    return el;
  }

  function renderChips(container, players, cfg) {
    container.innerHTML = '';
    players.forEach((p, i) => {
      container.appendChild(chip({
        player: p, index: i, size: cfg.size,
        active: cfg.activeId ? p.id === cfg.activeId : (i === cfg.activeIdx),
        name: cfg.name ? cfg.name(p, i) : p.nombre,
        extra: cfg.extra ? cfg.extra(p, i) : ''
      }));
    });
  }

  /* ---- fila de habilidades ---- */
  /* entries: [{ key, icono, nombre, amount, on?, label? }] */
  function renderSkills(container, entries, onUse, ended) {
    container.innerHTML = '';
    (entries || []).forEach((e) => {
      const n = e.amount || 0;
      const b = U().el('button',
        'skill-btn' + (n <= 0 ? ' skill-btn-empty' : '') + (e.on ? ' skill-btn-on' : ''),
        e.icono + ' ' + e.nombre + ' ×' + n + (e.label || ''));
      if (n > 0 && !ended && onUse) b.addEventListener('click', () => onUse(e.key));
      container.appendChild(b);
    });
  }

  /* ---- temporizador ---- */
  function timerBox(root, seconds, onTimeout, beforeEl) {
    const wrap = U().el('div', 'mb-3', '');
    wrap.innerHTML = '<div class="tb"><div class="tb-fill"></div><span class="tb-label">00:00</span></div>';
    if (beforeEl) root.insertBefore(wrap, beforeEl);
    else root.insertBefore(wrap, root.firstChild);
    const t = U().timerBar(wrap, seconds, onTimeout);
    t.start();
    return t;
  }

  /* ---- bonus ---- */
  function bonusForPlayer(player, profileOf, mode) {
    const aw = App.progression.awardWin(profileOf(player.id), mode);
    return U().bonusParagraph([{
      nombre: player.nombre, xp: aw.bonuses.xp, monedas: aw.bonuses.monedas,
      logros: (aw.achievements || []).map((a) => a.icono + ' ' + a.titulo)
    }]);
  }

  function bonusForTeam(members, profileOf, mode) {
    const awards = members.map((m) => {
      const aw = App.progression.awardWin(profileOf(m.id), mode);
      return {
        nombre: m.nombre, xp: aw.bonuses.xp, monedas: aw.bonuses.monedas,
        logros: (aw.achievements || []).map((a) => a.icono + ' ' + a.titulo)
      };
    });
    return U().bonusParagraph(awards);
  }

  /* ---- pódium (sonido + confeti + tabla) ---- */
  function podium(root, rows, opts) {
    U().sound('win');
    U().confetti(root);
    U().podium(root, rows, opts);
  }

  return { avatarOf, chip, renderChips, renderSkills, timerBox, bonusForPlayer, bonusForTeam, podium };
})();