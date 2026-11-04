/* Tests de servidor/preguntas.js (Node >= 18, sin red).  node tests/preguntas.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../servidor/preguntas.js');

const q = (extra) => Object.assign({ enunciado: '¿2+2?', opciones: ['3', '4', '5', '6'], respuesta_correcta: 1 }, extra || {});
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('normalizarBanco: acepta formato del quiz y de la app', () => {
  const r = P.normalizarBanco([
    q({ dificultad: 'Difícil', categoria: 'Mates' }),
    q({ difficulty_id: 'dif_media', id: 'preg_7' }),
    q({ dificultad: 'facil' }),
    q()
  ]);
  assert.equal(r.preguntas.length, 4);
  assert.equal(r.descartadas, 0);
  assert.deepEqual(r.preguntas.map((x) => x.dificultadId), ['dif_dificil', 'dif_media', 'dif_facil', 'dif_facil']);
  assert.equal(r.preguntas[1].ref, 'preg_7');
  assert.equal(r.preguntas[0].categoria, 'Mates');
  assert.equal(r.preguntas[0].dificultad, 'Difícil');
});

test('normalizarBanco: descarta inválidas y cuenta cuántas', () => {
  const r = P.normalizarBanco([
    q(), null, 'x', q({ enunciado: '   ' }), q({ opciones: ['solo una'], respuesta_correcta: 0 }),
    q({ respuesta_correcta: 4 }), q({ respuesta_correcta: -1 }), q({ respuesta_correcta: '1' }), q({ respuesta_correcta: 1.5 }),
    q({ opciones: ['a', '', 'c'] }), q({ opciones: Array(7).fill('x') }), q({ opciones: 'no es array' })
  ]);
  assert.equal(r.preguntas.length, 1);
  assert.equal(r.descartadas, 11);
});

test('normalizarBanco: respeta el máximo y quita < > de los textos', () => {
  const muchas = Array.from({ length: 150 }, () => q());
  const r = P.normalizarBanco(muchas, { max: 100 });
  assert.equal(r.preguntas.length, 100);
  assert.equal(r.descartadas, 50);
  const l = P.normalizarBanco([q({ enunciado: '<b>hola</b>', opciones: ['<i>a</i>', 'b'], respuesta_correcta: 0 })]);
  assert.equal(l.preguntas[0].enunciado, 'bhola/b');
  assert.equal(l.preguntas[0].opciones[0], 'ia/i');
  assert.deepEqual(P.normalizarBanco('no es array'), { preguntas: [], descartadas: 0 });
});

test('crearMazo: falla con banco vacío', () => {
  assert.throws(() => P.crearMazo([]));
});

test('crearMazo: reparte todas sin repetir antes de rebarajar', () => {
  const banco = P.normalizarBanco(Array.from({ length: 6 }, (_, i) => q({ enunciado: 'P' + i }))).preguntas;
  const m = P.crearMazo(banco, { rng: mulberry32(1) });
  const vistas = new Set();
  for (let i = 0; i < 6; i++) vistas.add(m.publica(m.sacar().id).enunciado);
  assert.equal(vistas.size, 6);
  assert.doesNotThrow(() => m.sacar());           // la 7ª rebaraja
});

test('crearMazo: la correcta sigue a su opción aunque se mezclen', () => {
  const banco = P.normalizarBanco([q()]).preguntas;
  const m = P.crearMazo(banco, { rng: mulberry32(9) });
  for (let i = 0; i < 40; i++) {
    const s = m.sacar(), pub = m.publica(s.id);
    assert.equal(pub.opciones[m.correcta(s.id)], '4', 'la opción correcta debe seguir siendo "4"');
    assert.equal(m.esCorrecta(s.id, m.correcta(s.id)), true);
    assert.equal(m.esCorrecta(s.id, (m.correcta(s.id) + 1) % 4), false);
  }
});

test('crearMazo: mezclarOpciones:false conserva el orden', () => {
  const m = P.crearMazo(P.normalizarBanco([q()]).preguntas, { mezclarOpciones: false });
  const s = m.sacar();
  assert.deepEqual(s.opciones, ['3', '4', '5', '6']);
  assert.equal(m.correcta(s.id), 1);
});

test('publica: nunca incluye la respuesta correcta; meta solo para el servidor', () => {
  const m = P.crearMazo(P.normalizarBanco([q({ id: 'abc', dificultad: 'Media', categoria: 'C' })]).preguntas);
  const s = m.sacar(), pub = m.publica(s.id);
  assert.ok(!/correcta/i.test(JSON.stringify(pub)), 'publica() no debe llevar la correcta');
  assert.deepEqual(Object.keys(pub).sort(), ['categoria', 'dificultad', 'enunciado', 'opciones', 'qid']);
  assert.deepEqual(m.meta(s.id), { ref: 'abc', dificultadId: 'dif_media', categoria: 'C' });
});

test('crearMazo: id de salida desconocido lanza error', () => {
  const m = P.crearMazo(P.normalizarBanco([q()]).preguntas);
  assert.throws(() => m.esCorrecta('nada', 0));
});

test('crearMazo: determinista con la misma semilla', () => {
  const banco = P.normalizarBanco(Array.from({ length: 10 }, (_, i) => q({ enunciado: 'P' + i }))).preguntas;
  const sec = (seed) => { const m = P.crearMazo(banco, { rng: mulberry32(seed) }); return Array.from({ length: 25 }, () => { const s = m.sacar(); return m.publica(s.id).enunciado + ':' + m.correcta(s.id); }); };
  assert.deepEqual(sec(5), sec(5));
  assert.notDeepEqual(sec(5), sec(6));
});
