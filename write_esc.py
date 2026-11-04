with open('js/games/carrera.js','r',encoding='utf-8-sig') as f:
    s = f.read()

esc = "  const esc = function(x){ return String(x == null ? '' : x).replace(/[&<>\"']/g, function(c){ var map={'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}; return map[c] || c; }); };\n"
if 'const esc' not in s:
    s2 = s.replace("  const MODE = 'carrera';\n", "  const MODE = 'carrera';\n" + esc)
    with open('js/games/carrera.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('done')
else:
    print('exists')
