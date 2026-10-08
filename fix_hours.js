const fs = require('fs');
let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

const businessHoursLogic = `
    // --- BUSINESS HOURS CHECK ---
    if (settings.businessHoursEnabled === "true") {
      const start = settings.businessHoursStart || "08:00";
      const end = settings.businessHoursEnd || "20:00";
      
      const now = new Date();
      const coTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
      const hours = coTime.getHours();
      const minutes = coTime.getMinutes();
      const currentTimeStr = \`\${hours.toString().padStart(2, "0")}:\${minutes.toString().padStart(2, "0")}\`;

      if (currentTimeStr < start || currentTimeStr > end) {
        const reply = settings.outOfHoursMessage || "¡Hola! En este momento nos encontramos cerrados. Te atenderemos con gusto en nuestro horario de atención.";
        await appendMessage(conversationKey, "assistant", reply);
        return { reply, mode: "keyword" };
      }
    }
    // ----------------------------
`;

if (!code.includes("BUSINESS HOURS CHECK")) {
  code = code.replace(
    'const products = await getProducts(true);',
    'const products = await getProducts(true);\n' + businessHoursLogic
  );
  fs.writeFileSync('lib/agent/sales-agent.ts', code);
  console.log("Fixed business hours!");
}
