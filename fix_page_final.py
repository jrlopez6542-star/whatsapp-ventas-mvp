import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. REMOVE PLANTILLAS AND ANALÍTICAS
# The exact buttons were:
# <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
#   <i className="ph ph-file-text text-lg"></i> Plantillas
# </button>
code = re.sub(r'<button[^>]*>\s*<i className="ph ph-file-text text-lg"></i> Plantillas\s*</button>', '', code)
code = re.sub(r'<button[^>]*>\s*<i className="ph ph-chart-line-up text-lg"></i> Analíticas\s*</button>', '', code)

# 2. Add Hamburger menu to header
search_header = '''<header className="h-16 border-b border-[#1f2c34] bg-[#121b22] px-6 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-white font-bold">Chats en Vivo</h2>'''
replace_header = '''<header className="h-16 border-b border-[#1f2c34] bg-[#121b22] px-4 md:px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {isMobileMode && (
                  <button onClick={() => setShowMobileSidebar(true)} className="text-slate-400 hover:text-white text-2xl transition block md:hidden">
                    <i className="ph ph-list"></i>
                  </button>
                )}
                <div>
                  <h2 className="text-white font-bold flex items-center gap-2">Chats en Vivo</h2>'''
code = code.replace(search_header, replace_header)

# 3. Modify mobile toggle
search_toggle = '''<button 
          onClick={toggleMobileMode} 
          className="fixed bottom-6 right-6 z-[9999] bg-[#007aff] hover:bg-[#005bb5] text-white p-4 rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center justify-center gap-2"
        >'''
replace_toggle = '''<button 
          onClick={toggleMobileMode} 
          className="fixed bottom-4 right-4 z-[9999] bg-[#007aff] hover:bg-[#005bb5] text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center"
        >'''
code = code.replace(search_toggle, replace_toggle)

# 4. Inject Orders and Settings
imports = '''import { DashboardView } from "./DashboardView";
import { SettingsView } from "./SettingsView";
import { OrdersView } from "./OrdersView";'''
code = code.replace('import { DashboardView } from "./DashboardView";', imports)

# 5. Insert Real Orders button in Sidebar
sidebar_insert = '''<button onClick={() => { setTab("real_orders" as any); setShowMobileSidebar(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition ${tab==='real_orders' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}`}>
                <i className="ph ph-receipt text-lg"></i> Pedidos
              </button>'''
code = code.replace('<nav className="px-2 mt-2 space-y-1 text-[13px] font-medium text-slate-400">', '<nav className="px-2 mt-2 space-y-1 text-[13px] font-medium text-slate-400">\n              ' + sidebar_insert)

# 6. Pass props to DashboardView and render others
search_render = '''{tab === "orders" && <DashboardView />}
            {tab === "catalog" && <BotFlowsView />}
            {tab === "settings" && <div className="text-white p-4">Configuración - En desarrollo</div>}'''
replace_render = '''{tab === "orders" && <DashboardView conversations={conversations} orders={orders} />}
            {tab === "real_orders" && <OrdersView orders={orders} />}
            {tab === "catalog" && <BotFlowsView />}
            {tab === "settings" && <SettingsView />}'''
code = code.replace(search_render, replace_render)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Restored and modified page.tsx")
