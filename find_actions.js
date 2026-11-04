const fs = require('fs');
function walk(d){
  for(let f of fs.readdirSync(d)){
    let p = d + '/' + f;
    let st = fs.statSync(p);
    if(st.isDirectory()){
      if(p.includes('node_modules')) continue;
      walk(p);
    }else if(f.endsWith('.js')){
      let s = fs.readFileSync(p,'utf8');
      if(s.includes('accionesLegales')) console.log(p);
    }
  }
}
walk('.');
