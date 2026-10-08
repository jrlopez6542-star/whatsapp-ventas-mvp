import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

search_float = 'className="fixed top-3 left-3 z-[9998] bg-[#202c33] text-white p-2.5 rounded-md shadow-lg transition-transform flex items-center justify-center border border-[#2a3942]"'
replace_float = 'className="fixed top-4 left-4 z-[999999] bg-[#007aff] hover:bg-[#005bb5] text-white p-3 rounded-full shadow-2xl transition-transform flex items-center justify-center"'
code = code.replace(search_float, replace_float)

search_header = '''{isMobileMode && (
                  <button onClick={() => setShowMobileSidebar(true)} className="text-slate-400 hover:text-white text-2xl transition block md:hidden">
                    <i className="ph ph-list"></i>
                  </button>
                )}'''
code = code.replace(search_header, '')

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
