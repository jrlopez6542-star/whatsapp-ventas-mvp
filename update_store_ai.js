const fs = require('fs');
let code = fs.readFileSync('lib/store/index.ts', 'utf8');

// 1. Interface
if (!code.includes('extraPrompt')) {
  code = code.replace(
    'outOfHoursMessage?: string;',
    'outOfHoursMessage?: string;\n  extraPrompt?: string;\n  botObjective?: string;'
  );

  // 2. Default settings
  code = code.replace(
    'outOfHoursMessage: "¡Hola! En este momento nos encontramos cerrados. 🌙 Te atenderemos con gusto en nuestro horario de atención. 🥟",',
    'outOfHoursMessage: "¡Hola! En este momento nos encontramos cerrados. 🌙 Te atenderemos con gusto en nuestro horario de atención. 🥟",\n  extraPrompt: "",\n  botObjective: "Vender la mayor cantidad de cajas de buñuelos posibles y recolectar dirección y método de pago.",'
  );

  // 3. Database hydration
  code = code.replace(
    'if (k === "outOfHoursMessage") settings.outOfHoursMessage = v;',
    'if (k === "outOfHoursMessage") settings.outOfHoursMessage = v;\n        if (k === "extraPrompt") settings.extraPrompt = v;\n        if (k === "botObjective") settings.botObjective = v;'
  );

  fs.writeFileSync('lib/store/index.ts', code);
  console.log('Updated lib/store/index.ts');
}
