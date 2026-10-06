const fs = require('fs');
let c = fs.readFileSync('app/api/webhooks/evolution/route.ts', 'utf8');

c = c.replace(
  'import { markEvolutionMessageAsRead, after, NextRequest, NextResponse } from "next/server";',
  'import { after, NextRequest, NextResponse } from "next/server";\nimport { markEvolutionMessageAsRead } from "@/lib/evolution";'
);

fs.writeFileSync('app/api/webhooks/evolution/route.ts', c);
