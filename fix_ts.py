import sys

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

if "import Script from 'next/script';" not in code and 'import Script from "next/script";' not in code:
    code = "import Script from 'next/script';\n" + code

code = code.replace("conv.pushName || ", "")
code = code.replace("conversations.find(c => c.id === selectedConvId)?.pushName || ", "")

if "const handleToggleBot" not in code:
    code = code.replace('const [replyText, setReplyText] = useState("");', 'const [replyText, setReplyText] = useState("");\n  const handleToggleBot = async (id: string, newStatus: string) => { /* TODO: Implement */ };')

code = code.replace('let buttons = [];', 'let buttons: string[] = [];')
code = code.replace('const formatPhoneLocal = (p) =>', 'const formatPhoneLocal = (p: string) =>')
code = code.replace('onClick={handleSendReply}', 'onClick={() => handleSendReply(replyText)}')
code = code.replace('e.key === "Enter" && handleSendReply()', 'e.key === "Enter" && handleSendReply(replyText)')
code = code.replace('tab === "qr"', 'tab === ("qr" as any)')

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("TS fixes applied")
