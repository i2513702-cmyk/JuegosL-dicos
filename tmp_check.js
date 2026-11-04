const fs = require('fs');
const s = fs.readFileSync('js/shared/ludo-rules.js','utf8');
const i = s.indexOf('terminarPorTiempo');
const j = s.indexOf('function saltar', i);
if(i >= 0) {
  console.log(s.slice(i, j > i ? Math.min(i+400, j) : i+400));
}
