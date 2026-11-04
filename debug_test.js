const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: conectar } = require('socket.io-client');
const { attach } = require('./servidor/partidas.js');

const KEY = 'clave-docente';
const BANCO = Array.from({ length: 12 }, (_, i) => ({
  id: 'preg_' + i, enunciado: 'Pregunta ' + i, opciones: ['A' + i, 'B' + i, 'C' + i, 'D' + i],
  respuesta_correcta: i % 4, dificultad: ['Fácil', 'Media', 'Difícil'][i % 3], categoria: 'Cat'
}));
const CORRECTA = {}; BANCO.forEach((b) => { CORRECTA[b.enunciado] = b.opciones[b.respuesta_correcta]; });
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

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

async function run() {
  await servidor({ limites: { accionesPorSeg: 1000 } }, async (S) => {
    const doc = await S.nuevo();
    const cr = await S.pedir(doc, 'partida:crear', { key: KEY, juego: 'conquista', banco: BANCO, ajustes: { rows: 4, cols: 4 } });
    console.log(cr.ok);
    const al = [];
    for (let i = 0; i < 2; i++) {
      const c = await S.nuevo();
      const a = await S.pedir(c, 'partida:unirse', { codigo: cr.codigo, nombre: 'Alumno' + i });
      console.log(a.ok);
      c.pid = a.pid; c.asiento = a.yo.asiento;
      al.push(c);
    }
    const [a0, a1] = al;
    console.log((await S.pedir(doc, 'partida:iniciar', {})).ok);
    let estado = await S.esperar(a0, 'partida:estado');
    const Conquista = require('./js/shared/conquista-rules.js');
    let marcaDoc = doc.log.length;
    let marcaCli = [];
    for (let i=0; i<al.length; i++) marcaCli[i] = al[i].log.length;
    for (let step = 0; step < 100; step++) {
      if (estado.estado.fase === 'terminada') break;
      const esp = estado.estado.espera.asiento;
      const cliente = al[esp];
      console.log('step', step, 'fase', estado.estado.fase, 'esp', esp, 'turno', estado.estado.turno);
      if (estado.estado.fase === 'elegir') {
        const legales = Conquista.accionesLegales(estado.estado, esp);
        console.log('legales', legales.length);
        if (legales.length === 0) break;
        const m = cliente.log.length;
        const res = await S.pedir(cliente, 'partida:accion', legales[0]);
        console.log('res1', res);
        if (!res.ok) break;
        estado = await S.esperar(doc, 'partida:estado', null, marcaDoc);
        marcaDoc = doc.log.length;
        continue;
      } else if (estado.estado.fase === 'responder') {
        const preg = await S.esperar(cliente, 'partida:pregunta', null, cliente.log.length > marcaCli[esp] ? marcaCli[esp] : (cliente.log.length-50));
        marcaCli[esp] = cliente.log.length;
        console.log('preg', preg.tipo, preg.asiento);
        const idx = preg.opciones.indexOf(CORRECTA[preg.enunciado]);
        const r2 = await S.pedir(cliente, 'partida:accion', { tipo: 'responder', eleccion: idx });
        console.log('res2', r2);
        if (!r2.ok) break;
        estado = await S.esperar(doc, 'partida:estado', (d) => d.eventos.some((e) => e.t === 'respondida'), marcaDoc);
        marcaDoc = doc.log.length;
        continue;
      }
      break;
    }
    console.log(estado.estado.fase);
    console.log(estado.estado.fase);
  });
}

run().catch(e=>{console.error(e);process.exit(1);});
