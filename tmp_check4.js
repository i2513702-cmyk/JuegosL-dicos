const fs = require('fs');
const s = fs.readFileSync('js/shared/ludo-rules.js','utf8');
const i = s.indexOf('function create');
if(i>=0){ const j = s.indexOf('\n  function ', i+1); console.log(s.slice(i, j>i?Math.min(i+200,j):i+200)); }
