import os

for file in ['DashboardView.tsx', 'OrdersView.tsx', 'SettingsView.tsx', 'BotFlowsView.tsx']:
    path = os.path.join('app/panel', file)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace('className="p-6 text-slate-300', 'className="p-6 pt-16 md:pt-6 text-slate-300')
    content = content.replace('className="flex-1 flex flex-col bg-[#0b141a] text-slate-300">', 'className="flex-1 flex flex-col bg-[#0b141a] text-slate-300 pt-16 md:pt-0">')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Added padding")
