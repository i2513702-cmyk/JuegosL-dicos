/* Administración de salas en servidor/partidas.js: lista / cerrar / cerrarSalas.
 * Usa un `io` simulado (no necesita socket.io ni red):  node tests/admin_salas.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { attach } = require('../servidor/partidas.js');

const KEY = 'clave-docente';
const BANCO = Array.from({ length: 12 }, (_, i) => ({
  id: 'preg_' + i, enunciado: 'Pregunta ' + i, opciones: ['A' + i, 'B' + i, 'C' + i, 'D' + i],
  respuesta_correcta: i % 4, dificultad: 'Fácil', categoria: 'Cat'
}));

function falsoIo() {
  const emitidos = [], salidas = [];
  let conexion = null, n = 0;
  const io = {
    on: (ev, fn) => { if (ev === 'connection') conexion = fn; },
    to: (sala) => ({ emit: (ev, d) => emitidos.push([sala, ev, d]) }),
    in: (sala) => ({ socketsLeave: (r) => salidas.push([sala, r]) }),
    emitidos, salidas,
    socket() {
      const h = {};
      const s = { id: 's' + (++n), data: {}, on: (ev, fn) => { h[ev] = fn; }, join() {}, leave() {}, emit() {} };
      conexion(s);
      s.pedir = (ev, d) => new Promise((res) => h[ev](d, res));
      return s;
    }
  };
  return io;
}

test('lista y cierra salas de varios docentes', async () => {
  const io = falsoIo();
  const api = attach(io, { HOST_KEY: KEY });
  try {
    const a = io.socket(), b = io.socket();
    const ra = await a.pedir('partida:crear', { key: KEY, juego: 'ludo', banco: BANCO });
    const rb = await b.pedir('partida:crear', { key: KEY, juego: 'carrera', banco: BANCO });
    assert.ok(ra.ok && rb.ok);

    const lista = api.lista();
    assert.equal(lista.length, 2);
    assert.deepEqual(lista.map((x) => x.juego).sort(), ['carrera', 'ludo']);
    assert.ok(lista.every((x) => x.fase === 'sala' && x.jugadores === 0 && typeof x.creada === 'number'));

    // cerrar una (código en minúsculas también vale)
    assert.equal(api.cerrar(ra.codigo.toLowerCase()), true);
    assert.equal(api.lista().length, 1);
    assert.ok(io.emitidos.some((e) => e[0] === ra.codigo && e[1] === 'partida:cerrada'), 'avisa a la sala');
    assert.ok(io.salidas.some((e) => e[0] === ra.codigo), 'saca a los sockets de la sala');
    assert.equal(api.cerrar(ra.codigo), false, 'cerrar otra vez no existe');
    assert.equal(api.cerrar('ZZZZ'), false);
    assert.equal(api.cerrar(undefined), false);

    // el docente cuya sala se cerró puede crear otra
    const rc = await a.pedir('partida:crear', { key: KEY, juego: 'ludo', banco: BANCO });
    assert.ok(rc.ok, 'tras el cierre puede crear otra sala');
    assert.equal(api.lista().length, 2);

    // cerrar todas
    assert.equal(api.cerrarSalas(), 2);
    assert.equal(api.lista().length, 0);
    assert.equal(api.cerrarSalas(), 0);
  } finally { api.cerrarTodas(); }
});
