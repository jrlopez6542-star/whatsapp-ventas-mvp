const fs = require('fs');

async function testGemini() {
  const res = await fetch('https://whatsapp-ventas-mvp.vercel.app/api/gemini-check');
  const data = await res.json();
  console.log('Gemini check:', JSON.stringify(data, null, 2));
}

testGemini();
