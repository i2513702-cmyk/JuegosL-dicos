const Conquista = require('./js/shared/conquista-rules.js');
const asientos = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, nombre: 'Jugador ' + i }));
const nuevo = (n) => Conquista.create({ asientos: asientos(n || 2) });

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
  const r = Conquista.act(e, asiento, accion, c);
  if (r.error) { console.log('ERR', r.error); process.exit(1); }
  return r;
}
const tipos = (ev) => ev.map((x) => x.t);

let e = nuevo(2);
e.zonas[1].owner = 1;
e.turno = 0; e.fase = 'elegir'; e.espera = { asiento: 0, que: 'elegir-zona' };
const c = ctx([0, 1]); // atacante acierta, defensor falla
let r = ok(e, 0, { tipo: 'elegir', zona: 1 }, c);
console.log('after elegir:', r.estado.fase, r.estado.espera);
r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
console.log('after atk resp:', r.estado.fase, r.estado.espera, r.estado.pendiente && r.estado.pendiente.tipo);
console.log('events:', tipos(r.eventos));
r = ok(r.estado, 1, { tipo: 'responder', eleccion: 1 }, c);
console.log('after def resp events:', tipos(r.eventos));
