const Carrera = require('./js/shared/carrera-rules.js');
const asientos = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, nombre: 'Jugador ' + i }));
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}}
for(let s=1;s<=50;s++){
  let rnd = mulberry32(s), e = Carrera.create({ asientos: asientos(2 + (s%3)) });
  const c = { rng: mulberry32(s+100), mazo: { n:0, map:{}, sacar(){const id='q'+(this.n++);this.map[id]=Math.floor(rnd()*4);return {id,opciones:['a','b','c','d']};}, esCorrecta(id,el){return this.map[id]===el;}, correcta(id){return this.map[id];}}};
  for(let paso=0;paso<5000 && e.fase!=='terminada';paso++){
    const as = e.espera.asiento;
    const legales = Carrera.accionesLegales(e,as);
    if(legales.length===0){console.log('bad',s);break;}
    const a = legales[Math.floor(rnd()*legales.length)];
    const r = Carrera.act(e,as,a,c);
    if(r.error){console.log('err',s);break;}
    e = r.estado;
  }
  if(e.fase!=='terminada'){console.log('NO TERM',s,e.fase);break;}
}
console.log('done');
