/* ============================================================
 * LudoApp shared/conquista-rules.js
 * REGLAS PURAS de Conquista de Territorios (sin DOM, sin red, sin azar propio).
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.App = root.App || {};
    root.App.rules = root.App.rules || {};
    root.App.rules.conquista = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ID = 'conquista';
  const MIN = 2;
  const MAX = 4;

  function clonar(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function fallo(codigo, mensaje) {
    return { error: { codigo: codigo, mensaje: mensaje || codigo } };
  }

  function crearAsientos(asientos) {
    if (!Array.isArray(asientos) || asientos.length < MIN || asientos.length > MAX) {
      throw new Error('Conquista admite de ' + MIN + ' a ' + MAX + ' jugadores');
    }
    return asientos.map(function (s, i) {
      return {
        id: s.id || ('s' + i),
        nombre: s.nombre || ('Jugador ' + (i + 1)),
        avatar: s.avatar,
        color: ['rojo', 'verde', 'azul', 'amarillo'][i % 4],
        zonas: 0
      };
    });
  }

  function clasificacion(e) {
    return e.asientos.map(function (s, i) {
      return { asiento: i, id: s.id, nombre: s.nombre, color: s.color, zonas: s.zonas || 0 };
    }).sort(function (a, b) {
      if ((b.zonas || 0) !== (a.zonas || 0)) return (b.zonas || 0) - (a.zonas || 0);
      return a.asiento - b.asiento;
    });
  }

  function terminar(e, ev, ganador, motivo) {
    e.fase = 'terminada';
    e.ganador = ganador;
    e.motivoFin = motivo;
    e.espera = null;
    e.pendiente = null;
    var cla = clasificacion(e);
    ev.push({ t: 'fin', ganador: ganador, motivo: motivo, clasificacion: cla });
  }

  function cerrar(e, ev) {
    e.v = (e.v || 0) + 1;
    return { estado: e, eventos: ev };
  }

  function legalTargets(e, pi) {
    var owned = [];
    for (var i = 0; i < e.zonas.length; i++) {
      if (e.zonas[i].owner === pi) owned.push(e.zonas[i]);
    }
    var ok = [];
    for (var z = 0; z < e.zonas.length; z++) {
      if (e.zonas[z].owner === pi) continue;
      for (var o = 0; o < owned.length; o++) {
        if (Math.abs(owned[o].r - e.zonas[z].r) + Math.abs(owned[o].c - e.zonas[z].c) === 1) {
          ok.push(z);
          break;
        }
      }
    }
    return ok;
  }

  function siguienteTurno(e, ev, fromIdx) {
    if (e.fase === 'terminada') return;
    var next = ((fromIdx !== undefined ? fromIdx : e.turno) + 1) % e.asientos.length;
    e.turno = next;
    e.fase = 'elegir';
    e.espera = { asiento: next, que: 'elegir-zona' };
    e.pendiente = null;
    e.target = null;
    e.atacante = null;
    ev.push({ t: 'turno', asiento: next });
  }

  function create(opts) {
    opts = opts || {};
    var asientos = crearAsientos(opts.asientos);
    var ajustes = opts.ajustes || {};
    var ROWS = ajustes.rows || ajustes.filas || 8;
    var COLS = ajustes.cols || ajustes.columnas || 8;
    ROWS = Math.max(4, Math.min(12, ROWS | 0));
    COLS = Math.max(4, Math.min(12, COLS | 0));
    var TOTAL = ROWS * COLS;
    var MAJORITY = Math.floor(TOTAL / 2) + 1;
    var baseCells = [[0, 0], [0, COLS - 1], [ROWS - 1, COLS - 1], [ROWS - 1, 0]];
    var zonas = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        zonas.push({ r: r, c: c, owner: null });
      }
    }
    asientos.forEach(function (_, pi) {
      var bc = baseCells[pi % baseCells.length];
      if (bc[0] >= 0 && bc[0] < ROWS && bc[1] >= 0 && bc[1] < COLS) {
        zonas[bc[0] * COLS + bc[1]].owner = pi;
      }
    });
    var e = {
      juego: ID,
      v: 0,
      fase: 'elegir',
      turno: 0,
      ganador: null,
      motivoFin: null,
      espera: { asiento: 0, que: 'elegir-zona' },
      asientos: asientos,
      rows: ROWS,
      cols: COLS,
      total: TOTAL,
      majority: MAJORITY,
      zonas: zonas,
      target: null,
      atacante: null,
      pendiente: null
    };
    return e;
  }

  function accionesLegales(estado, asiento) {
    if (estado.fase === 'terminada') return [];
    if (!estado.espera || estado.espera.asiento !== asiento) return [];
    if (estado.fase === 'elegir') {
      var legales = legalTargets(estado, asiento);
      var res = [];
      for (var i = 0; i < legales.length; i++) res.push({ tipo: 'elegir', zona: legales[i] });
      return res;
    }
    if (estado.fase === 'responder') {
      var res2 = [];
      for (var j = 0; j < 4; j++) res2.push({ tipo: 'responder', eleccion: j });
      return res2;
    }
    return [];
  }

  function act(estado, asiento, accion, ctx) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    if (!estado.espera || estado.espera.asiento !== asiento) return fallo('NO_ES_TU_TURNO', 'No es tu turno');
    if (!accion || typeof accion !== 'object') return fallo('ACCION_DESCONOCIDA', 'Acción desconocida');
    var tipo = accion.tipo;
    ctx = ctx || {};
    var rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
    var mazo = ctx.mazo;

    var e = clonar(estado);
    var ev = [];

    if (e.fase === 'elegir' && tipo === 'elegir') {
      var zona = accion.zona !== undefined ? accion.zona : accion.idx;
      if (typeof zona !== 'number' || zona < 0 || zona >= e.zonas.length) return fallo('ZONA_INVALIDA', 'Zona inválida');
      if (e.zonas[zona].owner === asiento) return fallo('ZONA_PROPIA', 'No puedes atacar tu propia zona');
      var legal = legalTargets(e, asiento);
      var esLegal = false;
      for (var li = 0; li < legal.length; li++) if (legal[li] === zona) { esLegal = true; break; }
      if (!esLegal) return fallo('ZONA_NO_ADYACENTE', 'Debes elegir una zona adyacente a las tuyas');
      if (!mazo || typeof mazo.sacar !== 'function') return fallo('SIN_MAZO', 'No hay mazo de preguntas');
      e.target = zona;
      e.atacante = asiento;
      e.pendiente = { qid: mazo.sacar().id, tipo: 'turno' };
      e.fase = 'responder';
      e.espera = { asiento: asiento, que: 'responder' };
      ev.push({ t: 'zona-elegida', asiento: asiento, zona: zona });
      ev.push({ t: 'pregunta', asiento: asiento });
      return cerrar(e, ev);
    }

    if (e.fase === 'responder' && tipo === 'responder') {
      var el = accion.eleccion;
      if (typeof el !== 'number' || el < 0 || el > 3 || el % 1 !== 0) return fallo('ELECCION_INVALIDA', 'Elección inválida');
      if (!e.pendiente || !mazo) return fallo('SIN_PREGUNTA', 'No hay pregunta pendiente');
      var correcto = typeof mazo.esCorrecta === 'function' ? mazo.esCorrecta(e.pendiente.qid, el) : false;
      ev.push({ t: 'respondida', asiento: asiento, qid: e.pendiente.qid, correcto: correcto, correcta: typeof mazo.correcta === 'function' ? mazo.correcta(e.pendiente.qid) : undefined });
      
      if (e.pendiente.tipo === 'defensa') {
        var defensor = asiento;
        var atacante = e.atacante;
        if (correcto) {
          ev.push({ t: 'zona-defendida', asiento: defensor, zona: e.target });
          e.pendiente = null;
          siguienteTurno(e, ev, atacante);
          return cerrar(e, ev);
        } else {
          // defensa fallida -> atacante conquista
          var zDef = e.target;
          var oldOwner = e.zonas[zDef].owner;
          e.zonas[zDef].owner = atacante;
          e.asientos[atacante].zonas = (e.asientos[atacante].zonas || 0) + 1;
          ev.push({ t: 'zona-conquistada', asiento: atacante, zona: zDef, de: oldOwner });
          if ((e.asientos[atacante].zonas || 0) >= e.majority) {
            terminar(e, ev, atacante, 'mayoria');
            return cerrar(e, ev);
          }
          e.pendiente = null;
          siguienteTurno(e, ev, atacante);
          return cerrar(e, ev);
        }
      } else {
        // respuesta del atacante
        if (!correcto) {
          e.pendiente = null;
          e.target = null;
          e.atacante = null;
          siguienteTurno(e, ev, asiento);
          return cerrar(e, ev);
        }
        // acierto atacante
        var zAtk = e.target;
        if (e.zonas[zAtk].owner === null) {
          e.zonas[zAtk].owner = asiento;
          e.asientos[asiento].zonas = (e.asientos[asiento].zonas || 0) + 1;
          ev.push({ t: 'zona-conquistada', asiento: asiento, zona: zAtk, de: null });
          if ((e.asientos[asiento].zonas || 0) >= e.majority) {
            terminar(e, ev, asiento, 'mayoria');
            return cerrar(e, ev);
          }
          e.pendiente = null;
          e.target = null;
          e.atacante = null;
          siguienteTurno(e, ev, asiento);
          return cerrar(e, ev);
        } else {
          // hay defensor
          var defensorAsiento = e.zonas[zAtk].owner;
          ev.push({ t: 'defensa', asiento: defensorAsiento });
          if (!mazo || typeof mazo.sacar !== 'function') return fallo('SIN_MAZO', 'No hay mazo de preguntas');
          e.pendiente = { qid: mazo.sacar().id, tipo: 'defensa' };
          e.fase = 'responder';
          e.espera = { asiento: defensorAsiento, que: 'responder' };
          ev.push({ t: 'pregunta', asiento: defensorAsiento });
          return cerrar(e, ev);
        }
      }
    }

    return fallo('FASE_INCORRECTA', 'Acción no válida en esta fase');
  }

  function saltar(estado, motivo) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    var e = clonar(estado), ev = [];
    var quien = e.espera ? e.espera.asiento : e.turno;
    ev.push({ t: 'turno-saltado', asiento: quien, motivo: motivo || 'tiempo' });
    if (e.fase === 'responder' && e.pendiente && e.pendiente.tipo === 'defensa') {
      // defensor ausente/tiempo vencido = defensa fallida
      var atacante = e.atacante;
      var zDef = e.target;
      var oldOwner = e.zonas[zDef].owner;
      e.zonas[zDef].owner = atacante;
      e.asientos[atacante].zonas = (e.asientos[atacante].zonas || 0) + 1;
      ev.push({ t: 'zona-conquistada', asiento: atacante, zona: zDef, de: oldOwner });
      if ((e.asientos[atacante].zonas || 0) >= e.majority) {
        terminar(e, ev, atacante, 'mayoria');
        return cerrar(e, ev);
      }
      e.pendiente = null;
      siguienteTurno(e, ev, atacante);
      return cerrar(e, ev);
    } else if (e.fase === 'responder') {
      // atacante no responde / se salta
      e.pendiente = null;
      e.target = null;
      e.atacante = null;
      siguienteTurno(e, ev, quien);
      return cerrar(e, ev);
    } else {
      e.pendiente = null;
      siguienteTurno(e, ev, quien);
      return cerrar(e, ev);
    }
  }

  function terminarPorTiempo(estado) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    var e = clonar(estado), ev = [];
    var cla = clasificacion(e);
    terminar(e, ev, cla[0].asiento, 'tiempo');
    return cerrar(e, ev);
  }

  function view(estado, asiento) {
    var e = clonar(estado);
    var v = {
      juego: e.juego,
      v: e.v,
      fase: e.fase,
      turno: e.turno,
      ganador: e.ganador,
      motivoFin: e.motivoFin,
      espera: e.espera ? { asiento: e.espera.asiento, que: e.espera.que } : null,
      rows: e.rows,
      cols: e.cols,
      total: e.total,
      majority: e.majority,
      zonas: e.zonas,
      asientos: e.asientos.map(function (s, i) {
        return { id: s.id, nombre: s.nombre, avatar: s.avatar, color: s.color, zonas: s.zonas || 0 };
      }),
      yo: asiento == null ? null : asiento
    };
    if (e.pendiente && e.espera && (asiento == null || e.espera.asiento === asiento)) {
      v.pendiente = { tipo: e.pendiente.tipo, n: 4 };
    } else if (e.pendiente && asiento == null) {
      v.pendiente = { tipo: e.pendiente.tipo, n: 4 };
    } else {
      v.pendiente = null;
    }
    return v;
  }

  return {
    id: ID,
    min: MIN,
    max: MAX,
    ajustesPorDefecto: { rows: 8, cols: 8 },
    COLORES: ['rojo', 'verde', 'azul', 'amarillo'],
    create: create,
    act: act,
    accionesLegales: accionesLegales,
    saltar: saltar,
    terminarPorTiempo: terminarPorTiempo,
    view: view
  };
}));
