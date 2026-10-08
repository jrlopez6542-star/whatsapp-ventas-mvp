import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Strip the "Desktop" and "Mobile" labels from the floating button
code = re.sub(r'<span className="font-bold">Desktop</span>', '', code)
code = re.sub(r'<span className="font-bold">Mobile</span>', '', code)

# Fix the button classes just in case it's still large
code = re.sub(
    r'className="fixed bottom-\d+ right-\d+ z-\[9999+\] bg-\[#007aff\].*?"',
    'className="fixed bottom-4 right-4 z-[99999] bg-[#007aff] hover:bg-[#005bb5] text-white p-3 rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center justify-center"',
    code
)

# 2. Fix the Sidebar not closing!
# I need to ensure ALL <button onClick={() => setTab(...) }> have setShowMobileSidebar(false)
code = re.sub(
    r'onClick={\(\) => setTab\("([^"]+)"\)}',
    r'onClick={() => { setTab("\1"); setShowMobileSidebar(false); }}',
    code
)

# Also ensure "Plantillas" and "Contactos" are removed! The user's screenshot still shows "Plantillas" and "Contactos"!
# Wait, my previous regex to remove Plantillas might have failed!
code = re.sub(r'<button[^>]*>\s*<i className="ph ph-file-text text-lg"></i>\s*Plantillas\s*</button>', '', code)
code = re.sub(r'<button[^>]*>\s*<i className="ph ph-users text-lg"></i>\s*Contactos\s*</button>', '', code)
# What if the icon class is different? Let's just remove buttons that contain "Plantillas" or "Contactos" or "Analíticas"
code = re.sub(r'<button[^>]*>[\s\S]*?Plantillas[\s\S]*?</button>', '', code)
code = re.sub(r'<button[^>]*>[\s\S]*?Contactos[\s\S]*?</button>', '', code)
code = re.sub(r'<button[^>]*>[\s\S]*?Analíticas[\s\S]*?</button>', '', code)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed mobile issues!")
