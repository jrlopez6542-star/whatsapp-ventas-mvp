async function main() {
  const url = 'https://whatsapp-ventas-mvp.vercel.app/api/sql?q=' + encodeURIComponent("SELECT sql FROM sqlite_master WHERE name = 'org_settings'");
  const res = await fetch(url);
  const data = await res.json();
  console.log(data);
}
main();
