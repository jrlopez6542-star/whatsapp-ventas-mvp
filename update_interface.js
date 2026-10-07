const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

code = code.replace(
  /interface OrgSettings\s*\{\s*name: string;\s*tone: string;\s*welcomeMessage: string;\s*rules: string;\s*\}/,
  'interface OrgSettings {\n  name: string;\n  tone: string;\n  welcomeMessage: string;\n  rules: string;\n  businessHoursEnabled?: string;\n  businessHoursStart?: string;\n  businessHoursEnd?: string;\n  outOfHoursMessage?: string;\n}'
);

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Updated app/panel/page.tsx interface properly");
