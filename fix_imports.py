import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Fix the broken import
code = re.sub(
    r'import \{ DashboardView \}[\s\r\n]*import \{ SettingsView \} from "\./SettingsView";[\s\r\n]*import \{ OrdersView \} from "\./OrdersView"; from "\./DashboardView";',
    'import { DashboardView } from "./DashboardView";\nimport { SettingsView } from "./SettingsView";\nimport { OrdersView } from "./OrdersView";',
    code
)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

with open('lib/evolution.ts', 'r', encoding='utf-8') as f:
    ev = f.read()

print("sendEvolutionButtons in evolution:", "sendEvolutionButtons" in ev)
print("sendEvolutionPoll in evolution:", "sendEvolutionPoll" in ev)
