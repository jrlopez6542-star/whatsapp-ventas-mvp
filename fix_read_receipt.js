const fs = require('fs');

// 1. Modify lib/outbound-queue.ts
let qCode = fs.readFileSync('lib/outbound-queue.ts', 'utf8');

if (!qCode.includes("markEvolutionMessageAsRead")) {
  qCode = qCode.replace(
    'import {',
    'import { markEvolutionMessageAsRead } from "@/lib/evolution";\nimport {'
  );
  
  qCode = qCode.replace(
    'export async function sendDelayedOutboundWhatsApp(\n  conversationKey: string,\n  to: string,\n  body: string',
    'export async function sendDelayedOutboundWhatsApp(\n  conversationKey: string,\n  to: string,\n  body: string,\n  messageIdToMarkRead?: string'
  );
  
  qCode = qCode.replace(
    'await sleep(delayMs);\n        const result = await sendOutboundWhatsApp(to, body);',
    'await sleep(delayMs);\n        if (messageIdToMarkRead) {\n          await markEvolutionMessageAsRead(to, messageIdToMarkRead);\n        }\n        const result = await sendOutboundWhatsApp(to, body);'
  );
  fs.writeFileSync('lib/outbound-queue.ts', qCode);
}

// 2. Modify app/api/webhooks/evolution/route.ts
let wCode = fs.readFileSync('app/api/webhooks/evolution/route.ts', 'utf8');
wCode = wCode.replace(
  'await markEvolutionMessageAsRead(parsed.replyJid, parsed.messageId);\n        const send = await sendDelayedOutboundWhatsApp(fromKey, replyTo, reply);',
  '// mark as read is now handled after the delay inside sendDelayedOutboundWhatsApp\n        const send = await sendDelayedOutboundWhatsApp(fromKey, replyTo, reply, parsed.messageId);'
);
fs.writeFileSync('app/api/webhooks/evolution/route.ts', wCode);

console.log("Fixed read receipts delay!");
