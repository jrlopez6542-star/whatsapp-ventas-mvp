with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove "Plantillas" button explicitly
plantillas_btn = '''<button className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
                <i className="ph ph-article text-lg"></i> Plantillas
              </button>'''
code = code.replace(plantillas_btn, '')

# 2. Remove "Contactos" button explicitly
contactos_btn = '''<button className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
                <i className="ph ph-users text-lg"></i> Contactos
              </button>'''
code = code.replace(contactos_btn, '')

# 3. Add setShowMobileSidebar(false) to all onClick setTab commands
code = code.replace('onClick={() => setTab("orders")}', 'onClick={() => { setTab("orders"); setShowMobileSidebar(false); }}')
code = code.replace('onClick={() => setTab("chats")}', 'onClick={() => { setTab("chats"); setShowMobileSidebar(false); }}')

# 4. Remove <span className="font-bold">Desktop</span>
code = code.replace('<span className="font-bold">Desktop</span>', '')
code = code.replace('<span className="font-bold">Mobile</span>', '')

# 5. Global hamburger menu fixes
# Let's ensure the hamburger menu has the right z-index
code = code.replace('className="fixed top-3 left-3 z-[9998] bg-[#202c33] text-white p-2.5 rounded-md shadow-lg transition-transform flex items-center justify-center border border-[#2a3942]"',
                    'className="fixed top-4 left-4 z-[999999] bg-[#007aff] hover:bg-[#005bb5] text-white p-3 rounded-full shadow-2xl transition-transform flex items-center justify-center"')

# 6. Remove the old hamburger from the header of Chats En Vivo
header_hamburger = '''{isMobileMode && (
                  <button onClick={() => setShowMobileSidebar(true)} className="text-white p-1 hover:bg-[#202c33] rounded">
                    <i className="ph ph-list text-2xl"></i>
                  </button>
                )}'''
code = code.replace(header_hamburger, '')

# 7. Also make sure the float button is properly large for tapping
code = code.replace('className="fixed bottom-3 right-3 z-[9999] bg-[#007aff] hover:bg-[#005bb5] text-white p-2.5 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center"',
                    'className="fixed bottom-4 right-4 z-[999999] bg-[#007aff] hover:bg-[#005bb5] text-white p-3.5 rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center justify-center"')

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("page.tsx updated safely")
