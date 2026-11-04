import sys, os
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root:
        continue
    for f in files:
        if f.endswith('.js') or f.endswith('.json'):
            try:
                path = os.path.join(root,f)
                with open(path,encoding='utf-8',errors='ignore') as fh:
                    content = fh.read()
                    if 'batalla' in content.lower():
                        # find first line
                        for i,l in enumerate(content.splitlines()):
                            if 'batalla' in l.lower():
                                print(path+':'+str(i+1)+':'+l)
                                break
                        break  # just first occurrence per file
            except:
                pass
