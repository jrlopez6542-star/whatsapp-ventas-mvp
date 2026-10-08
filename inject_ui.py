import sys

with open("app/panel/page.tsx", "r", encoding="utf-8") as f:
    page_content = f.read()

with open("new_ui_template.txt", "r", encoding="utf-8") as f:
    template_content = f.read()

# Find the exact insertion point
search_str = '  return (\n    \n    <div className="crm-layout">'
idx = page_content.rfind(search_str)

if idx == -1:
    search_str2 = '  return (\n    <div className="crm-layout">'
    idx = page_content.rfind(search_str2)

if idx == -1:
    print("Insertion point not found")
    sys.exit(1)

# we just keep the top part
new_content = page_content[:idx] + template_content

with open("app/panel/page.tsx", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Done injecting")
