const fs = require('fs');

let code = fs.readFileSync('lib/evolution.ts', 'utf8');

const search = /const url = \`\$\{base\}\/message\/sendButtons\/\$\{encodeURIComponent\(instance\)\}\`;[\s\S]*?body: JSON\.stringify\(\{[\s\S]*?\}\)\n\s*\}\);/;

const replace = `const url = \`\$\{base\}/message/sendInteractive/\$\{encodeURIComponent(instance)}\`;
    
    const formattedButtons = options.map((opt, i) => ({
      type: "reply",
      reply: {
        id: \`btn_\$\{i\}\`,
        title: opt
      }
    }));

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "apikey": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          number: resolved.number,
          options: { delay: 1000 },
          interactiveMessage: {
            body: { text: text },
            type: "button",
            action: {
              buttons: formattedButtons
            }
          }
        })
      });`;

code = code.replace(search, replace);

fs.writeFileSync('lib/evolution.ts', code);
console.log("Updated evolution.ts to use sendInteractive");
