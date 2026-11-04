/* Tests de js/shared/ludo-rules.js (Node >= 18, sin dependencias, sin navegador).
 *   node tests/ludo_rules.test.js
 * Fijan el comportamiento actual de js/games/ludo.js (camino "una ficha por jugador"). */
const test = require('node:test');
const assert = require('node:assert/strict');
const Ludo = require('../js/shared/ludo-rules.js');

/* ---------- ayudas ---------- */
const asientos = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, nombre: 'Jugador ' + i }));
const nuevo = (n) => Ludo.create({ asientos: asientos(n || 2) });
const conPos = (e, ...pos) => { const c = JSON.parse(JSON.stringify(e)); pos.forEach((p, i) => { c.asientos[i].pos = p; }); return c; };

/* rng que produce exactamente estos dados, en orden */
function rngDados(dados) {
  let i = 0;
  return () => { const d = dados[i++]; if (d === undefined) throw new Error('rngDados: se acabaron los dados'); return (d - 1) / 6 + 0.01; };
}

/* mazo guionado: cada pregunta sacada tiene la correcta indicada (4 opciones) */
function mazoGuion(correctas) {
  let i = 0; const mapa = {};
  return {
    sacar() {
      const c = correctas[i]; if (c === undefined) throw new Error('mazoGuion: se acabaron las preguntas');
      const id = 'q' + (i++); mapa[id] = c;
      return { id, opciones: ['a', 'b', 'c', 'd'] };
    },
    esCorrecta: (id, el) => mapa[id] === el,
    correcta: (id) => mapa[id]
  };
}
const ctx = (dados, correctas) => ({ rng: rngDados(dados), mazo: mazoGuion(correctas) });

/* aplica una acción esperando que sea válida */
function ok(estado, asiento, accion, c) {
  const r = Ludo.act(estado, asiento, accion, c);
  assert.equal(r.error, undefined, 'no debía fallar: ' + JSON.stringify(r.error));
  return r;
}
const tipos = (ev) => ev.map((x) => x.t);

/* ---------- tablero ---------- */
test('tablero: 52 casillas únicas y especiales dentro del circuito', () => {
  const T = Ludo.TABLERO;
  assert.equal(T.PATH.length, 52);
  assert.equal(new Set(T.PATH.map((c) => c.join('-'))).size, 52);
  [T.SAFE, T.RETO, T.AVANCE, T.RETRO].forEach((m) => Object.keys(m).forEach((g) => assert.ok(g >= 0 && g < 52)));
});

test('especiales: misma posición relativa para los 4 asientos', () => {
  for (let s = 0; s < 4; s++) {
    assert.equal(Ludo.especialEn(s, 3), 'retroceso');
    assert.equal(Ludo.especialEn(s, 5), 'reto');
    assert.equal(Ludo.especialEn(s, 11), 'avance');
    assert.equal(Ludo.especialEn(s, 0), null);
    assert.equal(Ludo.especialEn(s, -1), null);
    assert.equal(Ludo.especialEn(s, 51), null);   // el pasillo no tiene especiales
  }
});

test('celdaDe: patio, circuito, pasillo y meta', () => {
  assert.deepEqual(Ludo.celdaDe(0, -1, 0), [1, 1]);
  assert.deepEqual(Ludo.celdaDe(2, -1, 3), [13, 13]);
  assert.deepEqual(Ludo.celdaDe(0, 0), [6, 1]);
  assert.deepEqual(Ludo.celdaDe(1, 0), [1, 8]);
  assert.deepEqual(Ludo.celdaDe(0, 51), [7, 1]);
  assert.deepEqual(Ludo.celdaDe(0, 56), [7, 7]);
});

