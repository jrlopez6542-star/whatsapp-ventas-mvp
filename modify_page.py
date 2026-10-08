import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove Plantillas and Analíticas
code = re.sub(r'<button[^>]*>[\s\S]*?<i className="ph ph-file-text text-lg"></i>[\s\S]*?Plantillas[\s\S]*?</button>', '', code)
code = re.sub(r'<button[^>]*>[\s\S]*?<i className="ph ph-chart-line-up text-lg"></i>[\s\S]*?Analíticas[\s\S]*?</button>', '', code)

# 2. Make mobile toggle smaller
code = code.replace(
    'fixed bottom-6 right-6 z-[9999] bg-[#007aff] hover:bg-[#005bb5] text-white p-4 rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center justify-center gap-2',
    'fixed bottom-4 right-4 z-[9999] bg-[#007aff] hover:bg-[#005bb5] text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center'
)

# 3. Add hamburger menu to chats header
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

# Ensure DashboardView and BotFlowsView receive conversations and orders
# Wait, they are imported. But they need real data props!
# I will change the injection to pass `conversations` and `orders` as props.
search_dashboard = '{tab === "orders" && <DashboardView />}'
replace_dashboard = '{tab === "orders" && <DashboardView conversations={conversations} orders={orders} />}'
code = code.replace(search_dashboard, replace_dashboard)

# Add imports for SettingsView and OrdersView
if 'import { SettingsView }' not in code:
    code = code.replace('import { DashboardView }', 'import { DashboardView }\nimport { SettingsView } from "./SettingsView";\nimport { OrdersView } from "./OrdersView";')

# Inject SettingsView
search_settings = '{tab === "settings" && <div className="text-white p-4">Configuración - En desarrollo</div>}'
replace_settings = '{tab === "settings" && <SettingsView />}'
code = code.replace(search_settings, replace_settings)

# Inject OrdersView! Wait, tab "orders" is already DashboardView!
# I need to add a new tab for Real Orders! Let's name it "real_orders"
# In the sidebar:
sidebar_insert = '''<button onClick={() => { setTab("real_orders" as any); setShowMobileSidebar(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition ${tab==='real_orders' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}`}>
                <i className="ph ph-receipt text-lg"></i> Pedidos
              </button>'''
code = code.replace('<nav className="px-2 mt-2 space-y-1 text-[13px] font-medium text-slate-400">', '<nav className="px-2 mt-2 space-y-1 text-[13px] font-medium text-slate-400">\n              ' + sidebar_insert)

# And in the main render block:
code = code.replace(replace_dashboard, replace_dashboard + '\n            {tab === "real_orders" && <OrdersView orders={orders} />}\n')

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("Updated page.tsx")
