import fetch from "node-fetch";

async function run() {
  const url = "http://54.80.222.239:8080/docs-json";
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(Object.keys(data.paths).filter(p => p.includes("message")));
  } catch (e) { console.log(e); }
}
run();
