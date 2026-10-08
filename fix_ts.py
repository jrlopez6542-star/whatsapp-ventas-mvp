import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = re.sub(
    r'useState<"whatsapp_qr"\s*\|\s*"chats"\s*\|\s*"orders"\s*\|\s*"catalog"\s*\|\s*"settings"\s*\|\s*"hours">',
    'useState<"whatsapp_qr" | "chats" | "orders" | "catalog" | "settings" | "hours" | "real_orders">',
    code
)

# And also replace in case it's different
code = re.sub(
    r'useState<"whatsapp_qr"\s*\|\s*"chats"\s*\|\s*"orders"\s*\|\s*"catalog"\s*\|\s*"settings">',
    'useState<"whatsapp_qr" | "chats" | "orders" | "catalog" | "settings" | "hours" | "real_orders">',
    code
)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
