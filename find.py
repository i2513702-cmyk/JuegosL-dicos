with open('js/shared/carrera-rules.js') as f:
    for i,l in enumerate(f,1):
        if 'respondida' in l:
            print(i)
            print(l)
            break
