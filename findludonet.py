with open('js/games/ludo.js',encoding='utf-8',errors='ignore') as f:
    data=f.read()
idx = data.find('initNet')
if idx>=0:
    print(data[max(0,idx-80):idx+300])
else:
    print('not found')
