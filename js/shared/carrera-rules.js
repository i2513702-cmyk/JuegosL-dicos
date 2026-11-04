/* ============================================================
 * LudoApp shared/carrera-rules.js
 * REGLAS PURAS de Carrera de Preguntas (sin DOM, sin red, sin azar propio).
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.App = root.App || {};
    root.App.rules = root.App.rules || {};
    root.App.rules.carrera = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ID = 'carrera';
  const MIN = 2;
  const MAX = 4;

  const OBSTACLES = [6, 9, 13];

  function clonar(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function fallo(codigo, mensaje) {
    return { error: { codigo: codigo, mensaje: mensaje || codigo } };
  }

  function crearAsientos(asientos) {
    if (!Array.isArray(asientos) || asientos.length < MIN || asientos.length > MAX) {
      throw new Error('Carrera admite de ' + MIN + ' a ' + MAX + ' jugadores');
    }
    return asientos.map(function (s, i) {
      return {
        id: s.id || ('s' + i),
        nombre: s.nombre || ('Jugador ' + (i + 1)),
        avatar: s.avatar,
        color: ['rojo', 'verde', 'azul', 'amarillo'][i % 4],
        pos: 0,
        streak: 0,
        finished: false
      };
    });
  }

  function clasificacion(e) {
    return e.asientos.map(function (s, i) {
      return { asiento: i, id: s.id, nombre: s.nombre, color: s.color, pos: s.pos, finished: s.finished };
    }).sort(function (a, b) {
      if (b.pos !== a.pos) return b.pos - a.pos;
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

  function siguienteTurno(e, ev) {
    if (e.fase === 'terminada') return;
    for (var i = 0; i < e.asientos.length; i++) {
      var idx = (e.turno + 1 + i) % e.asientos.length;
      // in normal turn-based, just rotate
    }
    e.turno = (e.turno + 1) % e.asientos.length;
    e.fase = 'avanzar';
    e.espera = { asiento: e.turno, que: 'avanzar' };
    e.pendiente = null;
    e.extra = 0;
    ev.push({ t: 'turno', asiento: e.turno });
  }

  function create(opts) {
    opts = opts || {};
    var asientos = crearAsientos(opts.asientos);
    var ajustes = opts.ajustes || {};
    var trackLength = ajustes.trackLength || ajustes.longitud || 14;
    trackLength = Math.max(5, Math.min(50, trackLength | 0));
    var e = {
      juego: ID,
      v: 0,
      fase: 'avanzar',
      turno: 0,
      ganador: null,
      motivoFin: null,
      espera: { asiento: 0, que: 'avanzar' },
      asientos: asientos,
      trackLength: trackLength,
      extra: 0,
      pendiente: null
    };
    return e;
  }

  function accionesLegales(estado, asiento) {
    if (estado.fase === 'terminada') return [];
    if (!estado.espera || estado.espera.asiento !== asiento) return [];
    if (estado.fase === 'avanzar') return [{ tipo: 'avanzar' }];
    if (estado.fase === 'responder') {
      var p = estado.pendiente;
      if (!p) return [];
      var res = [];
      for (var i = 0; i < 4; i++) res.push({ tipo: 'responder', eleccion: i });
      return res;
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

    if (e.fase === 'avanzar' && tipo === 'avanzar') {
      if (!mazo || typeof mazo.sacar !== 'function') return fallo('SIN_MAZO', 'No hay mazo de preguntas');
      var q = mazo.sacar();
      e.pendiente = { qid: q.id, tipo: 'turno' };
      e.fase = 'responder';
      e.espera = { asiento: asiento, que: 'responder' };
      ev.push({ t: 'pregunta', asiento: asiento });
      return cerrar(e, ev);
    }

    if (e.fase === 'responder' && tipo === 'responder') {
      var el = accion.eleccion;
      if (typeof el !== 'number' || el < 0 || el > 3 || el % 1 !== 0) return fallo('ELECCION_INVALIDA', 'Elección inválida');
      if (!e.pendiente || !mazo) return fallo('SIN_PREGUNTA', 'No hay pregunta pendiente');
      var correcto = typeof mazo.esCorrecta === 'function' ? mazo.esCorrecta(e.pendiente.qid, el) : false;
      ev.push({ t: 'respondida', asiento: asiento, qid: e.pendiente.qid, correcto: correcto, correcta: typeof mazo.correcta === 'function' ? mazo.correcta(e.pendiente.qid) : undefined });
      var p = e.asientos[asiento];
      if (correcto) {
        p.streak = (p.streak || 0) + 1;
        var steps = 1 + (p.streak >= 2 ? 1 : 0) + (p.streak >= 4 ? 1 : 0);
        if (e.extra) { steps += e.extra; e.extra = 0; }
        var from = p.pos;
        var to = p.pos + steps;
        if (to > e.trackLength) to = e.trackLength;
        p.pos = to;
        ev.push({ t: 'mover', asiento: asiento, desde: from, hasta: to, pasos: steps, causa: p.streak >= 2 ? 'racha' : 'acierto' });
        if (p.pos >= e.trackLength) {
          p.finished = true;
          ev.push({ t: 'meta', asiento: asiento });
          terminar(e, ev, asiento, 'meta');
          return cerrar(e, ev);
        }
        if (OBSTACLES.indexOf(p.pos) !== -1) {
          var from2 = p.pos;
          var to2 = Math.max(0, p.pos - 2);
          p.pos = to2;
          ev.push({ t: 'mover', asiento: asiento, desde: from2, hasta: to2, pasos: -2, causa: 'obstaculo' });
        }
        e.pendiente = null;
        siguienteTurno(e, ev);
        return cerrar(e, ev);
      } else {
        p.streak = 0;
        var fall = 1 + Math.floor(rng() * 2);
        var ffrom = p.pos;
        var fto = Math.max(0, p.pos - fall);
        p.pos = fto;
        ev.push({ t: 'mover', asiento: asiento, desde: ffrom, hasta: fto, pasos: -fall, causa: 'resbalon' });
        e.pendiente = null;
        siguienteTurno(e, ev);
        return cerrar(e, ev);
      }
    }

    return fallo('FASE_INCORRECTA', 'Acción no válida en esta fase');
  }

  function saltar(estado, motivo) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    var e = clonar(estado), ev = [];
    ev.push({ t: 'turno-saltado', asiento: e.espera ? e.espera.asiento : e.turno, motivo: motivo || 'tiempo' });
    if (e.fase === 'responder') {
      e.pendiente = null;
    }
    siguienteTurno(e, ev);
    return cerrar(e, ev);
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
      trackLength: e.trackLength,
      asientos: e.asientos.map(function (s, i) {
        return { id: s.id, nombre: s.nombre, avatar: s.avatar, color: s.color, pos: s.pos, finished: s.finished, streak: s.streak };
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
    ajustesPorDefecto: { trackLength: 14 },
    create: create,
    act: act,
    accionesLegales: accionesLegales,
    saltar: saltar,
    terminarPorTiempo: terminarPorTiempo,
    view: view
  };
}));
