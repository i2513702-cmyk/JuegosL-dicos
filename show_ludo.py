with open('js/games/ludo.js',encoding='utf-8',errors='ignore') as f:
    lines=f.readlines()
for i,l in enumerate(lines[600:806],601):
    print(i,l.rstrip())
