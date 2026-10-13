async function main() {
  const url = 'https://whatsapp-ventas-mvp.vercel.app/api/sql?q=' + encodeURIComponent("SELECT * FROM messages WHERE conversation_id = 'whatsapp:+573027961009' ORDER BY created_at ASC");
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
main();
