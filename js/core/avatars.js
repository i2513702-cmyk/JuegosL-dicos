/* ============================================================
 * LudoApp core/avatars.js
 * Sistema de avatares guerreros pixelados (16x16, sin imágenes
 * externas). Base extraída del zip "sistema-gamificado-avatares".
 *  - CHARACTERS: elenco base (5 guerreros), mismo id como clave.
 *  - drawBody: sprite completo con 4 poses (idle/attack/defend/
 *    heal) y orientación (right/left), usado en Batalla.
 *  - drawIcon: figura compacta de reposo, usada como ficha/token
 *    en Ludo, Carrera y Conquista.
 *  - badge: mini-canvas reutilizable para chips/paneles.
 * ============================================================ */
window.App = window.App || {};
App.avatars = (function () {
  const CHARACTERS = [
    { id: 'espadachin', name: 'Espadachín', skin: '#e8b88a', armor: '#3a5a8a', head: '#9a9a9a', boots: '#2a2a2a', weapon: 'sword', weaponColor: '#c0c0c0' },
    { id: 'barbaro', name: 'Bárbaro', skin: '#d0a070', armor: '#6a5a3a', head: '#5a3a1a', boots: '#3a2a1a', weapon: 'axe', weaponColor: '#9a9a9a' },
    { id: 'caballero', name: 'Caballero', skin: '#f0c9a0', armor: '#3a5a8a', head: '#c0a020', boots: '#2a2a3a', weapon: 'sword', weaponColor: '#c0c0c0', shield: true, shieldColor: '#c0a020' },
    { id: 'lancero', name: 'Lancero', skin: '#e8b88a', armor: '#2f6f4a', head: '#2a2a2a', boots: '#1a1a1a', weapon: 'spear', weaponColor: '#8a6a3a' },
    { id: 'sombrio', name: 'Guerrero sombrío', skin: '#d8b090', armor: '#2a2a3a', head: '#141414', boots: '#0e0e0e', weapon: 'dualblade', weaponColor: '#8a2f2f' }
  ];
  const BY_ID = {};
  CHARACTERS.forEach((c) => { BY_ID[c.id] = c; });

  function hash(s) {
    let h = 0;
    if (s) for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  function get(id) { return BY_ID[id] || null; }
  function pick(i) { return CHARACTERS[(i < 0 ? 0 : i) % CHARACTERS.length] || CHARACTERS[0]; }

  /* Resuelve el avatar de un jugador: avatarId guardado, o por
     posición con fallback determinista por su id. */
  function resolve(pr, i) {
    if (!pr) return pick(typeof i === 'number' ? i : 0);
    const saved = get(pr.avatarId);
    if (saved) return saved;
    return typeof i === 'number' ? pick(i) : pick(hash(pr.id || pr.nombre || ''));
  }

  function px(ctx, ox, oy, ps, gx, gy, gw, gh, color) {
    ctx.fillStyle = color;
    ctx.fillRect(ox + gx * ps, oy + gy * ps, gw * ps, gh * ps);
  }

  /* ---------- sprite completo (4 poses + orientacion) ---------- */
  function drawBody(ctx, ox, oy, ps, c, pose, facing) {
    ctx.save();
    if (facing === 'left') { ctx.translate(ox + 16 * ps, oy); ctx.scale(-1, 1); ox = 0; oy = 0; }
    const P = (gx, gy, gw, gh, color) => px(ctx, ox, oy, ps, gx, gy, gw, gh, color);

    const crouch = pose === 'defend';
    const torsoY = crouch ? 8 : 7;

    if (crouch) { P(4, 11, 3, 3, c.boots); P(9, 11, 3, 3, c.boots); }
    else { P(5, 11, 3, 3, c.boots); P(8, 11, 3, 3, c.boots); }

    P(3, torsoY, 10, 5, c.armor);
    P(4, 1, 8, 2, c.head);
    P(4, 3, 8, 3, c.skin);
    P(5, 4, 1, 1, '#2a2a2a'); P(10, 4, 1, 1, '#2a2a2a');

    if (pose === 'idle') {
      P(1, torsoY, 2, 4, c.skin);
      P(12, torsoY, 2, 4, c.skin);
      drawWeapon(ctx, ox, oy, ps, c, 'idle');
    } else if (pose === 'attack') {
      P(1, torsoY, 2, 3, c.skin);
      P(11, torsoY - 1, 3, 2, c.skin);
      drawWeapon(ctx, ox, oy, ps, c, 'attack');
      ctx.strokeStyle = '#e0c060'; ctx.lineWidth = Math.max(1, ps * 0.15);
      ctx.beginPath();
      ctx.moveTo(ox + 15 * ps, oy + 3 * ps); ctx.lineTo(ox + 17 * ps, oy + 1.5 * ps);
      ctx.moveTo(ox + 15.5 * ps, oy + 5.5 * ps); ctx.lineTo(ox + 18 * ps, oy + 5.5 * ps);
      ctx.moveTo(ox + 15 * ps, oy + 8 * ps); ctx.lineTo(ox + 17 * ps, oy + 9.5 * ps);
      ctx.stroke();
    } else if (pose === 'defend') {
      if (c.shield) {
        P(0, torsoY - 1, 3, 7, c.shieldColor);
        P(1, torsoY + 1, 1, 3, '#8a6a10');
      } else {
        P(1, torsoY, 3, 3, c.skin);
        drawWeapon(ctx, ox, oy, ps, c, 'defend');
      }
      P(12, torsoY, 2, 4, c.skin);
      ctx.strokeStyle = '#c0c0f0'; ctx.lineWidth = Math.max(1, ps * 0.12);
      ctx.beginPath();
      ctx.moveTo(ox + 1 * ps, oy + 5 * ps); ctx.lineTo(ox - 1 * ps, oy + 4 * ps);
      ctx.moveTo(ox + 1 * ps, oy + 7 * ps); ctx.lineTo(ox - 1 * ps, oy + 8 * ps);
      ctx.stroke();
    } else if (pose === 'heal') {
      P(1, torsoY - 3, 2, 7, c.skin);
      P(12, torsoY - 3, 2, 7, c.skin);
      ctx.fillStyle = 'rgba(120,220,160,0.35)';
      ctx.beginPath(); ctx.arc(ox + 8 * ps, oy - 1 * ps, ps * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6fd08a';
      ctx.beginPath(); ctx.arc(ox + 8 * ps, oy - 1 * ps, ps * 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bff0cf';
      [[3, 0], [13, 1], [6, -2.5], [10, -2.5]].forEach(([sx, sy]) => {
        ctx.fillRect(ox + sx * ps, oy + sy * ps, ps * 0.6, ps * 0.6);
      });
    }
    ctx.restore();
  }

  function drawWeapon(ctx, ox, oy, ps, c, pose) {
    ctx.save();
    ctx.fillStyle = c.weaponColor;

    if (c.weapon === 'sword') {
      if (pose === 'idle') {
        ctx.fillRect(ox + 13 * ps, oy + 6 * ps, ps, ps * 6);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(ox + 12.5 * ps, oy + 11 * ps, ps * 2, ps);
      } else if (pose === 'attack') {
        ctx.translate(ox + 13 * ps, oy + 5 * ps); ctx.rotate(-Math.PI / 3);
        ctx.fillRect(0, 0, ps, ps * 7);
      } else if (pose === 'defend') {
        ctx.translate(ox + 3 * ps, oy + 6 * ps); ctx.rotate(Math.PI / 6);
        ctx.fillRect(0, 0, ps, ps * 6);
      }
    } else if (c.weapon === 'axe') {
      if (pose === 'idle') {
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(ox + 13 * ps, oy + 5 * ps, ps * 0.8, ps * 7);
        ctx.fillStyle = c.weaponColor; ctx.fillRect(ox + 12.5 * ps, oy + 4 * ps, ps * 2.2, ps * 2.2);
      } else if (pose === 'attack') {
        ctx.translate(ox + 13 * ps, oy + 4 * ps); ctx.rotate(-Math.PI / 2.5);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(0, 0, ps * 0.8, ps * 6);
        ctx.fillStyle = c.weaponColor; ctx.fillRect(-ps * 0.7, -ps * 0.5, ps * 2.2, ps * 2.2);
      } else if (pose === 'defend') {
        ctx.translate(ox + 3 * ps, oy + 6 * ps); ctx.rotate(Math.PI / 8);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(0, 0, ps * 0.8, ps * 5);
        ctx.fillStyle = c.weaponColor; ctx.fillRect(-ps * 0.7, -ps * 1.5, ps * 2.2, ps * 2);
      }
    } else if (c.weapon === 'spear') {
      if (pose === 'idle') {
        ctx.fillStyle = '#8a6a3a'; ctx.fillRect(ox + 13 * ps, oy + 3 * ps, ps * 0.8, ps * 10);
        ctx.fillStyle = '#c0c0c0'; ctx.fillRect(ox + 12.6 * ps, oy + 1 * ps, ps * 1.6, ps * 2.2);
      } else if (pose === 'attack') {
        ctx.translate(ox + 7 * ps, oy + 7 * ps);
        ctx.fillStyle = '#8a6a3a'; ctx.fillRect(0, -ps * 0.4, ps * 11, ps * 0.8);
        ctx.fillStyle = '#c0c0c0'; ctx.fillRect(ps * 10, -ps * 1.1, ps * 2.2, ps * 1.6);
      } else if (pose === 'defend') {
        ctx.translate(ox + 2 * ps, oy + 7 * ps); ctx.rotate(-Math.PI / 10);
        ctx.fillStyle = '#8a6a3a'; ctx.fillRect(0, -ps * 0.4, ps * 8, ps * 0.8);
        ctx.fillStyle = '#c0c0c0'; ctx.fillRect(-ps * 1.6, -ps * 1.1, ps * 1.8, ps * 1.6);
      }
    } else if (c.weapon === 'dualblade') {
      ctx.fillStyle = c.weaponColor;
      if (pose === 'idle') {
        ctx.fillRect(ox + 1 * ps, oy + 11 * ps, ps * 0.8, ps * 4);
        ctx.fillRect(ox + 13.2 * ps, oy + 11 * ps, ps * 0.8, ps * 4);
      } else if (pose === 'attack') {
        ctx.save(); ctx.translate(ox + 13 * ps, oy + 5 * ps); ctx.rotate(-Math.PI / 2.2); ctx.fillRect(0, 0, ps * 0.8, ps * 6); ctx.restore();
        ctx.save(); ctx.translate(ox + 2 * ps, oy + 5 * ps); ctx.rotate(Math.PI / 2.2); ctx.fillRect(0, 0, ps * 0.8, ps * 6); ctx.restore();
      } else if (pose === 'defend') {
        ctx.save(); ctx.translate(ox + 2 * ps, oy + 5 * ps); ctx.rotate(Math.PI / 5); ctx.fillRect(0, 0, ps * 0.8, ps * 6); ctx.restore();
        ctx.save(); ctx.translate(ox + 14 * ps, oy + 5 * ps); ctx.rotate(-Math.PI / 5); ctx.fillRect(0, 0, ps * 0.8, ps * 6); ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ---------- figura compacta (icono / token) ---------- */
  function drawIcon(ctx, ox, oy, ps, c, facing) {
    ctx.save();
    if (facing === 'left') { ctx.translate(ox + 16 * ps, oy); ctx.scale(-1, 1); ox = 0; oy = 0; }
    const P = (gx, gy, gw, gh, color) => px(ctx, ox, oy, ps, gx, gy, gw, gh, color);
    P(5, 11, 3, 3, c.boots); P(8, 11, 3, 3, c.boots);
    P(3, 7, 10, 5, c.armor);
    P(4, 1, 8, 2, c.head);
    P(4, 3, 8, 3, c.skin);
    P(5, 4, 1, 1, '#2a2a2a'); P(10, 4, 1, 1, '#2a2a2a');
    P(1, 7, 2, 4, c.skin); P(12, 7, 2, 4, c.skin);
    ctx.fillStyle = c.weaponColor;
    ctx.fillRect(ox + 13 * ps, oy + 6 * ps, ps, ps * 6);
    ctx.restore();
  }

  /* ---------- mini-canvas listo para insertar en chips ---------- */
  function badge(c, size) {
    size = size || 24;
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = size;
    cnv.className = 'avatar-canvas';
    cnv.title = c.name;
    const g = cnv.getContext('2d');
    g.fillStyle = c.armor + '2e';
    g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); g.fill();
    drawIcon(g, 0, 0, size / 16, c, 'right');
    g.strokeStyle = 'rgba(15,23,42,.25)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, size - 1, size - 1);
    return cnv;
  }

  return {
    CHARACTERS, get, pick, resolve,
    drawBody, drawIcon, badge
  };
})();