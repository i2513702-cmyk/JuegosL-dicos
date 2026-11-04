/* Prueba de integración de servidor/partidas.js con Socket.IO REAL (servidor y clientes
 * en el mismo proceso, puerto libre, sin navegador).
 *   npm i -D socket.io-client        (una sola vez)
 *   node tests/partidas_socket.test.js
 * Node >= 18. Dura unos 10 s por los relojes de turno y de partida. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: conectar } = require('socket.io-client');
const { attach } = require('../servidor/partidas.js');

const KEY = 'clave-docente';
const BANCO = Array.from({ length: 12 }, (_, i) => ({
  id: 'preg_' + i, enunciado: 'Pregunta ' + i, opciones: ['A' + i, 'B' + i, 'C' + i, 'D' + i],
  respuesta_correcta: i % 4, dificultad: ['Fácil', 'Media', 'Difícil'][i % 3], categoria: 'Cat'
}));
const CORRECTA = {}; BANCO.forEach((b) => { CORRECTA[b.enunciado] = b.opciones[b.respuesta_correcta]; });
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- infraestructura ---------- */
async function servidor(opts, fn) {
  const http_ = http.createServer();
  const io = new Server(http_);
  const api = attach(io, Object.assign({ HOST_KEY: KEY, rng: mulberry32(11) }, opts || {}));
  await new Promise((r) => http_.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + http_.address().port;
  const clientes = [];
  const S = {
    api,
    nuevo: () => new Promise((res) => {
      const c = conectar(url, { transports: ['websocket'], forceNew: true, reconnection: false });
      c.log = []; c.onAny((ev, d) => c.log.push([ev, d]));
      clientes.push(c);
      c.on('connect', () => res(c));
    }),
    pedir: (c, ev, datos) => new Promise((res) => c.emit(ev, datos, res)),
    esperar: (c, ev, pred, desde) => new Promise((res, rej) => {
      const t0 = Date.now();
      const buscar = () => {
        for (let i = desde || 0; i < c.log.length; i++) { const e = c.log[i]; if (e[0] === ev && (!pred || pred(e[1]))) return res(e[1]); }
        if (Date.now() - t0 > 4000) return rej(new Error('timeout esperando ' + ev));
        setTimeout(buscar, 10);
      };
      buscar();
    })
  };
  try { await fn(S); }
  finally {
    clientes.forEach((c) => c.close());
    api.cerrarTodas();
    await new Promise((r) => io.close(r));
  }
}

/* docente + n alumnos ya dentro de la sala */
async function montar(S, o) {
  o = o || {};
  const doc = await S.nuevo();
  const r = await S.pedir(doc, 'partida:crear', Object.assign({ key: KEY, juego: 'ludo', banco: BANCO }, o.crear));
  assert.equal(r.ok, true, JSON.stringify(r));
  const al = [];
  for (let i = 0; i < (o.n === undefined ? 2 : o.n); i++) {
    const c = await S.nuevo();
    const a = await S.pedir(c, 'partida:unirse', { codigo: r.codigo, nombre: 'Alumno' + i, avatar: i });
    assert.equal(a.ok, true, JSON.stringify(a));
    c.pid = a.pid; c.asiento = a.yo.asiento;
    al.push(c);
  }
  return { doc, al, codigo: r.codigo, token: r.token, crear: r };
}

/* un turno completo respondiendo bien (maneja el reto: segunda pregunta) -> último partida:estado */
async function turnoCorrecto(S, c) {
  let marca = c.log.length;
  const t = await S.pedir(c, 'partida:accion', { tipo: 'tirar' });
  assert.equal(t.ok, true, JSON.stringify(t));
  for (;;) {
    const preg = await S.esperar(c, 'partida:pregunta', null, marca);
    marca = c.log.length;
    const r = await S.pedir(c, 'partida:accion', { tipo: 'responder', eleccion: preg.opciones.indexOf(CORRECTA[preg.enunciado]) });
    assert.equal(r.ok, true, JSON.stringify(r));
    const est = await S.esperar(c, 'partida:estado', (d) => d.eventos.some((e) => e.t === 'respondida'), marca);
    if (est.estado.fase === 'terminada' || !est.eventos.some((e) => e.t === 'pregunta')) return est;
  }
}

/* ---------- docente y sala ---------- */
test('crear: clave, juego, banco y validaciones', async () => {
  await servidor({}, async (S) => {
    const d = await S.nuevo();
    assert.equal((await S.pedir(d, 'partida:crear', { key: 'mala', juego: 'ludo', banco: BANCO })).error, 'CLAVE_INCORRECTA');
    assert.equal((await S.pedir(d, 'partida:crear', { key: KEY, juego: 'monopoly', banco: BANCO })).error, 'JUEGO_DESCONOCIDO');
    assert.equal((await S.pedir(d, 'partida:crear', { key: KEY, juego: '__proto__', banco: BANCO })).error, 'JUEGO_DESCONOCIDO');
    assert.equal((await S.pedir(d, 'partida:crear', { key: KEY, juego: 'ludo', banco: [] })).error, 'SIN_PREGUNTAS');
    assert.equal((await S.pedir(d, 'partida:crear', { key: KEY, juego: 'ludo', banco: [{ enunciado: 'x' }] })).error, 'SIN_PREGUNTAS');
    assert.equal((await S.pedir(d, 'partida:crear', null)).error, 'CLAVE_INCORRECTA');
    const ok = await S.pedir(d, 'partida:crear', { key: KEY, juego: 'ludo', banco: BANCO.concat([{ enunciado: 'mala' }]) });
    assert.equal(ok.ok, true);
    assert.match(ok.codigo, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    assert.equal(ok.aceptadas, 12);
    assert.equal(ok.descartadas, 1);
    assert.equal(ok.turnoSeg, 90);
    assert.equal((await S.pedir(d, 'partida:crear', { key: KEY, juego: 'ludo', banco: BANCO })).error, 'YA_TIENES_SALA');
  });
});

test('crear: sin HOST_KEY configurada cualquiera puede ser docente (como el quiz)', async () => {
  await servidor({ HOST_KEY: '' }, async (S) => {
    const d = await S.nuevo();
    assert.equal((await S.pedir(d, 'partida:crear', { juego: 'ludo', banco: BANCO })).ok, true);
  });
});

test('crear: tras 15 claves malas el socket queda bloqueado un rato', async () => {
  await servidor({}, async (S) => {
    const d = await S.nuevo();
    for (let i = 0; i < 15; i++) await S.pedir(d, 'partida:crear', { key: 'x' + i, juego: 'ludo', banco: BANCO });
    assert.equal((await S.pedir(d, 'partida:crear', { key: KEY, juego: 'ludo', banco: BANCO })).error, 'DEMASIADOS_INTENTOS');
  });
});

test('unirse: validaciones, sala llena y el pid no se filtra', async () => {
  await servidor({}, async (S) => {
    const { doc, al, codigo } = await montar(S, { n: 2 });
    const c = await S.nuevo();
    assert.equal((await S.pedir(c, 'partida:unirse', { codigo: 'ZZZZ', nombre: 'Ana' })).error, 'SALA_NO_EXISTE');
    assert.equal((await S.pedir(c, 'partida:unirse', { codigo: codigo, nombre: 'A' })).error, 'NOMBRE_CORTO');
    assert.equal((await S.pedir(c, 'partida:unirse', { codigo: codigo, nombre: 'alumno0' })).error, 'NOMBRE_USADO');
    const a3 = await S.pedir(c, 'partida:unirse', { codigo: codigo.toLowerCase(), nombre: 'Tercero', avatar: 99 });
    assert.equal(a3.ok, true);
    assert.equal(a3.yo.asiento, 2);
    assert.equal(a3.yo.color, 'azul');
    const c4 = await S.nuevo(); assert.equal((await S.pedir(c4, 'partida:unirse', { codigo: codigo, nombre: 'Cuarto' })).ok, true);
    const c5 = await S.nuevo(); assert.equal((await S.pedir(c5, 'partida:unirse', { codigo: codigo, nombre: 'Quinto' })).error, 'SALA_LLENA');

    const sala = await S.esperar(doc, 'partida:sala', (d) => d.jugadores.length === 4);
    assert.deepEqual(sala.jugadores.map((j) => j.color), ['rojo', 'verde', 'azul', 'amarillo']);
    /* el pid de un jugador solo aparece en SU ack: ni en sala ni en los logs ajenos */
    assert.ok(!JSON.stringify(doc.log).includes(al[0].pid), 'el docente no ve pids');
    assert.ok(!JSON.stringify(al[1].log).includes(al[0].pid), 'otro alumno no ve el pid ajeno');
  });
});

test('iniciar: mínimo de jugadores, solo el docente y no dos veces', async () => {
  await servidor({}, async (S) => {
    const { doc, al } = await montar(S, { n: 0 });
    assert.equal((await S.pedir(doc, 'partida:iniciar', {})).error, 'MIN_JUGADORES');
    const c = await S.nuevo();
    assert.equal((await S.pedir(c, 'partida:iniciar', {})).error, 'SALA_NO_EXISTE');
    const a = await S.pedir(await S.nuevo(), 'partida:unirse', { codigo: [...S.api.salas.keys()][0], nombre: 'Solo' });
    assert.equal(a.ok, true);
    assert.equal((await S.pedir(doc, 'partida:iniciar', {})).ok, true);
    assert.equal((await S.pedir(doc, 'partida:iniciar', {})).error, 'PARTIDA_EMPEZADA');
    const tarde = await S.nuevo();
    assert.equal((await S.pedir(tarde, 'partida:unirse', { codigo: [...S.api.salas.keys()][0], nombre: 'Tarde' })).error, 'PARTIDA_EMPEZADA');
  });
});

test('expulsar antes de empezar y docente-volver con token', async () => {
  await servidor({}, async (S) => {
    const { doc, al, codigo, token } = await montar(S, { n: 3 });
    assert.equal((await S.pedir(doc, 'partida:expulsar', { asiento: 9 })).error, 'JUGADOR_NO_EXISTE');
    const marca = doc.log.length;
    assert.equal((await S.pedir(doc, 'partida:expulsar', { asiento: 1 })).ok, true);
    await S.esperar(al[1], 'partida:expulsado');
    const sala = await S.esperar(doc, 'partida:sala', (d) => d.jugadores.length === 2, marca);
    assert.deepEqual(sala.jugadores.map((j) => j.nombre), ['Alumno0', 'Alumno2']);

    doc.close();
    const doc2 = await S.nuevo();
    assert.equal((await S.pedir(doc2, 'partida:docente-volver', { codigo: codigo, token: 'falso' })).error, 'SALA_NO_EXISTE');
    const v = await S.pedir(doc2, 'partida:docente-volver', { codigo: codigo, token: token });
    assert.equal(v.ok, true);
    assert.equal(v.sala.jugadores.length, 2);
    assert.equal((await S.pedir(doc2, 'partida:iniciar', {})).ok, true);          // ya controla la sala
    assert.equal((await S.pedir(doc2, 'partida:expulsar', { asiento: 0 })).error, 'PARTIDA_EMPEZADA');
  });
});

/* ---------- partida ---------- */
test('turnos: fuera de turno, secreto de la respuesta y pregunta solo para quien juega', async () => {
  await servidor({}, async (S) => {
    const { doc, al } = await montar(S, { n: 2 });
    const [a0, a1] = al;
    assert.equal((await S.pedir(a0, 'partida:accion', { tipo: 'tirar' })).error, 'FASE_INCORRECTA');   // aún en sala
    assert.equal((await S.pedir(doc, 'partida:iniciar', {})).ok, true);
    const est0 = await S.esperar(a1, 'partida:estado');
    assert.equal(est0.estado.fase, 'tirar');
    assert.deepEqual(est0.estado.espera, { asiento: 0, que: 'tirar' });
    assert.equal(est0.estado.asientos[0].id, 's0');                    // id público, no el pid

    assert.equal((await S.pedir(a1, 'partida:accion', { tipo: 'tirar' })).error, 'NO_ES_TU_TURNO');
    const m0 = a0.log.length, m1 = a1.log.length;
    assert.equal((await S.pedir(a0, 'partida:accion', { tipo: 'tirar' })).ok, true);
    const preg = await S.esperar(a0, 'partida:pregunta', null, m0);
    await S.esperar(doc, 'partida:pregunta');                          // el docente también la ve
    assert.equal(preg.asiento, 0);
    assert.equal(preg.opciones.length, 4);

    /* hasta aquí NADIE ha recibido la respuesta correcta */
    const antes = JSON.stringify([doc.log, a0.log, a1.log]);
    assert.ok(!/respuesta_correcta/.test(antes));
    assert.ok(!/"correcta"/.test(antes), 'ningún mensaje previo a responder debe llevar "correcta"');
    assert.ok(!a1.log.slice(m1).some((e) => e[0] === 'partida:pregunta'), 'el rival no recibe la pregunta');

    const indice = preg.opciones.indexOf(CORRECTA[preg.enunciado]);
    const r = await S.pedir(a0, 'partida:accion', { tipo: 'responder', eleccion: indice });
    assert.equal(r.ok, true);
    const est = await S.esperar(a1, 'partida:estado', (d) => d.eventos.some((e) => e.t === 'respondida'));
    const resp = est.eventos.find((e) => e.t === 'respondida');
    assert.equal(resp.correcto, true);
    assert.equal(resp.correcta, indice);                               // ahora sí se revela
    assert.ok(est.estado.asientos[0].pos >= 0);
    assert.ok(est.v >= 2);
  });
});

test('acciones malformadas no rompen nada', async () => {
  await servidor({}, async (S) => {
    const { doc, al } = await montar(S, { n: 1 });
    await S.pedir(doc, 'partida:iniciar', {});
    const a = al[0];
    assert.equal((await S.pedir(a, 'partida:accion', null)).error, 'ACCION_DESCONOCIDA');
    assert.equal((await S.pedir(a, 'partida:accion', { tipo: 5 })).error, 'ACCION_DESCONOCIDA');
    assert.equal((await S.pedir(a, 'partida:accion', { tipo: 'responder', eleccion: 0 })).error, 'FASE_INCORRECTA');
    assert.equal((await S.pedir(a, 'partida:accion', { tipo: 'tirar' })).ok, true);
    assert.equal((await S.pedir(a, 'partida:accion', { tipo: 'responder', eleccion: '1' })).error, 'ELECCION_INVALIDA');
    assert.equal((await S.pedir(a, 'partida:accion', { tipo: 'responder', eleccion: 9 })).error, 'ELECCION_INVALIDA');
    assert.equal((await S.pedir(a, 'partida:accion', { tipo: 'responder', eleccion: 0, extra: { x: 1 } })).ok, true);
  });
});

test('límite de acciones por segundo', async () => {
  await servidor({}, async (S) => {
    const { doc, al } = await montar(S, { n: 1 });
    await S.pedir(doc, 'partida:iniciar', {});
    const res = await Promise.all(Array.from({ length: 20 }, () => S.pedir(al[0], 'partida:accion', { tipo: 'tirar' })));
    assert.ok(res.some((r) => r.error === 'DEMASIADAS_ACCIONES'));
  });
});

test('reconexión: vuelve con su pid, retoma su lugar y recibe la pregunta pendiente', async () => {
  await servidor({}, async (S) => {
    const { doc, al, codigo } = await montar(S, { n: 2 });
    const [a0, a1] = al;
    await S.pedir(doc, 'partida:iniciar', {});
    const m0 = a0.log.length;
    await S.pedir(a0, 'partida:accion', { tipo: 'tirar' });
    const preg = await S.esperar(a0, 'partida:pregunta', null, m0);

    const m1 = a1.log.length;
    a0.close();
    const sala = await S.esperar(a1, 'partida:sala', (d) => d.jugadores[0].online === false, m1);
    assert.equal(sala.jugadores[0].online, false);

    const nuevo = await S.nuevo();
    const r = await S.pedir(nuevo, 'partida:unirse', { codigo: codigo, pid: a0.pid });
    assert.equal(r.ok, true);
    assert.equal(r.yo.asiento, 0);
    assert.equal(r.fase, 'jugando');
    const est = await S.esperar(nuevo, 'partida:estado');
    assert.equal(est.estado.fase, 'responder');
    const preg2 = await S.esperar(nuevo, 'partida:pregunta');
    assert.equal(preg2.enunciado, preg.enunciado);
    assert.deepEqual(preg2.opciones, preg.opciones);
    await S.esperar(a1, 'partida:sala', (d) => d.jugadores[0].online === true);
    const ok = await S.pedir(nuevo, 'partida:accion', { tipo: 'responder', eleccion: 0 });
    assert.equal(ok.ok, true);
    /* un pid inventado no sirve para entrar a media partida */
    const intruso = await S.nuevo();
    assert.equal((await S.pedir(intruso, 'partida:unirse', { codigo: codigo, pid: 'inventado', nombre: 'Intruso' })).error, 'PARTIDA_EMPEZADA');
  });
});

test('sesión reemplazada: el dispositivo viejo ya no puede jugar', async () => {
  await servidor({}, async (S) => {
    const { doc, al, codigo } = await montar(S, { n: 1 });
    await S.pedir(doc, 'partida:iniciar', {});
    const otro = await S.nuevo();
    assert.equal((await S.pedir(otro, 'partida:unirse', { codigo: codigo, pid: al[0].pid })).ok, true);
    assert.equal((await S.pedir(al[0], 'partida:accion', { tipo: 'tirar' })).error, 'SESION_REEMPLAZADA');
    assert.equal((await S.pedir(otro, 'partida:accion', { tipo: 'tirar' })).ok, true);
  });
});

/* ---------- relojes ---------- */
test('turno vencido: se salta solo (motivo "tiempo")', async () => {
  await servidor({ limites: { turnoMin: 1 } }, async (S) => {
    const { doc, al } = await montar(S, { n: 2, crear: { turnoSeg: 1 } });
    await S.pedir(doc, 'partida:iniciar', {});
    const est = await S.esperar(al[1], 'partida:estado', (d) => d.eventos.some((e) => e.t === 'turno-saltado'));
    assert.equal(est.eventos.find((e) => e.t === 'turno-saltado').motivo, 'tiempo');
    assert.equal(est.estado.turno, 1);
    assert.ok(est.turnoVence > est.ahora - 5);
  });
});

test('jugador desconectado en su turno: se salta tras la gracia (motivo "desconexion")', async () => {
  await servidor({ limites: { turnoMin: 1, graciaSeg: 1 } }, async (S) => {
    const { doc, al } = await montar(S, { n: 2, crear: { turnoSeg: 300 } });
    await S.pedir(doc, 'partida:iniciar', {});
    const m = al[1].log.length;
    al[0].close();
    const est = await S.esperar(al[1], 'partida:estado', (d) => d.eventos.some((e) => e.t === 'turno-saltado'), m);
    assert.equal(est.eventos.find((e) => e.t === 'turno-saltado').motivo, 'desconexion');
  });
});

test('el docente puede saltar el turno', async () => {
  await servidor({}, async (S) => {
    const { doc, al } = await montar(S, { n: 2 });
    assert.equal((await S.pedir(doc, 'partida:saltar-turno', {})).error, 'FASE_INCORRECTA');
    await S.pedir(doc, 'partida:iniciar', {});
    assert.equal((await S.pedir(doc, 'partida:saltar-turno', {})).ok, true);
    const est = await S.esperar(al[0], 'partida:estado', (d) => d.eventos.some((e) => e.t === 'turno-saltado'));
    assert.equal(est.eventos[0].motivo, 'docente');
    assert.equal(est.estado.turno, 1);
  });
});

test('tiempo total agotado: termina por tiempo', async () => {
  await servidor({ limites: { tiempoMin: 1 } }, async (S) => {
    const { doc, al } = await montar(S, { n: 2, crear: { tiempoSeg: 1, turnoSeg: 0 } });
    await S.pedir(doc, 'partida:iniciar', {});
    const fin = await S.esperar(al[0], 'partida:fin');
    assert.equal(fin.motivo, 'tiempo');
    assert.equal(fin.clasificacion.length, 2);
    const reg = await S.esperar(al[0], 'partida:registro');
    assert.deepEqual(reg.respuestas, []);
  });
});

/* ---------- partida completa ---------- */
test('partida completa de 1 jugador hasta la meta: fin, registro y reconexión posterior', async () => {
  await servidor({ limites: { accionesPorSeg: 1000 } }, async (S) => {
    const { doc, al, codigo } = await montar(S, { n: 1 });
    const c = al[0];
    await S.pedir(doc, 'partida:iniciar', {});
    let est;
    for (let i = 0; i < 300; i++) { est = await turnoCorrecto(S, c); if (est.estado.fase === 'terminada') break; }
    assert.equal(est.estado.fase, 'terminada');
    assert.equal(est.estado.asientos[0].pos, 56);

    const fin = await S.esperar(c, 'partida:fin');
    assert.equal(fin.motivo, 'meta');
    assert.equal(fin.ganador, 0);
    const reg = await S.esperar(c, 'partida:registro');
    assert.equal(reg.gano, true);
    assert.ok(reg.respuestas.length >= 10);
    assert.ok(reg.respuestas.every((r) => r.correcto === true && /^preg_\d+$/.test(r.ref) && /^dif_/.test(r.dificultadId)));

    assert.equal((await S.pedir(c, 'partida:accion', { tipo: 'tirar' })).error, 'FASE_INCORRECTA');

    c.close();
    const vuelve = await S.nuevo();
    assert.equal((await S.pedir(vuelve, 'partida:unirse', { codigo: codigo, pid: c.pid })).fase, 'terminada');
    assert.equal((await S.esperar(vuelve, 'partida:fin')).motivo, 'meta');
    assert.equal((await S.esperar(vuelve, 'partida:registro')).respuestas.length, reg.respuestas.length);
  });
});

test('cerrar: avisa a todos y el código deja de existir', async () => {
  await servidor({}, async (S) => {
    const { doc, al, codigo } = await montar(S, { n: 2 });
    assert.equal((await S.pedir(doc, 'partida:cerrar', {})).ok, true);
    await S.esperar(al[0], 'partida:cerrada');
    await S.esperar(al[1], 'partida:cerrada');
    assert.equal((await S.pedir(await S.nuevo(), 'partida:unirse', { codigo: codigo, nombre: 'Tarde' })).error, 'SALA_NO_EXISTE');
    assert.equal(S.api.stats().salas, 0);
  });
});
