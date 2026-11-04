const fs = require('fs');
const s = fs.readFileSync('js/shared/ludo-rules.js','utf8');
const i = s.indexOf('function clasificacion');
if(i>=0){const j=s.indexOf('function terminarPorTiempo',i); if(j>i) console.log(s.slice(i, Math.min(i+250,j))); else console.log(s.slice(i,i+250));}
