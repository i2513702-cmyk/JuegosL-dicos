const fs=require('fs');
const s=fs.readFileSync('tests/carrera_rules.test.js','utf8');
const i=s.indexOf("fallo provoca");
const j=s.indexOf("test('obstáculo",i);
console.log(s.slice(i,j));
