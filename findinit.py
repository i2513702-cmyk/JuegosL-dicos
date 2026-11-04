import os
for root, dirs, files in os.walk('js/games'):
    for f in files:
        path = os.path.join(root,f)
        with open(path,encoding='utf-8',errors='ignore') as fh:
            for i,l in enumerate(fh):
                if 'initNet' in l:
                    print(path+':'+str(i+1)+':'+l)
                    break
