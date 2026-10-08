import os

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = 'import { QrModal } from "./QrModal";\n' + code

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
