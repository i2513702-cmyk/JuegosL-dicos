const fs=require('fs');
const s=fs.readFileSync('tests/partidas_socket.test.js','utf8');
const i=s.indexOf('crear: clave');
const j=s.indexOf("test('crear: sin HOST_KEY",i);
console.log(s.slice(i,j));
