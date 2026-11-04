for fn in ['js/shared/ludo-rules.js', 'js/shared/carrera-rules.js', 'js/shared/conquista-rules.js']:
    try:
        with open(fn) as f:
            for i,l in enumerate(f,1):
                if 'respondida' in l:
                    print('===', fn, i)
                    print(l)
                    break
    except Exception as e:
        print(e)
