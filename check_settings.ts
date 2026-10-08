import fetch from "node-fetch";

async function run() {
  const res = await fetch("http://54.80.222.239:8080/settings/set/bot_whatsapp_mvp", {
    method: "POST",
    headers: { 
      "apikey": "99f58f55d074936b92aab5903ba5e0e7cb5e8c92001a4648e0211efccb31c20a",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      rejectCall: false,
      msgCall: "",
      groupsIgnore: false,
      alwaysOnline: true,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false
    })
  });
  console.log(await res.text());
}
run();
