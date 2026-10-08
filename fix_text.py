import os

path = os.path.join('app/panel', 'page.tsx')
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<span className="font-semibold pr-2">Desktop</span>', '')
content = content.replace('<span className="font-semibold pr-2">Mobile</span>', '')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
