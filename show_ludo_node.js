const fs=require('fs');
const s=fs.readFileSync('js/games/ludo.js','utf8');
const idx=s.indexOf('initNet');
if(idx>=0){console.log(s.slice(idx-60,idx+600));}
