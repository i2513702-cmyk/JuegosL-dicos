/* ============================================================
 * LudoApp shared/ludo-rules.js
 * REGLAS PURAS del Ludo educativo (sin DOM, sin red, sin azar propio).
 *
 * Funciona igual en Node (servidor) y en el navegador (vista):
 *   Node:       const Ludo = require('./js/shared/ludo-rules.js');
 *   Navegador:  <script src="js/shared/ludo-rules.js"></script>  -> App.rules.ludo
 *
 * Es una copia fiel de las reglas de js/games/ludo.js (camino "una ficha
 * efectiva por jugador": solo avanza la ficha 0; las otras tres son decorativas).
 *
 * El estado es JSON puro. Ninguna función lo modifica: devuelven uno nuevo.
 * El azar y las preguntas entran por `ctx`:
 *   ctx.rng()                 -> número en [0, 1)
 *   ctx.mazo.sacar()          -> { id, opciones: [...] }
 *   ctx.mazo.esCorrecta(id,i) -> boolean
 *   ctx.mazo.correcta(id)     -> índice de la opción correcta
 * El estado solo guarda el id de la pregunta: la respuesta correcta nunca
 * vive aquí, y view() tampoco la expone.
 * Compatible con Node >= 18.
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.App = root.App || {}; root.App.rules = root.App.rules || {}; root.App.rules.ludo = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- tablero (idéntico a ludo.js) ---------- */
  function deepFreeze(o) {
    Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }
  const TABLERO = deepFreeze({
    N: 15,
    META: 56,
    PATH: [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]],
    START: [0, 13, 26, 39],
    SAFE: { 0: 1, 8: 1, 13: 1, 21: 1, 26: 1, 34: 1, 39: 1, 47: 1 },
    RETO: { 5: 1, 18: 1, 31: 1, 44: 1 },
    AVANCE: { 11: 1, 24: 1, 37: 1, 50: 1 },
    RETRO: { 3: 1, 16: 1, 29: 1, 42: 1 },
    HOME_STRETCH: [
      [[7,1],[7,2],[7,3],[7,4],[7,5]],
      [[1,7],[2,7],[3,7],[4,7],[5,7]],
      [[7,13],[7,12],[7,11],[7,10],[7,9]],
      [[13,7],[12,7],[11,7],[10,7],[9,7]]
    ],
    CENTER: [7, 7],
    BASE_ORIGIN: [[0,0],[0,9],[9,9],[9,0]],
    YARD_SLOTS: [[1,1],[1,4],[4,1],[4,4]]
  });
  const META = TABLERO.META;
  const COLORES = ['rojo', 'verde', 'azul', 'amarillo'];
  const MIN = 1, MAX = 4;

  /* ---------- utilidades ---------- */
  const clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };
  const clonar = function (e) { return JSON.parse(JSON.stringify(e)); };
  const fallo = function (codigo, mensaje) { return { error: { codigo: codigo, mensaje: mensaje } }; };

  /* Casilla [fila, col] de una ficha. pos: -1 base, 0..50 circuito, 51..55 pasillo, 56 meta. */
  function celdaDe(asiento, pos, ficha) {
    if (pos < 0) {
      const o = TABLERO.BASE_ORIGIN[asiento], s = TABLERO.YARD_SLOTS[ficha || 0];
      return [o[0] + s[0], o[1] + s[1]];
    }
    if (pos >= META) return TABLERO.CENTER.slice();
    if (pos < 51) return TABLERO.PATH[(TABLERO.START[asiento] + pos) % 52].slice();
    return TABLERO.HOME_STRETCH[asiento][pos - 51].slice();
  }

  /* 'reto' | 'avance' | 'retroceso' | null (las casillas especiales son absolutas en el circuito) */
  function especialEn(asiento, pos) {
    if (pos < 0 || pos >= 51) return null;
    const g = (TABLERO.START[asiento] + pos) % 52;
    if (TABLERO.RETO[g]) return 'reto';
    if (TABLERO.AVANCE[g]) return 'avance';
    if (TABLERO.RETRO[g]) return 'retroceso';
    return null;
  }

  /* ---------- creación ---------- */
  /* opts.asientos: [{ id, nombre, avatar? }]  (1 a 4) */
  function create(opts) {
    const as = opts && opts.asientos;
    if (!Array.isArray(as) || as.length < MIN || as.length > MAX) {
      throw new Error('Ludo admite de ' + MIN + ' a ' + MAX + ' jugadores');
    }
    return {
      juego: 'ludo',
      v: 0,
      fase: 'tirar',                 // 'tirar' | 'responder' | 'terminada'
      turno: 0,
      ganador: null,
      motivoFin: null,               // 'meta' | 'tiempo'
      espera: { asiento: 0, que: 'tirar' },
      asientos: as.map(function (a, i) {
        return { id: a.id, nombre: a.nombre, avatar: a.avatar === undefined ? null : a.avatar, color: COLORES[i % 4], pos: -1 };
      }),
      dado: null,
      extra: 0,                      // reservado para la habilidad "impulso" (etapa 2)
      pendiente: null                // { tipo: 'turno'|'reto', qid, n }
    };
  }

  /* ---------- pasos internos (operan sobre una copia) ---------- */
  function mover(e, ev, asiento, delta, causa) {
    const s = e.asientos[asiento];
    const desde = s.pos, hasta = clamp(desde + delta, -1, META);
    s.pos = hasta;
    if (hasta !== desde) ev.push({ t: 'mover', asiento: asiento, desde: desde, hasta: hasta, causa: causa });
  }

  function pedirPregunta(e, ev, asiento, tipo, ctx) {
    const q = ctx.mazo.sacar();
    e.fase = 'responder';
    e.pendiente = { tipo: tipo, qid: q.id, n: q.opciones.length };
    e.espera = { asiento: asiento, que: 'responder' };
    ev.push({ t: 'pregunta', asiento: asiento, tipo: tipo, qid: q.id });
  }

  function clasificacion(e) {
    return e.asientos.map(function (s, i) {
      return { asiento: i, id: s.id, nombre: s.nombre, color: s.color, pos: s.pos, llego: s.pos >= META };
    }).sort(function (a, b) { return b.pos - a.pos || a.asiento - b.asiento; });   // empate: orden de asiento
  }

  function terminar(e, ev, ganador, motivo) {
    e.fase = 'terminada';
    e.espera = null;
    e.pendiente = null;
    e.dado = null;
    e.ganador = ganador;
    e.motivoFin = motivo;
    ev.push({ t: 'fin', ganador: ganador, motivo: motivo, clasificacion: clasificacion(e) });
  }

  function siguienteTurno(e, ev) {
    e.turno = (e.turno + 1) % e.asientos.length;
    e.fase = 'tirar';
    e.dado = null;
    e.pendiente = null;
    e.espera = { asiento: e.turno, que: 'tirar' };
    ev.push({ t: 'turno', asiento: e.turno });
  }

  const cerrar = function (e, ev) { e.v += 1; return { estado: e, eventos: ev }; };

  function chequeaCtx(ctx, necesitaRng) {
    if (!ctx || !ctx.mazo || (necesitaRng && typeof ctx.rng !== 'function')) {
      throw new Error('act() necesita ctx { rng, mazo }');
    }
  }

  /* ---------- acciones ---------- */
  function tirar(estado, asiento, ctx) {
    chequeaCtx(ctx, true);
    const e = clonar(estado), ev = [];
    const valor = 1 + Math.floor(ctx.rng() * 6);
    e.dado = valor;
    ev.push({ t: 'dado', asiento: asiento, valor: valor });
    pedirPregunta(e, ev, asiento, 'turno', ctx);
    return cerrar(e, ev);
  }

  function responder(estado, asiento, eleccion, ctx) {
    chequeaCtx(ctx, false);
    const e = clonar(estado), ev = [];
    const p = e.pendiente;
    const correcto = !!ctx.mazo.esCorrecta(p.qid, eleccion);
    ev.push({ t: 'respondida', asiento: asiento, qid: p.qid, eleccion: eleccion, correcto: correcto, correcta: ctx.mazo.correcta(p.qid) });
    e.pendiente = null;

    if (p.tipo === 'turno') {
      if (correcto) {
        const total = e.dado + e.extra;
        e.extra = 0;
        mover(e, ev, asiento, total, 'dado');
        const esp = especialEn(asiento, e.asientos[asiento].pos);
        if (esp === 'avance') {
          ev.push({ t: 'especial', asiento: asiento, tipo: 'avance' });
          mover(e, ev, asiento, 2, 'avance');
        } else if (esp === 'retroceso') {
          ev.push({ t: 'especial', asiento: asiento, tipo: 'retroceso' });
          if (e.asientos[asiento].pos > 1) mover(e, ev, asiento, -2, 'retroceso');
        } else if (esp === 'reto') {
          ev.push({ t: 'especial', asiento: asiento, tipo: 'reto' });
          pedirPregunta(e, ev, asiento, 'reto', ctx);     // el turno sigue: pregunta extra
          return cerrar(e, ev);
        }
        if (e.asientos[asiento].pos >= META) { terminar(e, ev, asiento, 'meta'); return cerrar(e, ev); }
      }
      /* fallar: no avanza (la racha vive en el perfil del cliente) */
      siguienteTurno(e, ev);
      return cerrar(e, ev);
    }

    /* p.tipo === 'reto' */
    if (correcto) mover(e, ev, asiento, 2, 'reto');
    if (e.asientos[asiento].pos >= META) { terminar(e, ev, asiento, 'meta'); return cerrar(e, ev); }
    siguienteTurno(e, ev);
    return cerrar(e, ev);
  }

  /* act(estado, asiento, accion, ctx) -> { estado, eventos } | { error:{codigo,mensaje} }
   * acciones: { tipo:'tirar' } | { tipo:'responder', eleccion:0..n-1 } */
  function act(estado, asiento, accion, ctx) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    if (!estado.espera || estado.espera.asiento !== asiento) return fallo('NO_ES_TU_TURNO', 'No es tu turno');
    if (!accion || typeof accion.tipo !== 'string') return fallo('ACCION_DESCONOCIDA', 'Acción inválida');
    if (accion.tipo === 'tirar') {
      if (estado.fase !== 'tirar') return fallo('FASE_INCORRECTA', 'Ahora toca responder');
      return tirar(estado, asiento, ctx);
    }
    if (accion.tipo === 'responder') {
      if (estado.fase !== 'responder') return fallo('FASE_INCORRECTA', 'Ahora toca tirar el dado');
      const n = estado.pendiente.n, el = accion.eleccion;
      if (typeof el !== 'number' || !Number.isInteger(el) || el < 0 || el >= n) return fallo('ELECCION_INVALIDA', 'Opción fuera de rango');
      return responder(estado, asiento, el, ctx);
    }
    return fallo('ACCION_DESCONOCIDA', 'Acción desconocida: ' + accion.tipo);
  }

  /* Acciones válidas ahora mismo para ese asiento (validación, bots, tests). */
  function accionesLegales(estado, asiento) {
    if (estado.fase === 'terminada' || !estado.espera || estado.espera.asiento !== asiento) return [];
    if (estado.fase === 'tirar') return [{ tipo: 'tirar' }];
    const out = [];
    for (let i = 0; i < estado.pendiente.n; i++) out.push({ tipo: 'responder', eleccion: i });
    return out;
  }

  /* Turno vencido o jugador ausente: pasa el turno sin penalizar (no cuenta como respuesta). */
  function saltar(estado, motivo) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    const e = clonar(estado), ev = [];
    ev.push({ t: 'turno-saltado', asiento: e.espera.asiento, motivo: motivo || 'tiempo' });
    siguienteTurno(e, ev);
    return cerrar(e, ev);
  }

  /* Se acabó el tiempo de la partida: gana el más adelantado (empate: menor asiento). */
  function terminarPorTiempo(estado) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    const e = clonar(estado), ev = [];
    terminar(e, ev, clasificacion(e)[0].asiento, 'tiempo');
    return cerrar(e, ev);
  }

  /* Estado para un cliente: sin ids de pregunta. asiento = null para el docente. */
  function view(estado, asiento) {
    const v = clonar(estado);
    if (v.pendiente) delete v.pendiente.qid;
    v.yo = (asiento === undefined ? null : asiento);
    return v;
  }

  return {
    id: 'ludo', min: MIN, max: MAX, ajustesPorDefecto: {},
    TABLERO: TABLERO, COLORES: COLORES,
    create: create, act: act, accionesLegales: accionesLegales,
    saltar: saltar, terminarPorTiempo: terminarPorTiempo, view: view,
    celdaDe: celdaDe, especialEn: especialEn, clasificacion: clasificacion
  };
});
