const L = require('./js/shared/ludo-rules');
const asientos = Array.from({length:2},(_,i)=>({id:'p'+i,nombre:'J'+i}));
let e = L.create({asientos});
console.log(e.fase, e.espera);
const r = L.act(e, 0, {tipo:'tirar'}, {rng:()=>0.01, mazo:{sacar:()=>({id:'q1',opciones:['a','b','c','d']}), esCorrecta:()=>true, correcta:()=>0}});
console.log(r.estado.fase, r.estado.espera, r.estado.pendiente ? 'pend' : null);
