const Carrera = require('./js/shared/carrera-rules.js');
const asientos = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, nombre: 'Jugador ' + i }));
const nuevo = (n) => Carrera.create({ asientos: asientos(n || 2) });
function rngSeq(vals){let i=0;return ()=>{const v=vals[i++];if(v===undefined)throw new Error('rng');return v;};}
function mazoGuion(correctas){let i=0;const mapa={};return{sacar(){const c=correctas[i];if(c===undefined)throw new Error('preg');const id='q'+(i++);mapa[id]=c;return {id,opciones:['a','b','c','d']};},esCorrecta:(id,el)=>mapa[id]===el,correcta:(id)=>mapa[id]};}
function ctx(rngv,correctas){return {rng:rngSeq(rngv||[0.5]),mazo:mazoGuion(correctas||[0])};}
function ok(e,a,ac,c){const r=Carrera.act(e,a,ac,c);if(r.error){console.log('ERR',r.error);process.exit(1);}return r;}
let c = ctx([0.8],[1]);
let e = nuevo(2);
e = ok(e,0,{tipo:'avanzar'},c).estado;
let r = ok(e,0,{tipo:'responder',eleccion:1},c);
console.log(r.eventos[0].correcto);
console.log(r.estado.asientos[0].pos);
console.log(r.estado.turno);
console.log(r.estado.asientos[0].streak);
