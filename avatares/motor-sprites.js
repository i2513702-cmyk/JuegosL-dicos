/* ============================================================
 * motor-sprites.js — MOTOR DE SPRITES COMPARTIDO
 * ---------------------------------------------------------
 * Unica fuente de verdad para:
 *   - CHARACTERS : los 5 avatares pixelados (datos + paleta)
 *   - drawBody()  : sprite 16x16 con poses idle/attack/defend/heal
 *   - drawWeapon(): el arma (sword/axe/spear/dualblade) por pose
 *   - drawIcon()  : version simple de pie, usada como ficha
 *
 * Sin dependencias externas, sin build. Se carga con:
 *   <script src="motor-sprites.js"></script>
 * Cada prototipo sigue siendo usable de forma independiente:
 * basta con tener este archivo en la misma carpeta.
 *
 * La paleta y el estilo pixel art NO se modifican: son la
 * identidad del proyecto (ver documentacion-sistema-avatares.md).
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 1. datos de los avatares ---------- */
  var CHARACTERS = [
    { id: 'espadachin', name: 'Espadachín',       skin: '#e8b88a', armor: '#3a5a8a', head: '#9a9a9a', boots: '#2a2a2a', weapon: 'sword',    weaponColor: '#c0c0c0' },
    { id: 'barbaro',    name: 'Bárbaro',          skin: '#d0a070', armor: '#6a5a3a', head: '#5a3a1a', boots: '#3a2a1a', weapon: 'axe',       weaponColor: '#9a9a9a' },
    { id: 'caballero',  name: 'Caballero',        skin: '#f0c9a0', armor: '#3a5a8a', head: '#c0a020', boots: '#2a2a3a', weapon: 'sword',     weaponColor: '#c0c0c0', shield: true, shieldColor: '#c0a020' },
    { id: 'lancero',    name: 'Lancero',          skin: '#e8b88a', armor: '#2f6f4a', head: '#2a2a2a', boots: '#1a1a1a', weapon: 'spear',     weaponColor: '#8a6a3a' },
    { id: 'sombrio',    name: 'Guerrero sombrío', skin: '#d8b090', armor: '#2a2a3a', head: '#141414', boots: '#0e0e0e', weapon: 'dualblade', weaponColor: '#8a2f2f' }
  ];

  /* sprite de 16x16 unidades de grilla dibujado con fillRect */
  var GRID = 16;

  function byId(id) {
    for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].id === id) return CHARACTERS[i];
    return null;
  }

  /* ---------- 2. arma por tipo y pose ---------- */
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

  /* ---------- 3. cuerpo + pose ---------- */
  function drawBody(ctx, ox, oy, ps, c, pose, facing) {
    ctx.save();
    if (facing === 'left') { ctx.translate(ox + GRID * ps, oy); ctx.scale(-1, 1); ox = 0; oy = 0; }
    var px = function (gx, gy, gw, gh, color) {
      ctx.fillStyle = color;
      ctx.fillRect(ox + gx * ps, oy + gy * ps, gw * ps, gh * ps);
    };

    var crouch = pose === 'defend';
    var torsoY = crouch ? 8 : 7;

    if (crouch) { px(4, 11, 3, 3, c.boots); px(9, 11, 3, 3, c.boots); }
    else        { px(5, 11, 3, 3, c.boots); px(8, 11, 3, 3, c.boots); }

    px(3, torsoY, 10, 5, c.armor);
    px(4, 1, 8, 2, c.head);
    px(4, 3, 8, 3, c.skin);
    px(5, 4, 1, 1, '#2a2a2a'); px(10, 4, 1, 1, '#2a2a2a');

    if (pose === 'idle') {
      px(1, torsoY, 2, 4, c.skin);
      px(12, torsoY, 2, 4, c.skin);
      drawWeapon(ctx, ox, oy, ps, c, 'idle');
    } else if (pose === 'attack') {
      px(1, torsoY, 2, 3, c.skin);
      px(11, torsoY - 1, 3, 2, c.skin);
      drawWeapon(ctx, ox, oy, ps, c, 'attack');
      ctx.strokeStyle = '#e0c060'; ctx.lineWidth = Math.max(1, ps * 0.15);
      ctx.beginPath();
      ctx.moveTo(ox + 15 * ps, oy + 3 * ps); ctx.lineTo(ox + 17 * ps, oy + 1.5 * ps);
      ctx.moveTo(ox + 15.5 * ps, oy + 5.5 * ps); ctx.lineTo(ox + 18 * ps, oy + 5.5 * ps);
      ctx.moveTo(ox + 15 * ps, oy + 8 * ps); ctx.lineTo(ox + 17 * ps, oy + 9.5 * ps);
      ctx.stroke();
    } else if (pose === 'defend') {
      if (c.shield) {
        px(0, torsoY - 1, 3, 7, c.shieldColor);
        px(1, torsoY + 1, 1, 3, '#8a6a10');
      } else {
        px(1, torsoY, 3, 3, c.skin);
        drawWeapon(ctx, ox, oy, ps, c, 'defend');
      }
      px(12, torsoY, 2, 4, c.skin);
      ctx.strokeStyle = '#c0c0f0'; ctx.lineWidth = Math.max(1, ps * 0.12);
      ctx.beginPath();
      ctx.moveTo(ox + 1 * ps, oy + 5 * ps); ctx.lineTo(ox - 1 * ps, oy + 4 * ps);
      ctx.moveTo(ox + 1 * ps, oy + 7 * ps); ctx.lineTo(ox - 1 * ps, oy + 8 * ps);
      ctx.stroke();
    } else if (pose === 'heal') {
      px(1, torsoY - 3, 2, 7, c.skin);
      px(12, torsoY - 3, 2, 7, c.skin);
      ctx.fillStyle = 'rgba(120,220,160,0.35)';
      ctx.beginPath(); ctx.arc(ox + 8 * ps, oy - 1 * ps, ps * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6fd08a';
      ctx.beginPath(); ctx.arc(ox + 8 * ps, oy - 1 * ps, ps * 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bff0cf';
      [[3, 0], [13, 1], [6, -2.5], [10, -2.5]].forEach(function (p) {
        ctx.fillRect(ox + p[0] * ps, oy + p[1] * ps, ps * 0.6, ps * 0.6);
      });
    }
    ctx.restore();
  }

  /* ---------- 4. ficha simple (idle) para Ludo / Carrera / Conquista ---------- */
  function drawIcon(ctx, ox, oy, ps, c) {
    var px = function (gx, gy, gw, gh, color) {
      ctx.fillStyle = color;
      ctx.fillRect(ox + gx * ps, oy + gy * ps, gw * ps, gh * ps);
    };
    px(5, 11, 3, 3, c.boots); px(8, 11, 3, 3, c.boots);
    px(3, 7, 10, 5, c.armor);
    px(4, 1, 8, 2, c.head);
    px(4, 3, 8, 3, c.skin);
    px(5, 4, 1, 1, '#2a2a2a'); px(10, 4, 1, 1, '#2a2a2a');
    px(1, 7, 2, 4, c.skin); px(12, 7, 2, 4, c.skin);
    ctx.fillStyle = c.weaponColor;
    ctx.fillRect(ox + 13 * ps, oy + 6 * ps, ps, ps * 6);
  }

  /* ---------- 5. escenario SVG como capa de fondo ---------- */
  /* Mantiene la proporción 680:380 sin deformar y no tapa el HUD:
     el <img> va detrás (z-index 0) y el canvas encima (z-index 1). */
  var STAGE_W = 680, STAGE_H = 380;

  function mountStage(canvasId, svgFile, altText) {
    var cv = document.getElementById(canvasId);
    if (!cv) return null;
    var stage = document.createElement('div');
    stage.className = 'stage';
    stage.style.aspectRatio = STAGE_W + ' / ' + STAGE_H;
    if (svgFile) {
      var bg = document.createElement('img');
      bg.className = 'escenario';
      bg.src = '../escenarios-estaticos/' + svgFile;
      bg.alt = altText || '';
      bg.setAttribute('aria-hidden', altText ? 'false' : 'true');
      bg.width = STAGE_W; bg.height = STAGE_H;
      bg.decoding = 'async';
      stage.appendChild(bg);
    }
    cv.parentNode.insertBefore(stage, cv);
    stage.appendChild(cv);
    /* el canvas hereda el tamaño del escenario 1:1 (coordenadas = viewBox) */
    cv.width = STAGE_W; cv.height = STAGE_H;
    cv.style.width = '100%'; cv.style.height = '100%';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', altText || 'Escenario de juego');
    return cv;
  }

  var Motor = {
    CHARACTERS: CHARACTERS,
    GRID: GRID,
    STAGE_W: STAGE_W,
    STAGE_H: STAGE_H,
    byId: byId,
    drawBody: drawBody,
    drawWeapon: drawWeapon,
    drawIcon: drawIcon,
    mountStage: mountStage
  };

  global.Motor = Motor;
})(window);