/* ---------- creación ---------- */
test('create: estado inicial', () => {
  const e = nuevo(2);
  assert.equal(e.fase, 'tirar');
  assert.equal(e.turno, 0);
  assert.equal(e.v, 0);
  assert.deepEqual(e.espera, { asiento: 0, que: 'tirar' });
  assert.deepEqual(e.asientos.map((s) => s.color), ['rojo', 'verde']);
  assert.ok(e.asientos.every((s) => s.pos === -1));
  assert.equal(nuevo(4).asientos[3].color, 'amarillo');
});

test('create: rechaza 0 y 5 jugadores', () => {
  assert.throws(() => Ludo.create({ asientos: [] }));
  assert.throws(() => Ludo.create({ asientos: asientos(5) }));
  assert.throws(() => Ludo.create({}));
});

/* ---------- validación ---------- */
test('acción fuera de turno: error y estado intacto', () => {
  const e = nuevo(2), antes = JSON.stringify(e);
  const r = Ludo.act(e, 1, { tipo: 'tirar' }, ctx([3], [0]));
  assert.equal(r.error.codigo, 'NO_ES_TU_TURNO');
  assert.equal(JSON.stringify(e), antes);
});

test('responder en fase de tirar y tirar en fase de responder: FASE_INCORRECTA', () => {
  const e = nuevo(2);
  assert.equal(Ludo.act(e, 0, { tipo: 'responder', eleccion: 0 }, ctx([], [])).error.codigo, 'FASE_INCORRECTA');
  const c = ctx([3], [0]);
  const { estado } = ok(e, 0, { tipo: 'tirar' }, c);
  assert.equal(Ludo.act(estado, 0, { tipo: 'tirar' }, c).error.codigo, 'FASE_INCORRECTA');
});

test('elección inválida y acción desconocida', () => {
  const c = ctx([3], [0]);
  const { estado } = ok(nuevo(2), 0, { tipo: 'tirar' }, c);
  [-1, 4, 1.5, '1', null, undefined].forEach((el) => {
    assert.equal(Ludo.act(estado, 0, { tipo: 'responder', eleccion: el }, c).error.codigo, 'ELECCION_INVALIDA');
  });
  assert.equal(Ludo.act(estado, 0, { tipo: 'volar' }, c).error.codigo, 'ACCION_DESCONOCIDA');
  assert.equal(Ludo.act(estado, 0, null, c).error.codigo, 'ACCION_DESCONOCIDA');
});

test('act no muta el estado de entrada', () => {
  const e = nuevo(2), antes = JSON.stringify(e);
  const r = ok(e, 0, { tipo: 'tirar' }, ctx([2], [0]));
  assert.equal(JSON.stringify(e), antes);
  assert.notEqual(r.estado, e);
});

/* ---------- mecánica del turno ---------- */
test('acierto: dado 2 desde la base -> casilla 1 y pasa el turno', () => {
  const c = ctx([2], [0]);
  let r = ok(nuevo(2), 0, { tipo: 'tirar' }, c);
  assert.deepEqual(tipos(r.eventos), ['dado', 'pregunta']);
  assert.equal(r.estado.fase, 'responder');
  assert.equal(r.estado.dado, 2);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.deepEqual(tipos(r.eventos), ['respondida', 'mover', 'turno']);
  assert.equal(r.estado.asientos[0].pos, 1);
  assert.equal(r.estado.turno, 1);
  assert.deepEqual(r.estado.espera, { asiento: 1, que: 'tirar' });
  assert.equal(r.estado.dado, null);
});

test('fallo: no avanza y pasa el turno', () => {
  const c = ctx([5], [0]);
  let r = ok(nuevo(2), 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 3 }, c);
  assert.equal(r.eventos[0].correcto, false);
  assert.equal(r.eventos[0].correcta, 0);
  assert.equal(r.estado.asientos[0].pos, -1);
  assert.equal(r.estado.turno, 1);
});

test('con 1 jugador el turno vuelve al mismo asiento', () => {
  const c = ctx([3], [0]);
  let r = ok(nuevo(1), 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 1 }, c);   // falla
  assert.equal(r.estado.turno, 0);
  assert.deepEqual(r.estado.espera, { asiento: 0, que: 'tirar' });
});

