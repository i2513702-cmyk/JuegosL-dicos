with open('js/shared/ludo-rules.js') as f:
    for i,l in enumerate(f,1):
        if 110<=i<=125:
            print(i,l.rstrip())
