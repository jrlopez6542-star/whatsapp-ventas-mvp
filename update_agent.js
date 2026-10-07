const fs = require('fs');
let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

const injection = `
  const settings = await getOrgSettings();
  const products = await getProducts(true);

  // Check business hours
  if (settings.businessHoursEnabled === "true" && settings.businessHoursStart && settings.businessHoursEnd) {
    const now = new Date();
    const options = { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false } as const;
    const colTime = now.toLocaleTimeString('en-US', options);
    
    const start = settings.businessHoursStart;
    const end = settings.businessHoursEnd;
    let isOpen = false;
    if (start <= end) {
      isOpen = colTime >= start && colTime <= end;
    } else {
      isOpen = colTime >= start || colTime <= end;
    }

    if (!isOpen) {
      const reply = settings.outOfHoursMessage || "¡Hola! En este momento estamos cerrados. 🌙 Te atenderemos mañana.";
      await appendMessage(conversationKey, "assistant", reply);
      return { reply, mode: "keyword" };
    }
  }
`;

if (!code.includes('businessHoursEnabled === "true"')) {
  code = code.replace(
    'const settings = await getOrgSettings();\n  const products = await getProducts(true);',
    injection
  );
  fs.writeFileSync('lib/agent/sales-agent.ts', code);
  console.log("Updated sales-agent.ts with business hours");
} else {
  console.log("Already updated");
}
