import os
import re

with open('lib/agent/sales-agent.ts', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Fix the join
code = code.replace('const allChatText = [...previous.map((m) => m.content), text].join(" ");', 'const allChatText = [...previous.map((m) => m.content), text].join("\\n");')

# 2. Fix the regex. 
# The old regex ended with: \b[^:\n,.]*[:\s]+([^.\n,]+(?:\s+[^.\n,]+)*)/i
# We want it to end with: \b[^:\n,.]*[:\s]+([^.\n,]+)/i

old_regex = r"\b[^:\n,.]*[:\s]+([^.\n,]+(?:\s+[^.\n,]+)*)/i"
new_regex = r"\b[^:\n,.]*[:\s]+([^.\n,]+)/i"

code = code.replace(old_regex, new_regex)

with open('lib/agent/sales-agent.ts', 'w', encoding='utf-8') as f:
    f.write(code)
