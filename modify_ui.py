import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update the toggle button!
code = re.sub(
    r'className="fixed bottom-6 right-6 z-\[9999\] bg-\[#007aff\] hover:bg-\[#005bb5\] text-white p-4 rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center justify-center gap-2"',
    'className="fixed bottom-3 right-3 z-[9999] bg-[#007aff] hover:bg-[#005bb5] text-white p-2.5 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center"',
    code
)

# Also remove the text "Desktop" or "Mobile" inside the toggle button so it's just an icon!
code = re.sub(
    r'<span className="font-bold">Desktop</span>',
    '',
    code
)
code = re.sub(
    r'<span className="font-bold">Mobile</span>',
    '',
    code
)

# 2. To make the hamburger menu available ALWAYS, I will add a floating hamburger menu button OR place it in the Views!
# Actually, the user says "que aparezcan las 3 rayitas para entrar al panel". If we add a floating hamburger menu in top-left, it will always be visible!
floating_hamburger = '''
        {/* HAMBURGER MENU (MOBILE ONLY) */}
        {isMobileMode && !showMobileSidebar && (
          <button 
            onClick={() => setShowMobileSidebar(true)} 
            className="fixed top-3 left-3 z-[9998] bg-[#202c33] text-white p-2.5 rounded-md shadow-lg transition-transform flex items-center justify-center border border-[#2a3942]"
          >
            <i className="ph ph-list text-xl"></i>
          </button>
        )}
'''

if 'HAMBURGER MENU (MOBILE ONLY)' not in code:
    code = code.replace('{/* MOBILE TOGGLE BUTTON (FLOATING) */}', floating_hamburger + '\n        {/* MOBILE TOGGLE BUTTON (FLOATING) */}')


with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated page.tsx")
