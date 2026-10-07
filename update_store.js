const fs = require('fs');
let code = fs.readFileSync('lib/store/index.ts', 'utf8');

if (!code.includes('businessHoursEnabled')) {
  code = code.replace(
    'welcomeMessage: string;',
    'welcomeMessage: string;\n  businessHoursEnabled?: string;\n  businessHoursStart?: string;\n  businessHoursEnd?: string;\n  outOfHoursMessage?: string;'
  );
  code = code.replace(
    'tone: "amable, alegre, antojador y vendedor",',
    'tone: "amable, alegre, antojador y vendedor",\n  businessHoursEnabled: "false",\n  businessHoursStart: "08:00",\n  businessHoursEnd: "20:00",\n  outOfHoursMessage: "¡Hola! En este momento nos encontramos cerrados. 🌙 Te atenderemos con gusto en nuestro horario de atención. 🥟",'
  );
  code = code.replace(
    'if (k === "rules") settings.rules = v;',
    'if (k === "rules") settings.rules = v;\n        if (k === "businessHoursEnabled") settings.businessHoursEnabled = v;\n        if (k === "businessHoursStart") settings.businessHoursStart = v;\n        if (k === "businessHoursEnd") settings.businessHoursEnd = v;\n        if (k === "outOfHoursMessage") settings.outOfHoursMessage = v;'
  );
  fs.writeFileSync('lib/store/index.ts', code);
  console.log('Updated lib/store/index.ts');
} else {
  console.log('Already updated');
}
