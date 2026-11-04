with open('js/app.js', encoding='utf-8', errors='ignore') as f:
    for i,l in enumerate(f,1):
        if 'sectionSalaDocente' in l or 'Nueva partida' in l or 'Unirme con código' in l or 'startGame' in l:
            print(i, l.rstrip())
            if i > 2000: break
