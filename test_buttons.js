require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

async function testButtons() {
  const base = process.env.EVOLUTION_API_URL.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  // I will just read the owner number to test
  const number = process.env.EVOLUTION_OWNER_NUMBER || "573138865486";
  
  const url = `${base}/message/sendButtons/${instance}`;
  console.log("POST", url);
  
  // Format 1
  const payload1 = {
    number: number,
    buttonMessage: {
      text: "Prueba 1 (buttonMessage)",
      buttons: [
        { type: "reply", reply: { id: "1", title: "Test" } }
      ]
    }
  };
  
  const res1 = await fetch(url, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload1)
  });
  console.log("Format 1:", res1.status, await res1.text());

  // Format 2
  const payload2 = {
    number: number,
    text: "Prueba 2 (flat)",
    buttons: [
      { type: "reply", reply: { id: "1", title: "Test" } }
    ]
  };
  
  const res2 = await fetch(url, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload2)
  });
  console.log("Format 2:", res2.status, await res2.text());
}
testButtons();
