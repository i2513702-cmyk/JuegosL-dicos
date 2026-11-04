const fs=require('fs');
const s=fs.readFileSync('tests/carrera_rules.test.js','utf8');
const i=s.indexOf('racha otorga');
const j=s.indexOf("test('fallo",i);
console.log(s.slice(i,j));
