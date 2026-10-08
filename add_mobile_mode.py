import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add isMobileMode state
if 'const [isMobileMode, setIsMobileMode] = useState(false);' not in code:
    code = code.replace(
        'const [showQrModal, setShowQrModal] = useState(false);',
        'const [showQrModal, setShowQrModal] = useState(false);\n  const [isMobileMode, setIsMobileMode] = useState(false);\n  const [showMobileSidebar, setShowMobileSidebar] = useState(false);\n  const [showMobileDetails, setShowMobileDetails] = useState(false);'
    )

# Replace the root container
root_div_search = '<div className="bg-[#0b141a] text-slate-300 font-sans antialiased h-screen w-screen overflow-hidden flex select-none text-[13px]">'
root_div_replace = '''<div className={`bg-[#0b141a] text-slate-300 font-sans antialiased h-screen w-screen overflow-hidden flex select-none text-[13px] ${isMobileMode ? 'justify-center items-center bg-[#000000]' : ''}`}>
        
        {/* MOBILE TOGGLE BUTTON (FLOATING) */}
        <button 
          onClick={() => setIsMobileMode(!isMobileMode)} 
          className="fixed bottom-6 right-6 z-[9999] bg-[#007aff] hover:bg-[#005bb5] text-white p-4 rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center justify-center gap-2"
        >
          {isMobileMode ? (
            <><i className="ph ph-desktop text-2xl"></i> <span className="font-semibold pr-2">Desktop</span></>
          ) : (
            <><i className="ph ph-device-mobile text-2xl"></i> <span className="font-semibold pr-2">Móvil</span></>
          )}
        </button>

        {/* MAIN CONTAINER (MOBILE FRAME OR FULL SCREEN) */}
        <div className={isMobileMode ? "w-[375px] h-[812px] bg-[#0b141a] relative overflow-hidden flex rounded-[2.5rem] border-[8px] border-[#1f2c34] shadow-2xl" : "flex-1 flex overflow-hidden w-full h-full"}>
'''

code = code.replace(root_div_search, root_div_replace)

# Sidebar Left (Navegación)
# Find: <aside className="w-[220px] bg-[#121b22] border-r border-[#1f2c34] flex flex-col justify-between shrink-0">
sidebar_left_search = '<aside className="w-[220px] bg-[#121b22] border-r border-[#1f2c34] flex flex-col justify-between shrink-0">'
sidebar_left_replace = '''<aside className={`${isMobileMode ? (showMobileSidebar ? 'absolute inset-y-0 left-0 w-[260px] z-50 transition-transform translate-x-0' : 'absolute inset-y-0 left-0 w-[260px] z-50 transition-transform -translate-x-full') : 'w-[220px]'} bg-[#121b22] border-r border-[#1f2c34] flex flex-col justify-between shrink-0`}>
          {isMobileMode && showMobileSidebar && (
             <div className="fixed inset-0 bg-black/50 z-[-1]" onClick={() => setShowMobileSidebar(false)}></div>
          )}'''
code = code.replace(sidebar_left_search, sidebar_left_replace)

# Chats List Column
# Find: <section className="w-[340px] bg-[#111b21] border-r border-[#1f2c34] flex flex-col shrink-0">
chats_list_search = '<section className="w-[340px] bg-[#111b21] border-r border-[#1f2c34] flex flex-col shrink-0">'
chats_list_replace = '''<section className={`${isMobileMode ? (selectedConvId ? 'hidden' : 'w-full') : 'w-[340px]'} bg-[#111b21] border-r border-[#1f2c34] flex flex-col shrink-0`}>'''
code = code.replace(chats_list_search, chats_list_replace)

# Main Chat View
# Find: <main className="flex-1 bg-[#0b141a] flex flex-col justify-between relative overflow-hidden" style={{backgroundImage: "url('https://whatsapp-ventas-mvp.vercel.app/bg-chat.png')", backgroundSize: 'cover', backgroundBlendMode: 'overlay', backgroundColor: 'rgba(11,20,26,0.95)'}}>
main_chat_search = '<main className="flex-1 bg-[#0b141a] flex flex-col justify-between relative overflow-hidden"'
main_chat_replace = '<main className={`${isMobileMode ? (selectedConvId ? "w-full" : "hidden") : "flex-1"} bg-[#0b141a] flex flex-col justify-between relative overflow-hidden`}'
code = code.replace(main_chat_search, main_chat_replace)

