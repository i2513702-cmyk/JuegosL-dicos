/* ============================================================
 * LudoApp shared/batalla-rules.js
 * REGLAS PURAS de Batalla de Preguntas (sin DOM, sin red, sin azar propio).
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.App = root.App || {};
    root.App.rules = root.App.rules || {};
    root.App.rules.batalla = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ID = 'batalla';
  const MIN = 2;
  const MAX = 4;
  const BASE_DMG = { dif_facil: 12, dif_media: 16, dif_dificil: 22 };

  function clonar(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function fallo(codigo, mensaje) {
    return { error: { codigo: codigo, mensaje: mensaje || codigo } };
  }

  function crearAsientos(asientos) {
    if (!Array.isArray(asientos) || asientos.length < MIN || asientos.length > MAX) {
      throw new Error('Batalla admite de ' + MIN + ' a ' + MAX + ' jugadores');
    }
    return asientos.map(function (s, i) {
      return {
        id: s.id || ('s' + i),
        nombre: s.nombre || ('Jugador ' + (i + 1)),
        avatar: s.avatar,
        equipo: i % 2
      };
    });
  }

  function cerrar(e, ev) {
    e.v = (e.v || 0) + 1;
    return { estado: e, eventos: ev };
  }

  function terminar(e, ev, ganadorEquipo, motivo) {
    e.fase = 'terminada';
    e.ganador = ganadorEquipo;
    e.motivoFin = motivo;
    e.espera = null;
    e.pendiente = null;
    ev.push({ t: 'fin', ganador: ganadorEquipo, motivo: motivo });
  }

  function create(opts) {
    opts = opts || {};
    var asientos = crearAsientos(opts.asientos);
    var ajustes = opts.ajustes || {};
    var HP = ajustes.hpTotal || 100;
    var equipos = [[], []];
    for (var i = 0; i < asientos.length; i++) {
      equipos[asientos[i].equipo].push(i);
    }
    var equipoHp = [equipos[0].length * HP, equipos[1].length * HP];
    var equipoShield = [0, 0];
    var port = equipos[0] && equipos[0][0] !== undefined ? equipos[0][0] : 0;
    var e = {
      juego: ID,
      v: 0,
      fase: 'preguntar',
      turno: 0, // equipo en turno
      portavoz: port,
      ganador: null,
      motivoFin: null,
      espera: { asiento: port, que: 'responder' },
      asientos: asientos,
      equipos: equipos,
      equipoHp: equipoHp,
      equipoShield: equipoShield,
      hpTotal: HP,
      maxHpPorMiembro: HP,
      streak: [0, 0],
      doubleReady: [false, false],
      pendiente: null,
      ultimaRespuesta: null
    };
    return e;
  }

  function accionesLegales(estado, asiento) {
    if (estado.fase === 'terminada') return [];
    if (!estado.espera || estado.espera.asiento !== asiento) return [];
    if (estado.fase === 'preguntar' || estado.fase === 'responder') {
      var res = [];
      for (var j = 0; j < 4; j++) res.push({ tipo: 'responder', eleccion: j });
      return res;
    }
    if (estado.fase === 'accion') {
      return [{ tipo: 'atacar' }, { tipo: 'defender' }];
    }
    return [];
  }

  function act(estado, asiento, accion, ctx) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    if (!estado.espera || estado.espera.asiento !== asiento) return fallo('NO_ES_TU_TURNO', 'No es tu turno');
    if (!accion || typeof accion !== 'object') return fallo('ACCION_DESCONOCIDA', 'Acción desconocida');
    var tipo = accion.tipo;
    ctx = ctx || {};
    var mazo = ctx.mazo;

    var e = clonar(estado);
    var ev = [];

    if ((e.fase === 'preguntar' || e.fase === 'responder') && tipo === 'responder') {
      var el = accion.eleccion;
      if (typeof el !== 'number' || el < 0 || el > 3 || el % 1 !== 0) return fallo('ELECCION_INVALIDA', 'Elección inválida');
      if (!e.pendiente) {
        if (!mazo || typeof mazo.sacar !== 'function') return fallo('SIN_PREGUNTA', 'No hay pregunta pendiente');
        e.pendiente = { qid: mazo.sacar().id, tipo: 'turno' };
        e.fase = e.fase === 'preguntar' ? 'responder' : e.fase;
      }
      if (!mazo) return fallo('SIN_PREGUNTA', 'No hay pregunta pendiente');
      var correcto = typeof mazo.esCorrecta === 'function' ? mazo.esCorrecta(e.pendiente.qid, el) : false;
      ev.push({ t: 'respondida', asiento: asiento, qid: e.pendiente.qid, correcto: correcto, correcta: typeof mazo.correcta === 'function' ? mazo.correcta(e.pendiente.qid) : undefined });
      var equipo = e.turno;
      if (!correcto) {
        e.streak[equipo] = 0;
        e.pendiente = null;
        e.ultimaRespuesta = { correcto: false };
        // pasa turno al otro equipo
        var nextEq = 1 - equipo;
        e.turno = nextEq;
        e.fase = 'preguntar';
        var miembros = e.equipos[nextEq];
        e.portavoz = miembros[0] !== undefined ? miembros[0] : (equipos && equipos[0] ? equipos[0] : 0); // simplified
        e.portavoz = e.equipos[nextEq][0];
        e.espera = { asiento: e.portavoz, que: 'responder' };
        if (!mazo || typeof mazo.sacar !== 'function') return fallo('SIN_MAZO', 'No hay mazo de preguntas');
        e.pendiente = { qid: mazo.sacar().id, tipo: 'turno' };
        ev.push({ t: 'pregunta', asiento: e.portavoz });
        ev.push({ t: 'turno', equipo: nextEq, portavoz: e.portavoz });
        return cerrar(e, ev);
      } else {
        // acierto
        e.streak[equipo] = Math.min(5, (e.streak[equipo] || 0) + 1);
        e.pendiente = null;
        e.ultimaRespuesta = { correcto: true };
        e.fase = 'accion';
        e.espera = { asiento: asiento, que: 'accion' };
        ev.push({ t: 'acierto', equipo: equipo, streak: e.streak[equipo] });
        return cerrar(e, ev);
      }
    }

    if (e.fase === 'accion' && (tipo === 'atacar' || tipo === 'defender')) {
      var eq = e.turno;
      if (tipo === 'defender') {
        e.equipoShield[eq] = 1;
        ev.push({ t: 'defiende', equipo: eq });
        // pasa turno
        var nextEq2 = 1 - eq;
        e.turno = nextEq2;
        e.fase = 'preguntar';
        e.portavoz = e.equipos[nextEq2][0];
        e.espera = { asiento: e.portavoz, que: 'responder' };
        if (!mazo || typeof mazo.sacar !== 'function') return fallo('SIN_MAZO', 'No hay mazo de preguntas');
        e.pendiente = { qid: mazo.sacar().id, tipo: 'turno' };
        ev.push({ t: 'pregunta', asiento: e.portavoz });
        ev.push({ t: 'turno', equipo: nextEq2, portavoz: e.portavoz });
        return cerrar(e, ev);
      } else if (tipo === 'atacar') {
        var rv = 1 - eq;
        var dmgBase = BASE_DMG.dif_media;
        var bonus = Math.min(e.streak[eq] || 0, 5) * 2;
        var dmg = dmgBase + bonus;
        if (e.doubleReady && e.doubleReady[eq]) { dmg = dmg * 2; e.doubleReady[eq] = false; }
        if (e.equipoShield[rv] > 0) {
          e.equipoShield[rv] = 0;
          ev.push({ t: 'bloqueado', equipo: rv });
        } else {
          e.equipoHp[rv] = Math.max(0, (e.equipoHp[rv] || 0) - dmg);
          ev.push({ t: 'dano', equipo: rv, cantidad: dmg });
        }
        if ((e.equipoHp[rv] || 0) <= 0) {
          terminar(e, ev, eq, 'eliminado');
          return cerrar(e, ev);
        }
        var nextEq3 = 1 - eq;
        e.turno = nextEq3;
        e.fase = 'preguntar';
        e.portavoz = e.equipos[nextEq3][0];
        e.espera = { asiento: e.portavoz, que: 'responder' };
        if (!mazo || typeof mazo.sacar !== 'function') return fallo('SIN_MAZO', 'No hay mazo de preguntas');
        e.pendiente = { qid: mazo.sacar().id, tipo: 'turno' };
        ev.push({ t: 'pregunta', asiento: e.portavoz });
        ev.push({ t: 'turno', equipo: nextEq3, portavoz: e.portavoz });
        return cerrar(e, ev);
      }
    }

    return fallo('FASE_INCORRECTA', 'Acción no válida en esta fase');
  }

  function saltar(estado, motivo) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    var e = clonar(estado), ev = [];
    var quien = e.espera ? e.espera.asiento : (e.portavoz || 0);
    ev.push({ t: 'turno-saltado', asiento: quien, motivo: motivo || 'tiempo' });
    if (e.fase === 'preguntar' || e.fase === 'responder') {
      e.streak[e.turno] = 0;
      e.pendiente = null;
      var nextEq = 1 - e.turno;
      e.turno = nextEq;
      e.fase = 'preguntar';
      e.portavoz = e.equipos[nextEq][0];
      e.espera = { asiento: e.portavoz, que: 'responder' };
      // need mazo? saltar might be called without mazo context; but in normal flow server provides
      ev.push({ t: 'turno', equipo: nextEq, portavoz: e.portavoz });
      return cerrar(e, ev);
    } else if (e.fase === 'accion') {
      var nextEq2 = 1 - e.turno;
      e.turno = nextEq2;
      e.fase = 'preguntar';
      e.portavoz = e.equipos[nextEq2][0];
      e.espera = { asiento: e.portavoz, que: 'responder' };
      ev.push({ t: 'turno', equipo: nextEq2, portavoz: e.portavoz });
      return cerrar(e, ev);
    } else {
      var nextEq3 = 1 - e.turno;
      e.turno = nextEq3;
      e.fase = 'preguntar';
      if (e.equipos && e.equipos[nextEq3] && e.equipos[nextEq3][0] !== undefined) {
        e.portavoz = e.equipos[nextEq3][0];
        e.espera = { asiento: e.portavoz, que: 'responder' };
      }
      return cerrar(e, ev);
    }
  }

  function terminarPorTiempo(estado) {
    if (estado.fase === 'terminada') return fallo('PARTIDA_TERMINADA', 'La partida ya terminó');
    var e = clonar(estado), ev = [];
    if ((e.equipoHp[0] || 0) > (e.equipoHp[1] || 0)) {
      terminar(e, ev, 0, 'tiempo');
    } else if ((e.equipoHp[1] || 0) > (e.equipoHp[0] || 0)) {
      terminar(e, ev, 1, 'tiempo');
    } else {
      terminar(e, ev, e.turno, 'tiempo');
    }
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
      asientos: e.asientos.map(function (s) {
        return { id: s.id, nombre: s.nombre, avatar: s.avatar, equipo: s.equipo };
      }),
      equipos: e.equipos,
      equipoHp: e.equipoHp,
      equipoShield: e.equipoShield,
      hpTotal: e.hpTotal,
      streak: e.streak,
      doubleReady: e.doubleReady,
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
    ajustesPorDefecto: { hpTotal: 100 },
    COLORES: ['rojo', 'azul'],
    create: create,
    act: act,
    accionesLegales: accionesLegales,
    saltar: saltar,
    terminarPorTiempo: terminarPorTiempo,
    view: view
  };
}));
