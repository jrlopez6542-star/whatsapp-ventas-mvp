import os

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace('ph ph-desktop text-2xl', 'ph ph-desktop text-xl')
code = code.replace('ph ph-device-mobile text-2xl', 'ph ph-device-mobile text-xl')

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
