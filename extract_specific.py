import re
with open('temp_old_page.tsx', 'r', encoding='utf-16') as f:
    code = f.read()

orders_match = re.search(r'\{tab === "orders" && \((.*?)\)\}', code, re.DOTALL)
if orders_match:
    with open('old_orders.txt', 'w', encoding='utf-8') as f:
        f.write(orders_match.group(1))

settings_match = re.search(r'\{tab === "settings" && \((.*?)\)\}', code, re.DOTALL)
if settings_match:
    with open('old_settings.txt', 'w', encoding='utf-8') as f:
        f.write(settings_match.group(1))

print('Saved orders and settings')
