import sys

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Make the rendered buttons on the web inert
search_btn = r'<div key={i} className="w-full bg-[#1e2a30] hover:bg-[#26353d] border border-[#2a3942] text-[#53bdeb] text-[15px] font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-md mt-1">'
replace_btn = r'<div key={i} className="w-full bg-[#1e2a30]/30 border border-[#2a3942]/50 text-[#53bdeb]/50 text-[13px] py-1.5 px-3 rounded-lg flex items-center justify-center mt-1 cursor-default pointer-events-none opacity-80">'

code = code.replace(search_btn, replace_btn)

# Ensure mobile mode is actually full screen, not a weird box
# We replaced this earlier with node but node failed. Let's do it cleanly here.
search_bezel = 'w-[375px] h-[812px] bg-[#0b141a] relative overflow-hidden flex rounded-[2.5rem] border-[8px] border-[#1f2c34] shadow-2xl'
replace_bezel = 'w-full h-full flex-1 bg-[#0b141a] relative overflow-hidden flex'
code = code.replace(search_bezel, replace_bezel)

# Remove justify-center from root container
search_root = 'justify-center items-center bg-[#000000]'
replace_root = 'bg-[#0b141a]'
code = code.replace(search_root, replace_root)

# Auto detect mobile mode in useEffect
search_useeffect = 'const [isMobileMode, setIsMobileMode] = useState(false);'
replace_useeffect = 'const [isMobileMode, setIsMobileMode] = useState(false);\n  useEffect(() => { if (typeof window !== "undefined" && window.innerWidth < 768) setIsMobileMode(true); }, []);'
if 'window.innerWidth < 768' not in code:
    code = code.replace(search_useeffect, replace_useeffect)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed")
