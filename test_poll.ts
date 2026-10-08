import fetch from "node-fetch";

async function run() {
  const url = "http://54.80.222.239:8080/message/sendPoll/bot_whatsapp_mvp";
  const body = {
    number: "573105550192",
    name: "¿Qué deseas hacer?",
    selectableCount: 1,
    values: [
      "Ver Catálogo",
      "Hablar con Asesor"
    ]
  };
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": "99f58f55d074936b92aab5903ba5e0e7cb5e8c92001a4648e0211efccb31c20a",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  console.log(res.status, await res.text());
}
run();
