import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Completely replace toggleMobileMode with inline arrow function
search = 'onClick={toggleMobileMode}'
replace = '''onClick={() => setIsMobileMode(prev => {
          const next = !prev;
          if (typeof window !== "undefined") localStorage.setItem("crm_mobile_mode", String(next));
          return next;
        })}'''

code = code.replace(search, replace)

# And remove any floating toggleMobileMode definitions if they exist
code = re.sub(r'const toggleMobileMode = \(\) => \{[\s\S]*?\};\s*', '', code)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed")
