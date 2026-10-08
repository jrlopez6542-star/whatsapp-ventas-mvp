import sys

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("import Script from 'next/script';\n\"use client\";", "\"use client\";\nimport Script from 'next/script';")

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed")
