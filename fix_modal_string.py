import os

with open('app/panel/QrModal.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace literal backslash-escaped template literal
bad = r"width: \`\${(secondsRemaining / 30) * 100}%\`"
good = r"width: `${(secondsRemaining / 30) * 100}%`"
code = code.replace(bad, good)

with open('app/panel/QrModal.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
