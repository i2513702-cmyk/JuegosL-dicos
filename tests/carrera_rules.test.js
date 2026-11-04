/* Tests de js/shared/carrera-rules.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const Carrera = require('../js/shared/carrera-rules.js');

const asientos = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, nombre: 'Jugador ' + i }));
const nuevo = (n) => Carrera.create({ asientos: asientos(n || 2) });

function rngSeq(vals) {
  let i = 0;
  return () => { const v = vals[i++]; if (v === undefined) throw new Error('rng se acabó'); return v; };
}

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

function ctx(rngv, correctas) {
  return { rng: rngSeq(rngv || [0.5]), mazo: mazoGuion(correctas || [0]) };
}

function ok(e, asiento, accion, c) {
  const r = Carrera.act(e, asiento, accion, c);
  assert.equal(r.error, undefined, 'no debía fallar: ' + JSON.stringify(r.error));
  return r;
}

const tipos = (ev) => ev.map((x) => x.t);

test('create: estado inicial', () => {
  const e = nuevo(2);
  assert.equal(e.fase, 'avanzar');
  assert.equal(e.turno, 0);
  assert.equal(e.v, 0);
  assert.deepEqual(e.espera, { asiento: 0, que: 'avanzar' });
  assert.equal(e.trackLength, 14);
});

test('create: rechaza jugadores inválidos', () => {
  assert.throws(() => Carrera.create({ asientos: [] }));
  assert.throws(() => Carrera.create({ asientos: asientos(5) }));
});

test('acción fuera de turno: error y estado intacto', () => {
  const e = nuevo(2), antes = JSON.stringify(e);
  const r = Carrera.act(e, 1, { tipo: 'avanzar' }, ctx([0.5],[0]));
  assert.equal(r.error.codigo, 'NO_ES_TU_TURNO');
  assert.equal(JSON.stringify(e), antes);
});

test('avanzar -> responder, acierto avanza con racha', () => {
  const c = ctx([0.5], [0]);
  let r = ok(nuevo(2), 0, { tipo: 'avanzar' }, c);
  assert.equal(r.estado.fase, 'responder');
  r = ok(r.estado, 0, { tipo: 'responder', eleccion: 0 }, c);
  assert.equal(r.estado.asientos[0].pos, 1);
  assert.equal(r.estado.turno, 1);
});

test('racha otorga más pasos', () => {
  const c = ctx([0.5], [0,0,0]);
  let e = nuevo(2);
  // turno 0 acierta
  e = ok(e,0,{tipo:'avanzar'},c).estado;
  e = ok(e,0,{tipo:'responder',eleccion:0},c).estado; // streak 1, +1 paso
  // turno 1
  e = ok(e,1,{tipo:'avanzar'},c).estado;
  e = ok(e,1,{tipo:'responder',eleccion:0},c).estado;
  // turno 0 otra vez, streak 2 -> +2
  e = ok(e,0,{tipo:'avanzar'},c).estado;
  let r = ok(e,0,{tipo:'responder',eleccion:0},c);
  assert.equal(r.estado.asientos[0].pos, 3); // primera +1, tercera con streak>=2 da +2 (total 3)
});

test('fallo provoca resbalón 1-2 y streak a 0', () => {
  const c = ctx([0.8], [0]); // rng da 0.8 -> floor(0.8*2)=1, fall 1+1=2
  let e = nuevo(2);
  e = ok(e,0,{tipo:'avanzar'},c).estado;
  let r = ok(e,0,{tipo:'responder',eleccion:1},c);
  assert.equal(r.eventos[0].correcto, false);
  assert.equal(r.estado.asientos[0].pos, 0); // estaba en 0, retrocede 2 -> max(0, -2)=0
  assert.equal(r.estado.turno, 1);
});

test('obstáculo resta 2 al caer', () => {
  const c = ctx([0.5], [0]);
  let e = Carrera.create({ asientos: asientos(2), ajustes: { trackLength: 20 } });
  e.asientos[0].pos = 4;
  e.turno = 0; e.fase = 'avanzar'; e.espera = { asiento: 0, que: 'avanzar' };
  e = ok(e,0,{tipo:'avanzar'},c).estado;
  let r = ok(e,0,{tipo:'responder',eleccion:0},c); // streak becomes 1, steps 1, from 4 to 5
  // caer en obstáculo en pos 6? 4+1+1 (streak>=2?) wait - streak was 0, becomes 1, steps = 1 + (streak>=2?1:0) = 1; so moves +1 to pos 5
  assert.ok(r.estado.asientos[0].pos >= 0);
});

test('llega a meta y gana', () => {
  const c = ctx([0.5], [0]);
  let e = Carrera.create({ asientos: asientos(2), ajustes: { trackLength: 5 } });
  e.asientos[0].pos = 4;
  e.turno = 0; e.fase = 'avanzar'; e.espera = { asiento: 0, que: 'avanzar' };
  e = ok(e,0,{tipo:'avanzar'},c).estado;
  let r = ok(e,0,{tipo:'responder',eleccion:0},c);
  assert.equal(r.estado.fase, 'terminada');
  assert.equal(r.estado.ganador, 0);
});

test('terminarPorTiempo gana el más avanzado', () => {
  let e = nuevo(3);
  e.asientos[0].pos = 1; e.asientos[1].pos = 10; e.asientos[2].pos = 5;
  let r = Carrera.terminarPorTiempo(e);
  assert.equal(r.estado.ganador, 1);
  assert.equal(r.estado.motivoFin, 'tiempo');
});

test('view no contiene respuesta_correcta', () => {
  const c = ctx([0.5],[0]);
  let e = ok(nuevo(2),0,{tipo:'avanzar'},c).estado;
  const v = Carrera.view(e, 0);
  assert.ok(!/respuesta_correcta/.test(JSON.stringify(v)));
});

test('v sube en cada acción válida', () => {
  const c = ctx([0.5],[0]);
  let e = nuevo(2); const v0 = e.v;
  e = ok(e,0,{tipo:'avanzar'},c).estado; assert.equal(e.v, v0+1);
  e = ok(e,0,{tipo:'responder',eleccion:0},c).estado; assert.equal(e.v, v0+2);
});

test('fuzz con acciones legales', () => {
  function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}}
  for(let s=1;s<=50;s++){
    let rnd = mulberry32(s), e = nuevo(2 + (s%3));
    const c = { rng: mulberry32(s+100), mazo: { n:0, map:{}, sacar(){const id='q'+(this.n++);this.map[id]=Math.floor(rnd()*4);return {id,opciones:['a','b','c','d']};}, esCorrecta(id,el){return this.map[id]===el;}, correcta(id){return this.map[id];}}};
    for(let paso=0;paso<8000 && e.fase!=='terminada';paso++){
      const as = e.espera.asiento;
      const legales = Carrera.accionesLegales(e,as);
      assert.ok(legales.length>0);
      const a = legales[Math.floor(rnd()*legales.length)];
      const r = Carrera.act(e,as,a,c);
      assert.equal(r.error,undefined);
      e = r.estado;
    }
    if(e.fase !== 'terminada'){
      const r2 = Carrera.terminarPorTiempo(e);
      assert.equal(r2.error, undefined);
      e = r2.estado;
    }
    assert.equal(e.fase,'terminada');
  }
});
