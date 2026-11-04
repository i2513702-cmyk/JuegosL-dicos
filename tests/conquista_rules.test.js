/* Tests de js/shared/conquista-rules.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const Conquista = require('../js/shared/conquista-rules.js');

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
  assert.equal(r.error, undefined, 'no debía fallar: ' + JSON.stringify(r && r.error));
  return r;
}

const tipos = (ev) => ev.map((x) => x.t);

test('create: estado inicial', () => {
  const e = nuevo(2);
  assert.equal(e.fase, 'elegir');
  assert.equal(e.turno, 0);
  assert.equal(e.v, 0);
  assert.deepEqual(e.espera, { asiento: 0, que: 'elegir-zona' });
  assert.equal(e.rows, 8);
  assert.equal(e.cols, 8);
  assert.equal(e.majority, 33);
});

test('acción fuera de turno: error y estado intacto', () => {
  const e = nuevo(2), antes = JSON.stringify(e);
  const r = Conquista.act(e, 1, { tipo: 'elegir', zona: 0 }, ctx([0]));
  assert.equal(r.error.codigo, 'NO_ES_TU_TURNO');
  assert.equal(JSON.stringify(e), antes);
});

test('flujo elegir -> responder atacante acierta zona neutral', () => {
  const c = ctx([0]);
  let e = nuevo(2);
  // encontrar zona adyacente legal para asiento 0 (empieza en esquina 0,0)
  const legales = Conquista.accionesLegales(e, 0);
  assert.ok(legales.length > 0);
  let r = ok(e, 0, legales[0], c);
  assert.equal(r.estado.fase, 'responder');
  assert.equal(r.estado.espera.asiento, 0);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.ok(tipos(r.eventos).includes('zona-conquistada') || tipos(r.eventos).includes('turno'));
});

test('defensa: atacante acierta contra zona rival, defensor responde', () => {
  // crear mapa donde asiento 0 puede atacar zona del asiento 1
  let e = nuevo(2);
  // forzar: poner zona adyacente bajo control de jugador 1
  // zona 0 es base de jugador 0 (esquina), buscar zona adyacente y asignar a jugador 1
  // legal targets son zonas adyacentes vacías o rivales
  e.zonas[1].owner = 1; // adyacente horizontalmente a (0,0) es (0,1) que es index 1 en row 0
  e.turno = 0; e.fase = 'elegir'; e.espera = { asiento: 0, que: 'elegir-zona' };
  const c = ctx([0, 0]); // atacante acierta, defensor acierta
  let r = ok(e, 0, { tipo: 'elegir', zona: 1 }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  // debe pasar a defensa, espera cambia al defensor
  assert.equal(r.estado.fase, 'responder');
  assert.equal(r.estado.espera.asiento, 1);
  assert.equal(r.estado.pendiente.tipo, 'defensa');
  r = ok(r.estado, 1, { tipo: 'responder', eleccion: 0 }, c);
  assert.ok(tipos(r.eventos).includes('zona-defendida'));
});

test('defensor falla -> atacante conquista', () => {
  let e = nuevo(2);
  e.zonas[1].owner = 1;
  e.turno = 0; e.fase = 'elegir'; e.espera = { asiento: 0, que: 'elegir-zona' };
  const c = ctx([0, 0]); // atacante acierta, defensor falla
  let r = ok(e, 0, { tipo: 'elegir', zona: 1 }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  r = ok(r.estado, 1, { tipo: 'responder', eleccion: 1 }, c);
  assert.ok(tipos(r.eventos).includes('zona-conquistada'));
});

test('defensor ausente/tiempo vencido = defensa fallida', () => {
  let e = nuevo(2);
  e.zonas[1].owner = 1;
  e.turno = 0; e.fase = 'elegir'; e.espera = { asiento: 0, que: 'elegir-zona' };
  const c = ctx([0, 0]);
  let r = ok(e, 0, { tipo: 'elegir', zona: 1 }, c);
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  // ahora es turno del defensor, saltar por tiempo
  let r2 = Conquista.saltar(r.estado, 'tiempo');
  assert.equal(r2.error, undefined);
  assert.ok(tipos(r2.eventos).includes('zona-conquistada'));
});

test('terminarPorTiempo gana el más con zonas', () => {
  let e = nuevo(3);
  e.asientos[0].zonas = 5; e.asientos[1].zonas = 10; e.asientos[2].zonas = 3;
  let r = Conquista.terminarPorTiempo(e);
  assert.equal(r.estado.ganador, 1);
  assert.equal(r.estado.motivoFin, 'tiempo');
});

test('view no contiene respuesta_correcta', () => {
  const c = ctx([0]);
  let e = ok(nuevo(2), 0, Conquista.accionesLegales(nuevo(2),0)[0], c).estado;
  const v = Conquista.view(e, 1);
  assert.ok(!/respuesta_correcta/.test(JSON.stringify(v)));
});

test('v sube en cada acción válida', () => {
  const c = ctx([0]);
  let e = nuevo(2);
  const v0 = e.v;
  let act = Conquista.accionesLegales(e,0)[0];
  e = ok(e,0,act,c).estado; assert.equal(e.v, v0+1);
  e = ok(e,0,{tipo:'responder',eleccion:0},c).estado; assert.equal(e.v, v0+2);
});

test('fuzz con accionesLegales al azar', () => {
  function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}}
  for(let s=1;s<=40;s++){
    let rnd = mulberry32(s), e = nuevo(2 + (s%3));
    const c = { rng: mulberry32(s+50), mazo: { n:0, map:{}, sacar(){const id='q'+(this.n++);this.map[id]=Math.floor(rnd()*4);return {id,opciones:['a','b','c','d']};}, esCorrecta(id,el){return this.map[id]===el;}, correcta(id){return this.map[id];}}};
    for(let paso=0;paso<6000 && e.fase!=='terminada';paso++){
      const as = e.espera.asiento;
      const legales = Conquista.accionesLegales(e,as);
      assert.ok(legales.length>0);
      const a = legales[Math.floor(rnd()*legales.length)];
      const r = Conquista.act(e,as,a,c);
      assert.equal(r.error,undefined);
      e = r.estado;
    }
    if(e.fase !== 'terminada'){
      const r2 = Conquista.terminarPorTiempo(e);
      assert.equal(r2.error,undefined);
      e = r2.estado;
    }
    assert.equal(e.fase,'terminada');
  }
});
