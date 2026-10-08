import fetch from "node-fetch";

async function run() {
  const url = "http://54.80.222.239:8080/message/sendText/bot_whatsapp_mvp";
  const body = {
    number: "573105550192",
    text: "Hola este es un texto con botones",
    options: {
      delay: 0,
      presence: "composing"
    },
    buttonsMessage: {
      buttons: [
        {
          buttonId: "btn1",
          buttonText: { displayText: "Opción 1" },
          type: 1
        }
      ]
    }
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
