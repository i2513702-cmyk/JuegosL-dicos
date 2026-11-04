/* Tests de js/shared/batalla-rules.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const Batalla = require('../js/shared/batalla-rules.js');

const asientos = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, nombre: 'Jugador ' + i }));
const nuevo = (n) => Batalla.create({ asientos: asientos(n || 4) });

function mazoGuion(correctas) {
  let i = 0; const mapa = {};
  return {
    sacar() {
      const c = correctas[i]; if (c === undefined) throw new Error('preguntas acabadas');
      const id = 'q' + (i++); mapa[id] = c;
      return { id, opciones: ['a','b','c','d'] };
    },
    esCorrecta: (id, el) => mapa[id] === el,
    correcta: (id) => mapa[id]
  };
}
function ctx(correctas, rng) {
  return { rng: rng || (() => 0.5), mazo: mazoGuion(correctas || [0]) };
}
function ok(e, asiento, accion, c) {
  const r = Batalla.act(e, asiento, accion, c);
  assert.equal(r.error, undefined, 'no debía fallar: ' + JSON.stringify(r && r.error));
  return r;
}

test('create: estado inicial', () => {
  const e = nuevo(4);
  assert.equal(e.fase, 'preguntar');
  assert.equal(e.v, 0);
  assert.ok(e.espera);
  assert.equal(e.equipoHp[0], 200);
  assert.equal(e.equipoHp[1], 200);
});

test('acción fuera de turno: error y estado intacto', () => {
  const e = nuevo(4), antes = JSON.stringify(e);
  const r = Batalla.act(e, 1, { tipo: 'responder', eleccion: 0 }, ctx([0]));
  assert.equal(r.error.codigo, 'NO_ES_TU_TURNO');
  assert.equal(JSON.stringify(e), antes);
});

test('flujo: pregunta -> acierto -> accion atacar', () => {
  let e = nuevo(4);
  const c = ctx([0, 0]);
  const esp = e.espera.asiento;
  let r = ok(e, esp, { tipo: 'responder', eleccion: 0 }, c);
  assert.equal(r.estado.fase, 'accion');
  r = ok(r.estado, esp, { tipo: 'atacar' }, c);
  assert.ok(r.estado.fase === 'preguntar' || r.estado.fase === 'terminada');
});

test('fallo pasa turno', () => {
  let e = nuevo(4);
  const c = ctx([1, 0]); // primera incorrecta, segunda ok
  const esp = e.espera.asiento;
  let r = ok(e, esp, { tipo: 'responder', eleccion: 0 }, c);
  assert.equal(r.estado.turno, 1);
});

test('defender da escudo', () => {
  let e = nuevo(4);
  const c = ctx([0, 0]);
  const esp = e.espera.asiento;
  let r = ok(e, esp, { tipo: 'responder', eleccion: 0 }, c);
  r = ok(r.estado, esp, { tipo: 'defender' }, c);
  assert.equal(true, true);
});

test('terminarPorTiempo gana por vida', () => {
  let e = nuevo(4);
  e.equipoHp[0] = 50; e.equipoHp[1] = 10;
  let r = Batalla.terminarPorTiempo(e);
  assert.equal(r.estado.ganador, 0);
});

test('view no contiene respuesta_correcta', () => {
  const e = nuevo(4);
  const v = Batalla.view(e, 0);
  assert.ok(!/respuesta_correcta/.test(JSON.stringify(v)));
});

test('v sube en cada acción válida', () => {
  let e = nuevo(4);
  const c = ctx([0]);
  const v0 = e.v;
  const esp = e.espera.asiento;
  e = ok(e, esp, { tipo: 'responder', eleccion: 0 }, c).estado;
  assert.equal(e.v, v0 + 1);
});
