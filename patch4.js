const fs = require('fs');
let c = fs.readFileSync('app/api/webhooks/evolution/route.ts', 'utf8');

c = c.replace(
  'import {\n  isEvolutionConfigured,\n  parseEvolutionUpsert,\n  replyTargetFromParsed,\n} from "@/lib/evolution";',
  'import {\n  isEvolutionConfigured,\n  parseEvolutionUpsert,\n  replyTargetFromParsed,\n  markEvolutionMessageAsRead,\n} from "@/lib/evolution";'
);

// If the first import replace failed due to formatting, just append it to the file top:
if (!c.includes('markEvolutionMessageAsRead')) {
  c = c.replace('import {', 'import { markEvolutionMessageAsRead,');
}

c = c.replace(
  'const send = await sendDelayedOutboundWhatsApp(fromKey, replyTo, reply);',
  'await markEvolutionMessageAsRead(parsed.replyJid, parsed.messageId);\n        const send = await sendDelayedOutboundWhatsApp(fromKey, replyTo, reply);'
);

fs.writeFileSync('app/api/webhooks/evolution/route.ts', c);
