import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add imports
if 'import { DashboardView }' not in code:
    code = code.replace(
        'import Link from "next/link";',
        'import Link from "next/link";\nimport { DashboardView } from "./DashboardView";\nimport { BotFlowsView } from "./BotFlowsView";'
    )

# Replace the stubs
search_orders = '{tab === "orders" && <div className="text-white p-4">Pedidos - En desarrollo</div>}'
replace_orders = '{tab === "orders" && <DashboardView />}'
code = code.replace(search_orders, replace_orders)

search_catalog = '{tab === "catalog" && <div className="text-white p-4">Catálogo - En desarrollo</div>}'
replace_catalog = '{tab === "catalog" && <BotFlowsView />}'
code = code.replace(search_catalog, replace_catalog)

# Replace the padding of main container
search_main = '<main className="flex-1 overflow-y-auto p-8 bg-[#0b141a]">'
replace_main = '<main className="flex-1 overflow-y-auto bg-[#0b141a]">'
code = code.replace(search_main, replace_main)

# Rename the buttons in the sidebar
search_pedidos = '<span className="font-medium">Pedidos</span>'
replace_pedidos = '<span className="font-medium">Dashboard</span>'
code = code.replace(search_pedidos, replace_pedidos)

search_catalogo = '<span className="font-medium">Catálogo</span>'
replace_catalogo = '<span className="font-medium">Bots/Flujos</span>'
code = code.replace(search_catalogo, replace_catalogo)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Injected views successfully!")