# Add Hamburger button to Chats List Header
# Find: <h2 className="text-xl font-bold text-white mb-4">Chats en Vivo</h2>
chats_header_search = '<h2 className="text-xl font-bold text-white mb-4">Chats en Vivo</h2>'
chats_header_replace = '''<div className="flex items-center gap-3 mb-4">
                  {isMobileMode && (
                    <button onClick={() => setShowMobileSidebar(true)} className="text-white p-1 hover:bg-[#202c33] rounded">
                      <i className="ph ph-list text-2xl"></i>
                    </button>
                  )}
                  <h2 className="text-xl font-bold text-white">Chats en Vivo</h2>
                </div>'''
code = code.replace(chats_header_search, chats_header_replace)

# Add Back button and Details button to Chat Header
# Find: <h2 className="text-[16px] font-bold text-white leading-tight">
chat_name_search = '<div>\n                        <h2 className="text-[16px] font-bold text-white leading-tight">'
chat_name_replace = '''{isMobileMode && (
                        <button onClick={() => setSelectedConvId(null)} className="mr-2 text-slate-300 hover:text-white flex items-center">
                          <i className="ph ph-caret-left text-2xl"></i>
                        </button>
                      )}
                      <div>
                        <h2 className="text-[16px] font-bold text-white leading-tight">'''
code = code.replace(chat_name_search, chat_name_replace)

# Top Right Action Buttons (Pausar Bot, Cerrar Caso)
# If mobile mode, condense them.
buttons_search = '''<div className="flex items-center gap-3">
                      {conversations.find(c => c.id === selectedConvId)?.status === "bot" ? ('''
buttons_replace = '''<div className="flex items-center gap-2">
                      {isMobileMode && (
                        <button onClick={() => setShowMobileDetails(true)} className="text-slate-300 hover:text-white p-2 text-xl rounded-lg hover:bg-[#202c33] transition">
                          <i className="ph ph-info"></i>
                        </button>
                      )}
                      {conversations.find(c => c.id === selectedConvId)?.status === "bot" ? ('''
code = code.replace(buttons_search, buttons_replace)

# Sidebar Right (Contact Details)
# Find: <aside className="w-[280px] bg-[#121b22] border-l border-[#1f2c34] flex flex-col shrink-0 overflow-y-auto">
details_search = '<aside className="w-[280px] bg-[#121b22] border-l border-[#1f2c34] flex flex-col shrink-0 overflow-y-auto">'
details_replace = '''<aside className={`${isMobileMode ? (showMobileDetails ? 'absolute inset-y-0 right-0 w-[280px] z-50 transition-transform translate-x-0' : 'absolute inset-y-0 right-0 w-[280px] z-50 transition-transform translate-x-full') : 'w-[280px]'} bg-[#121b22] border-l border-[#1f2c34] flex flex-col shrink-0 overflow-y-auto`}>
                {isMobileMode && showMobileDetails && (
                   <div className="fixed inset-0 bg-black/50 z-[-1]" onClick={() => setShowMobileDetails(false)}></div>
                )}
                {isMobileMode && (
                  <div className="p-4 border-b border-[#1f2c34] flex justify-between items-center bg-[#111b21]">
                    <span className="font-bold text-white">Detalles</span>
                    <button onClick={() => setShowMobileDetails(false)} className="text-slate-400 hover:text-white text-xl"><i className="ph ph-x"></i></button>
                  </div>
                )}'''
code = code.replace(details_search, details_replace)

# Improve Interactive Buttons
# The buttons inside the chat are rendered as:
# <div key={i} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-[#00a884] text-[14.5px] py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer shadow-sm">
btn_search = '<div key={i} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-[#00a884] text-[14.5px] py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer shadow-sm">'
btn_replace = '<div key={i} className="w-full bg-[#1e2a30] hover:bg-[#26353d] border border-[#2a3942] text-[#53bdeb] text-[15px] font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-md mt-1">'
code = code.replace(btn_search, btn_replace)

# Close the new MAIN CONTAINER div at the very end
code = code.replace(
'''{tab === "qr" && <div className="text-white p-4">QR / Vincular - En desarrollo</div>}
          </main>
        )}

      </div>
    </>
  );''', 
'''{tab === "qr" && <div className="text-white p-4">QR / Vincular - En desarrollo</div>}
          </main>
        )}

        </div> {/* END OF MAIN CONTAINER */}

      </div>
    </>
  );'''
)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Mobile mode applied successfully!")
