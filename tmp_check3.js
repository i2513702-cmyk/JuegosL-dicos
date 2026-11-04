const fs = require('fs');
const s = fs.readFileSync('js/shared/ludo-rules.js','utf8');
const i = s.indexOf('function saltar');
const j = s.indexOf('  function terminarPorTiempo');
if(i>=0){ console.log(s.slice(i, j>i?Math.min(i+600,j):i+600)); }
