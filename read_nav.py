with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()
start = code.find('<nav className="px-2 mt-2')
print(code[start:start+1500])