test('el turno rota entre 3 jugadores', () => {
  const c = ctx([1, 1, 1, 1], [0, 0, 0, 0]);
  let e = nuevo(3);
  const turnos = [];
  for (let i = 0; i < 4; i++) {
    turnos.push(e.turno);
    e = ok(e, e.turno, { tipo: 'tirar' }, c).estado;
    e = ok(e, e.turno, { tipo: 'responder', eleccion: 1 }, c).estado;
  }
  assert.deepEqual(turnos, [0, 1, 2, 0]);
});

/* ---------- casillas especiales ---------- */
test('dado 6 desde la base cae en RETO: pregunta extra, acierto = +2', () => {
  const c = ctx([6], [0, 0]);
  let r = ok(nuevo(2), 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.deepEqual(tipos(r.eventos), ['respondida', 'mover', 'especial', 'pregunta']);
  assert.equal(r.eventos[3].tipo, 'reto');
  assert.equal(r.estado.asientos[0].pos, 5);
  assert.equal(r.estado.turno, 0);                          // el turno sigue
  assert.deepEqual(r.estado.espera, { asiento: 0, que: 'responder' });
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.deepEqual(tipos(r.eventos), ['respondida', 'mover', 'turno']);
  assert.equal(r.eventos[1].causa, 'reto');
  assert.equal(r.estado.asientos[0].pos, 7);
  assert.equal(r.estado.turno, 1);
});

test('reto fallado: no hay avance extra', () => {
  const c = ctx([6], [0, 0]);
  let r = ok(nuevo(2), 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 2 }, c);
  assert.equal(r.estado.asientos[0].pos, 5);
  assert.equal(r.estado.turno, 1);
});

test('RETROCESO: casilla 3 retrocede 2', () => {
  const c = ctx([4], [0]);
  let r = ok(nuevo(2), 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.deepEqual(tipos(r.eventos), ['respondida', 'mover', 'especial', 'mover', 'turno']);
  assert.deepEqual([r.eventos[1].desde, r.eventos[1].hasta], [-1, 3]);
  assert.deepEqual([r.eventos[3].desde, r.eventos[3].hasta, r.eventos[3].causa], [3, 1, 'retroceso']);
  assert.equal(r.estado.asientos[0].pos, 1);
});

test('AVANCE: casilla 11 avanza 2', () => {
  const c = ctx([3], [0]);
  const e = conPos(nuevo(2), 8);
  let r = ok(e, 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.deepEqual(tipos(r.eventos), ['respondida', 'mover', 'especial', 'mover', 'turno']);
  assert.equal(r.estado.asientos[0].pos, 13);
});

test('los especiales no se encadenan (avance desde 11 cae en 13, sin otra regla)', () => {
  const c = ctx([3], [0]);
  let r = ok(conPos(nuevo(2), 8), 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.equal(tipos(r.eventos).filter((t) => t === 'especial').length, 1);
});

test('especiales en la casilla de otro color también aplican (son absolutas)', () => {
  /* el asiento 1 en pos 3 está en la casilla absoluta 16 = RETRO */
  const c = ctx([4], [0]);
  let e = conPos(nuevo(2), -1, -1);
  e.turno = 1; e.espera = { asiento: 1, que: 'tirar' };
  let r = ok(e, 1, { tipo: 'tirar' }, c);
  r = ok(r.estado, 1, { tipo: 'responder', eleccion: 0 }, c);
  assert.equal(r.estado.asientos[1].pos, 1);
});

/* ---------- victoria ---------- */
test('llegar a la meta termina la partida (no hace falta tirada exacta)', () => {
  const c = ctx([6], [0]);
  let r = ok(conPos(nuevo(2), 53), 0, { tipo: 'tirar' }, c);   // 53 + 6 = 59 -> 56
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.equal(r.estado.asientos[0].pos, 56);
  assert.equal(r.estado.fase, 'terminada');
  assert.equal(r.estado.ganador, 0);
  assert.equal(r.estado.motivoFin, 'meta');
  assert.equal(r.estado.espera, null);
  const fin = r.eventos[r.eventos.length - 1];
  assert.equal(fin.t, 'fin');
  assert.equal(fin.clasificacion[0].asiento, 0);
  assert.equal(fin.clasificacion[0].llego, true);
});

test('después del fin, toda acción da PARTIDA_TERMINADA', () => {
  const c = ctx([6], [0]);
  let r = ok(conPos(nuevo(2), 53), 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.equal(Ludo.act(r.estado, 0, { tipo: 'tirar' }, c).error.codigo, 'PARTIDA_TERMINADA');
  assert.equal(Ludo.saltar(r.estado).error.codigo, 'PARTIDA_TERMINADA');
  assert.equal(Ludo.terminarPorTiempo(r.estado).error.codigo, 'PARTIDA_TERMINADA');
});

test('ganar con el reto (+2) también termina', () => {
  /* pos 50 + 1 = 51 no es reto; usamos el reto desde 0 -> pos 5 y forzamos meta con pos manual */
  const c = ctx([6], [0, 0]);
  let r = ok(nuevo(1), 0, { tipo: 'tirar' }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);   // pos 5, reto pendiente
  const e = conPos(r.estado, 55);                               // simulamos estar a 1 de la meta
  r = ok(e, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.equal(r.estado.fase, 'terminada');
  assert.equal(r.estado.ganador, 0);
});

/* ---------- saltar y tiempo ---------- */
test('saltar en fase de tirar: pasa el turno sin penalizar', () => {
  const r = Ludo.saltar(nuevo(3), 'desconexion');
  assert.deepEqual(tipos(r.eventos), ['turno-saltado', 'turno']);
  assert.equal(r.eventos[0].motivo, 'desconexion');
  assert.equal(r.estado.turno, 1);
  assert.equal(r.estado.v, 1);
});

test('saltar en fase de responder: no mueve y no cuenta como respuesta', () => {
  const c = ctx([3], [0]);
  const { estado } = ok(nuevo(2), 0, { tipo: 'tirar' }, c);
  const r = Ludo.saltar(estado, 'tiempo');
  assert.ok(!tipos(r.eventos).includes('respondida'));
  assert.equal(r.estado.asientos[0].pos, -1);
  assert.equal(r.estado.pendiente, null);
  assert.equal(r.estado.fase, 'tirar');
  assert.equal(r.estado.turno, 1);
});

test('terminarPorTiempo: gana el más adelantado; empate por menor asiento', () => {
  let r = Ludo.terminarPorTiempo(conPos(nuevo(3), 4, 20, 10));
  assert.equal(r.estado.ganador, 1);
  assert.equal(r.estado.motivoFin, 'tiempo');
  assert.deepEqual(r.eventos[0].clasificacion.map((x) => x.asiento), [1, 2, 0]);
  r = Ludo.terminarPorTiempo(conPos(nuevo(3), 7, 7, 7));
  assert.equal(r.estado.ganador, 0);
});

/* ---------- vista y acciones legales ---------- */
test('accionesLegales', () => {
  const e = nuevo(2);
  assert.deepEqual(Ludo.accionesLegales(e, 0), [{ tipo: 'tirar' }]);
  assert.deepEqual(Ludo.accionesLegales(e, 1), []);
  const { estado } = ok(e, 0, { tipo: 'tirar' }, ctx([3], [0]));
  assert.deepEqual(Ludo.accionesLegales(estado, 0).map((a) => a.eleccion), [0, 1, 2, 3]);
  assert.deepEqual(Ludo.accionesLegales(estado, 1), []);
});

test('view: sin id de pregunta ni respuesta correcta', () => {
  const { estado } = ok(nuevo(2), 0, { tipo: 'tirar' }, ctx([3], [2]));
  const v = Ludo.view(estado, 1);
  const txt = JSON.stringify(v);
  assert.ok(!/qid|correcta/.test(txt), 'la vista no debe llevar qid ni correcta');
  assert.equal(v.pendiente.n, 4);
  assert.equal(v.yo, 1);
  assert.equal(Ludo.view(estado).yo, null);
  assert.ok(estado.pendiente.qid, 'el estado interno sí conserva el qid');
});

/* ---------- simulación (fuzz) ---------- */
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function mazoAzar(rnd) {
  let n = 0; const mapa = {};
  return {
    sacar() { const id = 'q' + (n++); mapa[id] = Math.floor(rnd() * 4); return { id, opciones: ['a', 'b', 'c', 'd'] }; },
    esCorrecta: (id, el) => mapa[id] === el,
    correcta: (id) => mapa[id]
  };
}
function simular(semilla, jugadores) {
  const rnd = mulberry32(semilla), c = { rng: mulberry32(semilla + 1), mazo: mazoAzar(rnd) };
  let e = Ludo.create({ asientos: asientos(jugadores) });
  const log = [];
  for (let paso = 0; paso < 20000 && e.fase !== 'terminada'; paso++) {
    const asiento = e.espera.asiento;
    const legales = Ludo.accionesLegales(e, asiento);
    assert.ok(legales.length > 0, 'siempre hay una acción legal para quien espera');
    const a = legales[Math.floor(rnd() * legales.length)];
    const v0 = e.v;
    const r = Ludo.act(e, asiento, a, c);
    assert.equal(r.error, undefined);
    assert.equal(r.estado.v, v0 + 1, 'v sube en cada acción válida');
    r.estado.asientos.forEach((s) => assert.ok(s.pos >= -1 && s.pos <= 56, 'pos dentro de rango'));
    log.push(r.eventos.length);
    e = r.estado;
  }
  return { e, log };
}

test('fuzz: 200 partidas (1 a 4 jugadores) siempre terminan, con invariantes', () => {
  for (let s = 1; s <= 200; s++) {
    const { e } = simular(s, 1 + (s % 4));
    assert.equal(e.fase, 'terminada', 'semilla ' + s + ' no terminó');
    assert.equal(e.asientos[e.ganador].pos, 56);
  }
});

test('determinismo: misma semilla, mismo resultado', () => {
  const a = simular(42, 3), b = simular(42, 3);
  assert.equal(JSON.stringify(a.e), JSON.stringify(b.e));
  assert.deepEqual(a.log, b.log);
});

/* ---------- guardas de sincronía y de carga ---------- */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LUDO_JS = path.join(__dirname, '..', 'js', 'games', 'ludo.js');
test('constantes del tablero idénticas a js/games/ludo.js', { skip: !fs.existsSync(LUDO_JS) && 'ludo.js no está en esta copia' }, () => {
  const src = fs.readFileSync(LUDO_JS, 'utf8');
  const ini = src.indexOf('const PATH ='), fin = src.indexOf('const N = 15;');
  assert.ok(ini > 0 && fin > ini, 'no se encontró el bloque de constantes en ludo.js');
  const orig = new Function(src.slice(ini, fin) + '; return { PATH, START, SAFE, RETO, AVANCE, RETRO, HOME_STRETCH, CENTER, BASE_ORIGIN, YARD_SLOTS };')();
  const T = Ludo.TABLERO;
  Object.keys(orig).forEach((k) => assert.deepEqual(JSON.parse(JSON.stringify(T[k])), JSON.parse(JSON.stringify(orig[k])), 'difiere ' + k));
});

test('carga como script de navegador: App.rules.ludo', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'ludo-rules.js'), 'utf8');
  const win = {}; win.self = win;
  vm.runInNewContext(code, win);
  assert.equal(typeof win.App.rules.ludo.create, 'function');
  assert.equal(win.App.rules.ludo.id, 'ludo');
});
